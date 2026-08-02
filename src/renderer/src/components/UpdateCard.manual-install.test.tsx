// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../store'
import { UpdateCard } from './UpdateCard'
import { MANUAL_INSTALL_REQUIRED_MESSAGE } from '../../../shared/updater-manual-install'
import { UPDATE_RELEASES_URL } from '../../../shared/update-feed-origin'

const openUrl = vi.fn()
const download = vi.fn()
const canAutoInstall = vi.fn()

function renderWithAvailableUpdate(): void {
  useAppStore.setState({
    updateStatus: { state: 'available', version: '1.4.200', changelog: null },
    updateChangelog: null,
    dismissedUpdateVersion: null,
    updateCardCollapsed: false,
    updateReassuranceSeen: true
  })
  render(<UpdateCard />)
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  openUrl.mockReset()
  download.mockReset()
  canAutoInstall.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      app: { relaunch: vi.fn() },
      settings: { set: vi.fn().mockResolvedValue(undefined) },
      shell: { openUrl },
      ui: { set: vi.fn().mockResolvedValue(undefined) },
      updater: {
        check: vi.fn(),
        dismissNudge: vi.fn(),
        download,
        canAutoInstall,
        quitAndInstall: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('UpdateCard on a build that cannot install in place', () => {
  it('opens the release page instead of starting a download that could never install', async () => {
    canAutoInstall.mockResolvedValue(false)
    renderWithAvailableUpdate()
    // Let the capability read resolve before asserting on the rendered action.
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Download update' }))

    expect(download).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith(`${UPDATE_RELEASES_URL}/tag/v1.4.200`)
  })

  it('tells the user the install is manual rather than promising uninterrupted sessions', async () => {
    canAutoInstall.mockResolvedValue(false)
    renderWithAvailableUpdate()
    await act(async () => {})

    expect(screen.queryByText(/Sessions won't be interrupted/)).toBeNull()
    expect(screen.getByText(/replace Orca in Applications/)).toBeTruthy()
  })

  it('keeps the in-place update path when the platform supports it', async () => {
    canAutoInstall.mockResolvedValue(true)
    renderWithAvailableUpdate()
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    expect(download).toHaveBeenCalled()
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('renders the manual-install marker as guidance, never as a raw error string', () => {
    canAutoInstall.mockResolvedValue(true)
    renderWithAvailableUpdate()

    act(() =>
      useAppStore
        .getState()
        .setUpdateStatus({ state: 'error', message: MANUAL_INSTALL_REQUIRED_MESSAGE })
    )

    expect(screen.getByText('Manual Install Required')).toBeTruthy()
    expect(screen.queryByText(MANUAL_INSTALL_REQUIRED_MESSAGE)).toBeNull()
  })
})
