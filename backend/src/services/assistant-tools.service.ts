import { PRICING_DATA, formatPrice } from '../data/pricing';
import { KnowledgeService } from './knowledge.service';
import { fuzzyMatch, similarityScore } from '../utils/fuzzy';
import { config } from '../config';

/**
 * Tool outputs for LLM assistant
 * All tools return pure JSON data (no prose)
 */

interface PackageCandidate {
  division: string;
  package?: string;
  label: string;
  score: number;
}

interface PackageDetails {
  division: { id: string; name: string };
  package: {
    id: string;
    name: string;
    price: number | 'custom';
    recurring?: string;
    optional_support?: any;
    inclusions?: string[];
  };
  display: {
    price: string;
    optional_support?: string;
  };
  allowed_prices: number[];
}

interface DivisionPackages {
  division: { id: string; name: string };
  packages: Array<{
    id: string;
    name: string;
    price: number | 'custom';
    recurring?: string;
    optional_support?: any;
    inclusions?: string[];
    display_price: string;
  }>;
  allowed_prices: number[];
}

interface KBSearchResult {
  docs: Array<{
    title: string;
    snippet: string;
  }>;
}

interface ContactButtons {
  buttons: {
    meeting: string;
    whatsapp: string;
    telegram: string;
    contact_form: string;
    call_us: string;
  };
}

interface CompanyInfo {
  legal_entity: string;
  jurisdiction: string;
  operating_mode: string;
  serving_regions: string[];
  website: string;
}

/**
 * Package and division synonyms for fuzzy matching
 */
const SYNONYMS: Record<string, string[]> = {
  'lead-intake-crm': ['crm', 'crm system', 'lead intake', 'lead crm', 'customer relationship', 'lead management', 'leads', 'lead capture', 'lead gen', 'lead generation', 'intake'],
  'ai-outreach': ['outreach', 'ai outreach', 'follow up', 'followup', 'outreach system', 'follow-up'],
  'support-ticket': ['ticket', 'support ticket', 'ticketing', 'ticket system', 'support', 'helpdesk', 'tickets', 'help desk'],
  'chat-assistant': ['chatbot', 'chat assistant', 'chat bot', 'website chat', 'chat', 'live chat'],
  'phone-support': ['phone', 'phone support', 'call support', 'voice', 'voice assistant', 'calling', 'call assistant', 'phone assistant'],
  'content-engine': ['content engine', 'pipeline', 'engine', 'content', 'automation', 'ontent engine'],
  'studio-partner': ['studio partner', 'partner', 'studios partner', 'partnership'],
  'starter': ['starter', 'start', 'basic'],
  'growth': ['growth', 'grow', 'scale'],
  'masterminds': ['masterminds', 'mastermind', 'group coaching', 'group', 'community'],
  'fast-track': ['fast track', 'fast-track', '1 on 1', 'one on one', 'coaching', '1-on-1', 'private'],
  'studios': ['studios', 'video', 'content creation', 'production', 'video production'],
  'vip': ['vip', 'club', 'coaching', 'workshop', 'mentorship'],
  'code': ['code', 'bunny code', 'automation', 'software', 'custom'],
  'software': ['software', 'honey software', 'saas', 'platform']
};

export class AssistantToolsService {
  private knowledgeService: KnowledgeService;

  constructor() {
    this.knowledgeService = new KnowledgeService();
  }

  /**
   * Search for packages/divisions with typo tolerance
   */
  search_packages(query: string): { candidates: PackageCandidate[] } {
    const normalized = query.toLowerCase().trim().replace(/[^\w\s]/g, ' ');
    const candidates: PackageCandidate[] = [];

    // Search divisions
    for (const [divisionId, divisionData] of Object.entries(PRICING_DATA)) {
      const divisionSynonyms = SYNONYMS[divisionId] || [divisionId];

      for (const synonym of divisionSynonyms) {
        const score = similarityScore(normalized, synonym);
        if (score > 0.6) {
          candidates.push({
            division: divisionId,
            label: divisionData.name,
            score
          });
        }
      }

      // Search packages within division
      for (const pkg of divisionData.packages) {
        const packageSynonyms = SYNONYMS[pkg.id] || [pkg.id, pkg.name.toLowerCase()];

        for (const synonym of packageSynonyms) {
          const score = similarityScore(normalized, synonym);
          if (score > 0.6) {
            candidates.push({
              division: divisionId,
              package: pkg.id,
              label: `${divisionData.name} - ${pkg.name}`,
              score
            });
          }
        }
      }
    }

    // Sort by score descending and take top 5
    candidates.sort((a, b) => b.score - a.score);
    return { candidates: candidates.slice(0, 5) };
  }

  /**
   * Get detailed package information
   */
  get_package(division: string, packageId: string): PackageDetails | null {
    const divisionData = PRICING_DATA[division];
    if (!divisionData) return null;

    const pkg = divisionData.packages.find(p => p.id === packageId);
    if (!pkg) return null;

    const allowed_prices: number[] = [];
    if (typeof pkg.price === 'number') {
      allowed_prices.push(pkg.price);
    }
    if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
      allowed_prices.push(pkg.optional_support.price);
    }

    return {
      division: {
        id: division,
        name: divisionData.name
      },
      package: {
        id: pkg.id,
        name: pkg.name,
        price: pkg.price,
        recurring: pkg.recurring,
        optional_support: pkg.optional_support,
        inclusions: pkg.inclusions
      },
      display: {
        price: formatPrice(pkg.price, pkg.recurring),
        optional_support: pkg.optional_support
          ? formatPrice(pkg.optional_support.price, pkg.optional_support.recurring)
          : undefined
      },
      allowed_prices
    };
  }

  /**
   * List all packages in a division
   */
  list_division_packages(division: string): DivisionPackages | null {
    const divisionData = PRICING_DATA[division];
    if (!divisionData) return null;

    const allowed_prices: number[] = [];
    const packages = divisionData.packages.map(pkg => {
      if (typeof pkg.price === 'number') {
        allowed_prices.push(pkg.price);
      }
      if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
        allowed_prices.push(pkg.optional_support.price);
      }

      return {
        id: pkg.id,
        name: pkg.name,
        price: pkg.price,
        recurring: pkg.recurring,
        optional_support: pkg.optional_support,
        inclusions: pkg.inclusions,
        display_price: formatPrice(pkg.price, pkg.recurring)
      };
    });

    return {
      division: {
        id: division,
        name: divisionData.name
      },
      packages,
      allowed_prices
    };
  }

  /**
   * Search knowledge base
   */
  search_kb(query: string, topK: number = 3): KBSearchResult {
    const results = this.knowledgeService.retrieveRelevant(query, topK);

    return {
      docs: results.map(doc => ({
        title: doc.title,
        snippet: doc.content.substring(0, 300) + (doc.content.length > 300 ? '...' : '')
      }))
    };
  }

  /**
   * Get contact button tokens
   */
  get_contact_buttons(): ContactButtons {
    return {
      buttons: {
        meeting: '{{BTN_MEETING}}',
        whatsapp: '{{BTN_WHATSAPP}}',
        telegram: '{{BTN_TELEGRAM}}',
        contact_form: '{{BTN_CONTACT_FORM}}',
        call_us: '{{BTN_CALL_US}}'
      }
    };
  }

  /**
   * Get deterministic company information
   * Use this for legal, location, and company structure questions
   */
  get_company_info(): CompanyInfo {
    return {
      legal_entity: 'SRL under Romanian law',
      jurisdiction: 'Romania (EU)',
      operating_mode: 'Remote',
      serving_regions: ['EU', 'US', 'Asia'],
      website: config.contactWebsite
    };
  }

  /**
   * Execute a tool by name
   */
  executeTool(toolName: string, args: any): any {
    console.log('[Tools] Executing:', toolName, 'Args:', JSON.stringify(args));

    try {
      let result: any;

      switch (toolName) {
        case 'search_packages':
          result = this.search_packages(args.query);
          console.log('[Tools] search_packages result:', result.candidates.length, 'candidates');
          break;

        case 'get_package':
          result = this.get_package(args.division, args.package);
          if (result) {
            console.log('[Tools] get_package result:', result.package.name, 'allowed_prices:', result.allowed_prices);
          } else {
            console.log('[Tools] get_package result: null (not found)');
          }
          break;

        case 'list_division_packages':
          result = this.list_division_packages(args.division);
          if (result) {
            console.log('[Tools] list_division_packages result:', result.packages.length, 'packages, allowed_prices:', result.allowed_prices);
          } else {
            console.log('[Tools] list_division_packages result: null (division not found)');
          }
          break;

        case 'search_kb':
          result = this.search_kb(args.query, args.topK || 3);
          console.log('[Tools] search_kb result:', result.docs.length, 'docs');
          break;

        case 'get_contact_buttons':
          result = this.get_contact_buttons();
          console.log('[Tools] get_contact_buttons result: 5 buttons');
          break;

        case 'get_company_info':
          result = this.get_company_info();
          console.log('[Tools] get_company_info result:', result.legal_entity, result.jurisdiction);
          break;

        default:
          console.error('[Tools] Unknown tool:', toolName);
          return { error: `Unknown tool: ${toolName}` };
      }

      return result;
    } catch (error) {
      console.error('[Tools] Error executing', toolName, ':', error);
      return { error: String(error) };
    }
  }
}
