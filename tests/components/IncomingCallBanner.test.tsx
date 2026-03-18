import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { IncomingCallBanner } from '../../src/components/IncomingCallBanner'
import { useVoice } from '../../src/hooks/useVoice'

vi.mock('../../src/hooks/useVoice', () => ({ useVoice: vi.fn() }))

const mockUseVoice = useVoice as ReturnType<typeof vi.fn>

function setupMocks(overrides: { callState?: string; callInfo?: Record<string, unknown> | null } = {}) {
  const acceptIncoming = vi.fn()
  const rejectIncoming = vi.fn()

  mockUseVoice.mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute: vi.fn(),
    acceptIncoming,
    rejectIncoming,
    callInfo: overrides.callInfo ?? null,
    callState: overrides.callState ?? 'idle',
    deviceReady: true,
    error: null,
  })

  return { acceptIncoming, rejectIncoming }
}

describe('IncomingCallBanner', () => {
  it('renders nothing when callState is not pending', () => {
    setupMocks({ callState: 'idle' })
    const { container } = render(<IncomingCallBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders with role="alertdialog" when callState is pending', () => {
    setupMocks({
      callState: 'pending',
      callInfo: { from: '+15551111111', to: '+15552222222', isMuted: false, callSid: null, direction: 'inbound' },
    })
    render(<IncomingCallBanner />)
    expect(screen.getByRole('alertdialog')).toBeDefined()
  })

  it('accept button calls acceptIncoming and onAccept callback', () => {
    const { acceptIncoming } = setupMocks({
      callState: 'pending',
      callInfo: { from: '+15551111111', to: '+15552222222', isMuted: false, callSid: null, direction: 'inbound' },
    })
    const onAccept = vi.fn()
    render(<IncomingCallBanner onAccept={onAccept} />)
    fireEvent.click(screen.getByLabelText('Accept call'))
    expect(acceptIncoming).toHaveBeenCalled()
    expect(onAccept).toHaveBeenCalled()
  })

  it('reject button calls rejectIncoming and onReject callback', () => {
    const { rejectIncoming } = setupMocks({
      callState: 'pending',
      callInfo: { from: '+15551111111', to: '+15552222222', isMuted: false, callSid: null, direction: 'inbound' },
    })
    const onReject = vi.fn()
    render(<IncomingCallBanner onReject={onReject} />)
    fireEvent.click(screen.getByLabelText('Reject call'))
    expect(rejectIncoming).toHaveBeenCalled()
    expect(onReject).toHaveBeenCalled()
  })

  it('shows caller info (from) when callInfo is available', () => {
    setupMocks({
      callState: 'pending',
      callInfo: { from: '+15559876543', to: '+15551111111', isMuted: false, callSid: null, direction: 'inbound' },
    })
    render(<IncomingCallBanner />)
    expect(screen.getByText('+15559876543')).toBeDefined()
  })
})
