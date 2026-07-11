import { useAppStore } from '@/store'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { revealStructuredReposFolders } from './structured-repos-folder-reveal'

// Projects a structured project into orca's native records, then refreshes the
// store in the same order App.tsx uses at startup (repos → groups → folder
// workspaces → worktrees, since worktrees enumerate over repos) and reveals each
// workspace's default-collapsed "src" folder. Shared by the create wizard's
// finish step and the import dialog so the sequence lives in exactly one place —
// a change to the refresh order can never drift between the two flows again.
//
// Self-reads the fetch actions from the store (same idiom as
// structured-repos-folder-reveal) so callers don't thread four selectors each.
// Throws on RPC failure; callers own the try/catch + toast/close.
export async function materializeAndRefreshStructured(
  target: RuntimeClientTarget,
  project: string
): Promise<void> {
  const materialized = (await callRuntimeRpc(target, 'iteration.materialize', {
    project
  })) as { result?: { workspaceGroupIds?: string[] } }

  const {
    fetchReposForAllHosts,
    fetchProjectGroupsForAllHosts,
    fetchFolderWorkspacesForAllHosts,
    fetchAllWorktrees
  } = useAppStore.getState()
  await fetchReposForAllHosts()
  await fetchProjectGroupsForAllHosts()
  await fetchFolderWorkspacesForAllHosts()
  await fetchAllWorktrees()

  revealStructuredReposFolders(materialized.result?.workspaceGroupIds ?? [])
}
