import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  devopsComposePath,
  devopsDataDir,
  devopsEnvPath,
  docDir,
  devopsDir,
  projectJsonPath,
  workspaceReposDir,
  workspaceRepoDir,
  workspaceDir,
  workspaceJsonPath,
  workspaceMetaDir
} from './structured-project-layout'

const root = join('/abs', 'orca', 'projects', 'Penguin-go')
const ws = workspaceDir(root, 'youho')

describe('structured project layout', () => {
  it('places project.json at the project root', () => {
    expect(projectJsonPath(root)).toBe(join(root, 'project.json'))
  })

  it('resolves a workspace directory as a child of the root', () => {
    expect(ws).toBe(join(root, 'youho'))
  })

  it('nests workspace metadata under .yoho/workspace.json', () => {
    expect(workspaceMetaDir(ws)).toBe(join(ws, '.yoho'))
    expect(workspaceJsonPath(ws)).toBe(join(ws, '.yoho', 'workspace.json'))
  })

  it('exposes doc/ devops/ src/ as workspace children', () => {
    expect(docDir(ws)).toBe(join(ws, 'doc'))
    expect(devopsDir(ws)).toBe(join(ws, 'devops'))
    expect(workspaceReposDir(ws)).toBe(join(ws, 'repos'))
  })

  it('places each member repo under src/<repoId>', () => {
    expect(workspaceRepoDir(ws, 'qa-pk')).toBe(join(ws, 'repos', 'qa-pk'))
  })

  it('places compose, env, and per-service data under devops/', () => {
    expect(devopsComposePath(ws)).toBe(join(ws, 'devops', 'docker-compose.yaml'))
    expect(devopsEnvPath(ws)).toBe(join(ws, 'devops', '.env'))
    expect(devopsDataDir(ws, 'mysql')).toBe(join(ws, 'devops', 'data', 'mysql'))
  })
})
