// Scaffolds a structured project on disk: the project root + project.json, and
// per-workspace the doc/ devops/ src/ .yoho layout with an isolated sandbox
// (allocated ports + generated compose/.env). Pure filesystem — no store — so
// it is unit-testable against a temp directory and reusable from CLI/RPC.
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { generateDevopsSandbox } from './compose-generator'
import { assignServicePorts } from './port-allocation'
import { writeProjectFile, writeWorkspaceFile } from './structured-project-disk'
import {
  devopsComposePath,
  devopsDataDir,
  devopsDir,
  devopsEnvPath,
  docDir,
  srcDir,
  workspaceDir
} from './structured-project-layout'
import type {
  StructuredProjectFile,
  StructuredServiceKind,
  StructuredWorkspaceFile
} from '../../shared/structured-project-schema'

type PortAllocationOptions = {
  reserved?: Iterable<number>
  rangeStart?: number
  rangeEnd?: number
  probe?: boolean
}

export type CreatedStructuredProject = {
  id: string
  rootPath: string
  project: StructuredProjectFile
}

export function createStructuredProject(params: {
  name: string
  rootPath: string
  services: StructuredServiceKind[]
  now?: number
}): CreatedStructuredProject {
  const now = params.now ?? Date.now()
  mkdirSync(params.rootPath, { recursive: true })
  const project: StructuredProjectFile = {
    name: params.name,
    members: [],
    services: params.services,
    createdAt: new Date(now).toISOString()
  }
  writeProjectFile(params.rootPath, project)
  return { id: randomUUID(), rootPath: params.rootPath, project }
}

export type CreatedStructuredWorkspace = {
  wsDir: string
  workspace: StructuredWorkspaceFile
}

export async function createStructuredWorkspace(params: {
  rootPath: string
  projectName: string
  workspaceName: string
  services: StructuredServiceKind[]
  now?: number
  portOptions?: PortAllocationOptions
}): Promise<CreatedStructuredWorkspace> {
  const now = params.now ?? Date.now()
  const wsDir = workspaceDir(params.rootPath, params.workspaceName)

  // Fixed workspace skeleton: doc/ devops/ src/.
  mkdirSync(docDir(wsDir), { recursive: true })
  mkdirSync(devopsDir(wsDir), { recursive: true })
  mkdirSync(srcDir(wsDir), { recursive: true })

  // Isolated sandbox: one host port per service, generated compose + .env, and a
  // data volume directory per service so bind mounts have a target.
  const services = await assignServicePorts(params.services, params.portOptions)
  for (const service of services) {
    mkdirSync(devopsDataDir(wsDir, service.kind), { recursive: true })
  }
  const sandbox = generateDevopsSandbox(services)
  writeFileAtomically(devopsComposePath(wsDir), sandbox.composeYaml)
  writeFileAtomically(devopsEnvPath(wsDir), sandbox.envFile)

  const workspace: StructuredWorkspaceFile = {
    name: params.workspaceName,
    project: params.projectName,
    worktrees: [],
    infraMode: 'isolated',
    services,
    createdAt: new Date(now).toISOString()
  }
  writeWorkspaceFile(wsDir, workspace)
  return { wsDir, workspace }
}
