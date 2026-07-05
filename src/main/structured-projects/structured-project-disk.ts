// Reads and writes the on-disk source of truth for structured projects:
// project.json at the project root and .yoho/workspace.json per workspace.
// Reads are fault-tolerant (parse errors surface, never throw into main);
// writes are atomic (tmp + rename) via writeFileAtomically.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import {
  parseProjectJson,
  parseWorkspaceJson,
  type StructuredParseResult,
  type StructuredProjectFile,
  type StructuredWorkspaceFile
} from '../../shared/structured-project-schema'
import { projectJsonPath, workspaceJsonPath } from './structured-project-layout'

export type StructuredReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; exists: boolean; error: string }

function readJsonRaw(path: string): { exists: boolean; raw?: unknown; error?: string } {
  if (!existsSync(path)) {
    return { exists: false }
  }
  try {
    return { exists: true, raw: JSON.parse(readFileSync(path, 'utf8')) as unknown }
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) }
  }
}

function readAndParse<T>(
  path: string,
  parse: (raw: unknown) => StructuredParseResult<T>
): StructuredReadResult<T> {
  const read = readJsonRaw(path)
  if (read.error !== undefined) {
    return { ok: false, exists: read.exists, error: read.error }
  }
  if (!read.exists) {
    return { ok: false, exists: false, error: `File not found: ${path}` }
  }
  const parsed = parse(read.raw)
  return parsed.ok
    ? { ok: true, value: parsed.value }
    : { ok: false, exists: true, error: parsed.error }
}

function writeJsonAtomically(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileAtomically(path, `${JSON.stringify(data, null, 2)}\n`)
}

export function readProjectFile(rootPath: string): StructuredReadResult<StructuredProjectFile> {
  return readAndParse(projectJsonPath(rootPath), parseProjectJson)
}

export function writeProjectFile(rootPath: string, data: StructuredProjectFile): void {
  writeJsonAtomically(projectJsonPath(rootPath), data)
}

export function readWorkspaceFile(wsDir: string): StructuredReadResult<StructuredWorkspaceFile> {
  return readAndParse(workspaceJsonPath(wsDir), parseWorkspaceJson)
}

export function writeWorkspaceFile(wsDir: string, data: StructuredWorkspaceFile): void {
  writeJsonAtomically(workspaceJsonPath(wsDir), data)
}

export type ScannedStructuredProject = {
  rootPath: string
  project: StructuredProjectFile
}

// Walks the projects directory one level deep and loads every subdirectory that
// holds a valid project.json. Malformed or unrelated folders are skipped so a
// single bad project never blocks discovery of the rest.
export function scanStructuredProjects(projectsDir: string): ScannedStructuredProject[] {
  if (!existsSync(projectsDir)) {
    return []
  }
  let entries
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const found: ScannedStructuredProject[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const rootPath = join(projectsDir, entry.name)
    const result = readProjectFile(rootPath)
    if (result.ok) {
      found.push({ rootPath, project: result.value })
    }
  }
  return found
}

export type ScannedWorkspace = {
  name: string
  wsDir: string
  workspace: StructuredWorkspaceFile
}

// Walks a project root one level deep and loads every subdirectory that holds a
// valid .yoho/workspace.json. Mirrors scanStructuredProjects; a malformed
// workspace is skipped rather than blocking discovery of its siblings.
export function scanWorkspaces(rootPath: string): ScannedWorkspace[] {
  if (!existsSync(rootPath)) {
    return []
  }
  let entries
  try {
    entries = readdirSync(rootPath, { withFileTypes: true })
  } catch {
    return []
  }
  const found: ScannedWorkspace[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const wsDir = join(rootPath, entry.name)
    const result = readWorkspaceFile(wsDir)
    if (result.ok) {
      found.push({ name: entry.name, wsDir, workspace: result.value })
    }
  }
  return found
}
