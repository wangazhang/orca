import { describe, expect, it } from 'vitest'
import { resolveExistingRepoLocation } from './add-repo-existing-location'
import type { FolderWorkspace, ProjectGroup, Repo, Worktree } from '../../../../shared/types'

function makeRepo(overrides: Partial<Repo> & { id: string; path: string }): Repo {
  return {
    displayName: overrides.id,
    badgeColor: '#999',
    addedAt: 1,
    kind: 'git',
    ...overrides
  } as Repo
}

function makeWorktree(repoId: string, path: string): Worktree {
  return { id: `${repoId}::${path}`, repoId } as Worktree
}

function makeFolderWorkspace(id: string, folderPath: string): FolderWorkspace {
  return { id, folderPath, projectGroupId: 'grp-a' } as FolderWorkspace
}

const projectGroups: ProjectGroup[] = [{ id: 'grp-a', name: 'Penguin-go' } as ProjectGroup]

describe('resolveExistingRepoLocation', () => {
  it('returns undefined for a path Orca has never loaded (new source repo)', () => {
    const ctx = {
      repos: [makeRepo({ id: 'r1', path: '/repos/other' })],
      worktreesByRepo: { r1: [makeWorktree('r1', '/repos/other')] },
      projectGroups,
      folderWorkspaces: []
    }
    expect(resolveExistingRepoLocation('/brand/new/qa-pk', ctx)).toBeUndefined()
  })

  it('reveals the workspace overview (not the buried src leaf) for a structured member', () => {
    const wsDir = '/orca/projects/Penguin-go/it1'
    const wtPath = `${wsDir}/src/qa-pk`
    const repo = makeRepo({
      id: 'r1',
      path: '/sources/qa-pk',
      displayName: 'qa-pk',
      projectGroupId: 'grp-a'
    })
    const ctx = {
      repos: [repo],
      worktreesByRepo: { r1: [makeWorktree('r1', wtPath)] },
      projectGroups,
      folderWorkspaces: [makeFolderWorkspace('fw1', wsDir)]
    }
    expect(resolveExistingRepoLocation(wtPath, ctx)).toEqual({
      repoName: 'qa-pk',
      worktreeId: 'folder:fw1',
      projectName: 'Penguin-go'
    })
  })

  it('matches irrespective of a trailing slash', () => {
    const wsDir = '/orca/projects/Penguin-go/it1'
    const wtPath = `${wsDir}/src/qa-pk`
    const ctx = {
      repos: [makeRepo({ id: 'r1', path: '/sources/qa-pk', displayName: 'qa-pk' })],
      worktreesByRepo: { r1: [makeWorktree('r1', wtPath)] },
      projectGroups,
      folderWorkspaces: [makeFolderWorkspace('fw1', wsDir)]
    }
    expect(resolveExistingRepoLocation(`${wtPath}/`, ctx)?.worktreeId).toBe('folder:fw1')
  })

  it('falls back to the worktree row when the path is not inside any workspace', () => {
    const wtPath = '/repos/standalone'
    const ctx = {
      repos: [makeRepo({ id: 'r1', path: '/sources/x', displayName: 'x' })],
      worktreesByRepo: { r1: [makeWorktree('r1', wtPath)] },
      projectGroups,
      folderWorkspaces: []
    }
    expect(resolveExistingRepoLocation(wtPath, ctx)?.worktreeId).toBe(`r1::${wtPath}`)
  })

  it('locates a registered repo root via its first worktree overview', () => {
    const wsDir = '/orca/projects/Penguin-go/it1'
    const wtPath = `${wsDir}/src/qa-pk`
    const repo = makeRepo({ id: 'r1', path: '/sources/qa-pk', displayName: 'qa-pk' })
    const ctx = {
      repos: [repo],
      worktreesByRepo: { r1: [makeWorktree('r1', wtPath)] },
      projectGroups,
      folderWorkspaces: [makeFolderWorkspace('fw1', wsDir)]
    }
    const result = resolveExistingRepoLocation('/sources/qa-pk', ctx)
    expect(result?.repoName).toBe('qa-pk')
    expect(result?.worktreeId).toBe('folder:fw1')
  })

  it('omits projectName when the repo is a plain (non-structured) project', () => {
    const wtPath = '/repos/standalone'
    const ctx = {
      repos: [makeRepo({ id: 'r1', path: wtPath, displayName: 'standalone' })],
      worktreesByRepo: { r1: [makeWorktree('r1', wtPath)] },
      projectGroups,
      folderWorkspaces: []
    }
    expect(resolveExistingRepoLocation(wtPath, ctx)?.projectName).toBeUndefined()
  })
})
