/**
 * POST /ocr/scan    — Google Cloud Document AI (image upload)
 * POST /ocr/refine  — Claude 3.5 Sonnet text refinement (raw OCR text → structured JSON)
 *
 * Required env vars:
 *   GOOGLE_DOCUMENT_AI_PROJECT / LOCATION / PROCESSOR / GOOGLE_CREDENTIALS_JSON
 *   ANTHROPIC_API_KEY — for /refine endpoint
 */
import { Router } from 'express'
import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import Anthropic from '@anthropic-ai/sdk'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// ── Document type heuristic ───────────────────────────────
const ENTITY_TYPE_TO_DOC_TYPE = {
  passport: 'PASSPORT',
  driving_license: 'DRIVING_LICENSE',
  national_id: 'ID_CARD',
  id_card: 'ID_CARD',
}

function inferDocumentType(entities) {
  for (const e of entities) {
    const mapped = ENTITY_TYPE_TO_DOC_TYPE[e.type?.toLowerCase()]
    if (mapped) return mapped
  }
  return 'ID_CARD'
}

function entityValue(entities, ...types) {
  for (const type of types) {
    const found = entities.find(e => e.type === type)
    if (found?.mentionText) return found.mentionText.trim()
  }
  return ''
}

function entityConfidence(entities, ...types) {
  for (const type of types) {
    const found = entities.find(e => e.type === type)
    if (found) return found.confidence ?? 0
  }
  return null
}

// ── Route ─────────────────────────────────────────────────
router.post('/scan', requireAuth, upload.single('document'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No document file uploaded (field: "document")' })

  const {
    GOOGLE_DOCUMENT_AI_PROJECT: project,
    GOOGLE_DOCUMENT_AI_LOCATION: location = 'eu',
    GOOGLE_DOCUMENT_AI_PROCESSOR: processorId,
    GOOGLE_CREDENTIALS_JSON,
  } = process.env

  if (!project || !processorId) {
    return res.status(503).json({ error: 'OCR service not configured (missing env vars)' })
  }

  // Support inline JSON credentials for Railway (no file system needed)
  let clientOptions = {}
  if (GOOGLE_CREDENTIALS_JSON) {
    try {
      clientOptions = { credentials: JSON.parse(GOOGLE_CREDENTIALS_JSON) }
    } catch {
      return res.status(500).json({ error: 'GOOGLE_CREDENTIALS_JSON is not valid JSON' })
    }
  }

  const client = new DocumentProcessorServiceClient(clientOptions)
  const name = `projects/${project}/locations/${location}/processors/${processorId}`

  const request = {
    name,
    rawDocument: {
      content: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype || 'image/jpeg',
    },
  }

  let document
  try {
    const [result] = await client.processDocument(request)
    document = result.document
  } catch (err) {
    console.error('[OCR] Document AI error:', err.message)
    return next(Object.assign(new Error('Document AI processing failed'), { status: 502 }))
  }

  const entities = document?.entities ?? []

  // ── Map Google entities → our schema ──────────────────
  const firstName = entityValue(entities, 'given_name', 'first_name')
  const lastName = entityValue(entities, 'family_name', 'last_name', 'surname')
  const documentNumber = entityValue(entities, 'document_id', 'passport_number', 'id_number', 'license_number', 'document_number')
  const expiryDate = entityValue(entities, 'expiration_date', 'expiry_date', 'date_of_expiry')
  const dateOfBirth = entityValue(entities, 'date_of_birth', 'birth_date')
  const issuingCountry = entityValue(entities, 'issuing_country', 'country_code', 'nationality') || 'MAR'
  const documentType = inferDocumentType(entities)

  // Average confidence across key fields
  const scores = [
    entityConfidence(entities, 'given_name', 'first_name'),
    entityConfidence(entities, 'family_name', 'last_name', 'surname'),
    entityConfidence(entities, 'document_id', 'passport_number', 'id_number', 'license_number'),
    entityConfidence(entities, 'expiration_date', 'expiry_date', 'date_of_expiry'),
  ].filter(s => s !== null)
  const confidenceScore = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0.5

  if (!firstName || !lastName || !documentNumber || !expiryDate) {
    return res.status(422).json({
      error: 'Could not extract required fields from document. Please try a clearer image.',
    })
  }

  return res.json({
    firstName,
    lastName,
    documentNumber,
    expiryDate: expiryDate || null,
    dateOfBirth: dateOfBirth || null,
    issuingCountry: issuingCountry.padEnd(3, 'X').slice(0, 3).toUpperCase(),
    documentType,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
  })
})

// ── POST /ocr/scan-claude ─────────────────────────────────────────────────────
//
// Multipart: field "document" (image file)  +  optional field "hint" (cin|license|passport)
// Returns: IdentityDocument JSON  or  { error: 'INCOMPLETE', missing: string[] }
//
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

router.post('/scan-claude', requireAuth, upload.single('document'), async (req, res, next) => {
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
      model: 'claude-opus-4-5',
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
