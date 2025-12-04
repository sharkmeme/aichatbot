import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './components/Widget';

/**
 * Initialize the Bunny Honey chat widget
 * Reads configuration from script tag data attributes
 */
(function () {
  // Find the script tag that loaded this file
  const scriptTag = document.currentScript as HTMLScriptElement | null;

  if (!scriptTag) {
    console.error('Bunny Honey Widget: Could not find script tag');
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
