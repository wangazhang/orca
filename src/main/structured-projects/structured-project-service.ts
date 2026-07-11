// Thin, store-free service exposing the structured-project kernel to RPC/CLI.
// Source of truth is on-disk (project.json / workspace.json); listing scans the
// projects directory rather than an orca-data.json index. Orca-managed worktree
// registration (Repo record + meta) is deferred — the physical git worktree is
// created regardless, and disk remains authoritative.
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import {
  addWorktree,
  forceDeleteLocalBranch,
  getLocalBranchHead,
  localBranchExists,
  pruneWorktrees
} from '../git/worktree'
import {
  readProjectFile,
  scanStructuredProjects,
  scanWorkspaces,
  writeProjectFile
} from './structured-project-disk'
import { workspaceDir } from './structured-project-layout'
import { createStructuredProject, createStructuredWorkspace } from './structured-project-scaffold'
import { mountRepoIntoWorkspace } from './structured-workspace-repo-mount'
import type {
  StructuredProjectFile,
  StructuredProjectMember,
  StructuredServiceKind,
  StructuredWorkspaceFile,
  StructuredWorkspaceService,
  StructuredWorkspaceWorktree
} from '../../shared/structured-project-schema'
import type { WorktreeMeta } from '../../shared/types'

export type StructuredProjectSummary = {
  name: string
  rootPath: string
  services: StructuredServiceKind[]
  memberCount: number
}

// Default root for structured projects (~/orca/projects). Inlined to avoid a
// shared-constants edit; mirrors the workspaceDir convention. Exported so the
// reconcile pass scans the same directory this service writes to.
export function getProjectsDir(): string {
  return join(homedir(), 'orca', 'projects')
}

// Exported so the workspace-copy / -update / -remove-repo modules resolve a
// project by name-or-folder the same way (and throw the same `not found`) rather
// than each re-implementing the scan-and-match.
export function resolveProject(idOrName: string): {
  rootPath: string
  project: StructuredProjectFile
} {
  const found = scanStructuredProjects(getProjectsDir()).find(
    (p) => p.project.name === idOrName || basename(p.rootPath) === idOrName
  )
  if (!found) {
    throw new Error(`Structured project not found: ${idOrName}`)
  }
  return found
}

export function createStructuredProjectService(params: {
  name: string
  services: StructuredServiceKind[]
  rootPath?: string
  parentDir?: string
}): StructuredProjectSummary {
  // rootPath wins as the full root; otherwise create under parentDir (or the
  // default projects dir) as <parent>/<name>. join keeps separators correct
  // across platforms.
  const rootPath = params.rootPath ?? join(params.parentDir ?? getProjectsDir(), params.name)
  const created = createStructuredProject({
    name: params.name,
    rootPath,
    services: params.services
  })
  return {
    name: created.project.name,
    rootPath,
    services: created.project.services,
    memberCount: created.project.members.length
  }
}

export async function createStructuredWorkspaceService(params: {
  project: string
  workspaceName: string
}): Promise<StructuredWorkspaceFile> {
  const { rootPath, project } = resolveProject(params.project)
  const { workspace } = await createStructuredWorkspace({
    rootPath,
    projectName: project.name,
    workspaceName: params.workspaceName,
    services: project.services
  })
  return workspace
}

export async function addWorkspaceRepoService(params: {
  project: string
  workspaceName: string
  source: string
  repoId?: string
  defaultBranch?: string
  // Optional orca registration hooks (injected by the RPC handler from the
  // runtime). When present, the mounted worktree becomes orca-managed; when
  // omitted, the mount is pure-filesystem and disk stays authoritative.
  registration?: {
    ensureRepoId: (source: string) => string
    setWorktreeMeta: (worktreeId: string, meta: Partial<WorktreeMeta>) => void
  }
}): Promise<StructuredWorkspaceWorktree> {
  const { rootPath } = resolveProject(params.project)
  const wsDir = workspaceDir(rootPath, params.workspaceName)
  const repoId = params.repoId ?? basename(params.source)
  const defaultBranch = params.defaultBranch ?? 'main'

  const entry = await mountRepoIntoWorkspace(
    {
      // Adapter narrows addWorktree to the deps signature (drops extra params + result).
      addWorktree: async (repoPath, worktreePath, branch, baseBranch) => {
        // A workspace's branch is named after the workspace and shared across its
        // repos. If a same-named branch already lingers in the source (e.g. left
        // by a deleted iteration, since branch cleanup is not yet wired), reuse it
        // instead of failing on `-b`; otherwise create it from the default branch.
        const reuseExisting = await localBranchExists(repoPath, branch)
        await addWorktree(
          repoPath,
          worktreePath,
          branch,
          baseBranch,
          false,
          false,
          reuseExisting ? { checkoutExistingBranch: true } : {}
        )
      },
      ...(params.registration
        ? {
            ensureRepoId: params.registration.ensureRepoId,
            setWorktreeMeta: params.registration.setWorktreeMeta
          }
        : {})
    },
    { wsDir, repoId, source: params.source, branch: params.workspaceName, defaultBranch }
  )

  // Record the repo as a project member (source of truth in project.json).
  const read = readProjectFile(rootPath)
  if (read.ok && !read.value.members.some((m) => m.repoId === repoId)) {
    writeProjectFile(rootPath, {
      ...read.value,
      members: [...read.value.members, { repoId, source: params.source, defaultBranch }]
    })
  }
  return entry
}

export function listStructuredProjectsService(): StructuredProjectSummary[] {
  return scanStructuredProjects(getProjectsDir()).map((p) => ({
    name: p.project.name,
    rootPath: p.rootPath,
    services: p.project.services,
    memberCount: p.project.members.length
  }))
}

export type StructuredWorkspaceDetail = {
  name: string
  services: StructuredWorkspaceService[]
  worktrees: StructuredWorkspaceWorktree[]
}

export type StructuredProjectDetail = {
  name: string
  rootPath: string
  services: StructuredServiceKind[]
  workspaces: StructuredWorkspaceDetail[]
}

// Reads one structured project plus its workspace layer (from each
// <ws>/.yoho/workspace.json) so the sidebar can render project → workspace →
// repo. Disk is the source of truth; this never touches the orca index.
export function getStructuredProjectService(idOrName: string): StructuredProjectDetail {
  const { rootPath, project } = resolveProject(idOrName)
  const workspaces = scanWorkspaces(rootPath).map((ws) => ({
    name: ws.workspace.name,
    services: ws.workspace.services,
    worktrees: ws.workspace.worktrees
  }))
  return { name: project.name, rootPath, services: project.services, workspaces }
}

export type StructuredWorkspaceMaterializationView = {
  name: string
  wsDir: string
  worktrees: StructuredWorkspaceWorktree[]
}

export type StructuredProjectMaterializationView = {
  name: string
  rootPath: string
  // project.json members carry the source path each src worktree was mounted
  // from — needed to register the shared orca Repo. Not present in the sidebar
  // detail view, hence a separate materialization-specific shape.
  members: StructuredProjectMember[]
  workspaces: StructuredWorkspaceMaterializationView[]
}

// Reads everything materialize needs: project members (with source paths) plus
// each workspace's on-disk directory (wsDir) and its worktrees. wsDir uses the
// folder name as the workspace identity to stay aligned with folderPath/parentPath.
export function getStructuredProjectMaterializationView(
  idOrName: string
): StructuredProjectMaterializationView {
  const { rootPath, project } = resolveProject(idOrName)
  const workspaces = scanWorkspaces(rootPath).map((ws) => ({
    name: ws.name,
    wsDir: ws.wsDir,
    worktrees: ws.workspace.worktrees
  }))
  return { name: project.name, rootPath, members: project.members, workspaces }
}

// One workspace branch (branch === workspace name) in one member source repo.
export type StructuredBranchRef = {
  source: string
  repoId: string
  workspace: string
}

export type DeleteStructuredProjectResult = {
  name: string
  rootPath: string
  workspaces: string[]
  // Unique member source repo paths, so the caller can unregister the orca repos
  // that mounting created once no live structured project references them.
  sources: string[]
  // Branches actually deleted from source repos (only when deleteBranches=true).
  removedBranches: StructuredBranchRef[]
  // Branches left in place — either deleteBranches=false, or force-delete was
  // refused (e.g. still checked out by another live project's worktree).
  keptBranches: StructuredBranchRef[]
  skippedBranches: (StructuredBranchRef & { reason: string })[]
}

// Deletes a structured project as a unit: removes its on-disk root, then
// optionally cleans the leftover `<workspace>` branch it left in each member
// source repo. Orca record cleanup is the caller's job (run reconcile after —
// the disk project is gone so its materialized records become orphans).
export async function deleteStructuredProjectService(params: {
  project: string
  deleteBranches?: boolean
}): Promise<DeleteStructuredProjectResult> {
  // Read the layout BEFORE removing anything — we need member source paths and
  // workspace names, which live on disk.
  const view = getStructuredProjectMaterializationView(params.project)
  const workspaces = view.workspaces.map((ws) => ws.name)
  const candidates: StructuredBranchRef[] = workspaces.flatMap((workspace) =>
    view.members.map((member) => ({ source: member.source, repoId: member.repoId, workspace }))
  )

  // Remove the project root so its worktree working dirs disappear; each source
  // repo's admin record for them is now stale and pruned below.
  rmSync(view.rootPath, { recursive: true, force: true })

  const removedBranches: StructuredBranchRef[] = []
  const keptBranches: StructuredBranchRef[] = []
  const skippedBranches: (StructuredBranchRef & { reason: string })[] = []
  const prunedSources = new Set<string>()

  for (const candidate of candidates) {
    if (!prunedSources.has(candidate.source)) {
      // Clear stale worktree records so a leftover branch is no longer seen as
      // checked out (which would make force-delete refuse it).
      await pruneWorktrees(candidate.source).catch(() => {})
      prunedSources.add(candidate.source)
    }
    if (!(await localBranchExists(candidate.source, candidate.workspace))) {
      continue
    }
    if (!params.deleteBranches) {
      keptBranches.push(candidate)
      continue
    }
    const head = await getLocalBranchHead(candidate.source, candidate.workspace)
    if (!head) {
      skippedBranches.push({ ...candidate, reason: 'branch head not resolvable' })
      continue
    }
    try {
      // CAS + checked-out guard: refuses (throws) if another live worktree still
      // holds this branch, so a shared source repo's in-use branch is preserved.
      await forceDeleteLocalBranch(candidate.source, candidate.workspace, head)
      removedBranches.push(candidate)
    } catch (error) {
      skippedBranches.push({
        ...candidate,
        reason: error instanceof Error ? error.message : 'branch delete failed'
      })
    }
  }

  return {
    name: view.name,
    rootPath: view.rootPath,
    workspaces,
    sources: [...new Set(view.members.map((member) => member.source))],
    removedBranches,
    keptBranches,
    skippedBranches
  }
}
