import { Component, inject, effect, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { TimerService } from './services/timer.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  timer = inject(TimerService);
  private title = inject(Title);
  showResetModal = signal(false);

  confirmReset() {
    this.showResetModal.set(false);
    this.timer.reset();
  }

  constructor() {
    effect(() => {
      const state = this.timer.state();
      if (state === 'session') {
        const session = this.timer.currentSession();
        const seconds = this.timer.sessionTimeRemaining();
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        const time = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        this.title.setTitle(`(#${session} | ${time}) PomoCare`);
      } else {
        this.title.setTitle('PomoCare');
      }
    });
  }

  readonly positions = [
    { id: 'sitting',  label: 'Siedzenie', icon: '🧎', color: 'emerald' },
    { id: 'standing', label: 'Stanie',    icon: '🧍', color: 'green'   },
    { id: 'ball',     label: 'Piłka',     icon: '🤸', color: 'teal'    },
  ];

  readonly breakTypes: Record<string, { label: string; icon: string; description: string; color: string }> = {
    meditation: { label: 'Relaks', icon: '🧘', description: 'Czas na chwilę spokoju i skupienia', color: 'teal' },
    stretching: { label: 'Rozciąganie', icon: '🤸', description: 'Rozciągnij mięśnie i zresetuj ciało', color: 'amber' },
  };

  get currentPositionData() {
    return this.positions.find(p => p.id === this.timer.currentPosition()) || this.positions[0];
  }

  get currentBreakData() {
    return this.breakTypes[this.timer.currentBreakType()];
  }

  // Break / generic timer display
  get formattedTime(): string {
    const seconds = this.timer.timeRemaining();
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Session countdown — full 60-min window
  get formattedSessionTime(): string {
    const seconds = this.timer.sessionTimeRemaining();
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // ── Segmented ring helpers ──────────────────────────
  // SVG circle: cx=cy=140, r=118, so C ≈ 741 px
  readonly RING_R  = 158;   // cx=cy=180 in 360×360 SVG
  readonly RING_GAP = 27  ;  // px gap between the 3 segments

  get ringC(): number   { return 2 * Math.PI * this.RING_R; }
  get segLen(): number  { return (this.ringC - this.RING_GAP * 3) / 3; }

  /** 0→empty … 1→full fill fraction for segment at subIndex (0-based) */
  subFill(subIndex: number): number {
    const current = this.timer.currentSubSession() - 1; // 0-based
    if (subIndex < current) return 1;                   // completed
    if (subIndex > current) return 0;                   // not yet
    return this.timer.progress() / 100;                 // in progress
  }

  /** stroke-dashoffset for the progress arc of given segment */
  subOffset(subIndex: number): number {
    return this.segLen * (1 - this.subFill(subIndex));
  }

  getSessions(): number[] {
    return Array.from({ length: this.timer.TOTAL_SESSIONS }, (_, i) => i + 1);
  }

  getSessionStatus(sessionNum: number): 'completed' | 'current' | 'upcoming' {
    const current = this.timer.currentSession();
    const state = this.timer.state();
    if (sessionNum < current) return 'completed';
    if (sessionNum === current && (state === 'session' || state === 'break')) return 'current';
    return 'upcoming';
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === ' ' && document.activeElement === document.body) {
      event.preventDefault();
      this.timer.togglePause();
    }
  }
}
