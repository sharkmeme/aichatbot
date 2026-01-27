# Lead Flow Loops Fix - Summary

## Problem Statement

The chatbot had critical lead-flow bugs causing loops and poor UX:

1. **pending=name consumed questions as names**: "whats the price" saved as name
2. **pending=email replied "invalid email" to questions**: "where are you based" → "invalid email" → loop
3. **Lead capture triggered too early**: Tier selection ("track") → "What's your name?" (should only happen on purchase commitment)
4. **Questions not interruptible**: Once in lead capture mode, user questions were not answered

## Solution Overview

**Core principle:** Lead capture must be **interruptible** and **gated to purchase commitment only**.

### Changes Made

#### 1. Created Helper Functions Module (`src/utils/leadflow.ts`)

Testable, deterministic functions to classify user input:

- **`looksLikeQuestion(text)`**: Detects questions (ends with "?" or starts with question words)
- **`hasPricingOrInfoIntent(text)`**: Detects pricing/info queries ("price", "cost", "what's included", etc.)
- **`isAttemptedEmail(text)`**: Checks if text looks like an email attempt (contains "@")
- **`isPlausibleName(text)`**: Validates name (short, no digits, no @, not a question)
- **`isPurchaseCommitment(text)`**: Detects buy intent ("buy", "sign up", "join", "call me", "telegram", etc.)
- **`isValidEmail(text)`**: Validates email format

#### 2. Updated Pending Lead Field Handling (`src/routes/chat.routes.ts`)

Made all pending states **INTERRUPTIBLE**:

**pending=name:**
```typescript
if (looksLikeQuestion(message) || hasPricingOrInfoIntent(message)) {
  // Fall through to answer the question
  // DO NOT consume as name
} else if (isValidEmail(message)) {
  // Accept email, still need name
} else if (isPlausibleName(message)) {
  // Accept name
} else {
  // Ask again
}
```

**pending=email:**
```typescript
if (looksLikeQuestion(message) || hasPricingOrInfoIntent(message) || !isAttemptedEmail(message)) {
  // Fall through to answer the question
  // DO NOT say "invalid email"
} else {
  // User attempted email - validate it
}
```

**pending=budget:**
```typescript
if (looksLikeQuestion(message) || hasPricingOrInfoIntent(message)) {
  // Fall through to answer the question
} else {
  // Process budget
}
```

#### 3. Added Purchase Commitment Gating

Lead capture (name/email) only triggers when:
- User shows purchase commitment (`isPurchaseCommitment()` returns true)
- OR user already provided name/email voluntarily

```typescript
const userShowedCommitment = isPurchaseCommitment(sanitizedMessage) ||
                              (existingLead && (existingLead.name || existingLead.email));

if (userShowedCommitment) {
  // Allow lead capture
} else {
  console.log('[Chat] No purchase commitment - ignoring lead capture trigger');
}
```

**Purchase commitment patterns:**
- buy, purchase, sign up, join, get started
- book, call me, contact
- telegram, whatsapp, meeting
- let's do it, i'm in, yes let's go

**NOT purchase commitment:**
- track, fast track, masterminds (tier selection)
- whats the price, tell me more (exploratory)
- both, compare (informational)

#### 4. Comprehensive Regression Tests (`src/utils/leadflow.test.ts`)

**17 tests covering:**
- Helper function behavior
- Edge cases (escaped quotes, digits in names, etc.)
- **5 regression tests** for reported bugs:
  1. pending=name should not consume "whats the price"
  2. pending=email should not say "invalid email" for "where are you based"
  3. Tier selection ("track") should not trigger lead capture
  4. Purchase intent ("buy track") should trigger lead capture
  5. All questions must be detectable as interruptible

**All tests pass ✅**

## Files Changed

### New Files
- `backend/src/utils/leadflow.ts` - Helper functions (146 lines)
- `backend/src/utils/leadflow.test.ts` - Regression tests (268 lines, 17 tests)

### Modified Files
- `backend/src/routes/chat.routes.ts` - Pending lead handling + purchase gating
- `backend/package.json` - Added test scripts

## Testing

### Run Tests
```bash
cd backend

# Run all tests
npm test

# Run just leadflow tests
npm run test:leadflow
```

### Expected Output
```
✅ All lead flow helper tests passed
# tests 17
# pass 17
# fail 0
```

### Manual Testing Scenarios

#### Scenario 1: Question Interrupts Name Collection
```
User: "vip pricing"
Bot: Shows VIP packages
User: "buy now"
Bot: "What's your name?" [pendingLeadField=name]
User: "whats the price"
Bot: Answers pricing question [INTERRUPTS, does NOT save as name]
```

#### Scenario 2: Question Interrupts Email Collection
```
Bot: "What's your email?" [pendingLeadField=email]
User: "where are you based"
Bot: Answers location question [INTERRUPTS, does NOT say "invalid email"]
```

#### Scenario 3: Tier Selection Does NOT Trigger Lead Capture
```
User: "vip pricing"
Bot: Shows VIP packages
User: "track"
Bot: Shows Fast Track details [DOES NOT ask for name]
```

#### Scenario 4: Purchase Commitment DOES Trigger Lead Capture
```
User: "vip pricing"
Bot: Shows VIP packages
User: "buy track"
Bot: "What's your name?" [Triggers lead capture]
```

#### Scenario 5: Email Provided During Name Collection
```
Bot: "What's your name?" [pendingLeadField=name]
User: "john@example.com"
Bot: "Great! And what's your name?" [Accepts email, still needs name]
```

## Acceptance Criteria - All Met ✅

- ✅ A) pending=name + "whats the price" → Answers question, does NOT save as name
- ✅ B) pending=email + "where are you based" → Answers question, does NOT say "invalid email"
- ✅ C) Tier selection ("track") → Does NOT trigger lead capture
- ✅ D) Purchase commitment ("buy track") → DOES trigger lead capture
- ✅ E) 17 regression tests added and passing

## Key Improvements

### Before Fix
```
User: "vip pricing"
Bot: Shows packages
User: "track"
Bot: "What's your name?" ❌ Too aggressive!
User: "whats the price"
Bot: Saved "whats the price" as name ❌ Loop!
```

### After Fix
```
User: "vip pricing"
Bot: Shows packages
User: "track"
Bot: Shows Fast Track details ✅ Informational
User: "whats the price"
Bot: Answers pricing question ✅ Interruptible
User: "buy it"
Bot: "What's your name?" ✅ Gated to commitment
```

## No Regressions

- ✅ Tool calling preserved
- ✅ Grounding logic intact
- ✅ Existing lead capture for committed users works
- ✅ Contact buttons flow unchanged
- ✅ All TypeScript compiles
- ✅ No network calls in tests (deterministic)

## Monitoring & Logs

New log messages help debug lead flow:

```
[LeadFlow] ⚠️  User asked question during name collection - interrupting to answer
[LeadFlow] ⚠️  User asked question during email collection - interrupting to answer
[Chat] No purchase commitment - ignoring lead capture trigger
[Chat] LLM triggered name collection (purchase commitment detected)
```

## Future Improvements (Optional)

1. Add integration tests with mocked OpenAI responses
2. Track "question interrupt" rate in analytics
3. Add A/B test for commitment threshold tuning
4. Consider asking "Ready to proceed?" before lead capture

## Summary

✅ **Lead capture is now interruptible** - questions always answered
✅ **Lead capture is gated** - only triggers on purchase commitment
✅ **17 regression tests** - bugs won't return
✅ **Zero test dependencies** - uses Node's built-in test runner
✅ **Production-ready** - comprehensive logging for monitoring
