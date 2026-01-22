import OpenAI from 'openai';
import { config, SYSTEM_PROMPT } from '../config';
import { OpenAIChatMessage, Lead, Message } from '../types';
import { KnowledgeService } from './knowledge.service';

export class OpenAIService {
  private client: OpenAI;
  private knowledgeService: KnowledgeService;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.knowledgeService = new KnowledgeService();
  }

  /**
   * Generate a chat completion with lead extraction
   */
  async generateChatCompletion(
    messages: Message[],
    userMessage: string,
    existingLead?: Lead | null
  ): Promise<{ reply: string; lead: Lead | null }> {
    try {
      // Build conversation history for OpenAI
      const chatMessages: OpenAIChatMessage[] = [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
      ];

      // Retrieve and inject relevant knowledge documents
      const relevantDocs = this.knowledgeService.retrieveRelevant(userMessage, 2);
      if (relevantDocs.length > 0) {
        const knowledgeContent = this.knowledgeService.formatForPrompt(relevantDocs);
        chatMessages.push({
          role: 'system',
          content: knowledgeContent,
        });
        console.log(`[OpenAI] Injected ${relevantDocs.length} knowledge documents into context`);
      }

      // Inject existing lead context if available
      if (existingLead) {
        const leadFields: string[] = [];
        if (existingLead.name) leadFields.push(`- name: ${existingLead.name}`);
        if (existingLead.email) leadFields.push(`- email: ${existingLead.email}`);
        if (existingLead.phone) leadFields.push(`- phone: ${existingLead.phone}`);
        if (existingLead.interest_area) leadFields.push(`- interest_area: ${existingLead.interest_area}`);
        if (existingLead.budget_range) leadFields.push(`- budget_range: ${existingLead.budget_range}`);
        if (existingLead.business_type) leadFields.push(`- business_type: ${existingLead.business_type}`);
        if (existingLead.company_name) leadFields.push(`- company_name: ${existingLead.company_name}`);
        if (existingLead.preferred_contact_channel) leadFields.push(`- preferred_contact_channel: ${existingLead.preferred_contact_channel}`);

        if (leadFields.length > 0) {
          chatMessages.push({
            role: 'system',
            content: `KNOWN LEAD INFO (from database - DO NOT ask for these again):
${leadFields.join('\n')}

CRITICAL: You already have this information. DO NOT ask for any of these fields again. Use this info in your replies when relevant.`,
          });
        }
      }

      // Add recent conversation history
      for (const msg of messages) {
        chatMessages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }

      // Add the latest user message
      chatMessages.push({
        role: 'user',
        content: userMessage,
      });

      // Call OpenAI API
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Using gpt-4o-mini for cost efficiency; can change to gpt-4o if needed
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const responseContent = completion.choices[0]?.message?.content || '';

      // Parse the response to extract reply and lead JSON
      const { reply, lead } = this.parseResponse(responseContent);

      return { reply, lead };
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate chat completion: ${error.message}`);
    }
  }

  /**
   * Parse the OpenAI response to extract user-facing reply and LEAD_JSON
   */
  private parseResponse(content: string): { reply: string; lead: Lead | null } {
    // Look for LEAD_JSON: marker
    const leadJsonMatch = content.match(/LEAD_JSON:\s*(\{[\s\S]*?\})/);

    let reply = content;
    let lead: Lead | null = null;

    if (leadJsonMatch) {
      // Extract and parse the JSON
      const leadJsonString = leadJsonMatch[1];
      console.log('[OpenAI] Found LEAD_JSON:', leadJsonString.substring(0, 100) + '...');
      try {
        lead = JSON.parse(leadJsonString);
        console.log('[OpenAI] Successfully parsed LEAD_JSON with', Object.keys(lead || {}).filter(k => (lead as any)[k] !== null).length, 'non-null fields');
      } catch (error) {
        console.error('[OpenAI] Failed to parse LEAD_JSON:', error);
        console.error('[OpenAI] Raw JSON string:', leadJsonString);
      }

      // Remove the LEAD_JSON block from the reply
      reply = content.replace(/LEAD_JSON:\s*\{[\s\S]*?\}/g, '').trim();
    } else {
      console.warn('[OpenAI] WARNING: Response did not contain LEAD_JSON (model may not be following instructions)');
      console.warn('[OpenAI] Response preview:', content.substring(0, 200));
    }

    return { reply, lead };
  }
}
