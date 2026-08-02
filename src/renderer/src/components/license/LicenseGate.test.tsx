// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LicenseGate } from './LicenseGate'
import { GRACE_PERIOD_DAYS, type LicenseStatus } from '../../../../shared/license-state'
import { LicenseStatusBanner } from './LicenseStatusBanner'

const activate = vi.fn()

function statusOf(overrides: Partial<LicenseStatus> = {}): LicenseStatus {
  return {
    state: 'expired',
    daysRemaining: -10,
    expiresAt: 1_750_000_000_000,
    licensee: 'Acme Corp',
    usable: false,
    shouldWarn: true,
    machineId: 'abc123def456',
    enforced: true,
    ...overrides
  }
}

beforeEach(() => {
  activate.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { license: { activate, getStatus: vi.fn() } }
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  })
})

afterEach(cleanup)

describe('LicenseGate', () => {
  it('explains the expiry and offers activation', () => {
    render(<LicenseGate status={statusOf()} onActivated={vi.fn()} />)
    expect(screen.getByText('Your license has expired')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Activate' })).toBeTruthy()
  })

  it('shows the machine ID so the user can request a bound license', () => {
    render(<LicenseGate status={statusOf({ state: 'machine-mismatch' })} onActivated={vi.fn()} />)
    expect(screen.getByText('License issued for another computer')).toBeTruthy()
    expect(screen.getByText('abc123def456')).toBeTruthy()
  })

  it('tells the user re-entering the same invalid key will not help', () => {
    render(<LicenseGate status={statusOf({ state: 'invalid' })} onActivated={vi.fn()} />)
    expect(screen.getByText(/will not help/)).toBeTruthy()
  })

  it('reports the status back to the caller after a successful activation', async () => {
    const activated = statusOf({ state: 'valid', usable: true })
    activate.mockResolvedValue({ ok: true, status: activated })
    const onActivated = vi.fn()
    render(<LicenseGate status={statusOf()} onActivated={onActivated} />)

    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'ORCA1.a.b' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    })

    expect(activate).toHaveBeenCalledWith('ORCA1.a.b')
    expect(onActivated).toHaveBeenCalledWith(activated)
  })

  it('surfaces a rejection reason without dismissing the gate', async () => {
    activate.mockResolvedValue({ ok: false, reason: 'machine-mismatch' })
    const onActivated = vi.fn()
    render(<LicenseGate status={statusOf()} onActivated={onActivated} />)

    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'ORCA1.a.b' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    })

    expect(screen.getByText(/bound to a different computer/)).toBeTruthy()
    expect(onActivated).not.toHaveBeenCalled()
  })

  it('refuses to submit an empty key', () => {
    render(<LicenseGate status={statusOf()} onActivated={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Activate' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('LicenseStatusBanner', () => {
  it('stays out of the way while the license is comfortably valid', () => {
    const { container } = render(
      <LicenseStatusBanner
        status={statusOf({ state: 'valid', usable: true, shouldWarn: false, daysRemaining: 200 })}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('warns as expiry approaches', () => {
    render(
      <LicenseStatusBanner
        status={statusOf({ state: 'valid', usable: true, shouldWarn: true, daysRemaining: 5 })}
      />
    )
    expect(screen.getByText(/expires in 5 day/)).toBeTruthy()
  })

  it('counts down the remaining grace days, not the negative day count', () => {
    render(
      <LicenseStatusBanner
        status={statusOf({ state: 'grace', usable: true, shouldWarn: true, daysRemaining: -2 })}
      />
    )
    expect(screen.getByText(new RegExp(`${GRACE_PERIOD_DAYS - 2} more day`))).toBeTruthy()
  })

  it('renders nothing once locked — the gate already covers that case', () => {
    const { container } = render(<LicenseStatusBanner status={statusOf()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the build does not enforce licensing', () => {
    const { container } = render(
      <LicenseStatusBanner status={statusOf({ enforced: false, usable: true, state: 'valid' })} />
    )
    expect(container.firstChild).toBeNull()
  })
})
