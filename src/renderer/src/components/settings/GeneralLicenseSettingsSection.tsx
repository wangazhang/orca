import { SettingsSubsectionHeader } from './SettingsFormControls'
import { LicenseActivationForm } from '../license/LicenseActivationForm'
import { useLicenseStatus } from '../license/useLicenseStatus'
import { translate } from '@/i18n/i18n'
import { APP_DISPLAY_NAME } from '../../../../shared/app-identity'

/**
 * License section in Settings: shows the current term and lets the user paste a
 * renewal before it lapses, without waiting for the blocking gate to appear.
 */
export function GeneralLicenseSettingsSection(): React.JSX.Element | null {
  const { status, refresh } = useLicenseStatus()

  // Builds with no public key configured do not enforce licensing; showing an
  // activation form there would only confuse.
  if (!status || !status.enforced) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.license.title', 'License')}
      />
      <p className="text-sm text-muted-foreground">{summaryFor(status.state, status.expiresAt)}</p>
      <LicenseActivationForm machineId={status.machineId} onActivated={() => void refresh()} />
    </div>
  )
}

function summaryFor(state: string, expiresAt: number | null): string {
  const date = expiresAt ? new Date(expiresAt).toLocaleDateString() : '—'
  if (state === 'valid') {
    return translate('auto.components.settings.license.valid', 'Licensed through {{value0}}.', {
      value0: date
    })
  }
  if (state === 'grace') {
    return translate(
      'auto.components.settings.license.grace',
      'Expired on {{value0}}. {{value1}} is running on its grace period — please renew.',
      { value0: date, value1: APP_DISPLAY_NAME }
    )
  }
  if (state === 'expired') {
    return translate('auto.components.settings.license.expired', 'Expired on {{value0}}.', {
      value0: date
    })
  }
  if (state === 'machine-mismatch') {
    return translate(
      'auto.components.settings.license.mismatch',
      'This license belongs to a different computer.'
    )
  }
  if (state === 'invalid') {
    return translate(
      'auto.components.settings.license.invalid',
      'The stored license could not be verified.'
    )
  }
  return translate('auto.components.settings.license.missing', 'No license has been activated yet.')
}
