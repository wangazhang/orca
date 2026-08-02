// Marker message for "this platform cannot apply updates in place". Main sends
// it as an error status when a download is attempted on a build that can only
// install manually; the renderer matches on it to show the manual-download card
// instead of a generic failure.
//
// Why a shared sentinel rather than prose matching: the renderer must classify
// this case exactly, and the user-facing wording is localized and free to change.
export const MANUAL_INSTALL_REQUIRED_MESSAGE = 'ORCA_MANUAL_INSTALL_REQUIRED'

export function isManualInstallRequiredFailure(message: string): boolean {
  return message.includes(MANUAL_INSTALL_REQUIRED_MESSAGE)
}
