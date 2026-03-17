import { useContext, useState, useRef, useCallback, useEffect } from 'react'
import { PreflightTest } from '@twilio/voice-sdk'
import { OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXPreflightStatus, OEXPreflightReport, OEXCallQualityLevel, OEXError } from '../types'
import { createOEXError } from '../utils/errors'

export interface UsePreflightReturn {
  /** Current test status */
  status: OEXPreflightStatus
  /** Test report (available after completion) */
  report: OEXPreflightReport | null
  /** Current error, or null */
  error: OEXError | null
  /** Start the preflight test */
  run: () => Promise<void>
  /** Stop a running test */
  stop: () => void
}

function mapCallQuality(quality: string): OEXCallQualityLevel {
  const map: Record<string, OEXCallQualityLevel> = {
    Excellent: 'excellent',
    Great: 'great',
    Good: 'good',
    Fair: 'fair',
    Degraded: 'degraded',
  }
  return map[quality] ?? 'degraded'
}

export function usePreflight(): UsePreflightReturn {
  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('usePreflight must be used within an OEXCommsProvider')
  }

  const { tokenManagerRef } = internal
  const [status, setStatus] = useState<OEXPreflightStatus>('idle')
  const [report, setReport] = useState<OEXPreflightReport | null>(null)
  const [error, setError] = useState<OEXError | null>(null)
  const preflightTestRef = useRef<PreflightTest | null>(null)

  const run = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') return

    if (!tokenManagerRef.current) {
      setError(createOEXError(0, 'Token manager not available', false))
      return
    }

    setError(null)
    setReport(null)

    let token: string
    try {
      const response = await tokenManagerRef.current.fetchToken()
      token = response.token
    } catch (err) {
      const e = err as { code?: number; message?: string }
      setError(createOEXError(e.code ?? 0, e.message ?? 'Failed to fetch token for preflight'))
      setStatus('failed')
      return
    }

    setStatus('connecting')

    const test = new PreflightTest(token, { fakeMicInput: true })
    preflightTestRef.current = test

    test.on('connected', () => {
      setStatus('connected')
    })

    test.on('completed', (twilioReport: {
      callQuality?: string
      callSid?: string
      edge?: string
      selectedEdge?: string
      networkTiming?: {
        signaling?: { start: number; duration?: number; end?: number }
        ice?: { start: number; duration?: number; end?: number }
        dtls?: { start: number; duration?: number; end?: number }
        peerConnection?: { start: number; duration?: number; end?: number }
      }
      stats?: {
        mos?: { average?: number }
        rtt?: { average?: number }
        jitter?: { average?: number }
      }
      warnings?: Array<{ name?: string }>
    }) => {
      const mappedReport: OEXPreflightReport = {
        qualityLevel: mapCallQuality(twilioReport.callQuality ?? 'Degraded'),
        averageMos: twilioReport.stats?.mos?.average ?? null,
        averageRtt: twilioReport.stats?.rtt?.average ?? null,
        averageJitter: twilioReport.stats?.jitter?.average ?? null,
        networkTiming: {
          signaling: twilioReport.networkTiming?.signaling ?? undefined,
          ice: twilioReport.networkTiming?.ice ?? undefined,
          dtls: twilioReport.networkTiming?.dtls ?? undefined,
          peerConnection: twilioReport.networkTiming?.peerConnection ?? undefined,
        },
        edge: twilioReport.selectedEdge ?? twilioReport.edge ?? '',
        warnings: twilioReport.warnings?.map((w) => w.name ?? 'unknown') ?? [],
        callSid: twilioReport.callSid ?? '',
      }
      setReport(mappedReport)
      setStatus('completed')
      preflightTestRef.current = null
    })

    test.on('failed', (err: { code?: number; message?: string }) => {
      setError(createOEXError(err.code ?? 0, err.message ?? 'Preflight test failed'))
      setStatus('failed')
      preflightTestRef.current = null
    })
  }, [status, tokenManagerRef])

  const stop = useCallback(() => {
    if (preflightTestRef.current) {
      preflightTestRef.current.stop()
      preflightTestRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (preflightTestRef.current) {
        preflightTestRef.current.stop()
        preflightTestRef.current = null
      }
    }
  }, [])

  return { status, report, error, run, stop }
}
