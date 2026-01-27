/**
 * Regression tests for lead flow helpers
 * Run with: node --test src/utils/leadflow.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  looksLikeQuestion,
  hasPricingOrInfoIntent,
  isAttemptedEmail,
  isPlausibleName,
  isPurchaseCommitment,
  isValidEmail
} from './leadflow';

// Test looksLikeQuestion
test('looksLikeQuestion - detects questions', () => {
  assert.strictEqual(looksLikeQuestion('whats the price'), true);
  assert.strictEqual(looksLikeQuestion("what's the price"), true);
  assert.strictEqual(looksLikeQuestion('price?'), true);
  assert.strictEqual(looksLikeQuestion('where are you based'), true);
  assert.strictEqual(looksLikeQuestion('how does it work'), true);
  assert.strictEqual(looksLikeQuestion('can you help me'), true);
  assert.strictEqual(looksLikeQuestion('is this available'), true);
  assert.strictEqual(looksLikeQuestion('tell me more'), true);
});

test('looksLikeQuestion - non-questions', () => {
  assert.strictEqual(looksLikeQuestion('John Smith'), false);
  assert.strictEqual(looksLikeQuestion('track'), false);
  assert.strictEqual(looksLikeQuestion('buy now'), false);
  assert.strictEqual(looksLikeQuestion('telegram'), false);
});

// Test hasPricingOrInfoIntent
test('hasPricingOrInfoIntent - detects pricing queries', () => {
  assert.strictEqual(hasPricingOrInfoIntent('whats the price'), true);
  assert.strictEqual(hasPricingOrInfoIntent('how much does it cost'), true);
  assert.strictEqual(hasPricingOrInfoIntent('pricing please'), true);
  assert.strictEqual(hasPricingOrInfoIntent("what's included"), true);
  assert.strictEqual(hasPricingOrInfoIntent('tell me about the packages'), true);
  assert.strictEqual(hasPricingOrInfoIntent('compare them'), true);
  assert.strictEqual(hasPricingOrInfoIntent('difference between them'), true);
});

test('hasPricingOrInfoIntent - non-pricing', () => {
  assert.strictEqual(hasPricingOrInfoIntent('John Smith'), false);
  assert.strictEqual(hasPricingOrInfoIntent('track'), false);
  assert.strictEqual(hasPricingOrInfoIntent('buy now'), false);
  assert.strictEqual(hasPricingOrInfoIntent('telegram'), false);
});

// Test isAttemptedEmail
test('isAttemptedEmail - detects emails', () => {
  assert.strictEqual(isAttemptedEmail('john@example.com'), true);
  assert.strictEqual(isAttemptedEmail('test@test.co'), true);
  assert.strictEqual(isAttemptedEmail('user.name@company.com'), true);
});

test('isAttemptedEmail - non-emails', () => {
  assert.strictEqual(isAttemptedEmail('John Smith'), false);
  assert.strictEqual(isAttemptedEmail('whats the price'), false);
  assert.strictEqual(isAttemptedEmail('track'), false);
  assert.strictEqual(isAttemptedEmail('where are you based'), false);
});

// Test isPlausibleName
test('isPlausibleName - valid names', () => {
  assert.strictEqual(isPlausibleName('John'), true);
  assert.strictEqual(isPlausibleName('John Smith'), true);
  assert.strictEqual(isPlausibleName('Maria Garcia Lopez'), true);
  assert.strictEqual(isPlausibleName('Alex'), true);
});

test('isPlausibleName - invalid names (questions)', () => {
  assert.strictEqual(isPlausibleName('whats the price'), false);
  assert.strictEqual(isPlausibleName("what's the price"), false);
  assert.strictEqual(isPlausibleName('price?'), false);
  assert.strictEqual(isPlausibleName('where are you based'), false);
  assert.strictEqual(isPlausibleName('how much'), false);
  assert.strictEqual(isPlausibleName('can you help'), false);
});

test('isPlausibleName - invalid names (other)', () => {
  assert.strictEqual(isPlausibleName('john@example.com'), false); // email
  assert.strictEqual(isPlausibleName('User123'), false); // digits
  assert.strictEqual(isPlausibleName('This is a very long name that exceeds forty characters total'), false); // too long
  assert.strictEqual(isPlausibleName('one two three four five'), false); // too many words
});

// Test isPurchaseCommitment
test('isPurchaseCommitment - detects commitment', () => {
  assert.strictEqual(isPurchaseCommitment('buy now'), true);
  assert.strictEqual(isPurchaseCommitment('sign up'), true);
  assert.strictEqual(isPurchaseCommitment('join'), true);
  assert.strictEqual(isPurchaseCommitment('get started'), true);
  assert.strictEqual(isPurchaseCommitment('book a meeting'), true);
  assert.strictEqual(isPurchaseCommitment('call me'), true);
  assert.strictEqual(isPurchaseCommitment('telegram'), true);
  assert.strictEqual(isPurchaseCommitment('whatsapp'), true);
  assert.strictEqual(isPurchaseCommitment("let's do it"), true);
  assert.strictEqual(isPurchaseCommitment("i'm in"), true);
  assert.strictEqual(isPurchaseCommitment("yes let's go"), true);
});

test('isPurchaseCommitment - non-commitment', () => {
  assert.strictEqual(isPurchaseCommitment('track'), false);
  assert.strictEqual(isPurchaseCommitment('fast track'), false);
  assert.strictEqual(isPurchaseCommitment('masterminds'), false);
  assert.strictEqual(isPurchaseCommitment('whats the price'), false);
  assert.strictEqual(isPurchaseCommitment('where are you based'), false);
  assert.strictEqual(isPurchaseCommitment('tell me more'), false);
  assert.strictEqual(isPurchaseCommitment('both'), false);
});

// Test isValidEmail
test('isValidEmail - valid emails', () => {
  assert.strictEqual(isValidEmail('john@example.com'), true);
  assert.strictEqual(isValidEmail('test@test.co'), true);
  assert.strictEqual(isValidEmail('user.name+tag@example.com'), true);
});

test('isValidEmail - invalid emails', () => {
  assert.strictEqual(isValidEmail('not an email'), false);
  assert.strictEqual(isValidEmail('missing@domain'), false);
  assert.strictEqual(isValidEmail('@example.com'), false);
  assert.strictEqual(isValidEmail('user@'), false);
});

// Regression test cases from actual bugs
test('REGRESSION: pending=name should not consume questions', () => {
  // Bug: "whats the price" was saved as name
  assert.strictEqual(isPlausibleName('whats the price'), false);
  assert.strictEqual(looksLikeQuestion('whats the price'), true);
  assert.strictEqual(hasPricingOrInfoIntent('whats the price'), true);

  // Other question variants
  assert.strictEqual(isPlausibleName('what is the price'), false);
  assert.strictEqual(isPlausibleName('price?'), false);
  assert.strictEqual(isPlausibleName('how much'), false);
});

test('REGRESSION: pending=email should detect non-emails', () => {
  // Bug: "where are you based" triggered "invalid email"
  assert.strictEqual(isAttemptedEmail('where are you based'), false);
  assert.strictEqual(looksLikeQuestion('where are you based'), true);

  // Other non-email questions
  assert.strictEqual(isAttemptedEmail('whats included'), false);
  assert.strictEqual(isAttemptedEmail('tell me more'), false);
  assert.strictEqual(isAttemptedEmail('are you a company'), false);
});

test('REGRESSION: tier selection should not trigger lead capture', () => {
  // Bug: selecting "track" triggered "What's your name?"
  assert.strictEqual(isPurchaseCommitment('track'), false);
  assert.strictEqual(isPurchaseCommitment('fast track'), false);
  assert.strictEqual(isPurchaseCommitment('masterminds'), false);
  assert.strictEqual(isPurchaseCommitment('both'), false);

  // But explicit buy intent should
  assert.strictEqual(isPurchaseCommitment('buy track'), true);
  assert.strictEqual(isPurchaseCommitment('sign up for masterminds'), true);
});

test('REGRESSION: questions always interruptible', () => {
  // Any question should be detectable
  const questions = [
    'whats the price',
    'where are you based',
    'what is included',
    'how does it work',
    'can you help me',
    'price?',
    'tell me more',
    'are you a company'
  ];

  for (const q of questions) {
    assert.strictEqual(
      looksLikeQuestion(q) || hasPricingOrInfoIntent(q),
      true,
      `"${q}" should be detected as question or info intent`
    );
  }
});

console.log('✅ All lead flow helper tests passed');
