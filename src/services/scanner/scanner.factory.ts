import type { IScannerService } from './scanner.interface'
import { MockScannerService } from './mockScanner.service'
import { GoogleCloudDocumentAIScannerService } from './googleScanner.service'
import { ClaudeScannerService } from './claudeScanner.service'

let instance: IScannerService | null = null

/**
 * Returns a singleton scanner service selected by VITE_OCR_ENGINE:
 *   claude   → ClaudeScannerService (Claude Vision API via backend, recommended)
 *   (production)  → GoogleCloudDocumentAIScannerService
 *   (development) → MockScannerService (1.5 s simulated delay)
 */
export function getScannerService(): IScannerService {
  if (!instance) {
    const engine = import.meta.env.VITE_OCR_ENGINE as string | undefined
    if (!engine || engine === 'claude' || engine === 'claude-hybrid') {
      instance = new ClaudeScannerService()
    } else if (engine === 'google') {
      instance = new GoogleCloudDocumentAIScannerService()
    } else {
      instance = new MockScannerService()
    }
  }
  return instance
}
