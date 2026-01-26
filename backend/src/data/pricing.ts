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
          '10 videos per month',
          '1–2 min runtime',
          'AI voiceovers + visuals',
          'Basic editing'
        ]
      },
      {
        id: 'growth',
        name: 'Growth',
        price: 1500,
        recurring: 'monthly',
        inclusions: [
          '30 videos per month',
          '2–5 min runtime',
          'Advanced editing + effects',
          'Thumbnail design'
        ]
      },
      {
        id: 'content-engine',
        name: 'Content Engine',
        price: 3500,
        recurring: 'monthly',
        optional_support: {
          price: 1000,
          recurring: 'monthly',
          description: 'Content management + performance reports'
        },
        inclusions: [
          '100+ videos per month',
          '2–10 min runtime',
          'Full production pipeline',
          'Multi-platform optimization',
          'Dedicated account manager'
        ]
      },
      {
        id: 'studio-partner',
        name: 'Studio Partner',
        price: 'custom',
        recurring: 'monthly',
        inclusions: [
          'Custom video volume',
          'White-label options',
          'Priority support',
          'Custom workflows'
        ]
      }
    ]
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
          'Tutorials, prompt libraries, community',
          'Access to all workshops & trainings',
          'Monthly group Q&A calls'
        ]
      },
      {
        id: 'fast-track',
        name: 'Fast Track',
        price: 149,
        recurring: 'monthly',
        inclusions: [
          'Weekly 1:1 coaching sessions',
          'Personal AI strategy consultation',
          'Priority access to new tools',
          'Everything in Masterminds'
        ]
      }
    ]
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
          description: 'Updates, tweaks, and support'
        },
        inclusions: [
          'Multi-source lead capture (forms, ads, landing pages)',
          'Automated lead scoring',
          'CRM sync (HubSpot, Pipedrive, etc.)',
          'Lead routing to sales team'
        ]
      },
      {
        id: 'ai-outreach',
        name: 'AI Outreach & Follow-Up System',
        price: 1350,
        recurring: 'one-time',
        optional_support: {
          price: 550,
          recurring: 'monthly',
          description: 'Campaign management + optimization'
        },
        inclusions: [
          'Personalized cold email sequences',
          'LinkedIn outreach automation',
          'AI-powered reply detection',
          'Follow-up scheduling based on engagement'
        ]
      },
      {
        id: 'support-ticket',
        name: 'Client Support Ticket Automation',
        price: 950,
        recurring: 'one-time',
        optional_support: {
          price: 299,
          recurring: 'monthly',
          description: 'Updates and support'
        },
        inclusions: [
          'Email-to-ticket automation',
          'Smart routing by priority',
          'Category detection',
          'Auto-responses for common issues'
        ]
      },
      {
        id: 'chat-assistant',
        name: 'AI Customer Chat Assistant',
        price: 1750,
        recurring: 'one-time',
        optional_support: {
          price: 550,
          recurring: 'monthly',
          description: 'Updates, training, and support'
        },
        inclusions: [
          'Website chatbot integration',
          'Multi-platform support (Telegram, WhatsApp, Instagram)',
          'FAQ automation + lead qualification',
          'CRM integration'
        ]
      },
      {
        id: 'phone-support',
        name: 'AI Customer Phone Support',
        price: 2750,
        recurring: 'one-time',
        optional_support: {
          price: 850,
          recurring: 'monthly',
          description: 'Voice model updates and support'
        },
        inclusions: [
          'AI voice assistant setup',
          'Call routing logic',
          'Call summaries + transcription',
          'Automated CRM updates from calls'
        ]
      }
    ]
  }
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
    return priceStr;
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
