import { Injectable, signal, computed } from '@angular/core';
import { AudioService } from './audio.service';

export type AppState = 'idle' | 'session' | 'break' | 'completed';
export type Position = 'sitting' | 'standing' | 'ball';
export type BreakType = 'meditation' | 'stretching';

@Injectable({ providedIn: 'root' })
export class TimerService {
  readonly TOTAL_SESSIONS = 6;
  readonly SUB_SESSION_DURATION = 20 * 60; // 20 minutes in seconds
  readonly BREAK_DURATION = 10 * 60; // 10 minutes in seconds
  readonly SUB_SESSIONS_PER_SESSION = 3;

  state = signal<AppState>('idle');
  currentSession = signal(1);
  currentSubSession = signal(1);
  timeRemaining = signal(this.SUB_SESSION_DURATION);
  isRunning = signal(false);

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
    const total = this.state() === 'break' ? this.BREAK_DURATION : this.SUB_SESSION_DURATION;
    return ((total - this.timeRemaining()) / total) * 100;
  });

  sessionProgress = computed(() => {
    const subIndex = this.currentSubSession() - 1;
    const subProgress = this.progress();
    return (subIndex * 100 / this.SUB_SESSIONS_PER_SESSION) + (subProgress / this.SUB_SESSIONS_PER_SESSION);
  });

  // Total seconds remaining in the whole session (all sub-sessions combined)
  sessionTimeRemaining = computed(() => {
    if (this.state() !== 'session') return 0;
    const remainingSubs = this.SUB_SESSIONS_PER_SESSION - this.currentSubSession();
    return this.timeRemaining() + remainingSubs * this.SUB_SESSION_DURATION;
  });

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private audio: AudioService) {}

  start() {
    this.state.set('session');
    this.isRunning.set(true);
    this.audio.playPositionChange(this.currentPosition());
    this.startTimer();
  }

  pause() {
    this.isRunning.set(false);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resume() {
    this.isRunning.set(true);
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
    this.timeRemaining.set(this.SUB_SESSION_DURATION);
    this.isRunning.set(false);
  }

  skipBreak() {
    if (this.state() !== 'break') return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.advanceToNextSession();
  }

  private startTimer() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      const remaining = this.timeRemaining() - 1;
      if (remaining <= 0) {
        this.timeRemaining.set(0);
        this.onTimerComplete();
      } else {
        this.timeRemaining.set(remaining);
      }
    }, 1000);
  }

  private onTimerComplete() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.state() === 'session') {
      const nextSub = this.currentSubSession() + 1;
      if (nextSub <= this.SUB_SESSIONS_PER_SESSION) {
        this.currentSubSession.set(nextSub);
        this.timeRemaining.set(this.SUB_SESSION_DURATION);
        this.audio.playPositionChange(this.currentPosition());
        this.startTimer();
      } else {
        if (this.currentSession() >= this.TOTAL_SESSIONS) {
          this.state.set('completed');
          this.audio.playComplete();
        } else {
          this.state.set('break');
          this.timeRemaining.set(this.BREAK_DURATION);
          this.audio.playBreakStart(this.currentBreakType());
          this.startTimer();
        }
      }
    } else if (this.state() === 'break') {
      this.advanceToNextSession();
    }
  }

  private advanceToNextSession() {
    const nextSession = this.currentSession() + 1;
    this.currentSession.set(nextSession);
    this.currentSubSession.set(1);
    this.state.set('session');
    this.timeRemaining.set(this.SUB_SESSION_DURATION);
    this.audio.playPositionChange(this.currentPosition());
    this.startTimer();
  }
}
