import OpenAI from 'openai';
import { config, SYSTEM_PROMPT } from '../config';
import { OpenAIChatMessage, Lead, Message } from '../types';

export class OpenAIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Generate a chat completion with lead extraction
   */
  async generateChatCompletion(
    messages: Message[],
    userMessage: string
  ): Promise<{ reply: string; lead: Lead | null }> {
    try {
      // Build conversation history for OpenAI
      const chatMessages: OpenAIChatMessage[] = [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
      ];

      // Add recent conversation history (last 10 messages)
      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
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
      try {
        lead = JSON.parse(leadJsonString);
      } catch (error) {
        console.error('Failed to parse LEAD_JSON:', error);
        console.error('Lead JSON string:', leadJsonString);
      }

      // Remove the LEAD_JSON block from the reply
      reply = content.replace(/LEAD_JSON:\s*\{[\s\S]*?\}/g, '').trim();
    }

    return { reply, lead };
  }
}
