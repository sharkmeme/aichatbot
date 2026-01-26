import { Router, Request, Response, NextFunction } from 'express';
import { validateChatRequest, sanitizeInput } from '../middleware/validation';
import { sessionRateLimiter } from '../middleware/rateLimiter';
import { DatabaseService } from '../services/database.service';
import { OpenAIService } from '../services/openai.service';
import { IntentService, ConversationTopic } from '../services/intent.service';
import { PricingResponderService } from '../services/pricing-responder.service';
import { ChatRequest, ChatResponse, Lead } from '../types';
import { getAllValidPrices, PRICING_DATA } from '../data/pricing';

const router = Router();
const dbService = new DatabaseService();
const openaiService = new OpenAIService();
const intentService = new IntentService();
const pricingResponder = new PricingResponderService();

/**
 * Get valid prices scoped to a specific topic (division or package)
 * Used for topic-scoped price hallucination guard
 */
function getTopicScopedPrices(topic: ConversationTopic): number[] {
  const prices: number[] = [];

  if (topic.package && topic.division) {
    // Specific package - only allow that package's prices
    const division = PRICING_DATA[topic.division];
    if (division) {
      const pkg = division.packages.find(p => p.id === topic.package);
      if (pkg && typeof pkg.price === 'number') {
        prices.push(pkg.price);
        // Add optional support price if exists
        if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
          prices.push(pkg.optional_support.price);
        }
      }
    }
  } else if (topic.division) {
    // Division only - allow all prices in that division
    const division = PRICING_DATA[topic.division];
    if (division) {
      division.packages.forEach(pkg => {
        if (typeof pkg.price === 'number') {
          prices.push(pkg.price);
        }
        if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
          prices.push(pkg.optional_support.price);
        }
      });
    }
  }

  return prices;
}

/**
 * Detect if user is selecting a contact method
 */
function detectContactMethodSelection(message: string): string | null {
  const normalized = message.toLowerCase().trim();

  // Exact matches (high confidence)
  if (/^(telegram|whatsapp|meeting|contact form|call|phone)$/i.test(normalized)) {
    return normalized;
  }

  // Pattern matches
  if (/\b(telegram|tg)\b/i.test(normalized)) return 'telegram';
  if (/\bwhatsapp\b/i.test(normalized)) return 'whatsapp';
  if (/\b(meeting|zoom|calendar|schedule)\b/i.test(normalized)) return 'meeting';
  if (/\b(form|email|contact form)\b/i.test(normalized)) return 'contact_form';
  if (/\b(call|phone)\b/i.test(normalized)) return 'call';

  return null;
}

/**
 * Generate or enhance lead data from topic and existing lead
 * Also auto-sets budget_range for fixed-price packages
 */
function enhanceLeadFromTopic(
  lead: Lead | null,
  topic: { division?: string; package?: string },
  existingLead: Lead | null
): Lead {
  const enhanced: Lead = {
    name: lead?.name || existingLead?.name,
    email: lead?.email || existingLead?.email,
    phone: lead?.phone || existingLead?.phone,
    business_type: lead?.business_type || existingLead?.business_type,
    company_name: lead?.company_name || existingLead?.company_name,
    interest_area: lead?.interest_area || existingLead?.interest_area,
    budget_range: lead?.budget_range || existingLead?.budget_range,
    preferred_contact_channel: lead?.preferred_contact_channel || existingLead?.preferred_contact_channel,
    notes: lead?.notes || existingLead?.notes
  };

  // Auto-set interest_area from topic if not already set
  if (!enhanced.interest_area && (topic.package || topic.division)) {
    if (topic.package) {
      enhanced.interest_area = topic.package;
    } else if (topic.division) {
      enhanced.interest_area = topic.division;
    }
  }

  // Auto-set budget_range for fixed-price packages
  if (!enhanced.budget_range && topic.package && topic.division) {
    const division = PRICING_DATA[topic.division];
    if (division) {
      const pkg = division.packages.find(p => p.id === topic.package);
      if (pkg && typeof pkg.price === 'number') {
        // For VIP packages and one-time offers, use exact price
        if (pkg.price < 200 || pkg.recurring === 'one-time') {
          const priceStr = pkg.recurring === 'monthly'
            ? `$${pkg.price}/month`
            : `$${pkg.price} (one-time)`;
          enhanced.budget_range = priceStr;
        } else {
          // For larger packages, use range
          if (pkg.price < 1000) {
            enhanced.budget_range = '$500-1K';
          } else if (pkg.price < 2000) {
            enhanced.budget_range = '$1K-2K';
          } else if (pkg.price < 4000) {
            enhanced.budget_range = '$2K-5K';
          } else {
            enhanced.budget_range = '$5K+';
          }
        }
      }
    }
  }

  return enhanced;
}

/**
 * POST /api/chat
 * Main chat endpoint
 */
router.post(
  '/chat',
  sessionRateLimiter,
  validateChatRequest,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('[Chat] ========== NEW CHAT REQUEST ==========');
      const { sessionId, message }: ChatRequest = req.body;
      console.log('[Chat] SessionId:', sessionId);
      console.log('[Chat] Message:', message);

      // Sanitize inputs
      const sanitizedSessionId = sanitizeInput(sessionId);
      const sanitizedMessage = sanitizeInput(message);

      // Find or create conversation
      console.log('[Chat] Step 1: Find or create conversation...');
      const conversation = await dbService.findOrCreateConversation(sanitizedSessionId);
      console.log('[Chat] Conversation ID:', conversation.id);

      // Look up existing lead data for this conversation
      console.log('[Chat] Step 1.5: Look up existing lead...');
      const existingLead = await dbService.getLeadByConversationId(conversation.id);
      if (existingLead) {
        console.log('[Chat] Found existing lead - name:', existingLead.name, 'email:', existingLead.email);
      }

      // Insert user message
      console.log('[Chat] Step 2: Insert user message...');
      await dbService.insertMessage(conversation.id, 'user', sanitizedMessage);
      console.log('[Chat] User message inserted');

      // Get recent messages for context (increased to 100 for better memory)
      console.log('[Chat] Step 3: Get recent messages...');
      const recentMessages = await dbService.getRecentMessages(conversation.id);
      console.log('[Chat] Recent messages count:', recentMessages.length);

      // Detect intent and topic
      console.log('[Chat] Step 4: Detect intent...');
      const intent = intentService.detectIntent(sanitizedMessage);
      const topic = intentService.extractTopic(sanitizedMessage, recentMessages);
      const isMultiplePackages = intentService.detectMultiplePackages(sanitizedMessage);
      console.log('[Chat] Intent:', intent, '| Topic:', JSON.stringify(topic), '| Multiple:', isMultiplePackages);

      let reply: string;
      let lead: Lead | null = null;

      // Check for contact method selection (high priority)
      const selectedContact = detectContactMethodSelection(sanitizedMessage);
      if (selectedContact && existingLead && (existingLead.name || existingLead.email)) {
        // User is selecting how to continue after qualification
        console.log('[Chat] ✓ DETERMINISTIC CONTACT METHOD SELECTION');
        const buttonMap: Record<string, string> = {
          'telegram': '{{BTN_TELEGRAM}}',
          'whatsapp': '{{BTN_WHATSAPP}}',
          'meeting': '{{BTN_MEETING}}',
          'contact_form': '{{BTN_CONTACT_FORM}}',
          'call': '{{BTN_CALL_US}}'
        };
        reply = `Tap ${selectedContact.charAt(0).toUpperCase() + selectedContact.slice(1)} below.\n\n${buttonMap[selectedContact]}`;
        lead = enhanceLeadFromTopic(null, topic, existingLead);
        lead.preferred_contact_channel = selectedContact;
      }
      // Route based on intent
      else if (intent === 'pricing') {
        // Deterministic pricing response (NO LLM)
        console.log('[Chat] ✓ DETERMINISTIC PRICING PATH (no LLM call)');
        const response = pricingResponder.generatePricingResponse(topic);
        reply = response.reply;
        lead = response.lead;
      } else if (intent === 'inclusions') {
        // Deterministic inclusions response (NO LLM)
        console.log('[Chat] ✓ DETERMINISTIC INCLUSIONS PATH (no LLM call)');

        // Handle "and the other?" for packages
        if (isMultiplePackages && topic.package) {
          // Get other packages in same division
          const otherPackages = intentService.getOtherPackages(topic);
          if (otherPackages.length > 0) {
            // Show the first/only other package
            const otherTopic = otherPackages[0];
            const response = pricingResponder.generateInclusionsResponse(otherTopic, false);
            reply = response.reply;
            lead = response.lead;
          } else {
            // Fallback to normal inclusions
            const response = pricingResponder.generateInclusionsResponse(topic, isMultiplePackages);
            reply = response.reply;
            lead = response.lead;
          }
        } else {
          const response = pricingResponder.generateInclusionsResponse(topic, isMultiplePackages);
          reply = response.reply;
          lead = response.lead;
        }
      } else if (intent === 'budget_confirmation') {
        // Budget confirmation - acknowledge and move forward
        console.log('[Chat] ✓ DETERMINISTIC BUDGET CONFIRMATION (no LLM call)');
        reply = "Perfect! Let's move forward. What's your name?";
        lead = {
          name: undefined,
          email: undefined,
          phone: undefined,
          business_type: undefined,
          company_name: undefined,
          interest_area: topic.package || topic.division,
          budget_range: undefined, // Will be set from last pricing discussion
          preferred_contact_channel: undefined,
          notes: 'Budget confirmed'
        };
      } else if (intent === 'definition') {
        // Definition query - explain what X is
        console.log('[Chat] ✓ DETERMINISTIC DEFINITION PATH (no LLM call)');
        const response = pricingResponder.generateDefinitionResponse(topic);
        reply = response.reply;
        lead = response.lead;
      } else if (intent === 'billing_cadence') {
        // Billing cadence question - one-time vs monthly
        console.log('[Chat] ✓ DETERMINISTIC BILLING CADENCE PATH (no LLM call)');
        const response = pricingResponder.generateBillingCadenceResponse(topic);
        reply = response.reply;
        lead = response.lead;
      } else {
        // CRM Disambiguation: if topic is identified but intent is general, ask clarifying question
        if (topic.package && !hasPricingIntent(sanitizedMessage)) {
          console.log('[Chat] ✓ DETERMINISTIC DISAMBIGUATION (topic identified but no pricing intent)');
          const division = topic.division ? PRICING_DATA[topic.division] : null;
          const pkg = division?.packages.find(p => p.id === topic.package);
          if (pkg) {
            reply = `${pkg.name} helps with ${getPackageShortDescription(topic.package)}. Do you want pricing or what's included?`;
            lead = enhanceLeadFromTopic(null, topic, existingLead);
          } else {
            // Fallback to LLM
            reply = await handleLLMPath();
          }
        } else {
          // General query - use LLM with knowledge base
          reply = await handleLLMPath();
        }
      }

      async function handleLLMPath(): Promise<string> {
        console.log('[Chat] → LLM PATH (general query)');
        const llmResponse = await openaiService.generateChatCompletion(
          recentMessages,
          sanitizedMessage,
          existingLead,
          topic // Pass topic for context
        );
        let llmReply = llmResponse.reply;
        lead = llmResponse.lead;

        // Topic-scoped price hallucination guard
        const pricePattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
        const mentionedPrices: number[] = [];
        let match;

        while ((match = pricePattern.exec(llmReply)) !== null) {
          const priceStr = match[1].replace(/,/g, '');
          const price = parseInt(priceStr, 10);
          mentionedPrices.push(price);
        }

        // If LLM mentioned prices, validate against topic-scoped prices
        if (mentionedPrices.length > 0) {
          let validPrices: number[];

          if (topic.package || topic.division) {
            // Use topic-scoped validation
            validPrices = getTopicScopedPrices(topic);
            console.log('[Chat] Topic-scoped price validation:', validPrices);
          } else {
            // No topic identified, use global validation
            validPrices = getAllValidPrices();
            console.log('[Chat] Global price validation (no topic)');
          }

          // Check if LLM hallucinated prices
          const hallucinatedPrices = mentionedPrices.filter(p => !validPrices.includes(p));
          if (hallucinatedPrices.length > 0) {
            console.error('[Chat] ⚠️  PRICE HALLUCINATION DETECTED! Invalid prices:', hallucinatedPrices);
            console.error('[Chat] ⚠️  Topic:', JSON.stringify(topic));
            console.error('[Chat] ⚠️  Valid prices for topic:', validPrices);

            // Use deterministic pricing response for the resolved topic
            if (topic.package || topic.division) {
              console.error('[Chat] ⚠️  Replacing with deterministic pricing for topic');
              const pricingResponse = pricingResponder.generatePricingResponse(topic);
              llmReply = pricingResponse.reply;
              lead = pricingResponse.lead;
            } else {
              console.error('[Chat] ⚠️  No topic - using safe fallback');
              llmReply = "I can share exact package pricing—which division interests you: Studios / Bunny Code / Honey Software / VIP?";
            }
          }
        }

        // Enhance lead with server-side topic tracking
        lead = enhanceLeadFromTopic(lead, topic, existingLead);

        return llmReply;
      }

      function hasPricingIntent(message: string): boolean {
        return /\b(price|pricing|cost|how much|ow much|much for|\$|rate|fee)\b/i.test(message);
      }

      function getPackageShortDescription(packageId: string): string {
        const descriptions: Record<string, string> = {
          'lead-intake-crm': 'lead intake and CRM automation',
          'ai-outreach': 'AI-powered outreach and follow-up',
          'support-ticket': 'support ticket automation',
          'chat-assistant': 'website chat assistance',
          'phone-support': 'phone support automation',
          'masterminds': 'group coaching and community',
          'fast-track': '1-on-1 coaching and fast-track support',
          'starter': 'monthly video content creation',
          'growth': 'scaled content production',
          'content-engine': 'full content automation',
          'studio-partner': 'comprehensive video partnership'
        };
        return descriptions[packageId] || 'business automation';
      }

      // Ensure lead always has a value (server-side generation)
      if (!lead) {
        console.log('[Chat] Generating lead from topic and existing data');
        lead = enhanceLeadFromTopic(null, topic, existingLead);
      }

      console.log('[Chat] AI response generated');

      // Upsert lead if we extracted lead data (non-blocking)
      let updatedLead = null;
      if (lead && Object.values(lead).some(v => v !== null && v !== undefined && v !== '')) {
        try {
          console.log('[Chat] Step 5: LEAD_JSON extracted with data:', JSON.stringify(lead));
          updatedLead = await dbService.upsertLead(conversation.id, sanitizedSessionId, lead);
          console.log('[Chat] ✅ Lead saved successfully - ID:', updatedLead.id, 'Email:', updatedLead.email || 'none');
        } catch (error) {
          // Log error but don't break the chat
          console.error('[Chat] ❌ Error saving lead (non-blocking):', error);
        }
      } else if (lead) {
        console.log('[Chat] Step 5: LEAD_JSON present but all fields null - skipping save');
      } else {
        console.log('[Chat] Step 5: ⚠️  No LEAD_JSON found in response (model not following instructions!)');
      }

      // Insert bot message with lead metadata
      console.log('[Chat] Step 6: Insert bot message...');
      await dbService.insertMessage(conversation.id, 'bot', reply, {
        lead: updatedLead ? updatedLead.id : null
      });
      console.log('[Chat] Bot message inserted with lead metadata:', updatedLead ? updatedLead.id : 'none');

      // Return response
      const response: ChatResponse = {
        reply,
        lead: updatedLead,
      };

      console.log('[Chat] ========== REQUEST COMPLETE ==========');
      res.json(response);
    } catch (error) {
      console.error('[Chat] ========== REQUEST FAILED ==========');
      console.error('[Chat] Error:', error);
      next(error);
    }
  }
);

export default router;
