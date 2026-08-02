import { useEffect, useState } from 'react'

/**
 * Whether this build can download and apply an update in place.
 *
 * False on unsigned macOS builds, where Squirrel.Mac cannot swap the app
 * bundle — the UI must send the user to the release page instead of offering
 * an in-app update that would fail at install time.
 *
 * Optimistically starts true so the button never flickers into the manual
 * variant on the common (installable) platforms.
 */
export function useCanAutoInstallUpdates(): boolean {
  const [canAutoInstall, setCanAutoInstall] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Why: guarded call rather than a bare invoke — during a dev hot-reload the
    // renderer can run against a preload bundle that predates this method, and
    // a TypeError here would take down the whole update card.
    const read = window.api.updater.canAutoInstall?.()
    if (!read) {
      return
    }
    void read
      .then((value) => {
        if (!cancelled) {
          setCanAutoInstall(value)
        }
      })
      .catch(() => {
        // Best-effort: an IPC failure leaves the in-place path enabled, which
        // matches the behavior on every platform that supports it.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return canAutoInstall
}
