// Zod request schemas for the structured-project (iteration.*) RPC methods.
// Split out of project-runtime-rpc-methods so that file stays under the
// max-lines budget and the iteration contract is greppable in one place.
import { z } from 'zod'
import { OptionalString, requiredString } from '../schemas'
import { structuredServiceKindSchema } from '../../../../shared/structured-project-schema'

export const IterationCreate = z.object({
  name: requiredString('Missing project name'),
  services: z.array(structuredServiceKindSchema).default([]),
  rootPath: OptionalString
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
  services: z.array(structuredServiceKindSchema).default([])
})

export const IterationWorkspaceRemoveRepo = z.object({
  project: requiredString('Missing project name or id'),
  workspace: requiredString('Missing workspace name'),
  repoId: requiredString('Missing repo id')
})
