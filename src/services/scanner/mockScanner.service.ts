import { IdentityDocumentSchema, type IdentityDocument } from '../../core/schemas/identity.schema'
import type { IScannerService } from './scanner.interface'

export class MockScannerService implements IScannerService {
  async scan(_file: File | Blob | Buffer): Promise<IdentityDocument> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const future = new Date()
    future.setFullYear(future.getFullYear() + 5)

    const raw = {
      firstName:       'Karim',
      lastName:        'El Fassi',
      documentNumber:  'BJ987654',
      expiryDate:      future,
      dateOfBirth:     new Date('1990-06-15'),
      issuingCountry:  'MAR',
      documentType:    'ID_CARD' as const,
      confidenceScore: 0.97,
    }

    // Validate through schema — catches any accidental shape drift
    return IdentityDocumentSchema.parse(raw)
  }
}
