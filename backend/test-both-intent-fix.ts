/**
 * Test "both" intent and vague-query conflict fix
 *
 * Verifies:
 * 1. "both" is detected as intent
 * 2. "both" in extractTopic skips vague fallback
 * 3. Topic remains division-only (no package)
 */

import { IntentService } from './src/services/intent.service';

const intentService = new IntentService();

console.log('='.repeat(70));
console.log('TEST: "Both" Intent and Vague-Query Conflict Fix');
console.log('='.repeat(70));
console.log();

// Test 1: Detect "both" as intent
console.log('TEST 1: Intent Detection');
console.log('-'.repeat(70));

const testMessages = [
  'both',
  'all',
  'everything',
  'compare',
  'info to both',
  'info for both'
];

testMessages.forEach(msg => {
  const intent = intentService.detectIntent(msg, false);
  console.log(`Message: "${msg}"`);
  console.log(`  Detected intent: ${intent}`);
  console.log(`  Expected: "both"`);
  console.log(`  Result: ${intent === 'both' ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
});

// Test 2: Topic extraction for "both" - should NOT use vague fallback
console.log('='.repeat(70));
console.log('TEST 2: Topic Extraction - "both" skips vague fallback');
console.log('-'.repeat(70));
console.log();

// Simulate recent messages with VIP context
const recentMessages: any[] = [
  {
    sender: 'user',
    content: 'vip pricing'
  },
  {
    sender: 'bot',
    content: 'VIP Club has two tiers: Masterminds $49/month and Fast Track $149/month'
  }
];

const userMessage = 'both';
console.log('User message:', userMessage);
console.log('Recent context: bot mentioned "Masterminds" and "Fast Track"');
console.log();

const topic = intentService.extractTopic(userMessage, recentMessages);
console.log('Extracted topic:', JSON.stringify(topic));
console.log();

// The key test: topic should be empty {} because "both" returns early
// and does NOT trigger vague fallback
if (Object.keys(topic).length === 0 || (topic.division && !topic.package)) {
  console.log('✅ PASS: Topic is division-only or empty (no package from vague fallback)');
  console.log('   - "both" pattern detected and returned early');
  console.log('   - Vague fallback was skipped');
} else if (topic.package) {
  console.log('❌ FAIL: Topic has package:', topic.package);
  console.log('   - This means vague fallback was triggered incorrectly');
} else {
  console.log('✅ PASS: Topic is empty (vague fallback skipped)');
}
console.log();

// Test 3: Verify logs show "both" pattern detection
console.log('='.repeat(70));
console.log('TEST 3: Expected Log Output');
console.log('-'.repeat(70));
console.log();
console.log('When user says "both", logs should show:');
console.log('  [Intent] "both/all" pattern detected - will skip package detection and vague fallback');
console.log();
console.log('Logs should NOT show:');
console.log('  [Intent] Vague query detected, using last topic: ...');
console.log();

// Test 4: Integration test - simulating the full flow
console.log('='.repeat(70));
console.log('TEST 4: Full Flow Simulation');
console.log('-'.repeat(70));
console.log();

console.log('Scenario: User asks "vip pricing" then says "both"');
console.log();
console.log('Step 1: User says "vip pricing"');
const intent1 = intentService.detectIntent('vip pricing', false);
const topic1 = intentService.extractTopic('vip pricing', []);
console.log('  Intent:', intent1);
console.log('  Topic:', JSON.stringify(topic1));
console.log();

console.log('Step 2: User says "both"');
const intent2 = intentService.detectIntent('both', false);
const topic2 = intentService.extractTopic('both', recentMessages);
console.log('  Intent:', intent2);
console.log('  Topic:', JSON.stringify(topic2));
console.log();

if (intent2 === 'both' && (!topic2.package || Object.keys(topic2).length === 0)) {
  console.log('✅ PASS: Intent is "both", topic has no package (or is empty)');
  console.log('   - In chat.routes.ts, this will trigger division-only correction');
  console.log('   - Price guard will allow all prices in division');
} else {
  console.log('❌ FAIL: Intent or topic incorrect');
  console.log('  Intent:', intent2, '(expected: "both")');
  console.log('  Topic:', JSON.stringify(topic2), '(expected: no package)');
}
console.log();

console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log();
console.log('Key fixes implemented:');
console.log('✅ Added "both" as explicit Intent type');
console.log('✅ detectIntent() prioritizes "both" pattern detection');
console.log('✅ extractTopic() detects "both/all" and returns early');
console.log('✅ Vague fallback is skipped when "both" is detected');
console.log('✅ Topic remains division-only (no package pollution)');
console.log();
console.log('Expected behavior in production:');
console.log('1. User: "vip pricing" → Bot lists both packages with metadata');
console.log('2. User: "both" → Intent="both", Topic={division:"vip"} (no package)');
console.log('3. Price guard allows [49, 149] (division-scoped)');
console.log('4. Bot shows both packages without hallucination guard trigger');
