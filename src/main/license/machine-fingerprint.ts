// Derives a stable, per-machine identifier used to bind a license to one
// computer. Hashed before it leaves this module so the raw platform id (which
// identifies the hardware) is never displayed, stored, or emailed around.
//
// Each platform exposes an id that survives reboots, app reinstalls, and
// hostname changes. It does NOT survive an OS reinstall or a new machine —
// which is the intended behavior: that genuinely is a different machine.
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const FINGERPRINT_LENGTH = 24
const PROBE_TIMEOUT_MS = 4000

function hashIdentity(raw: string): string {
  // Truncated so it stays short enough for a customer to paste into an email
  // without wrapping; 24 hex chars (96 bits) leaves no realistic collision risk.
  return createHash('sha256').update(raw).digest('hex').slice(0, FINGERPRINT_LENGTH)
}

function readDarwinPlatformUuid(): string | null {
  const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS
  })
  return output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] ?? null
}

function readWindowsMachineGuid(): string | null {
  // Why reg.exe rather than a registry npm module: no extra dependency, and
  // this value is readable by an unelevated user.
  const output = execFileSync(
    'reg',
    ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
    { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS }
  )
  return output.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)?.[1] ?? null
}

function readLinuxMachineId(): string | null {
  for (const path of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = readFileSync(path, 'utf8').trim()
      if (value) {
        return value
      }
    } catch {
      // Try the next well-known location.
    }
  }
  return null
}

function readPlatformIdentity(platform: NodeJS.Platform): string | null {
  try {
    if (platform === 'darwin') {
      return readDarwinPlatformUuid()
    }
    if (platform === 'win32') {
      return readWindowsMachineGuid()
    }
    return readLinuxMachineId()
  } catch {
    // A sandboxed or minimal environment (containers, locked-down SSH hosts)
    // may block these probes. The caller falls back to a stored random id.
    return null
  }
}

export type FingerprintDeps = {
  platform?: NodeJS.Platform
  /** Reads the persisted fallback id, or null when none has been stored yet. */
  readFallbackId: () => string | null
  writeFallbackId: (id: string) => void
}

/**
 * Returns this machine's fingerprint.
 *
 * Falls back to a random id persisted in userData when the platform probe is
 * unavailable. Why not fail instead: a machine-bound license would then be
 * unusable on a host that merely blocks `ioreg`, and an unbound license does
 * not need a fingerprint at all. The fallback is weaker (it does not survive
 * clearing app data) but keeps the app working.
 */
export function computeMachineFingerprint(deps: FingerprintDeps): string {
  const platform = deps.platform ?? process.platform
  const identity = readPlatformIdentity(platform)
  if (identity) {
    return hashIdentity(`${platform}:${identity}`)
  }

  const stored = deps.readFallbackId()
  if (stored) {
    return hashIdentity(`fallback:${stored}`)
  }
  const generated = randomUUID()
  deps.writeFallbackId(generated)
  return hashIdentity(`fallback:${generated}`)
}
