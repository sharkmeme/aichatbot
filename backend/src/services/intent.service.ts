import { Message } from '../types';
import { PRICING_DATA } from '../data/pricing';
import { fuzzyMatch } from '../utils/fuzzy';

export type Intent = 'pricing' | 'inclusions' | 'budget_confirmation' | 'definition' | 'billing_cadence' | 'buy' | 'disambiguation_resolution' | 'general';

export interface ConversationTopic {
  division?: string; // studios, vip, code, software
  package?: string;  // starter, growth, masterminds, etc
}

export interface PendingDisambiguation {
  topic: ConversationTopic;
  askedAt: Date;
}

/**
 * Pending lead field type - tracks what info we're waiting for
 */
export type PendingLeadField = 'name' | 'email' | 'budget' | 'contact_choice';

/**
 * Disambiguation resolution type
 */
export type DisambiguationChoice = 'pricing' | 'inclusions' | 'both';

/**
 * Package aliases for fuzzy matching and typo tolerance
 */
const PACKAGE_ALIASES: Record<string, string[]> = {
  'starter': ['starter', 'start'],
  'growth': ['growth', 'grow'],
  'content-engine': ['content engine', 'pipeline', 'engine', 'content'],
  'studio-partner': ['studio partner', 'partner', 'studios partner'],
  'masterminds': ['masterminds', 'mastermind', 'group coaching'],
  'fast-track': ['fast track', 'fast-track', '1 on 1', 'one on one', 'coaching'],
  'lead-intake-crm': ['crm', 'crm system', 'lead intake', 'lead crm', 'customer relationship'],
  'ai-outreach': ['outreach', 'ai outreach', 'follow up', 'followup', 'outreach system'],
  'support-ticket': ['ticket', 'support ticket', 'ticketing', 'ticket system', 'support'],
  'chat-assistant': ['chatbot', 'chat assistant', 'chat bot', 'website chat', 'chat'],
  'phone-support': ['phone', 'phone support', 'call support', 'voice']
};

/**
 * Intent Detection and Conversation Topic Tracking
 *
 * Detects when users ask about pricing or inclusions,
 * and tracks what topic is currently being discussed.
 */
export class IntentService {
  /**
   * Detect the primary intent of a user message
   * @param hasPendingDisambiguation - Whether there's a pending disambiguation question
   */
  detectIntent(message: string, hasPendingDisambiguation: boolean = false): Intent {
    const normalized = message.toLowerCase().trim();

    // If pending disambiguation, check if this is a resolution
    if (hasPendingDisambiguation) {
      const resolution = this.detectDisambiguationResolution(normalized);
      if (resolution !== null) {
        return 'disambiguation_resolution';
      }
    }

    // Buy intent (high priority - indicates readiness to purchase)
    const buyPatterns = [
      /^(buy|purchase|get (this|it|that)|sign up|interested|let'?s do it)$/i,
      /\b(i'?ll|i will|i want to) (buy|purchase|get|sign up)\b/i,
      /\b(want to|ready to) (buy|purchase|get it|sign up|proceed|move forward)\b/i,
      /^(yes|yeah|yep),? (buy|purchase|interested|let'?s go)$/i
    ];

    for (const pattern of buyPatterns) {
      if (pattern.test(normalized)) {
        return 'buy';
      }
    }

    // Billing cadence questions (high priority - very specific)
    if (/\b(it'?s?|is (it|this|that)|are (they|these)) (a )?(monthly|month-to-month|subscription|recurring)\??$/i.test(normalized) ||
        /\b(it'?s?|is (it|this|that)|are (they|these)) (a )?(one-?time|single payment|upfront)\??$/i.test(normalized) ||
        /\b(monthly|one-?time|subscription|recurring|payment terms?)\??$/i.test(normalized)) {
      return 'billing_cadence';
    }

    // Definition questions (what is X? - but NOT if pricing words are present)
    const hasDefinitionPattern = /^what (is|are|does) (the |a |an )?(vip|studios?|bunny code|honey software|masterminds?|fast track|crm|outreach|chatbot|ticket)/i.test(normalized);
    const hasPricingWords = /\b(price|pricing|cost|how much|ow much|much for|\$|rate|fee)\b/i.test(normalized);

    if (hasDefinitionPattern && !hasPricingWords) {
      return 'definition';
    }

    // Budget confirmation patterns
    const budgetConfirmations = [
      /\b(that|the|this) (price|cost|budget|amount) (is|works|sounds|seems) (good|fine|ok|okay|perfect|great)\b/,
      /\b(price|budget|cost) (you )?mentioned (is|works)\b/,
      /\bmy budget\b/,
      /\bi (can|could) (afford|do) (that|it)\b/
    ];

    for (const pattern of budgetConfirmations) {
      if (pattern.test(normalized)) {
        return 'budget_confirmation';
      }
    }

    // "And the other" / "both packages" patterns (inclusions)
    if (/\b(and |what about )?(the )?(other|another)( one| package| plan)?\b/.test(normalized) ||
        /\bboth (packages|plans|tiers)\b/.test(normalized)) {
      return 'inclusions';
    }

    // Package keyword detection (for prioritization)
    const packageKeywords = [
      'crm', 'outreach', 'ticket', 'chatbot', 'chat assistant', 'phone',
      'starter', 'growth', 'content engine', 'studio partner',
      'masterminds', 'fast track'
    ];

    const hasPackageKeyword = packageKeywords.some(keyword =>
      new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i').test(normalized)
    );

    // Typo-tolerant pricing patterns (high priority)
    // Matches: "how much", "ow much", "much for", etc.
    const pricingPatterns = [
      /\b(h?ow|how's) much\b/i,              // "how much" or "ow much"
      /\bmuch (for|is|does)\b/i,              // "much for", "much is"
      /\b(what'?s? |whats )(the )?(price|pricing|cost)\b/i,
      /\bhow (expensive|costly)\b/i,
      /\b\$\s*\d/,                            // Dollar sign with number
      /\bcost (of|for)\b/i,
      /\bprice (for|of|on)\b/i
    ];

    for (const pattern of pricingPatterns) {
      if (pattern.test(normalized)) {
        return 'pricing';
      }
    }

    // If package keyword + pricing-related word detected → PRICING (high confidence)
    if (hasPackageKeyword && hasPricingWords) {
      return 'pricing';
    }

    // Exact package/offer name match (treat as pricing request)
    const packageNames = [
      'starter', 'growth', 'content engine', 'studio partner',
      'masterminds', 'fast track',
      'lead intake', 'ai outreach', 'outreach', 'support ticket',
      'chat assistant', 'chatbot', 'phone support'
    ];

    for (const pkgName of packageNames) {
      // If message is just the package name (with minimal extra words)
      if (normalized === pkgName || normalized === `${pkgName}?` ||
          normalized === `the ${pkgName}` || normalized === `${pkgName} package` ||
          normalized === `what'?s ${pkgName}` || normalized === `whats ${pkgName}`) {
        return 'pricing';
      }
    }

    // Pricing intent keywords (less specific, lower priority)
    const pricingKeywords = [
      'price', 'pricing', 'prices', 'cost', 'costs',
      'package', 'packages', 'plan', 'plans', 'tier', 'tiers',
      'rate', 'rates', 'fee', 'fees', 'monthly', 'per month',
      'what does it cost'
    ];

    // Inclusions intent keywords
    const inclusionsKeywords = [
      'included', 'includes', 'include', 'what do i get', 'what do you get',
      "what's in", 'features', 'feature', 'benefits', 'benefit',
      'what comes with', 'comes with', 'get with',
      'details', 'breakdown'
    ];

    // Check for inclusions intent first (more specific)
    for (const keyword of inclusionsKeywords) {
      if (normalized.includes(keyword)) {
        return 'inclusions';
      }
    }

    // Check for pricing intent (broader keyword matching)
    for (const keyword of pricingKeywords) {
      if (normalized.includes(keyword)) {
        return 'pricing';
      }
    }

    return 'general';
  }

  /**
   * Detect disambiguation resolution choice
   * Returns 'pricing', 'inclusions', 'both', or null if not a resolution/cancel
   */
  detectDisambiguationResolution(message: string): DisambiguationChoice | null {
    const normalized = message.toLowerCase().trim();

    // Cancel/ignore patterns - return null to clear pending state
    if (/^(no|cancel|skip|nevermind|never mind)$/i.test(normalized)) {
      return null;
    }

    // Explicit pricing choice
    if (/^(price|pricing|cost|how much)\??$/i.test(normalized) ||
        /\b(want|show|tell|give)( me)? (the )?(price|pricing|cost)\b/i.test(normalized)) {
      return 'pricing';
    }

    // Explicit inclusions choice
    if (/^(included|inclusions|features|what'?s included)\??$/i.test(normalized) ||
        /\b(want|show|tell|give)( me)? (the )?(inclusions|features|what'?s included)\b/i.test(normalized)) {
      return 'inclusions';
    }

    // Both
    if (/^both$/i.test(normalized) || /\b(both|everything|all)\b/i.test(normalized)) {
      return 'both';
    }

    // Yes = default to both
    if (/^(yes|yeah|yep|sure|ok|okay|please)$/i.test(normalized)) {
      return 'both';
    }

    // If user asks a new question, return null (don't treat as disambiguation)
    if (/^(what|how|when|where|why|who|can|do|is|are|tell|show)\b/i.test(normalized)) {
      return null;
    }

    // No match - likely a new question
    return null;
  }

  /**
   * Extract topic (division + package) from a message
   * Returns what division/package the user is asking about
   * @param lastIntent - The last detected intent (for context)
   */
  extractTopic(message: string, recentMessages: Message[] = [], lastIntent?: Intent): ConversationTopic {
    const normalized = message.toLowerCase();
    const topic: ConversationTopic = {};

    // Check if message has intent keywords (pricing, inclusions, features, etc.)
    const hasIntentKeywords = this.hasIntentKeywords(normalized);

    // "and for X?" pattern - topic switch
    // If last intent was pricing, this likely means "and for X pricing?"
    const andForMatch = /\b(and|what about) (for |about )?(the )?(crm|outreach|ticket|chatbot|chat|phone|lead)/i.exec(normalized);
    if (andForMatch) {
      const keyword = andForMatch[4];
      console.log('[Intent] "and for X?" pattern detected - keyword:', keyword, 'lastIntent:', lastIntent);

      if (/crm|lead/i.test(keyword)) {
        topic.package = 'lead-intake-crm';
        topic.division = 'code';
        return topic;
      } else if (/outreach/i.test(keyword)) {
        topic.package = 'ai-outreach';
        topic.division = 'code';
        return topic;
      } else if (/ticket/i.test(keyword)) {
        topic.package = 'support-ticket';
        topic.division = 'code';
        return topic;
      } else if (/chatbot|chat/i.test(keyword)) {
        topic.package = 'chat-assistant';
        topic.division = 'code';
        return topic;
      } else if (/phone/i.test(keyword)) {
        topic.package = 'phone-support';
        topic.division = 'code';
        return topic;
      }
    }

    // Content-type queries for Studios (brand ad, music video, etc.)
    if (/\b(brand ad|music video|commercial|short.?form|long.?form|ai film|video ad|tiktok|reel)\b/i.test(normalized)) {
      topic.division = 'studios';
      // Do NOT set specific package - return division only
      return topic;
    }

    // Division detection (only set if confidence is reasonable)
    if (/\b(studios?|video production|content creation|ai video)\b/i.test(normalized)) {
      topic.division = 'studios';
    } else if (/\b(vip|club|coaching|workshop)\b/i.test(normalized)) {
      topic.division = 'vip';
    } else if (/\b(code|bunny code|automation)\b/i.test(normalized)) {
      topic.division = 'code';
    } else if (/\b(software|honey software|website|saas)\b/i.test(normalized)) {
      topic.division = 'software';
    }

    // Package detection with fuzzy matching and aliases
    // ONLY apply if message has intent keywords OR match is very high confidence
    const packageMatch = this.detectPackageFromAliases(normalized);
    if (packageMatch) {
      // Apply stricter thresholds:
      // - Package match requires >0.80 confidence (without keywords) OR >=0.60 (with keywords)
      // - This prevents "chat" in generic "tell me about chat" from matching
      const packageThreshold = hasIntentKeywords ? 0.60 : 0.81;

      if (packageMatch.confidence >= packageThreshold) {
        topic.package = packageMatch.packageId;
        topic.division = packageMatch.division;
        console.log('[Intent] Package detected via alias/fuzzy match:', packageMatch.packageId, 'confidence:', packageMatch.confidence, 'hasIntentKeywords:', hasIntentKeywords);
      } else {
        console.log('[Intent] Package match confidence too low:', packageMatch.packageId, 'confidence:', packageMatch.confidence, 'threshold:', packageThreshold, '- NOT setting topic');
      }
    }

    // If no topic found in current message and message is vague, check recent messages
    if (!topic.division && !topic.package && this.isVagueQuery(message)) {
      const lastTopic = this.getLastTopic(recentMessages);
      if (lastTopic.division || lastTopic.package) {
        console.log('[Intent] Vague query detected, using last topic:', lastTopic);
        return lastTopic;
      }
    }

    return topic;
  }

  /**
   * Check if message has pricing/inclusions/feature intent keywords
   * Used to determine if fuzzy package matching should be more lenient
   */
  private hasIntentKeywords(message: string): boolean {
    const intentKeywords = [
      'price', 'pricing', 'cost', 'how much', 'ow much', 'much for',
      'included', 'includes', 'features', 'what do i get',
      'package', 'packages', 'plan', 'plans',
      'rate', 'fee', 'monthly', 'per month',
      'buy', 'purchase', 'get', 'sign up'
    ];

    const normalized = message.toLowerCase();
    return intentKeywords.some(keyword => normalized.includes(keyword));
  }

  /**
   * Check if a message is vague (lacks specific keywords)
   */
  private isVagueQuery(message: string): boolean {
    const normalized = message.toLowerCase().trim();

    // Short queries are likely vague
    if (normalized.split(/\s+/).length <= 4) {
      return true;
    }

    // Common vague patterns
    const vaguePatterns = [
      /^what'?s? (the |that )?price\??$/,
      /^what'?s? included\??$/,
      /^what do (i|you) get\??$/,
      /^how much\??$/,
      /^tell me more$/,
      /^details\??$/,
      /^and (for |that)\??/,
      /^(what|how) about/
    ];

    return vaguePatterns.some(pattern => pattern.test(normalized));
  }

  /**
   * Get the last discussed topic from conversation history
   * Looks at recent bot messages to see what was discussed
   * Uses more lenient matching since these are from known-good bot messages
   */
  getLastTopic(messages: Message[]): ConversationTopic {
    const topic: ConversationTopic = {};

    // Look at last 6 messages (3 exchanges)
    const recentMessages = messages.slice(-6);

    // Start from most recent and work backwards
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const normalized = msg.content.toLowerCase();

      // For bot messages, use more lenient matching
      // Try to find package names with lower confidence threshold
      const packageMatch = this.detectPackageFromAliases(normalized);
      if (packageMatch && packageMatch.confidence >= 0.50) { // Lower threshold for context extraction
        topic.package = packageMatch.packageId;
        topic.division = packageMatch.division;
        console.log('[Intent] Extracted topic from history:', topic.package, 'confidence:', packageMatch.confidence);
        break; // Found specific package, stop
      }

      // Also try standard extraction as fallback
      const extracted = this.extractTopic(msg.content, []);
      if (extracted.package) {
        topic.package = extracted.package;
        topic.division = extracted.division;
        break;
      } else if (extracted.division && !topic.division) {
        topic.division = extracted.division;
      }
    }

    return topic;
  }

  /**
   * Check if a message is asking about multiple packages
   * e.g., "what's included in both packages?"
   */
  detectMultiplePackages(message: string): boolean {
    const normalized = message.toLowerCase();
    return /\b(both|all|each)\s+(package|plan|tier)s?\b/i.test(normalized) ||
           /\b(and |what about )?(the )?(other|another)( one| package| plan)?\b/.test(normalized);
  }

  /**
   * Get the "other" packages in a division (for "and the other?" queries)
   * Returns packages from the same division, excluding the one just discussed
   */
  getOtherPackages(topic: ConversationTopic): ConversationTopic[] {
    if (!topic.division) {
      return [];
    }

    // If we have a specific package, return others in same division
    if (topic.package) {
      const division = PRICING_DATA[topic.division];
      if (!division) return [];

      return division.packages
        .filter(pkg => pkg.id !== topic.package)
        .map(pkg => ({
          division: topic.division,
          package: pkg.id
        }));
    }

    // If just division, return all packages
    return [];
  }

  /**
   * Detect package from aliases and fuzzy matching
   * Returns package ID, division, and confidence score
   */
  private detectPackageFromAliases(message: string): { packageId: string; division: string; confidence: number } | null {
    const normalized = message.toLowerCase();
    let bestMatch: { packageId: string; division: string; confidence: number } | null = null;

    // First try exact alias matches (highest confidence)
    for (const [packageId, aliases] of Object.entries(PACKAGE_ALIASES)) {
      for (const alias of aliases) {
        // Check for word boundary match (not just substring)
        const aliasPattern = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (aliasPattern.test(normalized)) {
          // For exact word boundary matches, give higher confidence
          // Base confidence on ratio of alias to message, but boost short exact matches
          let confidence: number;
          if (alias.length <= 4) {
            // Short matches (crm, chat, etc.) - boost confidence significantly
            confidence = 0.80;
          } else {
            // Longer matches - use ratio with multiplier
            confidence = Math.min(0.95, alias.length / normalized.length * 2.0);
          }

          if (!bestMatch || confidence > bestMatch.confidence) {
            const division = this.getDivisionForPackage(packageId);
            if (division) {
              bestMatch = { packageId, division, confidence };
            }
          }
        }
      }
    }

    // If exact match found with reasonable confidence, return it
    if (bestMatch && bestMatch.confidence >= 0.50) {
      return bestMatch;
    }

    // Try fuzzy matching on individual words (for typos like "ontent engine")
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    for (const word of words) {
      for (const [packageId, aliases] of Object.entries(PACKAGE_ALIASES)) {
        for (const alias of aliases) {
          const aliasWords = alias.split(/\s+/);
          for (const aliasWord of aliasWords) {
            if (aliasWord.length < 4) continue;

            const match = fuzzyMatch(word, [aliasWord], 0.80); // Increased threshold from 0.75 to 0.80
            if (match) {
              const confidence = match.score * 0.70; // Reduced from 0.75 for more conservative fuzzy matches
              if (!bestMatch || confidence > bestMatch.confidence) {
                const division = this.getDivisionForPackage(packageId);
                if (division) {
                  bestMatch = { packageId, division, confidence };
                }
              }
            }
          }
        }
      }
    }

    // Only return if confidence meets minimum threshold (0.55)
    return bestMatch && bestMatch.confidence >= 0.55 ? bestMatch : null;
  }

  /**
   * Get division for a package ID
   */
  private getDivisionForPackage(packageId: string): string | null {
    for (const [division, data] of Object.entries(PRICING_DATA)) {
      if (data.packages.some(pkg => pkg.id === packageId)) {
        return division;
      }
    }
    return null;
  }
}
