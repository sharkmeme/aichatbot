import { Request, Response, NextFunction } from 'express';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateChatRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors: ValidationError[] = [];
  const { sessionId, message } = req.body;

  // Validate sessionId
  if (!sessionId) {
    errors.push({ field: 'sessionId', message: 'sessionId is required' });
  } else if (typeof sessionId !== 'string') {
    errors.push({ field: 'sessionId', message: 'sessionId must be a string' });
  } else if (sessionId.length === 0 || sessionId.length > 100) {
    errors.push({ field: 'sessionId', message: 'sessionId must be between 1 and 100 characters' });
  }

  // Validate message
  if (!message) {
    errors.push({ field: 'message', message: 'message is required' });
  } else if (typeof message !== 'string') {
    errors.push({ field: 'message', message: 'message must be a string' });
  } else if (message.trim().length === 0) {
    errors.push({ field: 'message', message: 'message cannot be empty' });
  } else if (message.length > 2000) {
    errors.push({ field: 'message', message: 'message must not exceed 2000 characters' });
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', details: errors });
    return;
  }

  next();
}

export function sanitizeInput(input: string): string {
  return input.trim();
}
