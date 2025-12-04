/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create session ID from localStorage
 */
export function getOrCreateSessionId(): string {
  const storageKey = 'bunny_honey_session_id';

  try {
    let sessionId = localStorage.getItem(storageKey);

    if (!sessionId) {
      sessionId = generateSessionId();
      localStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
  } catch (error) {
    // Fallback if localStorage is not available
    console.warn('localStorage not available, using temporary session ID');
    return generateSessionId();
  }
}
