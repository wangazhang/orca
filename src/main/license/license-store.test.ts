import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  advanceMonotonicClock,
  LICENSE_FILE_NAME,
  readLicenseRecord,
  writeLicenseRecord
} from './license-store'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_750_000_000_000

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orca-license-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('license record persistence', () => {
  it('round-trips a record', () => {
    writeLicenseRecord(dir, { token: 'ORCA1.a.b', maxSeenTime: NOW })
    expect(readLicenseRecord(dir)).toEqual({ token: 'ORCA1.a.b', maxSeenTime: NOW })
  })

  it('reports an empty record when no file exists', () => {
    expect(readLicenseRecord(dir)).toEqual({})
  })

  it('survives a corrupt file instead of throwing at startup', () => {
    // Why: this runs during boot. Throwing here would stop the app before the
    // user could paste a working license.
    writeFileSync(join(dir, LICENSE_FILE_NAME), '{ not json', 'utf8')
    expect(readLicenseRecord(dir)).toEqual({})
  })

  it('discards a record whose shape fails validation', () => {
    writeFileSync(join(dir, LICENSE_FILE_NAME), JSON.stringify({ maxSeenTime: -5 }), 'utf8')
    expect(readLicenseRecord(dir)).toEqual({})
  })

  it('creates the directory when it does not exist yet', () => {
    const nested = join(dir, 'nested', 'deeper')
    writeLicenseRecord(nested, { token: 'ORCA1.a.b' })
    expect(readLicenseRecord(nested).token).toBe('ORCA1.a.b')
  })
})

describe('monotonic clock watermark', () => {
  it('records and returns a clock that moves forward', () => {
    expect(advanceMonotonicClock(dir, NOW)).toBe(NOW)
    expect(advanceMonotonicClock(dir, NOW + DAY_MS)).toBe(NOW + DAY_MS)
    expect(readLicenseRecord(dir).maxSeenTime).toBe(NOW + DAY_MS)
  })

  it('ignores a clock wound backwards', () => {
    // The whole point: setting the system clock back must not buy license time.
    advanceMonotonicClock(dir, NOW)
    expect(advanceMonotonicClock(dir, NOW - 30 * DAY_MS)).toBe(NOW)
    expect(readLicenseRecord(dir).maxSeenTime).toBe(NOW)
  })

  it('keeps the high-water mark after a rollback and a smaller advance', () => {
    advanceMonotonicClock(dir, NOW + 10 * DAY_MS)
    advanceMonotonicClock(dir, NOW)
    expect(advanceMonotonicClock(dir, NOW + DAY_MS)).toBe(NOW + 10 * DAY_MS)
  })

  it('preserves the stored token while updating the watermark', () => {
    writeLicenseRecord(dir, { token: 'ORCA1.a.b' })
    advanceMonotonicClock(dir, NOW)
    expect(readLicenseRecord(dir)).toEqual({ token: 'ORCA1.a.b', maxSeenTime: NOW })
  })
})
