import type { Level } from '../../core';
import { normalizeRoomCode, ROOM_CODE_LENGTH, type DuelResult, type RoomPlayer, type ServerMessage } from '../../net/protocol';
import type { SfxName } from '../audio/sfx';
import type { GameSession } from '../session';
import { formatTime } from '../ui/hud';
import type { Hud } from '../ui/hud';
import { DuelConnection } from './connection';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Ce dont le duel a besoin du reste de l'application (main.ts). */
export interface DuelHost {
  levels: Level[];
  hud: Hud;
  selected(): Level;
  playerName(): string;
  show(screen: 'screen-duel' | 'screen-duel-result' | null): void;
  /** Lance la course : session créée avec la graine commune, introduction de `seconds` (compte à rebours). */
  startRace(level: Level, seed: number, seconds: number): Promise<GameSession | null>;
  backToMenu(): void;
  play(name: SfxName): void;
}

/** Écart au point de départ selon l'ordre d'arrivée dans la salle (m). */
const START_OFFSETS = [-1.4, 1.4];

/**
 * Déroulé d'un duel côté navigateur : salle (créer, rejoindre par code ou par lien), compte à rebours,
 * course (liaison réseau de la session, adversaire affiché), résultat et revanche.
 */
export class DuelController {
  private readonly connection = new DuelConnection();
  private me = '';
  private code = '';
  private players: RoomPlayer[] = [];
  private session: GameSession | null = null;
  private timers: number[] = [];
  /** Numéro de la dernière action envoyée (voir protocol.ts : recalage sur l'état du serveur). */
  private seq = 0;
  /** Une course (compte à rebours compris) est en cours ou vient de finir : on est « en duel ». */
  active = false;

  constructor(private readonly host: DuelHost) {
    this.connection.onMessage = (m) => this.onMessage(m);
    this.connection.onClose = () => this.onConnectionLost();
    $('btn-duel-create').addEventListener('click', () => void this.create());
    $('btn-duel-join').addEventListener('click', () => void this.join($<HTMLInputElement>('duel-code').value));
    $('duel-code').addEventListener('keydown', (e) => e.key === 'Enter' && void this.join($<HTMLInputElement>('duel-code').value));
    $('btn-duel-copy').addEventListener('click', () => void this.copyLink());
    $('btn-duel-share').addEventListener('click', () => void this.share());
    $('btn-duel-close').addEventListener('click', () => this.quit());
    $('btn-dr-rematch').addEventListener('click', () => this.rematch());
    $('btn-dr-quit').addEventListener('click', () => this.quit());
    $('btn-duel-share').style.display = 'share' in navigator ? '' : 'none';
  }

  get rival(): RoomPlayer | undefined {
    return this.players.find((p) => p.id !== this.me);
  }

  /** Ouvre l'écran du duel (depuis l'accueil), éventuellement pour rejoindre directement un code (lien partagé). */
  open(code?: string): void {
    this.setWaiting(false);
    this.status('');
    $('duel-level-name').textContent = `Niveau ${this.host.selected().number}`;
    $<HTMLInputElement>('duel-code').value = code ?? '';
    this.host.show('screen-duel');
    if (code) void this.join(code);
  }

  /** Quitter le duel (bouton, menu pause) : la salle est quittée, retour à l'accueil. */
  quit(): void {
    this.connection.send({ t: 'leave' });
    this.connection.close();
    this.reset();
    this.host.backToMenu();
  }

  private async create(): Promise<void> {
    if (!(await this.connect())) return;
    this.connection.send({ t: 'create', level: this.host.selected().number, name: this.host.playerName() });
  }

  private async join(raw: string): Promise<void> {
    const code = normalizeRoomCode(raw);
    if (code.length !== ROOM_CODE_LENGTH) return this.status(`Le code fait ${ROOM_CODE_LENGTH} caractères.`, true);
    if (!(await this.connect())) return;
    this.connection.send({ t: 'join', code, name: this.host.playerName() });
  }

  private async connect(): Promise<boolean> {
    this.status('Connexion…');
    try {
      await this.connection.connect();
      this.status('');
      return true;
    } catch {
      this.status('Serveur de duel injoignable. Réessaie dans un instant.', true);
      return false;
    }
  }

  private onMessage(m: ServerMessage): void {
    switch (m.t) {
      case 'room':
        this.me = m.you;
        this.code = m.code;
        this.players = m.players;
        this.renderRoom();
        break;
      case 'start':
        void this.start(m.seed, m.level, m.inMs);
        break;
      case 'pos':
        this.session?.rivalMoved(m.p, m.ry);
        break;
      case 'reveal':
        this.session?.rivalReveal(m.doorId, m.ms, this.rival?.name ?? 'Ton ami');
        break;
      case 'floor':
        this.host.hud.setRivalFloor(m.floor);
        break;
      case 'finish':
        this.finish(m.winner, m.reason, m.results);
        break;
      case 'rematch':
        $('dr-status').textContent = `${this.rival?.name ?? 'Ton ami'} veut une revanche !`;
        break;
      case 'error':
        this.status(m.message, true);
        break;
    }
  }

  private renderRoom(): void {
    if (this.active) return;
    this.setWaiting(true);
    $('duel-room-code').textContent = this.code;
    const rows = this.players.map((p) => `<li><span>${escape(p.name)}${p.id === this.me ? ' (toi)' : ''}</span><span>${p.id === this.players[0].id ? 'a créé la salle' : 'prêt'}</span></li>`);
    if (this.players.length < 2) rows.push('<li class="empty">En attente de ton ami…</li>');
    $('duel-players').innerHTML = rows.join('');
    this.status(this.players.length >= 2 ? 'Tout le monde est là : départ dans quelques secondes !' : '');
  }

  private async start(seed: number, levelNumber: number, inMs: number): Promise<void> {
    const level = this.host.levels[levelNumber - 1];
    if (!level) return;
    this.active = true;
    document.body.classList.add('duel');
    this.clearTimers();
    const startedAt = performance.now();
    const session = await this.host.startRace(level, seed, inMs / 1000);
    if (!session) return;
    this.session = session;
    session.introSkippable = false;
    session.shiftStart(START_OFFSETS[Math.max(0, this.players.findIndex((p) => p.id === this.me))] ?? 0);
    session.addRival(this.rival?.name ?? 'Ton ami');
    session.net = {
      interact: (doorId, p) => this.connection.send({ t: 'interact', seq: ++this.seq, doorId, p: [p.x, p.y, p.z] }),
      floor: (floor) => this.connection.send({ t: 'floor', seq: ++this.seq, floor }),
      pos: (p, ry) => this.connection.send({ t: 'pos', p: [round(p.x), round(p.y), round(p.z)], ry: round(ry) }),
    };
    this.host.hud.setRivalFloor(1);
    // Compte à rebours calé sur le départ du serveur (le chargement de la pyramide a déjà pris un peu de temps).
    const left = inMs - (performance.now() - startedAt);
    for (const [text, at] of [['3', 3000], ['2', 2000], ['1', 1000], ['Go !', 0]] as const) {
      this.timers.push(
        window.setTimeout(() => {
          this.host.hud.showCountdown(text);
          this.host.play(at === 0 ? 'ascend' : 'click');
        }, Math.max(0, left - at)),
      );
    }
  }

  private finish(winner: string, reason: 'summit' | 'forfeit', results: DuelResult[]): void {
    this.session?.endDuel();
    const won = winner === this.me;
    const winnerName = results.find((r) => r.id === winner)?.name ?? '';
    $('dr-title').textContent = won ? 'Victoire !' : 'Défaite…';
    $('dr-sub').textContent =
      reason === 'forfeit' ? (won ? `${this.rival?.name ?? 'Ton ami'} a quitté la course.` : 'Tu as quitté la course.') : won ? 'Tu as atteint le sommet en premier !' : `${winnerName} a atteint le sommet avant toi.`;
    $('dr-results').innerHTML = results
      .map(
        (r) =>
          `<li class="${r.id === winner ? 'winner' : ''}"><span>${escape(r.name)}${r.id === this.me ? ' (toi)' : ''}</span><small>${r.time !== undefined ? formatTime(r.time) : `étage ${r.floor}`} · ${r.falls} chute${r.falls > 1 ? 's' : ''}</small></li>`,
      )
      .join('');
    $('dr-status').textContent = '';
    const rematch = $<HTMLButtonElement>('btn-dr-rematch');
    rematch.disabled = this.players.length < 2 || reason === 'forfeit';
    rematch.textContent = 'Revanche';
    // Le vainqueur profite d'abord de sa célébration au sommet.
    this.timers.push(window.setTimeout(() => this.host.show('screen-duel-result'), won && reason === 'summit' ? 1900 : 700));
    if (!won) this.host.play('riskyLose');
  }

  private rematch(): void {
    this.connection.send({ t: 'rematch' });
    const button = $<HTMLButtonElement>('btn-dr-rematch');
    button.disabled = true;
    button.textContent = 'En attente…';
    $('dr-status').textContent = `On attend ${this.rival?.name ?? 'ton ami'}…`;
  }

  private onConnectionLost(): void {
    if (!this.active && !this.code) return;
    const wasRacing = this.active;
    this.reset();
    if (wasRacing) {
      this.host.backToMenu();
      this.host.hud.showToast('Connexion perdue', 'bad', 3, 'Le duel est interrompu');
    } else {
      this.setWaiting(false);
      this.status('Connexion perdue avec le serveur.', true);
    }
  }

  private reset(): void {
    this.clearTimers();
    this.active = false;
    this.code = '';
    this.players = [];
    this.session = null;
    document.body.classList.remove('duel');
    this.host.hud.setRivalFloor(null);
  }

  private link(): string {
    return `${location.origin}${location.pathname}?salle=${this.code}`;
  }

  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.status('Lien copié !');
    } catch {
      this.status(this.link());
    }
  }

  private async share(): Promise<void> {
    try {
      await navigator.share({ title: 'PyraRush', text: `Viens me défier sur PyraRush ! Code : ${this.code}`, url: this.link() });
    } catch {
      /* partage annulé */
    }
  }

  private setWaiting(waiting: boolean): void {
    document.querySelector('.duel-card')!.classList.toggle('waiting', waiting);
  }

  private status(text: string, error = false): void {
    const el = $('duel-status');
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
