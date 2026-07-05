import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readProjectFile,
  readWorkspaceFile,
  scanStructuredProjects,
  writeProjectFile,
  writeWorkspaceFile
} from './structured-project-disk'
import { workspaceDir } from './structured-project-layout'
import type {
  StructuredProjectFile,
  StructuredWorkspaceFile
} from '../../shared/structured-project-schema'

const project: StructuredProjectFile = {
  name: 'Penguin-go',
  members: [{ repoId: 'qa-pk', source: '/abs/qa-pk', defaultBranch: 'main' }],
  services: ['mysql', 'redis'],
  createdAt: '2026-07-04T00:21:40.326089+00:00'
}

const workspace: StructuredWorkspaceFile = {
  name: 'youho',
  project: 'Penguin-go',
  worktrees: [{ repoId: 'qa-pk', path: '/abs/Penguin-go/youho/src/qa-pk', branch: 'youho' }],
  infraMode: 'isolated',
  services: [{ kind: 'mysql', hostPort: 61918 }],
  createdAt: '2026-07-04T00:23:16.436882+00:00'
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'structured-disk-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('project.json disk I/O', () => {
  it('round-trips a project through write then read', () => {
    const root = join(dir, 'Penguin-go')
    mkdirSync(root, { recursive: true })
    writeProjectFile(root, project)
    const result = readProjectFile(root)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(project)
    }
  })

  it('reports not-found for a missing project.json', () => {
    const result = readProjectFile(join(dir, 'nope'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.exists).toBe(false)
    }
  })

  it('surfaces a parse error for malformed JSON', () => {
    const root = join(dir, 'broken')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'project.json'), '{ not valid', 'utf8')
    const result = readProjectFile(root)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.exists).toBe(true)
    }
  })
})

describe('workspace.json disk I/O', () => {
  it('round-trips a workspace through write then read', () => {
    const ws = workspaceDir(dir, 'youho')
    writeWorkspaceFile(ws, workspace)
    const result = readWorkspaceFile(ws)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(workspace)
    }
  })
})

describe('scanStructuredProjects', () => {
  it('discovers only subdirectories holding a valid project.json', () => {
    const good = join(dir, 'Penguin-go')
    mkdirSync(good, { recursive: true })
    writeProjectFile(good, project)

    // A directory without project.json is ignored.
    mkdirSync(join(dir, 'not-a-project'), { recursive: true })
    // A directory with malformed project.json is skipped, not fatal.
    const broken = join(dir, 'broken')
    mkdirSync(broken, { recursive: true })
    writeFileSync(join(broken, 'project.json'), '{ bad', 'utf8')

    const found = scanStructuredProjects(dir)
    expect(found).toHaveLength(1)
    expect(found[0].rootPath).toBe(good)
    expect(found[0].project.name).toBe('Penguin-go')
  })

  it('returns empty for a missing projects directory', () => {
    expect(scanStructuredProjects(join(dir, 'absent'))).toEqual([])
  })
})
