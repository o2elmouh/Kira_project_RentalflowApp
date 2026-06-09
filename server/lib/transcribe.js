/**
 * Audio transcription via OpenAI Whisper.
 *
 * Used by the Baileys inbound listener to convert WhatsApp voice notes
 * (audioMessage / pttMessage) into text so they flow through the same
 * triage + classification pipeline as regular text messages.
 *
 * Returns null when:
 *   - OPENAI_API_KEY is not set (transcription disabled — caller falls back)
 *   - The API errors out (logged, treated as transient)
 *   - The input buffer is empty
 *
 * On success returns the transcribed text (string).
 */
import OpenAI from 'openai'

let _client = null
function getClient() {
  if (_client) return _client
  if (!process.env.OPENAI_API_KEY) return null
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

/**
 * @param {Buffer} buffer    — raw audio bytes
 * @param {string} mimeType  — e.g. "audio/ogg; codecs=opus"
 * @returns {Promise<string|null>}
 */
export async function transcribeAudio(buffer, mimeType) {
  if (!buffer || !buffer.length) return null
  const client = getClient()
  if (!client) {
    console.warn('[transcribe] OPENAI_API_KEY not set — audio message skipped')
    return null
  }

  const ext = pickExtension(mimeType)
  const filename = `voice.${ext}`

  try {
    // OpenAI SDK accepts a File-like object built from the raw bytes.
    const file = await OpenAI.toFile(buffer, filename, { type: mimeType || 'audio/ogg' })
    const result = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      // No `language` hint — Whisper auto-detects; clients may speak Darija, French, Arabic, English.
    })
    const text = (result?.text || '').trim()
    return text || null
  } catch (err) {
    console.error('[transcribe] Whisper error:', err.message)
    return null
  }
}

function pickExtension(mimeType) {
  if (!mimeType) return 'ogg'
  const m = mimeType.toLowerCase()
  if (m.includes('ogg'))  return 'ogg'
  if (m.includes('mp4'))  return 'm4a'
  if (m.includes('mpeg')) return 'mp3'
  if (m.includes('wav'))  return 'wav'
  if (m.includes('webm')) return 'webm'
  return 'ogg'
}
