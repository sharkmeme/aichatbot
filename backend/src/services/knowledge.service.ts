import fs from 'fs';
import path from 'path';

interface KnowledgeDoc {
  id: string;
  filename: string;
  title: string;
  category: string;
  keywords: string[];
}

interface KnowledgeIndex {
  docs: KnowledgeDoc[];
}

interface RetrievedDoc {
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
}

export class KnowledgeService {
  private index: KnowledgeIndex | null = null;
  private docContents: Map<string, string> = new Map();
  private knowledgePath: string;

  constructor() {
    // In production (compiled), __dirname is /app/dist/services
    // In development (tsx), __dirname is /app/backend/src/services
    // Knowledge folder should be at ../knowledge in both cases
    this.knowledgePath = path.join(__dirname, '../knowledge');
    this.loadKnowledgeBase();
  }

  /**
   * Load knowledge base index and documents on startup
   */
  private loadKnowledgeBase(): void {
    try {
      console.log(`[Knowledge] Attempting to load from: ${this.knowledgePath}`);

      // Load index.json
      const indexPath = path.join(this.knowledgePath, 'index.json');

      if (!fs.existsSync(indexPath)) {
        throw new Error(`index.json not found at ${indexPath}. Knowledge files may not be copied to dist folder.`);
      }

      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      this.index = JSON.parse(indexContent) as KnowledgeIndex;

      console.log(`[Knowledge] ✓ Loaded index with ${this.index.docs.length} documents from ${this.knowledgePath}`);

      // Load all markdown files
      for (const doc of this.index.docs) {
        const docPath = path.join(this.knowledgePath, 'docs', doc.filename);
        const content = fs.readFileSync(docPath, 'utf-8');

        // Truncate content to max 500 characters to prevent token abuse
        const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
        this.docContents.set(doc.id, truncated);

        console.log(`[Knowledge]   - ${doc.title} (${content.length} chars → ${truncated.length})`);
      }

      console.log(`[Knowledge] ✓ Knowledge base ready with ${this.index.docs.length} documents`);
    } catch (error: any) {
      console.error('[Knowledge] ✗ FAILED to load knowledge base');
      console.error('[Knowledge]   Reason:', error.message);
      console.error('[Knowledge]   Path attempted:', this.knowledgePath);
      console.error('[Knowledge]   __dirname:', __dirname);
      console.error('[Knowledge]   Chatbot will fallback to system prompt only.');
      this.index = { docs: [] };
    }
  }

  /**
   * Retrieve relevant knowledge documents based on user message
   * Uses simple keyword matching for deterministic results
   */
  retrieveRelevant(userMessage: string, limit: number = 2): RetrievedDoc[] {
    if (!this.index || this.index.docs.length === 0) {
      console.log('[Knowledge] No knowledge base available');
      return [];
    }

    // Normalize user message for matching
    const normalizedMessage = userMessage.toLowerCase();
    const words = normalizedMessage.split(/\s+/);

    // Calculate relevance score for each document
    const scoredDocs = this.index.docs.map(doc => {
      let score = 0;

      // Check keyword matches
      for (const keyword of doc.keywords) {
        if (normalizedMessage.includes(keyword.toLowerCase())) {
          score += 2; // Keyword match worth 2 points
        }
      }

      // Check if any word from the message matches keywords
      for (const word of words) {
        if (word.length > 3) { // Only consider words longer than 3 chars
          for (const keyword of doc.keywords) {
            if (keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase())) {
              score += 1; // Partial match worth 1 point
            }
          }
        }
      }

      return {
        id: doc.id,
        title: doc.title,
        content: this.docContents.get(doc.id) || '',
        relevanceScore: score,
      };
    });

    // Sort by relevance score (descending) and take top N
    const relevantDocs = scoredDocs
      .filter(doc => doc.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    if (relevantDocs.length > 0) {
      console.log(
        `[Knowledge] Retrieved ${relevantDocs.length} docs:`,
        relevantDocs.map(d => `${d.title} (score: ${d.relevanceScore})`).join(', ')
      );
    } else {
      console.log('[Knowledge] No relevant documents found for query');
    }

    return relevantDocs;
  }

  /**
   * Format retrieved documents for injection into LLM context
   */
  formatForPrompt(docs: RetrievedDoc[]): string {
    if (docs.length === 0) {
      return '';
    }

    const formatted = docs.map(doc => {
      return `### ${doc.title}\n\n${doc.content}\n\n[Source: ${doc.title}]`;
    }).join('\n---\n\n');

    return `KNOWLEDGE BASE (Reference material only - use this to answer questions accurately):

${formatted}

IMPORTANT REMINDERS:
1. Use the above knowledge to provide accurate, grounded answers
2. Cite sources when using this information
3. CRITICAL: You MUST still output LEAD_JSON at the end of your response (as required in your main system prompt)
4. Keep responses under 250 characters and follow all formatting rules from your main instructions`;
  }
}
