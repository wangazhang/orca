import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import type NaclModule from 'tweetnacl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS, GRACE_PERIOD_DAYS } from '../../shared/license-state'
import type * as LicenseTokenModule from '../../shared/license-token'
import {
  encodeBase64Url,
  licenseSigningInput,
  LICENSE_TOKEN_PREFIX,
  type LicensePayload
} from '../../shared/license-token'
import { readLicenseRecord, writeLicenseRecord } from './license-store'

const NOW = 1_750_000_000_000

// Hoisted with the mock factories below, which run before module-level consts.
const { keyPair, PUBLIC_KEY, userDataDirRef } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tweetnacl = require('tweetnacl') as NaclModule
  const pair = tweetnacl.sign.keyPair()
  return {
    keyPair: pair,
    PUBLIC_KEY: Buffer.from(pair.publicKey).toString('base64url'),
    userDataDirRef: { current: '' }
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => userDataDirRef.current }
}))

// Why: the shipped module has no key configured (licensing off by default), so
// pin a test key to exercise the enforced path end to end.
vi.mock('../../shared/license-token', async (importOriginal) => {
  const actual = await importOriginal<typeof LicenseTokenModule>()
  return {
    ...actual,
    LICENSE_PUBLIC_KEY_B64: PUBLIC_KEY,
    isLicensingEnforced: () => true,
    parseLicenseToken: (raw: string, key?: string) =>
      actual.parseLicenseToken(raw, key ?? PUBLIC_KEY)
  }
})

import { activateLicense, getLicenseStatus, getMachineFingerprint } from './license-service'

function signToken(overrides: Partial<LicensePayload> = {}): string {
  const payload: LicensePayload = {
    v: 1,
    id: 'lic-001',
    licensee: 'Acme Corp',
    issuedAt: NOW - DAY_MS,
    expiresAt: NOW + 30 * DAY_MS,
    ...overrides
  }
  const segment = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = nacl.sign.detached(licenseSigningInput(segment), keyPair.secretKey)
  return `${LICENSE_TOKEN_PREFIX}.${segment}.${encodeBase64Url(signature)}`
}

beforeEach(() => {
  userDataDirRef.current = mkdtempSync(join(tmpdir(), 'orca-license-svc-'))
})

afterEach(() => {
  rmSync(userDataDirRef.current, { recursive: true, force: true })
})

describe('license service', () => {
  it('starts with no license', () => {
    const status = getLicenseStatus(NOW)
    expect(status.state).toBe('missing')
    expect(status.usable).toBe(false)
    expect(status.enforced).toBe(true)
  })

  it('exposes a stable machine fingerprint', () => {
    expect(getMachineFingerprint()).toBe(getMachineFingerprint())
    expect(getLicenseStatus(NOW).machineId).toBe(getMachineFingerprint())
  })

  it('activates a valid license and persists it across reads', () => {
    const result = activateLicense(signToken(), NOW)
    expect(result.ok).toBe(true)

    const status = getLicenseStatus(NOW)
    expect(status.state).toBe('valid')
    expect(status.usable).toBe(true)
    expect(status.licensee).toBe('Acme Corp')
  })

  it('refuses a garbage token without disturbing the working one', () => {
    activateLicense(signToken(), NOW)
    expect(activateLicense('not-a-license', NOW)).toEqual({ ok: false, reason: 'invalid' })
    // A bad paste must not evict a license the user already had.
    expect(getLicenseStatus(NOW).state).toBe('valid')
  })

  it('refuses a license bound to another machine', () => {
    const result = activateLicense(signToken({ machineId: 'someone-elses-machine' }), NOW)
    expect(result).toEqual({ ok: false, reason: 'machine-mismatch' })
    expect(getLicenseStatus(NOW).state).toBe('missing')
  })

  it('accepts a license bound to this machine', () => {
    const result = activateLicense(signToken({ machineId: getMachineFingerprint() }), NOW)
    expect(result.ok).toBe(true)
    expect(getLicenseStatus(NOW).state).toBe('valid')
  })

  it('refuses a license that is already past its grace window', () => {
    const expiresAt = NOW - (GRACE_PERIOD_DAYS + 1) * DAY_MS
    expect(activateLicense(signToken({ expiresAt }), NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('reports a stored token that no longer verifies as invalid, not missing', () => {
    // Distinct states matter: re-pasting the same token cannot fix 'invalid'.
    activateLicense(signToken(), NOW)
    writeLicenseRecord(userDataDirRef.current, {
      ...readLicenseRecord(userDataDirRef.current),
      token: 'ORCA1.tampered.payload'
    })

    const status = getLicenseStatus(NOW)
    expect(status.state).toBe('invalid')
    expect(status.usable).toBe(false)
  })

  it('moves into grace after expiry but stays usable', () => {
    activateLicense(signToken({ expiresAt: NOW + DAY_MS }), NOW)
    const status = getLicenseStatus(NOW + 2 * DAY_MS)
    expect(status.state).toBe('grace')
    expect(status.usable).toBe(true)
  })

  it('locks once the grace window closes', () => {
    activateLicense(signToken({ expiresAt: NOW + DAY_MS }), NOW)
    const status = getLicenseStatus(NOW + (GRACE_PERIOD_DAYS + 2) * DAY_MS)
    expect(status.state).toBe('expired')
    expect(status.usable).toBe(false)
  })

  it('does not un-expire when the system clock is wound back', () => {
    activateLicense(signToken({ expiresAt: NOW + DAY_MS }), NOW)
    // Let the app observe a time past the grace window...
    expect(getLicenseStatus(NOW + (GRACE_PERIOD_DAYS + 2) * DAY_MS).state).toBe('expired')
    // ...then pretend it is a month earlier. The watermark must hold.
    expect(getLicenseStatus(NOW - 30 * DAY_MS).state).toBe('expired')
  })
})
