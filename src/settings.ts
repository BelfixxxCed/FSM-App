// settings.ts — localStorage persistence for Pomodoro settings

export type TimerSound = "bell" | "piano" | "bird" | "chime" | "none";

export interface Settings {
  timerSound: TimerSound;
  playTimerSound: boolean;
  playBreakMusic: boolean;
  volume: number; // 0–1
}

const STORAGE_KEY = "pomodoro-settings";

const DEFAULTS: Settings = {
  timerSound: "bell",
  playTimerSound: true,
  playBreakMusic: false,
  volume: 0.5,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}