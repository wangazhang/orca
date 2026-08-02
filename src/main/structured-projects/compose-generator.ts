// Generates the devops sandbox for a workspace: a docker-compose.yaml wiring one
// container per requested service and a .env of connection variables pointing at
// the workspace's isolated host ports. Pure string rendering — no Docker library,
// no filesystem — so it is fully unit-testable and the caller decides where to
// write. New capability: Orca had no container orchestration before this.
import type {
  StructuredServiceKind,
  StructuredWorkspaceService
} from '../../shared/structured-project-schema'

// Default credential for generated dev sandboxes. These are local-only,
// disposable databases, never production — the value is intentionally fixed so
// the generated .env is self-consistent.
const DEFAULT_DB_PASSWORD = 'orca'
const DEFAULT_DB_NAME = 'app'
const BIND_HOST = '127.0.0.1'

type ServiceEnvContext = {
  password: string
  // The workspace's allocated host port, so images that must advertise a
  // reachable address (e.g. Kafka) can point clients at the right port.
  hostPort: number
}

type ServiceDefinition = {
  image: string
  containerPort: number
  volumeMount: string
  environment: (ctx: ServiceEnvContext) => Record<string, string>
  // Some images (e.g. RocketMQ) don't run a useful default entrypoint and need
  // an explicit start command. Omitted for images that self-start.
  command?: string
}

const SERVICE_DEFINITIONS: Record<StructuredServiceKind, ServiceDefinition> = {
  mysql: {
    image: 'mysql:8',
    containerPort: 3306,
    volumeMount: '/var/lib/mysql',
    environment: ({ password }) => ({
      MYSQL_ROOT_PASSWORD: password,
      MYSQL_DATABASE: DEFAULT_DB_NAME
    })
  },
  redis: {
    image: 'redis:7',
    containerPort: 6379,
    volumeMount: '/data',
    environment: () => ({})
  },
  postgres: {
    image: 'postgres:16',
    containerPort: 5432,
    volumeMount: '/var/lib/postgresql/data',
    environment: ({ password }) => ({ POSTGRES_PASSWORD: password, POSTGRES_DB: DEFAULT_DB_NAME })
  },
  mongo: {
    image: 'mongo:7',
    containerPort: 27017,
    volumeMount: '/data/db',
    environment: ({ password }) => ({
      MONGO_INITDB_ROOT_USERNAME: 'root',
      MONGO_INITDB_ROOT_PASSWORD: password
    })
  },
  // RocketMQ's image has no useful default entrypoint — start the name server
  // explicitly. The sandbox exposes the namesrv port (9876); a broker can be
  // added later if the single-port workspace service model grows to multi-port.
  rocketmq: {
    image: 'apache/rocketmq:5.3.1',
    containerPort: 9876,
    volumeMount: '/home/rocketmq/store',
    environment: () => ({}),
    command: 'sh mqnamesrv'
  },
  // Single-node KRaft (broker + controller in one container). Advertise the
  // workspace's mapped host port so clients on the host can reach the broker.
  kafka: {
    image: 'apache/kafka:3.8.0',
    containerPort: 9092,
    volumeMount: '/var/lib/kafka/data',
    environment: ({ hostPort }) => ({
      KAFKA_NODE_ID: '1',
      KAFKA_PROCESS_ROLES: 'broker,controller',
      KAFKA_LISTENERS: 'PLAINTEXT://:9092,CONTROLLER://:9093',
      KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://localhost:${hostPort}`,
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@localhost:9093',
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0'
    })
  },
  // Single-node dev cluster with security off — this is a disposable local
  // sandbox, never production.
  elasticsearch: {
    image: 'elasticsearch:8.15.0',
    containerPort: 9200,
    volumeMount: '/usr/share/elasticsearch/data',
    environment: () => ({
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m'
    })
  },
  nacos: {
    image: 'nacos/nacos-server:v2.4.3',
    containerPort: 8848,
    volumeMount: '/home/nacos/data',
    environment: () => ({ MODE: 'standalone' })
  }
}

export type DevopsSandbox = {
  composeYaml: string
  envFile: string
}

function renderService(service: StructuredWorkspaceService, password: string): string {
  // Presets resolve image/port/command/env from the built-in table; a custom
  // service (kind=null) supplies its own image/port inline and has no env table.
  const def = service.kind ? SERVICE_DEFINITIONS[service.kind] : null
  const image = service.image ?? def?.image
  const containerPort = service.containerPort ?? def?.containerPort
  if (!image || containerPort === undefined) {
    throw new Error(`Service "${service.name}" is missing an image or container port`)
  }
  const command = service.command ?? def?.command
  const lines = [`  ${service.name}:`, `    image: ${image}`]
  if (command) {
    lines.push(`    command: ${command}`)
  }
  lines.push(
    '    restart: unless-stopped',
    '    ports:',
    `      - "${service.hostPort}:${containerPort}"`
  )
  const env = def ? def.environment({ password, hostPort: service.hostPort }) : {}
  const envEntries = Object.entries(env)
  if (envEntries.length > 0) {
    lines.push('    environment:')
    for (const [key, value] of envEntries) {
      lines.push(`      ${key}: ${value}`)
    }
  }
  // Presets bind-mount a data dir for persistence, keyed by the service name so
  // custom and preset services never share a directory. Custom services have no
  // known data path, so they run without a volume.
  if (def) {
    lines.push('    volumes:', `      - ./data/${service.name}:${def.volumeMount}`)
  }
  return lines.join('\n')
}

function renderCompose(services: StructuredWorkspaceService[], password: string): string {
  const blocks = services.map((service) => renderService(service, password))
  return `services:\n${blocks.join('\n')}\n`
}

// Env-var prefix from the service name: uppercase, non-alphanumerics to '_', so a
// custom name like "my-kafka" yields MY_KAFKA_HOST / MY_KAFKA_PORT.
function envPrefixFor(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

function renderEnv(services: StructuredWorkspaceService[]): string {
  const header = "# Generated by Orca: environment variables for this workspace's isolated sandbox"
  const lines = [header]
  for (const service of services) {
    const prefix = envPrefixFor(service.name)
    lines.push(`${prefix}_HOST=${BIND_HOST}`, `${prefix}_PORT=${service.hostPort}`)
  }
  return `${lines.join('\n')}\n`
}

export function generateDevopsSandbox(
  services: StructuredWorkspaceService[],
  options?: { password?: string }
): DevopsSandbox {
  const password = options?.password ?? DEFAULT_DB_PASSWORD
  return {
    composeYaml: renderCompose(services, password),
    envFile: renderEnv(services)
  }
}

// Container-internal ports, exposed so the scaffolder / tests can reason about
// the mapping without reaching into the private definition table.
export function containerPortFor(kind: StructuredServiceKind): number {
  return SERVICE_DEFINITIONS[kind].containerPort
}
