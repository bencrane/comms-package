import React, { useState } from 'react'

export function IncomingCallBannerShowcase() {
  const [visible, setVisible] = useState(true)
  const [key, setKey] = useState(0)

  const replay = () => {
    setVisible(false)
    setTimeout(() => {
      setKey((k) => k + 1)
      setVisible(true)
    }, 100)
  }

  return (
    <section className="showcase-section">
      <h2>IncomingCallBanner</h2>
      <p>Floating notification for incoming calls with accept/reject actions and slide-down entrance.</p>

      <div className="showcase-controls">
        <button onClick={replay} data-selected="false">Replay animation</button>
        <button onClick={() => setVisible((v) => !v)} data-selected="false">
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      <div className="showcase-demo">
        {visible && (
          <div
            key={key}
            role="alertdialog"
            aria-label="Incoming call"
            aria-live="assertive"
            data-state="pending"
          >
            <div aria-label="Caller">+1 (415) 555-0199</div>
            <button aria-label="Accept call">Accept</button>
            <button aria-label="Reject call">Reject</button>
          </div>
        )}
      </div>
    </section>
  )
}
