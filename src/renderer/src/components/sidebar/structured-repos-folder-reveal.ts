import { useAppStore } from '@/store'
import { getStructuredReposFolderKey } from './worktree-list-groups'

// Expands each given workspace's "src" folder so repos freshly mounted into a
// structured workspace are visible immediately, instead of hidden inside the
// default-collapsed folder. Inverted collapse semantics: presence in
// collapsedGroups means expanded, so this only toggles folders that are
// currently collapsed (idempotent — never collapses an already-open folder).
export function revealStructuredReposFolders(workspaceGroupIds: readonly string[]): void {
  const { collapsedGroups, toggleCollapsedGroup } = useAppStore.getState()
  for (const workspaceGroupId of workspaceGroupIds) {
    const reposFolderKey = getStructuredReposFolderKey(workspaceGroupId)
    if (!collapsedGroups.has(reposFolderKey)) {
      toggleCollapsedGroup(reposFolderKey)
    }
  }
}
