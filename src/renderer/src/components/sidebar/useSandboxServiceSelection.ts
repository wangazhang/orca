import { useCallback, useMemo, useRef, useState } from 'react'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import {
  STRUCTURED_SERVICE_KINDS,
  type DetectedService,
  type ServiceDetectionEvidence,
  type StructuredServiceKind,
  type StructuredServiceSpec
} from '../../../../shared/structured-project-schema'

// A user-defined middleware not covered by the built-in presets: it carries its
// own image/port so the sandbox can render a real container for it.
export type CustomServiceDraft = {
  name: string
  image: string
  containerPort: number
  command?: string
}

export type SandboxServiceSelection = {
  presetServices: Set<StructuredServiceKind>
  customServices: CustomServiceDraft[]
  // Per-kind evidence from the last detection, so the UI can explain a pre-check.
  evidenceByKind: Partial<Record<StructuredServiceKind, ServiceDetectionEvidence[]>>
  detecting: boolean
  selectedCount: number
  toggleService: (kind: StructuredServiceKind) => void
  // Returns a translated error message on invalid input, or null on success.
  addCustom: (draft: CustomServiceDraft) => string | null
  removeCustom: (name: string) => void
  runDetect: (paths: string[]) => void
  toSpecs: () => StructuredServiceSpec[]
  seed: (specs: StructuredServiceSpec[]) => void
  reset: () => void
}

const PRESET_KIND_SET = new Set<string>(STRUCTURED_SERVICE_KINDS)
const CUSTOM_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

// Shared selection state for the sandbox's middleware, used by both the new-project
// wizard and the workspace settings dialog. Two sources feed one list: built-in
// presets (toggled or auto-detected from repo config) and user-defined custom
// middleware. Detection only ever *suggests* — a kind the user explicitly unchecks
// is remembered as dismissed so a later scan never re-checks it.
export function useSandboxServiceSelection(params: {
  target: RuntimeClientTarget
}): SandboxServiceSelection {
  const { target } = params
  const mountedRef = useMountedRef()

  const [presetServices, setPresetServices] = useState<Set<StructuredServiceKind>>(new Set())
  const [customServices, setCustomServices] = useState<CustomServiceDraft[]>([])
  const [evidenceByKind, setEvidenceByKind] = useState<
    Partial<Record<StructuredServiceKind, ServiceDetectionEvidence[]>>
  >({})
  const [detecting, setDetecting] = useState(false)
  // Kinds the user explicitly turned off; detection must not re-add them. A ref
  // (not state) because it's read inside the async detect callback and never rendered.
  const dismissedRef = useRef<Set<StructuredServiceKind>>(new Set())

  const toggleService = useCallback((kind: StructuredServiceKind) => {
    setPresetServices((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) {
        next.delete(kind)
        dismissedRef.current.add(kind)
      } else {
        next.add(kind)
        dismissedRef.current.delete(kind)
      }
      return next
    })
  }, [])

  const addCustom = useCallback(
    (draft: CustomServiceDraft): string | null => {
      const name = draft.name.trim()
      const image = draft.image.trim()
      if (!name || !image) {
        return translate(
          'auto.components.sidebar.SandboxServiceSelector.customMissingFields',
          'Name and image are required.'
        )
      }
      if (!CUSTOM_NAME_RE.test(name) || PRESET_KIND_SET.has(name)) {
        return translate(
          'auto.components.sidebar.SandboxServiceSelector.customInvalidName',
          'Use a unique name (letters, digits, - or _) that is not a preset.'
        )
      }
      if (!Number.isInteger(draft.containerPort) || draft.containerPort <= 0) {
        return translate(
          'auto.components.sidebar.SandboxServiceSelector.customInvalidPort',
          'Enter a valid container port.'
        )
      }
      if (customServices.some((c) => c.name === name)) {
        return translate(
          'auto.components.sidebar.SandboxServiceSelector.customDuplicate',
          'A service with that name already exists.'
        )
      }
      const command = draft.command?.trim()
      setCustomServices((prev) => [
        ...prev,
        { name, image, containerPort: draft.containerPort, command: command || undefined }
      ])
      return null
    },
    [customServices]
  )

  const removeCustom = useCallback((name: string) => {
    setCustomServices((prev) => prev.filter((c) => c.name !== name))
  }, [])

  const runDetect = useCallback(
    (paths: string[]) => {
      const scanPaths = paths.filter((path) => path.length > 0)
      if (scanPaths.length === 0) {
        return
      }
      setDetecting(true)
      void (async () => {
        try {
          const result = await callRuntimeRpc<{ detected: DetectedService[] }>(
            target,
            'iteration.detectServices',
            { paths: scanPaths }
          )
          if (!mountedRef.current) {
            return
          }
          const detected = result.detected ?? []
          setPresetServices((prev) => {
            const next = new Set(prev)
            for (const entry of detected) {
              if (!dismissedRef.current.has(entry.kind)) {
                next.add(entry.kind)
              }
            }
            return next
          })
          setEvidenceByKind((prev) => {
            const next = { ...prev }
            for (const entry of detected) {
              next[entry.kind] = entry.evidence
            }
            return next
          })
        } catch {
          // Detection is a best-effort suggestion; a failure just leaves the
          // current selection untouched.
        } finally {
          if (mountedRef.current) {
            setDetecting(false)
          }
        }
      })()
    },
    [target, mountedRef]
  )

  const toSpecs = useCallback((): StructuredServiceSpec[] => {
    const presets: StructuredServiceSpec[] = STRUCTURED_SERVICE_KINDS.filter((kind) =>
      presetServices.has(kind)
    ).map((kind) => ({ name: kind, kind }))
    const customs: StructuredServiceSpec[] = customServices.map((c) => ({
      name: c.name,
      kind: null,
      image: c.image,
      containerPort: c.containerPort,
      command: c.command
    }))
    return [...presets, ...customs]
  }, [presetServices, customServices])

  const seed = useCallback((specs: StructuredServiceSpec[]) => {
    const presets = new Set<StructuredServiceKind>()
    const customs: CustomServiceDraft[] = []
    for (const spec of specs) {
      if (spec.kind) {
        presets.add(spec.kind)
      } else if (spec.image && spec.containerPort) {
        customs.push({
          name: spec.name,
          image: spec.image,
          containerPort: spec.containerPort,
          command: spec.command
        })
      }
    }
    dismissedRef.current = new Set()
    setPresetServices(presets)
    setCustomServices(customs)
    setEvidenceByKind({})
  }, [])

  const reset = useCallback(() => {
    dismissedRef.current = new Set()
    setPresetServices(new Set())
    setCustomServices([])
    setEvidenceByKind({})
    setDetecting(false)
  }, [])

  const selectedCount = presetServices.size + customServices.length

  return useMemo(
    () => ({
      presetServices,
      customServices,
      evidenceByKind,
      detecting,
      selectedCount,
      toggleService,
      addCustom,
      removeCustom,
      runDetect,
      toSpecs,
      seed,
      reset
    }),
    [
      presetServices,
      customServices,
      evidenceByKind,
      detecting,
      selectedCount,
      toggleService,
      addCustom,
      removeCustom,
      runDetect,
      toSpecs,
      seed,
      reset
    ]
  )
}
