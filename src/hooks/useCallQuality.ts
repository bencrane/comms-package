import { useContext, useState, useEffect } from 'react'
import { OEXCommsContext, OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXCallQualityMetrics, OEXCallQualityLevel, OEXQualityWarning, OEXQualityWarningName } from '../types'

export interface UseCallQualityReturn {
  /** Current call quality metrics, or null if no active call */
  metrics: OEXCallQualityMetrics | null
  /** Active quality warnings */
  warnings: OEXQualityWarning[]
}

function mosToQualityLevel(mos: number | null): OEXCallQualityLevel | null {
  if (mos === null) return null
  if (mos >= 4.2) return 'excellent'
  if (mos >= 4.0) return 'great'
  if (mos >= 3.6) return 'good'
  if (mos >= 3.1) return 'fair'
  return 'degraded'
}

export function useCallQuality(): UseCallQualityReturn {
  const context = useContext(OEXCommsContext)
  if (context === null) {
    throw new Error('useCallQuality must be used within an OEXCommsProvider')
  }

  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useCallQuality must be used within an OEXCommsProvider')
  }

  const { callRef } = internal
  const { callState } = context

  const [metrics, setMetrics] = useState<OEXCallQualityMetrics | null>(null)
  const [warnings, setWarnings] = useState<OEXQualityWarning[]>([])

  useEffect(() => {
    if (callState !== 'open' || !callRef.current) {
      setMetrics(null)
      setWarnings([])
      return
    }

    const call = callRef.current

    const onSample = (sample: {
      mos: number | null
      rtt: number
      jitter: number
      packetsLostFraction: number
      audioInputLevel: number
      audioOutputLevel: number
      codecName: string
      timestamp: number
    }) => {
      setMetrics({
        mos: sample.mos,
        rtt: sample.rtt,
        jitter: sample.jitter,
        packetLoss: sample.packetsLostFraction,
        qualityLevel: mosToQualityLevel(sample.mos),
        audioInputLevel: sample.audioInputLevel,
        audioOutputLevel: sample.audioOutputLevel,
        codec: sample.codecName,
        timestamp: sample.timestamp,
      })
    }

    const onWarning = (name: string, data?: { value?: number }) => {
      setWarnings((prev) => {
        if (prev.some((w) => w.name === name)) return prev
        return [...prev, { name: name as OEXQualityWarningName, value: data?.value }]
      })
    }

    const onWarningCleared = (name: string) => {
      setWarnings((prev) => prev.filter((w) => w.name !== name))
    }

    call.on('sample', onSample)
    call.on('warning', onWarning)
    call.on('warning-cleared', onWarningCleared)

    return () => {
      call.removeListener('sample', onSample)
      call.removeListener('warning', onWarning)
      call.removeListener('warning-cleared', onWarningCleared)
    }
  }, [callState, callRef])

  return { metrics, warnings }
}
