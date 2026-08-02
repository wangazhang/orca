import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectServicesInPaths } from './structured-project-detect-services'

const tempDirs: string[] = []

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'detect-svc-'))
  tempDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('detectServicesInPaths', () => {
  it('detects mysql + redis from a Spring pom + application.yml', async () => {
    const repo = await makeRepo({
      'pom.xml': '<dependency><artifactId>mysql-connector-j</artifactId></dependency>',
      'src/main/resources/application.yml':
        'spring:\n  datasource:\n    url: jdbc:mysql://db/app\n  data:\n    redis:\n      url: redis://cache:6379'
    })
    const detected = await detectServicesInPaths([repo])
    const kinds = detected.map((d) => d.kind)
    expect(kinds).toContain('mysql')
    expect(kinds).toContain('redis')
    const mysql = detected.find((d) => d.kind === 'mysql')
    expect(mysql?.evidence[0].signal.toLowerCase()).toContain('mysql')
    expect(mysql?.evidence[0].path).toBe(repo)
  })

  it('detects kafka, elasticsearch and nacos from a package.json and docker-compose', async () => {
    const repo = await makeRepo({
      'package.json': JSON.stringify({
        dependencies: { kafkajs: '^2.0.0', '@elastic/elasticsearch': '^8.0.0' }
      }),
      'docker-compose.yml': 'services:\n  registry:\n    image: nacos/nacos-server:v2.4.3'
    })
    const detected = (await detectServicesInPaths([repo])).map((d) => d.kind)
    expect(detected).toContain('kafka')
    expect(detected).toContain('elasticsearch')
    expect(detected).toContain('nacos')
  })

  it('merges evidence across multiple repos and returns kinds in canonical order', async () => {
    const a = await makeRepo({ 'requirements.txt': 'psycopg2-binary==2.9' })
    const b = await makeRepo({
      'go.mod': 'require github.com/redis/go-redis/v9 v9.0.0\n// redis://'
    })
    const detected = await detectServicesInPaths([a, b])
    const kinds = detected.map((d) => d.kind)
    // redis precedes postgres in STRUCTURED_SERVICE_KINDS order.
    expect(kinds).toEqual(['redis', 'postgres'])
  })

  it('finds config nested in a monorepo, not just at the repo root', async () => {
    // Regression: real repos keep manifests under backend/<svc>/ and compose under
    // devops/, so a root-only scan detected nothing at all.
    const repo = await makeRepo({
      'AGENTS.md': '# monorepo',
      'devops/docker-compose.yml':
        'services:\n  db:\n    image: postgres:16-alpine\n  cache:\n    image: redis:7-alpine',
      'backend/mrs-server/pom.xml':
        '<dependency><artifactId>spring-boot-starter-data-redis</artifactId></dependency>',
      'backend/mrs-server/src/main/resources/application-local.yml':
        'spring:\n  datasource:\n    url: jdbc:postgresql://localhost:5432/app'
    })
    const detected = await detectServicesInPaths([repo])
    const kinds = detected.map((d) => d.kind)
    expect(kinds).toContain('redis')
    expect(kinds).toContain('postgres')
    // Prefers the most specific signal over a generic image-name hit.
    expect(detected.find((d) => d.kind === 'postgres')?.evidence[0].signal).toBe('jdbc:postgresql')
    expect(detected.find((d) => d.kind === 'redis')?.evidence[0].signal).toBe(
      'spring-boot-starter-data-redis'
    )
  })

  it('reports one evidence row per repo so several repos are represented', async () => {
    const a = await makeRepo({
      'backend/svc/pom.xml': '<artifactId>mysql-connector-j</artifactId>'
    })
    const b = await makeRepo({ 'api/pom.xml': '<artifactId>mysql-connector-j</artifactId>' })
    const detected = await detectServicesInPaths([a, b])
    const mysql = detected.find((d) => d.kind === 'mysql')
    expect(mysql?.evidence).toHaveLength(2)
    expect(new Set(mysql?.evidence.map((e) => e.path)).size).toBe(2)
  })

  it('skips build output and nested worktree copies', async () => {
    const repo = await makeRepo({
      'target/classes/application.yml': 'url: jdbc:mysql://stale/app',
      'node_modules/pkg/package.json': JSON.stringify({ dependencies: { kafkajs: '^2' } }),
      'worktrees/old/pom.xml': '<artifactId>rocketmq-client</artifactId>'
    })
    expect(await detectServicesInPaths([repo])).toEqual([])
  })

  it('returns nothing for a repo with no recognizable config', async () => {
    const repo = await makeRepo({ 'README.md': '# just docs' })
    expect(await detectServicesInPaths([repo])).toEqual([])
  })

  it('ignores missing paths without throwing', async () => {
    expect(await detectServicesInPaths(['/no/such/path/here'])).toEqual([])
  })
})
