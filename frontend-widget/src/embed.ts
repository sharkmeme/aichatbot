import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './components/Widget';

/**
 * Helper function to reliably find the widget script tag
 * Works even when document.currentScript is null (e.g., in Webflow)
 */
function findScriptTag(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;

  const scripts = Array.from(document.getElementsByTagName('script')) as HTMLScriptElement[];

  // Prefer the script with our backend attribute
  const withBackend = scripts.find(
    s => s.getAttribute('data-backend-url') && s.src.includes('embed.js')
  );
  if (withBackend) return withBackend;

  // Fallback: any script whose src includes "aichatbot-omega-snowy.vercel.app/embed.js"
  const bySrc = scripts.find(s =>
    s.src.includes('aichatbot-omega-snowy.vercel.app/embed.js')
  );
  return bySrc || null;
}

/**
 * Initialize the Bunny Honey chat widget
 * Reads configuration from script tag data attributes
 */
(function () {
  // Find the script tag that loaded this file
  const scriptTag = findScriptTag();

  if (!scriptTag) {
    console.error('Bunny Honey Widget: Could not find script tag in DOM');
    return;
  }

  // Read configuration from data attributes
  const backendUrl = scriptTag.getAttribute('data-backend-url');
  const calendlyUrl = scriptTag.getAttribute('data-calendly-url');

  if (!backendUrl) {
    console.error('Bunny Honey Widget: data-backend-url attribute is required');
    return;
  }

  // Store validated config
  const config = {
    backendUrl: backendUrl as string,
    calendlyUrl: calendlyUrl || undefined,
  };

  // Wait for DOM to be ready
  function initWidget() {
    // Create container div
    const container = document.createElement('div');
    container.id = 'bh-widget-container';
    document.body.appendChild(container);

    // Mount React app
    const root = createRoot(container);
    root.render(
      React.createElement(Widget, {
        backendUrl: config.backendUrl,
        calendlyUrl: config.calendlyUrl
      })
    );

    // Set global flag
    (window as any).__BUNNY_WIDGET_LOADED = true;

    console.log('✅ Bunny Honey Widget initialized');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
