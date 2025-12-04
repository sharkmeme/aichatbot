import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './components/Widget';
import widgetCss from './styles/widget.css?inline';

/**
 * Inject CSS into the document head
 */
function injectCss(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Helper function to reliably find the widget script tag
 * Works even when Webflow rewrites or proxies script URLs
 */
function findScriptTag(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;

  const scripts = Array.from(document.getElementsByTagName("script")) as HTMLScriptElement[];

  // 1. Prefer scripts that explicitly have data-backend-url attribute
  const attrMatch = scripts.find(s => s.getAttribute("data-backend-url"));
  if (attrMatch) return attrMatch;

  // 2. Fallback: scripts whose *filename* (not full URL) includes embed.js
  const fileMatch = scripts.find(s => {
    try {
      const url = new URL(s.src);
      return url.pathname.endsWith("/embed.js") || url.pathname.includes("embed");
    } catch {
      return s.src.includes("embed.js");
    }
  });
  if (fileMatch) return fileMatch;

  return null;
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
    // Inject CSS into document head
    injectCss(widgetCss);

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
