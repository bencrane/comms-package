import React, { useState, useEffect } from 'react'

type CallState = 'idle' | 'connecting' | 'ringing' | 'open' | 'reconnecting' | 'pending' | 'closed'

const STATES: CallState[] = ['idle', 'connecting', 'ringing', 'open', 'reconnecting', 'pending', 'closed']

const STATUS_LABELS: Record<CallState, string> = {
  idle: 'Ready',
  connecting: 'Connecting...',
  ringing: 'Ringing',
  open: 'Connected',
  reconnecting: 'Reconnecting...',
  pending: 'Incoming call',
  closed: 'Call ended',
}

export function CallBarShowcase() {
  const [state, setState] = useState<CallState>('open')
  const [muted, setMuted] = useState(false)
  const [held, setHeld] = useState(false)
  const [elapsed, setElapsed] = useState(127)

  useEffect(() => {
    if (state !== 'open') return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <section className="showcase-section">
      <h2>CallBar</h2>
      <p>Horizontal call control bar with state-driven accents, timer, and action buttons.</p>

      <div className="showcase-controls">
        <label>State:</label>
        {STATES.map((s) => (
          <button key={s} data-selected={String(s === state)} onClick={() => setState(s)}>{s}</button>
        ))}
      </div>

      <div className="showcase-demo">
        {/* Mirrors CallBar root */}
        <div
          data-state={state}
          data-muted={String(muted)}
          data-hold={String(held)}
          role="region"
          aria-label="Call controls"
        >
          {/* CallBar.Status */}
          <div data-state={state} aria-live="polite">
            {STATUS_LABELS[state]}
          </div>

          {/* CallBar.CallerInfo */}
          <div>
            <span data-field="from">+1 (555) 867-5309</span>
            <span data-field="to">Outbound call</span>
          </div>

          {/* CallBar.Timer */}
          <div role="timer" aria-label="Call duration">
            {state === 'open' || state === 'reconnecting' ? `${mm}:${ss}` : '00:00'}
          </div>

          {/* CallBar.Controls */}
          <div>
            <button
              aria-pressed={muted}
              aria-label={muted ? 'Unmute' : 'Mute'}
              data-active={String(muted)}
              data-disabled={String(state !== 'open' && state !== 'reconnecting')}
              aria-disabled={state !== 'open' && state !== 'reconnecting'}
              onClick={() => setMuted((m) => !m)}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              aria-pressed={held}
              aria-label={held ? 'Resume' : 'Hold'}
              data-active={String(held)}
              data-disabled={String(state !== 'open' && state !== 'reconnecting')}
              aria-disabled={state !== 'open' && state !== 'reconnecting'}
              onClick={() => setHeld((h) => !h)}
            >
              {held ? 'Resume' : 'Hold'}
            </button>
            <button
              aria-label="Hang up"
              data-disabled={String(state !== 'open' && state !== 'reconnecting')}
              aria-disabled={state !== 'open' && state !== 'reconnecting'}
            >
              Hang up
            </button>
            <button
              aria-label="Disposition"
              data-disabled={String(state !== 'closed')}
              aria-disabled={state !== 'closed'}
            >
              Disposition
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
