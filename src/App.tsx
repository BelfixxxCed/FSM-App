import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Play, Pause, Square, Plus, Palette, Settings as SettingsIcon } from 'lucide-react'
import "./App.css";
import SettingsModal from "./SettingsModal";
import { useAudio } from "./useAudio";
import { loadSettings, saveSettings } from "./settings";
import type { Settings, TimerSound } from "./settings";
import Confetti from "./Confetti";

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

// ── Theme definitions ─────────────────────────────────────────────────────────
type Theme = "orange" | "blue" | "green" | "purple" | "pink";

interface ThemeColors {
  bg: string;
  mid: string;
  from: string;
  via: string;
  to: string;
  rgb: string;
  accent: string;
}

const THEMES: Record<Theme, ThemeColors> = {
  orange: { bg: "bg-orange-100", mid: "bg-orange-400", from: "from-orange-700", via: "via-orange-600", to: "to-amber-500",   rgb: "180,60,10",   accent: "text-orange-700" },
  blue:   { bg: "bg-blue-100",   mid: "bg-blue-400",   from: "from-blue-700",   via: "via-blue-600",   to: "to-cyan-400",    rgb: "30,60,180",   accent: "text-blue-700" },
  green:  { bg: "bg-green-100",  mid: "bg-green-400",  from: "from-green-700",  via: "via-green-600",  to: "to-lime-400",    rgb: "20,120,20",   accent: "text-green-700" },
  purple: { bg: "bg-purple-100", mid: "bg-purple-400", from: "from-purple-700", via: "via-purple-600", to: "to-pink-400",    rgb: "120,20,160",  accent: "text-purple-700" },
  pink:   { bg: "bg-pink-100",   mid: "bg-pink-400",   from: "from-pink-600",   via: "via-pink-500",   to: "to-rose-400",     rgb: "200,50,120",  accent: "text-pink-600" },
};

const SHADOW_CLS: Record<string, string> = {
  "180,60,10":  "shadow-[inset_0_0_30px_rgba(255,255,255,0.2),0_8px_32px_rgba(180,60,10,0.5)]",
  "30,60,180":  "shadow-[inset_0_0_30px_rgba(255,255,255,0.2),0_8px_32px_rgba(30,60,180,0.5)]",
  "20,120,20":  "shadow-[inset_0_0_30px_rgba(255,255,255,0.2),0_8px_32px_rgba(20,120,20,0.5)]",
  "120,20,160": "shadow-[inset_0_0_30px_rgba(255,255,255,0.2),0_8px_32px_rgba(120,20,160,0.5)]",
  "200,50,120": "shadow-[inset_0_0_30px_rgba(255,255,255,0.2),0_8px_32px_rgba(200,50,120,0.5)]",
};

const SHADOW_HOVER: Record<string, string> = {
  "180,60,10":  "hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.3),0_8px_48px_rgba(180,60,10,0.7)]",
  "30,60,180":  "hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.3),0_8px_48px_rgba(30,60,180,0.7)]",
  "20,120,20":  "hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.3),0_8px_48px_rgba(20,120,20,0.7)]",
  "120,20,160": "hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.3),0_8px_48px_rgba(120,20,160,0.7)]",
  "200,50,120": "hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.3),0_8px_48px_rgba(200,50,120,0.7)]",
};

// ── App component ────────────────────────────────────────────────────────────
export default function App() {
  const [display, setDisplay]           = useState("25:00")
  const [message, setMessage]           = useState("ready")
  const [showModal, setShowModal]       = useState(false)
  const [showThemes, setShowThemes]     = useState(false)
  const [inputMinutes, setInputMinutes] = useState("25")
  const [theme, setTheme]               = useState<Theme>("orange")
  const [showConfetti, setShowConfetti] = useState(false)

  const [canPlay,  setCanPlay]  = useState(false)
  const [canPause, setCanPause] = useState(false)
  const [canEnd,   setCanEnd]   = useState(false)
  const [canNew,   setCanNew]   = useState(true)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Settings state
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)

  // Audio hook — handles preview, timer-end sound, and break music
  const { playPreview, playTimerEnd, startBreakMusic, stopBreakMusic, updateVolume } = useAudio()

  // Update volume on any currently playing audio when volume changes
  useEffect(() => {
    updateVolume(settings.volume)
  }, [settings.volume, updateVolume])

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

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

  // ── Timer complete handler (sound + confetti + break music) ────────────────
  function handleTimerComplete() {
    // Play timer-end sound via the frontend (respects user's selected sound)
    if (settings.playTimerSound) {
      playTimerEnd(settings.timerSound, true, settings.volume)
    }

    // Show confetti
    setShowConfetti(true)
    setTimeout(() => setShowConfetti(false), 5000)

    // Start break music if enabled
    if (settings.playBreakMusic) {
      setTimeout(() => {
        startBreakMusic(settings.volume)
      }, 500)
    }
  }

  function applyReturnState(rs: ReturnState) {
    setMessage(STATE_LABELS[rs.state])
    setCanPlay(rs.action_play)
    setCanPause(rs.action_pause)
    setCanEnd(rs.action_end)
    setCanNew(rs.action_initialize)

    const isRunning = rs.state === "Session" || rs.state === "Break" || rs.state === "LongBreak"
    if (isRunning) {
      startTick()
    } else {
      stopTick()
    }

    if (rs.state === "Session") {
      stopBreakMusic()
    }
  }

  useEffect(() => {
    let unlisten: UnlistenFn | undefined

    listen("timer-finished", async () => {
      try {
        // First, handle all timer-complete effects (sound, confetti, break music)
        handleTimerComplete()

        // Then transition state on the backend — this starts a new timer for break/session
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
  }, [settings.playTimerSound, settings.timerSound, settings.volume, settings.playBreakMusic])

  async function handlePlay() {
    stopBreakMusic()
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
    // Settings button integrated into controls bar
    { Icon: SettingsIcon, action: () => setShowSettings(true), enabled: true },
  ]

  const tc = THEMES[theme]
  const shadowCls = SHADOW_CLS[tc.rgb]
  const shadowHover = SHADOW_HOVER[tc.rgb]

  return (
    <main className="min-h-screen">

      {/* ── Confetti overlay ─────────────────────────────────────────── */}
      <Confetti active={showConfetti} />

      {/* ── Theme selector (top-left) ───────────────────────────────────── */}
      <div className="absolute top-6 left-6 z-50">
        <button
          onClick={() => setShowThemes(!showThemes)}
          className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md
            flex items-center justify-center text-xl
            hover:scale-110 transition-all duration-300"
        >
          <Palette className={`w-6 h-6 ${tc.accent}`} />
        </button>

        {showThemes && (
          <div className="mt-2 flex flex-col gap-2 p-3 rounded-2xl bg-white/40 backdrop-blur-md animate-fade-scale">
            {(Object.keys(THEMES) as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTheme(t); setShowThemes(false) }}
                className={`w-8 h-8 rounded-full transition-all duration-200
                  ${theme === t ? "ring-2 ring-white scale-110" : "hover:scale-110"}
                  ${THEMES[t].mid}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── New session modal ────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 flex flex-col items-center gap-4
            shadow-[inset_0_0_30px_rgba(255,255,255,0.3),0_8px_32px_rgba(180,60,10,0.4)]
            w-[90%] sm:w-80 animate-fade-scale">

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

      {/* ── Settings modal ────────────────────────────────────────────── */}
      <SettingsModal
        open={showSettings}
        current={settings}
        onSave={(s) => setSettings(s)}
        onClose={() => setShowSettings(false)}
        onPreview={(sound: TimerSound) => playPreview(sound, settings.volume)}
      />

      {/* ── Main timer UI ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center min-h-screen px-4">

        <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full relative flex items-center justify-center overflow-hidden">
          {/* Pulse layer */}
          <div className={`absolute inset-0 ${tc.bg} animate-pulse z-0`} />
          {/* Mid opacity circle */}
          <div className={`absolute ${tc.mid} z-1 h-[75%] w-[75%] rounded-full opacity-30`} />
          {/* Inner gradient circle */}
          <div className={`w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 rounded-full
            bg-linear-to-br ${tc.from} ${tc.via} ${tc.to}
            ${shadowCls}
            backdrop-blur-sm
            transition-all duration-700 ease-in-out
            ${shadowHover}
            relative z-2 flex flex-col items-center justify-center`}>

            <span className="text-white font-extrabold text-3xl sm:text-4xl md:text-5xl transition-all duration-500 select-none">
              {display}
            </span>
            <span className="text-white/80 font-light text-sm sm:text-base mt-1 tracking-widest select-none">
              {message}
            </span>

          </div>
        </div>

        {/* ── Controls bar (with settings beside Plus) ───────────────── */}
        <div className="mt-8 md:mt-12 h-12 w-[90%] sm:w-[75%] md:w-[60%] lg:w-[40%] mx-auto relative">
          <div className={`absolute inset-0 z-10 flex items-center justify-center gap-4 sm:gap-7
            bg-linear-to-br ${tc.from} ${tc.via} ${tc.to}
            rounded-4xl shadow-sm shadow-orange-700`}>
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