import { describe, expect, it } from 'vitest'
import { collectSessionHydrationValidWorktreeIds } from './session-hydration-valid-worktree-ids'
import type { AppState } from '../types'

function makeState(
  overrides: Partial<
    Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo' | 'folderWorkspaces'>
  >
): Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo' | 'folderWorkspaces'> {
  return {
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    ...overrides
  }
}

describe('collectSessionHydrationValidWorktreeIds', () => {
  it('includes hidden-but-detected worktrees so hydration does not drop their state', () => {
    // A structured src leaf is detected by the authoritative git scan but hidden
    // from the visible worktreesByRepo (shared repo registered `hide`). Hydration
    // must still treat it as valid, mirroring the startup purge, or a restart
    // silently drops its persisted tabs/agents.
    const leafId = 'repo-1::/root/ws/src/mrs'
    const state = makeState({
      worktreesByRepo: {},
      detectedWorktreesByRepo: {
        'repo-1': {
          repoId: 'repo-1',
          authoritative: true,
          source: 'git',
          worktrees: [{ id: leafId } as never]
        }
      }
    })
    const ids = collectSessionHydrationValidWorktreeIds(state)
    expect(ids.has(leafId)).toBe(true)
  })

  it('includes visible worktrees, folder workspaces, and additional keys', () => {
    const state = makeState({
      worktreesByRepo: { 'repo-1': [{ id: 'repo-1::/a' } as never] },
      folderWorkspaces: [{ id: 'fw-1' } as never]
    })
    const ids = collectSessionHydrationValidWorktreeIds(state, {
      additionalValidWorkspaceKeys: ['folder:extra' as never]
    })
    expect(ids.has('repo-1::/a')).toBe(true)
    expect(ids.has('folder:fw-1')).toBe(true)
    expect(ids.has('folder:extra')).toBe(true)
    expect(ids.has('global-floating-terminal')).toBe(true)
  })
})
