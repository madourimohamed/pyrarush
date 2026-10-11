import type { MusicStyle } from '../../core';
import { MusicPlayer } from './music';
import { SFX, type SfxName } from './sfx';

/**
 * Point d'entrée audio : musique d'ambiance par thème et effets sonores, avec réglages séparés.
 * Le contexte audio ne démarre qu'après une première interaction (règle des navigateurs).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private music: MusicPlayer | null = null;
  private style: MusicStyle | null = null;
  private seed = 1;
  musicOn = true;
  sfxOn = true;

  /** À appeler sur un geste de l'utilisateur (clic, touche). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const master = this.ctx.createDynamicsCompressor();
      master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(master);
      this.sfxGain.connect(master);
      this.applyVolumes();
      if (this.style) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.sfxGain || !this.sfxOn) return;
    SFX[name](this.ctx, this.sfxGain, this.ctx.currentTime + 0.005);
  }

  /** Change la musique (nouveau thème ou nouvelle partie). */
  setMusic(style: MusicStyle, seed: number): void {
    if (this.style === style && this.seed === seed) return;
    this.style = style;
    this.seed = seed;
    if (this.ctx) this.startMusic();
  }

  setMusicOn(on: boolean): void {
    this.musicOn = on;
    this.applyVolumes();
  }

  setSfxOn(on: boolean): void {
    this.sfxOn = on;
    this.applyVolumes();
  }

  /** Coupe tout quand l'onglet est caché, relance au retour. */
  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    void (hidden ? this.ctx.suspend() : this.ctx.resume());
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicGain || !this.style) return;
    this.music?.stop();
    this.music = new MusicPlayer(this.ctx, this.musicGain, this.style, this.seed);
    this.music.start();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain?.gain.setTargetAtTime(this.musicOn ? 0.55 : 0, t, 0.1);
    this.sfxGain?.gain.setTargetAtTime(this.sfxOn ? 0.9 : 0, t, 0.05);
  }
}
