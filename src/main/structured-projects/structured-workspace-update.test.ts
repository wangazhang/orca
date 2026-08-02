import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createStructuredProjectService,
  createStructuredWorkspaceService
} from './structured-project-service'
import { updateStructuredWorkspaceServicesService } from './structured-workspace-update'
import { readWorkspaceFile } from './structured-project-disk'
import { devopsComposePath, devopsEnvPath, workspaceDir } from './structured-project-layout'
import type { StructuredServiceKind } from '../../shared/structured-project-schema'

// Preset service specs (name === kind) for the create/update calls below.
const svc = (...kinds: StructuredServiceKind[]) => kinds.map((kind) => ({ name: kind, kind }))

// The service resolves ~/orca/projects via os.homedir(); point HOME at a temp
// dir so the whole flow runs on real filesystem without touching real data.
let dir: string
let prevHome: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'structured-update-'))
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
const wsDirFor = (project: string, workspace: string) =>
  workspaceDir(join(projectsDir(), project), workspace)

describe('updateStructuredWorkspaceServicesService', () => {
  it('adds a service, keeping the existing service’s already-allocated port', async () => {
    createStructuredProjectService({ name: 'P', services: svc('redis') })
    await createStructuredWorkspaceService({ project: 'P', workspaceName: 'w1' })
    const before = readWorkspaceFile(wsDirFor('P', 'w1'))
    const redisPort = before.ok
      ? before.value.services.find((s) => s.kind === 'redis')?.hostPort
      : 0

    const updated = await updateStructuredWorkspaceServicesService({
      project: 'P',
      workspace: 'w1',
      services: svc('redis', 'mysql')
    })

    expect(updated.services.map((s) => s.kind)).toEqual(['redis', 'mysql'])
    // redis keeps its original port; mysql gets a distinct fresh one.
    expect(updated.services.find((s) => s.kind === 'redis')?.hostPort).toBe(redisPort)
    const mysqlPort = updated.services.find((s) => s.kind === 'mysql')?.hostPort
    expect(mysqlPort).toBeGreaterThan(0)
    expect(mysqlPort).not.toBe(redisPort)

    // Compose + env regenerated to include both services.
    const compose = readFileSync(devopsComposePath(wsDirFor('P', 'w1')), 'utf8')
    expect(compose).toContain('redis:')
    expect(compose).toContain('mysql:')
    const env = readFileSync(devopsEnvPath(wsDirFor('P', 'w1')), 'utf8')
    expect(env).toContain('MYSQL_PORT=')
    expect(env).toContain('REDIS_PORT=')

    // Persisted to workspace.json.
    const persisted = readWorkspaceFile(wsDirFor('P', 'w1'))
    expect(persisted.ok && persisted.value.services.map((s) => s.kind)).toEqual(['redis', 'mysql'])
  })

  it('removes a service, dropping it from compose/.env and workspace.json', async () => {
    createStructuredProjectService({ name: 'P', services: svc('redis', 'mysql') })
    await createStructuredWorkspaceService({ project: 'P', workspaceName: 'w1' })

    const updated = await updateStructuredWorkspaceServicesService({
      project: 'P',
      workspace: 'w1',
      services: svc('mysql')
    })

    expect(updated.services.map((s) => s.kind)).toEqual(['mysql'])
    const compose = readFileSync(devopsComposePath(wsDirFor('P', 'w1')), 'utf8')
    expect(compose).toContain('mysql:')
    expect(compose).not.toContain('redis:')
    const env = readFileSync(devopsEnvPath(wsDirFor('P', 'w1')), 'utf8')
    expect(env).not.toContain('REDIS_PORT=')

    const persisted = readWorkspaceFile(wsDirFor('P', 'w1'))
    expect(persisted.ok && persisted.value.services.map((s) => s.kind)).toEqual(['mysql'])
  })

  it('supports clearing all services', async () => {
    createStructuredProjectService({ name: 'P', services: svc('redis') })
    await createStructuredWorkspaceService({ project: 'P', workspaceName: 'w1' })

    const updated = await updateStructuredWorkspaceServicesService({
      project: 'P',
      workspace: 'w1',
      services: []
    })

    expect(updated.services).toEqual([])
  })

  it('throws for an unknown project or workspace', async () => {
    await expect(
      updateStructuredWorkspaceServicesService({ project: 'ghost', workspace: 'w', services: [] })
    ).rejects.toThrow(/not found/)

    createStructuredProjectService({ name: 'P', services: [] })
    await expect(
      updateStructuredWorkspaceServicesService({ project: 'P', workspace: 'nope', services: [] })
    ).rejects.toThrow(/not found/)
  })
})
