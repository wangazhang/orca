// Filesystem locations for structured projects, factored out of the service so
// both the service and the scan/registry modules can import them without a
// cycle. Main-only (uses node:os/path) — never import from the renderer.
import { homedir } from 'node:os'
import { join } from 'node:path'

// Default root for structured projects (~/orca/projects). Mirrors the
// workspaceDir convention; the reconcile/scan passes read the same directory
// the service writes to.
export function getProjectsDir(): string {
  return join(homedir(), 'orca', 'projects')
}

// Registry of structured project roots that live OUTSIDE the default projects
// dir (imported from elsewhere on disk, or created at a custom location). A
// sibling of the projects dir so the whole structured footprint stays under
// ~/orca. Disk remains the source of truth — this is only a "where to also look"
// index, never a cache of project contents.
export function registeredRootsFilePath(): string {
  return join(homedir(), 'orca', 'registered-structured-roots.json')
}
