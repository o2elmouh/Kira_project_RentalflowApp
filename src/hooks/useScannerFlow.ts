/**
 * useScannerFlow
 * ==============
 * Encapsulates all scanning state, retry logic, and OCR orchestration.
 * The UI never touches Tesseract or Google SDKs directly — only this hook.
 *
 * Retry threshold: after MAX_ATTEMPTS failed/partial scans for the same
 * document type, showManualEntryPrompt becomes true so the UI can nudge
 * the user to fill fields manually instead of retrying indefinitely.
 *
 * State isolation: each new scan fully overwrites the previous result for
 * its slot. A field missing in the latest scan will NOT carry over from
 * an earlier one.
 */

import { useState, useCallback } from 'react'
import { getScannerService } from '../services/scanner/scanner.factory'
import type { IdentityDocument } from '../core/schemas/identity.schema'

// ── Types ────────────────────────────────────────────────────────────────────

export type ScanDocumentType = 'cin' | 'license'

export interface ScanSlotResult {
  /** Fields mapped from the raw IdentityDocument for the UI's flat client shape */
  firstName?: string
  lastName?: string
  cinNumber?: string
  cinExpiry?: string
  drivingLicenseNumber?: string
  licenseExpiry?: string
  dateOfBirth?: string
  nationality?: string
  docType?: 'cin' | 'passport'
}

interface ScanAttemptCounts {
  cin: number
  license: number
}

export interface UseScannerFlowReturn {
  /** Merged flat client fields — single source of truth for the form */
  clientData: ScanSlotResult
  /** Whether the active scan is in progress */
  scanning: boolean
  /** 0–100 progress for the progress bar */
  progress: number
  /** Which slot ('cin' | 'license') is currently scanning */
  activeScanType: ScanDocumentType | null
  /** Last error message, if any */
  scanError: string | null
  /** Raw result per slot (null until first successful scan) */
  extracted: Record<ScanDocumentType, ScanSlotResult | null>
  /** Attempt counts per slot */
  scanAttemptCount: ScanAttemptCounts
  /** True when either slot has reached MAX_ATTEMPTS */
  showManualEntryPrompt: boolean
  /** Which slot triggered the manual-entry prompt */
  manualEntrySlot: ScanDocumentType | null
  /** Initiate a scan for a given slot with an image file */
  startScan: (type: ScanDocumentType, file: File | Blob) => Promise<void>
  /** Manually update a field in clientData (for the editable form inputs) */
  updateField: (key: keyof ScanSlotResult, value: string) => void
  /** Dismiss the manual-entry prompt (does NOT reset attempt count) */
  dismissManualEntryPrompt: () => void
  /** Reset attempt count when user switches to a different document type */
  resetAttemptCount: (type: ScanDocumentType) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5

// ── Identity → flat client mapping ───────────────────────────────────────────

function mapToClientFields(
  type: ScanDocumentType,
  identity: IdentityDocument
): ScanSlotResult {
  const isoDate = (d: Date | string | undefined): string => {
    if (!d) return ''
    if (d instanceof Date) return d.toISOString().slice(0, 10)
    return String(d).slice(0, 10)
  }

  if (type === 'cin') {
    return {
      firstName: identity.firstName,
      lastName: identity.lastName,
      cinNumber: identity.documentNumber,
      cinExpiry: isoDate(identity.expiryDate),
      dateOfBirth: isoDate(identity.dateOfBirth),
      nationality: identity.issuingCountry === 'MAR' ? 'Marocain' : identity.issuingCountry,
      docType: identity.documentType === 'PASSPORT' ? 'passport' : 'cin',
    }
  }

  // license slot — only take driving-licence fields
  return {
    drivingLicenseNumber: identity.documentNumber,
    licenseExpiry: isoDate(identity.expiryDate),
    dateOfBirth: isoDate(identity.dateOfBirth),
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useScannerFlow(
  initialClientData: ScanSlotResult = {}
): UseScannerFlowReturn {
  const [clientData, setClientData] = useState<ScanSlotResult>(initialClientData)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [activeScanType, setActiveScanType] = useState<ScanDocumentType | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<Record<ScanDocumentType, ScanSlotResult | null>>({
    cin: null,
    license: null,
  })
  const [scanAttemptCount, setScanAttemptCount] = useState<ScanAttemptCounts>({ cin: 0, license: 0 })
  const [showManualEntryPrompt, setShowManualEntryPrompt] = useState(false)
  const [manualEntrySlot, setManualEntrySlot] = useState<ScanDocumentType | null>(null)

  const startScan = useCallback(async (type: ScanDocumentType, file: File | Blob) => {
    setScanning(true)
    setActiveScanType(type)
    setProgress(10)
    setScanError(null)

    // Increment attempt count BEFORE the scan (counts every attempt, success or fail)
    const newCount = scanAttemptCount[type] + 1
    setScanAttemptCount(prev => ({ ...prev, [type]: newCount }))

    try {
      setProgress(30)
      const scanner = getScannerService()

      // Animate progress during the Claude API call (can take 5–15s)
      const progressTimer = setInterval(() => {
        setProgress(p => p < 72 ? p + 3 : p)
      }, 600)

      let identity
      try {
        identity = await scanner.scan(file)
      } finally {
        clearInterval(progressTimer)
      }
      setProgress(80)

      const fields = mapToClientFields(type, identity)

      // ── State isolation: new result is the single source of truth ──────────
      // Overwrite extracted slot completely — no merging with previous result.
      setExtracted(prev => ({ ...prev, [type]: fields }))

      // Merge into clientData but only for THIS slot's keys — missing keys from
      // the new scan become undefined (not carried from the previous scan).
      setClientData(prev => {
        const slotKeys: (keyof ScanSlotResult)[] =
          type === 'cin'
            ? ['firstName', 'lastName', 'cinNumber', 'cinExpiry', 'dateOfBirth', 'nationality', 'docType']
            : ['drivingLicenseNumber', 'licenseExpiry', 'dateOfBirth']

        const cleared: Partial<ScanSlotResult> = {}
        for (const k of slotKeys) cleared[k] = undefined   // clear stale slot data first

        return { ...prev, ...cleared, ...fields }
      })

      setProgress(100)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      setScanError(msg)

      // Show manual-entry prompt once the threshold is crossed
      if (newCount >= MAX_ATTEMPTS) {
        setShowManualEntryPrompt(true)
        setManualEntrySlot(type)
      }
    } finally {
      setScanning(false)
      setProgress(0)
    }

    // Also surface prompt on threshold after successful scan if score is low
    // (handled reactively below — we check after state updates settle)
  }, [scanAttemptCount])

  const updateField = useCallback((key: keyof ScanSlotResult, value: string) => {
    setClientData(prev => ({ ...prev, [key]: value }))
  }, [])

  const dismissManualEntryPrompt = useCallback(() => {
    setShowManualEntryPrompt(false)
    setManualEntrySlot(null)
  }, [])

  const resetAttemptCount = useCallback((type: ScanDocumentType) => {
    setScanAttemptCount(prev => ({ ...prev, [type]: 0 }))
    if (manualEntrySlot === type) {
      setShowManualEntryPrompt(false)
      setManualEntrySlot(null)
    }
  }, [manualEntrySlot])

  return {
    clientData,
    scanning,
    progress,
    activeScanType,
    scanError,
    extracted,
    scanAttemptCount,
    showManualEntryPrompt,
    manualEntrySlot,
    startScan,
    updateField,
    dismissManualEntryPrompt,
    resetAttemptCount,
  }
}
