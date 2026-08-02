import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import {
  encodeBase64Url,
  isLicensingEnforced,
  licenseSigningInput,
  LICENSE_TOKEN_PREFIX,
  parseLicenseToken,
  type LicensePayload
} from './license-token'

const keyPair = nacl.sign.keyPair()
const PUBLIC_KEY = encodeBase64Url(keyPair.publicKey)

function payloadOf(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    id: 'lic-001',
    licensee: 'Acme Corp',
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_800_000_000_000,
    ...overrides
  }
}

function sign(payload: unknown, secretKey: Uint8Array = keyPair.secretKey): string {
  const segment = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = nacl.sign.detached(licenseSigningInput(segment), secretKey)
  return `${LICENSE_TOKEN_PREFIX}.${segment}.${encodeBase64Url(signature)}`
}

describe('parseLicenseToken', () => {
  it('accepts a token signed by the matching key', () => {
    const payload = payloadOf({ machineId: 'machine-abc', note: 'annual' })
    expect(parseLicenseToken(sign(payload), PUBLIC_KEY)).toEqual(payload)
  })

  it('accepts a public key pasted as standard base64 rather than base64url', () => {
    const standard = Buffer.from(keyPair.publicKey).toString('base64')
    expect(parseLicenseToken(sign(payloadOf()), standard)).not.toBeNull()
  })

  it('tolerates surrounding whitespace from a copy-paste', () => {
    expect(parseLicenseToken(`\n  ${sign(payloadOf())}  \n`, PUBLIC_KEY)).not.toBeNull()
  })

  it('rejects a payload edited after signing', () => {
    // The whole point of signing: extending expiresAt by hand must not work.
    const token = sign(payloadOf())
    const [prefix, , signature] = token.split('.')
    const forged = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify(payloadOf({ expiresAt: 9_999_999_999_999 })))
    )
    expect(parseLicenseToken(`${prefix}.${forged}.${signature}`, PUBLIC_KEY)).toBeNull()
  })

  it('rejects a token signed by a different key', () => {
    const attacker = nacl.sign.keyPair()
    expect(parseLicenseToken(sign(payloadOf(), attacker.secretKey), PUBLIC_KEY)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const [prefix, payloadSegment] = sign(payloadOf()).split('.')
    const bogus = encodeBase64Url(new Uint8Array(nacl.sign.signatureLength))
    expect(parseLicenseToken(`${prefix}.${payloadSegment}.${bogus}`, PUBLIC_KEY)).toBeNull()
  })

  it('rejects a signature of the wrong length', () => {
    const [prefix, payloadSegment] = sign(payloadOf()).split('.')
    const short = encodeBase64Url(new Uint8Array(8))
    expect(parseLicenseToken(`${prefix}.${payloadSegment}.${short}`, PUBLIC_KEY)).toBeNull()
  })

  it('rejects a token whose prefix was swapped', () => {
    // Why: the prefix is inside the signed bytes, so re-labelling a token to a
    // future format version invalidates it rather than silently downgrading.
    const [, payloadSegment, signature] = sign(payloadOf()).split('.')
    expect(parseLicenseToken(`ORCA2.${payloadSegment}.${signature}`, PUBLIC_KEY)).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['not a token', 'hello world'],
    ['too few segments', 'ORCA1.abc'],
    ['too many segments', 'ORCA1.a.b.c'],
    ['non-base64url payload', 'ORCA1.not*valid.YWJj']
  ])('rejects malformed input (%s)', (_label, raw) => {
    expect(parseLicenseToken(raw, PUBLIC_KEY)).toBeNull()
  })

  it('rejects a validly-signed payload that does not match the schema', () => {
    // A correct signature over the wrong shape must still be refused.
    expect(parseLicenseToken(sign({ v: 1, licensee: 'Acme' }), PUBLIC_KEY)).toBeNull()
    expect(parseLicenseToken(sign({ ...payloadOf(), v: 2 }), PUBLIC_KEY)).toBeNull()
  })

  it('rejects every token when no public key is configured', () => {
    expect(parseLicenseToken(sign(payloadOf()), '')).toBeNull()
  })

  it('rejects a public key of the wrong length', () => {
    expect(parseLicenseToken(sign(payloadOf()), encodeBase64Url(new Uint8Array(8)))).toBeNull()
  })
})

describe('isLicensingEnforced', () => {
  it('is off until a public key is configured', () => {
    expect(isLicensingEnforced('')).toBe(false)
    expect(isLicensingEnforced('   ')).toBe(false)
  })

  it('is on once a key is present', () => {
    expect(isLicensingEnforced(PUBLIC_KEY)).toBe(true)
  })
})
