// Project-level repo roster management: add/remove entries in project.json's
// `members` WITHOUT mounting a worktree. A structured project first collects its
// full set of source repos here; a workspace later mounts a chosen subset. Pure
// filesystem (disk is the source of truth) — Git-URL cloning is done by the RPC
// handler (needs the runtime) before calling addProjectMemberService with the
// resolved local path.
import { basename } from 'node:path'
import { readProjectFile, writeProjectFile } from './structured-project-disk'
import { resolveProject } from './structured-project-service'
import type { StructuredProjectMember } from '../../shared/structured-project-schema'

// Heuristic Git-URL detection so the UI can accept either a local folder or a
// remote URL in one field. Covers scp-style (git@host:owner/repo), ssh://,
// https://, and git:// forms; anything else is treated as a local path.
export function looksLikeGitUrl(source: string): boolean {
  const value = source.trim()
  if (!value) {
    return false
  }
  return (
    /^(https?|ssh|git):\/\//i.test(value) ||
    /^git@[^:]+:.+/.test(value) ||
    /^[^@\s]+@[^:]+:.+\.git$/i.test(value)
  )
}

// Derives a stable repoId (folder-name-ish) from a local path or a Git URL, so
// members added by URL still read as a repo name in the checklist.
export function deriveMemberRepoId(source: string): string {
  const value = source.trim()
  if (looksLikeGitUrl(value)) {
    const tail = value.split(/[/:]/).pop() ?? value
    return tail.replace(/\.git$/i, '') || value
  }
  return basename(value)
}

// Appends a repo to the project's member roster (idempotent by repoId). Does NOT
// create a worktree — mounting into a workspace is a separate, later step.
// `source` must already be a local path (URL members are cloned upstream first).
export function addProjectMemberService(params: {
  project: string
  source: string
  repoId?: string
  defaultBranch?: string
}): StructuredProjectMember {
  const { rootPath } = resolveProject(params.project)
  const repoId = params.repoId ?? deriveMemberRepoId(params.source)
  const defaultBranch = params.defaultBranch ?? 'main'
  const member: StructuredProjectMember = { repoId, source: params.source, defaultBranch }

  const read = readProjectFile(rootPath)
  if (!read.ok) {
    throw new Error(`Cannot read project.json for ${params.project}: ${read.error}`)
  }
  const existing = read.value.members.find((m) => m.repoId === repoId)
  if (existing) {
    // Already on the roster — return the existing entry rather than duplicating.
    return existing
  }
  writeProjectFile(rootPath, {
    ...read.value,
    members: [...read.value.members, member]
  })
  return member
}

// Removes a repo from the project's member roster by repoId. No-op if absent.
// Does not touch any workspace worktrees already mounted from it.
export function removeProjectMemberService(params: { project: string; repoId: string }): void {
  const { rootPath } = resolveProject(params.project)
  const read = readProjectFile(rootPath)
  if (!read.ok) {
    throw new Error(`Cannot read project.json for ${params.project}: ${read.error}`)
  }
  writeProjectFile(rootPath, {
    ...read.value,
    members: read.value.members.filter((m) => m.repoId !== params.repoId)
  })
}
