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

// Built-in infra middleware a workspace can provision a sandbox for. Kept as a
// closed enum so the compose generator has an image/port table entry for each.
// Custom (user-defined) middleware lives outside this enum — see the service
// spec below, whose `kind` is null for those.
export const STRUCTURED_SERVICE_KINDS = [
  'mysql',
  'redis',
  'postgres',
  'mongo',
  'rocketmq',
  'kafka',
  'elasticsearch',
  'nacos'
] as const
export type StructuredServiceKind = (typeof STRUCTURED_SERVICE_KINDS)[number]

export const structuredServiceKindSchema = z.enum(STRUCTURED_SERVICE_KINDS)

// A provisionable sandbox service. A preset carries a built-in `kind` (image and
// port come from the compose generator's table); a custom service sets kind=null
// and supplies its own image/containerPort. `name` is the unique key, the compose
// service name, and the env-var prefix — for presets it equals the kind.
const serviceSpecBaseSchema = z.object({
  name: z.string().min(1),
  kind: structuredServiceKindSchema.nullable(),
  image: z.string().min(1).optional(),
  containerPort: z.number().int().positive().optional(),
  command: z.string().optional()
})

// A custom service (kind=null) must carry its own image; presets get theirs from
// the built-in table, so image is optional for them.
function serviceSpecHasImageWhenCustom(spec: { kind: unknown; image?: string }): boolean {
  return spec.kind !== null || Boolean(spec.image)
}

const CUSTOM_SERVICE_IMAGE_MESSAGE = 'custom service requires an image'

export const structuredServiceSpecSchema = serviceSpecBaseSchema.refine(
  serviceSpecHasImageWhenCustom,
  { message: CUSTOM_SERVICE_IMAGE_MESSAGE }
)
export type StructuredServiceSpec = z.infer<typeof structuredServiceSpecSchema>

// One middleware surfaced by the config-fingerprint scan, with the evidence that
// triggered it so the UI can explain "why this was pre-checked".
export type ServiceDetectionEvidence = {
  // Absolute path of the scanned repo whose config matched.
  path: string
  // Repo-relative config file the signal was found in.
  file: string
  // The literal signal that matched (e.g. "jdbc:mysql").
  signal: string
}

export type DetectedService = {
  kind: StructuredServiceKind
  evidence: ServiceDetectionEvidence[]
}

// ─── project.json ───────────────────────────────────────────────────

const projectMemberSchema = z.object({
  // Human-readable repo key used as the repos/<repoId> directory name.
  repoId: z.string().min(1),
  // Absolute path or remote URL the worktree is created from.
  source: z.string().min(1),
  defaultBranch: z.string().min(1)
})

// Back-compat: older project.json stored services as a bare kind-string array
// (e.g. ["mysql","redis"]). Normalize each element to a spec before validation
// so those files still load — disk is the hand-editable source of truth.
const projectServiceSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return { name: value, kind: value }
  }
  return value
}, structuredServiceSpecSchema)

export const structuredProjectFileSchema = z.object({
  name: z.string().min(1),
  members: z.array(projectMemberSchema),
  services: z.array(projectServiceSchema),
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

// Per-service host port assignment for the workspace's isolated sandbox. Carries
// the full service spec (so custom middleware keeps its image/port) plus the
// allocated host port.
const workspaceServiceObjectSchema = serviceSpecBaseSchema.extend({
  hostPort: z.number().int().positive()
})

// Back-compat: older workspace.json stored { kind, hostPort } without a name.
// Fill name from kind before validation so those files still load.
const workspaceServiceSchema = z.preprocess(
  (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      if (!('name' in record) && typeof record.kind === 'string') {
        return { ...record, name: record.kind }
      }
    }
    return value
  },
  workspaceServiceObjectSchema.refine(serviceSpecHasImageWhenCustom, {
    message: CUSTOM_SERVICE_IMAGE_MESSAGE
  })
)

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
