import React from 'react';
import ReactDOM from 'react-dom/client';
import { Widget } from './components/Widget';
import { WidgetConfig } from './types';

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

  // Create configuration object
  const config: WidgetConfig = {
    backendUrl,
    calendlyUrl: calendlyUrl || undefined,
  };

  // Wait for DOM to be ready
  function initWidget() {
    // Create container div
    const container = document.createElement('div');
    container.id = 'bunny-honey-widget-root';
    document.body.appendChild(container);

    // Mount React app
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Widget, { config }));

    console.log('✅ Bunny Honey Widget initialized');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
