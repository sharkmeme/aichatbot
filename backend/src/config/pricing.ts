/**
 * Bunny Honey Pricing & Offers Configuration
 * Single source of truth for pricing information
 * Used by the chatbot to provide accurate pricing guidance
 */

export interface ServicePricing {
  name: string;
  description: string;
  priceRange?: string;
  pricingModel: string;
  details: string[];
}

export const pricingConfig: Record<string, ServicePricing> = {
  aiContent: {
    name: 'AI Content Creation & Automation',
    description: 'Automated content workflows, blog posts, social media, SEO content',
    pricingModel: 'Custom project-based pricing',
    details: [
      'We create custom offers based on your content needs and volume',
      'Pricing depends on content type, frequency, and automation complexity',
      'Typical projects start from a few hundred euros per month',
      'One-time setup fees may apply for complex automation workflows',
    ],
  },

  workflowAutomation: {
    name: 'Workflow Automation (n8n & Tools)',
    description: 'Business process automation, integrations, n8n workflows',
    pricingModel: 'Project-based with optional maintenance',
    details: [
      'Custom pricing based on workflow complexity and integrations needed',
      'We offer fixed-price projects or monthly retainers',
      'Small automations can start from a few hundred euros',
      'Complex enterprise workflows are priced individually',
      'Optional: Monthly maintenance and support packages available',
    ],
  },

  aiWebsites: {
    name: 'AI Websites & Custom Software',
    description: 'AI-powered websites, chatbots, custom applications',
    pricingModel: 'Custom project-based pricing',
    details: [
      'Pricing varies significantly based on scope and features',
      'Simple AI chatbot integrations start lower than full custom platforms',
      'We provide detailed proposals after understanding your requirements',
      'Development timeline typically 2-8 weeks depending on complexity',
    ],
  },

  consultancy: {
    name: 'AI Consultancy & Workshops',
    description: 'Strategy sessions, team training, AI implementation guidance',
    pricingModel: 'Hourly or day-rate based',
    details: [
      'We offer both hourly consulting and full-day workshop sessions',
      'Pricing provided upon request based on your specific needs',
      'Remote and on-site options available',
      'Custom training programs for teams',
    ],
  },
};

/**
 * General pricing guidelines for the chatbot
 */
export const pricingGuidelines = {
  approach: 'We provide custom offers tailored to each project. No two projects are the same, so we prefer to understand your needs first before providing detailed pricing.',

  budgetRanges: {
    description: 'Typical budget ranges to help with planning',
    small: 'Under €1,000 - Small automations, simple chatbot integrations, single workshops',
    medium: '€1,000 - €5,000 - Content automation systems, multi-step workflows, custom integrations',
    large: '€5,000 - €20,000 - Complex AI applications, comprehensive automation suites, ongoing partnerships',
    enterprise: '€20,000+ - Large-scale platforms, enterprise integrations, long-term strategic partnerships',
  },

  whatAffectsPricing: [
    'Complexity and scope of the project',
    'Number of integrations required',
    'Timeline and urgency',
    'Level of customization needed',
    'Ongoing support and maintenance requirements',
  ],

  nextSteps: 'Share your project details and budget range, and we\'ll create a custom proposal for you.',
};

/**
 * Helper function to get pricing info for a service
 */
export function getPricingInfo(serviceKey: string): ServicePricing | null {
  return pricingConfig[serviceKey] || null;
}

/**
 * Helper function to format pricing information for the chatbot
 */
export function formatPricingResponse(serviceKey: string): string {
  const service = getPricingInfo(serviceKey);

  if (!service) {
    return pricingGuidelines.approach + ' ' + pricingGuidelines.nextSteps;
  }

  let response = `**${service.name}**\n\n`;
  response += `${service.description}\n\n`;
  response += `**Pricing Model:** ${service.pricingModel}\n\n`;

  if (service.priceRange) {
    response += `**Range:** ${service.priceRange}\n\n`;
  }

  if (service.details.length > 0) {
    response += `**Details:**\n`;
    service.details.forEach(detail => {
      response += `- ${detail}\n`;
    });
  }

  return response;
}
