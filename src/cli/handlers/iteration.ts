import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { resolveRepoPathArgument } from '../repo-path-arguments'

// RPC result shapes (mirror src/main/structured-projects/structured-project-service.ts).
// Defined locally because the CLI build cannot import main-process modules.
type ProjectSummary = {
  name: string
  rootPath: string
  services: string[]
  memberCount: number
}
type WorkspaceResult = {
  name: string
  project: string
  services: { kind: string; hostPort: number }[]
}
type WorktreeResult = { repoId: string; path: string; branch: string }
type BranchRef = { source: string; repoId: string; workspace: string }
type DeleteResult = {
  result: {
    name: string
    rootPath: string
    workspaces: string[]
    sources: string[]
    removedBranches: BranchRef[]
    keptBranches: BranchRef[]
    skippedBranches: (BranchRef & { reason: string })[]
  }
  reconciled: { removedGroupIds: string[]; removedRepoIds: string[] }
}

function parseServices(flags: Map<string, string | boolean>): string[] {
  const raw = getOptionalStringFlag(flags, 'services')
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatProject(p: ProjectSummary): string {
  const services = p.services.length > 0 ? p.services.join(', ') : '(none)'
  return `Created project "${p.name}"\n  root:     ${p.rootPath}\n  services: ${services}`
}

function formatWorkspace(w: WorkspaceResult): string {
  const ports = w.services.map((s) => `${s.kind}:${s.hostPort}`).join(', ') || '(none)'
  return `Created workspace "${w.name}" in project "${w.project}"\n  sandbox ports: ${ports}`
}

function formatWorktree(w: WorktreeResult): string {
  return `Mounted "${w.repoId}" at ${w.path}\n  branch: ${w.branch}`
}

function formatProjectList(projects: ProjectSummary[]): string {
  if (projects.length === 0) {
    return 'No structured projects found.'
  }
  return projects
    .map(
      (p) => `${p.name}  (${p.memberCount} repo${p.memberCount === 1 ? '' : 's'})  ${p.rootPath}`
    )
    .join('\n')
}

function formatDelete(d: DeleteResult): string {
  const { result, reconciled } = d
  const lines = [
    `Deleted project "${result.name}"`,
    `  root:       ${result.rootPath}`,
    `  workspaces: ${result.workspaces.length > 0 ? result.workspaces.join(', ') : '(none)'}`,
    `  orca cleanup: ${reconciled.removedGroupIds.length} group(s), ${reconciled.removedRepoIds.length} repo(s)`
  ]
  const branchLabel = (b: BranchRef): string => `${b.workspace} in ${b.source}`
  if (result.removedBranches.length > 0) {
    lines.push(`  deleted branches: ${result.removedBranches.map(branchLabel).join(', ')}`)
  }
  for (const b of result.skippedBranches) {
    lines.push(`  skipped branch: ${branchLabel(b)} (${b.reason})`)
  }
  if (result.keptBranches.length > 0) {
    lines.push(
      `  leftover branches (kept): ${result.keptBranches.map(branchLabel).join(', ')}`,
      '  rerun with --delete-branches to remove them.'
    )
  }
  return lines.join('\n')
}

export const ITERATION_HANDLERS: Record<string, CommandHandler> = {
  'iteration create': async ({ flags, client, cwd, json }) => {
    const rawRoot = getOptionalStringFlag(flags, 'root')
    const result = await client.call<{ project: ProjectSummary }>('iteration.create', {
      name: getRequiredStringFlag(flags, 'name'),
      services: parseServices(flags),
      rootPath:
        rawRoot === undefined
          ? undefined
          : resolveRepoPathArgument(rawRoot, cwd, client.isRemote, 'Iteration project root')
    })
    printResult(result, json, (r) => formatProject(r.project))
  },
  'iteration workspace create': async ({ flags, client, json }) => {
    const result = await client.call<{ workspace: WorkspaceResult }>('iteration.workspaceCreate', {
      project: getRequiredStringFlag(flags, 'project'),
      name: getRequiredStringFlag(flags, 'name')
    })
    printResult(result, json, (r) => formatWorkspace(r.workspace))
  },
  'iteration workspace add-repo': async ({ flags, client, cwd, json }) => {
    const rawSource = getRequiredStringFlag(flags, 'source')
    const result = await client.call<{ worktree: WorktreeResult }>('iteration.workspaceAddRepo', {
      project: getRequiredStringFlag(flags, 'project'),
      workspace: getRequiredStringFlag(flags, 'workspace'),
      source: resolveRepoPathArgument(rawSource, cwd, client.isRemote, 'Iteration repo source'),
      repoId: getOptionalStringFlag(flags, 'repo-id'),
      defaultBranch: getOptionalStringFlag(flags, 'default-branch')
    })
    printResult(result, json, (r) => formatWorktree(r.worktree))
  },
  'iteration list': async ({ client, json }) => {
    const result = await client.call<{ projects: ProjectSummary[] }>('iteration.list')
    printResult(result, json, (r) => formatProjectList(r.projects))
  },
  'iteration delete': async ({ flags, client, json }) => {
    const result = await client.call<DeleteResult>('iteration.delete', {
      project: getRequiredStringFlag(flags, 'project'),
      deleteBranches: flags.get('delete-branches') === true
    })
    printResult(result, json, formatDelete)
  }
}
