import React, { useState } from 'react';
import { ChatLauncher } from './ChatLauncher';
import { ChatWindow } from './ChatWindow';
import { WidgetConfig } from '../types';
import '../styles/widget.css';

interface WidgetProps {
  config: WidgetConfig;
}

export const Widget: React.FC<WidgetProps> = ({ config }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChat = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="bh-widget-container">
      <ChatLauncher onClick={toggleChat} isOpen={isOpen} />
      <ChatWindow isOpen={isOpen} onClose={() => setIsOpen(false)} backendUrl={config.backendUrl} />
    </div>
  );
};
