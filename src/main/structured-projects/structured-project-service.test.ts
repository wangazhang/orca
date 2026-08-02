import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addWorkspaceRepoService,
  createStructuredProjectService,
  createStructuredWorkspaceService,
  deleteStructuredProjectService,
  getStructuredProjectService,
  listStructuredProjectsService
} from './structured-project-service'
import { readProjectFile } from './structured-project-disk'
import { workspaceRepoDir } from './structured-project-layout'

// The service resolves ~/orca/projects via os.homedir(); point HOME at a temp
// dir so the whole flow runs on real filesystem without touching real data.
let dir: string
let prevHome: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'structured-service-'))
  prevHome = process.env.HOME
  process.env.HOME = dir
})

afterEach(() => {
  if (prevHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = prevHome
  }
  rmSync(dir, { recursive: true, force: true })
})

const projectsDir = () => join(dir, 'orca', 'projects')

describe('createStructuredProjectService', () => {
  it('writes project.json under ~/orca/projects/<name> by default', () => {
    const summary = createStructuredProjectService({
      name: 'Penguin-go',
      services: [
        { name: 'mysql', kind: 'mysql' },
        { name: 'redis', kind: 'redis' }
      ]
    })
    expect(summary.rootPath).toBe(join(projectsDir(), 'Penguin-go'))
    expect(existsSync(join(summary.rootPath, 'project.json'))).toBe(true)
    expect(summary.services).toEqual([
      { name: 'mysql', kind: 'mysql' },
      { name: 'redis', kind: 'redis' }
    ])
  })
})

describe('createStructuredWorkspaceService', () => {
  it('resolves the project by name (disk scan) and scaffolds a workspace', async () => {
    createStructuredProjectService({ name: 'Penguin-go', services: [] })
    const workspace = await createStructuredWorkspaceService({
      project: 'Penguin-go',
      workspaceName: 'youho'
    })
    expect(workspace.name).toBe('youho')
    const wsRoot = join(projectsDir(), 'Penguin-go', 'youho')
    expect(existsSync(join(wsRoot, '.yoho', 'workspace.json'))).toBe(true)
    expect(existsSync(join(wsRoot, 'repos'))).toBe(true)
  })

  it('throws a clear error for an unknown project', async () => {
    await expect(
      createStructuredWorkspaceService({ project: 'ghost', workspaceName: 'x' })
    ).rejects.toThrow(/not found/)
  })
})

describe('listStructuredProjectsService', () => {
  it('lists projects discovered by scanning the projects dir', () => {
    createStructuredProjectService({ name: 'A', services: [] })
    createStructuredProjectService({ name: 'B', services: [{ name: 'redis', kind: 'redis' }] })
    const names = listStructuredProjectsService()
      .map((p) => p.name)
      .sort()
    expect(names).toEqual(['A', 'B'])
  })
})

describe('getStructuredProjectService', () => {
  it('returns the project with its workspaces and worktrees', async () => {
    const source = join(dir, 'detail-src-repo')
    execFileSync('git', ['init', '-b', 'main', source])
    execFileSync('git', ['-C', source, 'config', 'user.email', 'test@orca.dev'])
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Orca Test'])
    execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])

    createStructuredProjectService({
      name: 'Penguin-go',
      services: [{ name: 'mysql', kind: 'mysql' }]
    })
    await createStructuredWorkspaceService({ project: 'Penguin-go', workspaceName: 'youho' })
    await addWorkspaceRepoService({
      project: 'Penguin-go',
      workspaceName: 'youho',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const detail = getStructuredProjectService('Penguin-go')
    expect(detail.name).toBe('Penguin-go')
    expect(detail.services).toEqual([{ name: 'mysql', kind: 'mysql' }])
    expect(detail.workspaces).toHaveLength(1)
    expect(detail.workspaces[0].name).toBe('youho')
    expect(detail.workspaces[0].worktrees.map((w) => w.repoId)).toEqual(['qa-pk'])
  })
})

describe('addWorkspaceRepoService (real git, full flow)', () => {
  it('creates project → workspace → mounts a repo as a worktree under repos/', async () => {
    const source = join(dir, 'source-repo')
    execFileSync('git', ['init', '-b', 'main', source])
    execFileSync('git', ['-C', source, 'config', 'user.email', 'test@orca.dev'])
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Orca Test'])
    execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])

    createStructuredProjectService({ name: 'Penguin-go', services: [] })
    await createStructuredWorkspaceService({ project: 'Penguin-go', workspaceName: 'youho' })
    const entry = await addWorkspaceRepoService({
      project: 'Penguin-go',
      workspaceName: 'youho',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const wsRoot = join(projectsDir(), 'Penguin-go', 'youho')
    const target = workspaceRepoDir(wsRoot, 'qa-pk')
    expect(entry.path).toBe(target)
    expect(readFileSync(join(target, '.git'), 'utf8')).toContain('gitdir:')
    const branch = execFileSync('git', ['-C', target, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    expect(branch).toBe('youho')

    const read = readProjectFile(join(projectsDir(), 'Penguin-go'))
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.value.members).toEqual([{ repoId: 'qa-pk', source, defaultBranch: 'main' }])
    }
  })

  it('reuses an existing same-named branch in the source instead of failing on -b', async () => {
    const source = join(dir, 'source-repo-existing-branch')
    execFileSync('git', ['init', '-b', 'main', source])
    execFileSync('git', ['-C', source, 'config', 'user.email', 'test@orca.dev'])
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Orca Test'])
    execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])
    // A leftover 'it1' branch (as a deleted iteration would leave behind), carrying
    // a distinct commit so we can prove the mount reuses it rather than recreating
    // a fresh branch from main.
    execFileSync('git', ['-C', source, 'checkout', '-b', 'it1'])
    writeFileSync(join(source, 'marker.txt'), 'from-existing-branch')
    execFileSync('git', ['-C', source, 'add', 'marker.txt'])
    execFileSync('git', ['-C', source, 'commit', '-m', 'existing-branch-work'])
    execFileSync('git', ['-C', source, 'checkout', 'main'])

    createStructuredProjectService({ name: 'Reuse', services: [] })
    await createStructuredWorkspaceService({ project: 'Reuse', workspaceName: 'it1' })
    const entry = await addWorkspaceRepoService({
      project: 'Reuse',
      workspaceName: 'it1',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const target = entry.path
    const branch = execFileSync('git', ['-C', target, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    expect(branch).toBe('it1')
    // The worktree carries the existing branch's work — proof it reused it rather
    // than creating a new 'it1' off main (which would fail, or lack this file).
    expect(readFileSync(join(target, 'marker.txt'), 'utf8')).toBe('from-existing-branch')
  })

  it('wires orca registration hooks so worktree meta carries orca-managed metadata', async () => {
    const source = join(dir, 'source-repo-managed')
    execFileSync('git', ['init', '-b', 'main', source])
    execFileSync('git', ['-C', source, 'config', 'user.email', 'test@orca.dev'])
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Orca Test'])
    execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])

    createStructuredProjectService({ name: 'Penguin-go', services: [] })
    await createStructuredWorkspaceService({ project: 'Penguin-go', workspaceName: 'youho' })

    const setWorktreeMeta = vi.fn()
    await addWorkspaceRepoService({
      project: 'Penguin-go',
      workspaceName: 'youho',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main',
      registration: { ensureRepoId: () => 'orca-uuid-1', setWorktreeMeta }
    })

    const target = workspaceRepoDir(join(projectsDir(), 'Penguin-go', 'youho'), 'qa-pk')
    expect(setWorktreeMeta).toHaveBeenCalledTimes(1)
    const [key, meta] = setWorktreeMeta.mock.calls[0]
    expect(key).toBe(`orca-uuid-1::${target}`)
    // orcaCreatedAt is the strong marker classifyWorktreeOwnership keys on → orca-managed.
    expect(meta.orcaCreatedAt).toBeTruthy()
  })
})

describe('deleteStructuredProjectService (real git)', () => {
  const seedSource = (name: string): string => {
    const source = join(dir, name)
    execFileSync('git', ['init', '-b', 'main', source])
    execFileSync('git', ['-C', source, 'config', 'user.email', 'test@orca.dev'])
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Orca Test'])
    execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])
    return source
  }
  const branchExists = (source: string, branch: string): boolean => {
    try {
      execFileSync('git', ['-C', source, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
      return true
    } catch {
      return false
    }
  }

  it('removes the on-disk root and, by default, lists but keeps leftover branches', async () => {
    const source = seedSource('keep-src')
    createStructuredProjectService({ name: 'Del', services: [] })
    await createStructuredWorkspaceService({ project: 'Del', workspaceName: 'iter1' })
    await addWorkspaceRepoService({ project: 'Del', workspaceName: 'iter1', source, repoId: 'r' })
    const rootPath = join(projectsDir(), 'Del')
    expect(branchExists(source, 'iter1')).toBe(true)

    const result = await deleteStructuredProjectService({ project: 'Del', deleteBranches: false })

    expect(existsSync(rootPath)).toBe(false)
    expect(result.workspaces).toEqual(['iter1'])
    expect(result.sources).toEqual([source])
    expect(result.keptBranches.map((b) => b.workspace)).toEqual(['iter1'])
    expect(result.removedBranches).toEqual([])
    // Branch preserved in the source repo (default is non-destructive).
    expect(branchExists(source, 'iter1')).toBe(true)
  })

  it('deletes leftover source branches when deleteBranches is true', async () => {
    const source = seedSource('del-src')
    createStructuredProjectService({ name: 'Del2', services: [] })
    await createStructuredWorkspaceService({ project: 'Del2', workspaceName: 'iter1' })
    await addWorkspaceRepoService({ project: 'Del2', workspaceName: 'iter1', source, repoId: 'r' })
    expect(branchExists(source, 'iter1')).toBe(true)

    const result = await deleteStructuredProjectService({ project: 'Del2', deleteBranches: true })

    expect(existsSync(join(projectsDir(), 'Del2'))).toBe(false)
    expect(result.removedBranches.map((b) => b.workspace)).toEqual(['iter1'])
    expect(result.keptBranches).toEqual([])
    // The worktree was removed and its branch pruned+deleted from the source.
    expect(branchExists(source, 'iter1')).toBe(false)
  })

  it('deletes a project with no mounted repos (no branches to touch)', async () => {
    createStructuredProjectService({ name: 'Empty', services: [] })
    await createStructuredWorkspaceService({ project: 'Empty', workspaceName: 'iter1' })

    const result = await deleteStructuredProjectService({ project: 'Empty', deleteBranches: true })

    expect(existsSync(join(projectsDir(), 'Empty'))).toBe(false)
    expect(result.removedBranches).toEqual([])
    expect(result.keptBranches).toEqual([])
    expect(result.workspaces).toEqual(['iter1'])
  })

  it('throws a clear error for an unknown project', async () => {
    await expect(deleteStructuredProjectService({ project: 'ghost' })).rejects.toThrow(/not found/)
  })
})
