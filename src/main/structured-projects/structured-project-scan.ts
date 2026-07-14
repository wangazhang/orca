// Unifies structured-project discovery across the default projects dir AND the
// registered external roots, so import (and custom-location create) show up
// everywhere the default-dir scan used to be the only source: list, resolve,
// materialize, and reconcile. Keeping this in one place means those four paths
// can never drift on "which projects exist" again.
//
// Self-heals: a registered root whose project.json is gone or invalid is pruned
// from the registry as it is scanned, so a deleted external project does not
// linger as a dead entry.
import {
  readProjectFile,
  scanStructuredProjects,
  type ScannedStructuredProject
} from './structured-project-disk'
import { getProjectsDir, registeredRootsFilePath } from './structured-project-paths'
import { readRegisteredRoots, removeRegisteredRoot } from './structured-project-roots'
import { areRuntimePathsEqual } from '../../shared/worktree-ownership'

export type ScanAllOptions = {
  projectsDir?: string
  rootsFilePath?: string
}

export function scanAllStructuredProjects(
  options: ScanAllOptions = {}
): ScannedStructuredProject[] {
  const projectsDir = options.projectsDir ?? getProjectsDir()
  const rootsFilePath = options.rootsFilePath ?? registeredRootsFilePath()

  const found = scanStructuredProjects(projectsDir)

  for (const root of readRegisteredRoots(rootsFilePath)) {
    // Already discovered via the default-dir scan (or listed twice): skip without
    // pruning — it is a live project, just reachable two ways.
    if (found.some((project) => areRuntimePathsEqual(project.rootPath, root))) {
      continue
    }
    const result = readProjectFile(root)
    if (result.ok) {
      found.push({ rootPath: root, project: result.value })
    } else {
      // Root no longer holds a valid project.json → drop it from the registry so
      // the index reflects disk truth.
      removeRegisteredRoot(root, rootsFilePath)
    }
  }

  return found
}
