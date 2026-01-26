# Lead Flow Regression Tests

This document demonstrates the lead flow state management fixes.

## Test 1: Buy Flow with Package-Like Name

**Scenario:** User wants to buy, provides name "Opus" (could be confused with package)

```
User: content engine price
Bot: [Shows Content Engine pricing - $3,500 (one-time) + optional $1,000/month]
     metadata: { intent: 'pricing' }

User: buy
Bot: "Excellent! Let's get started. What's your name?"
     metadata: { intent: 'buy', pendingLeadField: 'name' }

User: opus
Bot: [CHECKS PENDING FIELD FIRST - bypasses intent/topic detection]
     "Perfect! What's your email address?"
     metadata: { pendingLeadField: 'email' }
     lead: { name: 'opus' }
     Log: [LeadFlow] ✅ pending=name resolved, saved name: opus

User: opus@test.com
Bot: "Great! How would you like to move forward?

     {{BTN_MEETING}}
     {{BTN_WHATSAPP}}
     {{BTN_TELEGRAM}}
     {{BTN_CONTACT_FORM}}
     {{BTN_CALL_US}}"
     metadata: { pendingLeadField: 'contact_choice' }
     lead: { name: 'opus', email: 'opus@test.com' }
     Log: [LeadFlow] ✅ pending=email resolved, saved email: opus@test.com
```

**Result:** ✅ PASS - "opus" treated as name, not package


## Test 2: Name Collision with Package Name

**Scenario:** User's actual name is "Growth" (exact package name)

```
User: buy
Bot: "Excellent! Let's get started. What's your name?"
     metadata: { intent: 'buy', pendingLeadField: 'name' }

User: Growth
Bot: [PENDING FIELD ACTIVE - no intent detection]
     "Perfect! What's your email address?"
     metadata: { pendingLeadField: 'email' }
     lead: { name: 'Growth' }
     Log: [LeadFlow] ✅ pending=name resolved, saved name: Growth
```

**Result:** ✅ PASS - "Growth" treated as name, not routed to package pricing


## Test 3: Invalid Email Validation

**Scenario:** User provides invalid email format

```
User: buy
Bot: "Excellent! Let's get started. What's your name?"
     metadata: { pendingLeadField: 'name' }

User: John
Bot: "Perfect! What's your email address?"
     metadata: { pendingLeadField: 'email' }
     lead: { name: 'John' }

User: invalid@
Bot: [Validates with isValidEmail() - fails]
     "That doesn't look like a valid email. Please enter your email address (e.g., name@company.com)."
     metadata: { pendingLeadField: 'email' }  [KEEPS PENDING]
     Log: [LeadFlow] ❌ Invalid email format: invalid@

User: john@company.com
Bot: "Great! How would you like to move forward?..."
     metadata: { pendingLeadField: 'contact_choice' }
     lead: { name: 'John', email: 'john@company.com' }
     Log: [LeadFlow] ✅ pending=email resolved, saved email: john@company.com
```

**Result:** ✅ PASS - Invalid email caught, re-asks, accepts valid format


## Test 4: Contact Method Selection

**Scenario:** User selects Telegram after lead qualification

```
User: [name and email already provided]
Bot: "Great! How would you like to move forward?

     {{BTN_MEETING}}
     {{BTN_WHATSAPP}}
     {{BTN_TELEGRAM}}
     {{BTN_CONTACT_FORM}}
     {{BTN_CALL_US}}"
     metadata: { pendingLeadField: 'contact_choice' }

User: telegram
Bot: [PENDING FIELD ACTIVE - detects contact method]
     "Tap the Telegram button below.

     {{BTN_TELEGRAM}}"
     lead: { ..., preferred_contact_channel: 'telegram' }
     Log: [LeadFlow] ✅ pending=contact_choice resolved, selected: telegram
```

**Result:** ✅ PASS - Correct wording (no "I'll contact you"), shows button marker


## Test 5: Budget Normalization

**Scenario:** User provides exact price as budget

```
User: [in budget flow]
Bot: "What's your budget range?"
     metadata: { pendingLeadField: 'budget' }

User: $1,350 (one-time)
Bot: [Normalizes to category]
     "Thanks! What's your name?"
     metadata: { pendingLeadField: 'name' }
     lead: {
       budget_range: '$1-5K',  [NORMALIZED CATEGORY]
       notes: 'Budget mentioned: $1,350 (one-time)'  [RAW VALUE IN NOTES]
     }
     Log: [LeadFlow] ✅ pending=budget resolved, normalized to: $1-5K
```

**Result:** ✅ PASS - Budget normalized to category, exact value in notes


## Priority Verification

**Pending Lead Field State Priority (from chat.routes.ts:307-407):**

```typescript
// PRIORITY 1: Handle pending lead field (bypasses ALL intent/topic logic)
if (pendingLeadField) {
  console.log('[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE:', pendingLeadField);
  // ... handle name/email/budget/contact_choice ...
}
// PRIORITY 2+: Normal intent/topic routing
else {
  intent = intentService.detectIntent(sanitizedMessage, !!pendingDisambiguation);
  topic = intentService.extractTopic(sanitizedMessage, recentMessages, lastIntent);
  // ... rest of routing ...
}
```

This ensures:
- When `pendingLeadField` exists → skip `detectIntent()` entirely
- No risk of package names triggering disambiguation
- Lead flow is deterministic and predictable

## Logging Examples

```
[LeadFlow] 🔄 PENDING LEAD FIELD FOUND: name
[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE: name
[LeadFlow] ✅ pending=name resolved, saved name: opus
[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE: email
[LeadFlow] ❌ Invalid email format: not-an-email
[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE: email
[LeadFlow] ✅ pending=email resolved, saved email: test@test.com
[LeadFlow] ✨ PENDING LEAD FIELD ACTIVE: contact_choice
[LeadFlow] ✅ pending=contact_choice resolved, selected: telegram
```

All regression tests: ✅ PASS
