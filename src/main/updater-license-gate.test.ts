import { describe, expect, it, vi } from 'vitest'

const { getLicenseStatusMock } = vi.hoisted(() => ({ getLicenseStatusMock: vi.fn() }))

vi.mock('./license/license-service', () => ({
  getLicenseStatus: getLicenseStatusMock
}))

import { isUpdateAllowedByLicense } from './updater-license-gate'

describe('isUpdateAllowedByLicense', () => {
  it('allows updates while the license is usable', () => {
    getLicenseStatusMock.mockReturnValue({ usable: true })
    expect(isUpdateAllowedByLicense()).toBe(true)
  })

  it('allows updates during the grace period', () => {
    getLicenseStatusMock.mockReturnValue({ usable: true, state: 'grace' })
    expect(isUpdateAllowedByLicense()).toBe(true)
  })

  it('blocks updates once the license is unusable', () => {
    getLicenseStatusMock.mockReturnValue({ usable: false, state: 'expired' })
    expect(isUpdateAllowedByLicense()).toBe(false)
  })

  it('fails open when licensing itself throws', () => {
    // Why: a licensing bug must not strand users on an old build — that would
    // also block the update that fixes the bug.
    getLicenseStatusMock.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(isUpdateAllowedByLicense()).toBe(true)
  })
})
