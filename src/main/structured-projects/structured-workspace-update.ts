// Updates the set of infra services a workspace provisions. Diffs the requested
// service kinds against the workspace's current sandbox: kept services retain
// their already-allocated host ports, newly-added ones get fresh ports (skipping
// the kept ones so they never collide), removed ones are dropped. Then it
// regenerates docker-compose.yaml + .env and rewrites workspace.json to match.
// Mirrors createStructuredWorkspace's port-then-generate flow so a workspace's
// sandbox looks identical whether it was created or updated.
import { mkdirSync } from 'node:fs'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { generateDevopsSandbox } from './compose-generator'
import { assignServicePorts } from './port-allocation'
import { readWorkspaceFile, writeWorkspaceFile } from './structured-project-disk'
import {
  devopsComposePath,
  devopsDataDir,
  devopsEnvPath,
  workspaceDir
} from './structured-project-layout'
import { resolveProject } from './structured-project-service'
import type {
  StructuredServiceSpec,
  StructuredWorkspaceFile,
  StructuredWorkspaceService
} from '../../shared/structured-project-schema'

export async function updateStructuredWorkspaceServicesService(params: {
  project: string
  workspace: string
  services: StructuredServiceSpec[]
}): Promise<StructuredWorkspaceFile> {
  const { rootPath } = resolveProject(params.project)
  const wsDir = workspaceDir(rootPath, params.workspace)

  const read = readWorkspaceFile(wsDir)
  if (!read.ok) {
    throw new Error(`Workspace not found: ${params.workspace} (${read.error})`)
  }
  const current = read.value

  const services = await diffServices(current.services, params.services)

  // Each service's bind mount needs a data dir target; make the new ones (mkdir
  // is idempotent for kept services). Removed services' data dirs are left in
  // place — dropping user data on a service toggle would be surprising.
  for (const service of services) {
    mkdirSync(devopsDataDir(wsDir, service.name), { recursive: true })
  }

  // Regenerate the sandbox from the new service set and rewrite it in place.
  const sandbox = generateDevopsSandbox(services)
  writeFileAtomically(devopsComposePath(wsDir), sandbox.composeYaml)
  writeFileAtomically(devopsEnvPath(wsDir), sandbox.envFile)

  // Immutable rewrite: a new workspace file with the new services array.
  const updated: StructuredWorkspaceFile = { ...current, services }
  writeWorkspaceFile(wsDir, updated)
  return updated
}

// Builds the new services array in the requested order: kept services keep their
// existing host port (matched by name), new ones are allocated ports that avoid
// the kept ones. The requested spec wins for image/command (user may have edited
// a custom service); only the port is preserved.
async function diffServices(
  current: readonly StructuredWorkspaceService[],
  requested: readonly StructuredServiceSpec[]
): Promise<StructuredWorkspaceService[]> {
  const currentByName = new Map(current.map((service) => [service.name, service.hostPort]))

  // Reserve already-allocated ports so freshly-added services never reuse one.
  const reserved = new Set<number>()
  for (const spec of requested) {
    const port = currentByName.get(spec.name)
    if (port !== undefined) {
      reserved.add(port)
    }
  }

  const newSpecs = requested.filter((spec) => !currentByName.has(spec.name))
  const allocated = await assignServicePorts(newSpecs, { reserved })
  const allocatedByName = new Map(allocated.map((service) => [service.name, service.hostPort]))

  return requested.map((spec) => {
    const port = currentByName.get(spec.name) ?? allocatedByName.get(spec.name)
    if (port === undefined) {
      // Defensive: every requested service is either kept or freshly allocated.
      throw new Error(`Failed to assign a host port for service "${spec.name}"`)
    }
    return { ...spec, hostPort: port }
  })
}
