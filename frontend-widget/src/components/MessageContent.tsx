import React from 'react';

interface MessageContentProps {
  content: string;
  sender: 'user' | 'bot';
}

export const MessageContent: React.FC<MessageContentProps> = ({ content, sender }) => {
  // Only process Calendly buttons for bot messages
  if (sender !== 'bot') {
    return <>{content}</>;
  }

  // Check for Calendly button marker
  const calendlyPattern = /\{\{CALENDLY_BUTTON\}\}\s*(https?:\/\/[^\s]+)/g;
  const match = calendlyPattern.exec(content);

  if (match) {
    const calendlyUrl = match[1];
    const textBeforeButton = content.substring(0, match.index);
    const textAfterButton = content.substring(match.index + match[0].length);

    return (
      <>
        {textBeforeButton}
        <button
          className="bh-calendly-btn"
          onClick={() => window.open(calendlyUrl, '_blank', 'noopener,noreferrer')}
          aria-label="Book a call"
        >
          📅 Book a Call
        </button>
        {textAfterButton}
      </>
    );
  }

  // Return content as-is if no Calendly button
  return <>{content}</>;
};
