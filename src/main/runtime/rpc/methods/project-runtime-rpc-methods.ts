import { basename } from 'node:path'
import { z } from 'zod'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalString, requiredString } from '../schemas'
import { isGitRepo } from '../../../git/repo'
import {
  IterationCheckGitRepo,
  IterationCreate,
  IterationDelete,
  IterationGet,
  IterationWorkspaceAddRepo,
  IterationWorkspaceCopy,
  IterationWorkspaceCreate,
  IterationWorkspaceRemoveRepo,
  IterationWorkspaceUpdate
} from './iteration-rpc-schemas'
import {
  addWorkspaceRepoService,
  createStructuredProjectService,
  createStructuredWorkspaceService,
  deleteStructuredProjectService,
  getStructuredProjectService,
  listStructuredProjectsService
} from '../../../structured-projects/structured-project-service'
import { copyStructuredWorkspaceService } from '../../../structured-projects/structured-workspace-copy'
import { updateStructuredWorkspaceServicesService } from '../../../structured-projects/structured-workspace-update'
import { removeStructuredWorkspaceRepoService } from '../../../structured-projects/structured-workspace-remove-repo'
import {
  materializeAllStructuredProjects,
  materializeStructuredProject
} from '../../../structured-projects/structured-project-materialize'
import { reconcileStructuredProjects } from '../../../structured-projects/structured-project-reconcile'

const ProjectHostSetupExistingFolder = z.object({
  projectId: requiredString('Missing project ID'),
  hostId: requiredString('Missing host ID').transform((value, ctx) => {
    const hostId = normalizeExecutionHostId(value)
    if (!hostId) {
      ctx.addIssue({ code: 'custom', message: 'Invalid host ID' })
      return z.NEVER
    }
    return hostId
  }),
  path: requiredString('Missing project path'),
  kind: z.enum(['git', 'folder']).optional(),
  displayName: OptionalString,
  setupMethod: z.enum(['imported-existing-folder', 'cloned']).optional()
})

const ProjectHostSetupClone = z.object({
  projectId: requiredString('Missing project ID'),
  hostId: requiredString('Missing host ID').transform((value, ctx) => {
    const hostId = normalizeExecutionHostId(value)
    if (!hostId) {
      ctx.addIssue({ code: 'custom', message: 'Invalid host ID' })
      return z.NEVER
    }
    return hostId
  }),
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination'),
  displayName: OptionalString
})

const LocalWindowsRuntimePreference = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inherit-global') }),
  z.object({ kind: z.literal('windows-host') }),
  z.object({ kind: z.literal('wsl'), distro: requiredString('Missing WSL distro') })
])

const ProjectUpdate = z.object({
  projectId: requiredString('Missing project ID'),
  updates: z.object({
    localWindowsRuntimePreference: LocalWindowsRuntimePreference.optional()
  })
})

const ProjectHostSetupCreate = z.object({
  projectId: requiredString('Missing project ID'),
  hostId: requiredString('Missing host ID').transform((value, ctx) => {
    const hostId = normalizeExecutionHostId(value)
    if (!hostId) {
      ctx.addIssue({ code: 'custom', message: 'Invalid host ID' })
      return z.NEVER
    }
    return hostId
  }),
  setupId: OptionalString,
  path: OptionalString,
  kind: z.enum(['git', 'folder']).optional(),
  displayName: OptionalString,
  worktreeBasePath: OptionalString,
  gitUsername: OptionalString,
  setupState: z.enum(['ready', 'not-set-up', 'setting-up', 'error', 'unsupported']).optional(),
  setupMethod: z.enum(['imported-existing-folder', 'cloned', 'provisioned']).optional()
})

const ProjectHostSetupUpdate = z.object({
  setupId: requiredString('Missing setup ID'),
  updates: z.object({
    displayName: OptionalString,
    path: OptionalString,
    worktreeBasePath: OptionalString,
    setupState: z.enum(['ready', 'not-set-up', 'setting-up', 'error', 'unsupported']).optional(),
    setupMethod: z
      .enum(['legacy-repo', 'imported-existing-folder', 'cloned', 'provisioned'])
      .optional(),
    gitUsername: OptionalString,
    kind: z.enum(['git', 'folder']).optional()
  })
})

const ProjectHostSetupDelete = z.object({
  setupId: requiredString('Missing setup ID')
})

export const PROJECT_RUNTIME_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'project.list',
    params: null,
    handler: (_params, { runtime }) => {
      runtime.enrichMissingRepoGitRemoteIdentities?.()
      return { projects: runtime.listProjects() }
    }
  }),
  defineMethod({
    name: 'project.update',
    params: ProjectUpdate,
    handler: (params, { runtime }) => ({
      project: runtime.updateProject(params.projectId, params.updates)
    })
  }),
  defineMethod({
    name: 'projectHostSetup.list',
    params: null,
    handler: (_params, { runtime }) => {
      runtime.enrichMissingRepoGitRemoteIdentities?.()
      return { setups: runtime.listProjectHostSetups() }
    }
  }),
  defineMethod({
    name: 'projectHostSetup.create',
    params: ProjectHostSetupCreate,
    handler: (params, { runtime }) => ({
      result: runtime.createProjectHostSetup(params)
    })
  }),
  defineMethod({
    name: 'projectHostSetup.setupExistingFolder',
    params: ProjectHostSetupExistingFolder,
    handler: async (params, { runtime }) => ({
      result: await runtime.setupProjectExistingFolder(params)
    })
  }),
  defineMethod({
    name: 'projectHostSetup.clone',
    params: ProjectHostSetupClone,
    handler: async (params, { runtime }) => ({
      result: await runtime.setupProjectClone(params)
    })
  }),
  defineMethod({
    name: 'projectHostSetup.update',
    params: ProjectHostSetupUpdate,
    handler: (params, { runtime }) => ({
      result: runtime.updateProjectHostSetup(params)
    })
  }),
  defineMethod({
    name: 'projectHostSetup.delete',
    params: ProjectHostSetupDelete,
    handler: (params, { runtime }) => ({
      result: runtime.deleteProjectHostSetup(params)
    })
  }),
  defineMethod({
    name: 'iteration.create',
    params: IterationCreate,
    handler: (params) => ({
      project: createStructuredProjectService({
        name: params.name,
        services: params.services,
        rootPath: params.rootPath,
        parentDir: params.parentDir
      })
    })
  }),
  defineMethod({
    name: 'iteration.workspaceCreate',
    params: IterationWorkspaceCreate,
    handler: async (params) => ({
      workspace: await createStructuredWorkspaceService({
        project: params.project,
        workspaceName: params.name
      })
    })
  }),
  defineMethod({
    name: 'iteration.workspaceAddRepo',
    params: IterationWorkspaceAddRepo,
    handler: async (params, { runtime }) => {
      // Register the source repo with orca first so the mounted worktree becomes
      // orca-managed (visible to the agent engine); pre-await the async repo id,
      // then hand the mount the synchronous registration hooks it expects.
      const orcaRepoId = await runtime.registerManagedRepo(params.source)
      const worktree = await addWorkspaceRepoService({
        project: params.project,
        workspaceName: params.workspace,
        source: params.source,
        repoId: params.repoId,
        defaultBranch: params.defaultBranch,
        registration: {
          ensureRepoId: () => orcaRepoId,
          setWorktreeMeta: (id, meta) => runtime.setStructuredWorktreeMeta(id, meta)
        }
      })
      return { worktree }
    }
  }),
  defineMethod({
    name: 'iteration.checkGitRepo',
    params: IterationCheckGitRepo,
    handler: (params) => ({
      isGitRepo: isGitRepo(params.path),
      repoName: basename(params.path)
    })
  }),
  defineMethod({
    name: 'iteration.workspaceCopy',
    params: IterationWorkspaceCopy,
    handler: async (params, { runtime }) => {
      // Register each remounted source repo with orca so the copied worktrees
      // become orca-managed (mirrors workspaceAddRepo); the copy service pre-awaits
      // registerManagedRepo per source and hands the mount the sync meta hook.
      const workspace = await copyStructuredWorkspaceService({
        project: params.project,
        sourceWorkspace: params.source,
        name: params.name,
        registration: {
          registerManagedRepo: (source) => runtime.registerManagedRepo(source),
          setWorktreeMeta: (id, meta) => runtime.setStructuredWorktreeMeta(id, meta)
        }
      })
      return { workspace }
    }
  }),
  defineMethod({
    name: 'iteration.workspaceUpdate',
    params: IterationWorkspaceUpdate,
    handler: async (params) => ({
      workspace: await updateStructuredWorkspaceServicesService({
        project: params.project,
        workspace: params.workspace,
        services: params.services
      })
    })
  }),
  defineMethod({
    name: 'iteration.workspaceRemoveRepo',
    params: IterationWorkspaceRemoveRepo,
    // Returns { removed: boolean } directly — the frozen contract shape.
    handler: async (params) =>
      removeStructuredWorkspaceRepoService({
        project: params.project,
        workspace: params.workspace,
        repoId: params.repoId
      })
  }),
  defineMethod({
    name: 'iteration.list',
    params: null,
    handler: () => ({ projects: listStructuredProjectsService() })
  }),
  defineMethod({
    name: 'iteration.get',
    params: IterationGet,
    handler: (params) => ({ project: getStructuredProjectService(params.project) })
  }),
  defineMethod({
    name: 'iteration.materialize',
    params: IterationGet,
    handler: async (params, { runtime }) => ({
      result: await materializeStructuredProject(runtime, params.project)
    })
  }),
  defineMethod({
    name: 'iteration.materializeAll',
    params: null,
    handler: async (_params, { runtime }) => ({
      results: await materializeAllStructuredProjects(runtime)
    })
  }),
  defineMethod({
    name: 'iteration.reconcileAll',
    params: null,
    handler: async (_params, { runtime }) => ({
      result: await reconcileStructuredProjects(runtime)
    })
  }),
  defineMethod({
    name: 'iteration.delete',
    params: IterationDelete,
    handler: async (params, { runtime }) => {
      // Remove the on-disk project (+ optional source branches), then reconcile
      // so its now-orphaned orca records are cleaned in the same call.
      const result = await deleteStructuredProjectService({
        project: params.project,
        deleteBranches: params.deleteBranches
      })
      const reconciled = await reconcileStructuredProjects(runtime, {
        // Also unregister the mounted source repos (ref-counted) — covers repos
        // registered via CLI without a prior materialize.
        alsoRemoveUnreferencedSources: result.sources
      })
      return { result, reconciled }
    }
  })
]
