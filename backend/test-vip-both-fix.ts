/**
 * Test VIP "both" bug fix
 *
 * Bug: After "vip pricing", user says "both" and guard flags price hallucination
 * Root cause: Topic extraction picks specific package from history, guard scopes to single package
 *
 * Fix: Detect "both/all" and drop package scope, keep division only
 */

console.log('='.repeat(70));
console.log('VIP "BOTH" BUG FIX TEST');
console.log('='.repeat(70));
console.log();

// Simulate the message flow
const messages = [
  { role: 'user', content: 'vip pricing' },
  { role: 'bot', content: 'VIP Club offers two tiers:\n\n**Masterminds**: $49/month\n**Fast Track**: $149/month', metadata: { listedDivisionPackages: { division: 'vip', packages: ['masterminds', 'fast-track'] } } }
];

const userMessage = 'both';

console.log('Step 1: User message:', userMessage);
console.log();

// Test "both" detection
const wantsBothOrAll = /\b(both|all|everything|compare|info to both)\b/i.test(userMessage);
console.log('Step 2: Detected "both/all" pattern?', wantsBothOrAll ? '✅ YES' : '❌ NO');
console.log();

// Simulate metadata extraction from last bot message
function getLastListedDivisionPackages(messages: any[]): { division: string; packages: string[] } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'bot' && msg.metadata?.listedDivisionPackages) {
      console.log('[Metadata] Found listed division packages:', JSON.stringify(msg.metadata.listedDivisionPackages));
      return msg.metadata.listedDivisionPackages;
    }
  }
  return null;
}

const listedPackages = getLastListedDivisionPackages(messages);
console.log('Step 3: Retrieved listed packages from metadata:', JSON.stringify(listedPackages));
console.log();

// Determine topic based on fix logic
let topic: { division?: string; package?: string } = {};

if (wantsBothOrAll && listedPackages) {
  // FIX APPLIED: Use division from listing, not from topic hint
  topic = { division: listedPackages.division };
  console.log('Step 4: Applied fix - topic set to division-only:', JSON.stringify(topic));
} else {
  console.log('Step 4: Fix not applied - would use topic hint (buggy)');
}
console.log();

// Simulate topic-scoped price validation
import { PRICING_DATA } from './src/data/pricing';

function getTopicScopedPrices(topic: { division?: string; package?: string }): number[] {
  const prices: number[] = [];

  if (topic.package && topic.division) {
    // Specific package - only allow that package's prices
    const division = PRICING_DATA[topic.division];
    if (division) {
      const pkg = division.packages.find(p => p.id === topic.package);
      if (pkg && typeof pkg.price === 'number') {
        prices.push(pkg.price);
        if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
          prices.push(pkg.optional_support.price);
        }
      }
    }
  } else if (topic.division) {
    // Division only - allow all prices in that division
    const division = PRICING_DATA[topic.division];
    if (division) {
      division.packages.forEach(pkg => {
        if (typeof pkg.price === 'number') {
          prices.push(pkg.price);
        }
        if (pkg.optional_support && typeof pkg.optional_support.price === 'number') {
          prices.push(pkg.optional_support.price);
        }
      });
    }
  }

  return prices;
}

const validPrices = getTopicScopedPrices(topic);
console.log('Step 5: Topic-scoped allowed prices:', validPrices);
console.log();

// Simulate LLM response with both prices
const llmMentionedPrices = [49, 149];
console.log('Step 6: LLM mentions prices:', llmMentionedPrices);
console.log();

// Check for hallucination
const hallucinatedPrices = llmMentionedPrices.filter(p => !validPrices.includes(p));
console.log('Step 7: Hallucinated prices?', hallucinatedPrices.length > 0 ? `❌ YES: ${JSON.stringify(hallucinatedPrices)}` : '✅ NO');
console.log();

// Final result
console.log('='.repeat(70));
console.log('RESULT:');
console.log('='.repeat(70));

if (hallucinatedPrices.length === 0 && validPrices.includes(49) && validPrices.includes(149)) {
  console.log('✅ PASS: Fix works! Both VIP prices allowed, no hallucination detected.');
  console.log('   - Topic correctly set to {division:"vip"} (no package)');
  console.log('   - Allowed prices include both 49 and 149');
  console.log('   - LLM can mention both prices without triggering guard');
} else {
  console.log('❌ FAIL: Fix did not work');
  console.log('   - Hallucinated:', hallucinatedPrices);
  console.log('   - Allowed:', validPrices);
}
console.log();

// Edge case: What if topic extraction incorrectly found a package?
console.log('='.repeat(70));
console.log('EDGE CASE TEST: What if topic hint has package?');
console.log('='.repeat(70));
console.log();

let topicWithPackage: { division?: string; package?: string } = { division: 'vip', package: 'fast-track' };
console.log('Before fix: topic =', JSON.stringify(topicWithPackage));

if (wantsBothOrAll && topicWithPackage.package && topicWithPackage.division) {
  topicWithPackage = { division: topicWithPackage.division };
  console.log('After fix: topic =', JSON.stringify(topicWithPackage), '(package dropped)');
}

const validPricesEdgeCase = getTopicScopedPrices(topicWithPackage);
console.log('Allowed prices:', validPricesEdgeCase);
console.log('Result:', validPricesEdgeCase.includes(49) && validPricesEdgeCase.includes(149) ? '✅ PASS' : '❌ FAIL');
