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
      const { sessionId, message }: ChatRequest = req.body;

      // Sanitize inputs
      const sanitizedSessionId = sanitizeInput(sessionId);
      const sanitizedMessage = sanitizeInput(message);

      // Find or create conversation
      const conversation = await dbService.findOrCreateConversation(sanitizedSessionId);

      // Insert user message
      await dbService.insertMessage(conversation.id, 'user', sanitizedMessage);

      // Get recent messages for context
      const recentMessages = await dbService.getRecentMessages(conversation.id, 10);

      // Generate AI response
      const { reply, lead } = await openaiService.generateChatCompletion(
        recentMessages,
        sanitizedMessage
      );

      // Upsert lead if we extracted lead data
      let updatedLead = null;
      if (lead && Object.values(lead).some(v => v !== null && v !== undefined && v !== '')) {
        updatedLead = await dbService.upsertLead(conversation.id, lead);
      }

      // Insert bot message with lead metadata
      await dbService.insertMessage(conversation.id, 'bot', reply, { lead: updatedLead });

      // Return response
      const response: ChatResponse = {
        reply,
        lead: updatedLead,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
