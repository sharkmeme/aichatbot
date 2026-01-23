/**
 * Bunny Honey Company Profile
 * Single source of truth for company info, services, and positioning
 */

export const companyProfile = {
  name: 'Bunny Honey',
  tagline: 'Playful AI agency that builds serious results.',
  positioning: 'AI content, automations, and AI-powered products for brands and creators.',
  targetClients: ['brands', 'agencies', 'creators', 'online businesses'],
  geography: 'Remote, working with EU, US and Asia clients.',
  toneNotes: 'Practical, no-bullshit, but friendly.',

  coreServices: [
    {
      id: 'Studios',
      name: 'AI Content & Automation',
      description: 'Content systems for social media, blogs, SEO, faceless channels, etc.',
      examples: [
        'YouTube & TikTok automation for faceless channels',
        'AI content pipelines for Instagram, Reels, Shorts',
      ],
    },
    {
      id: 'Bunny Code',
      name: 'Workflow Automations',
      description: 'n8n-based automations for outreach, lead gen, back-office.',
      examples: [
        'Outreach automations for LinkedIn & email',
        'CRM integrations & data sync automation',
      ],
    },
    {
      id: 'Honey Software',
      name: 'AI Websites & Software',
      description: 'AI-powered landing pages, chatbots, internal tools and SaaS prototypes.',
      examples: [
        'Custom dashboards for content and trading',
        'Custom SaaS MVPs with AI features',
      ],
    },
    {
      id: 'VIP Club & Strategy',
      name: 'AI Consulting & Workshops',
      description: 'Strategy, playbooks, and training for teams.',
      examples: [
        'Workshops on AI content systems',
        'Custom AI playbooks for specific industries',
      ],
    },
  ],
};

/**
 * Get service by ID
 */
export function getServiceById(serviceId: string) {
  return companyProfile.coreServices.find(s => s.id === serviceId);
}

/**
 * Get all service names
 */
export function getServiceNames(): string[] {
  return companyProfile.coreServices.map(s => s.name);
}

/**
 * Get all service examples (useful for context)
 */
export function getAllExamples(): string[] {
  return companyProfile.coreServices.flatMap(s => s.examples);
}
