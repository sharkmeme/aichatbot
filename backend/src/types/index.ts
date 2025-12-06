export interface Lead {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  business_type?: string;
  company_name?: string;
  interest_area?: string;
  budget_range?: string;
  preferred_contact_channel?: string;
  notes?: string;
  language?: string;
  session_id?: string;
  source?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'bot';
  content: string;
  created_at: Date;
  metadata?: any;
}

export interface Conversation {
  id: string;
  session_id: string;
  created_at: Date;
  updated_at: Date;
  lead_id?: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface ChatResponse {
  reply: string;
  lead: Lead | null;
}

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
