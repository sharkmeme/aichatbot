/**
 * Lead flow helper functions
 * Determine if user input should be consumed as lead data or treated as a question/request
 */

/**
 * Check if text looks like a question
 */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();

  // Ends with "?"
  if (trimmed.endsWith('?')) {
    return true;
  }

  // Starts with question word
  const questionStarters = /^(what|whats|what's|how|when|where|why|who|can|could|do|does|is|are|tell|explain|show)\b/i;
  return questionStarters.test(trimmed);
}

/**
 * Check if text has pricing or info intent
 */
export function hasPricingOrInfoIntent(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  const pricingPatterns = /\b(price|pricing|cost|how much|included|what include|what'?s included|difference|compare|detail|info|information|tell me about|explain|monthly|one-time|\$)\b/i;
  return pricingPatterns.test(normalized);
}

/**
 * Detect Question Mode - user is asking for information, not ready to take action
 * In Question Mode: Answer the question, do NOT push CTA or lead collection
 */
export function isQuestionMode(text: string): boolean {
  return looksLikeQuestion(text) || hasPricingOrInfoIntent(text);
}

/**
 * Detect Action Mode - user is ready to take action (buy, contact, proceed)
 * In Action Mode: Show CTA buttons, collect lead info, route to contact method
 */
export function isActionMode(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  const actionPatterns = /\b(buy|join|sign up|proceed|move forward|book|meeting|contact|telegram|whatsapp|call|get started|let'?s go|i'?m in|ready)\b/i;
  return actionPatterns.test(normalized);
}

/**
 * Check if text looks like an attempted email
 */
export function isAttemptedEmail(text: string): boolean {
  const trimmed = text.trim();

  // Contains @ or looks like email pattern
  if (trimmed.includes('@')) {
    return true;
  }

  // Basic email-like pattern (word.word without @ but looks like email attempt)
  const emailLike = /^[a-zA-Z0-9][a-zA-Z0-9._-]*@?[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z]{2,}$/;
  return emailLike.test(trimmed);
}

/**
 * Check if text is a plausible name
 */
export function isPlausibleName(text: string): boolean {
  const trimmed = text.trim();

  // Too long
  if (trimmed.length > 40) {
    return false;
  }

  // Contains @
  if (trimmed.includes('@')) {
    return false;
  }

  // Too many words (>4)
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 4) {
    return false;
  }

  // Contains digits (suspicious for a name in this context)
  if (/\d/.test(trimmed)) {
    return false;
  }

  // Looks like a question
  if (looksLikeQuestion(trimmed)) {
    return false;
  }

  // Has pricing/info intent
  if (hasPricingOrInfoIntent(trimmed)) {
    return false;
  }

  return true;
}

/**
 * Check if text shows purchase commitment intent
 * Only these signals should trigger lead capture (name/email)
 */
export function isPurchaseCommitment(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  const commitmentPatterns = /\b(buy|purchase|sign up|join|get started|book|call me|contact|let'?s do it|i'?m in|yes let'?s|let'?s go|telegram|whatsapp|schedule|meeting)\b/i;
  return commitmentPatterns.test(normalized);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email.trim());
}
