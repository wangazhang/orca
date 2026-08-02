import { describe, expect, it } from 'vitest'
import {
  buildReleaseTagHrefPattern,
  releaseTagUrl,
  UPDATE_ATOM_FEED_URL,
  UPDATE_LATEST_DOWNLOAD_URL,
  UPDATE_RELEASES_DOWNLOAD_BASE,
  UPDATE_RELEASES_URL
} from './update-feed-origin'

function atomEntry(tag: string): string {
  return `<entry><link rel="alternate" type="text/html" href="${UPDATE_RELEASES_URL}/tag/${tag}"/><title>${tag}</title></entry>`
}

describe('update feed origin', () => {
  it('derives every updater URL from the same repo', () => {
    expect(UPDATE_ATOM_FEED_URL).toBe(`${UPDATE_RELEASES_URL}.atom`)
    expect(UPDATE_RELEASES_DOWNLOAD_BASE).toBe(`${UPDATE_RELEASES_URL}/download`)
    expect(UPDATE_LATEST_DOWNLOAD_URL).toBe(`${UPDATE_RELEASES_URL}/latest/download`)
  })

  it('points at this fork, not upstream', () => {
    expect(UPDATE_RELEASES_URL).not.toContain('stablyai')
  })

  it('links a known version to its release tag and falls back to the listing', () => {
    expect(releaseTagUrl('1.4.145')).toBe(`${UPDATE_RELEASES_URL}/tag/v1.4.145`)
    expect(releaseTagUrl(null)).toBe(UPDATE_RELEASES_URL)
  })

  it('extracts every tag from an atom feed body', () => {
    const body = `<feed>${atomEntry('v1.4.2')}${atomEntry('v1.4.1')}</feed>`
    const tags = [...body.matchAll(buildReleaseTagHrefPattern())].map((m) => m[1])
    expect(tags).toEqual(['v1.4.2', 'v1.4.1'])
  })

  it('returns a fresh regex so a prior scan cannot advance the next one', () => {
    // Why: the pattern carries `g` for matchAll, which makes lastIndex
    // stateful. A shared instance would resume mid-string and drop tags.
    const body = `<feed>${atomEntry('v1.4.2')}${atomEntry('v1.4.1')}</feed>`
    const first = [...body.matchAll(buildReleaseTagHrefPattern())].map((m) => m[1])
    const second = [...body.matchAll(buildReleaseTagHrefPattern())].map((m) => m[1])
    expect(second).toEqual(first)
    expect(buildReleaseTagHrefPattern().lastIndex).toBe(0)
  })

  it('does not match tag hrefs belonging to another repo', () => {
    const foreign =
      '<entry><link href="https://github.com/someone/else/releases/tag/v9.9.9"/></entry>'
    expect([...foreign.matchAll(buildReleaseTagHrefPattern())]).toHaveLength(0)
  })
})
