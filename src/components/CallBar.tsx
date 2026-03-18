import React, { createContext, forwardRef, useContext, useEffect, useRef, useState } from 'react'
import { useVoice } from '../hooks/useVoice'
import { useDevice } from '../hooks/useDevice'
import { useCallActions } from '../hooks/useCallActions'
import type { OEXCallInfo, OEXCallState, OEXCallDirection } from '../types'

// --- Internal context (not exported) ---

interface CallBarContextValue {
  callState: OEXCallState
  callInfo: OEXCallInfo | null
  deviceReady: boolean
  isMuted: boolean
  isOnHold: boolean
  elapsedSeconds: number
  toggleMute: () => void
  hold: () => Promise<void>
  unhold: () => Promise<void>
  disconnect: () => void
  onDisposition?: (callSid: string) => void
}

const CallBarContext = createContext<CallBarContextValue | null>(null)

function useCallBarContext(): CallBarContextValue {
  const ctx = useContext(CallBarContext)
  if (!ctx) throw new Error('CallBar subcomponents must be used within <CallBar>')
  return ctx
}

// --- Subcomponents ---

export interface CallBarStatusProps {
  className?: string
  children?: React.ReactNode
}

const STATUS_LABELS: Record<OEXCallState, string> = {
  idle: 'Ready',
  connecting: 'Connecting...',
  ringing: 'Ringing',
  open: 'Connected',
  reconnecting: 'Reconnecting...',
  pending: 'Incoming call',
  closed: 'Call ended',
}

const CallBarStatus = forwardRef<HTMLDivElement, CallBarStatusProps>(
  ({ className, children }, ref) => {
    const { callState } = useCallBarContext()
    return (
      <div ref={ref} className={className} data-state={callState} aria-live="polite">
        {children ?? STATUS_LABELS[callState]}
      </div>
    )
  },
)
CallBarStatus.displayName = 'CallBar.Status'

export interface CallBarTimerProps {
  className?: string
  children?: (elapsedSeconds: number) => React.ReactNode
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const CallBarTimer = forwardRef<HTMLDivElement, CallBarTimerProps>(
  ({ className, children }, ref) => {
    const { elapsedSeconds } = useCallBarContext()
    return (
      <div ref={ref} className={className} role="timer" aria-label="Call duration">
        {typeof children === 'function' ? children(elapsedSeconds) : formatTime(elapsedSeconds)}
      </div>
    )
  },
)
CallBarTimer.displayName = 'CallBar.Timer'

export interface CallBarControlsProps {
  className?: string
  onDisposition?: (callSid: string) => void
  children?: React.ReactNode
}

const CallBarControls = forwardRef<HTMLDivElement, CallBarControlsProps>(
  ({ className, onDisposition, children }, ref) => {
    const { callState, callInfo, toggleMute, hold, unhold, disconnect, isOnHold, onDisposition: ctxOnDisposition } = useCallBarContext()
    const isMuted = callInfo?.isMuted ?? false
    const isActive = callState === 'open' || callState === 'reconnecting'
    const callSid = callInfo?.callSid ?? null
    const dispositionHandler = onDisposition ?? ctxOnDisposition
    const canDisposition = callState === 'closed' && callSid !== null

    if (children) {
      return <div ref={ref} className={className}>{children}</div>
    }

    return (
      <div ref={ref} className={className}>
        <button
          onClick={toggleMute}
          aria-pressed={isMuted}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          data-active={String(isMuted)}
          data-disabled={String(!isActive)}
          aria-disabled={!isActive}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          onClick={isOnHold ? unhold : hold}
          aria-pressed={isOnHold}
          aria-label={isOnHold ? 'Resume' : 'Hold'}
          data-active={String(isOnHold)}
          data-disabled={String(!isActive)}
          aria-disabled={!isActive}
        >
          {isOnHold ? 'Resume' : 'Hold'}
        </button>
        <button
          onClick={disconnect}
          aria-label="Hang up"
          data-disabled={String(!isActive)}
          aria-disabled={!isActive}
        >
          Hang up
        </button>
        <button
          onClick={() => canDisposition && callSid && dispositionHandler?.(callSid)}
          aria-label="Disposition"
          data-disabled={String(!canDisposition)}
          aria-disabled={!canDisposition}
        >
          Disposition
        </button>
      </div>
    )
  },
)
CallBarControls.displayName = 'CallBar.Controls'

export interface CallBarCallerInfoProps {
  className?: string
  children?: (info: { from: string; to: string; direction: OEXCallDirection } | null) => React.ReactNode
}

const CallBarCallerInfo = forwardRef<HTMLDivElement, CallBarCallerInfoProps>(
  ({ className, children }, ref) => {
    const { callInfo } = useCallBarContext()
    const info = callInfo ? { from: callInfo.from, to: callInfo.to, direction: callInfo.direction } : null

    if (typeof children === 'function') {
      return <div ref={ref} className={className}>{children(info)}</div>
    }

    return (
      <div ref={ref} className={className}>
        <span data-field="from">{callInfo?.from ?? ''}</span>
        <span data-field="to">{callInfo?.to ?? ''}</span>
      </div>
    )
  },
)
CallBarCallerInfo.displayName = 'CallBar.CallerInfo'

// --- CallBar root ---

export interface CallBarProps {
  onDisposition?: (callSid: string) => void
  className?: string
  children?: React.ReactNode
}

const CallBarRoot = forwardRef<HTMLDivElement, CallBarProps>(
  ({ onDisposition, className, children }, ref) => {
    const voice = useVoice()
    const device = useDevice()
    const callActions = useCallActions()

    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const startTimeRef = useRef<number | null>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
      if (voice.callState === 'open') {
        startTimeRef.current = Date.now()
        intervalRef.current = setInterval(() => {
          if (startTimeRef.current !== null) {
            setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
          }
        }, 1000)
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        startTimeRef.current = null
        setElapsedSeconds(0)
      }

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }, [voice.callState])

    const ctxValue: CallBarContextValue = {
      callState: voice.callState,
      callInfo: voice.callInfo,
      deviceReady: voice.deviceReady,
      isMuted: voice.callInfo?.isMuted ?? false,
      isOnHold: callActions.isOnHold,
      elapsedSeconds,
      toggleMute: voice.toggleMute,
      hold: callActions.hold,
      unhold: callActions.unhold,
      disconnect: voice.disconnect,
      onDisposition,
    }

    return (
      <CallBarContext.Provider value={ctxValue}>
        <div
          ref={ref}
          className={className}
          data-state={voice.callState}
          data-muted={String(voice.callInfo?.isMuted ?? false)}
          data-hold={String(callActions.isOnHold)}
          role="region"
          aria-label="Call controls"
        >
          {children ?? (
            <>
              <CallBarStatus />
              <CallBarCallerInfo />
              <CallBarTimer />
              <CallBarControls onDisposition={onDisposition} />
            </>
          )}
        </div>
      </CallBarContext.Provider>
    )
  },
)
CallBarRoot.displayName = 'CallBar'

export const CallBar = Object.assign(CallBarRoot, {
  Status: CallBarStatus,
  Timer: CallBarTimer,
  Controls: CallBarControls,
  CallerInfo: CallBarCallerInfo,
})
