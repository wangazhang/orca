import { describe, expect, it } from 'vitest'
import { parseProjectJson, parseWorkspaceJson } from './structured-project-schema'

// Uses the legacy on-disk shapes (bare kind strings / { kind, hostPort }) to
// exercise the back-compat migration into the unified service spec.
const validProject = {
  name: 'Penguin-go',
  members: [{ repoId: 'qa-pk', source: '/abs/path/to/qa-pk', defaultBranch: 'main' }],
  services: ['mysql', 'redis'],
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
  it('migrates a legacy bare kind-string services array into specs', () => {
    const result = parseProjectJson(validProject)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toBe('Penguin-go')
      expect(result.value.members[0].repoId).toBe('qa-pk')
      expect(result.value.services).toEqual([
        { name: 'mysql', kind: 'mysql' },
        { name: 'redis', kind: 'redis' }
      ])
    }
  })

  it('accepts a new preset + custom service spec array', () => {
    const result = parseProjectJson({
      ...validProject,
      services: [
        { name: 'mysql', kind: 'mysql' },
        { name: 'my-kafka', kind: null, image: 'apache/kafka:3.8.0', containerPort: 9092 }
      ]
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.services[1]).toEqual({
        name: 'my-kafka',
        kind: null,
        image: 'apache/kafka:3.8.0',
        containerPort: 9092
      })
    }
  })

  it('accepts the new preset kinds (kafka, elasticsearch, nacos)', () => {
    const result = parseProjectJson({
      ...validProject,
      services: ['kafka', 'elasticsearch', 'nacos']
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a custom service (kind=null) without an image', () => {
    const result = parseProjectJson({
      ...validProject,
      services: [{ name: 'broken', kind: null, containerPort: 1234 }]
    })
    expect(result.ok).toBe(false)
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
  it('migrates legacy { kind, hostPort } services by filling name from kind', () => {
    const result = parseWorkspaceJson(validWorkspace)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.infraMode).toBe('isolated')
      expect(result.value.services[0]).toEqual({ name: 'mysql', kind: 'mysql', hostPort: 61918 })
    }
  })

  it('accepts a custom service with its own image/port plus host port', () => {
    const result = parseWorkspaceJson({
      ...validWorkspace,
      services: [
        {
          name: 'my-kafka',
          kind: null,
          image: 'apache/kafka:3.8.0',
          containerPort: 9092,
          hostPort: 20001
        }
      ]
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.services[0].name).toBe('my-kafka')
      expect(result.value.services[0].kind).toBeNull()
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
