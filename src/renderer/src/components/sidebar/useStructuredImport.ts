import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { materializeAndRefreshStructured } from './structured-materialize-refresh'

// Drives the "import an existing structured project" dialog: pick an on-disk
// project root, register it (iteration.import), then project it into orca's
// native records (iteration.materialize) exactly like the create wizard's
// finish step — so imported and created projects are indistinguishable after.
export type StructuredImportDialog = {
  isOpen: boolean
  rootPath: string
  busy: boolean
  error: string | null
  handlePickRoot: () => void
  handleImport: () => void
  handleOpenChange: (open: boolean) => void
}

export function useStructuredImport(): StructuredImportDialog {
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()

  const isOpen = activeModal === 'structured-import'
  const target = useMemo(() => getActiveRuntimeTarget(settings), [settings])

  const [rootPath, setRootPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePickRoot = useCallback(async () => {
    if (busy) {
      return
    }
    const dir = await window.api.repos.pickDirectory()
    if (dir && mountedRef.current) {
      setRootPath(dir)
      setError(null)
    }
  }, [busy, mountedRef])

  const handleImport = useCallback(async () => {
    const root = rootPath.trim()
    if (!root || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const imported = (await callRuntimeRpc(target, 'iteration.import', {
        rootPath: root
      })) as { project: { name: string } }
      await materializeAndRefreshStructured(target, imported.project.name)
      if (!mountedRef.current) {
        return
      }
      toast.success(
        translate(
          'auto.components.sidebar.StructuredImportDialog.done',
          'Structured project imported'
        ),
        { description: imported.project.name }
      )
      closeModal()
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
      }
    }
  }, [busy, closeModal, mountedRef, rootPath, target])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return { isOpen, rootPath, busy, error, handlePickRoot, handleImport, handleOpenChange }
}
