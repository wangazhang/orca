// Whether this build can download and apply an update in place, or can only
// point the user at a release page to install manually.
//
// Why this exists: Squirrel.Mac refuses to swap in an update whose code
// signature identity does not match the running app's. Ad-hoc signatures carry
// no stable identity, so on an unsigned macOS build the download succeeds and
// then `quitAndInstall` fails — the worst possible time to find out. Deciding
// up front lets the UI offer a manual download instead of a button that cannot
// work.
//
// Windows and Linux have no equivalent constraint: NSIS and AppImage updates
// apply fine unsigned (see the deliberately absent `signtoolOptions.publisherName`
// in config/electron-builder.config.cjs).

// Set to true once macOS builds are signed with a Developer ID Application
// certificate AND notarized. Until then in-place updates cannot work on macOS.
const MAC_BUILDS_ARE_SIGNED = false

export function canAutoInstallUpdates(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== 'darwin' || MAC_BUILDS_ARE_SIGNED
}
