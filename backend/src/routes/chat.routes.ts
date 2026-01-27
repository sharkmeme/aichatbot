import { Router, Request, Response, NextFunction } from 'express';
import { validateChatRequest, sanitizeInput } from '../middleware/validation';
import { sessionRateLimiter } from '../middleware/rateLimiter';
import { DatabaseService } from '../services/database.service';
import { OpenAIService } from '../services/openai.service';
import { ChatRequest, ChatResponse, Lead, Message, ConversationState } from '../types';
import { getAllValidPrices } from '../data/pricing';

const router = Router();
const dbService = new DatabaseService();
const openaiService = new OpenAIService();

/**
 * Get current conversation state from last bot message
 */
function getCurrentState(recentMessages: Message[]): ConversationState {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata?.state) {
      console.log('[State] Found state from last bot message:', JSON.stringify(msg.metadata.state));
      return msg.metadata.state;
    }
  }
  // Default state
  return { stage: 'info', topic: null };
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract email from message
 */
function extractEmail(message: string): string | null {
  const emailRegex = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
  const match = message.match(emailRegex);
  return match ? match[0] : null;
}

/**
 * Detect contact method selection
 */
function detectContactMethod(message: string): string | null {
  const normalized = message.toLowerCase().trim();
  if (/\b(telegram|tg)\b/i.test(normalized)) return 'telegram';
  if (/\bwhatsapp\b/i.test(normalized)) return 'whatsapp';
  if (/\b(meeting|zoom|calendar|schedule)\b/i.test(normalized)) return 'meeting';
  if (/\b(form|email|contact.?form)\b/i.test(normalized)) return 'contact_form';
  if (/\b(call|phone)\b/i.test(normalized)) return 'call';
  return null;
}

/**
 * Filter false registration claims from bot replies
 */
function filterRegistrationClaims(reply: string): string {
  let filtered = reply;
  const patterns = [
    { pattern: /I'?ll get you (all )?set up/gi, replacement: 'Next step: choose how to connect' },
    { pattern: /registration (is )?complete/gi, replacement: 'Info collected' },
    { pattern: /you'?re (all )?set/gi, replacement: 'Ready to connect' },
    { pattern: /subscription activated/gi, replacement: 'Next: choose a contact method' },
    { pattern: /I'?ve (set you up|registered you|activated your)/gi, replacement: 'Info saved' }
  ];

  for (const { pattern, replacement } of patterns) {
    if (pattern.test(filtered)) {
      console.log('[Filter] 🚫 Blocked registration claim:', pattern);
      filtered = filtered.replace(pattern, replacement);
    }
  }

  return filtered;
}

/**
 * Detect stage from reply content (server-side enforcement)
 */
function detectStageFromReply(reply: string, currentState: ConversationState): ConversationState {
  // If reply contains all 5 contact button tokens → force choose_contact stage
  const hasAllButtons =
    reply.includes('{{BTN_MEETING}}') &&
    reply.includes('{{BTN_WHATSAPP}}') &&
    reply.includes('{{BTN_TELEGRAM}}') &&
    reply.includes('{{BTN_CONTACT_FORM}}') &&
    reply.includes('{{BTN_CALL_US}}');

  if (hasAllButtons) {
    console.log('[Stage Detection] ✅ All 5 contact buttons detected → forcing stage=choose_contact');
    return { stage: 'choose_contact', topic: currentState.topic };
  }

  // If reply asks for name → force collect_name stage
  const namePatterns = [
    /what'?s your name/i,
    /may I (have|get|ask for) your name/i,
    /could I get your name/i,
    /please (share|provide|tell me) your name/i,
    /I('ll)? need your name/i
  ];

  if (namePatterns.some(pattern => pattern.test(reply))) {
    console.log('[Stage Detection] ✅ Name request detected → forcing stage=collect_name');
    return { stage: 'collect_name', topic: currentState.topic };
  }

  // If reply asks for email → force collect_email stage
  const emailPatterns = [
    /what'?s your email/i,
    /may I (have|get|ask for) your email/i,
    /could I get your email/i,
    /please (share|provide|tell me) your email/i,
    /I('ll)? need your email/i
  ];

  if (emailPatterns.some(pattern => pattern.test(reply))) {
    console.log('[Stage Detection] ✅ Email request detected → forcing stage=collect_email');
    return { stage: 'collect_email', topic: currentState.topic };
  }

  // No stage change detected, return current state
  return currentState;
}

/**
 * Extract name from message (simple heuristic)
 */
function extractName(message: string): string | null {
  const normalized = message.trim();

  // Pattern: "I'm NAME" or "My name is NAME"
  let match = normalized.match(/(?:I'?m|my name is|name is)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i);
  if (match) return match[1];

  // Pattern: Just a name (2-30 chars, starts with capital)
  if (/^[A-Z][a-zA-Z]{1,29}(?:\s+[A-Z][a-zA-Z]{1,29})?$/.test(normalized)) {
    return normalized;
  }

  return null;
}

/**
 * POST /api/chat - Simplified single-controller endpoint
 */
router.post(
  '/chat',
  sessionRateLimiter,
  validateChatRequest,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('[Chat] ========== NEW CHAT REQUEST ==========');
      const { sessionId, message }: ChatRequest = req.body;

      const sanitizedSessionId = sanitizeInput(sessionId);
      const sanitizedMessage = sanitizeInput(message);

      // 1. Find or create conversation
      const conversation = await dbService.findOrCreateConversation(sanitizedSessionId);

      // 2. Get existing lead
      const existingLead = await dbService.getLeadByConversationId(conversation.id);

      // 3. Insert user message
      await dbService.insertMessage(conversation.id, 'user', sanitizedMessage);

      // 4. Get recent messages for context
      const recentMessages = await dbService.getRecentMessages(conversation.id);

      // 5. Get current conversation state
      const currentState = getCurrentState(recentMessages);
      console.log('[State] Current stage:', currentState.stage, 'Topic:', JSON.stringify(currentState.topic));

      let reply: string = "I'm having trouble processing that. Could you rephrase?";
      let updatedLead: Lead | null = null;
      let newState: ConversationState = currentState;

      // 6. SERVER-SIDE VALIDATION (stage-specific)

      // If in collect_name stage and user provides name
      if (currentState.stage === 'collect_name') {
        const name = extractName(sanitizedMessage);
        if (name) {
          console.log('[Validation] ✅ Valid name extracted:', name);
          // Save name
          const lead: Lead = { name, interest_area: currentState.topic?.package || currentState.topic?.division };
          updatedLead = await dbService.upsertLead(conversation.id, sanitizedSessionId, lead);

          // Move to collect_email stage
          newState = { stage: 'collect_email', topic: currentState.topic };
          reply = `Nice to meet you, ${name}! What's your email address?`;
        }
      }

      // If in collect_email stage and user provides email
      else if (currentState.stage === 'collect_email') {
        const email = extractEmail(sanitizedMessage);
        if (email && isValidEmail(email)) {
          console.log('[Validation] ✅ Valid email extracted:', email);
          // Save email
          const lead: Lead = { email, interest_area: currentState.topic?.package || currentState.topic?.division };
          updatedLead = await dbService.upsertLead(conversation.id, sanitizedSessionId, lead);

          // Move to choose_contact stage
          newState = { stage: 'choose_contact', topic: currentState.topic };
          reply = "Perfect! How would you like to connect?\n\n{{BTN_MEETING}}\n{{BTN_WHATSAPP}}\n{{BTN_TELEGRAM}}\n{{BTN_CONTACT_FORM}}\n{{BTN_CALL_US}}";
        }
      }

      // If in choose_contact stage and user selects contact method
      else if (currentState.stage === 'choose_contact') {
        const contactMethod = detectContactMethod(sanitizedMessage);
        if (contactMethod) {
          console.log('[Validation] ✅ Contact method selected:', contactMethod);

          const buttonMap: Record<string, string> = {
            'telegram': '{{BTN_TELEGRAM}}',
            'whatsapp': '{{BTN_WHATSAPP}}',
            'meeting': '{{BTN_MEETING}}',
            'contact_form': '{{BTN_CONTACT_FORM}}',
            'call': '{{BTN_CALL_US}}'
          };

          const buttonToken = buttonMap[contactMethod];
          if (buttonToken) {
            const contactName = contactMethod.charAt(0).toUpperCase() + contactMethod.slice(1).replace('_', ' ');
            reply = `Tap the ${contactName} button below.\n\n${buttonToken}`;
          }

          // Save contact preference
          const lead: Lead = { preferred_contact_channel: contactMethod };
          updatedLead = await dbService.upsertLead(conversation.id, sanitizedSessionId, lead);

          // Stay in choose_contact stage
          newState = currentState;
        }
        // If user asks a normal question in choose_contact stage, use LLM but keep stage
        // (don't re-show buttons unless they ask to proceed or type a contact method)
      }

      // If not handled by validation, use LLM
      if (currentState.stage === 'collect_name' && !reply.includes('Nice to meet you') ||
          currentState.stage === 'collect_email' && !reply.includes('Perfect!') ||
          currentState.stage === 'choose_contact' && !reply.includes('Tap the') ||
          currentState.stage === 'info') {

        console.log('[Chat] → Using LLM with tools');

        const llmResponse = await openaiService.generateChatCompletionWithTools(
          recentMessages,
          sanitizedMessage,
          existingLead || undefined,
          {
            topic: currentState.topic || undefined,
            pendingLeadField: null,
            pendingQuestion: null,
            lastIntent: null,
            requestedPackages: null,
            comparisonContext: null
          }
        );

        reply = llmResponse.reply;

        // Filter false registration claims
        reply = filterRegistrationClaims(reply);

        // Extract state from set_state tool call (if any)
        if (llmResponse.stateUpdate) {
          if (llmResponse.stateUpdate.stage) {
            newState = {
              stage: llmResponse.stateUpdate.stage,
              topic: llmResponse.stateUpdate.topic || currentState.topic
            };
            console.log('[State] LLM updated state via set_state tool:', JSON.stringify(newState));
          }
        }

        // SERVER-SIDE STAGE DETECTION (enforce based on reply content)
        const detectedState = detectStageFromReply(reply, newState);
        if (detectedState.stage !== newState.stage) {
          console.log('[Stage Detection] Server forcing stage transition:', newState.stage, '→', detectedState.stage);
          newState = detectedState;
        }

        // If in choose_contact and answering a normal question (no buttons), keep stage
        if (currentState.stage === 'choose_contact' && newState.stage === 'info') {
          console.log('[Stage Detection] Keeping choose_contact stage for normal question');
          newState = { stage: 'choose_contact', topic: currentState.topic };
        }

        // Price validation guard
        const pricePattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
        const mentionedPrices: number[] = [];
        let match;
        while ((match = pricePattern.exec(reply)) !== null) {
          const priceStr = match[1].replace(/,/g, '');
          mentionedPrices.push(parseInt(priceStr, 10));
        }

        const validPrices = llmResponse.toolContext?.allowed_prices.length
          ? llmResponse.toolContext.allowed_prices
          : getAllValidPrices();

        if (mentionedPrices.length > 0 && validPrices.length > 0) {
          const hallucinatedPrices = mentionedPrices.filter(p => !validPrices.includes(p));
          if (hallucinatedPrices.length > 0) {
            console.error('[Guard] ⚠️ Price hallucination detected! Mentioned:', mentionedPrices, 'Allowed:', validPrices);
            reply = "I can share exact pricing. Which service interests you?";
          }
        }
      }

      // 7. Save bot message with state
      console.log('[State] Final state being saved:', JSON.stringify(newState));
      const metadata = { state: newState, lead: updatedLead?.id };
      await dbService.insertMessage(conversation.id, 'bot', reply, metadata);

      // 8. Return response
      const response: ChatResponse = {
        reply,
        lead: updatedLead || existingLead
      };

      res.json(response);
    } catch (error) {
      console.error('[Chat] Error:', error);
      next(error);
    }
  }
);

export default router;
