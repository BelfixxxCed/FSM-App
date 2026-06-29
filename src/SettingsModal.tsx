// SettingsModal.tsx — Modal dialog for Pomodoro settings

import { useState, useEffect, useRef } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import type { Settings, TimerSound } from "./settings";

interface Props {
  open: boolean;
  current: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
  onPreview: (sound: TimerSound) => void;
}

const SOUND_OPTIONS: { value: TimerSound; label: string }[] = [
  { value: "bell", label: "Bell" },
  { value: "piano", label: "Piano" },
  { value: "bird", label: "Bird" },
  { value: "chime", label: "Chime" },
  { value: "none", label: "None" },
];

export default function SettingsModal({
  open,
  current,
  onSave,
  onClose,
  onPreview,
}: Props) {
  const [draft, setDraft] = useState<Settings>(current);
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset draft when modal opens
  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap: keep focus inside modal
  useEffect(() => {
    if (!open) return;
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
  }, [open]);

  if (!open) return null;

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="bg-white/20 backdrop-blur-md rounded-3xl p-8 flex flex-col items-stretch gap-5
          shadow-[inset_0_0_30px_rgba(255,255,255,0.3),0_8px_32px_rgba(180,60,10,0.4)]
          w-[90%] sm:w-96 max-h-[90vh] overflow-y-auto animate-fade-scale"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-white" />
          <h2 className="text-white text-xl font-light tracking-wide">Settings</h2>
        </div>

        {/* Timer Sound */}
        <fieldset>
          <legend className="text-white/90 text-sm font-light tracking-wide mb-3 flex items-center gap-2">
            <span>🔔</span> Timer Sound
          </legend>
          <div className="flex flex-col gap-2">
            {SOUND_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className="flex items-center gap-3 group"
              >
                <label className="flex items-center gap-2 cursor-pointer flex-1">
                  <input
                    type="radio"
                    name="timerSound"
                    value={opt.value}
                    checked={draft.timerSound === opt.value}
                    onChange={() => update("timerSound", opt.value)}
                    className="accent-orange-500 w-4 h-4"
                  />
                  <span
                    className={`text-sm ${
                      draft.timerSound === opt.value
                        ? "text-white font-medium"
                        : "text-white/70"
                    }`}
                  >
                    {opt.label}
                  </span>
                </label>
                {opt.value !== "none" && (
                  <button
                    onClick={() => onPreview(opt.value)}
                    className="text-xs text-white/50 hover:text-white transition-colors px-2 py-1 rounded-full
                      hover:bg-white/10"
                  >
                    ▶ Preview
                  </button>
                )}
              </div>
            ))}
          </div>
        </fieldset>

        {/* Play sound when timer ends */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.playTimerSound}
            onChange={(e) => update("playTimerSound", e.target.checked)}
            className="accent-orange-500 w-4 h-4"
          />
          <span className="text-white text-sm font-light">
            Play sound when timer ends
          </span>
        </label>

        {/* Play relaxing music during break */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.playBreakMusic}
            onChange={(e) => update("playBreakMusic", e.target.checked)}
            className="accent-orange-500 w-4 h-4"
          />
          <span className="text-white text-sm font-light">
            Play relaxing music during break
          </span>
        </label>

        {/* Volume slider */}
        <div className="flex flex-col gap-1">
          <span className="text-white/80 text-sm font-light flex items-center gap-2">
            <span>🔊</span> Volume
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(draft.volume * 100)}
            onChange={(e) => update("volume", Number(e.target.value) / 100)}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-xs text-white/40">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 mt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full text-sm text-white/70 hover:text-white
              transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-full text-sm text-white font-light
              bg-linear-to-br from-orange-700 via-orange-600 to-amber-500
              hover:shadow-[0_4px_20px_rgba(180,60,10,0.6)]
              transition-all duration-300"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}