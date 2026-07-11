import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  addAdditionalValidWorkspaceKeys,
  type WorkspaceSessionHydrationOptions
} from '@/lib/workspace-session-hydration-keys'
import type { AppState } from '../types'

// The set of worktree/workspace ids whose persisted session state (tabs, agents,
// editor files, browser tabs) survives a hydration pass. Anything keyed to an id
// outside this set is dropped as belonging to a deleted worktree.
//
// Why include detected — not just visible — worktrees: authoritative git scans
// surface worktrees that are hidden from the sidebar, notably a structured
// project's `src/` leaves, which live under a shared repo registered with
// `externalWorktreeVisibility:'hide'` and only render via orca-managed meta.
// Those leaves are absent from `worktreesByRepo` (the visible set) whenever the
// meta lookup misses at scan time, yet they are always in `detectedWorktreesByRepo`
// (the raw scan). The startup purge deliberately keys off the detected set so
// hiding a worktree never deletes its state; hydration must use the same superset
// or a restart silently drops the hidden worktree's tabs/agents before the purge
// can protect them. Persisted tabs and the detected entry share the same
// git-scanned path id, so they line up.
export function collectSessionHydrationValidWorktreeIds(
  state: Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo' | 'folderWorkspaces'>,
  options?: WorkspaceSessionHydrationOptions
): Set<string> {
  const validWorktreeIds = new Set<string>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      validWorktreeIds.add(worktree.id)
    }
  }
  for (const detected of Object.values(state.detectedWorktreesByRepo)) {
    for (const worktree of detected.worktrees) {
      validWorktreeIds.add(worktree.id)
    }
  }
  validWorktreeIds.add(FLOATING_TERMINAL_WORKTREE_ID)
  for (const workspace of state.folderWorkspaces) {
    validWorktreeIds.add(folderWorkspaceKey(workspace.id))
  }
  addAdditionalValidWorkspaceKeys(validWorktreeIds, options)
  return validWorktreeIds
}
