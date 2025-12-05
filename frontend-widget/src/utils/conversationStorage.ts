import { Message } from '../types';

const STORAGE_KEY = 'bh_conversation_history';
const LEAD_KEY = 'bh_lead_data';

export interface StoredConversation {
  messages: Message[];
  lastUpdated: number;
}

export interface StoredLead {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  budget?: string;
  lastUpdated: number;
}

/**
 * Save conversation history to localStorage
 */
export function saveConversation(messages: Message[]): void {
  try {
    const data: StoredConversation = {
      messages,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save conversation:', error);
  }
}

/**
 * Load conversation history from localStorage
 * Returns null if no conversation or if it's older than 24 hours
 */
export function loadConversation(): Message[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: StoredConversation = JSON.parse(stored);

    // Check if conversation is less than 24 hours old
    const hoursSinceUpdate = (Date.now() - data.lastUpdated) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24) {
      // Clear old conversation
      clearConversation();
      return null;
    }

    // Convert timestamp strings back to Date objects
    return data.messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  } catch (error) {
    console.warn('Failed to load conversation:', error);
    return null;
  }
}

/**
 * Clear conversation history
 */
export function clearConversation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear conversation:', error);
  }
}

/**
 * Save lead data to localStorage
 */
export function saveLeadData(lead: Partial<StoredLead>): void {
  try {
    const existing = loadLeadData() || {};
    const updated: StoredLead = {
      ...existing,
      ...lead,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(LEAD_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save lead data:', error);
  }
}

/**
 * Load lead data from localStorage
 */
export function loadLeadData(): StoredLead | null {
  try {
    const stored = localStorage.getItem(LEAD_KEY);
    if (!stored) return null;

    return JSON.parse(stored);
  } catch (error) {
    console.warn('Failed to load lead data:', error);
    return null;
  }
}

/**
 * Clear lead data
 */
export function clearLeadData(): void {
  try {
    localStorage.removeItem(LEAD_KEY);
  } catch (error) {
    console.warn('Failed to clear lead data:', error);
  }
}
