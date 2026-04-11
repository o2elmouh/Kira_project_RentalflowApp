import { z } from 'zod'

export const DocumentType = {
  PASSPORT: 'PASSPORT',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  ID_CARD: 'ID_CARD',
} as const

export const IdentityDocumentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  documentNumber: z.string().min(1, 'Document number is required'),
  expiryDate: z.coerce.date(),
  dateOfBirth: z.coerce.date().optional(),
  issuingCountry: z.string().length(3, 'Must be ISO 3-letter country code'),
  documentType: z.enum(['PASSPORT', 'DRIVING_LICENSE', 'ID_CARD']),
  confidenceScore: z.number().min(0).max(1),
})

export type IdentityDocument = z.infer<typeof IdentityDocumentSchema>
