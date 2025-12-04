export interface Message {
  id: string;
  sender: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

export interface WidgetConfig {
  backendUrl: string;
  calendlyUrl?: string;
}

export interface ChatResponse {
  reply: string;
  lead: any;
}
