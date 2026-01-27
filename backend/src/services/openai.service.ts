import OpenAI from 'openai';
import { config, SYSTEM_PROMPT } from '../config';
import { OpenAIChatMessage, Lead, Message } from '../types';
import { KnowledgeService } from './knowledge.service';
import { ConversationTopic } from './intent.service';
import { AssistantToolsService } from './assistant-tools.service';

export class OpenAIService {
  private client: OpenAI;
  private knowledgeService: KnowledgeService;
  private toolsService: AssistantToolsService;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.knowledgeService = new KnowledgeService();
    this.toolsService = new AssistantToolsService();
  }

  /**
   * Tool definitions for OpenAI function calling
   */
  private getToolDefinitions() {
    return [
      {
        type: 'function' as const,
        function: {
          name: 'search_packages',
          description: 'Search for packages/divisions by name or description. Handles typos and synonyms. Use this when user asks about a product/service but you need to identify which one.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "crm", "outreach", "content engine")'
              }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'get_package',
          description: 'Get detailed information about a specific package including price, inclusions, and allowed prices. MUST use this to get pricing information - never invent prices.',
          parameters: {
            type: 'object',
            properties: {
              division: {
                type: 'string',
                description: 'Division ID (studios, vip, code, software)'
              },
              package: {
                type: 'string',
                description: 'Package ID (e.g., "lead-intake-crm", "ai-outreach", "content-engine")'
              }
            },
            required: ['division', 'package']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'list_division_packages',
          description: 'List all packages in a division with prices and details. Use when user asks to compare packages or see what\'s available in a division.',
          parameters: {
            type: 'object',
            properties: {
              division: {
                type: 'string',
                description: 'Division ID (studios, vip, code, software)'
              }
            },
            required: ['division']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'search_kb',
          description: 'Search the knowledge base for information about services, processes, or general questions.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              },
              topK: {
                type: 'number',
                description: 'Number of results to return (default 3)'
              }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'get_contact_buttons',
          description: 'Get the contact button tokens to show user when they want to move forward. Returns button markers that should be included in your response.',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'set_state',
          description: 'Set conversation state (intent, topic, pending question). Use this INSTEAD of writing STATE_JSON in your text response. This keeps state updates clean and separate from user-facing messages.',
          parameters: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                description: 'Current conversation intent (pricing, inclusions, buy, general_question, etc.)'
              },
              topic: {
                type: 'object',
                description: 'Current conversation topic',
                properties: {
                  division: {
                    type: 'string',
                    description: 'Division ID if known'
                  },
                  package: {
                    type: 'string',
                    description: 'Package ID if known'
                  }
                }
              },
              pending_question: {
                type: 'object',
                description: 'Pending question awaiting user response',
                properties: {
                  topic: {
                    type: 'object',
                    description: 'Topic for the pending question'
                  },
                  question_type: {
                    type: 'string',
                    description: 'Type of question (pricing_or_inclusions, etc.)'
                  }
                }
              }
            },
            required: []
          }
        }
      }
    ];
  }

  /**
   * Generate a chat completion with tool calling support
   */
  async generateChatCompletionWithTools(
    messages: Message[],
    userMessage: string,
    existingLead?: Lead | null,
    state?: {
      topic?: ConversationTopic;
      pendingLeadField?: string | null;
      pendingQuestion?: any | null;
      lastIntent?: string | null;
      requestedPackages?: string[] | null;
    }
  ): Promise<{
    reply: string;
    lead: Lead | null;
    stateUpdate?: any;
    toolContext?: {
      allowed_prices: number[];
      listed_division_packages?: { division: string; packages: string[] } | null;
    };
  }> {
    try {
      console.log('[LLM] Starting tool-calling chat completion');

      // Build system prompt with grounding rules
      const systemPrompt = `${SYSTEM_PROMPT}

CRITICAL RULES FOR TOOL USAGE:
1. ALWAYS call tools when user asks about pricing, inclusions, features, or comparisons
2. NEVER invent prices or features - ONLY use data from tool outputs
3. When discussing pricing, ALWAYS call get_package or list_division_packages first
4. If user asks to "buy" or "get this", confirm what package they mean (use search_packages if unclear), then tell them we'll collect their information

FORMATTING RULES:
- Use the exact price format from tool outputs (includes "one-time" or "/month")
- When showing contact options, use the exact button tokens from get_contact_buttons()
- Never claim "I will contact you on Telegram/WhatsApp" - only say "Tap the X button below"

OUTPUT FORMAT:
End your response with:
LEAD_JSON: {JSON object with any lead fields you extracted}
STATE_JSON: {JSON object with topic, pending_question if any, intent}

Example STATE_JSON:
{
  "topic": {"division": "code", "package": "lead-intake-crm"},
  "pending_question": null,
  "intent": "pricing"
}`;

      const chatMessages: OpenAIChatMessage[] = [
        { role: 'system', content: systemPrompt }
      ];

      // Inject state context if available
      if (state) {
        let stateContext = 'CURRENT STATE:\n';
        if (state.topic) {
          stateContext += `Topic: division=${state.topic.division}, package=${state.topic.package}\n`;
        }
        if (state.pendingLeadField) {
          stateContext += `Pending lead field: ${state.pendingLeadField}\n`;
        }
        if (state.pendingQuestion) {
          stateContext += `Pending question: ${JSON.stringify(state.pendingQuestion)}\n`;
        }
        if (state.lastIntent) {
          stateContext += `Last intent: ${state.lastIntent}\n`;
        }

        chatMessages.push({ role: 'system', content: stateContext });
      }

      // Inject existing lead context
      if (existingLead) {
        const leadFields: string[] = [];
        if (existingLead.name) leadFields.push(`name: ${existingLead.name}`);
        if (existingLead.email) leadFields.push(`email: ${existingLead.email}`);
        if (existingLead.phone) leadFields.push(`phone: ${existingLead.phone}`);
        if (existingLead.interest_area) leadFields.push(`interest_area: ${existingLead.interest_area}`);

        if (leadFields.length > 0) {
          chatMessages.push({
            role: 'system',
            content: `KNOWN LEAD INFO: ${leadFields.join(', ')}\nDo NOT ask for these fields again.`
          });
        }
      }

      // Add conversation history
      for (const msg of messages.slice(-10)) {  // Last 10 messages for context
        chatMessages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }

      // Add current user message
      chatMessages.push({
        role: 'user',
        content: userMessage
      });

      // Tool call loop (max 3 rounds)
      let roundCount = 0;
      const MAX_ROUNDS = 3;
      const allAllowedPrices: number[] = [];
      let listedDivisionPackages: { division: string; packages: string[] } | null = null;
      let capturedState: any = undefined; // Capture state from set_state tool

      while (roundCount < MAX_ROUNDS) {
        roundCount++;
        console.log(`[LLM] Tool call round ${roundCount}/${MAX_ROUNDS}`);

        const completion = await this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: chatMessages,
          tools: this.getToolDefinitions(),
          tool_choice: roundCount === 1 ? 'auto' : 'auto',  // Let model decide
          temperature: 0.7,
          max_tokens: 800
        });

        const message = completion.choices[0]?.message;
        if (!message) {
          throw new Error('No message in completion');
        }

        // Add assistant message to history
        chatMessages.push(message as any);

        // Check if assistant wants to call tools
        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(`[LLM] Assistant requested ${message.tool_calls.length} tool calls`);

          // Execute each tool call
          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            let toolResult: any;

            // Special handling for set_state tool
            if (toolName === 'set_state') {
              console.log('[LLM] 🔄 set_state tool called:', JSON.stringify(toolArgs));
              capturedState = toolArgs;
              toolResult = { success: true, message: 'State captured successfully' };
            } else {
              // Execute regular tools via toolsService
              toolResult = this.toolsService.executeTool(toolName, toolArgs);

              // Track when list_division_packages is called - indicates multiple packages listed
              if (toolName === 'list_division_packages' && toolArgs.division && toolResult?.packages) {
                listedDivisionPackages = {
                  division: toolArgs.division,
                  packages: toolResult.packages.map((p: any) => p.id)
                };
                console.log('[LLM] 📋 Tracked division package listing:', listedDivisionPackages);
              }

              // Collect allowed prices from tool results
              if (toolResult && toolResult.allowed_prices) {
                allAllowedPrices.push(...toolResult.allowed_prices);
              }
            }

            // Add tool result to messages
            chatMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult)
            } as any);
          }

          // Continue loop to get assistant's response with tool results
          continue;
        }

        // No more tool calls - we have final response
        const responseContent = message.content || '';
        console.log('[LLM] Got final response (no more tool calls)');

        // Parse LEAD_JSON and STATE_JSON from text (fallback)
        const { reply, lead, stateUpdate } = this.parseResponseWithState(responseContent);

        // Prefer capturedState from set_state tool over parsed STATE_JSON
        const finalStateUpdate = capturedState || stateUpdate;
        if (capturedState) {
          console.log('[LLM] Using state from set_state tool');
        }

        return {
          reply,
          lead,
          stateUpdate: finalStateUpdate,
          toolContext: {
            allowed_prices: allAllowedPrices,
            listed_division_packages: listedDivisionPackages
          }
        };
      }

      // Max rounds reached - return what we have
      console.warn('[LLM] Max tool call rounds reached');
      const lastMessage = chatMessages[chatMessages.length - 1];
      const content = typeof lastMessage === 'object' && 'content' in lastMessage ? lastMessage.content : '';
      const { reply, lead, stateUpdate } = this.parseResponseWithState(String(content));

      // Prefer capturedState from set_state tool over parsed STATE_JSON
      const finalStateUpdate = capturedState || stateUpdate;

      return {
        reply,
        lead,
        stateUpdate: finalStateUpdate,
        toolContext: {
          allowed_prices: allAllowedPrices,
          listed_division_packages: listedDivisionPackages
        }
      };

    } catch (error: any) {
      console.error('[LLM] Error in tool-calling completion:', error);
      throw new Error(`Failed to generate chat completion with tools: ${error.message}`);
    }
  }

  /**
   * Extract JSON object from text using brace counting with proper string/escape handling
   * Returns the JSON string, start index (including marker), and end index
   */
  private extractJsonObject(text: string, marker: string): {
    jsonStr: string;
    startIndex: number;
    endIndex: number;
  } | null {
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    // Find first '{' after marker
    let braceStart = -1;
    for (let i = markerIndex + marker.length; i < text.length; i++) {
      if (text[i] === '{') {
        braceStart = i;
        break;
      }
    }

    if (braceStart === -1) {
      return null;
    }

    // Scan forward with brace counting and string handling
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = braceStart; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      // Only count braces when not inside a string
      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            // Found matching closing brace
            const jsonStr = text.substring(braceStart, i + 1);
            return {
              jsonStr,
              startIndex: markerIndex,
              endIndex: i + 1
            };
          }
        }
      }
    }

    // Unclosed JSON - return what we have for removal
    return {
      jsonStr: text.substring(braceStart),
      startIndex: markerIndex,
      endIndex: text.length
    };
  }

  /**
   * Parse response with both LEAD_JSON and STATE_JSON
   */
  private parseResponseWithState(content: string): {
    reply: string;
    lead: Lead | null;
    stateUpdate?: any;
  } {
    let reply = content;
    let lead: Lead | null = null;
    let stateUpdate: any = undefined;

    // Extract LEAD_JSON using robust extraction
    const leadExtraction = this.extractJsonObject(content, 'LEAD_JSON:');
    if (leadExtraction) {
      try {
        lead = JSON.parse(leadExtraction.jsonStr);
        console.log('[LLM] Parsed LEAD_JSON with', Object.keys(lead || {}).filter(k => (lead as any)[k]).length, 'fields');
      } catch (error) {
        console.error('[LLM] Failed to parse LEAD_JSON:', error);
        console.error('[LLM] Invalid JSON was:', leadExtraction.jsonStr.substring(0, 100));
        lead = null; // Set to null on parse failure
      }
      // ALWAYS remove the entire block from reply, even on parse failure
      reply = (content.substring(0, leadExtraction.startIndex) + content.substring(leadExtraction.endIndex)).trim();
      content = reply; // Update content for next extraction
    }

    // Extract STATE_JSON using robust extraction
    const stateExtraction = this.extractJsonObject(content, 'STATE_JSON:');
    if (stateExtraction) {
      try {
        stateUpdate = JSON.parse(stateExtraction.jsonStr);
        console.log('[LLM] Parsed STATE_JSON:', JSON.stringify(stateUpdate));
      } catch (error) {
        console.error('[LLM] Failed to parse STATE_JSON:', error);
        console.error('[LLM] Invalid JSON was:', stateExtraction.jsonStr.substring(0, 100));
        stateUpdate = undefined; // Set to undefined on parse failure
      }
      // ALWAYS remove the entire block from reply, even on parse failure
      reply = (reply.substring(0, stateExtraction.startIndex) + reply.substring(stateExtraction.endIndex)).trim();
    }

    // Final cleanup - remove any trailing commas or JSON fragments
    reply = reply.replace(/[,\s]+$/, '').trim();

    return { reply, lead, stateUpdate };
  }

  /**
   * Generate a chat completion with lead extraction
   */
  async generateChatCompletion(
    messages: Message[],
    userMessage: string,
    existingLead?: Lead | null,
    topic?: ConversationTopic
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

      // Inject conversation topic context if available (for follow-up handling)
      if (topic && (topic.division || topic.package)) {
        let topicContext = 'CURRENT CONVERSATION TOPIC:\n';
        if (topic.division) topicContext += `Division: ${topic.division}\n`;
        if (topic.package) topicContext += `Package: ${topic.package}\n`;
        topicContext += '\nUse this context when the user asks follow-up questions like "what\'s included?" or "how much?"';

        chatMessages.push({
          role: 'system',
          content: topicContext,
        });
        console.log('[OpenAI] Injected topic context:', JSON.stringify(topic));
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
      console.log('[OpenAI] Note: Response did not contain LEAD_JSON (will use server-side generation)');
    }

    return { reply, lead };
  }
}
