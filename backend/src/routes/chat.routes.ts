import { Router, Request, Response, NextFunction } from 'express';
import { validateChatRequest, sanitizeInput } from '../middleware/validation';
import { sessionRateLimiter } from '../middleware/rateLimiter';
import { DatabaseService } from '../services/database.service';
import { OpenAIService } from '../services/openai.service';
import { ChatRequest, ChatResponse } from '../types';

const router = Router();
const dbService = new DatabaseService();
const openaiService = new OpenAIService();

/**
 * POST /api/chat
 * Main chat endpoint
 */
router.post(
  '/chat',
  sessionRateLimiter,
  validateChatRequest,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('[Chat] ========== NEW CHAT REQUEST ==========');
      const { sessionId, message }: ChatRequest = req.body;
      console.log('[Chat] SessionId:', sessionId);
      console.log('[Chat] Message:', message);

      // Sanitize inputs
      const sanitizedSessionId = sanitizeInput(sessionId);
      const sanitizedMessage = sanitizeInput(message);

      // Find or create conversation
      console.log('[Chat] Step 1: Find or create conversation...');
      const conversation = await dbService.findOrCreateConversation(sanitizedSessionId);
      console.log('[Chat] Conversation ID:', conversation.id);

      // Insert user message
      console.log('[Chat] Step 2: Insert user message...');
      await dbService.insertMessage(conversation.id, 'user', sanitizedMessage);
      console.log('[Chat] User message inserted');

      // Get recent messages for context
      console.log('[Chat] Step 3: Get recent messages...');
      const recentMessages = await dbService.getRecentMessages(conversation.id, 10);
      console.log('[Chat] Recent messages count:', recentMessages.length);

      // Generate AI response
      console.log('[Chat] Step 4: Generate AI response...');
      const { reply, lead } = await openaiService.generateChatCompletion(
        recentMessages,
        sanitizedMessage
      );
      console.log('[Chat] AI response generated');

      // Upsert lead if we extracted lead data (non-blocking)
      let updatedLead = null;
      if (lead && Object.values(lead).some(v => v !== null && v !== undefined && v !== '')) {
        try {
          console.log('[Chat] Step 5: LEAD_JSON extracted:', JSON.stringify(lead));
          updatedLead = await dbService.upsertLead(conversation.id, sanitizedSessionId, lead);
          console.log('[Chat] Lead saved successfully');
        } catch (error) {
          // Log error but don't break the chat
          console.error('[Chat] Error saving lead (non-blocking):', error);
        }
      } else {
        console.log('[Chat] Step 5: No lead data to save');
      }

      // Insert bot message with lead metadata
      console.log('[Chat] Step 6: Insert bot message...');
      await dbService.insertMessage(conversation.id, 'bot', reply, { lead: updatedLead });
      console.log('[Chat] Bot message inserted');

      // Return response
      const response: ChatResponse = {
        reply,
        lead: updatedLead,
      };

      console.log('[Chat] ========== REQUEST COMPLETE ==========');
      res.json(response);
    } catch (error) {
      console.error('[Chat] ========== REQUEST FAILED ==========');
      console.error('[Chat] Error:', error);
      next(error);
    }
  }
);

export default router;
