import { Injectable } from '@angular/core';
import { Position, BreakType } from './timer.service';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audioContext: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    // Resume if suspended (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private playTone(
    frequency: number,
    duration: number,
    startTime: number,
    type: OscillatorType = 'sine',
    volume = 0.4
  ): void {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(volume, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  playPositionChange(position: Position): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Different tone sequences per position
    switch (position) {
      case 'sitting':
        // Two ascending notes
        this.playTone(440, 0.3, now);
        this.playTone(550, 0.3, now + 0.35);
        break;
      case 'standing':
        // Three ascending notes - energetic
        this.playTone(440, 0.2, now);
        this.playTone(550, 0.2, now + 0.22);
        this.playTone(660, 0.3, now + 0.44);
        break;
      case 'ball':
        // Bouncy pattern
        this.playTone(523, 0.2, now, 'triangle');
        this.playTone(659, 0.2, now + 0.25, 'triangle');
        this.playTone(523, 0.2, now + 0.5, 'triangle');
        break;
    }
  }

  playBreakStart(breakType: BreakType): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    if (breakType === 'meditation') {
      // Slow, calming tones
      this.playTone(396, 0.8, now, 'sine', 0.3);
      this.playTone(528, 0.8, now + 1.0, 'sine', 0.3);
      this.playTone(639, 1.2, now + 2.0, 'sine', 0.2);
    } else {
      // More active, stretching tones
      this.playTone(440, 0.3, now, 'sine', 0.35);
      this.playTone(554, 0.3, now + 0.4, 'sine', 0.35);
      this.playTone(659, 0.5, now + 0.8, 'sine', 0.3);
    }
  }

  playComplete(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    // Victory fanfare
    this.playTone(523, 0.2, now);
    this.playTone(659, 0.2, now + 0.2);
    this.playTone(784, 0.2, now + 0.4);
    this.playTone(1047, 0.5, now + 0.6);
  }

  playClick(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(600, 0.05, now, 'sine', 0.3);
  }
}
