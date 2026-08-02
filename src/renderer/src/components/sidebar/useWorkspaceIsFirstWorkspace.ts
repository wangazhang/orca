import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

// Whether the workspace step is creating the project's very first workspace, so
// the title reads "Create the first workspace" only when it truly is one. A
// freshly created project has none; a mid-flow re-entry on an existing project
// asks disk instead of assuming.
export function useWorkspaceIsFirstWorkspace(args: {
  isOpen: boolean
  isWorkspaceStep: boolean
  projectIsNew: boolean
  project: string
  target: RuntimeClientTarget
  mountedRef: MutableRefObject<boolean>
}): boolean {
  const { isOpen, isWorkspaceStep, projectIsNew, project, target, mountedRef } = args
  const [isFirst, setIsFirst] = useState(true)

  useEffect(() => {
    if (!isOpen || !isWorkspaceStep) {
      return
    }
    if (projectIsNew) {
      setIsFirst(true)
      return
    }
    const name = project.trim()
    if (!name) {
      setIsFirst(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await callRuntimeRpc<{ project?: { workspaces?: unknown[] } }>(
          target,
          'iteration.get',
          { project: name }
        )
        if (cancelled || !mountedRef.current) {
          return
        }
        setIsFirst((result.project?.workspaces?.length ?? 0) === 0)
      } catch {
        if (!cancelled && mountedRef.current) {
          setIsFirst(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, isWorkspaceStep, projectIsNew, project, target, mountedRef])

  return isFirst
}
