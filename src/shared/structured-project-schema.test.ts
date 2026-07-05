import { describe, expect, it } from 'vitest'
import {
  parseProjectJson,
  parseWorkspaceJson,
  STRUCTURED_SERVICE_KINDS
} from './structured-project-schema'

const validProject = {
  name: 'Penguin-go',
  members: [{ repoId: 'qa-pk', source: '/abs/path/to/qa-pk', defaultBranch: 'main' }],
  services: ['mysql', 'redis', 'postgres', 'mongo'],
  createdAt: '2026-07-04T00:21:40.326089+00:00'
}

const validWorkspace = {
  name: 'youho',
  project: 'Penguin-go',
  worktrees: [{ repoId: 'qa-pk', path: '/abs/Penguin-go/youho/src/qa-pk', branch: 'youho' }],
  infraMode: 'isolated',
  services: [
    { kind: 'mysql', hostPort: 61918 },
    { kind: 'redis', hostPort: 61919 }
  ],
  createdAt: '2026-07-04T00:23:16.436882+00:00'
}

describe('parseProjectJson', () => {
  it('accepts a valid project.json matching the Yoho prototype', () => {
    const result = parseProjectJson(validProject)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toBe('Penguin-go')
      expect(result.value.members[0].repoId).toBe('qa-pk')
      expect(result.value.services).toEqual([...STRUCTURED_SERVICE_KINDS])
    }
  })

  it('tolerates unknown extra fields', () => {
    const result = parseProjectJson({ ...validProject, futureField: 42 })
    expect(result.ok).toBe(true)
  })

  it('rejects an unknown service kind with a path in the error', () => {
    const result = parseProjectJson({ ...validProject, services: ['mysql', 'cassandra'] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('services.1')
    }
  })

  it('rejects a missing required field', () => {
    const { name: _omit, ...withoutName } = validProject
    const result = parseProjectJson(withoutName)
    expect(result.ok).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(parseProjectJson(null).ok).toBe(false)
    expect(parseProjectJson('nope').ok).toBe(false)
  })
})

describe('parseWorkspaceJson', () => {
  it('accepts a valid workspace.json matching the Yoho prototype', () => {
    const result = parseWorkspaceJson(validWorkspace)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.infraMode).toBe('isolated')
      expect(result.value.services[0]).toEqual({ kind: 'mysql', hostPort: 61918 })
    }
  })

  it('rejects a non-integer or negative host port', () => {
    expect(
      parseWorkspaceJson({
        ...validWorkspace,
        services: [{ kind: 'mysql', hostPort: -1 }]
      }).ok
    ).toBe(false)
    expect(
      parseWorkspaceJson({
        ...validWorkspace,
        services: [{ kind: 'mysql', hostPort: 3306.5 }]
      }).ok
    ).toBe(false)
  })

  it('rejects an unknown infra mode', () => {
    const result = parseWorkspaceJson({ ...validWorkspace, infraMode: 'wild' })
    expect(result.ok).toBe(false)
  })
})
