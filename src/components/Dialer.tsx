import React, { forwardRef, useState, useCallback, useEffect } from 'react'
import { useVoice } from '../hooks/useVoice'
import type { OEXCallState } from '../types'

// --- Phone number formatting (internal) ---

function stripToE164(input: string): string {
  const hasPlus = input.startsWith('+')
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''
  // For 10-digit US numbers without country code, prepend 1
  if (digits.length === 10 && !hasPlus) {
    return `+1${digits}`
  }
  return `+${digits}`
}

function formatPhoneNumber(raw: string): string {
  if (!raw) return ''
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''

  // US number: starts with 1 (or 10 digits assumed US)
  const isUS = digits.startsWith('1') || (!hasPlus && digits.length <= 10)
  const usDigits = digits.startsWith('1') ? digits : (digits.length <= 10 ? `1${digits}` : digits)

  if (isUS && usDigits.startsWith('1')) {
    const d = usDigits.slice(1) // digits after country code
    const len = d.length
    if (len === 0) return '+1'
    if (len <= 3) return `+1 (${d}`
    if (len <= 6) return `+1 (${d.slice(0, 3)}) ${d.slice(3)}`
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
  }

  // International
  return `+${digits}`
}

// --- Dialer Props ---

export interface DialerProps {
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
  onCall?: (number: string) => void
  showDtmfKeypad?: boolean
  className?: string
  inputClassName?: string
  callButtonClassName?: string
  keypadClassName?: string
  children?: React.ReactNode | ((state: {
    rawValue: string
    displayValue: string
    callState: OEXCallState
    deviceReady: boolean
    setNumber: (raw: string) => void
    dial: () => void
    hangUp: () => void
    sendDigit: (digit: string) => void
  }) => React.ReactNode)
}

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

export const Dialer = forwardRef<HTMLDivElement, DialerProps>(
  ({ defaultValue, value: controlledValue, onChange, onCall, showDtmfKeypad, className, inputClassName, callButtonClassName, keypadClassName, children }, ref) => {
    const { connect, disconnect, sendDigits, callState, deviceReady } = useVoice()

    const isControlled = controlledValue !== undefined
    const [internalRaw, setInternalRaw] = useState(() => defaultValue ?? '')
    const rawValue = isControlled ? controlledValue : internalRaw
    const displayValue = formatPhoneNumber(rawValue)

    useEffect(() => {
      if (isControlled) {
        setInternalRaw(controlledValue)
      }
    }, [isControlled, controlledValue])

    const setNumber = useCallback(
      (raw: string) => {
        if (!isControlled) setInternalRaw(raw)
        onChange?.(raw)
      },
      [isControlled, onChange],
    )

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const e164 = stripToE164(e.target.value)
        setNumber(e164)
      },
      [setNumber],
    )

    const dial = useCallback(() => {
      if (deviceReady && callState === 'idle' && rawValue) {
        connect(rawValue)
        onCall?.(rawValue)
      }
    }, [deviceReady, callState, rawValue, connect, onCall])

    const hangUp = useCallback(() => {
      disconnect()
    }, [disconnect])

    const sendDigit = useCallback(
      (digit: string) => {
        sendDigits(digit)
      },
      [sendDigits],
    )

    // Render prop / function children
    if (typeof children === 'function') {
      return (
        <div ref={ref} className={className} data-state={callState} data-disabled={String(!deviceReady)}>
          {children({ rawValue, displayValue, callState, deviceReady, setNumber, dial, hangUp, sendDigit })}
        </div>
      )
    }

    // Custom children
    if (children) {
      return (
        <div ref={ref} className={className} data-state={callState} data-disabled={String(!deviceReady)}>
          {children}
        </div>
      )
    }

    const isIdle = callState === 'idle'
    const callDisabled = !deviceReady || !isIdle || !rawValue
    const showKeypad = showDtmfKeypad !== false && callState === 'open'

    return (
      <div ref={ref} className={className} data-state={callState} data-disabled={String(!deviceReady)}>
        <input
          type="tel"
          value={displayValue}
          onChange={handleInputChange}
          aria-label="Phone number"
          className={inputClassName}
        />
        {isIdle ? (
          <button
            onClick={dial}
            disabled={callDisabled}
            aria-label="Start call"
            className={callButtonClassName}
            data-disabled={String(callDisabled)}
          >
            Call
          </button>
        ) : (
          <button
            onClick={hangUp}
            aria-label="Hang up"
            className={callButtonClassName}
            data-state="active"
          >
            Hang up
          </button>
        )}
        {showKeypad && (
          <div role="group" aria-label="Dialpad" className={keypadClassName}>
            {DTMF_KEYS.map((digit) => (
              <button key={digit} onClick={() => sendDigit(digit)} aria-label={`Digit ${digit}`}>
                {digit}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  },
)
Dialer.displayName = 'Dialer'
