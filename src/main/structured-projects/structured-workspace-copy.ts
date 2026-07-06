// Copies an existing workspace into a new one: scaffolds a fresh isolated
// sandbox (its OWN freshly-allocated ports) reusing the source workspace's
// service kinds, then re-mounts every source worktree onto the new workspace's
// branch. project.json members are the source of truth for each repo's source
// path; this reads them to know what to remount. Pure disk + git — no store.
import { readWorkspaceFile } from './structured-project-disk'
import { workspaceDir } from './structured-project-layout'
import { createStructuredWorkspace } from './structured-project-scaffold'
import { addWorkspaceRepoService, resolveProject } from './structured-project-service'
import type { WorktreeMeta } from '../../shared/types'
import type { StructuredWorkspaceFile } from '../../shared/structured-project-schema'

// Async registration hooks injected by the RPC handler from the runtime. Omit
// for a pure-filesystem copy (disk stays authoritative either way).
type CopyRegistration = {
  registerManagedRepo: (source: string) => Promise<string>
  setWorktreeMeta: (worktreeId: string, meta: Partial<WorktreeMeta>) => void
}

// The synchronous registration shape addWorkspaceRepoService expects.
type MountRegistration = {
  ensureRepoId: (source: string) => string
  setWorktreeMeta: (worktreeId: string, meta: Partial<WorktreeMeta>) => void
}

export async function copyStructuredWorkspaceService(params: {
  project: string
  sourceWorkspace: string
  name: string
  registration?: CopyRegistration
}): Promise<StructuredWorkspaceFile> {
  const { rootPath, project } = resolveProject(params.project)

  // Read the source workspace first: its service kinds seed the new sandbox and
  // its worktrees drive what we remount. Missing source is a clear "not found".
  const sourceRead = readWorkspaceFile(workspaceDir(rootPath, params.sourceWorkspace))
  if (!sourceRead.ok) {
    throw new Error(`Source workspace not found: ${params.sourceWorkspace} (${sourceRead.error})`)
  }
  const source = sourceRead.value

  // Scaffold the copy reusing the SOURCE's service kinds so it provisions the
  // same infra — but createStructuredWorkspace allocates its own host ports, so
  // the copy never collides with the original's running containers.
  const { workspace } = await createStructuredWorkspace({
    rootPath,
    projectName: project.name,
    workspaceName: params.name,
    services: source.services.map((service) => service.kind)
  })

  // Remount each source worktree onto the new workspace's branch. addWorkspaceRepoService
  // owns the mount path (mountRepoIntoWorkspace + srcRepoDir, branch = workspace name),
  // so reusing it keeps the copy byte-identical to a hand-added repo.
  for (const worktree of source.worktrees) {
    const member = project.members.find((m) => m.repoId === worktree.repoId)
    if (!member) {
      // A worktree with no project.json member is an inconsistency we can't
      // remount (no source path) — skip rather than fail the whole copy.
      continue
    }
    await addWorkspaceRepoService({
      project: params.project,
      workspaceName: params.name,
      source: member.source,
      repoId: member.repoId,
      defaultBranch: member.defaultBranch,
      registration: await buildMountRegistration(params.registration, member.source)
    })
  }

  // Re-read so the returned file reflects the mounted worktrees, not the empty
  // scaffold snapshot.
  const finalRead = readWorkspaceFile(workspaceDir(rootPath, params.name))
  return finalRead.ok ? finalRead.value : workspace
}

// registerManagedRepo is async, but addWorkspaceRepoService's registration wants
// a synchronous ensureRepoId — pre-await the repo id once per source and close
// over it (mirrors the workspaceAddRepo RPC handler).
async function buildMountRegistration(
  registration: CopyRegistration | undefined,
  source: string
): Promise<MountRegistration | undefined> {
  if (!registration) {
    return undefined
  }
  const orcaRepoId = await registration.registerManagedRepo(source)
  return { ensureRepoId: () => orcaRepoId, setWorktreeMeta: registration.setWorktreeMeta }
}
