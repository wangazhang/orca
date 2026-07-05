import { describe, expect, it } from 'vitest'
import { containerPortFor, generateDevopsSandbox } from './compose-generator'
import type { StructuredWorkspaceService } from '../../shared/structured-project-schema'

const services: StructuredWorkspaceService[] = [
  { kind: 'mysql', hostPort: 61918 },
  { kind: 'redis', hostPort: 61919 },
  { kind: 'postgres', hostPort: 61920 },
  { kind: 'mongo', hostPort: 61921 }
]

describe('generateDevopsSandbox compose', () => {
  it('renders one service block per requested service with mapped ports', () => {
    const { composeYaml } = generateDevopsSandbox(services)
    expect(composeYaml.startsWith('services:\n')).toBe(true)
    expect(composeYaml).toContain('  mysql:\n    image: mysql:8')
    expect(composeYaml).toContain('- "61918:3306"')
    expect(composeYaml).toContain('- "61920:5432"')
    expect(composeYaml).toContain('- "61921:27017"')
  })

  it('mounts per-service data volumes under ./data/<kind>', () => {
    const { composeYaml } = generateDevopsSandbox(services)
    expect(composeYaml).toContain('- ./data/mysql:/var/lib/mysql')
    expect(composeYaml).toContain('- ./data/postgres:/var/lib/postgresql/data')
    expect(composeYaml).toContain('- ./data/mongo:/data/db')
  })

  it('omits an environment block for redis (no env vars)', () => {
    const { composeYaml } = generateDevopsSandbox([{ kind: 'redis', hostPort: 6001 }])
    expect(composeYaml).not.toContain('environment:')
    expect(composeYaml).toContain('- ./data/redis:/data')
  })

  it('applies the password override to db credentials', () => {
    const { composeYaml } = generateDevopsSandbox([{ kind: 'postgres', hostPort: 5001 }], {
      password: 'sekret'
    })
    expect(composeYaml).toContain('POSTGRES_PASSWORD: sekret')
  })
})

describe('generateDevopsSandbox .env', () => {
  it('emits HOST/PORT vars per service pointing at the assigned host ports', () => {
    const { envFile } = generateDevopsSandbox(services)
    expect(envFile).toContain('MYSQL_HOST=127.0.0.1')
    expect(envFile).toContain('MYSQL_PORT=61918')
    expect(envFile).toContain('REDIS_PORT=61919')
    expect(envFile).toContain('MONGO_PORT=61921')
  })
})

describe('containerPortFor', () => {
  it('maps each service kind to its container port', () => {
    expect(containerPortFor('mysql')).toBe(3306)
    expect(containerPortFor('redis')).toBe(6379)
    expect(containerPortFor('postgres')).toBe(5432)
    expect(containerPortFor('mongo')).toBe(27017)
  })
})
