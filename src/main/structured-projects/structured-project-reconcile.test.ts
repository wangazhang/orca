import { describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace, ProjectGroup, Repo } from '../../shared/types'
import type { ReconcileRuntime } from './structured-project-reconcile'

// Control the on-disk "live" set the reconciler scans. Each test sets these
// before importing/calling reconcile via the mocked disk module.
let liveProjects: {
  rootPath: string
  project: { members: { source: string }[] }
}[] = []
let liveWorkspacesByRoot: Record<string, { wsDir: string }[]> = {}

vi.mock('./structured-project-service', () => ({
  getProjectsDir: () => '/projects'
}))
vi.mock('./structured-project-disk', () => ({
  scanStructuredProjects: () => liveProjects,
  scanWorkspaces: (rootPath: string) => liveWorkspacesByRoot[rootPath] ?? []
}))

import { reconcileStructuredProjects } from './structured-project-reconcile'

function group(partial: Partial<ProjectGroup> & { id: string }): ProjectGroup {
  return {
    name: partial.id,
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'structured',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial
  } as ProjectGroup
}

function repo(partial: Partial<Repo> & { id: string; path: string }): Repo {
  return { displayName: partial.id, ...partial } as Repo
}

// Fake runtime mirroring the real store: deleteProjectGroup cascades the whole
// subtree + its folder workspaces (that is what persistence.deleteProjectGroup
// does), and unlinks—rather than deletes—the repos under it.
function makeRuntime(
  groups: ProjectGroup[],
  repos: Repo[],
  folderWorkspaces: FolderWorkspace[] = []
): {
  runtime: ReconcileRuntime
  groups: ProjectGroup[]
  repos: Repo[]
  folderWorkspaces: FolderWorkspace[]
} {
  const runtime: ReconcileRuntime = {
    listProjectGroups: () => groups,
    listRepos: () => repos,
    deleteProjectGroup: async (groupId) => {
      const subtree = new Set<string>([groupId])
      let grew = true
      while (grew) {
        grew = false
        for (const g of groups) {
          if (g.parentGroupId && subtree.has(g.parentGroupId) && !subtree.has(g.id)) {
            subtree.add(g.id)
            grew = true
          }
        }
      }
      const before = groups.length
      for (let i = groups.length - 1; i >= 0; i -= 1) {
        if (subtree.has(groups[i].id)) {
          groups.splice(i, 1)
        }
      }
      for (let i = folderWorkspaces.length - 1; i >= 0; i -= 1) {
        if (subtree.has(folderWorkspaces[i].projectGroupId)) {
          folderWorkspaces.splice(i, 1)
        }
      }
      for (const r of repos) {
        if (r.projectGroupId && subtree.has(r.projectGroupId)) {
          r.projectGroupId = null
        }
      }
      return { deleted: groups.length < before }
    },
    removeProject: async (repoId) => {
      const i = repos.findIndex((r) => r.id === repoId)
      if (i >= 0) {
        repos.splice(i, 1)
      }
      return { removed: true }
    }
  }
  return { runtime, groups, repos, folderWorkspaces }
}

describe('reconcileStructuredProjects', () => {
  it('removes a fully-deleted structured project: group subtree + its src repo', async () => {
    liveProjects = [] // nothing on disk
    liveWorkspacesByRoot = {}
    const groups = [
      group({ id: 'top', parentPath: '/projects/gone' }),
      group({ id: 'ws1', parentGroupId: 'top', parentPath: '/projects/gone/ws1' })
    ]
    const repos = [repo({ id: 'r1', path: '/src/only-gone', projectGroupId: 'top' })]
    const fws = [
      { id: 'fw1', projectGroupId: 'ws1', folderPath: '/projects/gone/ws1' } as FolderWorkspace
    ]
    const { runtime, groups: g, repos: r, folderWorkspaces: f } = makeRuntime(groups, repos, fws)

    const result = await reconcileStructuredProjects(runtime)

    expect(result.removedGroupIds).toContain('top')
    expect(result.removedRepoIds).toEqual(['r1'])
    expect(g).toHaveLength(0) // cascade removed ws1 too
    expect(r).toHaveLength(0)
    expect(f).toHaveLength(0)
  })

  it('reference-counts shared repos: keeps a source still used by a live project', async () => {
    // Project "gone" is deleted; project "live" survives and shares /src/shared.
    liveProjects = [
      { rootPath: '/projects/live', project: { members: [{ source: '/src/shared' }] } }
    ]
    liveWorkspacesByRoot = { '/projects/live': [] }
    const groups = [
      group({ id: 'top-gone', parentPath: '/projects/gone' }),
      group({ id: 'top-live', parentPath: '/projects/live' })
    ]
    const repos = [repo({ id: 'shared', path: '/src/shared', projectGroupId: 'top-gone' })]
    const { runtime, groups: g, repos: r } = makeRuntime(groups, repos)

    const result = await reconcileStructuredProjects(runtime)

    expect(result.removedGroupIds).toEqual(['top-gone'])
    expect(result.removedRepoIds).toEqual([]) // shared source still live → repo kept
    expect(r.map((x) => x.id)).toEqual(['shared'])
    expect(g.map((x) => x.id)).toEqual(['top-live'])
  })

  it('handles a partial delete: drops only the orphaned workspace group', async () => {
    // Project "p" survives with ws1 only; ws2's dir was deleted.
    liveProjects = [{ rootPath: '/projects/p', project: { members: [] } }]
    liveWorkspacesByRoot = { '/projects/p': [{ wsDir: '/projects/p/ws1' }] }
    const groups = [
      group({ id: 'top', parentPath: '/projects/p' }),
      group({ id: 'ws1', parentGroupId: 'top', parentPath: '/projects/p/ws1' }),
      group({ id: 'ws2', parentGroupId: 'top', parentPath: '/projects/p/ws2' })
    ]
    const { runtime, groups: g } = makeRuntime(groups, [])

    const result = await reconcileStructuredProjects(runtime)

    expect(result.removedGroupIds).toEqual(['ws2'])
    expect(g.map((x) => x.id).sort()).toEqual(['top', 'ws1'])
  })

  it('never touches non-structured groups even when their path is gone', async () => {
    liveProjects = []
    liveWorkspacesByRoot = {}
    const groups = [group({ id: 'manual', createdFrom: 'manual', parentPath: '/projects/gone' })]
    const { runtime, groups: g } = makeRuntime(groups, [])

    const result = await reconcileStructuredProjects(runtime)

    expect(result.removedGroupIds).toEqual([])
    expect(g.map((x) => x.id)).toEqual(['manual'])
  })

  it('unregisters an unmaterialized source repo passed via alsoRemoveUnreferencedSources', async () => {
    liveProjects = [] // deleted project no longer on disk
    liveWorkspacesByRoot = {}
    // Repo was registered by mounting but never materialized → no group.
    const repos = [repo({ id: 'r', path: '/src/mounted', projectGroupId: null })]
    const { runtime, repos: r } = makeRuntime([], repos)

    const result = await reconcileStructuredProjects(runtime, {
      alsoRemoveUnreferencedSources: ['/src/mounted']
    })

    expect(result.removedRepoIds).toEqual(['r'])
    expect(r).toHaveLength(0)
  })

  it('keeps a passed source repo still referenced by a live structured project', async () => {
    liveProjects = [
      { rootPath: '/projects/live', project: { members: [{ source: '/src/shared' }] } }
    ]
    liveWorkspacesByRoot = { '/projects/live': [] }
    const repos = [repo({ id: 'shared', path: '/src/shared', projectGroupId: null })]
    const { runtime, repos: r } = makeRuntime([], repos)

    const result = await reconcileStructuredProjects(runtime, {
      alsoRemoveUnreferencedSources: ['/src/shared']
    })

    expect(result.removedRepoIds).toEqual([])
    expect(r.map((x) => x.id)).toEqual(['shared'])
  })

  it('is a no-op when every structured record still has its disk backing', async () => {
    liveProjects = [{ rootPath: '/projects/p', project: { members: [{ source: '/src/a' }] } }]
    liveWorkspacesByRoot = { '/projects/p': [{ wsDir: '/projects/p/ws1' }] }
    const groups = [
      group({ id: 'top', parentPath: '/projects/p' }),
      group({ id: 'ws1', parentGroupId: 'top', parentPath: '/projects/p/ws1' })
    ]
    const repos = [repo({ id: 'a', path: '/src/a', projectGroupId: 'top' })]
    const { runtime, groups: g, repos: r } = makeRuntime(groups, repos)

    const result = await reconcileStructuredProjects(runtime)

    expect(result.removedGroupIds).toEqual([])
    expect(result.removedRepoIds).toEqual([])
    expect(g).toHaveLength(2)
    expect(r).toHaveLength(1)
  })
})
