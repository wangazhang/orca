import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import type { ProjectHostSetupProjection } from '../../../../shared/project-host-setup-projection'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type {
  FolderWorkspace,
  ProjectGroup,
  ProjectHostSetup,
  Repo,
  Worktree
} from '../../../../shared/types'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison,
  normalizeRuntimePathSeparators
} from '../../../../shared/cross-platform-path'
import {
  buildAiVaultStructuredProjectScopes,
  findAiVaultStructuredProjectScopeForGroupId,
  findAiVaultStructuredProjectScopeForWorktree,
  type AiVaultStructuredProjectScope
} from './ai-vault-structured-projects'
import {
  buildAiVaultSessionProjectCandidates,
  compareAiVaultSessionProjectCandidates,
  type AiVaultSessionProjectCandidate
} from './ai-vault-session-project-candidates'

// Why: the plain project descriptor moved to /shared (so the lifted filter core
// stays renderer-free). Its `kind` union carries 'structured', which the
// aggregation logic below produces. Re-export for renderer import parity.
import type { AiVaultSessionProject } from '../../../../shared/ai-vault-session-filters'
export type { AiVaultSessionProject } from '../../../../shared/ai-vault-session-filters'


export type AiVaultProjectContext = {
  activeProjectKey: string | null
  activeRepoId: string | null
  projectLabelByKey: Map<string, string>
  sessionProjectById: Map<string, AiVaultSessionProject>
}

type ProjectResolverArgs = {
  repos: readonly Repo[]
  worktrees: readonly Worktree[]
  folderWorkspaces?: readonly FolderWorkspace[]
  projectGroups?: readonly ProjectGroup[]
  projectHostSetupProjection: ProjectHostSetupProjection
  activeRepo: Repo | null
  activeWorktree: Worktree | null
  sessions: readonly AiVaultSession[]
}

export function buildAiVaultProjectContext({
  repos,
  worktrees,
  folderWorkspaces = [],
  projectGroups = [],
  projectHostSetupProjection,
  activeRepo,
  activeWorktree,
  sessions
}: ProjectResolverArgs): AiVaultProjectContext {
  const repoById = new Map(repos.map((repo) => [repo.id, repo]))
  const setupByRepoId = buildSetupByRepoId(projectHostSetupProjection.setups)
  const structuredScopes = buildAiVaultStructuredProjectScopes(projectGroups, folderWorkspaces)
  const projectLabelByKey = buildProjectLabelByKey(
    repos,
    projectHostSetupProjection,
    structuredScopes
  )
  const candidates = buildAiVaultSessionProjectCandidates({
    worktrees,
    projection: projectHostSetupProjection,
    repoById,
    setupByRepoId,
    structuredScopes
  })
  const sessionProjectById = new Map<string, AiVaultSessionProject>()

  for (const session of sessions) {
    sessionProjectById.set(
      session.id,
      resolveSessionProject(session, candidates, projectLabelByKey)
    )
  }

  return {
    activeProjectKey: resolveActiveProjectKey(
      activeRepo,
      activeWorktree,
      setupByRepoId,
      structuredScopes
    ),
    activeRepoId: activeRepo?.id ?? activeWorktree?.repoId ?? null,
    projectLabelByKey,
    sessionProjectById
  }
}

export function toAiVaultProjectKey(
  projectId: string | null | undefined,
  repoId?: string | null
): string | null {
  if (projectId) {
    // Why: legacy projections can already use repo-prefixed project ids; wrapping
    // them again would split active scope and resolved session keys.
    return projectId.startsWith('repo:') ? projectId : `project:${projectId}`
  }
  return repoId ? `repo:${repoId}` : null
}

function buildSetupByRepoId(
  setups: readonly ProjectHostSetup[]
): ReadonlyMap<string, ProjectHostSetup> {
  const setupByRepoId = new Map<string, ProjectHostSetup>()
  for (const setup of setups) {
    if (setup.repoId && !setupByRepoId.has(setup.repoId)) {
      setupByRepoId.set(setup.repoId, setup)
    }
  }
  return setupByRepoId
}

function buildProjectLabelByKey(
  repos: readonly Repo[],
  projection: ProjectHostSetupProjection,
  structuredScopes: readonly AiVaultStructuredProjectScope[] = []
): Map<string, string> {
  const labels = new Map<string, string>()
  const projectLabelById = new Map(
    projection.projects.map((project) => [project.id, project.displayName])
  )

  for (const project of projection.projects) {
    const key = toAiVaultProjectKey(project.id, project.sourceRepoIds[0])
    if (key && !key.startsWith('repo:')) {
      labels.set(key, project.displayName)
    }
  }

  for (const repo of repos) {
    labels.set(`repo:${repo.id}`, repo.displayName)
  }

  for (const setup of projection.setups) {
    const key = toAiVaultProjectKey(setup.projectId, setup.repoId)
    if (key && !labels.has(key)) {
      labels.set(key, projectLabelById.get(setup.projectId) ?? setup.displayName)
    }
  }

  for (const scope of structuredScopes) {
    labels.set(scope.key, scope.label)
  }

  return labels
}

function resolveSessionProject(
  session: AiVaultSession,
  candidates: readonly AiVaultSessionProjectCandidate[],
  projectLabelByKey: ReadonlyMap<string, string>
): AiVaultSessionProject {
  const cwd = session.cwd
  if (!cwd) {
    return { kind: 'unknown', key: 'unknown', label: '' }
  }

  const matches = candidates.filter((candidate) =>
    isPathInsideOrEqual(candidate.normalizedPath, cwd)
  )
  const sessionHostId = normalizeExecutionHostId(session.executionHostId)
  const hostMatches = sessionHostId
    ? matches.filter((candidate) => candidate.hostKey === sessionHostId)
    : matches
  if (sessionHostId && matches.length > 0 && hostMatches.length === 0) {
    // Why: same-path projects can exist on several hosts; a tagged transcript
    // should never be attributed to a project on a different machine.
    return folderProject(cwd)
  }

  const hostBuckets = new Set(hostMatches.map((candidate) => candidate.hostKey))
  if (!sessionHostId && hostBuckets.size > 1) {
    return folderProject(cwd)
  }

  const bestCandidate = hostMatches.sort(compareAiVaultSessionProjectCandidates)[0]
  if (!bestCandidate) {
    return folderProject(cwd)
  }

  if (bestCandidate.key) {
    return {
      kind: 'structured',
      key: bestCandidate.key,
      label: projectLabelByKey.get(bestCandidate.key) ?? bestCandidate.label ?? bestCandidate.key,
      hostKey: bestCandidate.hostKey
    }
  }

  const key = toAiVaultProjectKey(bestCandidate.projectId, bestCandidate.repoId)
  if (!key) {
    return folderProject(cwd)
  }

  return {
    kind: 'repo',
    key,
    label: projectLabelByKey.get(key) ?? key,
    ...(bestCandidate.projectId ? { projectId: bestCandidate.projectId } : {}),
    ...(bestCandidate.repoId ? { repoId: bestCandidate.repoId } : {}),
    hostKey: bestCandidate.hostKey
  }
}

function folderProject(cwd: string): AiVaultSessionProject {
  const normalizedPath = normalizeRuntimePathForComparison(cwd)
  return {
    kind: 'folder',
    key: `folder:${normalizedPath}`,
    label: compactFolderLabel(cwd)
  }
}

function compactFolderLabel(pathValue: string): string {
  const parts = normalizeRuntimePathSeparators(pathValue).split('/').filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(-2).join('/')
  }
  return parts[0] ?? pathValue
}

function resolveActiveProjectKey(
  activeRepo: Repo | null,
  activeWorktree: Worktree | null,
  setupByRepoId: ReadonlyMap<string, ProjectHostSetup>,
  structuredScopes: readonly AiVaultStructuredProjectScope[] = []
): string | null {
  const activeStructuredScope =
    findAiVaultStructuredProjectScopeForGroupId(activeRepo?.projectGroupId, structuredScopes) ??
    findAiVaultStructuredProjectScopeForWorktree(activeWorktree, structuredScopes)
  if (activeStructuredScope) {
    return activeStructuredScope.key
  }

  if (activeWorktree?.projectId) {
    return toAiVaultProjectKey(activeWorktree.projectId, activeWorktree.repoId)
  }

  const setup =
    (activeRepo ? setupByRepoId.get(activeRepo.id) : null) ??
    (activeWorktree ? setupByRepoId.get(activeWorktree.repoId) : null)
  if (setup) {
    return toAiVaultProjectKey(setup.projectId, setup.repoId || activeRepo?.id)
  }

  return toAiVaultProjectKey(null, activeRepo?.id ?? activeWorktree?.repoId ?? null)
}
