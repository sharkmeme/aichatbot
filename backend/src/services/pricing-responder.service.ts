import { PRICING_DATA, formatPrice, Package, Division } from '../data/pricing';
import { ConversationTopic } from './intent.service';
import { Lead } from '../types';

/**
 * Deterministic Pricing Responder
 *
 * Generates responses for pricing and inclusions queries WITHOUT calling the LLM.
 * This ensures we NEVER hallucinate prices - all prices come from the pricing data.
 */
export class PricingResponderService {
  /**
   * Generate a pricing response for a specific package
   */
  generatePricingResponse(topic: ConversationTopic): { reply: string; lead: Lead } {
    console.log('[PricingResponder] Generating pricing response for topic:', topic);

    let reply = '';
    const lead: Lead = {
      name: undefined,
      email: undefined,
      phone: undefined,
      business_type: undefined,
      company_name: undefined,
      interest_area: undefined,
      budget_range: undefined,
      preferred_contact_channel: undefined,
      notes: undefined
    };

    // Specific package requested
    if (topic.package && topic.division) {
      const division = PRICING_DATA[topic.division];
      if (division) {
        const pkg = division.packages.find(p => p.id === topic.package);
        if (pkg) {
          reply = this.formatPackagePricing(pkg, division);
          lead.interest_area = `${division.name} - ${pkg.name}`;
          lead.budget_range = this.estimateBudgetRange(pkg);
        }
      }
    }
    // Division only - list all packages
    else if (topic.division) {
      const division = PRICING_DATA[topic.division];
      if (division) {
        reply = this.formatDivisionPricing(division);
        lead.interest_area = division.name;
      }
    }
    // No clear topic - ask for clarification
    else {
      reply = "I can share exact pricing! Which area interests you?\n- Studios (AI video content)\n- Bunny Code (automations)\n- VIP Club (coaching)";
    }

    return { reply, lead };
  }

  /**
   * Generate an inclusions response for a specific package
   */
  generateInclusionsResponse(topic: ConversationTopic, includeMultiple: boolean = false): { reply: string; lead: Lead } {
    console.log('[PricingResponder] Generating inclusions response for topic:', topic);

    let reply = '';
    const lead: Lead = {
      name: undefined,
      email: undefined,
      phone: undefined,
      business_type: undefined,
      company_name: undefined,
      interest_area: undefined,
      budget_range: undefined,
      preferred_contact_channel: undefined,
      notes: undefined
    };

    // Specific package requested
    if (topic.package && topic.division) {
      const division = PRICING_DATA[topic.division];
      if (division) {
        const pkg = division.packages.find(p => p.id === topic.package);
        if (pkg) {
          reply = this.formatPackageInclusions(pkg, division);
          lead.interest_area = `${division.name} - ${pkg.name}`;
        }
      }
    }
    // "Both packages" or multiple requested
    else if (includeMultiple && topic.division) {
      const division = PRICING_DATA[topic.division];
      if (division) {
        reply = this.formatAllPackagesInclusions(division);
        lead.interest_area = division.name;
      }
    }
    // Division only - list all packages briefly
    else if (topic.division) {
      const division = PRICING_DATA[topic.division];
      if (division) {
        reply = this.formatDivisionInclusions(division);
        lead.interest_area = division.name;
      }
    }
    // No clear topic
    else {
      reply = "Which package would you like details on? Let me know the division (Studios/Code/VIP) and I'll share what's included!";
    }

    return { reply, lead };
  }

  /**
   * Format pricing for a single package
   */
  private formatPackagePricing(pkg: Package, division: Division): string {
    const basePrice = formatPrice(pkg.price, pkg.recurring);

    let response = `${pkg.name}: ${basePrice}`;

    if (pkg.optional_support) {
      const supportPrice = formatPrice(pkg.optional_support.price, pkg.optional_support.recurring);
      response += `\nOptional: ${supportPrice} (${pkg.optional_support.description})`;
    }

    return response;
  }

  /**
   * Format pricing for all packages in a division
   */
  private formatDivisionPricing(division: Division): string {
    let response = `${division.name} pricing:\n`;

    division.packages.forEach(pkg => {
      const price = formatPrice(pkg.price, pkg.recurring);
      response += `- ${pkg.name}: ${price}\n`;
    });

    return response.trim();
  }

  /**
   * Format inclusions for a single package
   */
  private formatPackageInclusions(pkg: Package, division: Division): string {
    let response = `${pkg.name} includes:\n`;

    pkg.inclusions.forEach(item => {
      response += `- ${item}\n`;
    });

    return response.trim();
  }

  /**
   * Format inclusions for all packages in a division
   */
  private formatAllPackagesInclusions(division: Division): string {
    let response = '';

    division.packages.forEach((pkg, index) => {
      if (index > 0) response += '\n\n';

      response += `${pkg.name}:\n`;
      pkg.inclusions.forEach(item => {
        response += `- ${item}\n`;
      });
    });

    return response.trim();
  }

  /**
   * Format brief inclusions overview for a division
   */
  private formatDivisionInclusions(division: Division): string {
    let response = `${division.name} packages:\n`;

    division.packages.forEach(pkg => {
      const topInclusions = pkg.inclusions.slice(0, 2).join(', ');
      response += `- ${pkg.name}: ${topInclusions}\n`;
    });

    return response.trim();
  }

  /**
   * Estimate budget range based on package price
   */
  private estimateBudgetRange(pkg: Package): string | undefined {
    if (pkg.price === 'custom') {
      return 'custom';
    }

    if (typeof pkg.price === 'number') {
      if (pkg.price < 500) {
        return '<$500';
      } else if (pkg.price < 1000) {
        return '$500-1K';
      } else if (pkg.price < 2000) {
        return '$1K-2K';
      } else if (pkg.price < 5000) {
        return '$2K-5K';
      } else {
        return '$5K+';
      }
    }

    return undefined;
  }
}
