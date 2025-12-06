import { pool } from '../config/database';
import { Conversation, Message, Lead } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class DatabaseService {
  /**
   * Find or create a conversation by session ID
   */
  async findOrCreateConversation(sessionId: string): Promise<Conversation> {
    const client = await pool.connect();
    try {
      // Try to find existing conversation
      let result = await client.query<Conversation>(
        'SELECT * FROM conversations WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create new conversation
      result = await client.query<Conversation>(
        `INSERT INTO conversations (id, session_id, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING *`,
        [uuidv4(), sessionId]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Insert a message into the database
   */
  async insertMessage(
    conversationId: string,
    sender: 'user' | 'bot',
    content: string,
    metadata?: any
  ): Promise<Message> {
    const client = await pool.connect();
    try {
      const result = await client.query<Message>(
        `INSERT INTO messages (id, conversation_id, sender, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [uuidv4(), conversationId, sender, content, metadata ? JSON.stringify(metadata) : null]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get recent messages for a conversation (for context)
   */
  async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    const client = await pool.connect();
    try {
      const result = await client.query<Message>(
        `SELECT * FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [conversationId, limit]
      );

      // Return in chronological order (oldest first)
      return result.rows.reverse();
    } finally {
      client.release();
    }
  }

  /**
   * Upsert lead data
   */
  async upsertLead(conversationId: string, sessionId: string, leadData: Lead): Promise<Lead> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get conversation
      const convResult = await client.query<Conversation>(
        'SELECT * FROM conversations WHERE id = $1',
        [conversationId]
      );

      if (convResult.rows.length === 0) {
        throw new Error('Conversation not found');
      }

      const conversation = convResult.rows[0];
      let lead: Lead;

      if (conversation.lead_id) {
        // Update existing lead
        console.log('[Lead] Updating existing lead:', conversation.lead_id);
        const updateResult = await client.query<Lead>(
          `UPDATE leads
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               phone = COALESCE($3, phone),
               business_type = COALESCE($4, business_type),
               company_name = COALESCE($5, company_name),
               interest_area = COALESCE($6, interest_area),
               budget_range = COALESCE($7, budget_range),
               preferred_contact_channel = COALESCE($8, preferred_contact_channel),
               notes = COALESCE($9, notes),
               language = COALESCE($10, language),
               updated_at = NOW()
           WHERE id = $11
           RETURNING *`,
          [
            leadData.name || null,
            leadData.email || null,
            leadData.phone || null,
            leadData.business_type || null,
            leadData.company_name || null,
            leadData.interest_area || null,
            leadData.budget_range || null,
            leadData.preferred_contact_channel || null,
            leadData.notes || null,
            leadData.language || null,
            conversation.lead_id,
          ]
        );
        lead = updateResult.rows[0];
        console.log('[Lead] Updated successfully');
      } else {
        // Create new lead
        console.log('[Lead] Creating new lead for session:', sessionId);
        const insertResult = await client.query<Lead>(
          `INSERT INTO leads (id, name, email, phone, business_type, company_name, interest_area, budget_range, preferred_contact_channel, notes, language, session_id, source, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
           RETURNING *`,
          [
            uuidv4(),
            leadData.name || null,
            leadData.email || null,
            leadData.phone || null,
            leadData.business_type || null,
            leadData.company_name || null,
            leadData.interest_area || null,
            leadData.budget_range || null,
            leadData.preferred_contact_channel || null,
            leadData.notes || null,
            leadData.language || null,
            sessionId,
            'website_chat',
          ]
        );
        lead = insertResult.rows[0];
        console.log('[Lead] Created successfully:', lead.id);

        // Link lead to conversation
        await client.query(
          'UPDATE conversations SET lead_id = $1, updated_at = NOW() WHERE id = $2',
          [lead.id, conversationId]
        );
      }

      await client.query('COMMIT');
      return lead;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Lead] Failed to save lead:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
