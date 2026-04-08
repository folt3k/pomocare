# PomoCare AI Agent Guidelines

## Architecture Overview
PomoCare is an Angular 21 standalone Pomodoro timer app with position change reminders. Core architecture:
- **State Management**: Reactive signals in `TimerService` drive UI updates via effects
- **Service Boundaries**: `TimerService` (core logic), `AudioService` (Web Audio API tones), `NotificationService` (browser notifications)
- **Data Flow**: Timer state → computed signals → template reactivity; localStorage persistence with elapsed time simulation
- **PWA Features**: Service worker for offline, manifest for installable app

## Key Patterns
- **Signal-Driven UI**: Use signals for reactive state, computed for derived values (e.g., `currentPosition` computed from `currentSubSession`)
- **Session Structure**: 6 sessions × 3 sub-sessions (20min each) → 10min break; positions cycle: sitting 🧎 → standing 🧍 → ball 🤸
- **Audio Feedback**: Position changes trigger distinct tone sequences (sine waves, frequencies); breaks use calming vs. active tones
- **State Persistence**: `localStorage` saves full state; on load, simulates elapsed time to resume accurately
- **Break Alternation**: Odd sessions → meditation 🧘, even → stretching 🤸

## Development Workflow
- **Build**: `ng build` (production with service worker, budgets: 500kB initial, 1MB total)
- **Serve**: `ng serve` (Docker-friendly: host 0.0.0.0, allowedHosts host.docker.internal)
- **Test**: `ng test` runs Vitest (not Karma); schematics skip test generation
- **Format**: Prettier auto-formats; strict TypeScript with Angular compiler options
- **PWA**: Production builds include service worker; test offline functionality

## Conventions
- **Styling**: Tailwind CSS + custom glassmorphism classes (`.glass`, `.btn-primary`); dark theme (#181818 bg, white text)
- **Animations**: Custom keyframes (fade-in, breathe, float); SVG transforms for progress rings
- **Icons**: Unicode emojis in templates (e.g., `{{ currentPositionData.icon }}`); inline SVG for buttons
- **Polish**: Clamp font sizes for responsiveness (e.g., `font-size: clamp(5rem, 13vw, 8rem)`); backdrop blur effects
- **No Tests**: Angular schematics configured to skip test files (`skipTests: true`)

## Key Files
- `src/app/app.ts`: Main component with state effects, position/break data
- `src/app/services/timer.service.ts`: Core timer logic, state signals, persistence
- `src/app/app.html`: Complex state-driven templates with SVG progress rings
- `src/styles.css`: Tailwind import, Inter font, dark theme globals
- `angular.json`: Skip tests in schematics, Docker serve config</content>
<parameter name="filePath">/home/kfoltyniak@software.altkom.pl/Projects/pomocare/AGENTS.md
