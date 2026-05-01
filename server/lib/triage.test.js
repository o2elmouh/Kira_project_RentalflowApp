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
  it('fails a generic marketing newsletter (ngrok-style)', () => {
    const email = `Seven new ngrok ideas need your vote
Agent tool calls, MCP fan-out, multi-model routing.
AI Gateway BYOK is now private by default. Your app sends an AI Gateway key
and we attach your OpenAI, Anthropic, or other provider keys as they pass through.
Stack up to 15 keys per provider for failover. Learn how BYOK works automatically.`
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

  // ── AMBIGUOUS cases ──────────────────────────────────────
  it('marks ambiguous when one medium keyword is present as a standalone word', () => {
    expect(preFilter('My car broke down yesterday').result).toBe('ambiguous')
  })

  // ── Arabic ───────────────────────────────────────────────
  it('passes on an Arabic rental inquiry', () => {
    expect(preFilter('بغيت نكري سيارة ليوم غد').result).toBe('pass')
  })
})
