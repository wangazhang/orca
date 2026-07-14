// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStructuredImport, type StructuredImportDialog } from './useStructuredImport'

const {
  callRuntimeRpcMock,
  closeModalMock,
  toastSuccessMock,
  pickDirectoryMock,
  fetchReposMock,
  fetchGroupsMock,
  fetchFolderWorkspacesMock,
  fetchWorktreesMock,
  revealMock
} = vi.hoisted(() => ({
  callRuntimeRpcMock: vi.fn(),
  closeModalMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  pickDirectoryMock: vi.fn(),
  fetchReposMock: vi.fn(),
  fetchGroupsMock: vi.fn(),
  fetchFolderWorkspacesMock: vi.fn(),
  fetchWorktreesMock: vi.fn(),
  revealMock: vi.fn()
}))

const storeState = {
  activeModal: 'structured-import' as string,
  closeModal: closeModalMock,
  settings: null as unknown,
  fetchReposForAllHosts: fetchReposMock,
  fetchProjectGroupsForAllHosts: fetchGroupsMock,
  fetchFolderWorkspacesForAllHosts: fetchFolderWorkspacesMock,
  fetchAllWorktrees: fetchWorktreesMock
}

vi.mock('@/store', () => {
  const useAppStore = ((selector: (s: typeof storeState) => unknown) => selector(storeState)) as ((
    selector: (s: typeof storeState) => unknown
  ) => unknown) & {
    getState: () => typeof storeState
  }
  useAppStore.getState = () => storeState
  return { useAppStore }
})
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: callRuntimeRpcMock,
  getActiveRuntimeTarget: () => ({ kind: 'local' as const })
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/hooks/useMountedRef', () => ({ useMountedRef: () => ({ current: true }) }))
vi.mock('./structured-repos-folder-reveal', () => ({ revealStructuredReposFolders: revealMock }))

let container: HTMLDivElement
let root: Root
let latest: StructuredImportDialog

function Harness(): null {
  latest = useStructuredImport()
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { api: unknown }).api = {
    repos: { pickDirectory: pickDirectoryMock }
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(<Harness />)
  })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('useStructuredImport', () => {
  it('picks a folder then imports + materializes + reveals + closes', async () => {
    pickDirectoryMock.mockResolvedValue('/ext/Penguin-go')
    callRuntimeRpcMock.mockImplementation((_target: unknown, method: string) => {
      if (method === 'iteration.import') {
        return Promise.resolve({ project: { name: 'Penguin-go' } })
      }
      if (method === 'iteration.materialize') {
        return Promise.resolve({ result: { workspaceGroupIds: ['g1', 'g2'] } })
      }
      return Promise.resolve({})
    })

    await act(async () => {
      await latest.handlePickRoot()
    })
    expect(latest.rootPath).toBe('/ext/Penguin-go')

    await act(async () => {
      await latest.handleImport()
    })

    expect(callRuntimeRpcMock).toHaveBeenCalledWith(expect.anything(), 'iteration.import', {
      rootPath: '/ext/Penguin-go'
    })
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(expect.anything(), 'iteration.materialize', {
      project: 'Penguin-go'
    })
    expect(fetchReposMock).toHaveBeenCalled()
    expect(fetchWorktreesMock).toHaveBeenCalled()
    expect(revealMock).toHaveBeenCalledWith(['g1', 'g2'])
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(closeModalMock).toHaveBeenCalled()
  })

  it('surfaces an error and does not close when import fails', async () => {
    pickDirectoryMock.mockResolvedValue('/bad/folder')
    callRuntimeRpcMock.mockRejectedValue(new Error('Not a structured project'))

    await act(async () => {
      await latest.handlePickRoot()
    })
    await act(async () => {
      await latest.handleImport()
    })

    expect(latest.error).toBe('Not a structured project')
    expect(closeModalMock).not.toHaveBeenCalled()
  })
})
