// @vitest-environment happy-dom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  callRuntimeRpcMock,
  closeModalMock,
  toastSuccessMock,
  fetchReposMock,
  fetchGroupsMock,
  fetchFolderWorkspacesMock,
  fetchWorktreesMock
} = vi.hoisted(() => ({
  callRuntimeRpcMock: vi.fn(),
  closeModalMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  fetchReposMock: vi.fn(),
  fetchGroupsMock: vi.fn(),
  fetchFolderWorkspacesMock: vi.fn(),
  fetchWorktreesMock: vi.fn()
}))

const storeState = {
  activeModal: 'copy-workspace' as string,
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
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

import CopyWorkspaceDialog from './CopyWorkspaceDialog'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  callRuntimeRpcMock.mockReset().mockResolvedValue({ workspace: {} })
  closeModalMock.mockReset()
  toastSuccessMock.mockReset()
  fetchReposMock.mockReset().mockResolvedValue(undefined)
  fetchGroupsMock.mockReset().mockResolvedValue(undefined)
  fetchFolderWorkspacesMock.mockReset().mockResolvedValue(undefined)
  fetchWorktreesMock.mockReset().mockResolvedValue(undefined)
  storeState.activeModal = 'copy-workspace'
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
    root.render(<CopyWorkspaceDialog />)
  })
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

describe('CopyWorkspaceDialog', () => {
  it('copies the source workspace into a new name, then materializes + refreshes + closes', async () => {
    await render()

    const nameInput = container.querySelector<HTMLInputElement>('#copy-workspace-name')
    expect(nameInput).not.toBeNull()
    await setInputValue(nameInput as HTMLInputElement, 'it2')
    await click(button('Copy'))

    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.workspaceCopy', {
      project: 'penguin-x',
      source: 'it1',
      name: 'it2'
    })
    expect(callRuntimeRpcMock).toHaveBeenCalledWith({ kind: 'local' }, 'iteration.materialize', {
      project: 'penguin-x'
    })
    expect(fetchReposMock).toHaveBeenCalled()
    expect(fetchWorktreesMock).toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('shows the source name read-only and does not submit an empty name', async () => {
    await render()
    const sourceInput = Array.from(container.querySelectorAll('input')).find(
      (entry) => entry.readOnly
    )
    expect(sourceInput?.value).toBe('it1')
    // Empty name → the primary button is disabled, so a click is a no-op.
    await click(button('Copy'))
    expect(methodCalls('iteration.workspaceCopy').length).toBe(0)
  })

  it('surfaces an error and stays open when the copy fails', async () => {
    callRuntimeRpcMock.mockReset().mockRejectedValue(new Error('name already exists'))
    await render()
    await setInputValue(
      container.querySelector<HTMLInputElement>('#copy-workspace-name') as HTMLInputElement,
      'it2'
    )
    await click(button('Copy'))

    expect(container.textContent).toContain('name already exists')
    expect(closeModalMock).not.toHaveBeenCalled()
  })
})
