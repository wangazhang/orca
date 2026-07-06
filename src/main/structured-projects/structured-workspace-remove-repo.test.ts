import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addWorkspaceRepoService,
  createStructuredProjectService,
  createStructuredWorkspaceService
} from './structured-project-service'
import { removeStructuredWorkspaceRepoService } from './structured-workspace-remove-repo'
import { readProjectFile, readWorkspaceFile } from './structured-project-disk'
import { srcRepoDir, workspaceDir } from './structured-project-layout'

// The service resolves ~/orca/projects via os.homedir(); point HOME at a temp
// dir so the whole flow runs on real filesystem without touching real data.
let dir: string
let prevHome: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'structured-remove-'))
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

describe('removeStructuredWorkspaceRepoService (real git)', () => {
  it('removes the worktree + workspace.json entry but keeps the project.json member', async () => {
    const source = seedSource('remove-src-repo')
    createStructuredProjectService({ name: 'P', services: [] })
    await createStructuredWorkspaceService({ project: 'P', workspaceName: 'w1' })
    await addWorkspaceRepoService({
      project: 'P',
      workspaceName: 'w1',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const wsDir = workspaceDir(join(projectsDir(), 'P'), 'w1')
    const target = srcRepoDir(wsDir, 'qa-pk')
    expect(existsSync(target)).toBe(true)

    const result = await removeStructuredWorkspaceRepoService({
      project: 'P',
      workspace: 'w1',
      repoId: 'qa-pk'
    })

    expect(result).toEqual({ removed: true })
    // Worktree directory gone.
    expect(existsSync(target)).toBe(false)
    // workspace.json no longer lists the repo.
    const wsRead = readWorkspaceFile(wsDir)
    expect(wsRead.ok && wsRead.value.worktrees).toEqual([])
    // project.json member is preserved (may be shared by other workspaces).
    const projRead = readProjectFile(join(projectsDir(), 'P'))
    expect(projRead.ok && projRead.value.members.map((m) => m.repoId)).toEqual(['qa-pk'])
  })

  it('is fail-soft when the worktree directory is already gone', async () => {
    const source = seedSource('remove-stale-repo')
    createStructuredProjectService({ name: 'P', services: [] })
    await createStructuredWorkspaceService({ project: 'P', workspaceName: 'w1' })
    await addWorkspaceRepoService({
      project: 'P',
      workspaceName: 'w1',
      source,
      repoId: 'qa-pk',
      defaultBranch: 'main'
    })

    const wsDir = workspaceDir(join(projectsDir(), 'P'), 'w1')
    // Remove the working directory out from under the service (stale git admin).
    rmSync(srcRepoDir(wsDir, 'qa-pk'), { recursive: true, force: true })

    const result = await removeStructuredWorkspaceRepoService({
      project: 'P',
      workspace: 'w1',
      repoId: 'qa-pk'
    })

    expect(result).toEqual({ removed: true })
    const wsRead = readWorkspaceFile(wsDir)
    expect(wsRead.ok && wsRead.value.worktrees).toEqual([])
  })

  it('throws for an unknown project or workspace', async () => {
    await expect(
      removeStructuredWorkspaceRepoService({ project: 'ghost', workspace: 'w', repoId: 'r' })
    ).rejects.toThrow(/not found/)

    createStructuredProjectService({ name: 'P', services: [] })
    await expect(
      removeStructuredWorkspaceRepoService({ project: 'P', workspace: 'nope', repoId: 'r' })
    ).rejects.toThrow(/not found/)
  })
})
