import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { ProjectHostSetupProjection } from '../../../../shared/project-host-setup-projection'
import type { ProjectHostSetup, Repo, Worktree } from '../../../../shared/types'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import {
  isAiVaultWorktreeInsideStructuredProjectScope,
  type AiVaultStructuredProjectScope
} from './ai-vault-structured-projects'

export type AiVaultSessionProjectCandidate = {
  source: 'structured' | 'worktree' | 'setup'
  normalizedPath: string
  hostKey: ExecutionHostId
  projectId: string | null
  repoId: string | null
  key?: string
  label?: string
}

export function buildAiVaultSessionProjectCandidates({
  worktrees,
  projection,
  repoById,
  setupByRepoId,
  structuredScopes = []
}: {
  worktrees: readonly Worktree[]
  projection: ProjectHostSetupProjection
  repoById: ReadonlyMap<string, Repo>
  setupByRepoId: ReadonlyMap<string, ProjectHostSetup>
  structuredScopes?: readonly AiVaultStructuredProjectScope[]
}): AiVaultSessionProjectCandidate[] {
  const candidates: AiVaultSessionProjectCandidate[] = []
  const setupRepoIds = new Set<string>()

  for (const worktree of worktrees) {
    if (!hasCandidatePath(worktree.path)) {
      continue
    }
    const repo = repoById.get(worktree.repoId)
    const setup = setupByRepoId.get(worktree.repoId)
    candidates.push({
      source: 'worktree',
      normalizedPath: normalizeRuntimePathForComparison(worktree.path),
      hostKey: resolveCandidateHostId(
        worktree.hostId,
        setup?.hostId,
        repo ? getRepoExecutionHostId(repo) : null
      ),
      projectId: worktree.projectId ?? setup?.projectId ?? null,
      repoId: worktree.repoId
    })
  }

  for (const setup of projection.setups) {
    if (setup.repoId && hasCandidatePath(setup.path)) {
      setupRepoIds.add(setup.repoId)
    }
    if (!hasCandidatePath(setup.path)) {
      continue
    }
    candidates.push({
      source: 'setup',
      normalizedPath: normalizeRuntimePathForComparison(setup.path),
      hostKey: resolveCandidateHostId(setup.hostId, getRepoExecutionHostId(setup)),
      projectId: setup.projectId,
      repoId: setup.repoId || null
    })
  }

  for (const repo of repoById.values()) {
    if (setupRepoIds.has(repo.id) || !hasCandidatePath(repo.path)) {
      continue
    }
    candidates.push({
      source: 'setup',
      normalizedPath: normalizeRuntimePathForComparison(repo.path),
      hostKey: getRepoExecutionHostId(repo),
      projectId: null,
      repoId: repo.id
    })
  }

  for (const scope of structuredScopes) {
    addStructuredProjectCandidate(candidates, scope.rootPath, scope)
    for (const workspacePath of scope.workspacePaths) {
      addStructuredProjectCandidate(candidates, workspacePath, scope)
    }
    for (const worktree of worktrees) {
      if (
        hasCandidatePath(worktree.path) &&
        isAiVaultWorktreeInsideStructuredProjectScope(worktree, scope)
      ) {
        addStructuredProjectCandidate(candidates, worktree.path, scope)
      }
    }
  }

  return candidates
}

export function compareAiVaultSessionProjectCandidates(
  left: AiVaultSessionProjectCandidate,
  right: AiVaultSessionProjectCandidate
): number {
  const lengthDifference = right.normalizedPath.length - left.normalizedPath.length
  if (lengthDifference !== 0) {
    return lengthDifference
  }
  if (left.source === right.source) {
    return 0
  }
  return candidateSourcePriority(left.source) - candidateSourcePriority(right.source)
}

function addStructuredProjectCandidate(
  candidates: AiVaultSessionProjectCandidate[],
  pathValue: string,
  scope: AiVaultStructuredProjectScope
): void {
  if (!hasCandidatePath(pathValue)) {
    return
  }
  candidates.push({
    source: 'structured',
    normalizedPath: normalizeRuntimePathForComparison(pathValue),
    hostKey: scope.hostKey,
    projectId: null,
    repoId: null,
    key: scope.key,
    label: scope.label
  })
}

function resolveCandidateHostId(
  ...values: readonly (string | null | undefined)[]
): ExecutionHostId {
  for (const value of values) {
    const hostId = normalizeExecutionHostId(value)
    if (hostId) {
      return hostId
    }
  }
  return LOCAL_EXECUTION_HOST_ID
}

function hasCandidatePath(pathValue: string): boolean {
  return pathValue.trim().length > 0
}

function candidateSourcePriority(source: AiVaultSessionProjectCandidate['source']): number {
  switch (source) {
    case 'structured':
      return 0
    case 'worktree':
      return 1
    case 'setup':
      return 2
  }
}
