import React, { useState } from 'react'

type SessionState = 'idle' | 'active' | 'paused' | 'completed'
type LeadState = 'none' | 'waiting' | 'calling' | 'on_call' | 'awaiting_disposition' | 'disposed' | 'skipped'

const SESSION_STATES: SessionState[] = ['idle', 'active', 'paused', 'completed']
const LEAD_STATES: LeadState[] = ['none', 'calling', 'on_call', 'awaiting_disposition', 'disposed']

export function PowerDialerPanelShowcase() {
  const [session, setSession] = useState<SessionState>('active')
  const [lead, setLead] = useState<LeadState>('on_call')
  const [dispositionSubmitted, setDispositionSubmitted] = useState(false)

  return (
    <section className="showcase-section">
      <h2>PowerDialerPanel</h2>
      <p>Auto-dialer panel with lead info, queue progress, session controls, and stats.</p>

      <div className="showcase-controls">
        <label>Session:</label>
        {SESSION_STATES.map((s) => (
          <button key={s} data-selected={String(s === session)} onClick={() => setSession(s)}>{s}</button>
        ))}
      </div>
      <div className="showcase-controls">
        <label>Lead:</label>
        {LEAD_STATES.map((s) => (
          <button key={s} data-selected={String(s === lead)} onClick={() => { setLead(s); setDispositionSubmitted(false) }}>{s}</button>
        ))}
      </div>

      <div className="showcase-demo" style={{ maxWidth: 420 }}>
        <div
          data-state={session}
          data-lead-state={lead}
          role="region"
          aria-label="Power dialer"
        >
          {/* LeadInfo */}
          <div data-state={lead}>
            <span data-field="name">Sarah Johnson</span>
            <span data-field="phoneNumber">+1 (555) 234-5678</span>
          </div>

          {/* QueueProgress */}
          <div role="status" aria-label="Queue progress">
            3 of 25
          </div>

          {/* Controls */}
          <div>
            {session === 'idle' && (
              <button data-action="start" aria-label="Start" onClick={() => setSession('active')}>Start</button>
            )}
            {session === 'active' && (
              <>
                <button data-action="pause" aria-label="Pause" onClick={() => setSession('paused')}>Pause</button>
                <button data-action="skip" aria-label="Skip">Skip</button>
                <button data-action="end" aria-label="End" onClick={() => setSession('completed')}>End</button>
              </>
            )}
            {session === 'paused' && (
              <>
                <button data-action="resume" aria-label="Resume" onClick={() => setSession('active')}>Resume</button>
                <button data-action="end" aria-label="End" onClick={() => setSession('completed')}>End</button>
              </>
            )}
            {session === 'completed' && (
              <span style={{ color: 'var(--oex-text-secondary)', fontSize: 14 }}>Session complete</span>
            )}
            {lead === 'awaiting_disposition' && (
              <button
                data-action="disposition"
                data-state={dispositionSubmitted ? 'submitted' : undefined}
                aria-label="Disposition"
                onClick={() => setDispositionSubmitted(true)}
              >
                Disposition
              </button>
            )}
          </div>

          {/* Stats */}
          <div role="status" aria-label="Session statistics">
            <span data-stat="callsCompleted">7</span>
            <span data-stat="callsSkipped">2</span>
            <span data-stat="callsRemaining">16</span>
          </div>
        </div>
      </div>
    </section>
  )
}
