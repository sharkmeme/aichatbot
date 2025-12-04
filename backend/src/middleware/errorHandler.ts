import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the full error on the server
  console.error('❌ Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
  });

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Send generic error message to client (no stack traces or secrets)
  const response: any = {
    error: 'An error occurred',
    message: err.isOperational
      ? err.message
      : 'Something went wrong. Please try again later.',
  };

  // Only include stack trace in development
  if (config.nodeEnv === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist',
  });
}
