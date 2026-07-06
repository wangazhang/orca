import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addWorkspaceRepoService,
  createStructuredProjectService,
  createStructuredWorkspaceService
} from './structured-project-service'
import { copyStructuredWorkspaceService } from './structured-workspace-copy'
import { readProjectFile, readWorkspaceFile } from './structured-project-disk'
import { srcRepoDir, workspaceDir } from './structured-project-layout'

// The service resolves ~/orca/projects via os.homedir(); point HOME at a temp
// dir so the whole flow runs on real filesystem without touching real data.
let dir: string
let prevHome: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'structured-copy-'))
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

const seedSource = (name: string): string => {
  const source = join(dir, name)
  execFileSync('git', ['init', '-b', 'main', source])
  execFileSync('git', ['-C', source, 'config', 'user.email', 'test@orca.dev'])
  execFileSync('git', ['-C', source, 'config', 'user.name', 'Orca Test'])
  execFileSync('git', ['-C', source, 'commit', '--allow-empty', '-m', 'init'])
  return source
}

describe('copyStructuredWorkspaceService (real git)', () => {
  it('copies a workspace with its own sandbox ports and remounted worktrees', async () => {
    const source = seedSource('copy-src-repo')
    createStructuredProjectService({ name: 'Penguin-go', services: ['redis'] })
    await createStructuredWorkspaceService({ project: 'Penguin-go', workspaceName: 'youho' })
    await addWorkspaceRepoService({
      project: 'Penguin-go',
      workspaceName: 'youho',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const copy = await copyStructuredWorkspaceService({
      project: 'Penguin-go',
      sourceWorkspace: 'youho',
      name: 'youho2'
    })

    // New workspace scaffolded with its own sandbox (redis port assigned).
    expect(copy.name).toBe('youho2')
    expect(copy.services.map((s) => s.kind)).toEqual(['redis'])
    expect(copy.services[0].hostPort).toBeGreaterThan(0)

    const ws2Dir = workspaceDir(join(projectsDir(), 'Penguin-go'), 'youho2')
    expect(existsSync(join(ws2Dir, '.yoho', 'workspace.json'))).toBe(true)
    expect(existsSync(join(ws2Dir, 'devops', 'docker-compose.yaml'))).toBe(true)

    // The repo was remounted as a worktree on the NEW workspace's branch.
    const target = srcRepoDir(ws2Dir, 'qa-pk')
    expect(copy.worktrees.map((w) => w.repoId)).toEqual(['qa-pk'])
    expect(readFileSync(join(target, '.git'), 'utf8')).toContain('gitdir:')
    const branch = execFileSync('git', ['-C', target, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    expect(branch).toBe('youho2')
  })

  it('wires orca registration hooks for each remounted repo', async () => {
    const source = seedSource('copy-managed-repo')
    createStructuredProjectService({ name: 'Reg', services: [] })
    await createStructuredWorkspaceService({ project: 'Reg', workspaceName: 'w1' })
    await addWorkspaceRepoService({
      project: 'Reg',
      workspaceName: 'w1',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const registerManagedRepo = vi.fn(async () => 'orca-uuid-1')
    const setWorktreeMeta = vi.fn()
    await copyStructuredWorkspaceService({
      project: 'Reg',
      sourceWorkspace: 'w1',
      name: 'w2',
      registration: { registerManagedRepo, setWorktreeMeta }
    })

    expect(registerManagedRepo).toHaveBeenCalledWith(source)
    const target = srcRepoDir(workspaceDir(join(projectsDir(), 'Reg'), 'w2'), 'qa-pk')
    expect(setWorktreeMeta).toHaveBeenCalledTimes(1)
    const [key, meta] = setWorktreeMeta.mock.calls[0]
    expect(key).toBe(`orca-uuid-1::${target}`)
    expect(meta.orcaCreatedAt).toBeTruthy()
  })

  it('copies an empty workspace (no worktrees) without touching members', async () => {
    createStructuredProjectService({ name: 'Empty', services: ['mysql'] })
    await createStructuredWorkspaceService({ project: 'Empty', workspaceName: 'w1' })

    const copy = await copyStructuredWorkspaceService({
      project: 'Empty',
      sourceWorkspace: 'w1',
      name: 'w2'
    })

    expect(copy.worktrees).toEqual([])
    expect(copy.services.map((s) => s.kind)).toEqual(['mysql'])
    const read = readProjectFile(join(projectsDir(), 'Empty'))
    expect(read.ok && read.value.members).toEqual([])
    // The source workspace file is untouched by the copy.
    const srcRead = readWorkspaceFile(workspaceDir(join(projectsDir(), 'Empty'), 'w1'))
    expect(srcRead.ok).toBe(true)
  })

  it('throws for an unknown project or missing source workspace', async () => {
    await expect(
      copyStructuredWorkspaceService({ project: 'ghost', sourceWorkspace: 'w', name: 'x' })
    ).rejects.toThrow(/not found/)

    createStructuredProjectService({ name: 'Has', services: [] })
    await expect(
      copyStructuredWorkspaceService({ project: 'Has', sourceWorkspace: 'nope', name: 'x' })
    ).rejects.toThrow(/not found/)
  })
})
