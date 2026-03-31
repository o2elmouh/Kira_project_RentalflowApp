import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'

const router = Router()
router.use(requireAuth)

// Rate limit: 30 AI calls per hour per user (Vision API is expensive)
const aiLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user.id,
  message: { error: 'AI analysis limit reached (30/hour). Try again later.' },
})

router.use(aiLimit)

/**
 * POST /ai/detect-damage
 *
 * Body: {
 *   beforePhotos: string[]   // base64 data-URLs (before rental)
 *   afterPhotos:  string[]   // base64 data-URLs (after rental / restitution)
 *   contractNumber: string
 *   vehicleName:    string
 *   clientName:     string
 * }
 *
 * Returns: {
 *   hasDamage: boolean
 *   confidence: 'high' | 'medium' | 'low'
 *   damages: [{ zone, description, severity }]
 *   summary: string
 *   recommendation: string
 *   analysedAt: string (ISO)
 * }
 */
router.post('/detect-damage', async (req, res) => {
  const { beforePhotos = [], afterPhotos = [], contractNumber, vehicleName, clientName } = req.body

  if (afterPhotos.length === 0) {
    return res.status(400).json({ error: 'At least one after-rental photo is required.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service not configured (ANTHROPIC_API_KEY missing).' })
  }

  try {
    // Build the image content blocks for Claude
    const imageBlocks = []

    if (beforePhotos.length > 0) {
      imageBlocks.push({
        type: 'text',
        text: `PHOTOS AVANT LOCATION (${beforePhotos.length} photo(s)) — état du véhicule au départ :`,
      })
      for (const photo of beforePhotos.slice(0, 3)) {
        const base64 = photo.includes(',') ? photo.split(',')[1] : photo
        const mediaType = photo.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
      }
    }

    imageBlocks.push({
      type: 'text',
      text: `PHOTOS APRÈS LOCATION (${afterPhotos.length} photo(s)) — état du véhicule au retour :`,
    })
    for (const photo of afterPhotos.slice(0, 3)) {
      const base64 = photo.includes(',') ? photo.split(',')[1] : photo
      const mediaType = photo.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
    }

    imageBlocks.push({
      type: 'text',
      text: `Tu es un expert en inspection de véhicules de location pour l'agence ${vehicleName ? `(véhicule: ${vehicleName})` : ''}.
Analyse les photos avant et après la location du client ${clientName || ''} (contrat ${contractNumber || ''}).

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "hasDamage": true/false,
  "confidence": "high"/"medium"/"low",
  "damages": [
    { "zone": "Pare-choc avant", "description": "Rayure 15cm", "severity": "minor"/"major"/"cosmetic" }
  ],
  "summary": "Résumé en 1-2 phrases en français",
  "recommendation": "Facturer les dommages / Aucun frais supplémentaire / Vérification manuelle recommandée"
}

Si aucune photo avant n'est fournie, compare avec l'état standard d'un véhicule sans dommages.
Sois précis et professionnel. Ne retourne que le JSON, sans texte supplémentaire.`,
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: imageBlocks }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      throw new Error(`Anthropic API error ${response.status}: ${errBody.error?.message || response.statusText}`)
    }

    const claudeResponse = await response.json()
    const rawText = claudeResponse.content?.[0]?.text || ''

    // Extract JSON from the response (Claude may wrap it in markdown code blocks)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON')
    }

    const analysis = JSON.parse(jsonMatch[0])

    console.log(`[AI] Damage analysis for contract ${contractNumber}: hasDamage=${analysis.hasDamage}, confidence=${analysis.confidence}`)

    res.json({
      ...analysis,
      contractNumber,
      vehicleName,
      clientName,
      analysedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[AI/detect-damage]', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
