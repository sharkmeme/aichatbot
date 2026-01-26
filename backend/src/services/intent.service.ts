import { Message } from '../types';
import { PRICING_DATA } from '../data/pricing';

export type Intent = 'pricing' | 'inclusions' | 'budget_confirmation' | 'definition' | 'billing_cadence' | 'general';

export interface ConversationTopic {
  division?: string; // studios, vip, code, software
  package?: string;  // starter, growth, masterminds, etc
}

/**
 * Intent Detection and Conversation Topic Tracking
 *
 * Detects when users ask about pricing or inclusions,
 * and tracks what topic is currently being discussed.
 */
export class IntentService {
  /**
   * Detect the primary intent of a user message
   */
  detectIntent(message: string): Intent {
    const normalized = message.toLowerCase().trim();

    // Billing cadence questions (high priority - very specific)
    if (/\b(it'?s?|is (it|this|that)|are (they|these)) (a )?(monthly|month-to-month|subscription|recurring)\??$/i.test(normalized) ||
        /\b(it'?s?|is (it|this|that)|are (they|these)) (a )?(one-?time|single payment|upfront)\??$/i.test(normalized) ||
        /\b(monthly|one-?time|subscription|recurring|payment terms?)\??$/i.test(normalized)) {
      return 'billing_cadence';
    }

    // Definition questions (what is X?)
    if (/^what (is|are|does) (the )?(vip|studios?|bunny code|honey software|masterminds?|fast track)/i.test(normalized)) {
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

    // Exact package/offer name match (treat as pricing request)
    const packageNames = [
      'starter', 'growth', 'content engine', 'studio partner',
      'masterminds', 'fast track',
      'lead intake', 'crm', 'ai outreach', 'outreach', 'support ticket',
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

    // Pricing intent keywords
    const pricingKeywords = [
      'price', 'pricing', 'prices', 'cost', 'costs', 'how much',
      'package', 'packages', 'plan', 'plans', 'tier', 'tiers',
      'rate', 'rates', 'fee', 'fees', 'monthly', 'per month',
      'what does it cost', 'how expensive'
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

    // Check for pricing intent
    for (const keyword of pricingKeywords) {
      if (normalized.includes(keyword)) {
        return 'pricing';
      }
    }

    return 'general';
  }

  /**
   * Extract topic (division + package) from a message
   * Returns what division/package the user is asking about
   */
  extractTopic(message: string, recentMessages: Message[] = []): ConversationTopic {
    const normalized = message.toLowerCase();
    const topic: ConversationTopic = {};

    // "and for X?" pattern - topic switch
    const andForMatch = /\b(and|what about) (for |about )?(the )?(crm|outreach|ticket|chatbot|chat|phone|lead)/i.exec(normalized);
    if (andForMatch) {
      const keyword = andForMatch[4];
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

    // Division detection
    if (/\b(studios?|video production|content creation|ai video)\b/i.test(normalized)) {
      topic.division = 'studios';
    } else if (/\b(vip|club|coaching|workshop)\b/i.test(normalized)) {
      topic.division = 'vip';
    } else if (/\b(code|bunny code|automation)\b/i.test(normalized)) {
      topic.division = 'code';
    } else if (/\b(software|honey software|website|saas)\b/i.test(normalized)) {
      topic.division = 'software';
    }

    // Package detection (specific packages)
    // Studios packages
    if (/\bstarter\b/i.test(normalized)) {
      topic.package = 'starter';
      topic.division = 'studios';
    } else if (/\bgrowth\b/i.test(normalized)) {
      topic.package = 'growth';
      topic.division = 'studios';
    } else if (/\bcontent engine\b/i.test(normalized)) {
      topic.package = 'content-engine';
      topic.division = 'studios';
    } else if (/\bstudio partner\b/i.test(normalized)) {
      topic.package = 'studio-partner';
      topic.division = 'studios';
    }
    // VIP packages
    else if (/\bmasterminds?\b/i.test(normalized)) {
      topic.package = 'masterminds';
      topic.division = 'vip';
    } else if (/\bfast track\b/i.test(normalized)) {
      topic.package = 'fast-track';
      topic.division = 'vip';
    }
    // Bunny Code packages
    else if (/\b(lead intake|crm automation|lead.*crm)\b/i.test(normalized)) {
      topic.package = 'lead-intake-crm';
      topic.division = 'code';
    } else if (/\bcrm\b/i.test(normalized) && !/outreach/i.test(normalized)) {
      // "crm" alone (not in "crm updates from outreach")
      topic.package = 'lead-intake-crm';
      topic.division = 'code';
    } else if (/\b(ai outreach|outreach system|follow.?up system)\b/i.test(normalized)) {
      topic.package = 'ai-outreach';
      topic.division = 'code';
    } else if (/\boutreach\b/i.test(normalized) && !/automation/i.test(normalized)) {
      // "outreach" alone
      topic.package = 'ai-outreach';
      topic.division = 'code';
    } else if (/\b(support ticket|ticket automation|ticket system)\b/i.test(normalized)) {
      topic.package = 'support-ticket';
      topic.division = 'code';
    } else if (/\bticket/i.test(normalized)) {
      topic.package = 'support-ticket';
      topic.division = 'code';
    } else if (/\b(chat assistant|website chat)\b/i.test(normalized)) {
      topic.package = 'chat-assistant';
      topic.division = 'code';
    } else if (/\bchatbot\b/i.test(normalized)) {
      topic.package = 'chat-assistant';
      topic.division = 'code';
    } else if (/\b(phone support|voice assistant|call support)\b/i.test(normalized)) {
      topic.package = 'phone-support';
      topic.division = 'code';
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
   */
  getLastTopic(messages: Message[]): ConversationTopic {
    const topic: ConversationTopic = {};

    // Look at last 6 messages (3 exchanges)
    const recentMessages = messages.slice(-6);

    // Start from most recent and work backwards
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const extracted = this.extractTopic(msg.content, []);

      if (extracted.package) {
        topic.package = extracted.package;
        topic.division = extracted.division;
        break; // Found specific package, stop
      } else if (extracted.division && !topic.division) {
        topic.division = extracted.division;
        // Continue looking for package
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
}
