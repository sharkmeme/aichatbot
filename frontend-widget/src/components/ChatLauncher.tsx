import React from 'react';

interface ChatLauncherProps {
  onClick: () => void;
  isOpen: boolean;
}

export const ChatLauncher: React.FC<ChatLauncherProps> = ({ onClick, isOpen }) => {
  if (isOpen) return null;

  return (
    <button className="bh-launcher" onClick={onClick} aria-label="Open chat">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
};
