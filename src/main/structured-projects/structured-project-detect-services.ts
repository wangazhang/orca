// Infers which built-in sandbox middleware a repo needs by fingerprinting its
// config files (build manifests, Spring config, docker-compose, .env). Read-only
// and bounded — real repos are monorepos (backend/<svc>/pom.xml,
// devops/docker-compose.yml, .../src/main/resources/application.yml), so a
// root-only scan finds nothing; this walks a capped depth while pruning heavy
// dirs. The UI uses the result to PRE-CHECK services; the user keeps final say.
import { readFile, readdir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import {
  STRUCTURED_SERVICE_KINDS,
  type DetectedService,
  type ServiceDetectionEvidence,
  type StructuredServiceKind
} from '../../shared/structured-project-schema'

// Cap per-file reads so scanning never pulls a huge manifest into memory.
const MAX_CONFIG_FILE_BYTES = 512 * 1024

// At most this many evidence rows per kind — enough to justify the pre-check
// without flooding the UI when many files reference the same middleware.
const MAX_EVIDENCE_PER_KIND = 3

// Deep enough to reach Spring's <repo>/backend/<svc>/src/main/resources/*.yml.
const MAX_SCAN_DEPTH = 6

// Bounds worst-case work on a large monorepo.
const MAX_FILES_PER_REPO = 400

// Build outputs, dependency caches and nested worktree copies hold no first-party
// config and would dominate the walk.
const SKIP_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.gradle',
  '.mvn',
  '.next',
  '.nuxt',
  '.venv',
  '__pycache__',
  'node_modules',
  'target',
  'build',
  'dist',
  'out',
  'bin',
  'obj',
  'vendor',
  'venv',
  'coverage',
  'logs',
  'tmp',
  'worktrees'
])

// Config files worth fingerprinting, matched by file name at any scanned depth.
const CONFIG_FILE_PATTERNS: RegExp[] = [
  /^pom\.xml$/i,
  /^build\.gradle(\.kts)?$/i,
  /^package\.json$/i,
  /^requirements[^/]*\.txt$/i,
  /^pyproject\.toml$/i,
  /^go\.mod$/i,
  /^Gemfile$/i,
  // application.yml, application-local.yml, bootstrap.yml, *.properties …
  /^(application|bootstrap)[^/]*\.(ya?ml|properties)$/i,
  // docker-compose.yml, compose.yaml, docker-compose.dev.yml …
  /^(docker-)?compose[^/]*\.ya?ml$/i,
  /^\.env(\..+)?$/i
]

// Ordered specific → generic; the first match becomes the evidence snippet.
// Word-boundary regexes (not raw substrings) so `<artifactId>postgresql</…>` and
// `image: postgres:16-alpine` both match while unrelated prose does not.
const DETECTION_SIGNALS: Record<StructuredServiceKind, RegExp[]> = {
  mysql: [
    /jdbc:mysql/i,
    /r2dbc:mysql/i,
    /\bmysql-connector[\w-]*\b/i,
    /\bpymysql\b/i,
    /\bmysql\b/i
  ],
  redis: [/redis:\/\//i, /\bspring-boot-starter-data-redis\b/i, /\bioredis\b/i, /\bredis\b/i],
  postgres: [
    /jdbc:postgresql/i,
    /r2dbc:postgresql/i,
    /postgres:\/\//i,
    /\bpsycopg2?\b/i,
    /\bpostgres(ql)?\b/i
  ],
  mongo: [/mongodb(\+srv)?:\/\//i, /\bmongoose\b/i, /\bpymongo\b/i, /\bmongo(db)?\b/i],
  rocketmq: [/\brocketmq-spring-boot-starter\b/i, /\brocketmq-client\b/i, /\brocketmq\b/i],
  kafka: [
    /\bspring-kafka\b/i,
    /\bkafka-clients\b/i,
    /\bkafkajs\b/i,
    /\bkafka-python\b/i,
    /\bkafka\b/i
  ],
  elasticsearch: [
    /\bspring-boot-starter-data-elasticsearch\b/i,
    /@elastic\/elasticsearch/i,
    /\belasticsearch\b/i
  ],
  nacos: [/\bspring-cloud-starter-alibaba-nacos[\w-]*\b/i, /\bnacos-client\b/i, /\bnacos\b/i]
}

function isConfigFile(name: string): boolean {
  return CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(name))
}

// Collect config-file paths (repo-relative) via a depth- and count-bounded walk.
async function collectConfigFiles(repoRoot: string): Promise<string[]> {
  const found: string[] = []
  // Breadth-first so shallow, more meaningful config wins the file budget.
  let frontier: { abs: string; rel: string; depth: number }[] = [
    { abs: repoRoot, rel: '', depth: 0 }
  ]
  while (frontier.length > 0 && found.length < MAX_FILES_PER_REPO) {
    const next: typeof frontier = []
    for (const dir of frontier) {
      let entries: Dirent[]
      try {
        entries = await readdir(dir.abs, { withFileTypes: true, encoding: 'utf8' })
      } catch {
        continue
      }
      for (const entry of entries) {
        const rel = dir.rel ? `${dir.rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          if (dir.depth + 1 <= MAX_SCAN_DEPTH && !SKIP_DIRS.has(entry.name)) {
            next.push({ abs: join(dir.abs, entry.name), rel, depth: dir.depth + 1 })
          }
        } else if (entry.isFile() && isConfigFile(entry.name)) {
          found.push(rel)
          if (found.length >= MAX_FILES_PER_REPO) {
            return found
          }
        }
      }
    }
    frontier = next
  }
  return found
}

// Read a config file as text, skipping oversized / unreadable ones.
async function readConfigFile(repoRoot: string, relative: string): Promise<string | null> {
  const full = join(repoRoot, relative)
  try {
    const info = await stat(full)
    if (!info.isFile() || info.size > MAX_CONFIG_FILE_BYTES) {
      return null
    }
    return await readFile(full, 'utf8')
  } catch {
    return null
  }
}

// Scan one repo path, returning the single most convincing evidence per kind.
// One row per repo (not per file) so the merged list names distinct repos rather
// than three .env variants of the same one; "most convincing" = the earliest
// (most specific) pattern in that kind's ordered signal list.
async function detectInPath(
  repoPath: string
): Promise<Map<StructuredServiceKind, ServiceDetectionEvidence>> {
  const best = new Map<
    StructuredServiceKind,
    { rank: number; evidence: ServiceDetectionEvidence }
  >()
  const files = await collectConfigFiles(repoPath)
  for (const relative of files) {
    const content = await readConfigFile(repoPath, relative)
    if (!content) {
      continue
    }
    for (const kind of STRUCTURED_SERVICE_KINDS) {
      const patterns = DETECTION_SIGNALS[kind]
      const current = best.get(kind)
      // Already holding the most specific possible match for this kind.
      if (current?.rank === 0) {
        continue
      }
      for (let rank = 0; rank < patterns.length; rank++) {
        if (current && rank >= current.rank) {
          break
        }
        const hit = patterns[rank].exec(content)
        if (hit) {
          best.set(kind, { rank, evidence: { path: repoPath, file: relative, signal: hit[0] } })
          break
        }
      }
    }
  }
  return new Map([...best].map(([kind, entry]) => [kind, entry.evidence]))
}

// Scan every repo path (in parallel) and merge into one ordered detection list.
export async function detectServicesInPaths(paths: string[]): Promise<DetectedService[]> {
  const perPath = await Promise.all(paths.map((path) => detectInPath(path)))

  const merged = new Map<StructuredServiceKind, ServiceDetectionEvidence[]>()
  for (const result of perPath) {
    for (const [kind, evidence] of result) {
      const acc = merged.get(kind) ?? []
      acc.push(evidence)
      merged.set(kind, acc)
    }
  }

  // Canonical kind order keeps the UI stable regardless of scan/merge order.
  return STRUCTURED_SERVICE_KINDS.filter((kind) => merged.has(kind)).map((kind) => ({
    kind,
    evidence: (merged.get(kind) ?? []).slice(0, MAX_EVIDENCE_PER_KIND)
  }))
}
