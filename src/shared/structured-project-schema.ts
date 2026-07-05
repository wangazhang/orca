/* Why: project.json and .yoho/workspace.json are the on-disk source of truth for
 * structured projects — they are hand-editable and git-tracked, so a truncated
 * write or a field-type drift from an older build must never crash main or the
 * renderer. Validating at the read boundary gives one "reject with a reason"
 * point. Unlike the workspace-session cache, these files hold user project data,
 * so a parse failure surfaces an error to the caller instead of silently
 * collapsing to defaults (which would look like data loss).
 *
 * Policy: tolerant of unknown/extra fields (future builds may add more), strict
 * about the types of the fields we read.
 */
import { z } from 'zod'

// Infra services a workspace can provision an isolated sandbox for. Kept as a
// closed enum so compose generation can switch exhaustively per kind.
export const STRUCTURED_SERVICE_KINDS = ['mysql', 'redis', 'postgres', 'mongo'] as const
export type StructuredServiceKind = (typeof STRUCTURED_SERVICE_KINDS)[number]

export const structuredServiceKindSchema = z.enum(STRUCTURED_SERVICE_KINDS)

// ─── project.json ───────────────────────────────────────────────────

const projectMemberSchema = z.object({
  // Human-readable repo key used as the src/<repoId> directory name.
  repoId: z.string().min(1),
  // Absolute path or remote URL the worktree is created from.
  source: z.string().min(1),
  defaultBranch: z.string().min(1)
})

export const structuredProjectFileSchema = z.object({
  name: z.string().min(1),
  members: z.array(projectMemberSchema),
  services: z.array(structuredServiceKindSchema),
  createdAt: z.string().min(1)
})

export type StructuredProjectMember = z.infer<typeof projectMemberSchema>
export type StructuredProjectFile = z.infer<typeof structuredProjectFileSchema>

// ─── .yoho/workspace.json ───────────────────────────────────────────

const workspaceWorktreeSchema = z.object({
  repoId: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().min(1)
})

// Per-service host port assignment for the workspace's isolated sandbox.
const workspaceServiceSchema = z.object({
  kind: structuredServiceKindSchema,
  hostPort: z.number().int().positive()
})

// 'isolated' = each workspace gets its own sandbox + ports; 'shared' reserved
// for a future project-wide single sandbox.
export const structuredInfraModeSchema = z.enum(['isolated', 'shared'])
export type StructuredInfraMode = z.infer<typeof structuredInfraModeSchema>

export const structuredWorkspaceFileSchema = z.object({
  name: z.string().min(1),
  project: z.string().min(1),
  worktrees: z.array(workspaceWorktreeSchema),
  infraMode: structuredInfraModeSchema,
  services: z.array(workspaceServiceSchema),
  createdAt: z.string().min(1)
})

export type StructuredWorkspaceWorktree = z.infer<typeof workspaceWorktreeSchema>
export type StructuredWorkspaceService = z.infer<typeof workspaceServiceSchema>
export type StructuredWorkspaceFile = z.infer<typeof structuredWorkspaceFileSchema>

// ─── parse helpers ──────────────────────────────────────────────────

export type StructuredParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

export function parseProjectJson(raw: unknown): StructuredParseResult<StructuredProjectFile> {
  const result = structuredProjectFileSchema.safeParse(raw)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) }
}

export function parseWorkspaceJson(raw: unknown): StructuredParseResult<StructuredWorkspaceFile> {
  const result = structuredWorkspaceFileSchema.safeParse(raw)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) }
}
