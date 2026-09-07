import type { QueryEvent } from '../types';

export type ScheduledPlayback = { context: AudioContext; stop: () => void };

let sharedContext: AudioContext | null = null;
const audioContext = () => sharedContext ??= new AudioContext({ latencyHint: 'interactive' });

export function warmPlayback(): void {
  const context = audioContext();
  if (context.state === 'suspended') void context.resume();
  const gain = context.createGain(); gain.gain.value = 0;
  gain.connect(context.destination); gain.disconnect();
}

/** Schedule the complete phrase on the Web Audio clock.
 * Browser timers may be delayed by Verovio layout; AudioContext events are not.
 */
export function schedulePhrase(events: QueryEvent[], millisecondsPerBeat = 625): ScheduledPlayback {
  const context = audioContext();
  const oscillators: OscillatorNode[] = [];
  const startTime = context.currentTime + .06;
  let elapsed = 0;
  for (const event of events) {
    const seconds = Math.max(.01, millisecondsPerBeat * event.durationRatio / 1000);
    if (event.kind === 'note' && event.pitchMidi !== null) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const attack = startTime + elapsed, release = attack + Math.max(.06, seconds);
      oscillator.frequency.value = 440 * 2 ** ((event.pitchMidi - 69) / 12);
      gain.gain.setValueAtTime(.0001, attack);
      gain.gain.linearRampToValueAtTime(.06, attack + .006);
      gain.gain.exponentialRampToValueAtTime(.001, Math.max(attack + .04, release - .025));
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(attack);
      oscillator.stop(release);
      oscillators.push(oscillator);
    }
    elapsed += seconds;
  }
  void context.resume();
  return { context, stop: () => { for (const oscillator of oscillators) try { oscillator.stop(); } catch {} } };
}
