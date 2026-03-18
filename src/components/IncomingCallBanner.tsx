import React, { forwardRef, useCallback } from 'react'
import { useVoice } from '../hooks/useVoice'

export interface IncomingCallBannerProps {
  className?: string
  acceptButtonClassName?: string
  rejectButtonClassName?: string
  onAccept?: () => void
  onReject?: () => void
  children?: (info: { from: string; to: string }) => React.ReactNode
}

export const IncomingCallBanner = forwardRef<HTMLDivElement, IncomingCallBannerProps>(
  ({ className, acceptButtonClassName, rejectButtonClassName, onAccept, onReject, children }, ref) => {
    const { callState, callInfo, acceptIncoming, rejectIncoming } = useVoice()

    const handleAccept = useCallback(() => {
      acceptIncoming()
      onAccept?.()
    }, [acceptIncoming, onAccept])

    const handleReject = useCallback(() => {
      rejectIncoming()
      onReject?.()
    }, [rejectIncoming, onReject])

    if (callState !== 'pending') return null

    return (
      <div
        ref={ref}
        className={className}
        role="alertdialog"
        aria-label="Incoming call"
        aria-live="assertive"
        data-state="pending"
      >
        {typeof children === 'function' && callInfo ? (
          children({ from: callInfo.from, to: callInfo.to })
        ) : (
          <div aria-label="Caller">{callInfo?.from ?? 'Unknown'}</div>
        )}
        <button onClick={handleAccept} aria-label="Accept call" className={acceptButtonClassName}>
          Accept
        </button>
        <button onClick={handleReject} aria-label="Reject call" className={rejectButtonClassName}>
          Reject
        </button>
      </div>
    )
  },
)
IncomingCallBanner.displayName = 'IncomingCallBanner'
