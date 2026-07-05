// Allocates an isolated host port per sandbox service so parallel workspaces
// (youho, youho2, ...) never collide on database ports. Orca has a port
// *scanner* (observes what is listening) but no *allocator*; this fills that gap.
// selectPorts is a pure avoidance loop (unit-testable); assignServicePorts adds
// an optional live listen() probe on top for real allocation.
import { createServer } from 'node:net'
import type {
  StructuredServiceKind,
  StructuredWorkspaceService
} from '../../shared/structured-project-schema'

// Above the well-known/registered range and typical dev-server ports, below the
// ephemeral range OSes hand out for outbound sockets — a calm band to park
// long-lived sandbox containers.
export const DEFAULT_PORT_RANGE_START = 20000
export const DEFAULT_PORT_RANGE_END = 45000
const BIND_HOST = '127.0.0.1'

// Pure: walk the range and pick `count` ports the reservation predicate allows.
// Throws if the range cannot satisfy the request rather than returning a short
// list, so callers never silently under-provision a sandbox.
export function selectPorts(params: {
  count: number
  rangeStart?: number
  rangeEnd?: number
  isReserved?: (port: number) => boolean
}): number[] {
  const { count } = params
  const rangeStart = params.rangeStart ?? DEFAULT_PORT_RANGE_START
  const rangeEnd = params.rangeEnd ?? DEFAULT_PORT_RANGE_END
  const isReserved = params.isReserved ?? (() => false)
  const ports: number[] = []
  for (let port = rangeStart; port <= rangeEnd && ports.length < count; port++) {
    if (!isReserved(port)) {
      ports.push(port)
    }
  }
  if (ports.length < count) {
    throw new Error(
      `Cannot allocate ${count} ports in range ${rangeStart}-${rangeEnd}: only ${ports.length} available`
    )
  }
  return ports
}

// Live check: bind-test a single port. A successful listen()+close means the
// port is free for a container to publish on.
export function isPortAvailable(port: number, host: string = BIND_HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, host)
  })
}

// Assigns one host port per service, skipping ports in `reserved` and — when
// `probe` is on (default) — any port a live listen() shows as busy. Returns the
// workspace.json services shape directly.
export async function assignServicePorts(
  services: readonly StructuredServiceKind[],
  options?: {
    reserved?: Iterable<number>
    rangeStart?: number
    rangeEnd?: number
    probe?: boolean
  }
): Promise<StructuredWorkspaceService[]> {
  const rangeStart = options?.rangeStart ?? DEFAULT_PORT_RANGE_START
  const rangeEnd = options?.rangeEnd ?? DEFAULT_PORT_RANGE_END
  const probe = options?.probe ?? true
  const used = new Set<number>(options?.reserved ?? [])
  const assigned: StructuredWorkspaceService[] = []

  let cursor = rangeStart
  for (const kind of services) {
    let chosen = -1
    for (; cursor <= rangeEnd; cursor++) {
      if (used.has(cursor)) {
        continue
      }
      if (probe && !(await isPortAvailable(cursor))) {
        used.add(cursor)
        continue
      }
      chosen = cursor
      used.add(cursor)
      cursor++
      break
    }
    if (chosen < 0) {
      throw new Error(
        `Cannot allocate a host port for "${kind}" in range ${rangeStart}-${rangeEnd}`
      )
    }
    assigned.push({ kind, hostPort: chosen })
  }
  return assigned
}
