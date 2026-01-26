import { Message } from '../types';
import { PRICING_DATA } from '../data/pricing';

export type Intent = 'pricing' | 'inclusions' | 'general';

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
    const normalized = message.toLowerCase();

    // Pricing intent keywords
    const pricingKeywords = [
      'price', 'pricing', 'prices', 'cost', 'costs', 'how much',
      'package', 'packages', 'plan', 'plans', 'tier', 'tiers',
      'rate', 'rates', 'fee', 'fees', 'budget', 'monthly', 'per month',
      'what does it cost', 'how expensive'
    ];

    // Inclusions intent keywords
    const inclusionsKeywords = [
      'included', 'includes', 'include', 'what do i get', 'what do you get',
      "what's in", 'features', 'feature', 'benefits', 'benefit',
      'what comes with', 'comes with', 'get with', 'both packages',
      'both plans', 'in both', 'details', 'breakdown'
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

    // Division detection
    if (/\b(studios?|video|videos|content creation|ai video)\b/i.test(normalized)) {
      topic.division = 'studios';
    } else if (/\b(vip|club|coaching|masterminds?|fast track|workshop)\b/i.test(normalized)) {
      topic.division = 'vip';
    } else if (/\b(code|bunny code|automation|crm|outreach|lead|ticket|support)\b/i.test(normalized)) {
      topic.division = 'code';
    } else if (/\b(software|honey software|website|chatbot|saas)\b/i.test(normalized)) {
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
    else if (/\b(lead intake|crm automation|lead.*crm|crm)\b/i.test(normalized)) {
      topic.package = 'lead-intake-crm';
      topic.division = 'code';
    } else if (/\b(outreach|follow.?up|cold email|linkedin)\b/i.test(normalized)) {
      topic.package = 'ai-outreach';
      topic.division = 'code';
    } else if (/\b(support ticket|ticket automation)\b/i.test(normalized)) {
      topic.package = 'support-ticket';
      topic.division = 'code';
    } else if (/\b(chat assistant|chatbot|website chat)\b/i.test(normalized)) {
      topic.package = 'chat-assistant';
      topic.division = 'code';
    } else if (/\b(phone support|voice assistant|call)\b/i.test(normalized)) {
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
    return /\b(both|all|each)\s+(package|plan|tier)s?\b/i.test(normalized);
  }
}
