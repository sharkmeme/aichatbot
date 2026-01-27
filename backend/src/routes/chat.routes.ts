import { Router, Request, Response, NextFunction } from 'express';
import { validateChatRequest, sanitizeInput } from '../middleware/validation';
import { sessionRateLimiter } from '../middleware/rateLimiter';
import { DatabaseService } from '../services/database.service';
import { OpenAIService } from '../services/openai.service';
import { IntentService, ConversationTopic, PendingDisambiguation, PendingLeadField, Intent } from '../services/intent.service';
import { PricingResponderService } from '../services/pricing-responder.service';
import { AssistantToolsService } from '../services/assistant-tools.service';
import { ChatRequest, ChatResponse, Lead, Message } from '../types';
import { getAllValidPrices, PRICING_DATA } from '../data/pricing';
import {
  looksLikeQuestion,
  hasPricingOrInfoIntent,
  isAttemptedEmail,
  isPlausibleName,
  isPurchaseCommitment,
  isValidEmail as isValidEmailHelper,
  isQuestionMode,
  isActionMode
} from '../utils/leadflow';

const router = Router();
const dbService = new DatabaseService();
const openaiService = new OpenAIService();
const intentService = new IntentService();
const pricingResponder = new PricingResponderService();
const toolsService = new AssistantToolsService();

/**
 * Detect if message is asking about company legal status, location, or registration
 */
function isCompanyInfoQuestion(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const companyPatterns = /\b(legal|registered|official|company|location|based|where are you|country|romania|eu|jurisdiction|entity|srl)\b/i;
  return companyPatterns.test(normalized);
}

/**
 * Get metadata from the most recent bot message
 * Used to check current state without scanning history
 */
function getLastBotMetadata(recentMessages: Message[]): any | null {
  // Look at messages from most recent backwards
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata) {
      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      console.log('[State] Found last bot metadata:', JSON.stringify(metadata));
      return metadata;
    }
  }
  return null;
}

/**
 * Check if there's a pending lead field we're waiting for
 * ONLY reads from the most recent bot message (not last N)
 * Guards: if existingLead already has the field, return null
 */
function getPendingLeadField(recentMessages: Message[], existingLead?: Lead | null): PendingLeadField | null {
  const metadata = getLastBotMetadata(recentMessages);
  if (metadata && metadata.pendingLeadField) {
    const pending = metadata.pendingLeadField as PendingLeadField;

    // Guard: if existingLead already contains that field, return null
    if (existingLead) {
      if (pending === 'name' && existingLead.name) {
        console.log('[LeadFlow] ⚠️  Pending "name" but existingLead.name already set - clearing pending');
        return null;
      }
      if (pending === 'email' && existingLead.email) {
        console.log('[LeadFlow] ⚠️  Pending "email" but existingLead.email already set - clearing pending');
        return null;
      }
      if (pending === 'contact_choice' && existingLead.preferred_contact_channel) {
        console.log('[LeadFlow] ⚠️  Pending "contact_choice" but existingLead.preferred_contact_channel already set - clearing pending');
        return null;
      }
    }

    console.log('[LeadFlow] ✅ PENDING LEAD FIELD ACTIVE:', pending);
    return pending;
  }
  console.log('[LeadFlow] No pending lead field');
  return null;
}

/**
 * Check if there's a pending disambiguation question
 * ONLY reads from the most recent bot message (not last N)
 */
function getPendingDisambiguation(recentMessages: Message[]): PendingDisambiguation | null {
  const metadata = getLastBotMetadata(recentMessages);
  if (metadata && metadata.pendingDisambiguation) {
    console.log('[Chat] 🔄 PENDING DISAMBIGUATION STATE FOUND:', JSON.stringify(metadata.pendingDisambiguation));
    return {
      topic: metadata.pendingDisambiguation.topic,
      askedAt: new Date(metadata.pendingDisambiguation.askedAt)
    };
  }
  return null;
}

/**
 * Get the last intent from the most recent bot message
 * ONLY reads from the most recent bot message (not last N)
 */
function getLastIntent(recentMessages: Message[]): Intent | null {
  const metadata = getLastBotMetadata(recentMessages);
  if (metadata && metadata.intent) {
    return metadata.intent as Intent;
  }
  return null;
}

/**
 * Get the last listed division packages from recent messages
 * Returns division and package IDs if bot recently listed multiple packages
 */
function getLastListedDivisionPackages(recentMessages: Message[]): { division: string; packages: string[] } | null {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata) {
      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (metadata.listedDivisionPackages) {
        console.log('[Chat] Found listed division packages in history:', JSON.stringify(metadata.listedDivisionPackages));
        return metadata.listedDivisionPackages;
      }
    }
    // Only check last 3 bot messages
    if (i < recentMessages.length - 6) break;
  }
  return null;
}

/**
 * Detect if user is requesting multiple packages (both, all, and the other)
 * Returns requestedPackages array if detected
 */
function detectMultiPackageRequest(
  message: string,
  recentMessages: Message[]
): { requestedPackages: string[]; division: string } | null {
  const normalized = message.toLowerCase().trim();

  // Detect multi-package keywords
  const isMultiPackageRequest = /^(both|all|everything|both of them|all of them|compare them|info to both|info for both)$/i.test(normalized) ||
                                /\b(both|all|everything|both of them|all of them)\b/i.test(normalized);

  const isAndTheOther = /\b(and |what about )?(the )?(other|another)( one| package| tier)?\b/i.test(normalized);

  if (!isMultiPackageRequest && !isAndTheOther) {
    return null;
  }

  console.log('[MultiPackage] Detected multi-package request pattern:', normalized);

  // Get recently listed packages
  const listedPackages = getLastListedDivisionPackages(recentMessages);

  if (listedPackages) {
    if (isMultiPackageRequest) {
      // "both/all" - return all packages
      console.log('[MultiPackage] Returning ALL packages:', listedPackages.packages);
      return {
        requestedPackages: listedPackages.packages,
        division: listedPackages.division
      };
    } else if (isAndTheOther) {
      // "and the other" - find what was last discussed and return the other one(s)
      const lastTopic = intentService.getLastTopic(recentMessages);
      if (lastTopic.package) {
        const otherPackages = listedPackages.packages.filter(p => p !== lastTopic.package);
        if (otherPackages.length > 0) {
          console.log('[MultiPackage] "and the other" - returning:', otherPackages);
          return {
            requestedPackages: otherPackages,
            division: listedPackages.division
          };
        }
      }
    }
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
 * Detect if user expresses proceed/buy intent
 */
function detectProceedIntent(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return /\b(buy|purchase|get|start|join|proceed|sign up|let'?s go|i want|contact|telegram|whatsapp|meeting)\b/i.test(normalized);
}

/**
 * Validate if user message contains budget signals
 * Used to prevent LLM from hallucinating budget_range
 */
function hasBudgetSignals(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  // Check for: $, digits with "k", "not sure", budget ranges like "$1-5K"
  return /\$|budget|\d+k|\d{3,}|not sure|no budget|<\$|1-5k|5-20k|20k\+/i.test(normalized);
}

/**
 * Validate if user message explicitly mentions contact channels
 * Used to prevent LLM from hallucinating preferred_contact_channel
 */
function hasContactChannelMention(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return /\b(telegram|whatsapp|meeting|call|phone|contact form|email|zoom|calendar|schedule)\b/i.test(normalized);
}

/**
 * Get the last CTA shown message index
 * Returns the message index and timestamp if found
 */
function getLastCtaShown(recentMessages: Message[]): { messageIndex: number; timestamp: Date } | null {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.sender === 'bot' && msg.metadata) {
      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      if (metadata.ctaShown) {
        return {
          messageIndex: i,
          timestamp: new Date(metadata.ctaShownAt || msg.created_at || new Date())
        };
      }
    }
  }
  return null;
}

/**
 * Check if CTA should be shown based on cooldown
 * Returns true if CTA can be shown
 */
function shouldShowCta(recentMessages: Message[], userExpressesProceed: boolean): boolean {
  // Always show if user explicitly expresses proceed intent
  if (userExpressesProceed) {
    console.log('[CTA] User expressed proceed intent - CTA allowed');
    return true;
  }

  // Check cooldown - don't show if CTA was shown in last 6 messages
  const lastCta = getLastCtaShown(recentMessages);
  if (lastCta) {
    const messagesSinceLastCta = recentMessages.length - 1 - lastCta.messageIndex;
    console.log('[CTA] Last CTA shown', messagesSinceLastCta, 'messages ago');

    if (messagesSinceLastCta < 6) {
      console.log('[CTA] Cooldown active - NOT showing CTA');
      return false;
    }
  }

  console.log('[CTA] No recent CTA or cooldown expired - CTA allowed');
  return true;
}

/**
 * Generate or enhance lead data from topic and existing lead
 * Also auto-sets budget_range for fixed-price packages
 * @param showsInterest - Only set interest_area/notes if user showed actual interest (pricing/inclusions/buy intent)
 */
function enhanceLeadFromTopic(
  lead: Lead | null,
  topic: { division?: string; package?: string },
  existingLead: Lead | null,
  showsInterest: boolean = true
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

  // Update interest_area from topic if user shows actual interest
  // Always update to most recent asked-about package/division (don't stay stuck on old interest)
  if (showsInterest && (topic.package || topic.division)) {
    const newInterest = topic.package || topic.division;
    if (newInterest) {
      // If there's an existing interest that's different, append to notes
      if (enhanced.interest_area && enhanced.interest_area !== newInterest) {
        const interestNote = `Previously interested in: ${enhanced.interest_area}`;
        enhanced.notes = enhanced.notes ? `${enhanced.notes}; ${interestNote}` : interestNote;
      }
      // Update to most recent interest
      enhanced.interest_area = newInterest;
    }
  }

  // Only auto-set budget_range and notes if user shows actual interest
  if (showsInterest && !enhanced.budget_range && topic.package && topic.division) {
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
      let pendingLeadField = getPendingLeadField(recentMessages, existingLead);

      // Check for pending disambiguation state
      const pendingDisambiguation = getPendingDisambiguation(recentMessages);
      const lastIntent = getLastIntent(recentMessages);

      // DETECT MODE: Question Mode vs Action Mode
      const userMode = isQuestionMode(sanitizedMessage) ? 'QUESTION' :
                       isActionMode(sanitizedMessage) ? 'ACTION' :
                       'NEUTRAL';
      console.log(`[Mode] Detected mode: ${userMode} for message: "${sanitizedMessage.substring(0, 50)}..."`);

      // If QUESTION MODE and pending=contact_choice: clear it for this turn
      if (userMode === 'QUESTION' && pendingLeadField === 'contact_choice') {
        console.log('[Mode] QUESTION MODE detected - clearing contact_choice pending for this turn');
        pendingLeadField = null;
      }

      // SERVER-SIDE COMPANY INFO FALLBACK
      // Inject company facts as context if message asks about legal/location
      let companyInfoContext: string | null = null;
      if (isCompanyInfoQuestion(sanitizedMessage)) {
        const companyInfo = toolsService.executeTool('get_company_info', {});
        companyInfoContext = `COMPANY FACTS (use this to answer): ${JSON.stringify(companyInfo)}`;
        console.log('[CompanyInfo] 🏢 Detected company/legal/location question - injecting context:', companyInfoContext);
      }

      let reply: string = "I'm having trouble processing that. Could you rephrase your question?";
      let lead: Lead | null = null;
      let metadata: any = {}; // Track metadata
      let intent: Intent | null = null;
      let topic: ConversationTopic = {};

      // PRIORITY 1: Handle pending lead field (bypasses ALL intent/topic logic)
      let pendingResolved = false;

      if (pendingLeadField) {
        console.log('[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE:', pendingLeadField);

        if (pendingLeadField === 'name') {
          // INTERRUPTIBLE: Check if user is asking a question instead of providing name
          if (looksLikeQuestion(sanitizedMessage) || hasPricingOrInfoIntent(sanitizedMessage)) {
            console.log('[LeadFlow] ⚠️  User asked question during name collection - interrupting to answer');
            // Fall through to normal routing to answer the question
            // DO NOT consume as name, DO NOT mark as resolved
          } else if (isValidEmailHelper(sanitizedMessage.trim())) {
            // User provided email instead of name - accept it
            const email = sanitizedMessage.trim();
            console.log('[LeadFlow] ✅ User provided email instead of name:', email);

            lead = enhanceLeadFromTopic(null, {}, existingLead);
            lead.email = email;

            // Still need name
            reply = "Great! And what's your name?";
            metadata.pendingLeadField = 'name';
            pendingResolved = true;
          } else if (isPlausibleName(sanitizedMessage)) {
            // Valid name
            const name = sanitizeName(sanitizedMessage);
            console.log('[LeadFlow] ✅ pending=name resolved, saved name:', name);

            lead = enhanceLeadFromTopic(null, {}, existingLead);
            lead.name = name;

            // Ask for email next
            reply = "Perfect! What's your email address?";
            metadata.pendingLeadField = 'email';
            pendingResolved = true;
          } else {
            // Unclear input - ask again
            console.log('[LeadFlow] ⚠️  Unclear input for name - asking again');
            reply = "What should I call you?";
            metadata.pendingLeadField = 'name';
            lead = enhanceLeadFromTopic(null, {}, existingLead);
            pendingResolved = true;
          }

        } else if (pendingLeadField === 'email') {
          // INTERRUPTIBLE: Check if user is asking a question instead of providing email
          if (looksLikeQuestion(sanitizedMessage) || hasPricingOrInfoIntent(sanitizedMessage) || !isAttemptedEmail(sanitizedMessage)) {
            console.log('[LeadFlow] ⚠️  User asked question during email collection - interrupting to answer');
            // Fall through to normal routing to answer the question
            // DO NOT say "invalid email", DO NOT mark as resolved
          } else {
            // User attempted to provide email
            const email = sanitizedMessage.trim();

            if (isValidEmailHelper(email)) {
              console.log('[LeadFlow] ✅ pending=email resolved, saved email:', email);

              lead = enhanceLeadFromTopic(null, {}, existingLead);
              lead.email = email;

              // Show contact options
              reply = "Great! How would you like to move forward?\n\n{{BTN_MEETING}}\n{{BTN_WHATSAPP}}\n{{BTN_TELEGRAM}}\n{{BTN_CONTACT_FORM}}\n{{BTN_CALL_US}}";
              metadata.pendingLeadField = 'contact_choice';
              metadata.ctaShown = true;
              metadata.ctaShownAt = new Date().toISOString();
              pendingResolved = true;
            } else {
              console.log('[LeadFlow] ❌ Invalid email format:', email);

              // Ask again
              reply = "That doesn't look like a valid email. Please enter your email address (e.g., name@company.com).";
              metadata.pendingLeadField = 'email'; // Keep pending
              lead = enhanceLeadFromTopic(null, {}, existingLead);
              pendingResolved = true;
            }
          }

        } else if (pendingLeadField === 'budget') {
          // INTERRUPTIBLE: Check if user is asking a question instead of providing budget
          if (looksLikeQuestion(sanitizedMessage) || hasPricingOrInfoIntent(sanitizedMessage)) {
            console.log('[LeadFlow] ⚠️  User asked question during budget collection - interrupting to answer');
            // Fall through to normal routing to answer the question
          } else {
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
            pendingResolved = true;
          }

        } else if (pendingLeadField === 'contact_choice') {
          // Handle contact method selection (NON-BLOCKING)
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
            pendingResolved = true;
            // No more pending field

          } else if (/^(ok|okay|thanks|thank you|got it|sounds good|perfect|great|cool)$/i.test(sanitizedMessage.trim())) {
            // Acknowledgement - don't re-show buttons, just ask if they have questions
            console.log('[LeadFlow] ✅ User acknowledged contact options - clearing pending state');
            reply = "Any other questions I can help with?";
            pendingResolved = true;
            // Clear pending field but keep lead
            lead = enhanceLeadFromTopic(null, {}, existingLead);

          } else {
            // User asked something else - clear pending and answer normally
            console.log('[LeadFlow] ⚠️  User asked different question while contact_choice pending - clearing state, answering question');
            // Don't set pendingResolved, allow fall-through to normal routing
          }
        }
      }

      // Check for pending question (new single-state approach)
      const pendingQuestion = pendingDisambiguation ? {
        type: 'pricing_or_inclusions',
        topic: pendingDisambiguation.topic,
        askedAt: pendingDisambiguation.askedAt
      } : null;

      // PRIORITY 2: Handle pending question resolution
      if (pendingQuestion && !pendingResolved) {
        console.log('[Chat] 🔄 PENDING QUESTION ACTIVE:', pendingQuestion.type);

        const normalized = sanitizedMessage.toLowerCase().trim();

        // Detect user's choice
        let choice: 'pricing' | 'inclusions' | 'both' | 'cancel' | null = null;

        if (/^(price|pricing|cost|how much|yes)$/i.test(normalized) || /\b(price|pricing|cost)\b/i.test(normalized)) {
          choice = 'pricing';
        } else if (/^(included|inclusions|features|what'?s included)$/i.test(normalized) || /\b(included|inclusions|features)\b/i.test(normalized)) {
          choice = 'inclusions';
        } else if (/\b(both|all|everything|info to both)\b/i.test(normalized)) {
          choice = 'both';
        } else if (/^(no|cancel|skip|nevermind)$/i.test(normalized)) {
          choice = 'cancel';
        } else if (/^(what|how|when|where|why|who|tell|show)\b/i.test(normalized)) {
          // User asked a new question - clear pending
          choice = 'cancel';
        }

        if (choice && choice !== 'cancel') {
          console.log('[Chat] ✓ RESOLVING PENDING QUESTION:', choice);

          // Special handling for VIP division "both" - show BOTH packages
          if (choice === 'both' && pendingQuestion.topic.division === 'vip') {
            console.log('[Chat] VIP "both" detected - showing both Masterminds AND Fast Track');
            const division = PRICING_DATA['vip'];

            if (division) {
              const packages = division.packages;
              const responses: string[] = [];

              // Generate response for each VIP package
              for (const pkg of packages) {
                const pkgTopic = { division: 'vip', package: pkg.id };
                const pricingResp = pricingResponder.generatePricingResponse(pkgTopic);
                const inclusionsResp = pricingResponder.generateInclusionsResponse(pkgTopic, false);

                responses.push(`**${pkg.name}**\n${pricingResp.reply}\n\n**What's included:**\n${inclusionsResp.reply}`);
              }

              reply = responses.join('\n\n---\n\n');
              lead = enhanceLeadFromTopic(null, pendingQuestion.topic, existingLead, true); // User is showing interest
            }
          } else if (choice === 'pricing' || choice === 'both') {
            const response = pricingResponder.generatePricingResponse(pendingQuestion.topic);
            reply = response.reply;
            lead = response.lead;

            if (choice === 'both') {
              const inclusionsResponse = pricingResponder.generateInclusionsResponse(pendingQuestion.topic, false);
              reply += `\n\n**What's included:**\n${inclusionsResponse.reply}`;
            }
          } else if (choice === 'inclusions') {
            const response = pricingResponder.generateInclusionsResponse(pendingQuestion.topic, false);
            reply = response.reply;
            lead = response.lead;
          }

          pendingResolved = true;
          // Don't set pendingDisambiguation in metadata (clear it)
        } else if (choice === 'cancel') {
          console.log('[Chat] ⚠️  User canceled pending question or asked new question');
          // Fall through to normal routing
        }
      }

      // PRIORITY 2.5: Handle "and the other" for VIP packages
      if (!pendingResolved && /\b(and |what about )?(the )?(other|another)( one| package)?\b/i.test(sanitizedMessage)) {
        // Check if we have VIP context from recent messages
        const lastTopic = intentService.getLastTopic(recentMessages);

        if (lastTopic.division === 'vip' && lastTopic.package) {
          console.log('[Chat] "and the other" detected in VIP context - switching package');

          // Get the other VIP package
          const otherPackages = intentService.getOtherPackages(lastTopic);
          if (otherPackages.length > 0) {
            const otherTopic = otherPackages[0]; // VIP only has 2 packages
            const pricingResp = pricingResponder.generatePricingResponse(otherTopic);
            const inclusionsResp = pricingResponder.generateInclusionsResponse(otherTopic, false);

            reply = `${pricingResp.reply}\n\n**What's included:**\n${inclusionsResp.reply}`;
            lead = pricingResp.lead || inclusionsResp.lead;
            topic = otherTopic;
            metadata.intent = 'pricing';
            pendingResolved = true;
          }
        }
      }

      // PRIORITY 2.6: Handle direct contact method selection (call/telegram/whatsapp/meeting)
      // This MUST come before topic extraction to prevent "call" from being matched to "phone-support" package
      if (!pendingResolved) {
        const selectedContact = detectContactMethodSelection(sanitizedMessage);

        if (selectedContact && existingLead && existingLead.name && existingLead.email) {
          console.log('[Chat] 🎯 Contact method selected by qualified lead:', selectedContact);

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
          pendingResolved = true;
          metadata.intent = 'contact_selection';
        }
      }

      // PRIORITY 3+: Normal intent/topic routing with LLM (only if pending wasn't resolved)
      if (!pendingResolved) {
        // Detect multi-package requests FIRST
        const multiPackageRequest = detectMultiPackageRequest(sanitizedMessage, recentMessages);
        let requestedPackages: string[] | null = null;

        if (multiPackageRequest) {
          requestedPackages = multiPackageRequest.requestedPackages;
          console.log('[Chat] 🔧 Multi-package request detected - packages:', requestedPackages, 'division:', multiPackageRequest.division);

          // Force topic to division-only (never single package)
          topic = { division: multiPackageRequest.division };
          intent = 'both'; // Force "both" intent for multi-package requests
        } else {
          // Detect intent and extract topic hint
          console.log('[Chat] Step 4: Detect intent and extract topic hint...');
          intent = intentService.detectIntent(sanitizedMessage, false);  // No disambiguation flag needed
          topic = intentService.extractTopic(sanitizedMessage, recentMessages, lastIntent || undefined);
          console.log('[Chat] Intent hint:', intent, '| Topic hint:', JSON.stringify(topic));
          console.log('[Chat] Last Intent:', lastIntent);

          // CRITICAL FIX: If intent is "both", ensure topic is division-only
          // This prevents price guard from scoping to single package
          if (intent === 'both') {
            // Check if we recently listed multiple packages for a division
            const listedPackages = getLastListedDivisionPackages(recentMessages);

            if (listedPackages) {
              // Use the division from the listing
              console.log('[Chat] 🔧 Intent "both" detected with recent package listing - using division:', listedPackages.division);
              topic = { division: listedPackages.division };
              requestedPackages = listedPackages.packages; // Track requested packages
            } else if (topic.package && topic.division) {
              // Fallback: drop package from current topic
              console.log('[Chat] 🔧 Intent "both" detected - dropping package scope from topic:', topic.package, '→ division-only');
              topic = { division: topic.division };
            } else if (!topic.division) {
              // No topic at all - need to get from context
              const lastTopic = intentService.getLastTopic(recentMessages);
              if (lastTopic.division) {
                console.log('[Chat] 🔧 Intent "both" with no topic - using last division:', lastTopic.division);
                topic = { division: lastTopic.division };
              }
            }
          }
        }

        metadata.intent = intent;

        // Store requestedPackages in metadata for price guard
        if (requestedPackages) {
          metadata.requestedPackages = requestedPackages;
          console.log('[Chat] 💾 Stored requestedPackages in metadata:', requestedPackages);
        }
        // Use LLM with tools for natural conversation
        console.log('[Chat] → Using LLM with tool calling for response generation');

        // Inject company info context if detected
        const messagesWithContext = companyInfoContext
          ? [...recentMessages, {
              id: `system-${Date.now()}`,
              conversation_id: conversation.id,
              sender: 'system' as const,
              content: companyInfoContext,
              created_at: new Date()
            }]
          : recentMessages;

        const llmResponse = await openaiService.generateChatCompletionWithTools(
          messagesWithContext,
          sanitizedMessage,
          existingLead,
          {
            topic,
            pendingLeadField,
            pendingQuestion,
            lastIntent: lastIntent || undefined,
            requestedPackages: requestedPackages || undefined
          }
        );

        reply = llmResponse.reply;
        lead = llmResponse.lead || null;

        // Store listed division packages metadata for "both" handling
        if (llmResponse.toolContext?.listed_division_packages) {
          metadata.listedDivisionPackages = llmResponse.toolContext.listed_division_packages;
          console.log('[Chat] 💾 Stored listed division packages:', JSON.stringify(metadata.listedDivisionPackages));
        }

        // Update state from LLM output
        if (llmResponse.stateUpdate) {
          console.log('[Chat] LLM returned state update:', JSON.stringify(llmResponse.stateUpdate));

          // Update topic if LLM identified one
          if (llmResponse.stateUpdate.topic) {
            topic = llmResponse.stateUpdate.topic;
          }

          // Handle pending question from LLM
          if (llmResponse.stateUpdate.pending_question) {
            metadata.pendingDisambiguation = {
              topic: llmResponse.stateUpdate.pending_question.topic,
              askedAt: new Date()
            };
            console.log('[Chat] 💾 LLM set pending question:', JSON.stringify(llmResponse.stateUpdate.pending_question));
          }

          // Update intent if provided
          if (llmResponse.stateUpdate.intent) {
            metadata.intent = llmResponse.stateUpdate.intent;
          }
        }

        // Price hallucination guard using tool context
        let validPrices: number[] = [];

        // CRITICAL: If requestedPackages exists, validate against UNION of all those package prices
        if (requestedPackages && requestedPackages.length > 0 && topic.division) {
          // Get prices for ALL requested packages
          const division = PRICING_DATA[topic.division];
          if (division) {
            const packagePrices: number[] = [];
            for (const pkgId of requestedPackages) {
              const pkg = division.packages.find(p => p.id === pkgId);
              if (pkg && typeof pkg.price === 'number') {
                packagePrices.push(pkg.price);
                if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
                  packagePrices.push(pkg.optional_support.price);
                }
              }
            }
            validPrices = packagePrices;
            console.log('[Guard] Using multi-package prices (UNION) for packages:', requestedPackages, '→ prices:', validPrices);
          }
        } else if (llmResponse.toolContext && llmResponse.toolContext.allowed_prices.length > 0) {
          validPrices = llmResponse.toolContext.allowed_prices;
          console.log('[Guard] Using tool-scoped prices:', validPrices);
        } else if (topic.package || topic.division) {
          validPrices = getTopicScopedPrices(topic);
          console.log('[Guard] Using topic-scoped prices:', validPrices);
        } else {
          validPrices = getAllValidPrices();
          console.log('[Guard] Using global prices');
        }

        // Extract mentioned prices from reply
        const pricePattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
        const mentionedPrices: number[] = [];
        let match;

        while ((match = pricePattern.exec(reply)) !== null) {
          const priceStr = match[1].replace(/,/g, '');
          const price = parseInt(priceStr, 10);
          mentionedPrices.push(price);
        }

        // Check for hallucinated prices
        if (mentionedPrices.length > 0 && validPrices.length > 0) {
          const hallucinatedPrices = mentionedPrices.filter(p => !validPrices.includes(p));

          if (hallucinatedPrices.length > 0) {
            console.error('[Guard] ⚠️  PRICE HALLUCINATION DETECTED!');
            console.error('[Guard] Mentioned:', mentionedPrices);
            console.error('[Guard] Allowed:', validPrices);
            console.error('[Guard] Hallucinated:', hallucinatedPrices);

            // Replace with deterministic response
            if (topic.package && topic.division) {
              console.error('[Guard] → Replacing with deterministic pricing for topic');
              const response = pricingResponder.generatePricingResponse(topic);
              reply = response.reply;
              lead = response.lead || lead;
            } else {
              console.error('[Guard] → Using safe fallback');
              reply = "I can share exact package pricing—which division interests you: Studios / Bunny Code / Honey Software / VIP?";
            }
          }
        }

        // Handle buy intent from LLM response - set up lead flow
        // GATED: Only trigger lead capture if user showed purchase commitment
        const userShowedCommitment = isPurchaseCommitment(sanitizedMessage) ||
                                      (existingLead && (existingLead.name || existingLead.email));

        if (userShowedCommitment) {
          if (reply.includes("What's your name?") || reply.includes("what's your name")) {
            metadata.pendingLeadField = 'name';
            console.log('[Chat] LLM triggered name collection (purchase commitment detected)');
          } else if (reply.includes("email address") || reply.includes("your email")) {
            metadata.pendingLeadField = 'email';
            console.log('[Chat] LLM triggered email collection (purchase commitment detected)');
          }
        } else {
          console.log('[Chat] LLM tried to trigger lead capture but no purchase commitment - ignoring');
        }

        // Handle contact buttons in response
        if (reply.includes('{{BTN_')) {
          metadata.pendingLeadField = 'contact_choice';
          metadata.ctaShown = true;
          metadata.ctaShownAt = new Date().toISOString();
          console.log('[CTA] Contact buttons shown - pendingLeadField set to contact_choice');
        }

        // CTA ONE-SHOT POLICY:
        // After email collected, show CTA once. If next message is QUESTION MODE, do NOT re-show CTA.
        // Only re-show if user explicitly asks to move forward (ACTION MODE).

        // RESUME LEAD CAPTURE AFTER INTERRUPTION (but respect mode)
        // If we answered a question (didn't set pending field yet) but have incomplete lead, resume
        // BUT: Only resume if NOT in QUESTION MODE (to prevent CTA spam on informational queries)
        if (!metadata.pendingLeadField && !pendingResolved && existingLead && userMode !== 'QUESTION') {
          const hasName = !!existingLead.name;
          const hasEmail = !!existingLead.email;
          const hasContact = !!existingLead.preferred_contact_channel;

          // Resume based on what's missing
          if (hasName && !hasEmail) {
            console.log('[LeadFlow] 📝 Resuming after interruption - asking for email');
            reply += "\n\nWhat's your email address?";
            metadata.pendingLeadField = 'email';
          } else if (hasEmail && !hasName) {
            console.log('[LeadFlow] 📝 Resuming after interruption - asking for name');
            reply += "\n\nWhat's your name?";
            metadata.pendingLeadField = 'name';
          } else if (hasName && hasEmail && !hasContact && userMode === 'ACTION') {
            // Only show CTA if user is in ACTION MODE (explicitly ready to proceed)
            console.log('[LeadFlow] 📝 Resuming after interruption - asking for contact choice (ACTION MODE)');
            reply += "\n\nHow would you like to move forward?\n\n{{BTN_MEETING}}\n{{BTN_WHATSAPP}}\n{{BTN_TELEGRAM}}\n{{BTN_CONTACT_FORM}}\n{{BTN_CALL_US}}";
            metadata.pendingLeadField = 'contact_choice';
            metadata.ctaShown = true;
            metadata.ctaShownAt = new Date().toISOString();
          }
        }

        // Enhance lead with server-side topic tracking
        // Only mark as interested if intent is pricing/inclusions/buy
        const showsInterest = intent ? ['pricing', 'inclusions', 'buy', 'budget_confirmation'].includes(intent) : false;
        if (lead) {
          lead = enhanceLeadFromTopic(lead, topic, existingLead, showsInterest);
        }
      }

      // Ensure lead always has a value (server-side generation)
      if (!lead) {
        console.log('[Chat] Generating lead from topic and existing data');
        // For lead generation without explicit lead data, don't mark as interested unless we have strong intent
        const showsInterest = intent ? ['pricing', 'inclusions', 'buy', 'budget_confirmation'].includes(intent) : false;
        lead = enhanceLeadFromTopic(null, topic, existingLead, showsInterest);
      }

      console.log('[Chat] AI response generated');

      // Validate LEAD_JSON fields to prevent hallucination
      if (lead) {
        // Reject budget_range unless pendingLeadField === 'budget' OR user message contains explicit budget
        if (lead.budget_range && pendingLeadField !== 'budget' && !hasBudgetSignals(sanitizedMessage)) {
          console.log('[Validation] ⚠️  Rejecting hallucinated budget_range:', lead.budget_range, '- no budget signals in message');
          lead.budget_range = undefined;
        }

        // Normalize and validate preferred_contact_channel
        if (lead.preferred_contact_channel) {
          const normalized = lead.preferred_contact_channel.toLowerCase().trim();
          const validChannels = ['telegram', 'whatsapp', 'meeting', 'contact_form', 'call'];

          if (!validChannels.includes(normalized)) {
            console.log('[Validation] ⚠️  Invalid preferred_contact_channel:', lead.preferred_contact_channel, '- discarding');
            lead.preferred_contact_channel = undefined;
          } else {
            // Normalize to lowercase
            lead.preferred_contact_channel = normalized;
          }

          // Exception: Allow if pendingLeadField was 'contact_choice' (user was prompted)
          // Otherwise, require explicit mention in user message
          if (lead.preferred_contact_channel && pendingLeadField !== 'contact_choice' && !hasContactChannelMention(sanitizedMessage)) {
            console.log('[Validation] ⚠️  Rejecting hallucinated preferred_contact_channel - no channel mention in message');
            lead.preferred_contact_channel = undefined;
          }
        }
      }

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
