import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace, ProjectGroup, Repo, WorktreeMeta } from '../../shared/types'
import type { MaterializeRuntime } from './structured-project-materialize'

// Mock the disk-reading service so the test exercises the orchestration/idempotency
// logic against a fixed structured-project view (no temp HOME / real git needed).
const view = {
  name: 'penguin-x',
  rootPath: '/root/penguin-x',
  members: [
    { repoId: 'mrs', source: '/src/mrs', defaultBranch: 'main' },
    { repoId: 'qa-pk', source: '/src/qa-pk', defaultBranch: 'main' }
  ],
  workspaces: [
    {
      name: 'workspace-1',
      wsDir: '/root/penguin-x/workspace-1',
      worktrees: [
        { repoId: 'mrs', path: '/root/penguin-x/workspace-1/src/mrs', branch: 'workspace-1' }
      ]
    },
    { name: 'workspace-2', wsDir: '/root/penguin-x/workspace-2', worktrees: [] }
  ]
}

vi.mock('./structured-project-service', () => ({
  getStructuredProjectMaterializationView: () => view,
  listStructuredProjectsService: () => [{ name: 'penguin-x' }]
}))

import { materializeStructuredProject } from './structured-project-materialize'

// In-memory fake runtime capturing exactly what materialize writes.
function makeFakeRuntime(): {
  runtime: MaterializeRuntime
  groups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  repoGroup: Map<string, string | null>
  worktreeMeta: Map<string, Partial<WorktreeMeta>>
} {
  const groups: ProjectGroup[] = []
  const folderWorkspaces: FolderWorkspace[] = []
  const repoGroup = new Map<string, string | null>()
  const worktreeMeta = new Map<string, Partial<WorktreeMeta>>()
  let seq = 0
  const runtime: MaterializeRuntime = {
    listProjectGroups: () => groups,
    listFolderWorkspaces: () => folderWorkspaces,
    createProjectGroup: async (input) => {
      const group = {
        id: `g${(seq += 1)}`,
        name: input.name,
        parentPath: input.parentPath ?? null,
        parentGroupId: input.parentGroupId ?? null,
        createdFrom: input.createdFrom ?? 'manual'
      } as ProjectGroup
      groups.push(group)
      return group
    },
    createFolderWorkspace: async (input) => {
      const workspace = {
        id: `fw${(seq += 1)}`,
        projectGroupId: input.projectGroupId,
        folderPath: input.folderPath ?? '',
        name: input.name ?? ''
      } as FolderWorkspace
      folderWorkspaces.push(workspace)
      return workspace
    },
    registerManagedRepo: async (source) => `repo:${source}`,
    moveProjectToGroup: async (repoSelector, groupId) => {
      repoGroup.set(repoSelector, groupId)
      return { id: repoSelector } as Repo
    },
    getWorktreeMeta: (worktreeId) => worktreeMeta.get(worktreeId) as WorktreeMeta | undefined,
    setStructuredWorktreeMeta: (worktreeId, meta) => {
      worktreeMeta.set(worktreeId, { ...worktreeMeta.get(worktreeId), ...meta })
    }
  }
  return { runtime, groups, folderWorkspaces, repoGroup, worktreeMeta }
}

describe('materializeStructuredProject', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates top + workspace groups, overview folder workspaces, and pins repos to the top group', async () => {
    const fake = makeFakeRuntime()
    const result = await materializeStructuredProject(fake.runtime, 'penguin-x')

    // 1 top group + 2 workspace groups
    expect(fake.groups).toHaveLength(3)
    const top = fake.groups.find((g) => g.parentGroupId === null)
    expect(top?.createdFrom).toBe('structured')
    expect(top?.parentPath).toBe('/root/penguin-x')
    const workspaceGroups = fake.groups.filter((g) => g.parentGroupId === top?.id)
    expect(workspaceGroups.map((g) => g.parentPath).sort()).toEqual([
      '/root/penguin-x/workspace-1',
      '/root/penguin-x/workspace-2'
    ])

    // one overview folder workspace per workspace group
    expect(fake.folderWorkspaces).toHaveLength(2)

    // both shared repos pinned to the TOP group (not a workspace group)
    expect(fake.repoGroup.get('repo:/src/mrs')).toBe(top?.id)
    expect(fake.repoGroup.get('repo:/src/qa-pk')).toBe(top?.id)

    expect(result.topGroupId).toBe(top?.id)
    expect(result.workspaceGroupIds).toHaveLength(2)
    expect(result.repoIds).toEqual(['repo:/src/mrs', 'repo:/src/qa-pk'])
  })

  it('is idempotent: a second run adds no new groups or folder workspaces', async () => {
    const fake = makeFakeRuntime()
    await materializeStructuredProject(fake.runtime, 'penguin-x')
    const groupsAfterFirst = fake.groups.length
    const folderWorkspacesAfterFirst = fake.folderWorkspaces.length

    await materializeStructuredProject(fake.runtime, 'penguin-x')
    expect(fake.groups).toHaveLength(groupsAfterFirst)
    expect(fake.folderWorkspaces).toHaveLength(folderWorkspacesAfterFirst)
  })

  it('backfills orcaCreatedAt on structured worktrees so they render as orca-managed', () => {
    const fake = makeFakeRuntime()
    return materializeStructuredProject(fake.runtime, 'penguin-x').then(() => {
      // worktree id = `${orcaRepoId}::${path}`; orcaRepoId for member 'mrs' is
      // `repo:/src/mrs` from the fake registerManagedRepo.
      const meta = fake.worktreeMeta.get('repo:/src/mrs::/root/penguin-x/workspace-1/src/mrs')
      expect(meta?.orcaCreatedAt).toBeTruthy()
      expect(meta?.orcaCreationSource).toBe('runtime')
    })
  })
})
