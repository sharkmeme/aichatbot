# Knowledge Base

This folder contains the chatbot's knowledge base - curated information that the AI uses to answer questions accurately.

## Structure

- `index.json` - Metadata index with keywords for each document
- `docs/*.md` - Individual knowledge documents (markdown format)

## How It Works

1. When a user sends a message, the system analyzes it for keywords
2. The 2 most relevant documents are selected based on keyword matching
3. These documents are injected into the AI's context
4. The AI uses this information to provide accurate, grounded answers

## Adding New Knowledge

1. Create a new `.md` file in `docs/` folder
2. Add metadata entry to `index.json`:
   ```json
   {
     "id": "unique-id",
     "filename": "your-file.md",
     "title": "Document Title",
     "category": "service|sales|general",
     "keywords": ["keyword1", "keyword2", ...]
   }
   ```
3. Commit and push - Railway will rebuild and deploy automatically

## Updating Existing Knowledge

Simply edit the `.md` files directly, then commit and push.

## Important Notes

- Documents are truncated to 800 characters during loading (to prevent token abuse)
- Use clear, concise language
- Focus on facts and specific details
- Avoid marketing fluff - be direct and helpful
- Keywords should match how users actually ask questions
