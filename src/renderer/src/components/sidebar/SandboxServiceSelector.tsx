import React from 'react'
import { Loader2, Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { STRUCTURED_SERVICE_KINDS } from '../../../../shared/structured-project-schema'
import type { SandboxServiceSelection } from './useSandboxServiceSelection'

function basename(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.at(-1) || path
}

// One preset middleware row: a checkbox plus, when the last scan matched it, a
// one-line "why" so the user can trust (or override) the auto pre-check.
function PresetRow(props: {
  kind: (typeof STRUCTURED_SERVICE_KINDS)[number]
  selection: SandboxServiceSelection
  busy: boolean
}): React.ReactElement {
  const { kind, selection, busy } = props
  const evidence = selection.evidenceByKind[kind]?.[0]
  return (
    <label className="flex cursor-pointer flex-col gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <Checkbox
          checked={selection.presetServices.has(kind)}
          disabled={busy}
          onCheckedChange={() => selection.toggleService(kind)}
        />
        <span className="font-mono">{kind}</span>
        {evidence && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-primary">
            <Sparkles className="size-3" />
            {translate(
              'auto.components.sidebar.SandboxServiceSelector.autoDetectedBadge',
              'auto-detected'
            )}
          </span>
        )}
      </span>
      {evidence && (
        <span className="pl-6 text-[10px] text-muted-foreground">
          {translate(
            'auto.components.sidebar.SandboxServiceSelector.detectedIn',
            'Found “{{signal}}” in {{repo}}',
            { signal: evidence.signal, repo: basename(evidence.path) }
          )}
        </span>
      )}
    </label>
  )
}

// Sandbox middleware picker shared by the new-project wizard and the workspace
// settings dialog. Preset middleware (auto-detected + manually toggled) plus a
// form to add custom middleware (name/image/port) that runs as a real container.
export function SandboxServiceSelector(props: {
  selection: SandboxServiceSelection
  busy: boolean
}): React.ReactElement {
  const { selection, busy } = props
  const [name, setName] = React.useState('')
  const [image, setImage] = React.useState('')
  const [port, setPort] = React.useState('')
  const [command, setCommand] = React.useState('')
  const [formError, setFormError] = React.useState<string | null>(null)

  const submitCustom = (): void => {
    const parsedPort = Number.parseInt(port, 10)
    const error = selection.addCustom({
      name,
      image,
      containerPort: Number.isNaN(parsedPort) ? -1 : parsedPort,
      command
    })
    if (error) {
      setFormError(error)
      return
    }
    setName('')
    setImage('')
    setPort('')
    setCommand('')
    setFormError(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>
          {translate('auto.components.sidebar.SandboxServiceSelector.presetsLabel', 'Middleware')}
        </Label>
        {selection.detecting && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {translate(
              'auto.components.sidebar.SandboxServiceSelector.detecting',
              'Detecting from repositories…'
            )}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STRUCTURED_SERVICE_KINDS.map((kind) => (
          <PresetRow key={kind} kind={kind} selection={selection} busy={busy} />
        ))}
      </div>

      <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
        <Label>
          {translate(
            'auto.components.sidebar.SandboxServiceSelector.customLabel',
            'Custom middleware'
          )}
        </Label>
        {selection.customServices.length > 0 && (
          <ul className="space-y-1">
            {selection.customServices.map((custom) => (
              <li
                key={custom.name}
                className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"
              >
                <span className="break-all font-mono">{custom.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {custom.image}:{custom.containerPort}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-6 shrink-0"
                  disabled={busy}
                  onClick={() => selection.removeCustom(custom.name)}
                  aria-label={translate(
                    'auto.components.sidebar.SandboxServiceSelector.removeCustom',
                    'Remove'
                  )}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={name}
            placeholder={translate(
              'auto.components.sidebar.SandboxServiceSelector.customNamePlaceholder',
              'name (e.g. kafka)'
            )}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value)
              setFormError(null)
            }}
          />
          <Input
            value={port}
            inputMode="numeric"
            placeholder={translate(
              'auto.components.sidebar.SandboxServiceSelector.customPortPlaceholder',
              'port (e.g. 9092)'
            )}
            disabled={busy}
            onChange={(e) => {
              setPort(e.target.value)
              setFormError(null)
            }}
          />
          <Input
            className="col-span-2"
            value={image}
            placeholder={translate(
              'auto.components.sidebar.SandboxServiceSelector.customImagePlaceholder',
              'image (e.g. apache/kafka:3.8.0)'
            )}
            disabled={busy}
            onChange={(e) => {
              setImage(e.target.value)
              setFormError(null)
            }}
          />
          <Input
            className="col-span-2"
            value={command}
            placeholder={translate(
              'auto.components.sidebar.SandboxServiceSelector.customCommandPlaceholder',
              'start command (optional)'
            )}
            disabled={busy}
            onChange={(e) => setCommand(e.target.value)}
          />
        </div>
        {formError && <p className="text-[11px] text-destructive">{formError}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={busy || !name.trim() || !image.trim() || !port.trim()}
          onClick={submitCustom}
        >
          <Plus className="size-3.5" />
          {translate(
            'auto.components.sidebar.SandboxServiceSelector.addCustom',
            'Add custom middleware'
          )}
        </Button>
      </div>
    </div>
  )
}
