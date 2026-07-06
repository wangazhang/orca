import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { StructuredWorkspaceWorktree } from '../../../../shared/structured-project-schema'
import {
  NATIVE_FILE_DROP_TARGET,
  hasNativeFileDragTypes
} from '../../../../shared/native-file-drop'
import { translate } from '@/i18n/i18n'

// One row in the repos step's mounted-repo list. `isNew` marks repos this wizard
// session just mounted (vs. ones already on the workspace when the step opened),
// and `isPending` marks folders queued this session that are not mounted yet —
// the real workspaceAddRepo runs on Done. `source` is the on-disk folder for a
// pending row (used to remove it before Done); mounted rows carry none.
export type MountedRepoView = {
  key: string
  repoId: string
  branch: string
  isNew: boolean
  isPending: boolean
  source: string | null
}

// A folder the user chose/dropped and that passed git detection, waiting for Done
// to actually mount it. `repoName` is the label surfaced by iteration.checkGitRepo.
export type PendingRepo = {
  source: string
  repoName: string
}

// The repos-step drop zone's native-file-drop wiring, mirrored from
// useSidebarProjectDrop so the wizard can highlight while a folder hovers.
export type ReposDropHandlers = {
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void
  onDragOver: (event: React.DragEvent<HTMLElement>) => void
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void
}

type UseIterationReposArgs = {
  isOpen: boolean
  isReposStep: boolean
  busy: boolean
  setBusy: (value: boolean) => void
  setError: (value: string | null) => void
  target: RuntimeClientTarget
  createdProject: string
  workspaceName: string
  mountedRef: MutableRefObject<boolean>
}

export type UseIterationReposResult = {
  mountedRepos: MountedRepoView[]
  handleAddRepo: () => Promise<void>
  handleRemovePendingRepo: (source: string) => void
  reposDropTarget: typeof NATIVE_FILE_DROP_TARGET.iterationRepos
  reposDropHandlers: ReposDropHandlers
  isReposDragOver: boolean
  refreshMountedRepos: () => Promise<void>
  // Deferred adds: mount every queued folder for `project`, returning false (and
  // leaving the queue intact from the failure onward) if one add fails.
  mountPendingRepos: (project: string) => Promise<boolean>
}

// Owns everything the repos step needs: the workspace's disk mounts, this
// session's freshly mounted repos, the deferred pending queue, git detection on
// add, and the native folder-drop wiring. Extracted from the wizard hook so each
// stays a focused module.
export function useIterationRepos(args: UseIterationReposArgs): UseIterationReposResult {
  const { isOpen, isReposStep, busy, setBusy, setError, target, createdProject, workspaceName } =
    args
  const mountedRef = args.mountedRef

  // Split disk mounts from session-mounted repos so the list can render existing
  // worktrees alongside ones added this run, deduped by repoId with fresh flagged.
  const [existingRepos, setExistingRepos] = useState<StructuredWorkspaceWorktree[]>([])
  const [sessionRepos, setSessionRepos] = useState<StructuredWorkspaceWorktree[]>([])
  // Folders queued this session but not mounted yet: the actual workspaceAddRepo
  // calls are deferred to Done so the user can review and drop entries first.
  const [pendingRepos, setPendingRepos] = useState<PendingRepo[]>([])

  // Best-effort load of the workspace's already-mounted repos from disk (the
  // source of truth is each <ws>/.yoho/workspace.json). Failures are non-fatal.
  const refreshMountedRepos = useCallback(async () => {
    const project = createdProject.trim()
    const workspace = workspaceName.trim()
    if (!project || !workspace) {
      setExistingRepos([])
      return
    }
    try {
      const result = await callRuntimeRpc<{
        project?: { workspaces?: { name: string; worktrees: StructuredWorkspaceWorktree[] }[] }
      }>(target, 'iteration.get', { project })
      if (!mountedRef.current) {
        return
      }
      const ws = result.project?.workspaces?.find((entry) => entry.name === workspace)
      setExistingRepos(ws?.worktrees ?? [])
    } catch {
      if (mountedRef.current) {
        setExistingRepos([])
      }
    }
  }, [createdProject, mountedRef, target, workspaceName])

  // Enter the repos step (fresh finish or a mid-flow re-entry) → pull the
  // workspace's existing mounts so they render immediately.
  useEffect(() => {
    if (isOpen && isReposStep) {
      void refreshMountedRepos()
    }
  }, [isOpen, isReposStep, refreshMountedRepos])

  // Existing (disk) mounts first, then this session's additions, then folders
  // still queued for Done; a repo present in both existing+session (disk already
  // caught up after an add) is shown once, flagged new.
  const mountedRepos = useMemo<MountedRepoView[]>(() => {
    const sessionIds = new Set(sessionRepos.map((repo) => repo.repoId))
    const existing = existingRepos
      .filter((repo) => !sessionIds.has(repo.repoId))
      .map((repo) => ({
        key: `existing:${repo.repoId}`,
        repoId: repo.repoId,
        branch: repo.branch ?? '',
        isNew: false,
        isPending: false,
        source: null
      }))
    const added = sessionRepos.map((repo) => ({
      key: `session:${repo.repoId}`,
      repoId: repo.repoId,
      branch: repo.branch ?? '',
      isNew: true,
      isPending: false,
      source: null
    }))
    const pending = pendingRepos.map((repo) => ({
      key: `pending:${repo.source}`,
      repoId: repo.repoName,
      branch: '',
      isNew: false,
      isPending: true,
      source: repo.source
    }))
    return [...existing, ...added, ...pending]
  }, [existingRepos, sessionRepos, pendingRepos])

  // Git-detect a chosen/dropped folder and, if it is a repo, queue it for Done.
  // Not-a-repo folders and duplicates are rejected inline without queueing.
  const queueRepo = useCallback(
    async (source: string) => {
      if (busy || !source) {
        return
      }
      setBusy(true)
      setError(null)
      try {
        const result = await callRuntimeRpc<{ isGitRepo: boolean; repoName: string }>(
          target,
          'iteration.checkGitRepo',
          { path: source }
        )
        if (!mountedRef.current) {
          return
        }
        if (!result.isGitRepo) {
          setError(
            translate(
              'auto.components.sidebar.NewStructuredIterationDialog.notGitRepo',
              'Not a Git repository'
            )
          )
          return
        }
        setPendingRepos((prev) =>
          prev.some((entry) => entry.source === source)
            ? prev
            : [...prev, { source, repoName: result.repoName }]
        )
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (mountedRef.current) {
          setBusy(false)
        }
      }
    },
    [busy, mountedRef, setBusy, setError, target]
  )

  const handleAddRepo = useCallback(async () => {
    if (busy) {
      return
    }
    const dir = await window.api.repos.pickDirectory()
    if (!dir) {
      return
    }
    await queueRepo(dir)
  }, [busy, queueRepo])

  const handleRemovePendingRepo = useCallback((source: string) => {
    setPendingRepos((prev) => prev.filter((entry) => entry.source !== source))
  }, [])

  const mountPendingRepos = useCallback(
    async (project: string) => {
      // Each add is dropped from the queue on success (and surfaced as a mounted
      // row) so a retry after a mid-batch failure never double-adds.
      const workspace = workspaceName.trim()
      for (const repo of pendingRepos) {
        try {
          const result = await callRuntimeRpc<{ worktree: StructuredWorkspaceWorktree }>(
            target,
            'iteration.workspaceAddRepo',
            { project, workspace, source: repo.source }
          )
          if (!mountedRef.current) {
            return false
          }
          setPendingRepos((prev) => prev.filter((entry) => entry.source !== repo.source))
          setSessionRepos((prev) => [...prev, result.worktree])
        } catch (err) {
          if (mountedRef.current) {
            setError(err instanceof Error ? err.message : String(err))
          }
          return false
        }
      }
      return true
    },
    [mountedRef, pendingRepos, setError, target, workspaceName]
  )

  // Folder drops on the repos step are intercepted in the preload (webUtils
  // resolves the OS path) and relayed here filtered by the iterationRepos target.
  useEffect(() => {
    if (!isOpen || !isReposStep) {
      return
    }
    const onFileDrop = window.api?.ui?.onFileDrop
    if (!onFileDrop) {
      return
    }
    return onFileDrop((data) => {
      if (data.target !== NATIVE_FILE_DROP_TARGET.iterationRepos) {
        return
      }
      const source = data.paths.find((path) => path.length > 0)
      if (source) {
        void queueRepo(source)
      }
    })
  }, [isOpen, isReposStep, queueRepo])

  // Highlight the drop zone while a native folder hovers, mirroring
  // useSidebarProjectDrop's depth-counted enter/leave bookkeeping.
  const [isReposDragOver, setIsReposDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    const clear = (): void => {
      dragDepthRef.current = 0
      setIsReposDragOver(false)
    }
    document.addEventListener('drop', clear, true)
    document.addEventListener('dragend', clear, true)
    return () => {
      document.removeEventListener('drop', clear, true)
      document.removeEventListener('dragend', clear, true)
    }
  }, [])

  const reposDropHandlers = useMemo<ReposDropHandlers>(
    () => ({
      onDragEnter: (event) => {
        if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
          return
        }
        dragDepthRef.current += 1
        setIsReposDragOver(true)
      },
      onDragOver: (event) => {
        if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setIsReposDragOver(true)
      },
      onDragLeave: (event) => {
        if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
          return
        }
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) {
          setIsReposDragOver(false)
        }
      }
    }),
    []
  )

  return {
    mountedRepos,
    handleAddRepo,
    handleRemovePendingRepo,
    reposDropTarget: NATIVE_FILE_DROP_TARGET.iterationRepos,
    reposDropHandlers,
    isReposDragOver,
    refreshMountedRepos,
    mountPendingRepos
  }
}
