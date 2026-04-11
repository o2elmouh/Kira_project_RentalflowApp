/**
 * ClaudeScannerService
 * ====================
 * Sends the document image directly to POST /ocr/scan-claude.
 * Claude Vision reads the image and returns structured identity data.
 *
 * No client-side OCR — all processing happens on the Railway backend.
 */

import { IdentityDocumentSchema, type IdentityDocument } from '../../core/schemas/identity.schema'
import type { IScannerService } from './scanner.interface'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ── Types ─────────────────────────────────────────────────────────────────────

type DocumentHint = 'cin' | 'license' | 'passport'

interface ScanSuccess {
  firstName: string
  lastName: string
  documentNumber: string
  expiryDate: string
  dateOfBirth?: string | null
  issuingCountry: string
  documentType: 'ID_CARD' | 'DRIVING_LICENSE' | 'PASSPORT'
  confidenceScore: number
}

interface ScanIncomplete {
  error: 'INCOMPLETE'
  missing: string[]
}

type ScanResponse = ScanSuccess | ScanIncomplete

// ── Auth token ────────────────────────────────────────────────────────────────

function getAuthToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? ''
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw) as { access_token?: string }
        return parsed.access_token ?? null
      }
    }
  } catch { /* ignore */ }
  return null
}

// ── Main service ──────────────────────────────────────────────────────────────

export class ClaudeScannerService implements IScannerService {
  async scan(file: File | Blob | Buffer): Promise<IdentityDocument> {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
      throw new Error('ClaudeScannerService requires a browser environment')
    }

    const formData = new FormData()
    formData.append('document', file as Blob)

    // Attempt to infer hint from file name (File only)
    const hint = this.inferHintFromFile(file as File | Blob)
    if (hint) formData.append('hint', hint)

    const headers: Record<string, string> = {}
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${API_URL}/ocr/scan-claude`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>
      throw new Error(body.error ?? `OCR API error ${res.status}`)
    }

    const result = await res.json() as ScanResponse

    if ('error' in result && result.error === 'INCOMPLETE') {
      throw new Error(
        `Could not read: ${(result as ScanIncomplete).missing.join(', ')}. ` +
        'Please retake the photo or enter the details manually.'
      )
    }

    const r = result as ScanSuccess
    return IdentityDocumentSchema.parse({
      firstName:       r.firstName,
      lastName:        r.lastName,
      documentNumber:  r.documentNumber,
      expiryDate:      r.expiryDate,
      dateOfBirth:     r.dateOfBirth ?? undefined,
      issuingCountry:  r.issuingCountry,
      documentType:    r.documentType,
      confidenceScore: Math.min(Math.max(r.confidenceScore ?? 0.85, 0), 1),
    })
  }

  private inferHintFromFile(file: File | Blob): DocumentHint | undefined {
    if (!(file instanceof File)) return undefined
    const name = file.name.toLowerCase()
    if (name.includes('passport')) return 'passport'
    if (name.includes('permis') || name.includes('license') || name.includes('licence')) return 'license'
    if (name.includes('cin') || name.includes('cni')) return 'cin'
    return undefined
  }
}
