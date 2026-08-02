// Whether updates may be fetched given the current license.
//
// Split out from updater.ts so the updater takes a one-function dependency on
// licensing rather than importing the whole service — and so the "never let a
// licensing failure block updates" rule below lives somewhere visible.
import { getLicenseStatus } from './license/license-service'

export function isUpdateAllowedByLicense(): boolean {
  try {
    return getLicenseStatus().usable
  } catch {
    // Fail open. A licensing bug must not strand users on an old build — that
    // would also block the very update that fixes the bug.
    return true
  }
}
