import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ITERATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['iteration', 'create'],
    summary: 'Create a structured project (physical root with project.json)',
    usage:
      'orca iteration create --name <name> [--services mysql,redis,postgres,mongo] [--root <path>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'services', 'root'],
    notes: [
      'Creates ~/orca/projects/<name>/project.json by default, or under --root.',
      'Services seed the workspace sandbox (docker-compose) when workspaces are created.'
    ],
    examples: [
      'orca iteration create --name Penguin-go --services mysql,redis',
      'orca iteration create --name Demo --root ~/work/Demo --json'
    ]
  },
  {
    path: ['iteration', 'workspace', 'create'],
    summary: 'Create an isolated workspace (iteration) under a structured project',
    usage: 'orca iteration workspace create --project <name> --name <workspace> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'name'],
    notes: ['Scaffolds doc/ devops/ src/ and an isolated sandbox with allocated host ports.'],
    examples: ['orca iteration workspace create --project Penguin-go --name youho']
  },
  {
    path: ['iteration', 'workspace', 'add-repo'],
    summary: 'Mount a source repo into a workspace as a git worktree under src/',
    usage:
      'orca iteration workspace add-repo --project <name> --workspace <workspace> --source <repo-path> [--repo-id <id>] [--default-branch <branch>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'workspace', 'source', 'repo-id', 'default-branch'],
    notes: [
      'Creates a git worktree at src/<repo-id> on a branch named after the workspace.',
      '--source is an existing local git repository path.'
    ],
    examples: [
      'orca iteration workspace add-repo --project Penguin-go --workspace youho --source ~/src/qa-pk'
    ]
  },
  {
    path: ['iteration', 'list'],
    summary: 'List structured projects discovered under ~/orca/projects',
    usage: 'orca iteration list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca iteration list', 'orca iteration list --json']
  },
  {
    path: ['iteration', 'delete'],
    summary: 'Delete a structured project (its root, records, and optionally branches)',
    usage: 'orca iteration delete --project <name> [--delete-branches] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'delete-branches'],
    notes: [
      'Removes the on-disk project root and its materialized orca records.',
      'Leftover <workspace> branches in source repos are LISTED but kept by default.',
      'Pass --delete-branches to also delete them (skips any still in use).'
    ],
    examples: [
      'orca iteration delete --project Penguin-go',
      'orca iteration delete --project Penguin-go --delete-branches'
    ]
  }
]
