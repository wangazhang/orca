import { describe, expect, it } from 'vitest'
import { DAY_MS, evaluateLicense, EXPIRY_WARNING_DAYS, GRACE_PERIOD_DAYS } from './license-state'
import type { LicensePayload } from './license-token'

const NOW = 1_750_000_000_000

function payloadOf(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    id: 'lic-001',
    licensee: 'Acme Corp',
    issuedAt: NOW - 30 * DAY_MS,
    expiresAt: NOW + 30 * DAY_MS,
    ...overrides
  }
}

function evaluateAt(now: number, overrides: Partial<LicensePayload> = {}) {
  return evaluateLicense({ payload: payloadOf(overrides), now, machineId: 'this-machine' })
}

describe('evaluateLicense', () => {
  it('reports a license inside its term as valid and usable', () => {
    const result = evaluateAt(NOW)
    expect(result.state).toBe('valid')
    expect(result.usable).toBe(true)
    expect(result.daysRemaining).toBe(30)
    expect(result.licensee).toBe('Acme Corp')
  })

  it('treats a missing license as unusable', () => {
    const result = evaluateLicense({ payload: null, now: NOW, machineId: 'this-machine' })
    expect(result.state).toBe('missing')
    expect(result.usable).toBe(false)
  })

  it('keeps the app usable through the final moment of the term', () => {
    const expiresAt = NOW + 30 * DAY_MS
    const result = evaluateAt(expiresAt - 1)
    expect(result.state).toBe('valid')
    expect(result.usable).toBe(true)
  })

  it('enters grace the instant the term ends, still usable', () => {
    const expiresAt = NOW + 30 * DAY_MS
    const result = evaluateAt(expiresAt)
    expect(result.state).toBe('grace')
    expect(result.usable).toBe(true)
    expect(result.shouldWarn).toBe(true)
  })

  it('stays in grace until the last moment of the grace window', () => {
    const expiresAt = NOW + 30 * DAY_MS
    const result = evaluateAt(expiresAt + GRACE_PERIOD_DAYS * DAY_MS - 1)
    expect(result.state).toBe('grace')
    expect(result.usable).toBe(true)
  })

  it('expires exactly when the grace window closes', () => {
    const expiresAt = NOW + 30 * DAY_MS
    const result = evaluateAt(expiresAt + GRACE_PERIOD_DAYS * DAY_MS)
    expect(result.state).toBe('expired')
    expect(result.usable).toBe(false)
  })

  it('reports negative days remaining once past expiry', () => {
    const expiresAt = NOW + 30 * DAY_MS
    expect(evaluateAt(expiresAt + 2 * DAY_MS).daysRemaining).toBe(-2)
  })

  it('rounds a partial final day up so the last day is not reported as zero', () => {
    const expiresAt = NOW + 30 * DAY_MS
    expect(evaluateAt(expiresAt - DAY_MS / 4).daysRemaining).toBe(1)
  })

  it('starts warning only inside the warning window', () => {
    const expiresAt = NOW + 30 * DAY_MS
    expect(evaluateAt(expiresAt - (EXPIRY_WARNING_DAYS + 1) * DAY_MS).shouldWarn).toBe(false)
    expect(evaluateAt(expiresAt - EXPIRY_WARNING_DAYS * DAY_MS).shouldWarn).toBe(true)
  })

  it('refuses a license bound to a different machine', () => {
    const result = evaluateLicense({
      payload: payloadOf({ machineId: 'another-machine' }),
      now: NOW,
      machineId: 'this-machine'
    })
    expect(result.state).toBe('machine-mismatch')
    expect(result.usable).toBe(false)
  })

  it('accepts a license bound to this machine', () => {
    const result = evaluateLicense({
      payload: payloadOf({ machineId: 'this-machine' }),
      now: NOW,
      machineId: 'this-machine'
    })
    expect(result.state).toBe('valid')
  })

  it('refuses a machine-bound license when the fingerprint is unavailable', () => {
    // Why: a null fingerprint must not be treated as "matches anything", or the
    // binding would evaporate on any machine where detection fails.
    const result = evaluateLicense({
      payload: payloadOf({ machineId: 'another-machine' }),
      now: NOW,
      machineId: null
    })
    expect(result.state).toBe('machine-mismatch')
  })

  it('ignores the machine check for an unbound license', () => {
    const result = evaluateLicense({ payload: payloadOf(), now: NOW, machineId: null })
    expect(result.state).toBe('valid')
  })

  it('runs unrestricted when the build does not enforce licensing', () => {
    // Builds with no public key configured must not lock anyone out.
    const result = evaluateLicense({
      payload: null,
      now: NOW,
      machineId: null,
      enforced: false
    })
    expect(result.state).toBe('valid')
    expect(result.usable).toBe(true)
    expect(result.shouldWarn).toBe(false)
  })
})
