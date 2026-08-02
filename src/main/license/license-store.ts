// Persistence for the license record, plus the monotonic clock watermark that
// makes expiry resistant to setting the system clock backwards.
//
// Kept free of electron imports so it can be exercised against a temp dir; the
// caller supplies the directory (app.getPath('userData') in production).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

export const LICENSE_FILE_NAME = 'license.json'

const licenseRecordSchema = z.object({
  /** Raw signed token exactly as the customer pasted it. */
  token: z.string().optional(),
  /** Random id used for the machine fingerprint when platform probes fail. */
  fallbackMachineId: z.string().optional(),
  /**
   * Highest wall-clock time this install has ever observed. Expiry is judged
   * against max(now, watermark), so winding the clock back cannot buy time.
   */
  maxSeenTime: z.number().int().nonnegative().optional()
})

export type LicenseRecord = z.infer<typeof licenseRecordSchema>

const EMPTY_RECORD: LicenseRecord = {}

function licenseFilePath(userDataDir: string): string {
  return join(userDataDir, LICENSE_FILE_NAME)
}

/**
 * Reads the license record. Any unreadable state — missing file, corrupt JSON,
 * or a shape that fails validation — is reported as an empty record rather than
 * throwing. Why: this runs during startup, and a damaged file must not prevent
 * the app from booting far enough to let the user paste a working license.
 */
export function readLicenseRecord(userDataDir: string): LicenseRecord {
  try {
    const parsed: unknown = JSON.parse(readFileSync(licenseFilePath(userDataDir), 'utf8'))
    const result = licenseRecordSchema.safeParse(parsed)
    return result.success ? result.data : EMPTY_RECORD
  } catch {
    return EMPTY_RECORD
  }
}

export function writeLicenseRecord(userDataDir: string, record: LicenseRecord): void {
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(licenseFilePath(userDataDir), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

/**
 * Returns the effective "now" and persists the watermark when the clock has
 * advanced.
 *
 * Rolling the clock back leaves the watermark untouched, so the license keeps
 * being judged against the furthest point in time this install has seen. Note
 * this is a deterrent, not a proof: deleting license.json resets the watermark.
 * Only a server-side check can close that gap.
 */
export function advanceMonotonicClock(userDataDir: string, now: number): number {
  const record = readLicenseRecord(userDataDir)
  const watermark = record.maxSeenTime ?? 0
  if (now > watermark) {
    writeLicenseRecord(userDataDir, { ...record, maxSeenTime: now })
    return now
  }
  return watermark
}
