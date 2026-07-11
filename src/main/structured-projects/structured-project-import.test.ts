import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importStructuredProjectService } from './structured-project-import'
import { readRegisteredRoots } from './structured-project-roots'
import { writeProjectFile } from './structured-project-disk'
import type { StructuredProjectFile } from '../../shared/structured-project-schema'

function projectFile(name: string): StructuredProjectFile {
  return {
    name,
    members: [
      { repoId: 'qa-pk', source: '/abs/qa-pk', defaultBranch: 'main' },
      { repoId: 'web', source: '/abs/web', defaultBranch: 'main' }
    ],
    services: ['mysql'],
    createdAt: '2026-07-04T00:21:40.326089+00:00'
  }
}

let base: string
let projectsDir: string
let rootsFile: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'structured-import-'))
  projectsDir = join(base, 'projects')
  mkdirSync(projectsDir, { recursive: true })
  rootsFile = join(base, 'registered-structured-roots.json')
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

function makeProject(rootPath: string, name: string): void {
  mkdirSync(rootPath, { recursive: true })
  writeProjectFile(rootPath, projectFile(name))
}

describe('importStructuredProjectService', () => {
  it('throws for a folder without a valid project.json', () => {
    const notAProject = join(base, 'random')
    mkdirSync(notAProject, { recursive: true })
    expect(() =>
      importStructuredProjectService(notAProject, { projectsDir, rootsFilePath: rootsFile })
    ).toThrow(/Not a structured project/)
  })

  it('registers an external root and returns its summary', () => {
    const externalRoot = join(base, 'elsewhere', 'Beta')
    makeProject(externalRoot, 'Beta')

    const summary = importStructuredProjectService(externalRoot, {
      projectsDir,
      rootsFilePath: rootsFile
    })

    expect(summary).toEqual({
      name: 'Beta',
      rootPath: externalRoot,
      services: ['mysql'],
      memberCount: 2
    })
    expect(readRegisteredRoots(rootsFile)).toEqual([externalRoot])
  })

  it('does not register a root already under the default projects dir', () => {
    const inside = join(projectsDir, 'Alpha')
    makeProject(inside, 'Alpha')

    const summary = importStructuredProjectService(inside, {
      projectsDir,
      rootsFilePath: rootsFile
    })

    expect(summary.name).toBe('Alpha')
    expect(readRegisteredRoots(rootsFile)).toEqual([])
  })

  it('is idempotent for an already-registered external root', () => {
    const externalRoot = join(base, 'elsewhere', 'Beta')
    makeProject(externalRoot, 'Beta')

    importStructuredProjectService(externalRoot, { projectsDir, rootsFilePath: rootsFile })
    importStructuredProjectService(externalRoot, { projectsDir, rootsFilePath: rootsFile })

    expect(readRegisteredRoots(rootsFile)).toEqual([externalRoot])
  })
})
