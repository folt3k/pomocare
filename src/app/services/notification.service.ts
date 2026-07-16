import { Injectable } from '@angular/core';
import { Position } from './timer.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly positionLabels: Record<Position, string> = {
    sitting: 'Siedzenie 🧎',
    standing: 'Stanie 🧍',
    ball: 'Piłka 🤸',
  };

  requestPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  notifyPositionChange(position: Position): void {
    this.send('Zmień pozycję!', this.positionLabels[position]);
  }

  notifySessionComplete(session: number): void {
    this.send(`Sesja nr ${session} ukończona.`, 'Zrób sobie przerwę.');
  }

  notifyComplete(): void {
    this.send('Gratulacje! 🎉', 'Wszystkie sesje ukończone!');
  }

  private send(title: string, body: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}
