import { Router, Request, Response, NextFunction } from 'express';
import { validateChatRequest, sanitizeInput } from '../middleware/validation';
import { sessionRateLimiter } from '../middleware/rateLimiter';
import { DatabaseService } from '../services/database.service';
import { OpenAIService } from '../services/openai.service';
import { IntentService, ConversationTopic, PendingDisambiguation, PendingLeadField, Intent } from '../services/intent.service';
import { PricingResponderService } from '../services/pricing-responder.service';
import { ChatRequest, ChatResponse, Lead, Message } from '../types';
import { getAllValidPrices, PRICING_DATA } from '../data/pricing';

const router = Router();
const dbService = new DatabaseService();
const openaiService = new OpenAIService();
const intentService = new IntentService();
const pricingResponder = new PricingResponderService();

/**
 * Check if there's a pending lead field we're waiting for
 * Returns the pending field name if found
 */
function getPendingLeadField(recentMessages: Message[]): PendingLeadField | null {
  // Check last bot message for pending lead field metadata
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata) {
      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (metadata.pendingLeadField) {
        console.log('[LeadFlow] 🔄 PENDING LEAD FIELD FOUND:', metadata.pendingLeadField);
        return metadata.pendingLeadField as PendingLeadField;
      }
    }
    // Only check last 3 messages (avoid old stale state)
    if (i < recentMessages.length - 3) break;
  }
  return null;
}

/**
 * Check if there's a pending disambiguation question in recent messages
 * Returns the pending state if found
 */
function getPendingDisambiguation(recentMessages: Message[]): PendingDisambiguation | null {
  // Check last bot message for pending disambiguation metadata
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata) {
      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (metadata.pendingDisambiguation) {
        console.log('[Chat] 🔄 PENDING DISAMBIGUATION STATE FOUND:', JSON.stringify(metadata.pendingDisambiguation));
        return {
          topic: metadata.pendingDisambiguation.topic,
          askedAt: new Date(metadata.pendingDisambiguation.askedAt)
        };
      }
    }
    // Only check last few messages (avoid old stale state)
    if (i < recentMessages.length - 6) break;
  }
  return null;
}

/**
 * Get the last intent from recent messages
 */
function getLastIntent(recentMessages: Message[]): Intent | null {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata) {
      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (metadata.intent) {
        return metadata.intent as Intent;
      }
    }
    // Only check last 6 messages
    if (i < recentMessages.length - 6) break;
  }
  return null;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

/**
 * Sanitize name input
 */
function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize budget_range to allowed categories
 * Categories: <$1K, $1-5K, $5-20K, $20K+, not sure
 */
function normalizeBudgetRange(budgetRange: string | undefined, packagePrice?: number): string | undefined {
  if (!budgetRange) return undefined;

  // If it's already a standard category, return it
  const standardCategories = ['<$1K', '$1-5K', '$5-20K', '$20K+', 'not sure'];
  if (standardCategories.includes(budgetRange)) {
    return budgetRange;
  }

  // If we have a specific package price, use it to determine category
  if (packagePrice) {
    if (packagePrice < 1000) {
      return '<$1K';
    } else if (packagePrice < 5000) {
      return '$1-5K';
    } else if (packagePrice < 20000) {
      return '$5-20K';
    } else {
      return '$20K+';
    }
  }

  // Try to parse from string (e.g., "$1,350 (one-time)")
  const priceMatch = /\$(\d{1,3}(?:,\d{3})*)/g.exec(budgetRange);
  if (priceMatch) {
    const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    if (price < 1000) {
      return '<$1K';
    } else if (price < 5000) {
      return '$1-5K';
    } else if (price < 20000) {
      return '$5-20K';
    } else {
      return '$20K+';
    }
  }

  // Default fallback
  return 'not sure';
}

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

  // Auto-set budget_range for fixed-price packages (normalized categories)
  if (!enhanced.budget_range && topic.package && topic.division) {
    const division = PRICING_DATA[topic.division];
    if (division) {
      const pkg = division.packages.find(p => p.id === topic.package);
      if (pkg && typeof pkg.price === 'number') {
        // Normalize to standard budget categories
        enhanced.budget_range = normalizeBudgetRange(undefined, pkg.price);

        // Store exact price in notes for reference
        const priceStr = pkg.recurring === 'monthly'
          ? `$${pkg.price}/month`
          : `$${pkg.price} (one-time)`;
        const priceNote = `Interested in ${pkg.name} - ${priceStr}`;
        enhanced.notes = enhanced.notes ? `${enhanced.notes}; ${priceNote}` : priceNote;
      }
    }
  }

  // Normalize existing budget_range if present
  if (enhanced.budget_range) {
    enhanced.budget_range = normalizeBudgetRange(enhanced.budget_range);
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

      // Check for pending lead field (HIGHEST PRIORITY)
      const pendingLeadField = getPendingLeadField(recentMessages);

      // Check for pending disambiguation state
      const pendingDisambiguation = getPendingDisambiguation(recentMessages);
      const lastIntent = getLastIntent(recentMessages);

      let reply: string;
      let lead: Lead | null = null;
      let metadata: any = {}; // Track metadata
      let intent: Intent | null = null;
      let topic: ConversationTopic = {};

      // PRIORITY 1: Handle pending lead field (bypasses ALL intent/topic logic)
      if (pendingLeadField) {
        console.log('[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE:', pendingLeadField);

        if (pendingLeadField === 'name') {
          // Accept any short text as name
          const name = sanitizeName(sanitizedMessage);
          console.log('[LeadFlow] ✅ pending=name resolved, saved name:', name);

          lead = enhanceLeadFromTopic(null, {}, existingLead);
          lead.name = name;

          // Ask for email next
          reply = "Perfect! What's your email address?";
          metadata.pendingLeadField = 'email';

        } else if (pendingLeadField === 'email') {
          // Validate email
          const email = sanitizedMessage.trim();

          if (isValidEmail(email)) {
            console.log('[LeadFlow] ✅ pending=email resolved, saved email:', email);

            lead = enhanceLeadFromTopic(null, {}, existingLead);
            lead.email = email;

            // Show contact options
            reply = "Great! How would you like to move forward?\n\n{{BTN_MEETING}}\n{{BTN_WHATSAPP}}\n{{BTN_TELEGRAM}}\n{{BTN_CONTACT_FORM}}\n{{BTN_CALL_US}}";
            metadata.pendingLeadField = 'contact_choice';

          } else {
            console.log('[LeadFlow] ❌ Invalid email format:', email);

            // Ask again
            reply = "That doesn't look like a valid email. Please enter your email address (e.g., name@company.com).";
            metadata.pendingLeadField = 'email'; // Keep pending
            lead = enhanceLeadFromTopic(null, {}, existingLead);
          }

        } else if (pendingLeadField === 'budget') {
          // Normalize budget to categories
          const budgetInput = sanitizedMessage.trim();
          const normalizedBudget = normalizeBudgetRange(budgetInput);

          console.log('[LeadFlow] ✅ pending=budget resolved, normalized to:', normalizedBudget);

          lead = enhanceLeadFromTopic(null, {}, existingLead);
          lead.budget_range = normalizedBudget;

          // Add raw budget to notes
          if (budgetInput !== normalizedBudget) {
            const budgetNote = `Budget mentioned: ${budgetInput}`;
            lead.notes = lead.notes ? `${lead.notes}; ${budgetNote}` : budgetNote;
          }

          // Continue to next field (usually name or email)
          if (!existingLead?.name) {
            reply = "Thanks! What's your name?";
            metadata.pendingLeadField = 'name';
          } else if (!existingLead?.email) {
            reply = "Thanks! What's your email address?";
            metadata.pendingLeadField = 'email';
          } else {
            reply = "Great! How would you like to move forward?\n\n{{BTN_MEETING}}\n{{BTN_WHATSAPP}}\n{{BTN_TELEGRAM}}\n{{BTN_CONTACT_FORM}}\n{{BTN_CALL_US}}";
            metadata.pendingLeadField = 'contact_choice';
          }

        } else if (pendingLeadField === 'contact_choice') {
          // Handle contact method selection
          const selectedContact = detectContactMethodSelection(sanitizedMessage);

          if (selectedContact) {
            console.log('[LeadFlow] ✅ pending=contact_choice resolved, selected:', selectedContact);

            const buttonMap: Record<string, string> = {
              'telegram': '{{BTN_TELEGRAM}}',
              'whatsapp': '{{BTN_WHATSAPP}}',
              'meeting': '{{BTN_MEETING}}',
              'contact_form': '{{BTN_CONTACT_FORM}}',
              'call': '{{BTN_CALL_US}}'
            };

            const contactName = selectedContact.charAt(0).toUpperCase() + selectedContact.slice(1).replace('_', ' ');
            reply = `Tap the ${contactName} button below.\n\n${buttonMap[selectedContact]}`;

            lead = enhanceLeadFromTopic(null, {}, existingLead);
            lead.preferred_contact_channel = selectedContact;
            // No more pending field

          } else {
            // User didn't select a valid contact method
            console.log('[LeadFlow] ❌ Invalid contact choice, re-asking');
            reply = "Please choose one: Meeting, WhatsApp, Telegram, Contact Form, or Call Us.";
            metadata.pendingLeadField = 'contact_choice'; // Keep pending
            lead = enhanceLeadFromTopic(null, {}, existingLead);
          }
        }
      }
      // PRIORITY 2+: Normal intent/topic routing
      else {
        // Detect intent and topic
        console.log('[Chat] Step 4: Detect intent...');
        intent = intentService.detectIntent(sanitizedMessage, !!pendingDisambiguation);
        topic = intentService.extractTopic(sanitizedMessage, recentMessages, lastIntent || undefined);
        const isMultiplePackages = intentService.detectMultiplePackages(sanitizedMessage);
        console.log('[Chat] Intent:', intent, '| Topic:', JSON.stringify(topic), '| Multiple:', isMultiplePackages);
        console.log('[Chat] Last Intent:', lastIntent, '| Pending Disambiguation:', !!pendingDisambiguation);

        metadata.intent = intent;

        // Handle disambiguation resolution (highest priority after pending state check)
        if (intent === 'disambiguation_resolution' && pendingDisambiguation) {
          console.log('[Chat] ✓ RESOLVING PENDING DISAMBIGUATION');
          const choice = intentService.detectDisambiguationResolution(sanitizedMessage);
          const disambiguationTopic = pendingDisambiguation.topic;
          console.log('[Chat] 📊 Disambiguation choice:', choice, '| Topic:', JSON.stringify(disambiguationTopic));

          if (choice === 'pricing' || choice === 'both') {
            const response = pricingResponder.generatePricingResponse(disambiguationTopic);
            reply = response.reply;
            lead = response.lead;

            if (choice === 'both') {
              // Also append inclusions
              const inclusionsResponse = pricingResponder.generateInclusionsResponse(disambiguationTopic, false);
              reply += `\n\n**What's included:**\n${inclusionsResponse.reply}`;
            }
          } else if (choice === 'inclusions') {
            const response = pricingResponder.generateInclusionsResponse(disambiguationTopic, false);
            reply = response.reply;
            lead = response.lead;
          } else {
            // Shouldn't happen, but fallback
            reply = "I can share pricing, what's included, or both—which would you like?";
            metadata.pendingDisambiguation = { topic: disambiguationTopic, askedAt: new Date() };
          }
        }
        // Handle buy intent
        if (intent === 'buy') {
          console.log('[Chat] ✓ BUY INTENT DETECTED - Starting lead capture');
          // Start lead qualification flow
          lead = enhanceLeadFromTopic(null, topic, existingLead);

          if (topic.package || topic.division) {
            lead.notes = lead.notes ? `${lead.notes}; Ready to buy` : 'Ready to buy';
          }

          if (existingLead && existingLead.name && existingLead.email) {
            // Already qualified - show contact options
            reply = "Great! How would you like to move forward?\n\n{{BTN_MEETING}}\n{{BTN_WHATSAPP}}\n{{BTN_TELEGRAM}}\n{{BTN_CONTACT_FORM}}\n{{BTN_CALL_US}}";
            metadata.pendingLeadField = 'contact_choice';
          } else if (existingLead && existingLead.name) {
            // Have name, need email
            reply = "Perfect! What's your email address?";
            metadata.pendingLeadField = 'email';
          } else {
            // Start from scratch
            reply = "Excellent! Let's get started. What's your name?";
            metadata.pendingLeadField = 'name';
          }
        }
        // Check for contact method selection
        else if (detectContactMethodSelection(sanitizedMessage) && existingLead && (existingLead.name || existingLead.email)) {
          const selectedContact = detectContactMethodSelection(sanitizedMessage)!;
          console.log('[Chat] ✓ DETERMINISTIC CONTACT METHOD SELECTION');
          const buttonMap: Record<string, string> = {
            'telegram': '{{BTN_TELEGRAM}}',
            'whatsapp': '{{BTN_WHATSAPP}}',
            'meeting': '{{BTN_MEETING}}',
            'contact_form': '{{BTN_CONTACT_FORM}}',
            'call': '{{BTN_CALL_US}}'
          };
          const contactName = selectedContact.charAt(0).toUpperCase() + selectedContact.slice(1).replace('_', ' ');
          reply = `Tap the ${contactName} button below.\n\n${buttonMap[selectedContact]}`;
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
          const isMultiplePackages = intentService.detectMultiplePackages(sanitizedMessage);

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
          metadata.pendingLeadField = 'name';
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
          // BUT: if last intent was pricing and message is "and for X?", prefer pricing (not disambiguation)
          const isAndForPattern = /\b(and|what about) (for |about )/i.test(sanitizedMessage);
          const shouldDisambiguate = topic.package && !hasPricingIntent(sanitizedMessage) &&
                                      !(isAndForPattern && lastIntent === 'pricing');

          if (shouldDisambiguate) {
            console.log('[Chat] ✓ DETERMINISTIC DISAMBIGUATION (topic identified but no pricing intent)');
            const division = topic.division ? PRICING_DATA[topic.division] : null;
            const pkg = division?.packages.find(p => p.id === topic.package);
            if (pkg) {
              reply = `${pkg.name} helps with ${getPackageShortDescription(topic.package)}. Do you want pricing or what's included?`;
              lead = enhanceLeadFromTopic(null, topic, existingLead);
              // Store pending disambiguation state
              metadata.pendingDisambiguation = { topic, askedAt: new Date() };
              console.log('[Chat] 💾 PENDING DISAMBIGUATION STATE STORED:', JSON.stringify(topic));
            } else {
              // Fallback to LLM
              reply = await handleLLMPath();
            }
          } else if (isAndForPattern && lastIntent === 'pricing' && topic.package) {
            // "and for X?" after pricing context → show pricing
            console.log('[Chat] ✓ DETERMINISTIC PRICING PATH (and for X after pricing context)');
            const response = pricingResponder.generatePricingResponse(topic);
            reply = response.reply;
            lead = response.lead;
          } else {
            // General query - use LLM with knowledge base
            reply = await handleLLMPath();
          }
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

      function getPackageShortDescription(packageId: string | undefined): string {
        if (!packageId) return 'business automation';

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

      // Insert bot message with metadata (intent, lead, pending state)
      console.log('[Chat] Step 6: Insert bot message...');
      metadata.lead = updatedLead ? updatedLead.id : null;
      await dbService.insertMessage(conversation.id, 'bot', reply, metadata);
      console.log('[Chat] Bot message inserted with metadata:', JSON.stringify({
        intent: metadata.intent,
        lead: updatedLead ? updatedLead.id : 'none',
        hasPendingDisambiguation: !!metadata.pendingDisambiguation
      }));

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
