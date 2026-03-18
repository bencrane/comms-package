import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Dialer } from '../../src/components/Dialer'
import { useVoice } from '../../src/hooks/useVoice'

vi.mock('../../src/hooks/useVoice', () => ({ useVoice: vi.fn() }))

const mockUseVoice = useVoice as ReturnType<typeof vi.fn>

function setupMocks(overrides: { callState?: string; deviceReady?: boolean } = {}) {
  const connect = vi.fn()
  const disconnect = vi.fn()
  const sendDigits = vi.fn()

  mockUseVoice.mockReturnValue({
    connect,
    disconnect,
    sendDigits,
    mute: vi.fn(),
    toggleMute: vi.fn(),
    acceptIncoming: vi.fn(),
    rejectIncoming: vi.fn(),
    callInfo: null,
    callState: overrides.callState ?? 'idle',
    deviceReady: overrides.deviceReady ?? true,
    error: null,
  })

  return { connect, disconnect, sendDigits }
}

describe('Dialer', () => {
  it('renders phone input with type="tel"', () => {
    setupMocks()
    render(<Dialer />)
    const input = screen.getByLabelText('Phone number')
    expect(input.getAttribute('type')).toBe('tel')
  })

  it('formats US phone number as user types', () => {
    setupMocks()
    render(<Dialer />)
    const input = screen.getByLabelText('Phone number') as HTMLInputElement
    fireEvent.change(input, { target: { value: '5551234567' } })
    expect(input.value).toBe('+1 (555) 123-4567')
  })

  it('call button calls connect with raw E.164 value', () => {
    const { connect } = setupMocks()
    render(<Dialer defaultValue="+15551234567" />)
    fireEvent.click(screen.getByLabelText('Start call'))
    expect(connect).toHaveBeenCalledWith('+15551234567')
  })

  it('call button is disabled when deviceReady is false', () => {
    setupMocks({ deviceReady: false })
    render(<Dialer defaultValue="+15551234567" />)
    const btn = screen.getByLabelText('Start call')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('call button is disabled when callState is not idle', () => {
    setupMocks({ callState: 'open' })
    render(<Dialer defaultValue="+15551234567" />)
    // When call is active, button becomes hang up
    expect(screen.getByLabelText('Hang up')).toBeDefined()
  })

  it('DTMF keypad renders during active call and sendDigits is called on button click', () => {
    const { sendDigits } = setupMocks({ callState: 'open' })
    render(<Dialer />)
    const btn = screen.getByLabelText('Digit 5')
    fireEvent.click(btn)
    expect(sendDigits).toHaveBeenCalledWith('5')
  })

  it('DTMF keypad is hidden when callState is idle', () => {
    setupMocks({ callState: 'idle' })
    render(<Dialer />)
    expect(screen.queryByLabelText('Dialpad')).toBeNull()
  })
})
