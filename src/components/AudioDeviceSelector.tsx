import React, { forwardRef, useId } from 'react'
import { useAudioDevices } from '../hooks/useAudioDevices'
import type { OEXAudioDevice } from '../types'

export interface AudioDeviceSelectorProps {
  className?: string
  inputSelectClassName?: string
  outputSelectClassName?: string
  testButtonClassName?: string
  renderInputSelect?: (props: {
    devices: OEXAudioDevice[]
    selectedDeviceId: string | null
    onChange: (deviceId: string) => void
  }) => React.ReactNode
  renderOutputSelect?: (props: {
    devices: OEXAudioDevice[]
    onChange: (deviceId: string) => void
  }) => React.ReactNode
  inputLabel?: string
  outputLabel?: string
  children?: React.ReactNode
}

export const AudioDeviceSelector = forwardRef<HTMLDivElement, AudioDeviceSelectorProps>(
  (
    {
      className,
      inputSelectClassName,
      outputSelectClassName,
      testButtonClassName,
      renderInputSelect,
      renderOutputSelect,
      inputLabel = 'Microphone',
      outputLabel = 'Speaker',
      children,
    },
    ref,
  ) => {
    const {
      inputDevices,
      outputDevices,
      selectedInputDeviceId,
      isOutputSelectionSupported,
      setInputDevice,
      setOutputDevice,
      testSpeaker,
      error,
    } = useAudioDevices()

    const inputId = useId()
    const outputId = useId()

    if (children) {
      return (
        <div ref={ref} className={className} role="group" aria-label="Audio device settings" data-output-supported={String(isOutputSelectionSupported)}>
          {children}
        </div>
      )
    }

    return (
      <div ref={ref} className={className} role="group" aria-label="Audio device settings" data-output-supported={String(isOutputSelectionSupported)}>
        {renderInputSelect ? (
          renderInputSelect({
            devices: inputDevices,
            selectedDeviceId: selectedInputDeviceId,
            onChange: (id) => setInputDevice(id),
          })
        ) : (
          <div>
            <label htmlFor={inputId}>{inputLabel}</label>
            <select
              id={inputId}
              className={inputSelectClassName}
              value={selectedInputDeviceId ?? ''}
              onChange={(e) => setInputDevice(e.target.value)}
              aria-label={inputLabel}
            >
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {isOutputSelectionSupported && (
          <>
            {renderOutputSelect ? (
              renderOutputSelect({
                devices: outputDevices,
                onChange: (id) => setOutputDevice(id),
              })
            ) : (
              <div>
                <label htmlFor={outputId}>{outputLabel}</label>
                <select
                  id={outputId}
                  className={outputSelectClassName}
                  onChange={(e) => setOutputDevice(e.target.value)}
                  aria-label={outputLabel}
                >
                  {outputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => testSpeaker()}
              aria-label="Test speaker"
              className={testButtonClassName}
            >
              Test speaker
            </button>
          </>
        )}

        {error && (
          <div role="alert" data-error="true">
            {error.message}
          </div>
        )}
      </div>
    )
  },
)
AudioDeviceSelector.displayName = 'AudioDeviceSelector'
