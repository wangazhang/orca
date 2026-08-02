import { beforeEach, describe, expect, it, vi } from 'vitest'

const { netFetchMock } = vi.hoisted(() => ({ netFetchMock: vi.fn() }))

vi.mock('electron', () => ({
  net: { fetch: netFetchMock }
}))

// Ships unconfigured: no changelog/nudge service belongs to this fork.
vi.mock('../shared/update-feed-origin', () => ({
  UPDATE_CHANGELOG_BASE_URL: ''
}))

import { fetchChangelog } from './updater-changelog'
import { fetchNudge } from './updater-nudge'

describe('changelog and nudge with no service configured', () => {
  beforeEach(() => {
    netFetchMock.mockReset()
  })

  it('does not contact any host for the changelog', async () => {
    // Why: leaving upstream's URL in place would send every install's update
    // check to a third-party host for a response that can only be discarded.
    await expect(fetchChangelog('1.4.200', '1.4.100')).resolves.toBeNull()
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('does not contact any host for the nudge campaign', async () => {
    await expect(fetchNudge()).resolves.toBeNull()
    expect(netFetchMock).not.toHaveBeenCalled()
  })
})
