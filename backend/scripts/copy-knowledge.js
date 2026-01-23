#!/usr/bin/env node

/**
 * Copy knowledge base files to dist folder
 * This script runs after TypeScript compilation
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/knowledge');
const distDir = path.join(__dirname, '../dist/knowledge');

console.log('[Build] Copying knowledge base files...');
console.log('[Build] Source:', srcDir);
console.log('[Build] Destination:', distDir);

// Create dist/knowledge directories
const docsDir = path.join(distDir, 'docs');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Copy index.json
try {
  const indexPath = path.join(srcDir, 'index.json');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');

  // Validate JSON before copying
  const parsed = JSON.parse(indexContent);
  console.log(`[Build] ✓ Validated index.json (${parsed.docs.length} documents)`);

  fs.writeFileSync(path.join(distDir, 'index.json'), indexContent);
  console.log('[Build] ✓ Copied index.json');
} catch (error) {
  console.error('[Build] ✗ Failed to copy index.json:', error.message);
  process.exit(1);
}

// Copy all .md files
try {
  const srcDocsDir = path.join(srcDir, 'docs');
  const files = fs.readdirSync(srcDocsDir).filter(f => f.endsWith('.md'));

  console.log(`[Build] Copying ${files.length} markdown files...`);

  for (const file of files) {
    const srcFile = path.join(srcDocsDir, file);
    const distFile = path.join(docsDir, file);
    fs.copyFileSync(srcFile, distFile);
  }

  console.log(`[Build] ✓ Copied ${files.length} markdown files`);
} catch (error) {
  console.error('[Build] ✗ Failed to copy markdown files:', error.message);
  process.exit(1);
}

console.log('[Build] ✓ Knowledge base files copied successfully');
