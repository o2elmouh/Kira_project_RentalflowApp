import Anthropic from '@anthropic-ai/sdk'
import supabaseAdmin from './supabaseAdmin.js'
import { appendConversation } from './conversation.js'

// Singleton — avoids re-instantiating on every call
let _anthropic = null
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// Fast keyword pre-check — unambiguous replies resolved without AI.
// Single-word/single-phrase only; anything with follow-on text goes to the AI.
const ACCEPT_RE = /^\s*(ok|okay|oui|wakha|wax|mwafaq|ça marche|d'accord|je prends|go|yep|yes|نعم|واخا|موافق|ايه)\s*[!.,،]*\s*$/iu
const REJECT_RE = /^\s*(non|no|la|laa|annuler|trop cher|pas intéressé|لا|ماشي|مش|مهتمش)\s*[!.,،]*\s*$/iu

/**
 * Analyze a client's reply to a quote offer.
 * Keyword pre-check runs first — simple affirmatives/negatives never reach the AI.
 * Returns: 'accepted' | 'rejected' | 'question'
 */
export async function analyzeQuoteReply(text) {
  const t = (text || '').trim()
  if (ACCEPT_RE.test(t)) return 'accepted'
  if (REJECT_RE.test(t)) return 'rejected'
  if (!process.env.ANTHROPIC_API_KEY) return 'question'
  try {
    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      temperature: 0,
      system: `You analyze client replies to car rental quote offers. The client may write in French or Moroccan Darija.
Return ONLY valid JSON with a single key "intent". No markdown, no explanation.
Rules:
- "accepted": client clearly agrees (oui, wakha, mwafaq, ça marche, ok, d'accord, je prends, okay, واخا, etc.)
- "rejected": client clearly refuses (non, la, trop cher, annuler, لا, etc.)
- "question": anything else — questions, negotiations, unclear messages`,
      messages: [{ role: 'user', content: text }],
    })
    const raw = message.content?.[0]?.text?.trim() ?? ''
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(clean)
    return ['accepted', 'rejected', 'question'].includes(parsed.intent) ? parsed.intent : 'question'
  } catch (err) {
    console.error('[quoteAnalysis/analyzeQuoteReply] error:', err.message)
    return 'question'
  }
}

/**
 * Handle a client reply to a pending quote offer.
 * Checks if the sender has an offer_sent lead; if so, runs intent analysis and updates status.
 * Returns the matched leadId if handled, null if no offer_sent lead was found.
 */
export async function handleQuoteReply(agencyId, senderJid, text) {
  console.log(`[pipeline:reply] ← client reply | agency=${agencyId} | sender=${senderJid} | text="${(text || '').slice(0, 80)}"`)
  try {
    const digits9 = (senderJid || '').replace(/\D/g, '').slice(-9)
    if (!digits9) { console.warn('[pipeline:reply] ✗ could not extract digits from senderJid'); return null }

    const { data: leads } = await supabaseAdmin
      .from('pending_demands')
      .select('id, sender_id')
      .eq('agency_id', agencyId)
      .eq('status', 'offer_sent')
      .order('created_at', { ascending: false })
      .limit(20)

    const matched = (leads || []).find(l =>
      (l.sender_id || '').replace(/\D/g, '').slice(-9) === digits9
    )
    if (!matched) {
      console.log(`[pipeline:reply] → no offer_sent lead found for ${senderJid} — treating as new message`)
      return null
    }
    console.log(`[pipeline:reply] → matched lead id=${matched.id}`)

    const intent = await analyzeQuoteReply(text)
    console.log(`[pipeline:reply] → intent: ${intent} (keyword or AI)`)

    appendConversation(matched.id, { role: 'client', type: 'message', text: text.slice(0, 1000) })
      .catch(err => console.error('[pipeline:reply] conv log error:', err.message))

    if (intent === 'question') {
      await supabaseAdmin
        .from('pending_demands')
        .update({ last_client_note: text.slice(0, 500) })
        .eq('id', matched.id)
      console.log(`[pipeline:reply] → question noted on lead ${matched.id} — no status change`)
      return null
    }

    const newStatus = intent === 'accepted' ? 'accepted' : 'ignored'
    await supabaseAdmin
      .from('pending_demands')
      .update({ status: newStatus, last_client_note: text.slice(0, 500) })
      .eq('id', matched.id)
    console.log(`[pipeline:reply] ✓ lead ${matched.id} → ${newStatus}`)
    return matched.id
  } catch (err) {
    console.error('[pipeline:reply] ✗ error:', err.message)
    return null
  }
}
