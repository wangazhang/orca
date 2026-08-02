// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useSandboxServiceSelection,
  type SandboxServiceSelection
} from './useSandboxServiceSelection'

const { callRuntimeRpcMock } = vi.hoisted(() => ({ callRuntimeRpcMock: vi.fn() }))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: callRuntimeRpcMock
}))
vi.mock('@/hooks/useMountedRef', () => ({
  useMountedRef: () => ({ current: true })
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const TARGET = { kind: 'local' as const }

let latest: SandboxServiceSelection | null = null
const roots: Root[] = []

function HookProbe(): null {
  latest = useSandboxServiceSelection({ target: TARGET })
  return null
}

async function render(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<HookProbe />)
  })
}

function state(): SandboxServiceSelection {
  if (!latest) {
    throw new Error('hook not rendered')
  }
  return latest
}

beforeEach(() => {
  callRuntimeRpcMock.mockReset().mockResolvedValue({ detected: [] })
  latest = null
})

afterEach(async () => {
  await act(async () => {
    roots.splice(0).forEach((root) => root.unmount())
  })
  document.body.innerHTML = ''
})

describe('useSandboxServiceSelection', () => {
  it('toggles preset services and serializes them to specs', async () => {
    await render()
    await act(async () => state().toggleService('mysql'))
    await act(async () => state().toggleService('redis'))
    expect(state().presetServices.has('mysql')).toBe(true)
    expect(state().selectedCount).toBe(2)
    expect(state().toSpecs()).toEqual([
      { name: 'mysql', kind: 'mysql' },
      { name: 'redis', kind: 'redis' }
    ])
  })

  it('adds and removes custom middleware', async () => {
    await render()
    let error: string | null = 'unset'
    await act(async () => {
      error = state().addCustom({
        name: 'kafka2',
        image: 'apache/kafka:3.8.0',
        containerPort: 9092
      })
    })
    expect(error).toBeNull()
    expect(state().customServices).toHaveLength(1)
    expect(state().toSpecs()).toEqual([
      {
        name: 'kafka2',
        kind: null,
        image: 'apache/kafka:3.8.0',
        containerPort: 9092,
        command: undefined
      }
    ])
    await act(async () => state().removeCustom('kafka2'))
    expect(state().customServices).toHaveLength(0)
  })

  it('rejects invalid custom middleware (preset name, missing image, duplicate)', async () => {
    await render()
    let err: string | null = null
    await act(async () => {
      err = state().addCustom({ name: 'mysql', image: 'x', containerPort: 1 })
    })
    expect(err).not.toBeNull()
    await act(async () => {
      err = state().addCustom({ name: 'ok', image: '', containerPort: 1 })
    })
    expect(err).not.toBeNull()
    // First valid add, then a duplicate.
    await act(async () => state().addCustom({ name: 'dup', image: 'img', containerPort: 1 }))
    await act(async () => {
      err = state().addCustom({ name: 'dup', image: 'img', containerPort: 1 })
    })
    expect(err).not.toBeNull()
    expect(state().customServices).toHaveLength(1)
  })

  it('merges detected middleware but never re-adds a dismissed kind', async () => {
    callRuntimeRpcMock.mockResolvedValue({
      detected: [
        { kind: 'mysql', evidence: [{ path: '/a', file: 'pom.xml', signal: 'jdbc:mysql' }] }
      ]
    })
    await render()

    await act(async () => state().runDetect(['/a']))
    await act(async () => {})
    expect(state().presetServices.has('mysql')).toBe(true)
    expect(state().evidenceByKind.mysql?.[0].signal).toBe('jdbc:mysql')

    // User unchecks it → dismissed; a second detect must not re-add it.
    await act(async () => state().toggleService('mysql'))
    expect(state().presetServices.has('mysql')).toBe(false)
    await act(async () => state().runDetect(['/a']))
    await act(async () => {})
    expect(state().presetServices.has('mysql')).toBe(false)
  })

  it('seeds presets and custom services from disk specs', async () => {
    await render()
    await act(async () => {
      state().seed([
        { name: 'redis', kind: 'redis' },
        { name: 'my-kafka', kind: null, image: 'apache/kafka:3.8.0', containerPort: 9092 }
      ])
    })
    expect(state().presetServices.has('redis')).toBe(true)
    expect(state().customServices).toEqual([
      { name: 'my-kafka', image: 'apache/kafka:3.8.0', containerPort: 9092, command: undefined }
    ])
  })
})
