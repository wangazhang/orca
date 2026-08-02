import { describe, expect, it } from 'vitest'
import { canAutoInstallUpdates } from './updater-install-capability'

describe('canAutoInstallUpdates', () => {
  it('refuses in-place install on macOS while builds are unsigned', () => {
    // Why: Squirrel.Mac rejects an update whose signing identity differs from
    // the running app's, and ad-hoc signatures have no stable identity.
    expect(canAutoInstallUpdates('darwin')).toBe(false)
  })

  it('allows in-place install on Windows and Linux', () => {
    expect(canAutoInstallUpdates('win32')).toBe(true)
    expect(canAutoInstallUpdates('linux')).toBe(true)
  })
})
