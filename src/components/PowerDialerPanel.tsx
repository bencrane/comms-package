import React, { createContext, forwardRef, useContext } from 'react'
import { usePowerDialer } from '../hooks/usePowerDialer'
import type { UsePowerDialerReturn } from '../hooks/usePowerDialer'
import type { OEXDialerLead, OEXDialerOptions, OEXDialerSessionStats } from '../types'

// --- Internal context (not exported) ---

const PowerDialerPanelContext = createContext<UsePowerDialerReturn | null>(null)

function usePowerDialerPanelContext(): UsePowerDialerReturn {
  const ctx = useContext(PowerDialerPanelContext)
  if (!ctx) throw new Error('PowerDialerPanel subcomponents must be used within <PowerDialerPanel>')
  return ctx
}

// --- Subcomponents ---

export interface PowerDialerPanelLeadInfoProps {
  className?: string
  children?: (lead: OEXDialerLead | null) => React.ReactNode
}

const LeadInfo = forwardRef<HTMLDivElement, PowerDialerPanelLeadInfoProps>(
  ({ className, children }, ref) => {
    const { currentLead, currentLeadState } = usePowerDialerPanelContext()

    if (typeof children === 'function') {
      return (
        <div ref={ref} className={className} data-state={currentLeadState ?? 'none'}>
          {children(currentLead)}
        </div>
      )
    }

    return (
      <div ref={ref} className={className} data-state={currentLeadState ?? 'none'}>
        {currentLead ? (
          <>
            <span data-field="name">{currentLead.name ?? ''}</span>
            <span data-field="phoneNumber">{currentLead.phoneNumber}</span>
          </>
        ) : (
          <span>No lead</span>
        )}
      </div>
    )
  },
)
LeadInfo.displayName = 'PowerDialerPanel.LeadInfo'

export interface PowerDialerPanelQueueProgressProps {
  className?: string
  children?: (position: number, total: number) => React.ReactNode
}

const QueueProgress = forwardRef<HTMLDivElement, PowerDialerPanelQueueProgressProps>(
  ({ className, children }, ref) => {
    const { queuePosition, stats, sessionState } = usePowerDialerPanelContext()
    const total = stats.totalLeads
    const displayPosition = sessionState === 'idle' ? 0 : queuePosition + 1

    if (typeof children === 'function') {
      return (
        <div ref={ref} className={className} role="status" aria-label="Queue progress">
          {children(displayPosition, total)}
        </div>
      )
    }

    return (
      <div ref={ref} className={className} role="status" aria-label="Queue progress">
        {displayPosition} of {total}
      </div>
    )
  },
)
QueueProgress.displayName = 'PowerDialerPanel.QueueProgress'

export interface PowerDialerPanelControlsProps {
  className?: string
  onDisposition?: (callSid: string) => void
  children?: React.ReactNode
}

const Controls = forwardRef<HTMLDivElement, PowerDialerPanelControlsProps>(
  ({ className, onDisposition, children }, ref) => {
    const {
      sessionState,
      currentLeadState,
      lastCallSid,
      isDispositionSubmitted,
      start,
      pause,
      resume,
      skip,
      endSession,
    } = usePowerDialerPanelContext()

    if (children) {
      return <div ref={ref} className={className}>{children}</div>
    }

    const showDisposition = currentLeadState === 'awaiting_disposition' && lastCallSid !== null

    return (
      <div ref={ref} className={className}>
        {sessionState === 'idle' && (
          <button onClick={start} data-action="start" aria-label="Start">
            Start
          </button>
        )}
        {sessionState === 'active' && (
          <>
            <button onClick={pause} data-action="pause" aria-label="Pause">
              Pause
            </button>
            <button onClick={skip} data-action="skip" aria-label="Skip">
              Skip
            </button>
            <button onClick={endSession} data-action="end" aria-label="End">
              End
            </button>
          </>
        )}
        {sessionState === 'paused' && (
          <>
            <button onClick={resume} data-action="resume" aria-label="Resume">
              Resume
            </button>
            <button onClick={endSession} data-action="end" aria-label="End">
              End
            </button>
          </>
        )}
        {sessionState === 'completed' && (
          <span>Session complete</span>
        )}
        {showDisposition && (
          <button
            onClick={() => lastCallSid && onDisposition?.(lastCallSid)}
            data-action="disposition"
            data-state={isDispositionSubmitted ? 'submitted' : undefined}
            aria-label="Disposition"
          >
            Disposition
          </button>
        )}
      </div>
    )
  },
)
Controls.displayName = 'PowerDialerPanel.Controls'

export interface PowerDialerPanelStatsProps {
  className?: string
  children?: (stats: OEXDialerSessionStats) => React.ReactNode
}

const Stats = forwardRef<HTMLDivElement, PowerDialerPanelStatsProps>(
  ({ className, children }, ref) => {
    const { stats } = usePowerDialerPanelContext()

    if (typeof children === 'function') {
      return (
        <div ref={ref} className={className} role="status" aria-label="Session statistics">
          {children(stats)}
        </div>
      )
    }

    return (
      <div ref={ref} className={className} role="status" aria-label="Session statistics">
        <span data-stat="callsCompleted">{stats.callsCompleted}</span>
        <span data-stat="callsSkipped">{stats.callsSkipped}</span>
        <span data-stat="callsRemaining">{stats.callsRemaining}</span>
      </div>
    )
  },
)
Stats.displayName = 'PowerDialerPanel.Stats'

// --- PowerDialerPanel root ---

export interface PowerDialerPanelProps {
  leads: OEXDialerLead[]
  options?: OEXDialerOptions
  onDisposition?: (callSid: string) => void
  className?: string
  children?: React.ReactNode
}

const PowerDialerPanelRoot = forwardRef<HTMLDivElement, PowerDialerPanelProps>(
  ({ leads, options, onDisposition, className, children }, ref) => {
    const dialer = usePowerDialer(leads, options)

    return (
      <PowerDialerPanelContext.Provider value={dialer}>
        <div
          ref={ref}
          className={className}
          data-state={dialer.sessionState}
          data-lead-state={dialer.currentLeadState ?? 'none'}
          role="region"
          aria-label="Power dialer"
        >
          {children ?? (
            <>
              <LeadInfo />
              <QueueProgress />
              <Controls onDisposition={onDisposition} />
              <Stats />
            </>
          )}
        </div>
      </PowerDialerPanelContext.Provider>
    )
  },
)
PowerDialerPanelRoot.displayName = 'PowerDialerPanel'

export const PowerDialerPanel = Object.assign(PowerDialerPanelRoot, {
  LeadInfo,
  QueueProgress,
  Controls,
  Stats,
})
