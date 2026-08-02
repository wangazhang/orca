import { Card } from '@/components/ui/card'
import { translate } from '@/i18n/i18n'
import { ShieldAlert } from 'lucide-react'
import { LicenseActivationForm } from './LicenseActivationForm'
import type { LicenseStatus } from '../../../../shared/license-state'

/**
 * Full-screen block shown when the license is expired, invalid, missing, or
 * issued for another machine. Nothing behind it is reachable — that is the point.
 *
 * Rendered ahead of onboarding in App.tsx: a user without a usable license must
 * not be walked through setup they cannot finish.
 */
export function LicenseGate({
  status,
  onActivated
}: {
  status: LicenseStatus
  onActivated: (status: LicenseStatus) => void
}): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-auto bg-black/70 p-4 text-foreground backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={translate('auto.components.license.gateTitle', 'License required')}
    >
      <Card className="w-full max-w-md p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">{gateTitle(status)}</h2>
              <p className="text-sm text-muted-foreground">{gateDescription(status)}</p>
            </div>
          </div>

          <LicenseActivationForm machineId={status.machineId} onActivated={onActivated} autoFocus />
        </div>
      </Card>
    </div>
  )
}

function gateTitle(status: LicenseStatus): string {
  if (status.state === 'expired') {
    return translate('auto.components.license.gateExpiredTitle', 'Your license has expired')
  }
  if (status.state === 'machine-mismatch') {
    return translate(
      'auto.components.license.gateMismatchTitle',
      'License issued for another computer'
    )
  }
  if (status.state === 'invalid') {
    return translate('auto.components.license.gateInvalidTitle', 'License could not be verified')
  }
  return translate('auto.components.license.gateMissingTitle', 'Activate Orca')
}

function gateDescription(status: LicenseStatus): string {
  if (status.state === 'expired') {
    return translate(
      'auto.components.license.gateExpiredBody',
      'The grace period has ended. Enter a renewed license key to continue.'
    )
  }
  if (status.state === 'machine-mismatch') {
    return translate(
      'auto.components.license.gateMismatchBody',
      'This license is bound to a different machine ID. Request a license for the ID below.'
    )
  }
  if (status.state === 'invalid') {
    return translate(
      'auto.components.license.gateInvalidBody',
      'The stored license key could not be verified. Re-entering the same key will not help — please request a new one.'
    )
  }
  return translate(
    'auto.components.license.gateMissingBody',
    'Enter the license key you were given to start using Orca.'
  )
}
