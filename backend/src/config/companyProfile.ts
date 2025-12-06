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
      id: 'ai_content',
      name: 'AI Content & Automation',
      description: 'Content systems for social media, blogs, SEO, faceless channels, etc.',
      examples: [
        'YouTube & TikTok automation for faceless channels',
        'AI content pipelines for Instagram, Reels, Shorts',
        'Long-form → short-form repurposing workflows',
        'Automated blog & SEO content generation',
        'AI-powered social media scheduling & posting',
      ],
    },
    {
      id: 'automations',
      name: 'Workflow Automations',
      description: 'n8n-based automations for outreach, lead gen, back-office.',
      examples: [
        'Telegram HR bots for recruiting & onboarding',
        'Lead collection & scoring workflows',
        'Outreach automations for LinkedIn & email',
        'CRM integrations & data sync automation',
        'Automated reporting & analytics dashboards',
      ],
    },
    {
      id: 'ai_websites',
      name: 'AI Websites & Software',
      description: 'AI-powered landing pages, chatbots, internal tools and SaaS prototypes.',
      examples: [
        'AI chat support on Webflow sites',
        'Custom dashboards for content and trading',
        'Internal tools for agencies',
        'AI-powered lead qualification chatbots',
        'Custom SaaS MVPs with AI features',
      ],
    },
    {
      id: 'consulting',
      name: 'AI Consulting & Workshops',
      description: 'Strategy, playbooks, and training for teams.',
      examples: [
        'Workshops on AI content systems',
        'Consulting on automation architecture',
        '1:1 guidance for founders',
        'AI strategy for marketing teams',
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
