import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { FolderWorkspace, ProjectGroup, Worktree } from '../../../../shared/types'

const FOLDER_WORKSPACE_REPO_ID_PREFIX = 'folder-workspace:'

export type AiVaultStructuredProjectScope = {
  key: string
  label: string
  rootPath: string
  normalizedRootPath: string
  hostKey: ExecutionHostId
  groupIds: ReadonlySet<string>
  folderWorkspaceIds: ReadonlySet<string>
  workspacePaths: readonly string[]
}

type MutableStructuredProjectScope = {
  key: string
  label: string
  rootPath: string
  normalizedRootPath: string
  hostKey: ExecutionHostId
  groupIds: Set<string>
  folderWorkspaceIds: Set<string>
  workspacePathsByComparisonPath: Map<string, string>
}

export function toAiVaultStructuredProjectKey(rootPath: string, hostKey: ExecutionHostId): string {
  return `structured:${hostKey}:${normalizeRuntimePathForComparison(rootPath)}`
}

export function parseAiVaultFolderWorkspaceRepoId(repoId: string): string | null {
  return repoId.startsWith(FOLDER_WORKSPACE_REPO_ID_PREFIX)
    ? repoId.slice(FOLDER_WORKSPACE_REPO_ID_PREFIX.length) || null
    : null
}

export function buildAiVaultStructuredProjectScopes(
  projectGroups: readonly ProjectGroup[] = [],
  folderWorkspaces: readonly FolderWorkspace[] = []
): AiVaultStructuredProjectScope[] {
  const groupsById = new Map(projectGroups.map((group) => [group.id, group]))
  const scopesByKey = new Map<string, MutableStructuredProjectScope>()

  const ensureScope = (group: ProjectGroup): MutableStructuredProjectScope | null => {
    const rootGroup = findStructuredRootGroup(group, groupsById)
    if (!rootGroup?.parentPath?.trim()) {
      return null
    }
    const rootPath = rootGroup.parentPath
    const hostKey = getProjectGroupExecutionHostId(rootGroup)
    const key = toAiVaultStructuredProjectKey(rootPath, hostKey)
    const existing = scopesByKey.get(key)
    if (existing) {
      return existing
    }
    const scope: MutableStructuredProjectScope = {
      key,
      label: rootGroup.name || rootPath,
      rootPath,
      normalizedRootPath: normalizeRuntimePathForComparison(rootPath),
      hostKey,
      groupIds: new Set([rootGroup.id]),
      folderWorkspaceIds: new Set(),
      workspacePathsByComparisonPath: new Map()
    }
    scopesByKey.set(key, scope)
    return scope
  }

  for (const group of projectGroups) {
    if (group.createdFrom !== 'structured') {
      continue
    }
    const scope = ensureScope(group)
    if (!scope) {
      continue
    }
    scope.groupIds.add(group.id)
    if (group.parentGroupId && group.parentPath?.trim()) {
      addWorkspacePath(scope, group.parentPath)
    }
  }

  for (const workspace of folderWorkspaces) {
    const group = groupsById.get(workspace.projectGroupId)
    if (!group || group.createdFrom !== 'structured') {
      continue
    }
    const scope = ensureScope(group)
    if (!scope) {
      continue
    }
    scope.groupIds.add(group.id)
    scope.folderWorkspaceIds.add(workspace.id)
    addWorkspacePath(scope, workspace.folderPath)
  }

  return [...scopesByKey.values()].map((scope) => ({
    key: scope.key,
    label: scope.label,
    rootPath: scope.rootPath,
    normalizedRootPath: scope.normalizedRootPath,
    hostKey: scope.hostKey,
    groupIds: scope.groupIds,
    folderWorkspaceIds: scope.folderWorkspaceIds,
    workspacePaths: [...scope.workspacePathsByComparisonPath.values()]
  }))
}

export function findAiVaultStructuredProjectScopeForGroupId(
  groupId: string | null | undefined,
  scopes: readonly AiVaultStructuredProjectScope[]
): AiVaultStructuredProjectScope | null {
  if (!groupId) {
    return null
  }
  return scopes.find((scope) => scope.groupIds.has(groupId)) ?? null
}

export function findAiVaultStructuredProjectScopeForWorktree(
  worktree: Pick<Worktree, 'hostId' | 'path' | 'repoId'> | null,
  scopes: readonly AiVaultStructuredProjectScope[]
): AiVaultStructuredProjectScope | null {
  if (!worktree) {
    return null
  }

  const folderWorkspaceGroupId = parseAiVaultFolderWorkspaceRepoId(worktree.repoId)
  const folderWorkspaceScope = findAiVaultStructuredProjectScopeForGroupId(
    folderWorkspaceGroupId,
    scopes
  )
  if (folderWorkspaceScope) {
    return folderWorkspaceScope
  }

  const worktreeHostId = normalizeExecutionHostId(worktree.hostId)
  const matches = scopes.filter((scope) => {
    if (worktreeHostId && scope.hostKey !== worktreeHostId) {
      return false
    }
    return isPathInsideOrEqual(scope.normalizedRootPath, worktree.path)
  })
  return (
    matches.sort(
      (left, right) => right.normalizedRootPath.length - left.normalizedRootPath.length
    )[0] ?? null
  )
}

export function isAiVaultWorktreeInsideStructuredProjectScope(
  worktree: Pick<Worktree, 'hostId' | 'path'>,
  scope: AiVaultStructuredProjectScope
): boolean {
  const worktreeHostId = normalizeExecutionHostId(worktree.hostId)
  if (worktreeHostId && worktreeHostId !== scope.hostKey) {
    return false
  }
  return isPathInsideOrEqual(scope.normalizedRootPath, worktree.path)
}

function findStructuredRootGroup(
  group: ProjectGroup,
  groupsById: ReadonlyMap<string, ProjectGroup>
): ProjectGroup | null {
  if (group.createdFrom !== 'structured') {
    return null
  }

  let current: ProjectGroup = group
  const seen = new Set<string>()
  while (current.parentGroupId) {
    if (seen.has(current.id)) {
      return null
    }
    seen.add(current.id)
    const parent = groupsById.get(current.parentGroupId)
    if (!parent || parent.createdFrom !== 'structured') {
      return null
    }
    current = parent
  }
  return current.createdFrom === 'structured' ? current : null
}

function getProjectGroupExecutionHostId(
  group: Pick<ProjectGroup, 'connectionId' | 'executionHostId'>
): ExecutionHostId {
  const executionHostId = normalizeExecutionHostId(group.executionHostId)
  if (executionHostId) {
    return executionHostId
  }
  const connectionId = group.connectionId?.trim()
  return connectionId ? toSshExecutionHostId(connectionId) : LOCAL_EXECUTION_HOST_ID
}

function addWorkspacePath(scope: MutableStructuredProjectScope, pathValue: string): void {
  const trimmedPath = pathValue.trim()
  if (!trimmedPath) {
    return
  }
  const comparisonPath = normalizeRuntimePathForComparison(trimmedPath)
  if (!scope.workspacePathsByComparisonPath.has(comparisonPath)) {
    scope.workspacePathsByComparisonPath.set(comparisonPath, trimmedPath)
  }
}
