// Import path for structured projects: point at an existing on-disk project root
// (one that already holds a valid project.json) and make orca aware of it, so it
// materializes into the sidebar like a freshly-created one. Disk stays the
// source of truth — import never copies or rewrites the project, it only records
// "also look here" when the root lives outside the default projects dir.
import { dirname } from 'node:path'
import { areRuntimePathsEqual } from '../../shared/worktree-ownership'
import { readProjectFile } from './structured-project-disk'
import { getProjectsDir, registeredRootsFilePath } from './structured-project-paths'
import { addRegisteredRoot } from './structured-project-roots'
import type { StructuredProjectSummary } from './structured-project-service'

export type ImportStructuredProjectOptions = {
  projectsDir?: string
  rootsFilePath?: string
}

// Validates the root, records it if external, and returns the same summary shape
// the list/create paths use (so the RPC layer and renderer treat imported and
// created projects identically). Idempotent: importing an already-known root
// simply re-validates and returns its summary.
export function importStructuredProjectService(
  rootPath: string,
  options: ImportStructuredProjectOptions = {}
): StructuredProjectSummary {
  const projectsDir = options.projectsDir ?? getProjectsDir()
  const rootsFilePath = options.rootsFilePath ?? registeredRootsFilePath()

  const read = readProjectFile(rootPath)
  if (!read.ok) {
    throw new Error(
      `Not a structured project (no valid project.json at "${rootPath}"): ${read.error}`
    )
  }

  // A root already under the default projects dir is discovered by the default
  // scan, so registering it would be redundant. Only external roots need the
  // "also look here" index entry.
  const isUnderDefaultDir = areRuntimePathsEqual(dirname(rootPath), projectsDir)
  if (!isUnderDefaultDir) {
    addRegisteredRoot(rootPath, rootsFilePath)
  }

  return {
    name: read.value.name,
    rootPath,
    services: read.value.services,
    memberCount: read.value.members.length
  }
}
