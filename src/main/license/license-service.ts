// Orchestrates licensing for the main process: load the stored token, verify it,
// check the machine binding, and report a state the UI can act on.
//
// Deliberately thin. Format lives in shared/license-token, the valid/grace/expired
// rules in shared/license-state, persistence in ./license-store — so swapping in
// a server-backed check later means replacing this file, not rewriting the rules.
import { app } from 'electron'
import {
  evaluateLicense,
  type LicenseActivationResult,
  type LicenseStatus
} from '../../shared/license-state'
import { isLicensingEnforced, parseLicenseToken } from '../../shared/license-token'
import { computeMachineFingerprint } from './machine-fingerprint'
import { advanceMonotonicClock, readLicenseRecord, writeLicenseRecord } from './license-store'

export type { LicenseActivationResult, LicenseStatus }

function userDataDir(): string {
  return app.getPath('userData')
}

function resolveMachineId(dir: string): string {
  return computeMachineFingerprint({
    readFallbackId: () => readLicenseRecord(dir).fallbackMachineId ?? null,
    writeFallbackId: (id) => {
      writeLicenseRecord(dir, { ...readLicenseRecord(dir), fallbackMachineId: id })
    }
  })
}

/** Current licensing status. Safe to call at any time; performs no network I/O. */
export function getLicenseStatus(now: number = Date.now()): LicenseStatus {
  const dir = userDataDir()
  const machineId = resolveMachineId(dir)
  const enforced = isLicensingEnforced()

  // Why advance the watermark even when licensing is off: it keeps accruing, so
  // enabling enforcement later does not start from a clock the user has already
  // wound back.
  const effectiveNow = advanceMonotonicClock(dir, now)
  const token = readLicenseRecord(dir).token
  const payload = token ? parseLicenseToken(token) : null

  // Distinguish "no license" from "a license that will not verify" — the second
  // needs different UI copy, since re-pasting the same token will not help.
  const evaluation = evaluateLicense({ payload, now: effectiveNow, machineId, enforced })
  if (enforced && token && !payload) {
    return { ...evaluation, state: 'invalid', usable: false, machineId, enforced }
  }
  return { ...evaluation, machineId, enforced }
}

export type ActivationResult = LicenseActivationResult

/**
 * Validates and stores a pasted license.
 *
 * Rejects without writing when the token cannot be used on this machine, so a
 * bad paste never displaces a working license the user already had.
 */
export function activateLicense(raw: string, now: number = Date.now()): LicenseActivationResult {
  const dir = userDataDir()
  const payload = parseLicenseToken(raw)
  if (!payload) {
    return { ok: false, reason: 'invalid' }
  }

  const machineId = resolveMachineId(dir)
  const effectiveNow = advanceMonotonicClock(dir, now)
  const evaluation = evaluateLicense({ payload, now: effectiveNow, machineId, enforced: true })
  if (evaluation.state === 'machine-mismatch') {
    return { ok: false, reason: 'machine-mismatch' }
  }
  if (!evaluation.usable) {
    return { ok: false, reason: 'expired' }
  }

  writeLicenseRecord(dir, { ...readLicenseRecord(dir), token: raw.trim() })
  return { ok: true, status: getLicenseStatus(now) }
}

/** This machine's fingerprint, for the customer to send when requesting a license. */
export function getMachineFingerprint(): string {
  return resolveMachineId(userDataDir())
}
