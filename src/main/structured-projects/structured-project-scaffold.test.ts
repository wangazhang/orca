import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStructuredProject, createStructuredWorkspace } from './structured-project-scaffold'
import { readProjectFile, readWorkspaceFile } from './structured-project-disk'
import { devopsComposePath, devopsDataDir, docDir, srcDir } from './structured-project-layout'

const portOptions = { probe: false as const, rangeStart: 30000, rangeEnd: 30100 }
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scaffold-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createStructuredProject', () => {
  it('creates the root and a valid project.json with no members', () => {
    const root = join(dir, 'P')
    const created = createStructuredProject({ name: 'P', rootPath: root, services: ['mysql'] })
    expect(created.id).toMatch(/[0-9a-f-]{36}/)
    const read = readProjectFile(root)
    expect(read.ok && read.value.members).toEqual([])
  })
})

describe('createStructuredWorkspace', () => {
  it('scaffolds doc/devops/src, allocates ports, generates sandbox, writes workspace.json', async () => {
    const root = join(dir, 'P')
    createStructuredProject({ name: 'P', rootPath: root, services: [] })
    const { wsDir, workspace } = await createStructuredWorkspace({
      rootPath: root,
      projectName: 'P',
      workspaceName: 'w1',
      services: ['mysql', 'redis'],
      portOptions
    })
    expect(existsSync(docDir(wsDir))).toBe(true)
    expect(existsSync(srcDir(wsDir))).toBe(true)
    expect(existsSync(devopsDataDir(wsDir, 'mysql'))).toBe(true)
    expect(readFileSync(devopsComposePath(wsDir), 'utf8')).toContain('mysql:8')
    expect(workspace.services).toHaveLength(2)
    expect(new Set(workspace.services.map((s) => s.hostPort)).size).toBe(2)
    expect(readWorkspaceFile(wsDir).ok).toBe(true)
  })
})
