import { describe, expect, it, vi } from 'vitest'
import { computeMachineFingerprint } from './machine-fingerprint'

function fallbackStore(initial: string | null = null) {
  let stored = initial
  return {
    readFallbackId: () => stored,
    writeFallbackId: vi.fn((id: string) => {
      stored = id
    }),
    current: () => stored
  }
}

describe('computeMachineFingerprint', () => {
  it('returns a short hex fingerprint, never the raw platform id', () => {
    const store = fallbackStore()
    const fingerprint = computeMachineFingerprint(store)
    // Hashing matters: the raw id identifies the hardware and gets emailed
    // around during license issuance.
    expect(fingerprint).toMatch(/^[0-9a-f]{24}$/)
  })

  it('is stable across calls on the same machine', () => {
    const store = fallbackStore()
    expect(computeMachineFingerprint(store)).toBe(computeMachineFingerprint(store))
  })

  it('reuses a persisted fallback id when the platform probe cannot run', () => {
    // 'sunos' takes the linux branch, which finds no machine-id file here.
    const store = fallbackStore('stored-uuid')
    const first = computeMachineFingerprint({ ...store, platform: 'sunos' })
    const second = computeMachineFingerprint({ ...store, platform: 'sunos' })

    expect(first).toBe(second)
    expect(store.writeFallbackId).not.toHaveBeenCalled()
  })

  it('generates and persists a fallback id exactly once', () => {
    const store = fallbackStore(null)
    const first = computeMachineFingerprint({ ...store, platform: 'sunos' })

    expect(store.writeFallbackId).toHaveBeenCalledTimes(1)
    // The generated id must be reused, not regenerated on the next call —
    // otherwise a machine-bound license would break on every restart.
    expect(computeMachineFingerprint({ ...store, platform: 'sunos' })).toBe(first)
    expect(store.writeFallbackId).toHaveBeenCalledTimes(1)
  })

  it('distinguishes two machines that fell back to different ids', () => {
    const a = computeMachineFingerprint({ ...fallbackStore('id-a'), platform: 'sunos' })
    const b = computeMachineFingerprint({ ...fallbackStore('id-b'), platform: 'sunos' })
    expect(a).not.toBe(b)
  })
})
