// On-disk layout convention for a structured project. Centralizes every path
// join so the scaffolder, disk I/O, and worktree mounting all agree on where
// doc/, devops/, repos/, and .yoho/workspace.json live. Uses node:path (main-only)
// for cross-platform separators — never import this from the renderer.
import { join } from 'node:path'

export const PROJECT_JSON_FILE = 'project.json'
export const WORKSPACE_META_DIR = '.yoho'
export const WORKSPACE_JSON_FILE = 'workspace.json'
export const DOC_DIR = 'doc'
export const DEVOPS_DIR = 'devops'
// Per-workspace folder holding one worktree per mounted repo. Named "repos"
// (was "src") so the folder says what it contains. Workspaces created by older
// builds still have src/ on disk and keep working — their absolute worktree
// paths live in workspace.json, and the sidebar accepts both segment names.
export const WORKSPACE_REPOS_DIR = 'repos'
// Legacy name of the same per-workspace folder, kept so readers can recognize
// workspaces scaffolded before the rename.
export const LEGACY_WORKSPACE_REPOS_DIR = 'src'
// Project-level (not per-workspace) directory holding bare source clones for
// members added by Git URL. The clone lands here once; each workspace worktree
// still branches off it.
export const REPOS_DIR = 'repos'
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

export function workspaceReposDir(wsDir: string): string {
  return join(wsDir, WORKSPACE_REPOS_DIR)
}

// Project-level directory (not per-workspace) where Git-URL members are cloned.
export function reposDir(rootPath: string): string {
  return join(rootPath, REPOS_DIR)
}

export function workspaceRepoDir(wsDir: string, repoId: string): string {
  return join(wsDir, WORKSPACE_REPOS_DIR, repoId)
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
