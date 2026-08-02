// Decides what a verified license payload means right now: usable, in its
// post-expiry grace window, or finished. Pure — no clock, no disk, no electron —
// so every boundary below is directly testable.
import type { LicensePayload } from './license-token'

export const DAY_MS = 24 * 60 * 60 * 1000

// Why a grace window at all: expiry lands mid-task for someone, and abruptly
// locking an editor the moment a timestamp passes destroys work in progress.
// The window is short enough to still be a real deadline.
export const GRACE_PERIOD_DAYS = 7
/** How far ahead of expiry the UI starts warning. */
export const EXPIRY_WARNING_DAYS = 14

export type LicenseState =
  /** No license has been entered yet. */
  | 'missing'
  /** Present but unreadable: wrong signature, tampered payload, or malformed. */
  | 'invalid'
  /** Signed for a different machine than this one. */
  | 'machine-mismatch'
  /** Within its term. */
  | 'valid'
  /** Past expiry but inside the grace window — usable, with a warning. */
  | 'grace'
  /** Past expiry and past the grace window. */
  | 'expired'

export type LicenseEvaluation = {
  state: LicenseState
  /** Whole days until expiry; negative once past it. Null when there is no license. */
  daysRemaining: number | null
  expiresAt: number | null
  licensee: string | null
  /** True while the app should keep working. */
  usable: boolean
  /** True when the UI should surface an expiry warning. */
  shouldWarn: boolean
}

/** Evaluation plus machine identity — the shape sent to the renderer over IPC. */
export type LicenseStatus = LicenseEvaluation & {
  /** This machine's fingerprint, shown so a customer can request a bound license. */
  machineId: string
  /** False when the build carries no public key and licensing is inactive. */
  enforced: boolean
}

export type LicenseActivationResult =
  | { ok: true; status: LicenseStatus }
  | { ok: false; reason: 'invalid' | 'machine-mismatch' | 'expired' }

const UNLICENSED: Omit<LicenseEvaluation, 'state'> = {
  daysRemaining: null,
  expiresAt: null,
  licensee: null,
  usable: false,
  shouldWarn: true
}

/**
 * `now` is supplied by the caller rather than read here so the store can pass a
 * clock that never moves backwards (see license-store's monotonic watermark).
 * Passing `Date.now()` directly would make the whole evaluation trivially
 * bypassable by changing the system clock.
 */
export function evaluateLicense(params: {
  payload: LicensePayload | null
  now: number
  machineId: string | null
  /** False when this build ships without a public key — licensing is off. */
  enforced?: boolean
}): LicenseEvaluation {
  const { payload, now, machineId } = params
  const enforced = params.enforced ?? true

  // An unenforced build behaves as if fully licensed: no key was configured, so
  // there is nothing to check and nothing to lock.
  if (!enforced) {
    return { ...UNLICENSED, state: 'valid', usable: true, shouldWarn: false }
  }
  if (!payload) {
    return { ...UNLICENSED, state: 'missing' }
  }
  if (payload.machineId && payload.machineId !== machineId) {
    return {
      ...UNLICENSED,
      state: 'machine-mismatch',
      expiresAt: payload.expiresAt,
      licensee: payload.licensee
    }
  }

  const msRemaining = payload.expiresAt - now
  // Why ceil: with 6 hours left the honest answer is "1 day", not "0 days".
  // Only a fully elapsed term reaches 0.
  const daysRemaining = Math.ceil(msRemaining / DAY_MS)
  const base = {
    daysRemaining,
    expiresAt: payload.expiresAt,
    licensee: payload.licensee
  }

  if (msRemaining > 0) {
    return {
      ...base,
      state: 'valid',
      usable: true,
      shouldWarn: daysRemaining <= EXPIRY_WARNING_DAYS
    }
  }
  if (now < payload.expiresAt + GRACE_PERIOD_DAYS * DAY_MS) {
    return { ...base, state: 'grace', usable: true, shouldWarn: true }
  }
  return { ...base, state: 'expired', usable: false, shouldWarn: true }
}
