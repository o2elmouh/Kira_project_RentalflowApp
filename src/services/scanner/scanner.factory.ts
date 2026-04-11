import type { IScannerService } from './scanner.interface'
import { MockScannerService } from './mockScanner.service'
import { ClaudeScannerService } from './claudeScanner.service'

let instance: IScannerService | null = null

/**
 * Returns a singleton scanner service selected by VITE_OCR_ENGINE:
 *   (unset | claude | claude-hybrid) → ClaudeScannerService (Claude Vision API via backend)
 *   mock                             → MockScannerService (simulated delay, for testing)
 */
export function getScannerService(): IScannerService {
  if (!instance) {
    const engine = import.meta.env.VITE_OCR_ENGINE as string | undefined
    if (engine === 'mock') {
      instance = new MockScannerService()
    } else {
      instance = new ClaudeScannerService()
    }
  }
  return instance
}
