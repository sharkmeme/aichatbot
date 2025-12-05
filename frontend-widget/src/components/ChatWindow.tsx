import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../types';
import { ChatAPI } from '../utils/api';
import { getOrCreateSessionId } from '../utils/sessionManager';
import { MessageContent } from './MessageContent';
import { loadConversation, saveConversation } from '../utils/conversationStorage';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ isOpen, onClose, backendUrl }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => getOrCreateSessionId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAPI = useRef(new ChatAPI(backendUrl));

  // Load conversation from localStorage on mount
  useEffect(() => {
    const savedConversation = loadConversation();
    if (savedConversation && savedConversation.length > 0) {
      setMessages(savedConversation);
    } else if (messages.length === 0) {
      // Initial greeting for new conversations
      setMessages([
        {
          id: 'welcome',
          sender: 'bot',
          content: "Hi! I'm the Bunny Honey Assistant. How can I help you today?",
          timestamp: new Date(),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save conversation to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveConversation(messages);
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Call API
      const response = await chatAPI.current.sendMessage(sessionId, message);

      // Add bot response
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        content: response.reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      console.error('Failed to send message:', error);

      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bh-chat-window">
      {/* Header */}
      <div className="bh-header">
        <div className="bh-header-content">
          <div className="bh-header-avatar">🐰</div>
          <div className="bh-header-text">
            <h3>Bunny Honey</h3>
            <p>AI Assistant</p>
          </div>
        </div>
        <div className="bh-header-actions">
          <a
            href="https://bunny-honey-9a9aed.webflow.io/contact-us"
            target="_blank"
            rel="noopener noreferrer"
            className="bh-contact-btn"
            aria-label="Contact Us"
          >
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
          </a>
          <button className="bh-close-btn" onClick={onClose} aria-label="Close chat">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="bh-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`bh-message bh-${msg.sender}`}>
            <div className="bh-message-avatar">{msg.sender === 'user' ? '👤' : '🐰'}</div>
            <div className="bh-message-content">
              <MessageContent content={msg.content} sender={msg.sender} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="bh-message bh-bot">
            <div className="bh-message-avatar">🐰</div>
            <div className="bh-message-content">
              <div className="bh-loading">
                <div className="bh-loading-dot"></div>
                <div className="bh-loading-dot"></div>
                <div className="bh-loading-dot"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bh-input-area">
        <div className="bh-input-wrapper">
          <input
            type="text"
            className="bh-input"
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            className="bh-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            aria-label="Send message"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
