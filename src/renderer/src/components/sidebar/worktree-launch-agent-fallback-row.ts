import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext,
  AgentType
} from '../../../../shared/agent-status-types'
import { resolveCompatibleAgentTypeForOwner } from '../../../../shared/agent-title-owner'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../../shared/tui-agent-display-names'
import type { TerminalTab, TuiAgent } from '../../../../shared/types'

const LAUNCH_AGENT_TITLE_LABEL_BY_TYPE: Record<string, string> = {
  claude: 'Claude Code',
  openclaude: 'OpenClaude',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  copilot: 'GitHub Copilot',
  grok: 'Grok',
  devin: 'Devin',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  aider: 'Aider',
  cursor: 'Cursor',
  droid: 'Droid',
  hermes: 'Hermes',
  pi: 'Pi',
  omp: 'OMP'
}

export function buildLaunchAgentFallbackRow(args: {
  tab: TerminalTab
  leafId: string
  now: number
  runtimeAgentOrchestrationByPaneKey?: Record<string, AgentStatusOrchestrationContext>
}): DashboardAgentRow | null {
  if (
    !args.tab.launchAgent ||
    !isTerminalLeafId(args.leafId) ||
    !isNeutralLaunchFallbackTitle(args.tab)
  ) {
    return null
  }
  const agentType = resolveCompatibleAgentTypeForOwner(args.tab.launchAgent, args.tab.launchAgent)
  if (!agentType || agentType === 'unknown') {
    return null
  }
  const label = resolveLaunchAgentLabel(agentType)
  if (!label) {
    return null
  }
  const paneKey = makePaneKey(args.tab.id, args.leafId)
  const orchestration = args.runtimeAgentOrchestrationByPaneKey?.[paneKey]
  const entry: AgentStatusEntry = {
    paneKey,
    state: 'working',
    prompt: label,
    updatedAt: args.now,
    stateStartedAt: args.now,
    stateHistory: [],
    agentType,
    terminalTitle: label,
    lastAssistantMessage: 'Idle',
    ...(orchestration ? { orchestration } : {})
  }
  return {
    paneKey,
    entry,
    tab: args.tab,
    agentType,
    rowSource: 'live',
    state: 'idle',
    startedAt: args.tab.createdAt
  }
}

function resolveLaunchAgentLabel(agentType: AgentType): string | null {
  if (!agentType || agentType === 'unknown') {
    return null
  }
  const titleLabel = LAUNCH_AGENT_TITLE_LABEL_BY_TYPE[agentType]
  if (titleLabel) {
    return titleLabel
  }
  return Object.prototype.hasOwnProperty.call(TUI_AGENT_DISPLAY_NAMES, agentType)
    ? TUI_AGENT_DISPLAY_NAMES[agentType as TuiAgent]
    : agentType
}

function isNeutralLaunchFallbackTitle(tab: TerminalTab): boolean {
  const title = tab.title.trim()
  const defaultTitle = tab.defaultTitle?.trim()
  return !title || title === defaultTitle || /^Terminal \d+$/i.test(title)
}
