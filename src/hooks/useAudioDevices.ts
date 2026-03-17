import { useContext, useState, useEffect, useCallback } from 'react'
import { OEXCommsInternalContext } from '../providers/OEXCommsProvider'
import type { OEXAudioDevice, OEXError } from '../types'
import { createOEXError, createTwilioOEXError } from '../utils/errors'

export interface UseAudioDevicesReturn {
  /** Available microphone devices */
  inputDevices: OEXAudioDevice[]
  /** Available speaker devices */
  outputDevices: OEXAudioDevice[]
  /** Currently selected input device ID, or null */
  selectedInputDeviceId: string | null
  /** Whether the browser supports output device selection */
  isOutputSelectionSupported: boolean
  /** Select a microphone by device ID */
  setInputDevice: (deviceId: string) => Promise<void>
  /** Select a speaker by device ID */
  setOutputDevice: (deviceId: string) => Promise<void>
  /** Play a test tone through the current speaker */
  testSpeaker: () => Promise<void>
  /** Current error, or null */
  error: OEXError | null
}

function mapDeviceInfo(info: MediaDeviceInfo): OEXAudioDevice {
  return {
    deviceId: info.deviceId,
    label: info.label || `Device ${info.deviceId.slice(0, 8)}`,
    groupId: info.groupId,
  }
}

export function useAudioDevices(): UseAudioDevicesReturn {
  const internal = useContext(OEXCommsInternalContext)
  if (internal === null) {
    throw new Error('useAudioDevices must be used within an OEXCommsProvider')
  }

  const { deviceRef } = internal
  const [inputDevices, setInputDevices] = useState<OEXAudioDevice[]>([])
  const [outputDevices, setOutputDevices] = useState<OEXAudioDevice[]>([])
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<string | null>(null)
  const [isOutputSelectionSupported, setIsOutputSelectionSupported] = useState(false)
  const [error, setError] = useState<OEXError | null>(null)

  const refresh = useCallback(() => {
    const device = deviceRef.current
    if (!device?.audio) return

    const audio = device.audio

    const inputs: OEXAudioDevice[] = []
    audio.availableInputDevices.forEach((info: MediaDeviceInfo) => {
      inputs.push(mapDeviceInfo(info))
    })
    setInputDevices(inputs)

    const outputs: OEXAudioDevice[] = []
    audio.availableOutputDevices.forEach((info: MediaDeviceInfo) => {
      outputs.push(mapDeviceInfo(info))
    })
    setOutputDevices(outputs)

    setSelectedInputDeviceId(audio.inputDevice?.deviceId ?? null)
    setIsOutputSelectionSupported(audio.isOutputSelectionSupported ?? false)
  }, [deviceRef])

  useEffect(() => {
    refresh()

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', refresh)
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refresh)
      }
    }
  }, [refresh])

  const setInputDevice = useCallback(
    async (deviceId: string) => {
      const device = deviceRef.current
      if (!device?.audio) {
        setError(createOEXError(0, 'Device not available', false))
        return
      }
      try {
        await device.audio.setInputDevice(deviceId)
        setSelectedInputDeviceId(deviceId)
        setError(null)
      } catch (err) {
        const e = err as { code?: number; message?: string }
        setError(e.code ? createTwilioOEXError(e.code, e.message) : createOEXError(0, e.message ?? 'Failed to set input device'))
      }
    },
    [deviceRef],
  )

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      const device = deviceRef.current
      if (!device?.audio) {
        setError(createOEXError(0, 'Device not available', false))
        return
      }
      if (!device.audio.isOutputSelectionSupported) {
        setError(createOEXError(0, 'Output device selection is not supported in this browser', false))
        return
      }
      try {
        await device.audio.speakerDevices.set(deviceId)
        setError(null)
      } catch (err) {
        const e = err as { code?: number; message?: string }
        setError(e.code ? createTwilioOEXError(e.code, e.message) : createOEXError(0, e.message ?? 'Failed to set output device'))
      }
    },
    [deviceRef],
  )

  const testSpeaker = useCallback(async () => {
    const device = deviceRef.current
    if (!device?.audio) {
      setError(createOEXError(0, 'Device not available', false))
      return
    }
    try {
      await device.audio.speakerDevices.test()
      setError(null)
    } catch (err) {
      const e = err as { code?: number; message?: string }
      setError(e.code ? createTwilioOEXError(e.code, e.message) : createOEXError(0, e.message ?? 'Failed to test speaker'))
    }
  }, [deviceRef])

  return {
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    isOutputSelectionSupported,
    setInputDevice,
    setOutputDevice,
    testSpeaker,
    error,
  }
}
