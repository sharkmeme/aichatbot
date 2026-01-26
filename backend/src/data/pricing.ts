/**
 * Single Source of Truth for Bunny Honey Pricing
 * All prices in USD, VAT excluded
 *
 * CRITICAL: This is the ONLY place where prices should be defined.
 * The LLM should NEVER generate prices - all prices must come from this file.
 */

export interface Package {
  id: string;
  name: string;
  price: number | 'custom';
  recurring?: 'monthly' | 'one-time';
  optional_support?: {
    price: number;
    recurring: 'monthly';
    description: string;
  };
  inclusions: string[];
}

export interface Division {
  id: string;
  name: string;
  packages: Package[];
}

export const PRICING_DATA: Record<string, Division> = {
  studios: {
    id: 'studios',
    name: 'Bunny Honey Studios',
    packages: [
      {
        id: 'starter',
        name: 'Starter',
        price: 500,
        recurring: 'monthly',
        inclusions: [
          'Up to 5 AI videos/month (up to 8 min total runtime)',
          'Shared creative direction (no custom brand system)',
          'Multiple formats (ads/shorts/visuals)',
          'Delivery in 5–7 days',
        ],
      },
      {
        id: 'growth',
        name: 'Growth',
        price: 1500,
        recurring: 'monthly',
        inclusions: [
          'Up to 45 min total runtime',
          'Up to 25 AI videos (short or long)',
          'Brand-specific visual style',
          'Dedicated content manager + priority delivery',
        ],
      },
      {
        id: 'content-engine',
        name: 'Content Engine',
        price: 3500,
        recurring: 'one-time',
        optional_support: {
          price: 1000,
          recurring: 'monthly',
          description: 'Active Optimization & Support Retainer (optional)',
        },
        inclusions: [
          'Complete custom pipeline build (architecture + integration)',
          'Prompt engineering + brand voice tuning',
          'Client-owned API keys (direct billing)',
          'Team handover/training + auto-posting integrations',
        ],
      },
      {
        id: 'studio-partner',
        name: 'Studio Partner',
        price: 'custom',
        recurring: 'monthly',
        inclusions: [
          'Dedicated AI studio team + unlimited production scope',
          'Custom workflows & pipelines',
          'Brand IP & style system ownership',
          'Optional white-label production',
        ],
      },
    ],
  },

  vip: {
    id: 'vip',
    name: 'VIP Club',
    packages: [
      {
        id: 'masterminds',
        name: 'Masterminds',
        price: 49,
        recurring: 'monthly',
        inclusions: [
          'Access to all workshops & trainings',
          'Step-by-step tutorials (AI tools, systems, workflows)',
          'Prompt libraries + practical frameworks',
          'Private community + new content added regularly',
        ],
      },
      {
        id: 'fast-track',
        name: 'Fast Track',
        price: 149,
        recurring: 'monthly',
        inclusions: [
          'Weekly 1:1 coaching sessions',
          'Personalized execution plans',
          'Direct feedback on systems/offers/strategies',
          'Private communication channel',
        ],
      },
    ],
  },

  code: {
    id: 'code',
    name: 'Bunny Code (Pre-Built Automations)',
    packages: [
      {
        id: 'lead-intake-crm',
        name: 'Lead Intake & CRM Automation',
        price: 950,
        recurring: 'one-time',
        optional_support: {
          price: 299,
          recurring: 'monthly',
          description: 'Active Optimization & Support (optional)',
        },
        inclusions: [
          'Lead capture from forms/ads/landing pages',
          'CRM creation & enrichment + lead scoring rules',
          'Team notifications (Slack/Email)',
          'Basic follow-up trigger',
        ],
      },
      {
        id: 'ai-outreach',
        name: 'AI Outreach & Follow-Up System',
        price: 1350,
        recurring: 'one-time',
        optional_support: {
          price: 550,
          recurring: 'monthly',
          description: 'Active Optimization & Support (optional)',
        },
        inclusions: [
          'AI-generated personalized messages + multi-step follow-ups',
          'Reply detection & routing',
          'CRM updates',
          'Stop rules to avoid spam',
        ],
      },
      {
        id: 'support-ticket',
        name: 'Client Support Ticket Automation',
        price: 950,
        recurring: 'one-time',
        optional_support: {
          price: 299,
          recurring: 'monthly',
          description: 'Active Optimization & Support (optional)',
        },
        inclusions: [
          'Ticket creation from email/forms/chat',
          'Priority + category detection',
          'Assignment based on rules',
          'Notifications + status syncing',
        ],
      },
      {
        id: 'chat-assistant',
        name: 'AI Customer Chat Assistant',
        price: 1750,
        recurring: 'one-time',
        optional_support: {
          price: 550,
          recurring: 'monthly',
          description: 'Active Optimization & Support (optional)',
        },
        inclusions: [
          'Website/Telegram/WhatsApp/Instagram chatbot',
          'Trained on your FAQs/services/docs',
          'Lead capture + qualification',
          'Human handoff + 24/7 coverage',
        ],
      },
      {
        id: 'phone-support',
        name: 'AI Customer Phone Support',
        price: 2750,
        recurring: 'one-time',
        optional_support: {
          price: 850,
          recurring: 'monthly',
          description: 'Active Optimization & Support (optional)',
        },
        inclusions: [
          'AI phone assistant + custom call flow',
          'Voice-based FAQ/service handling',
          'Call routing',
          'Call summaries + CRM updates',
        ],
      },
    ],
  },
};


/**
 * Find a package by ID across all divisions
 */
export function findPackage(packageId: string): { division: Division; package: Package } | null {
  for (const division of Object.values(PRICING_DATA)) {
    const pkg = division.packages.find(p => p.id === packageId);
    if (pkg) {
      return { division, package: pkg };
    }
  }
  return null;
}

/**
 * Find packages by division ID
 */
export function getPackagesByDivision(divisionId: string): Package[] | null {
  const division = PRICING_DATA[divisionId];
  return division ? division.packages : null;
}

/**
 * Format price for display
 */
export function formatPrice(price: number | 'custom', recurring?: string): string {
  if (price === 'custom') {
    return 'Custom pricing';
  }

  const priceStr = `$${price.toLocaleString()}`;

  if (recurring === 'monthly') {
    return `${priceStr}/month`;
  } else if (recurring === 'one-time') {
    return `${priceStr} (one-time)`;
  }

  return priceStr;
}

/**
 * Get all valid price amounts (for hallucination detection)
 */
export function getAllValidPrices(): number[] {
  const prices: number[] = [];

  for (const division of Object.values(PRICING_DATA)) {
    for (const pkg of division.packages) {
      if (typeof pkg.price === 'number') {
        prices.push(pkg.price);
      }
      if (pkg.optional_support) {
        prices.push(pkg.optional_support.price);
      }
    }
  }

  return [...new Set(prices)]; // Remove duplicates
}
