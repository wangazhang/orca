import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addWorktree } from '../git/worktree'
import { createStructuredProject, createStructuredWorkspace } from './structured-project-scaffold'
import { readWorkspaceFile } from './structured-project-disk'
import { workspaceRepoDir } from './structured-project-layout'
import { mountRepoIntoWorkspace } from './structured-workspace-repo-mount'

const portOptions = { probe: false as const, rangeStart: 34000, rangeEnd: 34100 }
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mount-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function scaffoldWs(): Promise<string> {
  const root = join(dir, 'P')
  createStructuredProject({ name: 'P', rootPath: root, services: [] })
  const { wsDir } = await createStructuredWorkspace({
    rootPath: root,
    projectName: 'P',
    workspaceName: 'w1',
    services: [],
    portOptions
  })
  return wsDir
}

describe('mountRepoIntoWorkspace (injected deps)', () => {
  it('mounts to src/<repoId> and updates workspace.json; registration optional', async () => {
    const wsDir = await scaffoldWs()
    const addWorktreeMock = vi.fn().mockResolvedValue(undefined)
    const setMeta = vi.fn()
    const entry = await mountRepoIntoWorkspace(
      {
        addWorktree: addWorktreeMock,
        ensureRepoId: () => 'r1',
        setWorktreeMeta: setMeta,
        now: () => 1,
        makeInstanceId: () => 'i1'
      },
      { wsDir, repoId: 'qa-pk', source: '/s/qa-pk', branch: 'w1', defaultBranch: 'main' }
    )
    const target = workspaceRepoDir(wsDir, 'qa-pk')
    expect(addWorktreeMock).toHaveBeenCalledWith('/s/qa-pk', target, 'w1', 'main')
    expect(setMeta).toHaveBeenCalledWith(`r1::${target}`, {
      instanceId: 'i1',
      orcaCreatedAt: 1,
      orcaCreationSource: 'cli',
      baseRef: 'main'
    })
    expect(entry).toEqual({ repoId: 'qa-pk', path: target, branch: 'w1' })
    const read = readWorkspaceFile(wsDir)
    expect(read.ok && read.value.worktrees).toHaveLength(1)
  })

  it('skips orca registration when hooks are omitted', async () => {
    const wsDir = await scaffoldWs()
    await mountRepoIntoWorkspace(
      { addWorktree: vi.fn().mockResolvedValue(undefined) },
      { wsDir, repoId: 'x', source: '/s/x', branch: 'w1', defaultBranch: 'main' }
    )
    const read = readWorkspaceFile(wsDir)
    expect(read.ok && read.value.worktrees[0].repoId).toBe('x')
  })
})

describe('mountRepoIntoWorkspace (real git)', () => {
  it('creates a real linked worktree on the workspace branch', async () => {
    const source = join(dir, 'src-repo')
    execFileSync('git', ['init', '-b', 'main', source])
    execFileSync('git', ['-C', source, 'config', 'user.email', 't@o.dev'])
    execFileSync('git', ['-C', source, 'config', 'user.name', 'T'])
    execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])
    const wsDir = await scaffoldWs()
    await mountRepoIntoWorkspace(
      { addWorktree: (r, w, b, base) => addWorktree(r, w, b, base).then(() => undefined) },
      { wsDir, repoId: 'qa-pk', source, branch: 'w1', defaultBranch: 'main' }
    )
    const target = workspaceRepoDir(wsDir, 'qa-pk')
    expect(readFileSync(join(target, '.git'), 'utf8')).toContain('gitdir:')
    const branch = execFileSync('git', ['-C', target, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    expect(branch).toBe('w1')
  })
})
