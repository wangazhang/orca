// End-to-end verification of the structured-project IMPORT path against real
// disk + git, exercising the actual modules (no service mocking). Simulates a
// structured project that lives OUTSIDE the default projects dir — the exact
// case that used to be invisible after restart — then imports it and drives the
// full chain scan → resolve → materialize.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProjectFile, writeProjectFile, writeWorkspaceFile } from './structured-project-disk'
import { createStructuredProject, createStructuredWorkspace } from './structured-project-scaffold'
import { importStructuredProjectService } from './structured-project-import'
import { scanAllStructuredProjects } from './structured-project-scan'
import { readRegisteredRoots } from './structured-project-roots'
import { getProjectsDir } from './structured-project-paths'
import { listStructuredProjectsService, resolveProject } from './structured-project-service'
import {
  materializeAllStructuredProjects,
  materializeStructuredProject
} from './structured-project-materialize'
import type { FolderWorkspace, ProjectGroup, Repo, WorktreeMeta } from '../../shared/types'
import type { MaterializeRuntime } from './structured-project-materialize'

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

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

let originalHome: string | undefined
let home: string
let sourceRepo: string
let externalRoot: string
let wsDir: string
let worktreePath: string

const PROJECT_NAME = 'Penguin-go'
const WORKSPACE = 'ws1'

beforeAll(async () => {
  originalHome = process.env.HOME
  home = mkdtempSync(join(tmpdir(), 'structured-e2e-home-'))
  process.env.HOME = home

  // A real Git source repo with one commit, so `git worktree add` succeeds.
  sourceRepo = join(home, 'sources', 'qa-pk')
  mkdirSync(sourceRepo, { recursive: true })
  git(sourceRepo, 'init', '-q')
  git(sourceRepo, 'config', 'user.email', 'e2e@example.com')
  git(sourceRepo, 'config', 'user.name', 'e2e')
  git(sourceRepo, 'commit', '--allow-empty', '-q', '-m', 'init')

  // Build a structured project OUTSIDE ~/orca/projects (getProjectsDir()).
  externalRoot = join(home, 'external', PROJECT_NAME)
  createStructuredProject({ name: PROJECT_NAME, rootPath: externalRoot, services: [] })
  await createStructuredWorkspace({
    rootPath: externalRoot,
    projectName: PROJECT_NAME,
    workspaceName: WORKSPACE,
    services: []
  })

  // Real per-workspace git worktree on the workspace branch.
  wsDir = join(externalRoot, WORKSPACE)
  worktreePath = join(wsDir, 'src', 'qa-pk')
  git(sourceRepo, 'worktree', 'add', '-q', '-b', WORKSPACE, worktreePath)

  // Reflect the mounted repo in the on-disk source of truth.
  const projectRead = readProjectFile(externalRoot)
  if (!projectRead.ok) {
    throw new Error('fixture project.json invalid')
  }
  writeProjectFile(externalRoot, {
    ...projectRead.value,
    members: [{ repoId: 'qa-pk', source: sourceRepo, defaultBranch: 'main' }]
  })
  writeWorkspaceFile(wsDir, {
    name: WORKSPACE,
    project: PROJECT_NAME,
    worktrees: [{ repoId: 'qa-pk', path: worktreePath, branch: WORKSPACE }],
    infraMode: 'isolated',
    services: [],
    createdAt: new Date(0).toISOString()
  })
})

afterAll(() => {
  try {
    git(sourceRepo, 'worktree', 'prune')
  } catch {
    // best effort
  }
  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }
  rmSync(home, { recursive: true, force: true })
})

describe('structured import E2E (real disk + git)', () => {
  it('confirms the external project is invisible before import', () => {
    expect(getProjectsDir()).toBe(join(home, 'orca', 'projects'))
    expect(listStructuredProjectsService()).toEqual([])
    expect(scanAllStructuredProjects()).toEqual([])
    expect(() => resolveProject(PROJECT_NAME)).toThrow(/not found/i)
  })

  it('imports the external root and makes it discoverable + resolvable', () => {
    const summary = importStructuredProjectService(externalRoot)
    expect(summary).toMatchObject({ name: PROJECT_NAME, rootPath: externalRoot, memberCount: 1 })

    expect(readRegisteredRoots()).toContain(externalRoot)
    expect(scanAllStructuredProjects().map((p) => p.project.name)).toEqual([PROJECT_NAME])
    expect(listStructuredProjectsService().map((p) => p.name)).toEqual([PROJECT_NAME])
    expect(resolveProject(PROJECT_NAME).rootPath).toBe(externalRoot)
  })

  it('materializes the imported project into native records with a stamped worktree', async () => {
    const fake = makeFakeRuntime()
    const result = await materializeStructuredProject(fake.runtime, PROJECT_NAME)

    const top = fake.groups.find((g) => g.parentGroupId === null)
    expect(top?.createdFrom).toBe('structured')
    expect(top?.parentPath).toBe(externalRoot)

    const workspaceGroups = fake.groups.filter((g) => g.parentGroupId === top?.id)
    expect(workspaceGroups.map((g) => g.parentPath)).toEqual([wsDir])
    expect(fake.folderWorkspaces.map((fw) => fw.folderPath)).toEqual([wsDir])

    // The shared source repo is registered and pinned under the top group.
    expect(result.repoIds).toEqual([`repo:${sourceRepo}`])
    expect(fake.repoGroup.get(`repo:${sourceRepo}`)).toBe(top?.id)

    // The real worktree is stamped orca-managed so it renders (not hidden).
    const worktreeId = `repo:${sourceRepo}::${worktreePath}`
    expect(fake.worktreeMeta.get(worktreeId)?.orcaCreatedAt).toBeTypeOf('number')
  })

  it('import is idempotent (no duplicate registry entry)', () => {
    importStructuredProjectService(externalRoot)
    importStructuredProjectService(externalRoot)
    expect(readRegisteredRoots().filter((r) => r === externalRoot)).toHaveLength(1)
  })

  it('materializeAll (bulk startup path) also picks up the imported external project', async () => {
    const fake = makeFakeRuntime()
    const results = await materializeAllStructuredProjects(fake.runtime)

    // The registered external root is discovered by the single bulk scan.
    expect(results).toHaveLength(1)
    const top = fake.groups.find((g) => g.parentGroupId === null)
    expect(top?.parentPath).toBe(externalRoot)
    expect(top?.createdFrom).toBe('structured')
    const worktreeId = `repo:${sourceRepo}::${worktreePath}`
    expect(fake.worktreeMeta.get(worktreeId)?.orcaCreatedAt).toBeTypeOf('number')
  })
})
