import rateLimit from 'express-rate-limit';

// Rate limiter to prevent abuse
// 30 requests per minute per IP
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP address for rate limiting
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});

// More strict rate limiter for the chat endpoint
// 10 requests per 10 seconds per session
export const sessionRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 10,
  message: {
    error: 'Too many requests',
    message: 'Please slow down. You are sending messages too quickly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.body?.sessionId || req.ip || 'unknown';
    return `session:${sessionId}`;
  },
});
