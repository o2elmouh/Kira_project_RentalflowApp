/**
 * POST /ocr/scan-claude — Claude Vision document scanning
 *
 * Multipart: field "document" (image file) + optional field "hint" (cin|license|passport)
 * Returns: IdentityDocument JSON  or  { error: 'INCOMPLETE', missing: string[] }
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 */
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const CLAUDE_SYSTEM_PROMPT = `You are a precise document parser specialised in Moroccan identity documents.
Moroccan documents are bilingual (French + Arabic).

Key document-specific rules:
- Moroccan CIN number format: 1–2 uppercase letters followed by exactly 6–7 digits (e.g. AB123456 or A123456). Never confuse it with a phone number or postal code.
- Moroccan driving licence number: appears after the label "Permis N°", "No.", or field "5" on EU-format licences. The expiry date is in field "4b".
- Passport number: 2 uppercase letters + 7 digits (e.g. AA1234567), or read from MRZ line 2 positions 1–9.
- Dates may appear as DD/MM/YYYY, DD.MM.YYYY, or YYMMDD (MRZ). Convert all to YYYY-MM-DD.
- "Nom" / "اسم العائلة" = last name. "Prénom" / "الاسم الشخصي" = first name.
- Issuing country for Moroccan documents = "MAR".

Return ONLY valid JSON — no markdown, no prose — matching this exact schema:
{
  "firstName": string,
  "lastName": string,
  "documentNumber": string,
  "expiryDate": "YYYY-MM-DD",
  "dateOfBirth": "YYYY-MM-DD" | null,
  "issuingCountry": "MAR" | <ISO-3166-1 alpha-3>,
  "documentType": "ID_CARD" | "DRIVING_LICENSE" | "PASSPORT",
  "confidenceScore": 0.0–1.0
}

If a mandatory field (firstName, lastName, documentNumber, expiryDate) cannot be reliably extracted, return:
{ "error": "INCOMPLETE", "missing": ["<field1>", ...] }

Do not guess or hallucinate values. If uncertain, include the field in "missing".`

router.post('/scan-claude', upload.single('document'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No document file uploaded (field: "document")' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Claude API not configured (missing ANTHROPIC_API_KEY)' })
  }

  const hint = req.body?.hint
  const hintLine = hint
    ? `The user is scanning a ${hint === 'cin' ? 'Moroccan CIN (national ID card)' : hint === 'license' ? 'Moroccan driving licence' : 'passport'}.`
    : 'The document type is unknown — infer it from the image.'

  const imageBase64 = req.file.buffer.toString('base64')
  const mediaType = req.file.mimetype || 'image/jpeg'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: CLAUDE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `${hintLine}\n\nExtract all identity fields from this document image and return the JSON schema described in the system prompt.`,
          },
        ],
      }],
    })
  } catch (err) {
    console.error('[OCR/scan-claude] Claude API error:', err.message)
    return next(Object.assign(new Error('Claude API call failed'), { status: 502 }))
  }

  const raw = message.content?.[0]?.text?.trim() ?? ''

  let parsed
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    console.error('[OCR/scan-claude] Claude returned non-JSON:', raw.slice(0, 200))
    return res.status(422).json({ error: 'Claude returned unparseable response' })
  }

  return res.json(parsed)
})

export default router
