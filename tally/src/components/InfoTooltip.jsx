import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Small "?" badge that renders a tooltip via a React portal.
 * Portal-based so it escapes any overflow-hidden ancestor.
 *
 * @param {string} text - Tooltip body text (sentence case).
 */
export default function InfoTooltip({ text }) {
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  const show = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top })
  }
  const hide = () => setPos(null)

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-300 text-slate-600 text-[9px] font-bold leading-none focus:outline-none hover:bg-slate-400"
        aria-label="More info"
      >
        ?
      </button>

      {pos && createPortal(
        <span
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
          className="w-56 rounded-md bg-slate-800 px-3 py-2 text-xs text-white shadow-lg z-[9999] pointer-events-none font-normal normal-case tracking-normal"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>,
        document.body
      )}
    </span>
  )
}
