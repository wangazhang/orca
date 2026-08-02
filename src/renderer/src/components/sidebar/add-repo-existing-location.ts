import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { FolderWorkspace, ProjectGroup, Repo, Worktree } from '../../../../shared/types'
import { areRuntimePathsEqual } from '../../../../shared/worktree-ownership'
import { isPathInsideOrEqual } from '../../../../shared/cross-platform-path'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

// Where an already-loaded repo/worktree lives, so the add flow can point the user
// at it instead of silently no-op'ing (or wrongly creating a duplicate). A
// worktreeId is included when there is a concrete sidebar row to reveal.
export type ExistingRepoLocation = {
  repoName: string
  worktreeId?: string
  // Structured-project (top group) name the repo is attached to, if any.
  projectName?: string
}

type ResolveContext = {
  repos: readonly Repo[]
  worktreesByRepo: Record<string, readonly Worktree[]>
  projectGroups: readonly ProjectGroup[]
  folderWorkspaces: readonly FolderWorkspace[]
}

// A worktree id is `${repoId}::${path}`; the path is everything after the first
// separator (paths may themselves contain '::' only in pathological cases, which
// git worktree paths never do).
function worktreePathFromId(worktreeId: string): string | null {
  const idx = worktreeId.indexOf('::')
  return idx === -1 ? null : worktreeId.slice(idx + 2)
}

// For a structured repo worktree (which lives at <wsDir>/repos/<repo>), the visible,
// stably-revealable sidebar row is its workspace overview (FolderWorkspace at
// wsDir) — NOT the leaf itself, which hides inside a default-collapsed "repos"
// folder and would leave the reveal pending (breaking collapse). Returns the
// folder-workspace reveal key of the deepest containing overview, if any.
function overviewRevealKeyForPath(
  path: string,
  folderWorkspaces: readonly FolderWorkspace[]
): string | undefined {
  let best: FolderWorkspace | undefined
  for (const workspace of folderWorkspaces) {
    if (!isPathInsideOrEqual(workspace.folderPath, path)) {
      continue
    }
    if (!best || workspace.folderPath.length > best.folderPath.length) {
      best = workspace
    }
  }
  return best ? folderWorkspaceKey(best.id) : undefined
}

// Resolves whether a just-picked path is already present in Orca, by searching
// (1) every loaded worktree's path — the precise "you opened a branch that's
// already a structured workspace" case — then (2) the registered repo paths.
// Returns undefined when the path is genuinely new, so the caller proceeds to
// add it (including a source repo Orca has never seen).
export function resolveExistingRepoLocation(
  path: string,
  ctx: ResolveContext
): ExistingRepoLocation | undefined {
  const projectNameFor = (repo: Repo): string | undefined =>
    repo.projectGroupId
      ? ctx.projectGroups.find((group) => group.id === repo.projectGroupId)?.name
      : undefined

  // Pass 1: a loaded worktree at this exact path. Reveal its workspace overview
  // when the worktree sits inside one (structured repo); otherwise the row is
  // the worktree itself.
  for (const repo of ctx.repos) {
    for (const worktree of ctx.worktreesByRepo[repo.id] ?? []) {
      const worktreePath = worktreePathFromId(worktree.id)
      if (worktreePath && areRuntimePathsEqual(worktreePath, path)) {
        return {
          repoName: repo.displayName,
          worktreeId: overviewRevealKeyForPath(path, ctx.folderWorkspaces) ?? worktree.id,
          projectName: projectNameFor(repo)
        }
      }
    }
  }

  // Pass 2: the path is a registered repo root (e.g. a shared source repo). Point
  // at its first worktree's workspace overview when there is one.
  for (const repo of ctx.repos) {
    if (areRuntimePathsEqual(repo.path, path)) {
      const first = (ctx.worktreesByRepo[repo.id] ?? [])[0]
      const firstPath = first ? worktreePathFromId(first.id) : null
      const overviewKey = firstPath
        ? overviewRevealKeyForPath(firstPath, ctx.folderWorkspaces)
        : undefined
      return {
        repoName: repo.displayName,
        worktreeId: overviewKey ?? first?.id,
        projectName: projectNameFor(repo)
      }
    }
  }

  return undefined
}

// Toasts "already in Orca" for a resolved existing location, wiring a "Locate"
// action (and, for a single-folder pick, jumping straight to the row + closing
// the dialog). Kept next to the resolver so the add-flow hook stays lean.
export function notifyRepoAlreadyExists(
  existing: ExistingRepoLocation,
  deps: {
    isSinglePick: boolean
    revealWorktreeInSidebar?: (worktreeId: string) => void
    closeModal: () => void
  }
): void {
  const description = existing.projectName
    ? translate(
        'auto.components.sidebar.useAddRepoLocalFolderFlow.repoExistsInProject',
        'In structured project "{{value0}}"',
        { value0: existing.projectName }
      )
    : existing.repoName
  const canReveal = Boolean(existing.worktreeId && deps.revealWorktreeInSidebar)
  toast.info(
    translate(
      'auto.components.sidebar.useAddRepoLocalFolderFlow.repoAlreadyAdded',
      'This repository is already in Orca'
    ),
    {
      description,
      ...(canReveal
        ? {
            action: {
              label: translate(
                'auto.components.sidebar.useAddRepoLocalFolderFlow.locateRepo',
                'Locate'
              ),
              onClick: () => deps.revealWorktreeInSidebar?.(existing.worktreeId as string)
            }
          }
        : {})
    }
  )
  // Single-folder pick: jump straight there so "locate" is one less click.
  if (deps.isSinglePick && canReveal) {
    deps.revealWorktreeInSidebar?.(existing.worktreeId as string)
    deps.closeModal()
  }
}

// Toasts a note that some folders in a batch add were skipped (nested-review
// folders). Co-located with the other add-flow toasts to keep the hook lean.
export function notifySkippedBatchFolders(): void {
  toast.info(
    translate(
      'auto.components.sidebar.useAddRepoLocalFolderFlow.skippedBatchFolders',
      'Some folders were skipped'
    ),
    {
      description: translate(
        'auto.components.sidebar.useAddRepoLocalFolderFlow.skippedBatchFoldersDescription',
        'Add skipped folders individually to review or confirm them.'
      )
    }
  )
}

// Binds resolveExistingRepoLocation to live store state for the add-repo flow, so
// AddRepoDialog stays a thin wiring layer. Reads repos/worktrees/groups reactively.
export function useResolveExistingRepoLocation(): (
  path: string
) => ExistingRepoLocation | undefined {
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const folderWorkspaces = useAppStore((s) => s.folderWorkspaces)
  return useCallback(
    (path: string) =>
      resolveExistingRepoLocation(path, {
        repos,
        worktreesByRepo,
        projectGroups,
        folderWorkspaces
      }),
    [repos, worktreesByRepo, projectGroups, folderWorkspaces]
  )
}
