// @vitest-environment happy-dom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const storeState = {
  activeModal: 'workspace-settings' as string,
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
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, params?: Record<string, unknown>) =>
    params ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(params[name] ?? '')) : fallback
}))
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

import WorkspaceSettingsDialog from './WorkspaceSettingsDialog'

let container: HTMLDivElement
let root: Root

// Default: iteration.get returns one service (mysql) and one mounted repo.
function defaultRpc(_target: unknown, method: string): Promise<unknown> {
  if (method === 'iteration.get') {
    return Promise.resolve({
      project: {
        workspaces: [
          {
            name: 'it1',
            services: [{ kind: 'mysql', hostPort: 3306 }],
            worktrees: [{ repoId: 'repo-a', path: '/a', branch: 'it1' }]
          }
        ]
      }
    })
  }
  if (method === 'iteration.checkGitRepo') {
    return Promise.resolve({ isGitRepo: true, repoName: 'repo-b' })
  }
  return Promise.resolve({})
}

beforeEach(() => {
  callRuntimeRpcMock.mockReset().mockImplementation(defaultRpc)
  closeModalMock.mockReset()
  toastSuccessMock.mockReset()
  pickDirectoryMock.mockReset()
  fetchReposMock.mockReset().mockResolvedValue(undefined)
  fetchGroupsMock.mockReset().mockResolvedValue(undefined)
  fetchFolderWorkspacesMock.mockReset().mockResolvedValue(undefined)
  fetchWorktreesMock.mockReset().mockResolvedValue(undefined)
  ;(window as unknown as { api: unknown }).api = { repos: { pickDirectory: pickDirectoryMock } }
  storeState.activeModal = 'workspace-settings'
  storeState.modalData = { project: 'penguin-x', workspace: 'it1' }
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
    root.render(<WorkspaceSettingsDialog />)
  })
  // Flush the async iteration.get load effect.
  await act(async () => {})
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

function byAriaLabel(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((entry) =>
    entry.getAttribute('aria-label')?.includes(label)
  )
  if (!found) {
    throw new Error(`Button not found by aria-label: ${label}`)
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

describe('WorkspaceSettingsDialog', () => {
  it('loads current services + repos from iteration.get on open', async () => {
    await render()
    expect(methodCalls('iteration.get')).toEqual([
      [{ kind: 'local' }, 'iteration.get', { project: 'penguin-x' }]
    ])
    expect(container.textContent).toContain('repo-a')
    // mysql pre-checked, the rest unchecked.
    const checkboxes = container.querySelectorAll('button[role="checkbox"]')
    expect(checkboxes.length).toBe(4)
    expect(checkboxes[0].getAttribute('aria-checked')).toBe('true')
    expect(checkboxes[1].getAttribute('aria-checked')).toBe('false')
  })

  it('applies the full diff on Save — service change, added repo, removed repo, then materialize + close', async () => {
    await render()

    // Toggle redis on (services change).
    await click(container.querySelectorAll('button[role="checkbox"]')[1] as HTMLElement)
    // Remove the existing repo-a.
    await click(byAriaLabel('Remove repo-a'))
    // Add a new validated Git folder.
    pickDirectoryMock.mockResolvedValue('/src/new')
    await click(button('Add a local Git folder'))
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.checkGitRepo', {
      path: '/src/new'
    })

    await click(button('Save'))

    const updateCall = methodCalls('iteration.workspaceUpdate')[0]
    expect(updateCall).toBeTruthy()
    const updateArgs = updateCall[2] as { project: string; workspace: string; services: string[] }
    expect(updateArgs.project).toBe('penguin-x')
    expect([...updateArgs.services].sort()).toEqual(['mysql', 'redis'])
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceAddRepo',
      { project: 'penguin-x', workspace: 'it1', source: '/src/new' }
    )
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'local' },
      'iteration.workspaceRemoveRepo',
      { project: 'penguin-x', workspace: 'it1', repoId: 'repo-a' }
    )
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.materialize', {
      project: 'penguin-x'
    })
    expect(fetchWorktreesMock).toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('does not call workspaceUpdate/add/remove when nothing changed', async () => {
    await render()
    await click(button('Save'))
    expect(methodCalls('iteration.workspaceUpdate').length).toBe(0)
    expect(methodCalls('iteration.workspaceAddRepo').length).toBe(0)
    expect(methodCalls('iteration.workspaceRemoveRepo').length).toBe(0)
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.materialize', {
      project: 'penguin-x'
    })
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('rejects a non-Git folder without staging it', async () => {
    callRuntimeRpcMock.mockImplementation((target: unknown, method: string) => {
      if (method === 'iteration.checkGitRepo') {
        return Promise.resolve({ isGitRepo: false, repoName: '' })
      }
      return defaultRpc(target, method)
    })
    await render()
    pickDirectoryMock.mockResolvedValue('/src/plain')
    await click(button('Add a local Git folder'))
    expect(container.textContent).toContain('not a Git repository')
  })
})
