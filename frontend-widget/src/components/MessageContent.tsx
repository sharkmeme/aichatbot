import React from 'react';

interface MessageContentProps {
  content: string;
  sender: 'user' | 'bot';
}

// Default Calendly URL (fallback)
const DEFAULT_CALENDLY_URL = 'https://calendly.com/bunnyhoneyclub';

export const MessageContent: React.FC<MessageContentProps> = ({ content, sender }) => {
  // Only process special markers for bot messages
  if (sender !== 'bot') {
    return <>{content}</>;
  }

  // Split content by lines to handle CTA button markers
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for CTA button markers
    if (line === '{{BTN_MEETING}}') {
      elements.push(
        <button
          key={`btn-meeting-${i}`}
          className="bh-cta-btn bh-cta-primary"
          onClick={() => window.open(DEFAULT_CALENDLY_URL, '_blank', 'noopener,noreferrer')}
          aria-label="Book a meeting"
        >
          📅 Book a meeting
        </button>
      );
      continue;
    }

    if (line === '{{BTN_WHATSAPP}}') {
      elements.push(
        <button
          key={`btn-whatsapp-${i}`}
          className="bh-cta-btn bh-cta-whatsapp"
          onClick={() => window.open('https://wa.me/491637830812', '_blank', 'noopener,noreferrer')}
          aria-label="WhatsApp call"
        >
          💬 WhatsApp call
        </button>
      );
      continue;
    }

    if (line === '{{BTN_TELEGRAM}}') {
      elements.push(
        <button
          key={`btn-telegram-${i}`}
          className="bh-cta-btn bh-cta-telegram"
          onClick={() => window.open('https://t.me/kingarthi', '_blank', 'noopener,noreferrer')}
          aria-label="Telegram"
        >
          ✈️ Telegram
        </button>
      );
      continue;
    }

    if (line === '{{BTN_CONTACT}}') {
      elements.push(
        <button
          key={`btn-contact-${i}`}
          className="bh-cta-btn bh-cta-contact"
          onClick={() => window.open('https://bunnyhoneyclub.com/contact-us', '_blank', 'noopener,noreferrer')}
          aria-label="Contact form"
        >
          📝 Contact form
        </button>
      );
      continue;
    }

    // Check for old-style Calendly button marker
    const calendlyPattern = /\{\{CALENDLY_BUTTON\}\}\s*(https?:\/\/[^\s]+)/g;
    const calendlyMatch = calendlyPattern.exec(line);

    if (calendlyMatch) {
      const calendlyUrl = calendlyMatch[1];
      const textBeforeButton = line.substring(0, calendlyMatch.index);
      const textAfterButton = line.substring(calendlyMatch.index + calendlyMatch[0].length);

      if (textBeforeButton) {
        elements.push(<span key={`text-before-${i}`}>{textBeforeButton}</span>);
      }

      elements.push(
        <button
          key={`calendly-${i}`}
          className="bh-calendly-btn"
          onClick={() => window.open(calendlyUrl, '_blank', 'noopener,noreferrer')}
          aria-label="Book a call"
        >
          📅 Book a Call
        </button>
      );

      if (textAfterButton) {
        elements.push(<span key={`text-after-${i}`}>{textAfterButton}</span>);
      }

      continue;
    }

    // Regular text line - preserve line breaks
    if (line) {
      elements.push(
        <span key={`line-${i}`}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      );
    } else if (i < lines.length - 1) {
      // Empty line - add line break
      elements.push(<br key={`br-${i}`} />);
    }
  }

  return <>{elements}</>;
};
