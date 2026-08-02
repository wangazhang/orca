import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { useNativeFolderDropZone } from './useNativeFolderDropZone'
import type { ReposDropHandlers } from './useIterationRepos'

// One repo queued to attach to the project on create: either a local Git folder
// or a remote Git URL to clone. `label` is what the UI shows (folder basename or
// the URL itself).
export type ProjectRepoDraft = {
  source: string
  kind: 'local' | 'url'
  label: string
}

export type ProjectRepoDrafts = {
  projectRepoDrafts: ProjectRepoDraft[]
  projectRepoUrl: string
  setProjectRepoUrl: (value: string) => void
  handlePickProjectRepo: () => void
  handleAddProjectRepoUrl: () => void
  removeProjectRepoDraft: (source: string) => void
  projectReposDropTarget: typeof NATIVE_FILE_DROP_TARGET.iterationRepos
  projectReposDropHandlers: ReposDropHandlers
  isProjectReposDragOver: boolean
  // Local folder paths only — URL drafts aren't cloned yet, so nothing on disk
  // can be scanned for them.
  localDraftPaths: string[]
}

// Owns the project step's repo roster drafts: folders picked or dropped, Git URLs
// typed, and the native-file-drop wiring. Extracted from the wizard hook so each
// stays a focused module.
export function useProjectRepoDrafts(args: {
  isOpen: boolean
  isProjectStep: boolean
  busy: boolean
  clearError: () => void
  mountedRef: MutableRefObject<boolean>
  // Called after a native drop queues a folder, so the wizard can reveal the
  // repos panel and make the result visible immediately.
  onFolderDropped?: () => void
}): ProjectRepoDrafts {
  const { isOpen, isProjectStep, busy, clearError, mountedRef, onFolderDropped } = args

  const [projectRepoDrafts, setProjectRepoDrafts] = useState<ProjectRepoDraft[]>([])
  const [projectRepoUrl, setProjectRepoUrl] = useState('')
  const { isDragOver, dropHandlers } = useNativeFolderDropZone()

  // Queue a local folder as a project repo. Deduped by source so the same folder
  // can't be added twice. Shared by the folder picker and the drop target.
  const queueDraft = useCallback(
    (dir: string) => {
      const source = dir.trim()
      if (!source) {
        return
      }
      const segments = source.split('/').filter(Boolean)
      const label = segments.at(-1) || source
      setProjectRepoDrafts((prev) =>
        prev.some((d) => d.source === source) ? prev : [...prev, { source, kind: 'local', label }]
      )
      clearError()
    },
    [clearError]
  )

  const handlePickProjectRepo = useCallback(async () => {
    if (busy) {
      return
    }
    const dir = await window.api.repos.pickDirectory()
    if (!dir || !mountedRef.current) {
      return
    }
    queueDraft(dir)
  }, [busy, mountedRef, queueDraft])

  // Native folder drops on the project step. Reuses the iterationRepos drop
  // target string: useIterationRepos only subscribes on the 'repos' step and this
  // listener only fires on 'project', so the two never contend for a drop.
  const dropCallbackRef = useRef(onFolderDropped)
  dropCallbackRef.current = onFolderDropped
  useEffect(() => {
    if (!isOpen || !isProjectStep) {
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
        queueDraft(source)
        dropCallbackRef.current?.()
      }
    })
  }, [isOpen, isProjectStep, queueDraft])

  // Queue the typed Git URL as a project repo (cloned on create).
  const handleAddProjectRepoUrl = useCallback(() => {
    const url = projectRepoUrl.trim()
    if (!url || busy) {
      return
    }
    setProjectRepoDrafts((prev) =>
      prev.some((d) => d.source === url)
        ? prev
        : [...prev, { source: url, kind: 'url', label: url }]
    )
    setProjectRepoUrl('')
    clearError()
  }, [busy, clearError, projectRepoUrl])

  const removeProjectRepoDraft = useCallback((source: string) => {
    setProjectRepoDrafts((prev) => prev.filter((d) => d.source !== source))
  }, [])

  const localDraftPaths = useMemo(
    () => projectRepoDrafts.filter((d) => d.kind === 'local').map((d) => d.source),
    [projectRepoDrafts]
  )

  return {
    projectRepoDrafts,
    projectRepoUrl,
    setProjectRepoUrl,
    handlePickProjectRepo,
    handleAddProjectRepoUrl,
    removeProjectRepoDraft,
    projectReposDropTarget: NATIVE_FILE_DROP_TARGET.iterationRepos,
    projectReposDropHandlers: dropHandlers,
    isProjectReposDragOver: isDragOver,
    localDraftPaths
  }
}
