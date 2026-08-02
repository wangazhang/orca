import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { hasNativeFileDragTypes } from '../../../../shared/native-file-drop'

export type NativeFolderDropHandlers = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
}

// Drag-over bookkeeping for a native folder drop zone. Enter/leave are counted by
// depth because they also fire for child elements, so a naive boolean would clear
// the highlight while the pointer is still inside. The actual drop arrives via the
// preload relay (window.api.ui.onFileDrop), not these handlers.
export function useNativeFolderDropZone(): {
  isDragOver: boolean
  dropHandlers: NativeFolderDropHandlers
} {
  const [isDragOver, setIsDragOver] = useState(false)
  const depthRef = useRef(0)

  // A drop or a cancelled drag anywhere ends the hover, including drops that land
  // outside this zone (which produce no dragleave for it).
  useEffect(() => {
    const clear = (): void => {
      depthRef.current = 0
      setIsDragOver(false)
    }
    document.addEventListener('drop', clear, true)
    document.addEventListener('dragend', clear, true)
    return () => {
      document.removeEventListener('drop', clear, true)
      document.removeEventListener('dragend', clear, true)
    }
  }, [])

  const dropHandlers = useMemo<NativeFolderDropHandlers>(
    () => ({
      onDragEnter: (event) => {
        if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
          return
        }
        depthRef.current += 1
        setIsDragOver(true)
      },
      onDragOver: (event) => {
        if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setIsDragOver(true)
      },
      onDragLeave: (event) => {
        if (!hasNativeFileDragTypes(event.dataTransfer.types)) {
          return
        }
        depthRef.current = Math.max(0, depthRef.current - 1)
        if (depthRef.current === 0) {
          setIsDragOver(false)
        }
      }
    }),
    []
  )

  return { isDragOver, dropHandlers }
}
