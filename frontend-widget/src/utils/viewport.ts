/**
 * Visual Viewport utilities for mobile keyboard handling
 * Prevents chat from being cut off when mobile keyboard opens
 */

export interface ViewportDimensions {
  height: number;
  width: number;
}

/**
 * Setup visualViewport listener for mobile keyboard handling
 * Returns cleanup function
 */
export function setupViewportListener(
  element: HTMLElement,
  onResize?: (dimensions: ViewportDimensions) => void
): () => void {
  // Check if visualViewport is supported
  if (!window.visualViewport) {
    return () => {}; // No-op cleanup
  }

  const handleResize = () => {
    const viewport = window.visualViewport!;
    const dimensions: ViewportDimensions = {
      height: viewport.height,
      width: viewport.width,
    };

    // Update CSS variable for responsive height
    element.style.setProperty('--bh-vv-height', `${viewport.height}px`);

    // Call optional callback
    if (onResize) {
      onResize(dimensions);
    }
  };

  // Initial setup
  handleResize();

  // Listen for viewport changes (keyboard open/close)
  window.visualViewport.addEventListener('resize', handleResize);
  window.visualViewport.addEventListener('scroll', handleResize);

  // Return cleanup function
  return () => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
    }
  };
}
