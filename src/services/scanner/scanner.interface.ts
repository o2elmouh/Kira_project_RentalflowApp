import type { IdentityDocument } from '../../core/schemas/identity.schema'

export interface IScannerService {
  /**
   * Scan an identity document image and return structured data.
   * @param file — image as File (browser), Blob, or Buffer (Node.js)
   */
  scan(file: File | Blob | Buffer): Promise<IdentityDocument>
}
