import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { LICENSE_TOKEN_PREFIX } from '../../../../shared/license-token'
import type { LicenseStatus } from '../../../../shared/license-state'

// Not localized: this is the literal shape of a key, identical in every language.
const TOKEN_PLACEHOLDER = `${LICENSE_TOKEN_PREFIX}.…`

/**
 * Paste-a-license form. Shared by the blocking gate and the settings pane so the
 * activation path and its error copy exist in exactly one place.
 */
export function LicenseActivationForm({
  machineId,
  onActivated,
  autoFocus
}: {
  machineId: string
  onActivated: (status: LicenseStatus) => void
  autoFocus?: boolean
}): React.JSX.Element {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleActivate = async (): Promise<void> => {
    if (!token.trim() || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.license.activate(token)
      if (result.ok) {
        setToken('')
        onActivated(result.status)
        return
      }
      setError(activationErrorMessage(result.reason))
    } catch {
      setError(
        translate('auto.components.license.activateFailed', 'Could not activate. Please try again.')
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCopyMachineId = async (): Promise<void> => {
    await navigator.clipboard.writeText(machineId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="license-token">
          {translate('auto.components.license.tokenLabel', 'License key')}
        </Label>
        <Input
          id="license-token"
          value={token}
          autoFocus={autoFocus}
          spellCheck={false}
          placeholder={TOKEN_PLACEHOLDER}
          onChange={(event) => setToken(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleActivate()
            }
          }}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <Button onClick={() => void handleActivate()} disabled={!token.trim() || busy}>
        {busy
          ? translate('auto.components.license.activating', 'Activating...')
          : translate('auto.components.license.activate', 'Activate')}
      </Button>

      <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.license.machineIdHint',
            'Send this machine ID when requesting a license bound to this computer.'
          )}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate font-mono text-xs">{machineId}</code>
          <Button variant="outline" size="sm" onClick={() => void handleCopyMachineId()}>
            {copied
              ? translate('auto.components.license.copied', 'Copied')
              : translate('auto.components.license.copy', 'Copy')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function activationErrorMessage(reason: 'invalid' | 'machine-mismatch' | 'expired'): string {
  if (reason === 'machine-mismatch') {
    return translate(
      'auto.components.license.errorMachineMismatch',
      'This license is bound to a different computer. Request one for this machine ID.'
    )
  }
  if (reason === 'expired') {
    return translate(
      'auto.components.license.errorExpired',
      'This license has already expired. Please request a renewal.'
    )
  }
  return translate(
    'auto.components.license.errorInvalid',
    'That license key is not valid. Check that it was copied in full.'
  )
}
