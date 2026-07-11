import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addRegisteredRoot,
  readRegisteredRoots,
  removeRegisteredRoot
} from './structured-project-roots'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'structured-roots-'))
  file = join(dir, 'registered-structured-roots.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('registered structured roots', () => {
  it('returns empty when the file is missing', () => {
    expect(readRegisteredRoots(file)).toEqual([])
  })

  it('returns empty (never throws) on a corrupt file', () => {
    writeFileSync(file, 'not json {')
    expect(readRegisteredRoots(file)).toEqual([])
  })

  it('returns empty on a wrong-shape file', () => {
    writeFileSync(file, JSON.stringify({ roots: ['/a'] }))
    expect(readRegisteredRoots(file)).toEqual([])
  })

  it('adds a root and persists it', () => {
    addRegisteredRoot('/ext/project-a', file)
    expect(readRegisteredRoots(file)).toEqual(['/ext/project-a'])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['/ext/project-a'])
  })

  it('is idempotent under path equality (trailing slash)', () => {
    addRegisteredRoot('/ext/project-a', file)
    const after = addRegisteredRoot('/ext/project-a/', file)
    expect(after).toEqual(['/ext/project-a'])
    expect(readRegisteredRoots(file)).toHaveLength(1)
  })

  it('keeps distinct roots in first-seen order', () => {
    addRegisteredRoot('/ext/a', file)
    addRegisteredRoot('/ext/b', file)
    expect(readRegisteredRoots(file)).toEqual(['/ext/a', '/ext/b'])
  })

  it('removes a root by path equality', () => {
    addRegisteredRoot('/ext/a', file)
    addRegisteredRoot('/ext/b', file)
    const after = removeRegisteredRoot('/ext/a/', file)
    expect(after).toEqual(['/ext/b'])
    expect(readRegisteredRoots(file)).toEqual(['/ext/b'])
  })

  it('remove is a no-op for an unknown root', () => {
    addRegisteredRoot('/ext/a', file)
    expect(removeRegisteredRoot('/ext/zzz', file)).toEqual(['/ext/a'])
  })
})
