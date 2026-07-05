// Mounts a source repo into a workspace's src/ as a git worktree (branch = the
// workspace name, based on the repo's default branch), then updates
// workspace.json. Reuses the low-level addWorktree (any target path). Orca
// registration (Repo record + worktree meta) is OPTIONAL: pass ensureRepoId +
// setWorktreeMeta to make the worktree a first-class orca-managed entry; omit
// them for a pure-filesystem mount (disk stays the source of truth either way).
import { randomUUID } from 'node:crypto'
import type { WorktreeMeta } from '../../shared/types'
import type { StructuredWorkspaceWorktree } from '../../shared/structured-project-schema'
import { readWorkspaceFile, writeWorkspaceFile } from './structured-project-disk'
import { srcRepoDir } from './structured-project-layout'

export type WorktreeMountDeps = {
  // Runs `git worktree add <target> -b <branch> [baseBranch]` — a subset of
  // git/worktree.ts addWorktree. The target path is honored verbatim.
  addWorktree: (
    repoPath: string,
    worktreePath: string,
    branch: string,
    baseBranch?: string
  ) => Promise<void>
  // Optional orca registration hooks.
  ensureRepoId?: (source: string) => string
  setWorktreeMeta?: (worktreeId: string, updates: Partial<WorktreeMeta>) => void
  now?: () => number
  makeInstanceId?: () => string
}

export type MountRepoParams = {
  wsDir: string
  repoId: string
  source: string
  branch: string
  defaultBranch: string
}

// Reads workspace.json, replaces any prior entry for this repoId, appends the
// new one, and writes it back immutably.
export function appendWorktreeToWorkspaceFile(
  wsDir: string,
  entry: StructuredWorkspaceWorktree
): void {
  const read = readWorkspaceFile(wsDir)
  if (!read.ok) {
    throw new Error(`Cannot update workspace.json at ${wsDir}: ${read.error}`)
  }
  const others = read.value.worktrees.filter((w) => w.repoId !== entry.repoId)
  writeWorkspaceFile(wsDir, { ...read.value, worktrees: [...others, entry] })
}

export async function mountRepoIntoWorkspace(
  deps: WorktreeMountDeps,
  params: MountRepoParams
): Promise<StructuredWorkspaceWorktree> {
  const targetPath = srcRepoDir(params.wsDir, params.repoId)
  await deps.addWorktree(params.source, targetPath, params.branch, params.defaultBranch)

  // Optional: register with Orca so the worktree is orca-managed.
  if (deps.ensureRepoId && deps.setWorktreeMeta) {
    const orcaRepoId = deps.ensureRepoId(params.source)
    const now = (deps.now ?? Date.now)()
    const instanceId = (deps.makeInstanceId ?? randomUUID)()
    deps.setWorktreeMeta(`${orcaRepoId}::${targetPath}`, {
      instanceId,
      orcaCreatedAt: now,
      orcaCreationSource: 'cli',
      baseRef: params.defaultBranch || undefined
    })
  }

  const entry: StructuredWorkspaceWorktree = {
    repoId: params.repoId,
    path: targetPath,
    branch: params.branch
  }
  appendWorktreeToWorkspaceFile(params.wsDir, entry)
  return entry
}
