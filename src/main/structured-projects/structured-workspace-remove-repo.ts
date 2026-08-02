// Removes one mounted repo (worktree) from a workspace: tears down the git
// worktree at src/<repoId> and drops its entry from workspace.json. It does NOT
// touch project.json members — a member's source repo may be shared by other
// workspaces, so unregistering it here would break them. Fail-soft on the git
// side (a stale/missing worktree still gets its src dir cleaned) but strict on
// project/workspace resolution.
import { rmSync } from 'node:fs'
import { removeWorktree } from '../git/worktree'
import { readWorkspaceFile, writeWorkspaceFile } from './structured-project-disk'
import { workspaceRepoDir, workspaceDir } from './structured-project-layout'
import { resolveProject } from './structured-project-service'

export async function removeStructuredWorkspaceRepoService(params: {
  project: string
  workspace: string
  repoId: string
}): Promise<{ removed: boolean }> {
  const { rootPath, project } = resolveProject(params.project)
  const wsDir = workspaceDir(rootPath, params.workspace)

  const read = readWorkspaceFile(wsDir)
  if (!read.ok) {
    throw new Error(`Workspace not found: ${params.workspace} (${read.error})`)
  }

  const worktreePath = workspaceRepoDir(wsDir, params.repoId)
  // The member carries the source repo path `git worktree remove` must run
  // against. It may be absent (inconsistent disk) — then we can only best-effort
  // remove the working directory.
  const member = project.members.find((m) => m.repoId === params.repoId)

  try {
    if (member) {
      // force: true so a dirty worktree is still detached; removeWorktree also
      // drops the now-unused workspace branch (safe `-d`, preserves unmerged work).
      await removeWorktree(member.source, worktreePath, true)
    } else {
      rmSync(worktreePath, { recursive: true, force: true })
    }
  } catch {
    // The git admin entry may be stale or already gone; ensure src/<repoId>
    // doesn't linger regardless.
    rmSync(worktreePath, { recursive: true, force: true })
  }

  // Drop this repo's worktree entry from workspace.json (inverse of
  // appendWorktreeToWorkspaceFile) — immutable rewrite.
  writeWorkspaceFile(wsDir, {
    ...read.value,
    worktrees: read.value.worktrees.filter((w) => w.repoId !== params.repoId)
  })

  return { removed: true }
}
