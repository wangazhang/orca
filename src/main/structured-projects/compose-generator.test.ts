import { describe, expect, it } from 'vitest'
import { containerPortFor, generateDevopsSandbox } from './compose-generator'
import type { StructuredWorkspaceService } from '../../shared/structured-project-schema'

// Preset services carry name === kind (image/port come from the built-in table).
function preset(
  kind: StructuredWorkspaceService['kind'],
  hostPort: number
): StructuredWorkspaceService {
  return { name: kind as string, kind, hostPort }
}

const services: StructuredWorkspaceService[] = [
  preset('mysql', 61918),
  preset('redis', 61919),
  preset('postgres', 61920),
  preset('mongo', 61921)
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

  it('mounts per-service data volumes under ./data/<name>', () => {
    const { composeYaml } = generateDevopsSandbox(services)
    expect(composeYaml).toContain('- ./data/mysql:/var/lib/mysql')
    expect(composeYaml).toContain('- ./data/postgres:/var/lib/postgresql/data')
    expect(composeYaml).toContain('- ./data/mongo:/data/db')
  })

  it('omits an environment block for redis (no env vars)', () => {
    const { composeYaml } = generateDevopsSandbox([preset('redis', 6001)])
    expect(composeYaml).not.toContain('environment:')
    expect(composeYaml).toContain('- ./data/redis:/data')
  })

  it('applies the password override to db credentials', () => {
    const { composeYaml } = generateDevopsSandbox([preset('postgres', 5001)], {
      password: 'sekret'
    })
    expect(composeYaml).toContain('POSTGRES_PASSWORD: sekret')
  })

  it('renders rocketmq with an explicit start command and the namesrv port', () => {
    const { composeYaml } = generateDevopsSandbox([preset('rocketmq', 62000)])
    expect(composeYaml).toContain('  rocketmq:\n    image: apache/rocketmq')
    expect(composeYaml).toContain('    command: sh mqnamesrv')
    expect(composeYaml).toContain('- "62000:9876"')
    expect(composeYaml).toContain('- ./data/rocketmq:/home/rocketmq/store')
  })

  it('advertises kafka on the workspace host port so host clients can connect', () => {
    const { composeYaml } = generateDevopsSandbox([preset('kafka', 62100)])
    expect(composeYaml).toContain('  kafka:\n    image: apache/kafka')
    expect(composeYaml).toContain('- "62100:9092"')
    expect(composeYaml).toContain('KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:62100')
  })

  it('renders elasticsearch and nacos with their single-node env', () => {
    const { composeYaml } = generateDevopsSandbox([
      preset('elasticsearch', 62200),
      preset('nacos', 62300)
    ])
    expect(composeYaml).toContain('discovery.type: single-node')
    expect(composeYaml).toContain('- "62200:9200"')
    expect(composeYaml).toContain('MODE: standalone')
    expect(composeYaml).toContain('- "62300:8848"')
  })

  it('renders a custom service from its own image/port, keyed by name, with no env or volume', () => {
    const custom: StructuredWorkspaceService = {
      name: 'my-kafka',
      kind: null,
      image: 'bitnami/kafka:3.7',
      containerPort: 9092,
      hostPort: 62400
    }
    const { composeYaml } = generateDevopsSandbox([custom])
    expect(composeYaml).toContain('  my-kafka:\n    image: bitnami/kafka:3.7')
    expect(composeYaml).toContain('- "62400:9092"')
    expect(composeYaml).not.toContain('environment:')
    expect(composeYaml).not.toContain('volumes:')
  })

  it('renders a custom service command when supplied', () => {
    const custom: StructuredWorkspaceService = {
      name: 'worker',
      kind: null,
      image: 'busybox',
      containerPort: 8080,
      command: 'sh -c "sleep infinity"',
      hostPort: 62500
    }
    const { composeYaml } = generateDevopsSandbox([custom])
    expect(composeYaml).toContain('    command: sh -c "sleep infinity"')
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

  it('sanitizes a custom service name into an env prefix', () => {
    const custom: StructuredWorkspaceService = {
      name: 'my-kafka',
      kind: null,
      image: 'bitnami/kafka:3.7',
      containerPort: 9092,
      hostPort: 62400
    }
    const { envFile } = generateDevopsSandbox([custom])
    expect(envFile).toContain('MY_KAFKA_HOST=127.0.0.1')
    expect(envFile).toContain('MY_KAFKA_PORT=62400')
  })
})

describe('containerPortFor', () => {
  it('maps each service kind to its container port', () => {
    expect(containerPortFor('mysql')).toBe(3306)
    expect(containerPortFor('redis')).toBe(6379)
    expect(containerPortFor('postgres')).toBe(5432)
    expect(containerPortFor('mongo')).toBe(27017)
    expect(containerPortFor('rocketmq')).toBe(9876)
    expect(containerPortFor('kafka')).toBe(9092)
    expect(containerPortFor('elasticsearch')).toBe(9200)
    expect(containerPortFor('nacos')).toBe(8848)
  })
})
