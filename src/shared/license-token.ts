// License token format and signature verification.
//
// A token is three dot-separated parts:
//   ORCA1.<base64url(payload JSON)>.<base64url(ed25519 detached signature)>
//
// The signature covers the prefix plus the exact payload segment bytes, so
// verification never re-encodes the JSON — a payload edited by even one byte
// fails, and a token cannot be replayed under a different format version.
//
// Verification is offline by design: the app carries the public key and needs no
// server. The tradeoff, which callers must not paper over, is that an issued
// token cannot be revoked before its expiry, and the app binary itself can be
// modified to skip this check. Machine binding (see `machineId`) is the main
// mitigation available without a server.
import nacl from 'tweetnacl'
import { z } from 'zod'

export const LICENSE_TOKEN_PREFIX = 'ORCA1'

// Public half of the signing key held at ~/.orca/license-signing-key. Rotating
// this constant invalidates every license already issued, so it changes only
// alongside a deliberate key rotation.
// Set it to '' to ship a build that does not enforce licensing at all.
export const LICENSE_PUBLIC_KEY_B64 = '-SCcKSSi61zwcI3u4T5UP7ukA0PmG8_IL1q-xXo2OTM'

/** Whether this build enforces licensing at all. False until a public key is set. */
export function isLicensingEnforced(publicKeyB64: string = LICENSE_PUBLIC_KEY_B64): boolean {
  return publicKeyB64.trim().length > 0
}

export const licensePayloadSchema = z.object({
  v: z.literal(1),
  /** Unique id for this issuance, so a customer can quote it in support. */
  id: z.string().min(1),
  licensee: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  /** When set, the token is only valid on the machine with this fingerprint. */
  machineId: z.string().min(1).optional(),
  note: z.string().optional()
})

export type LicensePayload = z.infer<typeof licensePayloadSchema>

export function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function decodeBase64Url(value: string): Uint8Array | null {
  // Why: Buffer.from is lenient — it silently drops characters outside the
  // alphabet rather than failing, so a corrupted token could decode to
  // something plausible. Reject non-base64url input up front instead.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null
  }
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'))
  } catch {
    return null
  }
}

/** Accepts a key pasted as either standard base64 or base64url. */
function decodePublicKey(publicKeyB64: string): Uint8Array | null {
  const normalized = publicKeyB64.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const bytes = decodeBase64Url(normalized)
  return bytes && bytes.byteLength === nacl.sign.publicKeyLength ? bytes : null
}

/** Bytes the signature is computed over: the prefix and the payload segment. */
export function licenseSigningInput(payloadSegment: string): Uint8Array {
  return new TextEncoder().encode(`${LICENSE_TOKEN_PREFIX}.${payloadSegment}`)
}

/**
 * Parses and verifies a license token.
 *
 * Returns null for every failure mode — wrong prefix, malformed encoding, bad
 * signature, payload that does not match the schema. Callers learn only "not a
 * valid license", with no channel distinguishing a forged signature from a typo.
 */
export function parseLicenseToken(
  raw: string,
  publicKeyB64: string = LICENSE_PUBLIC_KEY_B64
): LicensePayload | null {
  const publicKeyBytes = decodePublicKey(publicKeyB64)
  if (!publicKeyBytes) {
    return null
  }

  const segments = raw.trim().split('.')
  if (segments.length !== 3 || segments[0] !== LICENSE_TOKEN_PREFIX) {
    return null
  }
  const [, payloadSegment, signatureSegment] = segments

  const signature = decodeBase64Url(signatureSegment)
  if (!signature || signature.byteLength !== nacl.sign.signatureLength) {
    return null
  }

  if (!nacl.sign.detached.verify(licenseSigningInput(payloadSegment), signature, publicKeyBytes)) {
    return null
  }

  const payloadBytes = decodeBase64Url(payloadSegment)
  if (!payloadBytes) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payloadBytes))
    const result = licensePayloadSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
