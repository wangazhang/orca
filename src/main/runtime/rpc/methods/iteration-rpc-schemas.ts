// Zod request schemas for the structured-project (iteration.*) RPC methods.
// Split out of project-runtime-rpc-methods so that file stays under the
// max-lines budget and the iteration contract is greppable in one place.
import { z } from 'zod'
import { OptionalString, requiredString } from '../schemas'
import { structuredServiceSpecSchema } from '../../../../shared/structured-project-schema'

export const IterationCreate = z.object({
  name: requiredString('Missing project name'),
  services: z.array(structuredServiceSpecSchema).default([]),
  // Full project root. Takes precedence when set.
  rootPath: OptionalString,
  // Parent directory to create the project under (root becomes
  // <parentDir>/<name>). Lets the UI pass just a location and keep the
  // cross-platform path join in main. Ignored when rootPath is set.
  parentDir: OptionalString
})

export const IterationWorkspaceCreate = z.object({
  project: requiredString('Missing project name or id'),
  name: requiredString('Missing workspace name')
})

export const IterationWorkspaceAddRepo = z.object({
  project: requiredString('Missing project name or id'),
  workspace: requiredString('Missing workspace name'),
  source: requiredString('Missing repo source path'),
  repoId: OptionalString,
  defaultBranch: OptionalString
})

export const IterationGet = z.object({
  project: requiredString('Missing project name or id')
})

// Add a repo to the project's roster (project.json members) WITHOUT mounting it
// into a workspace. `source` is a local folder path or a Git URL (cloned into
// the project's repos/ dir first). Distinct from workspaceAddRepo, which mounts.
export const IterationAddProjectRepo = z.object({
  project: requiredString('Missing project name or id'),
  source: requiredString('Missing repo source path or Git URL'),
  repoId: OptionalString,
  defaultBranch: OptionalString
})

export const IterationRemoveProjectRepo = z.object({
  project: requiredString('Missing project name or id'),
  repoId: requiredString('Missing repo id')
})

export const IterationImport = z.object({
  // Absolute path to an existing structured project root (holds project.json).
  rootPath: requiredString('Missing project root path')
})

export const IterationDelete = z.object({
  project: requiredString('Missing project name or id'),
  // Off by default: deleting leftover `<workspace>` branches touches the user's
  // source repos and may discard unmerged work, so it is an explicit opt-in.
  deleteBranches: z.boolean().optional()
})

export const IterationCheckGitRepo = z.object({
  path: requiredString('Missing path')
})

export const IterationWorkspaceCopy = z.object({
  project: requiredString('Missing project name or id'),
  source: requiredString('Missing source workspace name'),
  name: requiredString('Missing new workspace name')
})

export const IterationWorkspaceUpdate = z.object({
  project: requiredString('Missing project name or id'),
  workspace: requiredString('Missing workspace name'),
  services: z.array(structuredServiceSpecSchema).default([])
})

// Scan the given repo paths' config fingerprints (pom.xml, package.json,
// application.yml, docker-compose, .env, ...) and report which built-in
// middleware they appear to need, with the matched evidence. Path-based (not
// project-based) so the create wizard can scan queued local repo drafts before
// the project exists on disk.
export const IterationDetectServices = z.object({
  paths: z.array(requiredString('Missing repo path')).default([])
})

export const IterationWorkspaceRemoveRepo = z.object({
  project: requiredString('Missing project name or id'),
  workspace: requiredString('Missing workspace name'),
  repoId: requiredString('Missing repo id')
})
