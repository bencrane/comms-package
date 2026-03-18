import React, { useState } from 'react'
import '../../../src/styles/oex-comms.css'
import './showcase.css'

import { CallBarShowcase } from './sections/CallBarShowcase'
import { DialerShowcase } from './sections/DialerShowcase'
import { AudioDeviceSelectorShowcase } from './sections/AudioDeviceSelectorShowcase'
import { IncomingCallBannerShowcase } from './sections/IncomingCallBannerShowcase'
import { PowerDialerPanelShowcase } from './sections/PowerDialerPanelShowcase'
import { ConversationThreadShowcase } from './sections/ConversationThreadShowcase'
import { ConversationListShowcase } from './sections/ConversationListShowcase'
import { ActivityTimelineShowcase } from './sections/ActivityTimelineShowcase'

import { Sun, Moon } from '../../../src/components/icons'

export function App() {
  const [dark, setDark] = useState(false)

  return (
    <div className={`oex-comms showcase-root ${dark ? 'showcase-dark' : ''}`} data-theme={dark ? 'dark' : undefined}>
      <header className="showcase-header">
        <h1>OEX Comms SDK — Component Showcase</h1>
        <button
          className="showcase-theme-toggle"
          onClick={() => setDark((d) => !d)}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          {dark ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="showcase-grid">
        <CallBarShowcase />
        <DialerShowcase />
        <AudioDeviceSelectorShowcase />
        <IncomingCallBannerShowcase />
        <PowerDialerPanelShowcase />
        <ConversationThreadShowcase />
        <ConversationListShowcase />
        <ActivityTimelineShowcase />
      </main>
    </div>
  )
}
