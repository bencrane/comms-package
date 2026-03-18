import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PowerDialerPanel } from '../../src/components/PowerDialerPanel'
import { usePowerDialer } from '../../src/hooks/usePowerDialer'
import type { OEXDialerLead } from '../../src/types'

vi.mock('../../src/hooks/usePowerDialer', () => ({ usePowerDialer: vi.fn() }))

const mockUsePowerDialer = usePowerDialer as ReturnType<typeof vi.fn>

const testLeads: OEXDialerLead[] = [
  { id: '1', phoneNumber: '+15551111111', name: 'Alice' },
  { id: '2', phoneNumber: '+15552222222', name: 'Bob' },
  { id: '3', phoneNumber: '+15553333333', name: 'Charlie' },
]

function setupMocks(overrides: {
  sessionState?: string
  currentLead?: OEXDialerLead | null
  currentLeadState?: string | null
  queuePosition?: number
  stats?: Record<string, unknown>
  lastCallSid?: string | null
  isDispositionSubmitted?: boolean
} = {}) {
  mockUsePowerDialer.mockReturnValue({
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    endSession: vi.fn(),
    sessionState: overrides.sessionState ?? 'idle',
    currentLead: overrides.currentLead ?? null,
    queuePosition: overrides.queuePosition ?? 0,
    stats: overrides.stats ?? {
      totalLeads: 3,
      callsCompleted: 0,
      callsSkipped: 0,
      callsRemaining: 3,
      outcomes: {},
      sessionStartedAt: null,
      sessionDurationMs: 0,
    },
    results: [],
    currentLeadState: overrides.currentLeadState ?? null,
    callState: 'idle',
    callInfo: null,
    deviceReady: true,
    disconnect: vi.fn(),
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute: vi.fn(),
    setDisposition: vi.fn(),
    isDispositionSubmitting: false,
    isDispositionSubmitted: overrides.isDispositionSubmitted ?? false,
    lastCallSid: overrides.lastCallSid ?? null,
    error: null,
  })
}

describe('PowerDialerPanel', () => {
  it('renders with data-state matching sessionState', () => {
    setupMocks({ sessionState: 'active' })
    const { container } = render(<PowerDialerPanel leads={testLeads} />)
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('active')
  })

  it('LeadInfo shows current lead name and phone number', () => {
    setupMocks({
      sessionState: 'active',
      currentLead: testLeads[0],
      currentLeadState: 'dialing',
    })
    render(<PowerDialerPanel leads={testLeads} />)
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('+15551111111')).toBeDefined()
  })

  it('Controls shows Start button when session is idle', () => {
    setupMocks({ sessionState: 'idle' })
    render(<PowerDialerPanel leads={testLeads} />)
    expect(screen.getByLabelText('Start')).toBeDefined()
  })

  it('Controls shows Pause/Skip/End buttons when session is active', () => {
    setupMocks({ sessionState: 'active', currentLead: testLeads[0], currentLeadState: 'on_call' })
    render(<PowerDialerPanel leads={testLeads} />)
    expect(screen.getByLabelText('Pause')).toBeDefined()
    expect(screen.getByLabelText('Skip')).toBeDefined()
    expect(screen.getByLabelText('End')).toBeDefined()
  })

  it('Controls shows Resume/End buttons when session is paused', () => {
    setupMocks({ sessionState: 'paused' })
    render(<PowerDialerPanel leads={testLeads} />)
    expect(screen.getByLabelText('Resume')).toBeDefined()
    expect(screen.getByLabelText('End')).toBeDefined()
  })

  it('QueueProgress shows correct position (1-indexed) and total', () => {
    setupMocks({ sessionState: 'active', queuePosition: 1, currentLead: testLeads[1] })
    render(<PowerDialerPanel leads={testLeads} />)
    expect(screen.getByLabelText('Queue progress').textContent).toBe('2 of 3')
  })

  it('Stats renders callsCompleted, callsSkipped, callsRemaining', () => {
    setupMocks({
      sessionState: 'active',
      stats: {
        totalLeads: 3,
        callsCompleted: 1,
        callsSkipped: 1,
        callsRemaining: 1,
        outcomes: {},
        sessionStartedAt: Date.now(),
        sessionDurationMs: 5000,
      },
    })
    render(<PowerDialerPanel leads={testLeads} />)
    const statsEl = screen.getByLabelText('Session statistics')
    expect(statsEl.querySelector('[data-stat="callsCompleted"]')?.textContent).toBe('1')
    expect(statsEl.querySelector('[data-stat="callsSkipped"]')?.textContent).toBe('1')
    expect(statsEl.querySelector('[data-stat="callsRemaining"]')?.textContent).toBe('1')
  })
})
