// Product name for user-visible copy in the renderer, where app.getName() is
// not reachable. Must match productName in package.json and electron-builder,
// and BASE_APP_NAME in src/main/startup/dev-instance-identity.ts — a literal
// product name baked into a string silently keeps showing the old brand after a
// rename, which is exactly how "Activate Orca" survived into a Yoha build.
export const APP_DISPLAY_NAME = 'Yoha'

export type AppIdentity = {
  name: string
  isDev: boolean
  devLabel: string | null
  devBranch: string | null
  devWorktreeName: string | null
  devRepoRoot: string | null
  dockBadgeLabel: string | null
}
