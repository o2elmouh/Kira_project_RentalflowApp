import { describe, it, expect } from 'vitest'
import { preFilter } from './triage.js'

describe('preFilter', () => {
  // ── PASS cases ───────────────────────────────────────────
  it('passes on a clear rental inquiry (high keyword)', () => {
    expect(preFilter('Je voudrais louer une voiture pour 3 jours').result).toBe('pass')
  })

  it('passes on an English rental request', () => {
    expect(preFilter('I want to rent a car for the weekend').result).toBe('pass')
  })

  it('passes with two medium keywords', () => {
    expect(preFilter("bonjour j'ai un accident avec ma voiture").result).toBe('pass')
  })

  // ── FAIL cases ───────────────────────────────────────────
  it('fails a generic marketing newsletter (ngrok short form)', () => {
    const email = `Seven new ngrok ideas need your vote
Agent tool calls, MCP fan-out, multi-model routing.
AI Gateway BYOK is now private by default. Your app sends an AI Gateway key
and we attach your OpenAI, Anthropic, or other provider keys as they pass through.
Stack up to 15 keys per provider for failover. Learn how BYOK works automatically.`
    expect(preFilter(email).result).toBe('fail')
  })

  it('fails the full ngrok email including "in the last week" phrase', () => {
    const email = `Seven new ngrok ideas need your vote
Agent tool calls, MCP fan-out, multi-model routing. Here's what changed.
AI Gateway BYOK is now private by default. Now, it always requires an AI Gateway key.
Your app sends an AI Gateway key and we attach your OpenAI, Anthropic, or other provider keys.
Stack up to 15 keys per provider for failover.
At ngrok, we have this thing called product feedback interlock every Tuesday,
where we talk through all the user feedback we've heard in the last week.
I'll make sure yours lands there too. ~ Joel at ngrok`
    expect(preFilter(email).result).toBe('fail')
  })

  it('fails on a generic email mentioning "automatically"', () => {
    expect(preFilter('Your export will be processed automatically within 24 hours.').result).toBe('fail')
  })

  it('fails when "rent" appears only as a substring (e.g. "different")', () => {
    expect(preFilter('We offer a different approach to cloud infrastructure.').result).toBe('fail')
  })

  it('fails when "auto" appears only as a substring (e.g. "automation")', () => {
    expect(preFilter('Our automation platform helps teams ship faster.').result).toBe('fail')
  })

  it('fails when "car" appears only as a substring (e.g. "discard")', () => {
    expect(preFilter('Please discard this draft and start over.').result).toBe('fail')
  })

  it('fails on a Google I/O marketing email — keywords inside URLs/emails must be ignored', () => {
    const email = `Gemini just got a major upgrade Meet the latest innovations we announced at Google I/O 2026.
Come see what's new<<https://c.gle/AOExmq3dhvH5UCoyzGJxqS6HMtNeJ7A1>>
Fast and more efficient. Crush your to-do list and handle challenging projects quickly.
Try our latest model<<https://c.gle/AOExmq1JShNJi65jcfj3vc4K2Pd7_F-uyjjNNMQzjyg4Y-12TeSVe46_cbisTkF8YQos>>
Add google-gemini-noreply@google.com to your address book to ensure you receive Gemini emails.
This message was sent to kira.boost.ai@gmail.com to keep you up to date.
unsubscribe here<https://myaccount.google.com/communication-preferences/unsubscribe/gt/AOExmq19hyXcMY50ekoaJvaY15NgveVizdY5xd6CuBW3?utm_source=gm&utm_medium=email&auto=true>.`
    expect(preFilter(email).result).toBe('fail')
  })

  // ── AMBIGUOUS cases ──────────────────────────────────────
  it('marks ambiguous when one medium keyword is present as a standalone word', () => {
    expect(preFilter('My car broke down yesterday').result).toBe('ambiguous')
  })

  // ── Arabic ───────────────────────────────────────────────
  it('passes on an Arabic rental inquiry', () => {
    expect(preFilter('بغيت نكري سيارة ليوم غد').result).toBe('pass')
  })
})
