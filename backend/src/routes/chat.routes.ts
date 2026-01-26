import { Router, Request, Response, NextFunction } from 'express';
import { validateChatRequest, sanitizeInput } from '../middleware/validation';
import { sessionRateLimiter } from '../middleware/rateLimiter';
import { DatabaseService } from '../services/database.service';
import { OpenAIService } from '../services/openai.service';
import { IntentService } from '../services/intent.service';
import { PricingResponderService } from '../services/pricing-responder.service';
import { ChatRequest, ChatResponse, Lead } from '../types';
import { getAllValidPrices } from '../data/pricing';

const router = Router();
const dbService = new DatabaseService();
const openaiService = new OpenAIService();
const intentService = new IntentService();
const pricingResponder = new PricingResponderService();

/**
 * Generate or enhance lead data from topic and existing lead
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

      // Route based on intent
      if (intent === 'pricing') {
        // Deterministic pricing response (NO LLM)
        console.log('[Chat] ✓ DETERMINISTIC PRICING PATH (no LLM call)');
        const response = pricingResponder.generatePricingResponse(topic);
        reply = response.reply;
        lead = response.lead;
      } else if (intent === 'inclusions') {
        // Deterministic inclusions response (NO LLM)
        console.log('[Chat] ✓ DETERMINISTIC INCLUSIONS PATH (no LLM call)');
        const response = pricingResponder.generateInclusionsResponse(topic, isMultiplePackages);
        reply = response.reply;
        lead = response.lead;
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
      } else {
        // General query - use LLM with knowledge base
        console.log('[Chat] → LLM PATH (general query)');
        const llmResponse = await openaiService.generateChatCompletion(
          recentMessages,
          sanitizedMessage,
          existingLead,
          topic // Pass topic for context
        );
        reply = llmResponse.reply;
        lead = llmResponse.lead;

        // Price hallucination guard
        const validPrices = getAllValidPrices();
        const pricePattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
        const mentionedPrices: number[] = [];
        let match;

        while ((match = pricePattern.exec(reply)) !== null) {
          const priceStr = match[1].replace(/,/g, '');
          const price = parseInt(priceStr, 10);
          mentionedPrices.push(price);
        }

        // Check if LLM hallucinated prices
        const hallucinatedPrices = mentionedPrices.filter(p => !validPrices.includes(p));
        if (hallucinatedPrices.length > 0) {
          console.error('[Chat] ⚠️  PRICE HALLUCINATION DETECTED! Invalid prices:', hallucinatedPrices);
          console.error('[Chat] ⚠️  Blocking response and using safe fallback');
          reply = "I can share exact package pricing—which division interests you: Studios / Bunny Code / Honey Software / VIP?";
          // Keep the lead data from LLM if present
        }

        // Enhance lead with server-side topic tracking
        lead = enhanceLeadFromTopic(lead, topic, existingLead);
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
