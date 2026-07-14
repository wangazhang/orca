// Persists the set of structured-project roots that live outside the default
// projects dir, so import (and custom-location create) survive a restart. The
// file holds a plain array of absolute root paths; disk under each root stays
// authoritative, this is only the "also look here" index. Tolerant of a missing
// or corrupt file (returns empty rather than throwing into main); writes are
// atomic via writeFileAtomically. All mutations return a fresh array — the
// on-disk list is never mutated in place.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { areRuntimePathsEqual } from '../../shared/worktree-ownership'
import { registeredRootsFilePath } from './structured-project-paths'

const registeredRootsSchema = z.array(z.string().min(1))

// Collapses paths that are equal under runtime path rules (trailing slash, case
// on case-insensitive FS) to a single entry, preserving first-seen order.
function dedupeRoots(roots: readonly string[]): string[] {
  const out: string[] = []
  for (const root of roots) {
    if (!out.some((known) => areRuntimePathsEqual(known, root))) {
      out.push(root)
    }
  }
  return out
}

export function readRegisteredRoots(filePath: string = registeredRootsFilePath()): string[] {
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const parsed = registeredRootsSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')))
    return parsed.success ? dedupeRoots(parsed.data) : []
  } catch {
    return []
  }
}

function writeRegisteredRoots(filePath: string, roots: readonly string[]): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileAtomically(filePath, `${JSON.stringify(roots, null, 2)}\n`)
}

// Adds a root if not already present (idempotent under path equality). Returns
// the resulting list; only writes when the set actually changed.
export function addRegisteredRoot(
  root: string,
  filePath: string = registeredRootsFilePath()
): string[] {
  const roots = readRegisteredRoots(filePath)
  if (roots.some((known) => areRuntimePathsEqual(known, root))) {
    return roots
  }
  const next = [...roots, root]
  writeRegisteredRoots(filePath, next)
  return next
}

// Removes a root (used by lazy self-heal when a root no longer holds a valid
// project.json). Idempotent; only writes when the set actually changed.
export function removeRegisteredRoot(
  root: string,
  filePath: string = registeredRootsFilePath()
): string[] {
  const roots = readRegisteredRoots(filePath)
  const next = roots.filter((known) => !areRuntimePathsEqual(known, root))
  if (next.length !== roots.length) {
    writeRegisteredRoots(filePath, next)
  }
  return next
}
