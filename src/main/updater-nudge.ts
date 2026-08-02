import { net } from 'electron'
import { compareVersions, isValidVersion } from './updater-fallback'
import { UPDATE_CHANGELOG_BASE_URL } from '../shared/update-feed-origin'

export type NudgeConfig = {
  id: string
  minVersion?: string
  maxVersion?: string
}

export async function fetchNudge(): Promise<NudgeConfig | null> {
  // Why: nudge JSON is served by upstream's own site. This fork has no such
  // service, and firing the request anyway would send every install's update
  // check to a third-party host for a response that can only be discarded.
  if (!UPDATE_CHANGELOG_BASE_URL) {
    return null
  }
  try {
    const res = await net.fetch(`${UPDATE_CHANGELOG_BASE_URL}/whats-new/nudge.json`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) {
      return null
    }

    const json: unknown = await res.json()
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return null
    }

    const { id, minVersion, maxVersion } = json as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim()) {
      return null
    }

    if (minVersion === undefined && maxVersion === undefined) {
      return null
    }

    if (minVersion !== undefined && typeof minVersion !== 'string') {
      return null
    }
    if (maxVersion !== undefined && typeof maxVersion !== 'string') {
      return null
    }
    if (minVersion !== undefined && !isValidVersion(minVersion)) {
      return null
    }
    if (maxVersion !== undefined && !isValidVersion(maxVersion)) {
      return null
    }
    if (
      minVersion !== undefined &&
      maxVersion !== undefined &&
      compareVersions(minVersion, maxVersion) > 0
    ) {
      return null
    }

    return {
      id: id.trim(),
      minVersion,
      maxVersion
    }
  } catch {
    return null
  }
}

export function versionMatchesRange(
  appVersion: string,
  range: { minVersion?: string; maxVersion?: string }
): boolean {
  if (range.minVersion !== undefined && compareVersions(appVersion, range.minVersion) < 0) {
    return false
  }
  if (range.maxVersion !== undefined && compareVersions(appVersion, range.maxVersion) > 0) {
    return false
  }
  return true
}

export function shouldApplyNudge(args: {
  nudge: NudgeConfig
  appVersion: string
  pendingUpdateNudgeId: string | null
  dismissedUpdateNudgeId: string | null
}): boolean {
  const { nudge, appVersion, pendingUpdateNudgeId, dismissedUpdateNudgeId } = args

  if (nudge.id === pendingUpdateNudgeId || nudge.id === dismissedUpdateNudgeId) {
    return false
  }

  return versionMatchesRange(appVersion, nudge)
}
