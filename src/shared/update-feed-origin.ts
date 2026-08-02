// Single source of truth for where update artifacts are published and fetched
// from. Every updater URL (atom feed, release manifests, download links, the
// "view release notes" links in the UI) derives from the owner/repo pair here.
//
// Why one module: this fork publishes its own releases, and pointing the
// updater at a different host later (self-hosted HTTP server, internal mirror)
// should be a one-file change rather than a hunt through main + renderer.
// Deliberately free of electron/node imports so both processes can import it.

export const UPDATE_REPO_OWNER = 'wangazhang'
export const UPDATE_REPO_NAME = 'orca'

export const UPDATE_REPO_URL = `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}`
export const UPDATE_RELEASES_URL = `${UPDATE_REPO_URL}/releases`
export const UPDATE_ATOM_FEED_URL = `${UPDATE_RELEASES_URL}.atom`
export const UPDATE_RELEASES_DOWNLOAD_BASE = `${UPDATE_RELEASES_URL}/download`
export const UPDATE_LATEST_DOWNLOAD_URL = `${UPDATE_RELEASES_URL}/latest/download`

// Why: upstream serves changelog/nudge JSON from its own domain. A fork has no
// such service, and leaving the URL in place would keep pinging upstream on
// every update check. Empty means "no service configured" — callers skip the
// fetch entirely rather than firing a request that can only fail.
export const UPDATE_CHANGELOG_BASE_URL = ''

/** Release-notes page for a version, or the release list when version is unknown. */
export function releaseTagUrl(version: string | null): string {
  return version ? `${UPDATE_RELEASES_URL}/tag/v${version}` : UPDATE_RELEASES_URL
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Matches `/releases/tag/<tag>` hrefs in the GitHub atom feed.
 *
 * Why a factory instead of a module-level constant: the returned regex carries
 * the `g` flag for `matchAll`, which makes `lastIndex` stateful. Handing out a
 * shared instance would let one scan resume mid-string from a previous scan's
 * offset and silently drop tags.
 */
export function buildReleaseTagHrefPattern(): RegExp {
  const owner = escapeRegExp(UPDATE_REPO_OWNER)
  const repo = escapeRegExp(UPDATE_REPO_NAME)
  return new RegExp(`href="https://github\\.com/${owner}/${repo}/releases/tag/([^"]+)"`, 'g')
}
