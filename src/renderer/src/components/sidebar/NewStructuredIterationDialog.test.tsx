// @vitest-environment happy-dom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mocks so the vi.mock factories can reference them.
const {
  callRuntimeRpcMock,
  closeModalMock,
  toastSuccessMock,
  pickDirectoryMock,
  fetchReposMock,
  fetchGroupsMock,
  fetchFolderWorkspacesMock,
  fetchWorktreesMock
} = vi.hoisted(() => ({
  callRuntimeRpcMock: vi.fn(),
  closeModalMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  pickDirectoryMock: vi.fn(),
  fetchReposMock: vi.fn(),
  fetchGroupsMock: vi.fn(),
  fetchFolderWorkspacesMock: vi.fn(),
  fetchWorktreesMock: vi.fn()
}))

// Mutable so tests can drive the open edge (none → structured-iteration) with
// modalData, which is how the wizard seeds its mid-flow re-entry state.
const storeState = {
  activeModal: 'structured-iteration' as string,
  modalData: {} as Record<string, unknown>,
  closeModal: closeModalMock,
  settings: null as unknown,
  fetchReposForAllHosts: fetchReposMock,
  fetchProjectGroupsForAllHosts: fetchGroupsMock,
  fetchFolderWorkspacesForAllHosts: fetchFolderWorkspacesMock,
  fetchAllWorktrees: fetchWorktreesMock
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState)
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: callRuntimeRpcMock,
  getActiveRuntimeTarget: () => ({ kind: 'local' as const })
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
// Mock the radix-backed primitives to plain passthroughs so the wizard logic can
// be tested in happy-dom without portal/focus-trap machinery.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange
  }: {
    checked: boolean
    onCheckedChange: (value: boolean) => void
  }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    />
  )
}))

import NewStructuredIterationDialog from './NewStructuredIterationDialog'

let container: HTMLDivElement
let root: Root
// Captures the wizard's native-file-drop subscription so tests can simulate a
// preload-relayed folder drop on the repos step.
let lastFileDropCallback: ((data: unknown) => void) | null = null

beforeEach(() => {
  callRuntimeRpcMock.mockReset()
  closeModalMock.mockReset()
  toastSuccessMock.mockReset()
  pickDirectoryMock.mockReset()
  fetchReposMock.mockReset().mockResolvedValue(undefined)
  fetchGroupsMock.mockReset().mockResolvedValue(undefined)
  fetchFolderWorkspacesMock.mockReset().mockResolvedValue(undefined)
  fetchWorktreesMock.mockReset().mockResolvedValue(undefined)
  callRuntimeRpcMock.mockImplementation((_target: unknown, method: string, params: unknown) => {
    if (method === 'iteration.create') {
      return Promise.resolve({ project: { name: 'Demo' } })
    }
    if (method === 'iteration.workspaceCreate') {
      return Promise.resolve({ workspace: {} })
    }
    if (method === 'iteration.checkGitRepo') {
      const path = (params as { path?: string })?.path ?? ''
      return Promise.resolve({ isGitRepo: true, repoName: path.split('/').pop() || 'repo' })
    }
    if (method === 'iteration.workspaceAddRepo') {
      return Promise.resolve({ worktree: { repoId: 'repo' } })
    }
    return Promise.resolve({})
  })
  lastFileDropCallback = null
  ;(window as unknown as { api: unknown }).api = {
    repos: { pickDirectory: pickDirectoryMock },
    ui: {
      onFileDrop: (cb: (data: unknown) => void) => {
        lastFileDropCallback = cb
        return () => {
          lastFileDropCallback = null
        }
      }
    }
  }
  storeState.activeModal = 'structured-iteration'
  storeState.modalData = {}
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  document.body.innerHTML = ''
})

async function render(): Promise<void> {
  await act(async () => {
    root.render(<NewStructuredIterationDialog />)
  })
}

// The wizard is gate-mounted while open, so it seeds its entry state from
// modalData in the lazy initializers on mount — set the data, then render fresh.
async function openWith(data: Record<string, unknown>): Promise<void> {
  storeState.modalData = data
  await render()
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((entry) =>
    entry.textContent?.includes(label)
  )
  if (!found) {
    throw new Error(`Button not found: ${label}`)
  }
  return found
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function methodCalls(method: string): unknown[][] {
  return callRuntimeRpcMock.mock.calls.filter((c) => c[1] === method)
}

// Simulate a preload-relayed native folder drop on the repos step's drop target.
async function dropFolder(path: string): Promise<void> {
  await act(async () => {
    lastFileDropCallback?.({ target: 'iteration-repos', paths: [path] })
  })
}

describe('NewStructuredIterationDialog', () => {
  it('drives create → workspaceCreate → workspaceAddRepo → materialize across the three steps', async () => {
    await render()

    // Step 1 — project name + one sandbox service → iteration.create
    const nameInput = container.querySelector<HTMLInputElement>('#structured-iteration-name')
    expect(nameInput).not.toBeNull()
    await setInputValue(nameInput as HTMLInputElement, 'Demo')
    await click(
      container.querySelector<HTMLButtonElement>('button[role="checkbox"]') as HTMLElement
    )
    await click(button('Create & add workspace'))

    const createCall = methodCalls('iteration.create')[0]
    expect(createCall).toBeTruthy()
    expect(createCall[0]).toEqual({ kind: 'local' })
    const createArgs = createCall[2] as { name: string; services: string[] }
    expect(createArgs.name).toBe('Demo')
    expect(createArgs.services.length).toBe(1)

    // Step 2 — workspace name → iteration.workspaceCreate
    const wsInput = container.querySelector<HTMLInputElement>('#structured-workspace-name')
    expect(wsInput).not.toBeNull()
    await setInputValue(wsInput as HTMLInputElement, 'it1')
    await click(button('Create workspace'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceCreate',
      {
        project: 'Demo',
        name: 'it1'
      }
    )

    // Step 3 — pick a local folder → git-detect + queue as pending, NOT mounted yet
    pickDirectoryMock.mockResolvedValue('/src/qa-pk')
    await click(button('Choose a local Git folder'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.checkGitRepo', {
      path: '/src/qa-pk'
    })
    // Deferred: the mount does not happen on pick.
    expect(methodCalls('iteration.workspaceAddRepo').length).toBe(0)
    expect(container.textContent).toContain('qa-pk')

    // Finish — the queued repo mounts on Done, then materialize + refresh + close
    await click(button('Done'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceAddRepo',
      { project: 'Demo', workspace: 'it1', source: '/src/qa-pk' }
    )
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.materialize', {
      project: 'Demo'
    })
    expect(fetchReposMock).toHaveBeenCalled()
    expect(fetchWorktreesMock).toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('creates the project only — materialize + close without a workspace', async () => {
    await render()
    const nameInput = container.querySelector<HTMLInputElement>('#structured-iteration-name')
    await setInputValue(nameInput as HTMLInputElement, 'Demo')
    await click(button('Create project only'))

    expect(methodCalls('iteration.create').length).toBe(1)
    expect(methodCalls('iteration.workspaceCreate').length).toBe(0)
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.materialize', {
      project: 'Demo'
    })
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('skips the workspace on a fresh project — still materializes so it appears', async () => {
    await render()
    const nameInput = container.querySelector<HTMLInputElement>('#structured-iteration-name')
    await setInputValue(nameInput as HTMLInputElement, 'Demo')
    await click(button('Create & add workspace'))

    // On the workspace step, Skip → materialize (fresh project) + close.
    await click(button('Skip'))
    expect(methodCalls('iteration.workspaceCreate').length).toBe(0)
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.materialize', {
      project: 'Demo'
    })
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('re-enters at the workspace step for an existing project and skips without materializing', async () => {
    await openWith({ project: 'penguin-x', startAt: 'workspace' })

    // No project step: the workspace input is shown straight away, seeded blank.
    expect(container.querySelector('#structured-iteration-name')).toBeNull()
    expect(container.querySelector('#structured-workspace-name')).not.toBeNull()

    await click(button('Skip'))
    // Existing project already in the tree → nothing added → close, no materialize.
    expect(methodCalls('iteration.materialize').length).toBe(0)
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('re-enters at the repos step and defers the mount into the seeded project + workspace until Done', async () => {
    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    expect(container.querySelector('#structured-iteration-name')).toBeNull()
    pickDirectoryMock.mockResolvedValue('/src/mrs')
    await click(button('Choose a local Git folder'))
    // Picking git-detects and queues; no mount yet.
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.checkGitRepo', {
      path: '/src/mrs'
    })
    expect(methodCalls('iteration.workspaceAddRepo').length).toBe(0)

    await click(button('Done'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceAddRepo',
      { project: 'penguin-x', workspace: 'it2', source: '/src/mrs' }
    )
  })

  it('git-detects a rejected folder inline and does not queue it', async () => {
    callRuntimeRpcMock.mockImplementation((_target: unknown, method: string) => {
      if (method === 'iteration.checkGitRepo') {
        return Promise.resolve({ isGitRepo: false, repoName: '' })
      }
      return Promise.resolve({})
    })
    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    pickDirectoryMock.mockResolvedValue('/src/not-git')
    await click(button('Choose a local Git folder'))
    expect(container.textContent).toContain('Not a Git repository')
    // Rejected → nothing queued, so Done mounts nothing.
    await click(button('Done'))
    expect(methodCalls('iteration.workspaceAddRepo').length).toBe(0)
  })

  it('queues a dropped folder on the repos step and mounts it on Done', async () => {
    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    await dropFolder('/src/dropped-repo')
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.checkGitRepo', {
      path: '/src/dropped-repo'
    })
    expect(container.textContent).toContain('dropped-repo')
    expect(methodCalls('iteration.workspaceAddRepo').length).toBe(0)

    await click(button('Done'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceAddRepo',
      { project: 'penguin-x', workspace: 'it2', source: '/src/dropped-repo' }
    )
  })

  it('removes a still-pending repo before Done so it never mounts', async () => {
    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    pickDirectoryMock.mockResolvedValue('/src/oops')
    await click(button('Choose a local Git folder'))
    expect(container.textContent).toContain('oops')

    const removeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Remove"]')
    expect(removeButton).not.toBeNull()
    await click(removeButton as HTMLElement)
    expect(container.textContent).not.toContain('oops')

    await click(button('Done'))
    expect(methodCalls('iteration.workspaceAddRepo').length).toBe(0)
  })

  it('shows the workspace’s already-mounted repos when re-entering the repos step', async () => {
    // iteration.get is the disk source of truth for what is already mounted; the
    // repos step pulls it on entry so existing worktrees render before any add.
    callRuntimeRpcMock.mockImplementation((_target: unknown, method: string, params: unknown) => {
      if (method === 'iteration.get') {
        return Promise.resolve({
          project: {
            workspaces: [
              { name: 'it2', worktrees: [{ repoId: 'already-here', path: '/p', branch: 'it2' }] }
            ]
          }
        })
      }
      if (method === 'iteration.checkGitRepo') {
        const path = (params as { path?: string })?.path ?? ''
        return Promise.resolve({ isGitRepo: true, repoName: path.split('/').pop() || 'repo' })
      }
      return Promise.resolve({})
    })

    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    expect(methodCalls('iteration.get')).toEqual([
      [{ kind: 'local' }, 'iteration.get', { project: 'penguin-x' }]
    ])
    expect(container.textContent).toContain('already-here')

    // Queuing another shows it as pending alongside the existing mount.
    pickDirectoryMock.mockResolvedValue('/src/fresh-one')
    await click(button('Choose a local Git folder'))
    expect(container.textContent).toContain('already-here')
    expect(container.textContent).toContain('fresh-one')
  })

  it('re-enters the workspace step on an existing project with workspaces and drops the “first” title', async () => {
    callRuntimeRpcMock.mockImplementation((_target: unknown, method: string) => {
      if (method === 'iteration.get') {
        return Promise.resolve({
          project: { workspaces: [{ name: 'it1', worktrees: [] }] }
        })
      }
      return Promise.resolve({})
    })

    await openWith({ project: 'penguin-x', startAt: 'workspace' })

    expect(methodCalls('iteration.get').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Create a workspace')
    expect(container.textContent).not.toContain('Create the first workspace')
  })
})
