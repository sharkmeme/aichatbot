import { ChatResponse } from '../types';

export class ChatAPI {
  private backendUrl: string;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          message,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to send message');
      }

      return await response.json();
    } catch (error: any) {
      console.error('Chat API error:', error);
      throw new Error(error.message || 'Failed to communicate with the server');
    }
  }
}
