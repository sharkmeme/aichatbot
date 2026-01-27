# Production Bugs Fix - Lead Resumption & Call Misinterpretation

## Bugs Fixed

### Bug 1: Lead Capture Does Not Resume After Interruption

**Problem:**
When user provided name (e.g., "Dagobert"), then asked an interrupting question ("are you a legal company?"), the bot answered the question but **never resumed asking for email**. The lead flow was lost.

**Root Cause:**
- When a question interrupted lead capture, we correctly answered it (fell through to normal routing)
- But we didn't check afterward if lead was incomplete and needed resumption
- Result: Lead with name but no email was abandoned

**Fix:**
Added resumption logic after LLM responds to questions (lines ~927-954 in chat.routes.ts):

```typescript
// RESUME LEAD CAPTURE AFTER INTERRUPTION
// If we answered a question (didn't set pending field yet) but have incomplete lead, resume
if (!metadata.pendingLeadField && !pendingResolved && existingLead) {
  const hasName = !!existingLead.name;
  const hasEmail = !!existingLead.email;
  const hasContact = !!existingLead.preferred_contact_channel;

  // Resume based on what's missing
  if (hasName && !hasEmail) {
    console.log('[LeadFlow] 📝 Resuming after interruption - asking for email');
    reply += "\n\nWhat's your email address?";
    metadata.pendingLeadField = 'email';
  } else if (hasEmail && !hasName) {
    console.log('[LeadFlow] 📝 Resuming after interruption - asking for name');
    reply += "\n\nWhat's your name?";
    metadata.pendingLeadField = 'name';
  } else if (hasName && hasEmail && !hasContact) {
    console.log('[LeadFlow] 📝 Resuming after interruption - asking for contact choice');
    reply += "\n\nHow would you like to move forward?\n\n{{BTN_MEETING}}...";
    metadata.pendingLeadField = 'contact_choice';
  }
}
```

**Expected Behavior After Fix:**
```
Bot: "What's your name?" [pending=name]
User: "Dagobert"
Bot: "Perfect! What's your email address?" [pending=email]
User: "are you a legal company?"
Bot: "Yes, we're an SRL under Romanian law.\n\nWhat's your email address?" ✅ RESUMES
[LeadFlow] 📝 Resuming after interruption - asking for email
```

**Logs to Verify:**
```
[LeadFlow] 📝 Resuming after interruption - asking for email
```
OR
```
[LeadFlow] 📝 Resuming after interruption - asking for name
```
OR
```
[LeadFlow] 📝 Resuming after interruption - asking for contact choice
```

---

### Bug 2: "call" Misinterpreted as "phone-support" Package

**Problem:**
When qualified user (has name+email) typed "call", the system:
1. Routed through topic extraction
2. Matched "call" to package "phone-support"
3. Started explaining phone-support package instead of showing call button
4. Never showed {{BTN_CALL_US}}

**Root Cause:**
- No priority check for contact method selection before topic extraction
- "call" keyword was being processed by vague topic fallback and matched to a package

**Fix:**
Added **PRIORITY 2.6** contact method selection check BEFORE topic extraction (lines ~733-756 in chat.routes.ts):

```typescript
// PRIORITY 2.6: Handle direct contact method selection (call/telegram/whatsapp/meeting)
// This MUST come before topic extraction to prevent "call" from being matched to "phone-support" package
if (!pendingResolved) {
  const selectedContact = detectContactMethodSelection(sanitizedMessage);

  if (selectedContact && existingLead && existingLead.name && existingLead.email) {
    console.log('[Chat] 🎯 Contact method selected by qualified lead:', selectedContact);

    const buttonMap: Record<string, string> = {
      'telegram': '{{BTN_TELEGRAM}}',
      'whatsapp': '{{BTN_WHATSAPP}}',
      'meeting': '{{BTN_MEETING}}',
      'contact_form': '{{BTN_CONTACT_FORM}}',
      'call': '{{BTN_CALL_US}}'
    };

    const contactName = selectedContact.charAt(0).toUpperCase() + selectedContact.slice(1).replace('_', ' ');
    reply = `Tap the ${contactName} button below.\n\n${buttonMap[selectedContact]}`;

    lead = enhanceLeadFromTopic(null, {}, existingLead);
    lead.preferred_contact_channel = selectedContact;
    pendingResolved = true;
    metadata.intent = 'contact_selection';
  }
}
```

**Key Changes:**
1. Checks for contact method keywords **before** topic extraction
2. Only applies if lead is qualified (has name+email)
3. Directly shows appropriate button
4. Sets `pendingResolved = true` to bypass topic/intent logic
5. Sets `metadata.intent = 'contact_selection'` for analytics

**Expected Behavior After Fix:**
```
[Qualified lead with name+email exists]
User: "call"
[Chat] 🎯 Contact method selected by qualified lead: call
Bot: "Tap the Call button below.\n\n{{BTN_CALL_US}}" ✅ NO package matching!
```

**Logs to Verify:**
```
[Chat] 🎯 Contact method selected by qualified lead: call
```
OR
```
[Chat] 🎯 Contact method selected by qualified lead: telegram
```

**Logs that should NOT appear:**
```
❌ [Chat] Topic: {package: "phone-support"}
❌ [Chat] Intent: vague_topic
```

---

## Manual Testing Scenarios

### Test 1: Lead Resumption After Interruption
```
1. Start fresh conversation
2. User: "buy vip"
3. Bot: "What's your name?" [pending=name]
4. User: "Dagobert"
5. Bot: "Perfect! What's your email?" [pending=email]
6. User: "are you a legal company?"
7. ✅ Bot: Answers question + "\n\nWhat's your email address?" [RESUMES]
8. ✅ Check logs: [LeadFlow] 📝 Resuming after interruption - asking for email
```

### Test 2: "call" Shows Button (Not Package)
```
1. Existing lead: name="John", email="john@example.com"
2. User: "call"
3. ✅ Bot: "Tap the Call button below.\n\n{{BTN_CALL_US}}"
4. ✅ Check logs: [Chat] 🎯 Contact method selected by qualified lead: call
5. ❌ Should NOT see: [Chat] Topic: {package: "phone-support"}
```

### Test 3: "telegram" Shows Button (Qualified Lead)
```
1. Existing lead: name="Maria", email="maria@test.com"
2. User: "telegram"
3. ✅ Bot: "Tap the Telegram button below.\n\n{{BTN_TELEGRAM}}"
4. ✅ Check logs: [Chat] 🎯 Contact method selected by qualified lead: telegram
```

### Test 4: Multiple Interruptions Resume Correctly
```
1. Bot: "What's your name?" [pending=name]
2. User: "Alex"
3. Bot: "Perfect! What's your email?" [pending=email]
4. User: "whats the price"
5. ✅ Bot: Answers + "\n\nWhat's your email address?" [RESUMES]
6. User: "where are you based"
7. ✅ Bot: Answers + "\n\nWhat's your email address?" [RESUMES AGAIN]
8. User: "alex@example.com"
9. ✅ Bot: Shows contact buttons
```

---

## Code Changes Summary

### File: `src/routes/chat.routes.ts`

**Change 1: Lead Resumption Logic (after line 926)**
- Added check for incomplete lead after LLM responds
- Appends appropriate question to resume lead flow
- Sets `metadata.pendingLeadField` based on missing field

**Change 2: Contact Method Priority Check (before line 733)**
- Added PRIORITY 2.6 section for contact method selection
- Runs BEFORE topic extraction to prevent package matching
- Only applies to qualified leads (name+email present)
- Directly shows button token, bypasses normal routing

### No Other Files Changed

---

## Expected Logs

### Successful Lead Resumption:
```
[Chat] User message inserted
[Chat] Step 3: Get recent messages...
[LeadFlow] No pending lead field
[Chat] → Using LLM with tool calling for response generation
[LLM] Got final response (no more tool calls)
[LeadFlow] 📝 Resuming after interruption - asking for email  ✅
[Chat] ✅ Lead saved successfully - ID: 123, Email: none
```

### Successful "call" Handling:
```
[Chat] User message inserted
[Chat] Step 3: Get recent messages...
[LeadFlow] No pending lead field
[Chat] 🎯 Contact method selected by qualified lead: call  ✅
[Chat] ✅ Lead saved successfully - ID: 123, Email: john@example.com
[Chat] Bot message inserted with metadata: {"intent":"contact_selection",...}
```

---

## Verification Checklist

- ✅ TypeScript compiles without errors
- ✅ Resume logic adds question to reply
- ✅ Resume logic sets pendingLeadField
- ✅ Contact method selection bypasses topic extraction
- ✅ "call" shows {{BTN_CALL_US}} not package info
- ✅ Only applies to qualified leads (name+email)
- ✅ Logs clearly indicate resumption and contact selection

---

## Edge Cases Handled

1. **Lead has email but no name**: Resumes asking for name ✅
2. **Lead has both but no contact**: Resumes with contact buttons ✅
3. **User says "call" but not qualified**: Falls through to normal routing (may ask for name first) ✅
4. **Multiple questions interrupt lead flow**: Resumes after each one ✅
5. **Contact method during pending state**: Handled by existing contact_choice logic ✅

---

## Rollback Plan (If Needed)

If these changes cause issues:

1. Locate the two added sections:
   - Search for "RESUME LEAD CAPTURE AFTER INTERRUPTION"
   - Search for "PRIORITY 2.6: Handle direct contact method selection"

2. Comment out or remove these sections

3. Redeploy

The changes are isolated and additive - removing them reverts to previous behavior.
