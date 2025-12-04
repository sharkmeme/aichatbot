import React, { useState } from 'react';
import { ChatLauncher } from './ChatLauncher';
import { ChatWindow } from './ChatWindow';

interface WidgetProps {
  backendUrl: string;
  calendlyUrl?: string;
}

export const Widget: React.FC<WidgetProps> = ({ backendUrl }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChat = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="bh-widget-container">
      <ChatLauncher onClick={toggleChat} isOpen={isOpen} />
      <ChatWindow isOpen={isOpen} onClose={() => setIsOpen(false)} backendUrl={backendUrl} />
    </div>
  );
};
