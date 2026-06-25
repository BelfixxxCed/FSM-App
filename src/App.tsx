import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Play, Pause, Square, Plus } from 'lucide-react'
import "./App.css";

type AppState = "Started" | "Initialized" | "Session" | "Paused" | "Break" | "LongBreak" | "Ended"

interface ReturnState {
  state: AppState
  err_message: string | null
  action_initialize: boolean
  action_pause: boolean
  action_play: boolean
  action_end: boolean
}

const STATE_LABELS: Record<AppState, string> = {
  Started:     "ready",
  Initialized: "ready",
  Session:     "focus",
  Paused:      "paused",
  Break:       "break",
  LongBreak:   "long break",
  Ended:       "done",
}

function fmt(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function App() {
  const [display, setDisplay]           = useState("25:00")
  const [message, setMessage]           = useState("ready")
  const [showModal, setShowModal]       = useState(false)
  const [inputMinutes, setInputMinutes] = useState("25")

  const [canPlay,  setCanPlay]  = useState(false)
  const [canPause, setCanPause] = useState(false)
  const [canEnd,   setCanEnd]   = useState(false)
  const [canNew,   setCanNew]   = useState(true)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startTick() {
    stopTick()
    tickRef.current = setInterval(async () => {
      try {
        const secs = await invoke<number>("get_remaining")
        setDisplay(fmt(secs))
      } catch (_) {}
    }, 1000)
  }

  function stopTick() {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  function applyReturnState(rs: ReturnState) {
    setMessage(STATE_LABELS[rs.state])
    setCanPlay(rs.action_play)
    setCanPause(rs.action_pause)
    setCanEnd(rs.action_end)
    setCanNew(rs.action_initialize)

    const isRunning = rs.state === "Session" || rs.state === "Break" || rs.state === "LongBreak"
    if (isRunning) startTick()
    else stopTick()
  }

  useEffect(() => {
    let unlisten: UnlistenFn | undefined

    listen("timer-finished", async () => {
      try {
        const rs = await invoke<ReturnState>("do_action", { action: { SessionComplete: null } })
        applyReturnState(rs)
      } catch (e) {
        console.error("SessionComplete failed:", e)
      }
    }).then(u => { unlisten = u })

    return () => {
      unlisten?.()
      stopTick()
    }
  }, [])

  async function handlePlay() {
    try {
      const rs = await invoke<ReturnState>("do_action", { action: { Play: null } })
      applyReturnState(rs)
    } catch (e) { console.error(e) }
  }

  async function handlePause() {
    try {
      const rs = await invoke<ReturnState>("do_action", { action: { Pause: null } })
      applyReturnState(rs)
    } catch (e) { console.error(e) }
  }

  async function handleEnd() {
    try {
      const rs = await invoke<ReturnState>("do_action", { action: { End: null } })
      applyReturnState(rs)
      stopTick()
      setDisplay("--:--")
    } catch (e) { console.error(e) }
  }

  function handleNew() { setShowModal(true) }

  async function handleModalConfirm() {
    const parsed = parseInt(inputMinutes)
    if (isNaN(parsed) || parsed <= 0) return
    setShowModal(false)
    try {
      const rs = await invoke<ReturnState>("do_action", { action: { Initialize: { mins: parsed } } })
      applyReturnState(rs)
      setDisplay(fmt(parsed * 60))
    } catch (e) { console.error(e) }
  }

  const controls = [
    { Icon: Play,   action: handlePlay,  enabled: canPlay  },
    { Icon: Pause,  action: handlePause, enabled: canPause },
    { Icon: Square, action: handleEnd,   enabled: canEnd   },
    { Icon: Plus,   action: handleNew,   enabled: canNew   },
  ]

  return (
    <main className="min-h-screen">

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 flex flex-col items-center gap-4
            shadow-[inset_0_0_30px_rgba(255,255,255,0.3),0_8px_32px_rgba(180,60,10,0.4)]
            w-[90%] sm:w-80">

            <p className="text-white font-light text-lg tracking-wide">how many minutes?</p>

            <input
              type="number"
              value={inputMinutes}
              onChange={(e) => setInputMinutes(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleModalConfirm()}
              className="w-full text-center text-white font-extrabold text-4xl bg-transparent border-none outline-none"
              autoFocus
            />

            <button
              onClick={handleModalConfirm}
              className="mt-2 px-8 py-2 rounded-full
                bg-linear-to-br from-orange-700 via-orange-600 to-amber-500
                text-white font-light tracking-widest text-sm
                hover:shadow-[0_4px_20px_rgba(180,60,10,0.6)]
                transition-all duration-300">
              let's go
            </button>

          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen px-4">

        <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-orange-100 animate-pulse z-0" />
          <div className="absolute bg-orange-400 z-1 h-[75%] w-[75%] rounded-full opacity-30" />
          <div className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 rounded-full
            bg-linear-to-br from-orange-700 via-orange-600 to-amber-500
            shadow-[inset_0_0_30px_rgba(255,255,255,0.2),0_8px_32px_rgba(180,60,10,0.5)]
            backdrop-blur-sm
            transition-all duration-700 ease-in-out
            hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.3),0_8px_48px_rgba(180,60,10,0.7)]
            relative z-2 flex flex-col items-center justify-center">

            <span className="text-white font-extrabold text-3xl sm:text-4xl md:text-5xl transition-all duration-500 select-none">
              {display}
            </span>
            <span className="text-white/80 font-light text-sm sm:text-base mt-1 tracking-widest select-none">
              {message}
            </span>

          </div>
        </div>

        <div className="mt-8 md:mt-12 h-12 w-[90%] sm:w-[75%] md:w-[60%] lg:w-[40%] mx-auto relative">
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-4 sm:gap-7
            bg-linear-to-br from-orange-700 via-orange-600 to-amber-500
            rounded-4xl shadow-sm shadow-orange-700">
            {controls.map(({ Icon, action, enabled }, i) => (
              <div key={i}
                onClick={enabled ? action : undefined}
                className={`p-2 rounded-full transition-all duration-300
                  ${enabled
                    ? "cursor-pointer hover:bg-white/30 hover:scale-110"
                    : "opacity-30 cursor-not-allowed"
                  }`}>
                <Icon className="text-white w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}