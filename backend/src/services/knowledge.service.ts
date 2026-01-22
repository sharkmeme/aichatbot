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
    this.knowledgePath = path.join(__dirname, '../knowledge');
    this.loadKnowledgeBase();
  }

  /**
   * Load knowledge base index and documents on startup
   */
  private loadKnowledgeBase(): void {
    try {
      // Load index.json
      const indexPath = path.join(this.knowledgePath, 'index.json');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      this.index = JSON.parse(indexContent) as KnowledgeIndex;

      console.log(`[Knowledge] Loaded index with ${this.index.docs.length} documents`);

      // Load all markdown files
      for (const doc of this.index.docs) {
        const docPath = path.join(this.knowledgePath, 'docs', doc.filename);
        const content = fs.readFileSync(docPath, 'utf-8');

        // Truncate content to max 800 characters to prevent token abuse
        const truncated = content.length > 800 ? content.substring(0, 800) + '...' : content;
        this.docContents.set(doc.id, truncated);

        console.log(`[Knowledge] Loaded document: ${doc.title} (${content.length} chars, truncated to ${truncated.length})`);
      }

      console.log('[Knowledge] Knowledge base loaded successfully');
    } catch (error) {
      console.error('[Knowledge] Failed to load knowledge base:', error);
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

NOTE: The above information is reference material from Bunny Honey's knowledge base. Use it to provide accurate answers. Always cite sources when using this information.`;
  }
}
