import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanAllStructuredProjects } from './structured-project-scan'
import { addRegisteredRoot, readRegisteredRoots } from './structured-project-roots'
import { writeProjectFile } from './structured-project-disk'
import type { StructuredProjectFile } from '../../shared/structured-project-schema'

function projectFile(name: string): StructuredProjectFile {
  return {
    name,
    members: [{ repoId: 'qa-pk', source: '/abs/qa-pk', defaultBranch: 'main' }],
    services: [],
    createdAt: '2026-07-04T00:21:40.326089+00:00'
  }
}

let base: string
let projectsDir: string
let rootsFile: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'structured-scan-'))
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

describe('scanAllStructuredProjects', () => {
  it('scans the default projects dir', () => {
    makeProject(join(projectsDir, 'Alpha'), 'Alpha')
    const result = scanAllStructuredProjects({ projectsDir, rootsFilePath: rootsFile })
    expect(result.map((p) => p.project.name)).toEqual(['Alpha'])
  })

  it('includes registered external roots outside the default dir', () => {
    makeProject(join(projectsDir, 'Alpha'), 'Alpha')
    const externalRoot = join(base, 'elsewhere', 'Beta')
    makeProject(externalRoot, 'Beta')
    addRegisteredRoot(externalRoot, rootsFile)

    const names = scanAllStructuredProjects({ projectsDir, rootsFilePath: rootsFile })
      .map((p) => p.project.name)
      .sort()
    expect(names).toEqual(['Alpha', 'Beta'])
  })

  it('does not duplicate a registered root that also lives under the default dir', () => {
    const inside = join(projectsDir, 'Alpha')
    makeProject(inside, 'Alpha')
    addRegisteredRoot(inside, rootsFile)

    const result = scanAllStructuredProjects({ projectsDir, rootsFilePath: rootsFile })
    expect(result).toHaveLength(1)
    // The still-valid duplicate must NOT be pruned from the registry.
    expect(readRegisteredRoots(rootsFile)).toEqual([inside])
  })

  it('lazily prunes a registered root whose project.json is gone', () => {
    const externalRoot = join(base, 'elsewhere', 'Gone')
    addRegisteredRoot(externalRoot, rootsFile)

    const result = scanAllStructuredProjects({ projectsDir, rootsFilePath: rootsFile })
    expect(result).toEqual([])
    expect(readRegisteredRoots(rootsFile)).toEqual([])
  })
})
