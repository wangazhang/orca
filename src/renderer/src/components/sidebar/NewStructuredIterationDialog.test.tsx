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

beforeEach(() => {
  callRuntimeRpcMock.mockReset()
  closeModalMock.mockReset()
  toastSuccessMock.mockReset()
  pickDirectoryMock.mockReset()
  fetchReposMock.mockReset().mockResolvedValue(undefined)
  fetchGroupsMock.mockReset().mockResolvedValue(undefined)
  fetchFolderWorkspacesMock.mockReset().mockResolvedValue(undefined)
  fetchWorktreesMock.mockReset().mockResolvedValue(undefined)
  callRuntimeRpcMock.mockImplementation((_target: unknown, method: string) => {
    if (method === 'iteration.create') {
      return Promise.resolve({ project: { name: 'Demo' } })
    }
    if (method === 'iteration.workspaceCreate') {
      return Promise.resolve({ workspace: {} })
    }
    if (method === 'iteration.workspaceAddRepo') {
      return Promise.resolve({ worktree: { repoId: 'repo' } })
    }
    return Promise.resolve({})
  })
  ;(window as unknown as { api: unknown }).api = { repos: { pickDirectory: pickDirectoryMock } }
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

    // Step 3 — pick a local folder → iteration.workspaceAddRepo
    pickDirectoryMock.mockResolvedValue('/src/qa-pk')
    await click(button('Choose a local Git folder'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceAddRepo',
      { project: 'Demo', workspace: 'it1', source: '/src/qa-pk' }
    )

    // Finish — materialize + refresh + toast + close
    await click(button('Done'))
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

  it('re-enters at the repos step and mounts into the seeded project + workspace', async () => {
    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    expect(container.querySelector('#structured-iteration-name')).toBeNull()
    pickDirectoryMock.mockResolvedValue('/src/mrs')
    await click(button('Choose a local Git folder'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceAddRepo',
      { project: 'penguin-x', workspace: 'it2', source: '/src/mrs' }
    )
  })

  it('shows the workspace’s already-mounted repos when re-entering the repos step', async () => {
    // iteration.get is the disk source of truth for what is already mounted; the
    // repos step pulls it on entry so existing worktrees render before any add.
    callRuntimeRpcMock.mockImplementation((_target: unknown, method: string) => {
      if (method === 'iteration.get') {
        return Promise.resolve({
          project: {
            workspaces: [
              { name: 'it2', worktrees: [{ repoId: 'already-here', path: '/p', branch: 'it2' }] }
            ]
          }
        })
      }
      if (method === 'iteration.workspaceAddRepo') {
        return Promise.resolve({ worktree: { repoId: 'fresh-one', path: '/q', branch: 'it2' } })
      }
      return Promise.resolve({})
    })

    await openWith({ project: 'penguin-x', workspace: 'it2', startAt: 'repos' })

    expect(methodCalls('iteration.get')).toEqual([
      [{ kind: 'local' }, 'iteration.get', { project: 'penguin-x' }]
    ])
    expect(container.textContent).toContain('already-here')

    // Adding another mounts it and re-pulls; both existing and fresh show.
    pickDirectoryMock.mockResolvedValue('/src/fresh')
    await click(button('Choose a local Git folder'))
    expect(container.textContent).toContain('already-here')
    expect(container.textContent).toContain('fresh-one')
  })
})
