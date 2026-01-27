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
  sender: 'user' | 'bot' | 'system';
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
  state?: ConversationState;
}

export interface ConversationState {
  stage: 'info' | 'collect_name' | 'collect_email' | 'choose_contact';
  topic?: {
    division?: string;
    package?: string;
  } | null;
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
