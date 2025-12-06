/**
 * Visual Viewport utilities for mobile keyboard handling
 * Fixed-bottom sheet approach - no zoom, no glitches
 */

/**
 * Setup visualViewport listener for mobile keyboard handling
 * Uses fixed-bottom sheet approach for WhatsApp/Telegram-like behavior
 * Returns cleanup function
 */
export function setupViewportListener(element: HTMLElement): () => void {
  // Check if visualViewport is supported (mainly for iOS)
  if (!window.visualViewport) {
    return () => {}; // No-op cleanup
  }

  const handleResize = () => {
    const viewport = window.visualViewport!;

    // Disable transitions to prevent glitching during resize
    element.style.transition = 'none';

    // Set height directly to visualViewport height
    // This makes the chat shrink smoothly when keyboard opens
    element.style.height = `${viewport.height}px`;

    // Re-enable transitions after a frame
    requestAnimationFrame(() => {
      element.style.transition = '';
    });
  };

  // Initial setup
  handleResize();

  // Listen for viewport changes (keyboard open/close)
  window.visualViewport.addEventListener('resize', handleResize);

  // Return cleanup function
  return () => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', handleResize);
    }
  };
}
