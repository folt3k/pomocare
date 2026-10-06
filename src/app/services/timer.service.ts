import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { AudioService } from './audio.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';

export type AppState = 'idle' | 'session' | 'break' | 'completed';
export type Position = 'sitting' | 'standing' | 'ball';
export type BreakType = 'meditation' | 'stretching';

const STORAGE_KEY = 'pomocare_state';

@Injectable({ providedIn: 'root' })
export class TimerService {
  readonly SUB_SESSIONS_PER_SESSION = 3;

  private settings = inject(SettingsService);

  totalSessions = computed(() => this.settings.totalSessions());
  // Each position sub-session is always exactly 1/3 of the configured session length.
  subSessionDuration = computed(
    () => (this.settings.sessionMinutes() * 60) / this.SUB_SESSIONS_PER_SESSION,
  );
  sessionDuration = computed(() => this.settings.sessionMinutes() * 60);

  state = signal<AppState>('idle');
  currentSession = signal(1);
  currentSubSession = signal(1);
  timeRemaining = signal(this.subSessionDuration());
  isRunning = signal(false);

  // Przerwa to stoper liczący w górę — trwa aż do ręcznego powrotu do sesji.
  // Sesja jest wtedy zamrożona i wraca dokładnie w tym samym miejscu.
  breakElapsed = signal(0);

  currentPosition = computed<Position>(() => {
    switch (this.currentSubSession()) {
      case 1: return 'sitting';
      case 2: return 'standing';
      case 3: return 'ball';
      default: return 'sitting';
    }
  });

  currentBreakType = computed<BreakType>(() => {
    // After session 1 -> meditation, session 2 -> stretching, alternating
    return this.currentSession() % 2 === 0 ? 'stretching' : 'meditation';
  });

  progress = computed(() => {
    const total = this.subSessionDuration();
    return ((total - this.timeRemaining()) / total) * 100;
  });

  sessionProgress = computed(() => {
    const subIndex = this.currentSubSession() - 1;
    const subProgress = this.progress();
    return (subIndex * 100 / this.SUB_SESSIONS_PER_SESSION) + (subProgress / this.SUB_SESSIONS_PER_SESSION);
  });

  // Total seconds remaining in the whole session (all sub-sessions combined).
  // Also valid during 'break' — the session is frozen, not discarded.
  sessionTimeRemaining = computed(() => {
    const state = this.state();
    if (state === 'idle' || state === 'completed') return 0;
    const remainingSubs = this.SUB_SESSIONS_PER_SESSION - this.currentSubSession();
    return this.timeRemaining() + remainingSubs * this.subSessionDuration();
  });

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private audio: AudioService, private notifications: NotificationService) {
    this.loadState();
    effect(() => this.saveState());
  }

  /**
   * Zastosowanie nowych ustawień. Bieżąca podsekcja zachowuje proporcjonalny postęp,
   * a numer sesji jest przycinany do nowej liczby sesji.
   */
  applySettings(totalSessions: number, sessionMinutes: number) {
    const oldSubDuration = this.subSessionDuration();
    this.settings.update({ totalSessions, sessionMinutes });
    const newSubDuration = this.subSessionDuration();

    if (this.currentSession() > this.totalSessions()) {
      this.currentSession.set(this.totalSessions());
    }

    if (this.state() === 'idle') {
      this.timeRemaining.set(newSubDuration);
    } else if (newSubDuration !== oldSubDuration) {
      const scaled = Math.round((this.timeRemaining() / oldSubDuration) * newSubDuration);
      this.timeRemaining.set(Math.max(1, Math.min(newSubDuration, scaled)));
    }
  }

  start() {
    this.notifications.requestPermission();
    this.state.set('session');
    this.isRunning.set(true);
    this.audio.playPositionChange(this.currentPosition());
    this.startTimer();
  }

  pause() {
    this.isRunning.set(false);
    this.audio.playClick();
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Ręczna przerwa z zatrzymanej sesji — liczy się w górę, aż do endBreak(). */
  startBreak() {
    if (this.state() !== 'session') return;
    this.pause();
    this.breakElapsed.set(0);
    this.state.set('break');
    this.isRunning.set(true);
    this.audio.playBreakStart(this.currentBreakType());
    this.startTimer();
  }

  reset() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state.set('idle');
    this.currentSession.set(1);
    this.currentSubSession.set(1);
    this.timeRemaining.set(this.subSessionDuration());
    this.breakElapsed.set(0);
    this.isRunning.set(false);
  }

  /** Koniec przerwy — powrót do sesji zamrożonej w momencie jej rozpoczęcia. */
  endBreak() {
    if (this.state() !== 'break') return;
    this.state.set('session');
    this.isRunning.set(true);
    this.audio.playPositionChange(this.currentPosition());
    this.startTimer();
  }

  skipToNextSession() {
    if (this.currentSession() >= this.totalSessions()) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const nextSession = this.currentSession() + 1;
    this.currentSession.set(nextSession);
    this.currentSubSession.set(1);
    this.timeRemaining.set(this.subSessionDuration());
    this.state.set('session');
    this.isRunning.set(true);
    this.audio.playPositionChange(this.currentPosition());
    this.startTimer();
  }

  addTime(minutes: number) {
    if (this.state() !== 'session') return;

    let targetTotalSeconds = this.sessionTimeRemaining() + minutes * 60;
    const maxTotalSeconds = this.sessionDuration();

    if (targetTotalSeconds > maxTotalSeconds) {
      targetTotalSeconds = maxTotalSeconds;
    }

    if (targetTotalSeconds <= 0) {
      // Jak spada do lub poniżej zera wymuś koniec ostatniej podsekcji (ruszy kolejna sesja)
      this.currentSubSession.set(this.SUB_SESSIONS_PER_SESSION);
      this.timeRemaining.set(0);
      this.onTimerComplete();
      return;
    }

    const subDuration = this.subSessionDuration();
    let neededFullSubs = Math.floor(targetTotalSeconds / subDuration);
    let remTime = targetTotalSeconds % subDuration;

    // Jeżeli czas dzieli się idealnie (np. 20:00 lub 40:00)
    if (remTime === 0 && neededFullSubs > 0) {
      neededFullSubs--;
      remTime = subDuration;
    }

    let newSub = this.SUB_SESSIONS_PER_SESSION - neededFullSubs;
    if (newSub < 1) newSub = 1;
    if (newSub > this.SUB_SESSIONS_PER_SESSION) newSub = this.SUB_SESSIONS_PER_SESSION;

    if (newSub !== this.currentSubSession()) {
      this.currentSubSession.set(newSub);
      this.audio.playPositionChange(this.currentPosition());
    }

    this.timeRemaining.set(remTime);
  }

  private startTimer() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      if (this.state() === 'break') {
        this.breakElapsed.update((e) => e + 1);
        return;
      }
      const remaining = this.timeRemaining() - 1;
      if (remaining <= 0) {
        this.timeRemaining.set(0);
        this.onTimerComplete();
      } else {
        this.timeRemaining.set(remaining);
      }
    }, 1000);
  }

  /** Wywoływane tylko dla sesji — przerwa nie ma końca sterowanego zegarem. */
  private onTimerComplete() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const nextSub = this.currentSubSession() + 1;
    if (nextSub <= this.SUB_SESSIONS_PER_SESSION) {
      this.currentSubSession.set(nextSub);
      this.timeRemaining.set(this.subSessionDuration());
      this.audio.playPositionChange(this.currentPosition());
      this.notifications.notifyPositionChange(this.currentPosition());
      this.startTimer();
    } else if (this.currentSession() >= this.totalSessions()) {
      this.state.set('completed');
      this.isRunning.set(false);
      this.audio.playComplete();
      this.notifications.notifyComplete();
    } else {
      this.notifications.notifySessionComplete(this.currentSession());
      this.currentSession.update((s) => s + 1);
      this.currentSubSession.set(1);
      this.timeRemaining.set(this.subSessionDuration());
      this.audio.playPositionChange(this.currentPosition());
      this.startTimer();
    }
  }

  private saveState() {
    const data = {
      state: this.state(),
      currentSession: this.currentSession(),
      currentSubSession: this.currentSubSession(),
      timeRemaining: this.timeRemaining(),
      breakElapsed: this.breakElapsed(),
      isRunning: this.isRunning(),
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (!data?.state) return;

      let { state, currentSession, currentSubSession, timeRemaining, isRunning } = data;
      let breakElapsed = data.breakElapsed ?? 0;

      // Zapis sprzed przerwy-stopera: 'ready' już nie istnieje, a 'break' znaczyło
      // wtedy „sesja skończona, trwa 10-minutowa przerwa". Jedno i drugie sprowadzamy
      // do zatrzymanej sesji na granicy sesji.
      if (data.breakElapsed === undefined && (state === 'break' || state === 'ready')) {
        if (state === 'break') {
          currentSession = Math.min(currentSession + 1, this.totalSessions());
        }
        currentSubSession = 1;
        timeRemaining = this.subSessionDuration();
        state = 'session';
        isRunning = false;
      }

      // Zabezpieczenie na wypadek zapisu niezgodnego z bieżącymi ustawieniami.
      currentSession = Math.min(currentSession, this.totalSessions());
      timeRemaining = Math.min(timeRemaining, this.subSessionDuration());

      if (isRunning && data.savedAt && (state === 'session' || state === 'break')) {
        const elapsed = Math.floor((Date.now() - data.savedAt) / 1000);
        ({ state, currentSession, currentSubSession, timeRemaining, breakElapsed } =
          this.simulateElapsed(elapsed, {
            state,
            currentSession,
            currentSubSession,
            timeRemaining,
            breakElapsed,
          }));
        isRunning = state === 'session' || state === 'break';
      }

      this.state.set(state);
      this.currentSession.set(currentSession);
      this.currentSubSession.set(currentSubSession);
      this.timeRemaining.set(timeRemaining);
      this.breakElapsed.set(breakElapsed);
      this.isRunning.set(isRunning);

      if (isRunning) {
        this.startTimer();
      }
    } catch {
      // ignore invalid saved data
    }
  }

  private simulateElapsed(
    elapsed: number,
    snapshot: {
      state: AppState;
      currentSession: number;
      currentSubSession: number;
      timeRemaining: number;
      breakElapsed: number;
    },
  ) {
    let { state, currentSession: session, currentSubSession: subSession } = snapshot;
    let { timeRemaining: remaining, breakElapsed } = snapshot;

    // Przerwa nie kończy się sama — po powrocie do aplikacji nadal trwa, tylko dłużej.
    if (state === 'break') {
      return {
        state,
        currentSession: session,
        currentSubSession: subSession,
        timeRemaining: remaining,
        breakElapsed: breakElapsed + elapsed,
      };
    }

    while (elapsed > 0 && state === 'session') {
      if (elapsed >= remaining) {
        elapsed -= remaining;

        const nextSub = subSession + 1;
        if (nextSub <= this.SUB_SESSIONS_PER_SESSION) {
          subSession = nextSub;
          remaining = this.subSessionDuration();
        } else if (session >= this.totalSessions()) {
          state = 'completed';
          remaining = 0;
        } else {
          session++;
          subSession = 1;
          remaining = this.subSessionDuration();
        }
      } else {
        remaining -= elapsed;
        elapsed = 0;
      }
    }

    return {
      state,
      currentSession: session,
      currentSubSession: subSession,
      timeRemaining: remaining,
      breakElapsed,
    };
  }
}
