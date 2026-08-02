import { beforeEach, describe, expect, it, vi } from 'vitest'

// Why: a repo whose git remotes aren't a known GitHub host makes gh's cwd
// fallback deterministically fail ("none of the git remotes... known GitHub
// host" / "no git remotes found"). Such a repo has no GitHub work items — it
// must resolve to an empty list rather than reject, so the renderer's
// cross-repo aggregator doesn't count it as failed and drop it from Tasks.

const { ghExecFileAsyncMock, getOwnerRepoMock, getIssueOwnerRepoMock, resolveIssueSourceMock } =
  vi.hoisted(() => ({
    ghExecFileAsyncMock: vi.fn(),
    getOwnerRepoMock: vi.fn(),
    getIssueOwnerRepoMock: vi.fn(),
    resolveIssueSourceMock: vi.fn()
  }))

vi.mock('./gh-utils', () => ({
  execFileAsync: vi.fn(),
  ghExecFileAsync: ghExecFileAsyncMock,
  githubRepoContext: (repoPath: string, connectionId?: string | null) => ({
    repoPath,
    connectionId: connectionId ?? null
  }),
  ghRepoExecOptions: (context: { repoPath: string; connectionId?: string | null }) =>
    context.connectionId ? {} : { cwd: context.repoPath },
  getOwnerRepo: getOwnerRepoMock,
  getIssueOwnerRepo: getIssueOwnerRepoMock,
  getOwnerRepoForRemote: vi.fn().mockResolvedValue(null),
  resolveIssueSource: resolveIssueSourceMock,
  acquire: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
  _resetOwnerRepoCache: vi.fn(),
  classifyGhError: (stderr: string) => ({ type: 'unknown', message: stderr }),
  classifyListIssuesError: (stderr: string) => ({ type: 'unknown', message: stderr })
}))

vi.mock('../git/runner', () => ({ gitExecFileAsync: vi.fn() }))

vi.mock('./rate-limit', () => ({
  rateLimitGuard: vi.fn(() => ({ blocked: false })),
  noteRateLimitSpend: vi.fn(),
  getRateLimit: vi.fn(async () => ({ ok: false, error: 'not probed in tests' }))
}))

import { listWorkItems, _resetMergeQueueCacheForTests, _resetOwnerRepoCache } from './client'
import { _resetGhCwdRepoNegativeCache } from './gh-cwd-repo-negative-cache'

function rejectWith(stderr: string): void {
  ghExecFileAsyncMock.mockRejectedValue(
    Object.assign(new Error(`Command failed: gh pr list\n${stderr}`), { stderr })
  )
}

describe('listWorkItems on a non-GitHub repo', () => {
  beforeEach(() => {
    ghExecFileAsyncMock.mockReset()
    getOwnerRepoMock.mockReset().mockResolvedValue(null)
    getIssueOwnerRepoMock.mockReset().mockResolvedValue(null)
    resolveIssueSourceMock
      .mockReset()
      .mockImplementation(async () => ({ source: await getIssueOwnerRepoMock(), fellBack: false }))
    _resetOwnerRepoCache()
    _resetMergeQueueCacheForTests()
    _resetGhCwdRepoNegativeCache()
  })

  it('returns empty and stops re-spawning gh on the no-query (recent) path', async () => {
    rejectWith('no git remotes found')

    await expect(listWorkItems('/no-remote-repo', 36)).resolves.toMatchObject({ items: [] })
    // First refresh pays the two cwd-fallback spawns (issue + pr list).
    expect(ghExecFileAsyncMock).toHaveBeenCalledTimes(2)

    await expect(listWorkItems('/no-remote-repo', 36)).resolves.toMatchObject({ items: [] })
    // Second refresh is served from the negative cache — zero new spawns.
    expect(ghExecFileAsyncMock).toHaveBeenCalledTimes(2)
  })

  it('returns empty on the queried (search) path instead of dropping the repo from Tasks', async () => {
    // Reproduces the reported storm: `gh pr list --search ...` on a repo whose
    // remotes aren't a known GitHub host.
    rejectWith(
      'none of the git remotes configured for this repository point to a known GitHub host.'
    )

    await expect(listWorkItems('/no-remote-repo', 36, 'is:open')).resolves.toMatchObject({
      items: []
    })
  })

  it('does not throw when only the PR side falls back to a non-GitHub cwd on the recent path', async () => {
    // Mixed project: the issue side resolved a GitHub owner/repo (explicit `gh
    // issue list` succeeds) but the PR side has no resolved owner/repo and falls
    // back to cwd resolution, which fails on a non-GitHub remote. Before the fix,
    // listRecentWorkItems re-threw that failure unconditionally, dropping the
    // whole repo from Tasks. It must now yield the issue items with empty PRs.
    getIssueOwnerRepoMock.mockResolvedValue({ owner: 'acme', repo: 'members' })
    ghExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      if (args.includes('issue')) {
        return { stdout: '[]', stderr: '' }
      }
      throw Object.assign(
        new Error(
          'Command failed: gh pr list\nnone of the git remotes configured for this repository point to a known GitHub host.'
        ),
        {
          stderr:
            'none of the git remotes configured for this repository point to a known GitHub host.'
        }
      )
    })

    await expect(listWorkItems('/mixed-repo', 36)).resolves.toMatchObject({ items: [] })
  })
})
