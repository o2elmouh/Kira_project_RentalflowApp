import { IdentityDocumentSchema, type IdentityDocument } from '../../core/schemas/identity.schema'
import type { IScannerService } from './scanner.interface'

/** Shape of the response from POST /ocr/scan on the Railway backend */
interface OcrApiResponse {
  firstName: string
  lastName: string
  documentNumber: string
  expiryDate: string   // ISO date string
  dateOfBirth?: string
  issuingCountry: string
  documentType: 'PASSPORT' | 'DRIVING_LICENSE' | 'ID_CARD'
  confidenceScore: number
}

/**
 * Production scanner that proxies through the Railway backend.
 *
 * The backend route (POST /ocr/scan) calls Google Cloud Document AI
 * using the service-account credentials stored in env vars — those
 * must never be bundled into the frontend.
 *
 * The frontend only sends a multipart/form-data request with the image.
 */
export class GoogleCloudDocumentAIScannerService implements IScannerService {
  private readonly apiUrl: string

  constructor() {
    const base = import.meta.env.VITE_API_URL
    if (!base) throw new Error('VITE_API_URL is not set')
    this.apiUrl = `${base}/ocr/scan`
  }

  async scan(file: File | Blob | Buffer): Promise<IdentityDocument> {
    const formData = new FormData()

    if (Buffer.isBuffer(file)) {
      // Node.js Buffer (e.g. tests) — wrap in a Blob
      formData.append('document', new Blob([file as BlobPart], { type: 'image/jpeg' }), 'document.jpg')
    } else {
      formData.append('document', file, (file as File).name ?? 'document.jpg')
    }

    let response: Response
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
    } catch (networkError) {
      throw new Error(`OCR service unreachable: ${(networkError as Error).message}`)
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('You are not authorized to perform this action. Please log in.')
      }

      let detail = response.statusText
      try {
        const errData = await response.json()
        detail = errData.error || detail
      } catch {
        /* Response was not JSON */
      }
      throw new Error(`OCR API error ${response.status}: ${detail}`)
    }

    const raw: OcrApiResponse = await response.json()

    // Coerce and validate through Zod — rejects any malformed server response
    const result = IdentityDocumentSchema.safeParse(raw)
    if (!result.success) {
      throw new Error(`OCR response validation failed: ${result.error.message}`)
    }
    return result.data
  }
}
