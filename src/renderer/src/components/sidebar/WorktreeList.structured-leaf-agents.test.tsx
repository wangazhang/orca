// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FolderWorkspace,
  ProjectGroup,
  Repo,
  TerminalTab,
  Worktree,
  WorktreeCardProperty
} from '../../../../shared/types'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockStore = vi.hoisted(() => ({
  state: {} as Record<string, unknown>
}))

type WorktreeListComponent = React.ComponentType<{
  scrollOffsetRef: React.RefObject<number>
  scrollAnchorRef: React.RefObject<unknown>
}>

let WorktreeList: WorktreeListComponent

vi.mock('@/store', () => {
  const useAppStore = ((selector: (state: Record<string, unknown>) => unknown) =>
    selector(mockStore.state)) as ((
    selector: (state: Record<string, unknown>) => unknown
  ) => unknown) & {
    getState: () => Record<string, unknown>
  }
  useAppStore.getState = () => mockStore.state
  return { useAppStore }
})

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: ({ startIndex, endIndex }: { startIndex: number; endIndex: number }) =>
    Array.from({ length: endIndex - startIndex + 1 }, (_, index) => startIndex + index),
  measureElement: () => 32,
  useVirtualizer: ({ count }: { count: number }) => ({
    elementsCache: new Map(),
    getTotalSize: () => count * 96,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: `row-${index}`,
        start: index * 96
      })),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn()
  })
}))

vi.mock('@/hooks/useVirtualizedScrollAnchor', () => ({
  VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT: 'orca:test-record-scroll-anchor',
  useVirtualizedScrollAnchor: vi.fn()
}))

vi.mock('./project-header-drag', () => ({
  useRepoHeaderDrag: () => ({
    state: { draggingRepoId: null, dropIndicatorY: null },
    onHandlePointerDown: vi.fn()
  }),
  isRepoHeaderActionTarget: () => false
}))

vi.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => (
    <div data-hover-card-content="">{children}</div>
  ),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/lib/sidebar-worktree-activation', () => ({
  activateWorktreeFromSidebar: vi.fn()
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  getActiveRuntimeTarget: () => ({ kind: 'local' }),
  callRuntimeRpc: vi.fn()
}))

vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))

// Why: the real WorktreeCardAgents pulls the whole dashboard agent-row stack in.
// Stub it with a placeholder that echoes the worktreeId it was mounted for, so
// the test can assert *whether the inline-agents branch renders at all* for a
// given worktree — which is exactly the leaf-row question under test.
vi.mock('./WorktreeCardAgents', () => ({
  default: ({ worktreeId }: { worktreeId: string }) => (
    <div data-agent-worktree-id={worktreeId}>Agent row</div>
  ),
  SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT: 'orca:test-suppress-scroll-adjustment'
}))

vi.mock('./SshDisconnectedDialog', () => ({
  default: () => null
}))

vi.mock('./WorktreeContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  CLOSE_ALL_CONTEXT_MENUS_EVENT: 'orca:test-close-context-menus',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-orca-context-menu-scope',
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu'
}))

const structuredRepo: Repo = {
  id: 'repo-mrs',
  path: '/src/mrs',
  displayName: 'mrs',
  badgeColor: '#222222',
  addedAt: 0,
  projectGroupId: 'top'
}

const leafWorktree: Worktree = {
  id: 'repo-mrs::/root/penguin-x/workspace-1/src/mrs',
  repoId: structuredRepo.id,
  path: '/root/penguin-x/workspace-1/src/mrs',
  branch: 'refs/heads/workspace-1',
  head: 'abc123',
  isBare: false,
  isMainWorktree: false,
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isArchived: false,
  comment: '',
  isUnread: false,
  isPinned: false,
  displayName: 'workspace-1',
  sortOrder: 0,
  lastActivityAt: 0
}

const topGroup: ProjectGroup = {
  id: 'top',
  name: 'penguin-x',
  parentPath: '/root/penguin-x',
  parentGroupId: null,
  createdFrom: 'structured',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 0,
  updatedAt: 0
}

const ws1Group: ProjectGroup = {
  ...topGroup,
  id: 'ws1',
  name: 'workspace-1',
  parentPath: '/root/penguin-x/workspace-1',
  parentGroupId: 'top'
}

const agentTab: TerminalTab = {
  id: 'tab-agent-1',
  title: 'claude',
  kind: 'terminal',
  launchAgent: 'claude'
} as unknown as TerminalTab

// The workspace-root overview: materialize() creates one FolderWorkspace per
// structured workspace, folderPath === wsDir. Its synthesized worktree id is
// `folder:<id>` and this is where a claude window opened at the workspace root
// attributes.
const overviewFolderWorkspace: FolderWorkspace = {
  id: 'fw-ws1',
  projectGroupId: 'ws1',
  name: 'workspace-1',
  folderPath: '/root/penguin-x/workspace-1',
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
} as FolderWorkspace

const overviewWorktreeId = 'folder:fw-ws1'

const overviewAgentTab: TerminalTab = {
  id: 'tab-overview-1',
  title: 'claude',
  kind: 'terminal',
  launchAgent: 'claude'
} as unknown as TerminalTab

function makeAgentEntry(paneKey: string): AgentStatusEntry {
  return {
    paneKey,
    state: 'working',
    agentType: 'claude',
    terminalTitle: 'claude',
    updatedAt: Date.now()
  } as AgentStatusEntry
}

function makeBaseState(): Record<string, unknown> {
  return {
    fetchFolderWorkspacePathStatus: vi.fn(),
    folderWorkspaces: [overviewFolderWorkspace],
    folderWorkspacePathStatuses: {},
    getFolderWorkspacePathStatusCacheKey: (request: unknown) => JSON.stringify(request),
    getFreshFolderWorkspacePathStatus: () => null,
    activeModal: '',
    activeView: 'terminal',
    activeWorktreeId: null,
    agentStatusByPaneKey: {
      'tab-agent-1:1': makeAgentEntry('tab-agent-1:1'),
      'tab-overview-1:1': makeAgentEntry('tab-overview-1:1')
    },
    agentStatusEpoch: 1,
    browserTabsByWorktree: {},
    clearPendingRevealWorktreeId: vi.fn(),
    collapsedGroups: new Set<string>(['struct-repos-folder:ws1']),
    deleteStateByWorktreeId: {},
    detectedWorktreesByRepo: {},
    fetchHostedReviewForBranch: vi.fn(),
    fetchIssue: vi.fn(),
    fetchLinearIssue: vi.fn(),
    filterRepoIds: [],
    gitConflictOperationByWorktree: {},
    groupBy: 'repo',
    hideDefaultBranchWorkspace: false,
    hostedReviewCache: {},
    issueCache: {},
    linearIssueCache: {},
    linearStatus: null,
    migrationUnsupportedByPtyId: {},
    openModal: vi.fn(),
    openSettingsPage: vi.fn(),
    openSettingsTarget: null,
    openTaskPage: vi.fn(),
    pendingRevealWorktree: null,
    prCache: {},
    projectGroups: [topGroup, ws1Group],
    ptyIdsByTabId: {},
    recordFeatureInteraction: vi.fn(),
    remoteBranchConflictByWorktreeId: {},
    reorderRepos: vi.fn(),
    reportVisibleGitHubPRRefreshCandidates: vi.fn(),
    repos: [structuredRepo],
    retainedAgentsByPaneKey: {},
    revealWorktreeInSidebar: vi.fn(),
    runtimePaneTitlesByTabId: {},
    setFilterRepoIds: vi.fn(),
    setHideDefaultBranchWorkspace: vi.fn(),
    setRenamingWorktreeId: vi.fn(),
    setShowSleepingWorkspaces: vi.fn(),
    setSortBy: vi.fn(),
    setWorktreesPinnedAndReveal: vi.fn(),
    settings: { experimentalNewWorktreeCardStyle: true },
    showSleepingWorkspaces: true,
    sortBy: 'manual',
    sortEpoch: 0,
    sshConnectedGeneration: 0,
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map(),
    tabsByWorktree: {
      [leafWorktree.id]: [agentTab],
      [overviewWorktreeId]: [overviewAgentTab]
    },
    terminalLayoutsByTabId: {},
    toggleCollapsedGroup: vi.fn(),
    updateRepo: vi.fn(),
    updateWorktreeMeta: vi.fn(),
    updateWorktreesMeta: vi.fn(),
    workspaceHostScope: 'all',
    workspacePortScan: null,
    workspaceStatuses: [],
    worktreeCardProperties: ['status', 'inline-agents'] satisfies WorktreeCardProperty[],
    worktreeLineageById: {},
    worktreesByRepo: { [structuredRepo.id]: [leafWorktree] }
  }
}

const mountedRoots: Root[] = []

async function renderWorktreeList(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(
      <WorktreeList scrollOffsetRef={{ current: 0 }} scrollAnchorRef={{ current: null }} />
    )
  })
  return container
}

describe('WorktreeList structured leaf inline agents', () => {
  beforeAll(async () => {
    WorktreeList = (await import('./WorktreeList')).default as WorktreeListComponent
  }, 60_000)

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.state = makeBaseState()
  })

  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('renders the inline agent list on an expanded structured leaf row', async () => {
    // Expand the src folder so the mounted-repo leaf row is visible.
    mockStore.state.collapsedGroups = new Set<string>(['struct-repos-folder:ws1'])
    // Inverted collapse semantics: key present = EXPANDED for the repos folder.
    const container = await renderWorktreeList()

    const agentPlaceholder = container.querySelector(
      `[data-agent-worktree-id="${leafWorktree.id}"]`
    )
    expect(agentPlaceholder).not.toBeNull()
  })

  it('renders the workspace-root overview card with its own inline agents', async () => {
    // The workspace group is expanded; the src repos folder stays collapsed.
    // This probes whether a claude window opened at the workspace root
    // (attributed to the overview FolderWorkspace) surfaces on that card.
    const container = await renderWorktreeList()

    const overviewAgent = container.querySelector(
      `[data-agent-worktree-id="${overviewWorktreeId}"]`
    )
    expect(overviewAgent).not.toBeNull()
  })
})
