import { describe, expect, it } from 'vitest'
import { assignServicePorts, isPortAvailable, selectPorts } from './port-allocation'
import type {
  StructuredServiceKind,
  StructuredServiceSpec
} from '../../shared/structured-project-schema'

// Preset spec: name === kind, image/port resolved from the built-in table.
function preset(kind: StructuredServiceKind): StructuredServiceSpec {
  return { name: kind, kind }
}

describe('selectPorts', () => {
  it('picks the requested count of consecutive free ports from the range start', () => {
    expect(selectPorts({ count: 3, rangeStart: 20000, rangeEnd: 20010 })).toEqual([
      20000, 20001, 20002
    ])
  })

  it('skips reserved ports', () => {
    const reserved = new Set([20000, 20001, 20003])
    const ports = selectPorts({
      count: 2,
      rangeStart: 20000,
      rangeEnd: 20010,
      isReserved: (p) => reserved.has(p)
    })
    expect(ports).toEqual([20002, 20004])
  })

  it('throws when the range cannot satisfy the count', () => {
    expect(() => selectPorts({ count: 5, rangeStart: 20000, rangeEnd: 20002 })).toThrow(
      /Cannot allocate/
    )
  })
})

describe('assignServicePorts', () => {
  it('assigns a distinct port per service, skipping reserved (probe off)', async () => {
    const assigned = await assignServicePorts(
      [preset('mysql'), preset('redis'), preset('postgres'), preset('mongo')],
      {
        reserved: [20000, 20002],
        rangeStart: 20000,
        rangeEnd: 20010,
        probe: false
      }
    )
    expect(assigned).toEqual([
      { name: 'mysql', kind: 'mysql', hostPort: 20001 },
      { name: 'redis', kind: 'redis', hostPort: 20003 },
      { name: 'postgres', kind: 'postgres', hostPort: 20004 },
      { name: 'mongo', kind: 'mongo', hostPort: 20005 }
    ])
  })

  it('produces no duplicate ports across services', async () => {
    const assigned = await assignServicePorts(
      [preset('mysql'), preset('redis'), preset('postgres'), preset('mongo')],
      {
        rangeStart: 30000,
        rangeEnd: 30050,
        probe: false
      }
    )
    const ports = assigned.map((a) => a.hostPort)
    expect(new Set(ports).size).toBe(ports.length)
  })

  it('carries a custom service spec through to the allocated entry', async () => {
    const custom: StructuredServiceSpec = {
      name: 'my-kafka',
      kind: null,
      image: 'bitnami/kafka:3.7',
      containerPort: 9092
    }
    const assigned = await assignServicePorts([custom], {
      rangeStart: 40000,
      rangeEnd: 40010,
      probe: false
    })
    expect(assigned).toEqual([{ ...custom, hostPort: 40000 }])
  })

  it('throws when it runs out of ports for a service', async () => {
    await expect(
      assignServicePorts([preset('mysql'), preset('redis')], {
        rangeStart: 20000,
        rangeEnd: 20000,
        probe: false
      })
    ).rejects.toThrow(/Cannot allocate a host port/)
  })
})

describe('isPortAvailable', () => {
  it('reports a bound port as unavailable and a free one as available', async () => {
    // Bind a real ephemeral port, then confirm the probe sees it as busy.
    const { createServer } = await import('node:net')
    const server = createServer()
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        resolve(typeof addr === 'object' && addr ? addr.port : 0)
      })
    })
    expect(await isPortAvailable(port)).toBe(false)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(await isPortAvailable(port)).toBe(true)
  })
})
