# Dialog State Management Guide

This document explains how the conversation state machine works to prevent FAQ-like loops and handle follow-ups correctly.

## State Machine Overview

The bot uses a priority-based routing system:

```
Priority 1: Pending Lead Field (name/email/budget/contact_choice)
Priority 2: Pending Disambiguation (pricing vs inclusions choice)
Priority 3: Normal Intent Detection (pricing/inclusions/buy/general)
```

## State Types

### 1. Pending Lead Field States

Stored in `metadata.pendingLeadField`:

- `name` - Waiting for user's name
- `email` - Waiting for user's email
- `budget` - Waiting for budget range
- `contact_choice` - Waiting for contact method selection

**Resolution Logic:**

```typescript
if (pendingLeadField === 'name') {
  // Accept any short text unless it looks like a question
  if (!looksLikeQuestion) {
    lead.name = sanitizeName(message);
    reply = "Perfect! What's your email address?";
    metadata.pendingLeadField = 'email';
    pendingResolved = true;
  } else {
    // Clear pending, answer the question normally
    console.log('[LeadFlow] ⚠️ Looks like a question, not a name');
  }
}
```

### 2. Pending Disambiguation State

Stored in `metadata.pendingDisambiguation`:

```typescript
{
  topic: { division: 'code', package: 'lead-intake-crm' },
  askedAt: Date
}
```

**Resolution:**

- `pricing` / `cost` / `how much` → Show pricing
- `included` / `features` / `what do I get` → Show inclusions
- `both` / `everything` / `yes` → Show both
- `no` / `cancel` / new question → Clear pending, answer question

### 3. Contact Method Selection (Non-Blocking)

**Key Feature:** User can ask other questions while `contact_choice` is pending.

**Flow:**

```
Bot: "How would you like to move forward? [buttons]"
     metadata.pendingLeadField = 'contact_choice'

User: "telegram" → Resolves to Telegram button
User: "what is vip?" → Answers question + re-offers buttons
```

**Implementation:**

```typescript
if (pendingLeadField === 'contact_choice') {
  if (detectContactMethodSelection(message)) {
    // Show selected button
    pendingResolved = true;
  } else {
    // User asked something else - clear pending, answer normally
    console.log('[LeadFlow] ⚠️ Different question while contact pending');
    // Fall through to normal routing
  }
}

// In LLM path:
if (existingLead.name && existingLead.email && !existingLead.preferred_contact_channel) {
  llmReply += '\n\nHow would you like to move forward?\n\n[buttons]';
  metadata.pendingLeadField = 'contact_choice';
}
```

## Fuzzy Matching & Typo Tolerance

### Package Aliases

Defined in `PACKAGE_ALIASES`:

```typescript
{
  'content-engine': ['content engine', 'pipeline', 'engine', 'content'],
  'lead-intake-crm': ['crm', 'crm system', 'lead intake', 'lead crm'],
  'ai-outreach': ['outreach', 'ai outreach', 'follow up', 'followup'],
  // ... more
}
```

### Fuzzy Matching Algorithm

**Levenshtein Distance** + **Similarity Score** (0-1 scale)

```typescript
// Example: "ontent engine" matches "content engine"
fuzzyMatch("ontent engine", ["content engine", "pipeline"], 0.75)
// Returns: { match: "content engine", score: 0.85 }
```

**Confidence Scoring:**

- Exact alias match: `confidence = alias.length / message.length`
- Fuzzy match: `confidence = similarity * 0.8` (slightly lower)
- Threshold: 0.5 minimum to avoid false positives

**Example:**

```
User: "ontent engine price"  (missing 'c')
Fuzzy match: "ontent" → "content" (score: 0.875)
Result: content-engine package detected ✅
```

## Context-Aware Topic Resolution

### "and for X?" Pattern

**Rule:** If last intent was pricing, assume pricing request.

```
User: "how much for outreach?"
Bot: [Shows AI Outreach pricing]
     metadata.intent = 'pricing'

User: "and for crm?"
Intent Service: lastIntent === 'pricing' detected
                "and for X?" pattern detected
Result: Shows Lead Intake CRM pricing (NOT disambiguation) ✅
```

**Implementation:**

```typescript
const isAndForPattern = /\b(and|what about) (for |about )/i.test(message);
const shouldDisambiguate = topic.package && !hasPricingIntent(message) &&
                            !(isAndForPattern && lastIntent === 'pricing');

if (shouldDisambiguate) {
  // Ask "pricing or inclusions?"
} else if (isAndForPattern && lastIntent === 'pricing') {
  // Show pricing directly
  const response = pricingResponder.generatePricingResponse(topic);
}
```

## Example Flows

### Flow 1: Buy with Name Like Package

```
User: "content engine price"
Bot: "$3,500 (one-time) + optional $1,000/month"
     metadata.intent = 'pricing'

User: "buy"
Bot: "Excellent! Let's get started. What's your name?"
     metadata.pendingLeadField = 'name'

User: "opus"
Check: looksLikeQuestion? No
Action: Accept as name ✅
Bot: "Perfect! What's your email address?"
     lead.name = 'opus'
     metadata.pendingLeadField = 'email'
```

### Flow 2: Disambiguation with Cancel

```
User: "crm system"
Bot: "Lead Intake & CRM helps with lead intake and CRM automation. Do you want pricing or what's included?"
     metadata.pendingDisambiguation = { topic: {...} }

User: "what is vip?"  (new question, not pricing/inclusions)
Check: detectDisambiguationResolution() → null (new question detected)
Action: Clear pending, answer question ✅
Bot: [Explains VIP division]
     (no pendingDisambiguation)
```

### Flow 3: Contact Method Non-Blocking

```
User: "buy"
... [name and email collected] ...
Bot: "Great! How would you like to move forward?
     {{BTN_MEETING}}
     {{BTN_WHATSAPP}}
     {{BTN_TELEGRAM}}
     {{BTN_CONTACT_FORM}}
     {{BTN_CALL_US}}"
     metadata.pendingLeadField = 'contact_choice'

User: "what's included in masterminds?"
Check: detectContactMethodSelection() → null
Action: Clear pending, answer question, re-offer buttons ✅
Bot: [Lists Masterminds inclusions]

     How would you like to move forward?
     [buttons]
     metadata.pendingLeadField = 'contact_choice'
```

### Flow 4: Fuzzy Match Typo

```
User: "ow much for ontent engine?"  (typos: "ow" and "ontent")
Intent: detectIntent() → 'pricing' (typo-tolerant: "ow much")
Topic: extractTopic() → fuzzy match:
       "ontent" matches "content" (score: 0.875)
       Detected: content-engine package ✅
Bot: "$3,500 (one-time) + optional $1,000/month"
```

### Flow 5: "and for X?" Pricing Context

```
User: "how much for outreach?"
Bot: "$1,350 (one-time) + optional $550/month"
     metadata.intent = 'pricing'

User: "and for crm?"
Check: lastIntent === 'pricing' ✅
       isAndForPattern === true ✅
Action: Show pricing (NOT disambiguation) ✅
Bot: "$950 (one-time) + optional $299/month"
```

## Logging

### State Changes

```
[LeadFlow] 🔄 PENDING LEAD FIELD FOUND: name
[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE: name
[LeadFlow] ✅ pending=name resolved, saved name: opus
[LeadFlow] ⚠️ Looks like a question, not a name - clearing pending state
[LeadFlow] ⚠️ Different question while contact_choice pending - clearing state
```

### Intent & Topic

```
[Chat] Intent: pricing | Topic: {"division":"code","package":"ai-outreach"}
[Chat] Last Intent: pricing | Pending Disambiguation: false
[Intent] "and for X?" pattern detected - keyword: crm lastIntent: pricing
[Intent] Package detected via alias/fuzzy match: content-engine confidence: 0.85
```

### Disambiguation

```
[Chat] 🔄 PENDING DISAMBIGUATION STATE FOUND: {...}
[Chat] ✓ RESOLVING PENDING DISAMBIGUATION
[Chat] 📊 Disambiguation choice: both | Topic: {...}
[Chat] ⚠️ User canceled disambiguation or asked new question - clearing state
```

## Acceptance Tests

| Test | Input | Expected | Status |
|------|-------|----------|--------|
| Typo tolerance | "ontent engine price" | Content Engine pricing | ✅ |
| Name not topic | "buy" → "opus" | Asks for email | ✅ |
| Disambiguation cancel | "crm system" → ask → new Q | Answers new Q | ✅ |
| "and for X?" pricing | "outreach price" → "and for crm?" | CRM pricing | ✅ |
| Contact non-blocking | Buttons → "what is vip?" | Answers + re-shows buttons | ✅ |
| Alias matching | "crm" / "crm system" | lead-intake-crm | ✅ |

## Key Improvements

1. **No More Loops:** Disambiguation and contact selection clear pending when user changes topic
2. **Typo Tolerance:** Fuzzy matching handles missing letters ("ontent" → "content")
3. **Context Awareness:** "and for X?" after pricing assumes pricing intent
4. **Non-Blocking UX:** Users can ask questions at any time, even during contact selection
5. **Smart Name Detection:** Checks if input looks like question before accepting as name
6. **Alias Support:** Multiple ways to refer to same package ("crm" / "lead intake" / "crm system")

All routing remains deterministic and generalizable—no hardcoded Q&A pairs.
