import { describe, expect, it, vi } from 'vitest'

const storeState = {
  collapsedGroups: new Set<string>(),
  toggleCollapsedGroup: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: { getState: () => storeState }
}))

vi.mock('./worktree-list-groups', () => ({
  getStructuredReposFolderKey: (id: string) => `struct-repos-folder:${id}`
}))

import { revealStructuredReposFolders } from './structured-repos-folder-reveal'

describe('revealStructuredReposFolders', () => {
  it('expands only the collapsed folders (inverted collapse: absent key = collapsed)', () => {
    storeState.collapsedGroups = new Set<string>(['struct-repos-folder:ws-open'])
    storeState.toggleCollapsedGroup = vi.fn()

    revealStructuredReposFolders(['ws-open', 'ws-collapsed'])

    // ws-open is already expanded (key present) → left alone; ws-collapsed is
    // collapsed (key absent) → toggled to expand it.
    expect(storeState.toggleCollapsedGroup).toHaveBeenCalledTimes(1)
    expect(storeState.toggleCollapsedGroup).toHaveBeenCalledWith('struct-repos-folder:ws-collapsed')
  })

  it('does nothing for an empty workspace list', () => {
    storeState.collapsedGroups = new Set<string>()
    storeState.toggleCollapsedGroup = vi.fn()

    revealStructuredReposFolders([])

    expect(storeState.toggleCollapsedGroup).not.toHaveBeenCalled()
  })
})
