// On-disk layout convention for a structured project. Centralizes every path
// join so the scaffolder, disk I/O, and worktree mounting all agree on where
// doc/, devops/, src/, and .yoho/workspace.json live. Uses node:path (main-only)
// for cross-platform separators — never import this from the renderer.
import { join } from 'node:path'

export const PROJECT_JSON_FILE = 'project.json'
export const WORKSPACE_META_DIR = '.yoho'
export const WORKSPACE_JSON_FILE = 'workspace.json'
export const DOC_DIR = 'doc'
export const DEVOPS_DIR = 'devops'
export const SRC_DIR = 'src'
export const DEVOPS_COMPOSE_FILE = 'docker-compose.yaml'
export const DEVOPS_ENV_FILE = '.env'
export const DEVOPS_DATA_DIR = 'data'

export function projectJsonPath(rootPath: string): string {
  return join(rootPath, PROJECT_JSON_FILE)
}

export function workspaceDir(rootPath: string, workspaceName: string): string {
  return join(rootPath, workspaceName)
}

export function workspaceMetaDir(wsDir: string): string {
  return join(wsDir, WORKSPACE_META_DIR)
}

export function workspaceJsonPath(wsDir: string): string {
  return join(wsDir, WORKSPACE_META_DIR, WORKSPACE_JSON_FILE)
}

export function docDir(wsDir: string): string {
  return join(wsDir, DOC_DIR)
}

export function devopsDir(wsDir: string): string {
  return join(wsDir, DEVOPS_DIR)
}

export function srcDir(wsDir: string): string {
  return join(wsDir, SRC_DIR)
}

export function srcRepoDir(wsDir: string, repoId: string): string {
  return join(wsDir, SRC_DIR, repoId)
}

export function devopsComposePath(wsDir: string): string {
  return join(wsDir, DEVOPS_DIR, DEVOPS_COMPOSE_FILE)
}

export function devopsEnvPath(wsDir: string): string {
  return join(wsDir, DEVOPS_DIR, DEVOPS_ENV_FILE)
}

export function devopsDataDir(wsDir: string, serviceKind: string): string {
  return join(wsDir, DEVOPS_DIR, DEVOPS_DATA_DIR, serviceKind)
}
