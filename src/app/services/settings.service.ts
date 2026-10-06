import { Injectable, signal, effect } from '@angular/core';

const STORAGE_KEY = 'pomocare_settings';

export interface Settings {
  totalSessions: number;
  sessionMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = { totalSessions: 6, sessionMinutes: 60 };

export const SETTINGS_LIMITS = {
  totalSessions: { min: 1, max: 12, step: 1 },
  sessionMinutes: { min: 5, max: 180, step: 5 },
} as const;

@Injectable({ providedIn: 'root' })
export class SettingsService {
  totalSessions = signal(DEFAULT_SETTINGS.totalSessions);
  sessionMinutes = signal(DEFAULT_SETTINGS.sessionMinutes);

  constructor() {
    this.load();
    effect(() => {
      const data: Settings = {
        totalSessions: this.totalSessions(),
        sessionMinutes: this.sessionMinutes(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    });
  }

  update(settings: Settings) {
    this.totalSessions.set(clamp(settings.totalSessions, SETTINGS_LIMITS.totalSessions));
    this.sessionMinutes.set(clamp(settings.sessionMinutes, SETTINGS_LIMITS.sessionMinutes));
  }

  private load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.update({
        totalSessions: Number(data?.totalSessions) || DEFAULT_SETTINGS.totalSessions,
        sessionMinutes: Number(data?.sessionMinutes) || DEFAULT_SETTINGS.sessionMinutes,
      });
    } catch {
      // ignore invalid saved settings
    }
  }
}

function clamp(value: number, limits: { min: number; max: number }): number {
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}
