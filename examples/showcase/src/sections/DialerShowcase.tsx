import React, { useState } from 'react'

type CallState = 'idle' | 'connecting' | 'ringing' | 'open'

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

export function DialerShowcase() {
  const [value, setValue] = useState('+1 (555) 123-4567')
  const [callState, setCallState] = useState<CallState>('idle')
  const isIdle = callState === 'idle'

  return (
    <section className="showcase-section">
      <h2>Dialer</h2>
      <p>Phone input with formatted display, call button, and DTMF keypad.</p>

      <div className="showcase-controls">
        <label>State:</label>
        {(['idle', 'connecting', 'open'] as CallState[]).map((s) => (
          <button key={s} data-selected={String(s === callState)} onClick={() => setCallState(s)}>{s}</button>
        ))}
      </div>

      <div className="showcase-demo" style={{ maxWidth: 320, margin: '0 auto' }}>
        <div data-state={callState} data-disabled="false">
          <input
            type="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Phone number"
          />
          {isIdle ? (
            <button aria-label="Start call" data-disabled="false">
              Call
            </button>
          ) : (
            <button aria-label="Hang up" data-state="active">
              Hang up
            </button>
          )}
          {callState === 'open' && (
            <div role="group" aria-label="Dialpad">
              {DTMF_KEYS.map((digit) => (
                <button key={digit} aria-label={`Digit ${digit}`}>
                  {digit}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
