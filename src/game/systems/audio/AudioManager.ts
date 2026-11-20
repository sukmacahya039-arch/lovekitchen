import type { AudioSettings } from '../../../shared/types.ts';

const STORAGE_KEY = 'love_kitchen_audio_settings_v1';

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.45,
  sfxVolume: 0.85,
  muted: false,
};

type SoundEffect =
  | 'click'
  | 'pick'
  | 'cook'
  | 'ready'
  | 'serve'
  | 'coin'
  | 'clean'
  | 'burn'
  | 'order'
  | 'win';

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private settings: AudioSettings;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmMode: 'menu' | 'kitchen' | 'off' = 'off';
  private listeners = new Set<(s: AudioSettings) => void>();

  constructor() {
    this.settings = this.loadLocalSettings();
  }

  private loadLocalSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : DEFAULT_SETTINGS.masterVolume,
        musicVolume: typeof parsed.musicVolume === 'number' ? parsed.musicVolume : DEFAULT_SETTINGS.musicVolume,
        sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : DEFAULT_SETTINGS.sfxVolume,
        muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(patch: Partial<AudioSettings>): AudioSettings {
    this.settings = {
      ...this.settings,
      ...patch,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage quota
    }
    this.listeners.forEach((fn) => fn(this.getSettings()));
    return this.getSettings();
  }

  public subscribe(fn: (s: AudioSettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public startMusic(mode: 'menu' | 'kitchen'): void {
    if (this.bgmMode === mode && this.bgmTimer !== null) return;
    this.stopMusic();
    this.bgmMode = mode;
    this.bgmStep = 0;

    // Playful cozy marimba melody (menu = relaxed waltz, kitchen = upbeat cooking dash bounce)
    const menuNotes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 698.46];
    const kitchenNotes = [
      523.25, 659.25, 783.99, 1046.5, 880.0, 783.99, 659.25, 587.33,
      659.25, 783.99, 880.0, 783.99, 698.46, 659.25, 587.33, 523.25,
    ];
    const tempoMs = mode === 'menu' ? 460 : 280;

    this.bgmTimer = window.setInterval(() => {
      if (this.settings.muted) return;
      const gainLevel = this.settings.masterVolume * this.settings.musicVolume * 0.08;
      if (gainLevel <= 0.001) return;
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;

      const scale = mode === 'menu' ? menuNotes : kitchenNotes;
      const freq = scale[this.bgmStep % scale.length];
      this.bgmStep++;
      this.playTone(ctx, freq, mode === 'menu' ? 0.28 : 0.16, 'triangle', gainLevel);
      if (this.bgmStep % 4 === 1) {
        this.playTone(ctx, freq / 2, 0.22, 'sine', gainLevel * 0.7);
      }
    }, tempoMs);
  }

  public stopMusic(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmMode = 'off';
  }

  public playSfx(sfx: SoundEffect): void {
    if (this.settings.muted) return;
    const vol = this.settings.masterVolume * this.settings.sfxVolume;
    if (vol <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    switch (sfx) {
      case 'click':
        this.playTone(ctx, 640, 0.06, 'sine', vol * 0.16, now);
        break;
      case 'pick':
        this.playTone(ctx, 480, 0.07, 'triangle', vol * 0.18, now);
        this.playTone(ctx, 680, 0.07, 'triangle', vol * 0.16, now + 0.05);
        break;
      case 'cook':
        this.playTone(ctx, 320, 0.09, 'sawtooth', vol * 0.08, now);
        this.playTone(ctx, 440, 0.09, 'triangle', vol * 0.12, now + 0.06);
        break;
      case 'order':
        this.playTone(ctx, 784, 0.09, 'sine', vol * 0.2, now);
        this.playTone(ctx, 1046.5, 0.14, 'sine', vol * 0.2, now + 0.09);
        break;
      case 'ready':
        this.playTone(ctx, 880, 0.1, 'sine', vol * 0.22, now);
        this.playTone(ctx, 1174.66, 0.16, 'sine', vol * 0.22, now + 0.08);
        break;
      case 'serve':
        this.playTone(ctx, 587.33, 0.08, 'triangle', vol * 0.2, now);
        this.playTone(ctx, 783.99, 0.09, 'triangle', vol * 0.2, now + 0.07);
        this.playTone(ctx, 1046.5, 0.14, 'triangle', vol * 0.22, now + 0.14);
        break;
      case 'coin':
        this.playTone(ctx, 987.77, 0.07, 'sine', vol * 0.22, now);
        this.playTone(ctx, 1318.51, 0.18, 'sine', vol * 0.24, now + 0.07);
        break;
      case 'clean':
        this.playTone(ctx, 520, 0.06, 'sine', vol * 0.14, now);
        this.playTone(ctx, 720, 0.08, 'sine', vol * 0.14, now + 0.05);
        break;
      case 'burn':
        this.playTone(ctx, 210, 0.16, 'sawtooth', vol * 0.18, now);
        this.playTone(ctx, 165, 0.22, 'sawtooth', vol * 0.18, now + 0.14);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((n, idx) => {
          this.playTone(ctx, n, 0.2, 'triangle', vol * 0.22, now + idx * 0.11);
        });
        break;
    }
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime?: number
  ): void {
    const start = startTime ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

export const audioManager = new AudioManagerImpl();
