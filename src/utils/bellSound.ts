// Classic cowbell synthesis: two square oscillators at inharmonic frequencies
// (TR-808-style 562 Hz + 845 Hz), shaped through a bandpass filter with a sharp
// metallic attack and exponential decay. Two strikes give the "CLANG-clang" feel.
export function playCowbell(): void {
  try {
    const ctx = new AudioContext();

    const strike = (startTime: number, gainLevel: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'square';
      osc2.type = 'square';
      osc1.frequency.value = 562;   // fundamental
      osc2.frequency.value = 845;   // ~1.5× — inharmonic upper partial

      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 1200;
      bpf.Q.value = 0.7;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.001, startTime);
      env.gain.linearRampToValueAtTime(gainLevel, startTime + 0.003); // sharp metallic attack
      env.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0);  // natural decay

      osc1.connect(bpf);
      osc2.connect(bpf);
      bpf.connect(env);
      env.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + 1.2);
      osc2.stop(startTime + 1.2);
    };

    const now = ctx.currentTime;
    strike(now, 0.55);          // first hit — loud
    strike(now + 0.28, 0.35);  // second hit — softer echo

    setTimeout(() => ctx.close(), 4000);
  } catch {
    // Silent fallback — AudioContext unavailable or blocked
  }
}
