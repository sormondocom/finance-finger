export function playBellChime(): void {
  try {
    const ctx = new AudioContext();

    const ringBell = (freq: number, startTime: number, gain: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Fundamental + inharmonic upper partial for bell timbre
      osc1.type = 'sine';
      osc1.frequency.value = freq;
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2.756;

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.004);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 2.6);

      osc1.start(startTime);
      osc1.stop(startTime + 2.8);
      osc2.start(startTime);
      osc2.stop(startTime + 2.8);
    };

    const now = ctx.currentTime;
    ringBell(880, now, 0.22);        // first chime — higher
    ringBell(698, now + 0.5, 0.18);  // second chime — lower, slightly quieter

    setTimeout(() => ctx.close(), 6000);
  } catch {
    // Silent fallback — AudioContext unavailable or blocked
  }
}
