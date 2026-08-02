import { useCallback, useEffect, useState } from 'react'
import type { LicenseStatus } from '../../../../shared/license-state'

export type UseLicenseStatus = {
  /** Null until the first read resolves — callers must not gate on it yet. */
  status: LicenseStatus | null
  refresh: () => Promise<void>
}

/**
 * Reads licensing status from the main process and re-checks it on window focus.
 *
 * Why re-check on focus: a customer activating a renewal is told to reopen the
 * app; polling on focus lets the gate clear as soon as they come back, without a
 * timer running all day.
 */
export function useLicenseStatus(): UseLicenseStatus {
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await window.api.license?.getStatus()
      if (next) {
        setStatus(next)
      }
    } catch {
      // Leave the previous value in place. Failing open here is deliberate: an
      // IPC hiccup must not lock a paying customer out of the app.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { status, refresh }
}
