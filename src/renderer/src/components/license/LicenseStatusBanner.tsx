import { translate } from '@/i18n/i18n'
import { AlertCircle } from 'lucide-react'
import { GRACE_PERIOD_DAYS, type LicenseStatus } from '../../../../shared/license-state'
import { APP_DISPLAY_NAME } from '../../../../shared/app-identity'

/**
 * Thin strip warning that the license is close to expiry or already inside its
 * grace window. Returns null whenever there is nothing worth interrupting for —
 * the app is still fully usable in both of those states.
 */
export function LicenseStatusBanner({
  status
}: {
  status: LicenseStatus
}): React.JSX.Element | null {
  if (!status.enforced || !status.shouldWarn || !status.usable) {
    return null
  }
  const days = status.daysRemaining ?? 0
  const inGrace = status.state === 'grace'
  // daysRemaining is already negative during grace, so what is left of the
  // grace window is GRACE_PERIOD_DAYS + daysRemaining.
  const graceDaysLeft = Math.max(0, GRACE_PERIOD_DAYS + days)

  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs ${
        inGrace ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
      }`}
      role="status"
    >
      <AlertCircle className="size-3.5 shrink-0" />
      <span>
        {inGrace
          ? translate(
              'auto.components.license.bannerGrace',
              'Your license expired. {{value1}} keeps working for {{value0}} more day(s) — please renew.',
              { value0: String(graceDaysLeft), value1: APP_DISPLAY_NAME }
            )
          : translate(
              'auto.components.license.bannerExpiring',
              'Your license expires in {{value0}} day(s).',
              { value0: String(Math.max(0, days)) }
            )}
      </span>
    </div>
  )
}
