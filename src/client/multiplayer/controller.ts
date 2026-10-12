import { emptyReserve, POWER_IDS, startOffsets, type Level, type PowerDensity, type PowerId, type PowerReserve } from '../../core';
import { MIN_PLAYERS, normalizeRoomCode, ROOM_CODE_LENGTH, type PlayerResult, type RoomPlayer, type ServerMessage } from '../../net/protocol';
import type { SfxName } from '../audio/sfx';
import type { GameSession } from '../session';
import { formatTime } from '../ui/hud';
import type { Hud } from '../ui/hud';
import { POWER_INFO, renderPowerBar, setupPowerBar } from '../ui/powers';
import { RoomConnection } from './connection';
import { opponentColor } from './opponent';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Ce dont le multijoueur a besoin du reste de l'application (main.ts). */
export interface MultiplayerHost {
  levels: Level[];
  hud: Hud;
  selected(): Level;
  playerName(): string;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  show(screen: 'screen-room' | 'screen-results' | null): void;
  /** Lance la course : session créée avec la graine commune, introduction de `seconds` (compte à rebours). */
  startRace(level: Level, seed: number, seconds: number): Promise<GameSession | null>;
  backToMenu(): void;
  play(name: SfxName): void;
}

/** « 1ʳᵉ place », « 2ᵉ place »… */
const place = (rank: number) => `${rank}${rank === 1 ? 'ʳᵉ' : 'ᵉ'} place`;

/**
 * Partie entre amis côté navigateur, quel que soit le nombre de joueurs : salle (créer, rejoindre par code ou par lien,
 * lancer), compte à rebours, course (liaison réseau de la session, adversaires affichés, pouvoirs), classement, revanche.
 */
export class MultiplayerController {
  private readonly connection = new RoomConnection();
  private me = '';
  private code = '';
  private hostId = '';
  private maxPlayers = 0;
  private players: RoomPlayer[] = [];
  /** Noms de tous les participants de la course (y compris ceux qui sont partis depuis). */
  private names = new Map<string, string>();
  /** Étage de chaque adversaire (repères sur l'échelle). */
  private floors = new Map<string, number>();
  private colors = new Map<string, number>();
  private session: GameSession | null = null;
  private timers: number[] = [];
  /** Numéro de la dernière action envoyée (voir protocol.ts : recalage sur l'état du serveur). */
  private seq = 0;
  /** Réserve de pouvoirs, telle que le serveur l'annonce (lui seul la modifie). */
  private reserve: PowerReserve = emptyReserve();
  private density: PowerDensity = 'many';
  private barTimer = 0;
  private rematchReady = new Set<string>();
  /** Une course (compte à rebours compris) est en cours ou vient de finir. */
  active = false;

  constructor(private readonly host: MultiplayerHost) {
    this.connection.onMessage = (m) => this.onMessage(m);
    this.connection.onClose = () => this.onConnectionLost();
    const codeInput = $<HTMLInputElement>('room-code-input');
    $('btn-room-create').addEventListener('click', () => void this.create());
    $('btn-room-join').addEventListener('click', () => void this.join(codeInput.value));
    codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && void this.join(codeInput.value));
    $('btn-room-launch').addEventListener('click', () => this.connection.send({ t: 'launch' }));
    $('btn-room-copy').addEventListener('click', () => void this.copyLink());
    $('btn-room-share').addEventListener('click', () => void this.share());
    $('btn-room-close').addEventListener('click', () => this.quit());
    $('btn-res-rematch').addEventListener('click', () => this.rematch());
    $('btn-res-quit').addEventListener('click', () => this.quit());
    $('btn-room-share').style.display = 'share' in navigator ? '' : 'none';
    setupPowerBar((power) => this.usePower(power));
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#room-powers-choice button'))) {
      button.addEventListener('click', () => this.setDensity(button.dataset.powers as PowerDensity));
    }
    this.setDensity(host.storage.get('multi-powers') === 'few' ? 'few' : 'many');
  }

  /** Ouvre l'écran de salle (depuis l'accueil), éventuellement pour rejoindre directement un code (lien partagé). */
  open(code?: string): void {
    this.setWaiting(false);
    this.status('');
    $('room-level-name').textContent = `Niveau ${this.host.selected().number}`;
    $<HTMLInputElement>('room-code-input').value = code ?? '';
    this.host.show('screen-room');
    if (code) void this.join(code);
  }

  /** Quitter la partie (bouton, menu pause) : la salle est quittée, retour à l'accueil. */
  quit(): void {
    this.connection.send({ t: 'leave' });
    this.connection.close();
    this.reset();
    this.host.backToMenu();
  }

  /** Utilise un pouvoir (barre ou touches). Rien n'est envoyé ni consommé s'il ne peut pas servir. */
  usePower(power: PowerId): void {
    const session = this.session;
    if (!session || !this.active) return;
    if (this.reserve[power] <= 0) return this.host.hud.showToast(`Aucun ${POWER_INFO[power].name.toLowerCase()} en réserve`, 'info', 1.5, 'Ouvre des portes pour trouver des pouvoirs');
    const blocker = session.powerBlocker(power);
    if (blocker) return this.host.hud.showToast(POWER_INFO[power].name, 'info', 1.5, blocker);
    const p = session.feet;
    this.connection.send({ t: 'power', seq: ++this.seq, power, p: [round(p.x), round(p.y), round(p.z)] });
  }

  /** Raccourci clavier : touche 1 = premier pouvoir de la barre, etc. */
  usePowerAt(index: number): void {
    const power = POWER_IDS[index];
    if (power) this.usePower(power);
  }

  private name(id: string): string {
    return this.names.get(id) ?? this.players.find((p) => p.id === id)?.name ?? 'Un joueur';
  }

  /** Quantité de pouvoirs cachés choisie par le créateur de la salle (mémorisée). */
  private setDensity(density: PowerDensity): void {
    this.density = density;
    this.host.storage.set('multi-powers', density);
    document.querySelectorAll<HTMLButtonElement>('#room-powers-choice button').forEach((b) => b.classList.toggle('selected', b.dataset.powers === density));
  }

  private renderBar(): void {
    const session = this.session;
    const blockers = Object.fromEntries(POWER_IDS.map((id) => [id, session ? session.powerBlocker(id) : 'Pas maintenant'])) as Record<PowerId, string | null>;
    renderPowerBar(this.reserve, blockers);
  }

  private renderFloors(): void {
    this.host.hud.setOpponentFloors([...this.floors].map(([id, floor]) => ({ floor, color: this.colors.get(id) ?? 0xffffff })));
  }

  private async create(): Promise<void> {
    if (!(await this.connect())) return;
    this.connection.send({ t: 'create', level: this.host.selected().number, name: this.host.playerName(), powers: this.density });
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
      this.status('Serveur de jeu injoignable. Réessaie dans un instant.', true);
      return false;
    }
  }

  private onMessage(m: ServerMessage): void {
    const session = this.session;
    switch (m.t) {
      case 'room':
        this.onRoom(m);
        break;
      case 'start':
        void this.start(m.seed, m.level, m.inMs, m.order);
        break;
      case 'pos':
        session?.opponentMoved(m.id, m.p, m.ry);
        break;
      case 'self':
        if (m.powers.cloud < this.reserve.cloud) this.host.hud.showToast('Nuage envoyé !', 'good', 1.5, 'Le joueur devant toi ne voit plus très clair');
        this.reserve = m.powers;
        session?.applyServerState(m, m.seq === this.seq);
        this.renderBar();
        break;
      case 'gain':
        session?.powerGained(POWER_INFO[m.power].name, m.doorId);
        break;
      case 'state':
        if (m.id !== this.me) session?.setOpponentState(m.id, m.shield, m.turboMs, m.bootsMs, m.immuneMs);
        break;
      case 'cloud':
        this.host.hud.showCloud(m.ms);
        this.host.play('cloud');
        this.host.hud.showToast('Nuage de confusion !', 'bad', 1.8, `${this.name(m.from)} brouille ta vue`);
        break;
      case 'seal':
        session?.applySeal(m.doorId, m.owner === this.me, m.owner, m.ms);
        break;
      case 'mine':
        session?.addMine(m.id, vec(m.p), m.owner === this.me);
        break;
      case 'mineGone':
        session?.removeMine(m.id);
        break;
      case 'boom':
        session?.mineExploded(m.mine, m.target === this.me, m.result, vec(m.p));
        if (m.owner === this.me && m.target !== this.me && m.result === 'knocked') {
          this.host.hud.showToast('BOUM !', 'good', 1.8, `${this.name(m.target)} a marché sur ta mine !`);
        }
        break;
      case 'reveal':
        session?.opponentReveal(m.doorId, m.ms, this.name(m.id));
        break;
      case 'floor':
        this.floors.set(m.id, m.floor);
        this.renderFloors();
        break;
      case 'trapped':
        session?.opponentTrapped(m.id, m.doorId, m.from, m.to);
        break;
      case 'arrived':
        if (m.id === this.me) this.host.hud.showToast(m.rank === 1 ? 'Premier au sommet !' : `Sommet : ${place(m.rank)}`, 'good', 3, 'Les autres finissent leur course…');
        else this.host.hud.showToast(`${this.name(m.id)} au sommet !`, m.rank === 1 ? 'bad' : 'info', 2.2, place(m.rank));
        break;
      case 'finish':
        this.finish(m.reason, m.ranking);
        break;
      case 'rematch':
        this.rematchReady.add(m.id);
        $('res-status').textContent = `${this.name(m.id)} veut une revanche ! (${this.rematchReady.size}/${this.players.length})`;
        break;
      case 'error':
        this.status(m.message, true);
        break;
    }
  }

  private onRoom(m: Extract<ServerMessage, { t: 'room' }>): void {
    const gone = this.players.filter((p) => !m.players.some((q) => q.id === p.id));
    this.me = m.you;
    this.code = m.code;
    this.hostId = m.host;
    this.maxPlayers = m.max;
    this.players = m.players;
    for (const p of m.players) if (!this.names.has(p.id)) this.names.set(p.id, p.name);
    $('room-powers').textContent = m.powers === 'few' ? 'Peu de pouvoirs cachés derrière les portes' : 'Beaucoup de pouvoirs cachés derrière les portes';
    if (this.active) {
      // Un joueur a quitté la course : il disparaît, la partie continue pour les autres.
      for (const p of gone) {
        this.session?.removeOpponent(p.id);
        this.floors.delete(p.id);
        this.host.hud.showToast(`${p.name} a quitté la partie`, 'info', 2);
      }
      this.renderFloors();
      $<HTMLButtonElement>('btn-res-rematch').disabled = this.players.length < MIN_PLAYERS;
      return;
    }
    this.renderRoom();
  }

  private renderRoom(): void {
    this.setWaiting(true);
    $('room-code-value').textContent = this.code;
    const rows = this.players.map(
      (p) => `<li><span>${escape(p.name)}${p.id === this.me ? ' (toi)' : ''}</span><span>${p.id === this.hostId ? 'a créé la salle' : 'prêt'}</span></li>`,
    );
    for (let i = this.players.length; i < this.maxPlayers; i++) rows.push('<li class="empty">Place libre…</li>');
    $('room-players').innerHTML = rows.join('');
    const isHost = this.me === this.hostId;
    const enough = this.players.length >= MIN_PLAYERS;
    const launch = $<HTMLButtonElement>('btn-room-launch');
    launch.style.display = isHost ? '' : 'none';
    launch.disabled = !enough;
    launch.textContent = enough ? `Lancer la partie (${this.players.length} joueurs)` : 'Lancer la partie';
    this.status(
      isHost
        ? enough
          ? 'Lance quand tout le monde est là (la partie part seule si la salle est pleine).'
          : 'Partage le code : il faut au moins un ami.'
        : `En attente du lancement par ${this.name(this.hostId)}…`,
    );
  }

  private async start(seed: number, levelNumber: number, inMs: number, order: string[]): Promise<void> {
    const level = this.host.levels[levelNumber - 1];
    if (!level) return;
    this.active = true;
    document.body.classList.add('multi');
    this.clearTimers();
    this.rematchReady.clear();
    this.floors.clear();
    this.colors.clear();
    const startedAt = performance.now();
    const session = await this.host.startRace(level, seed, inMs / 1000);
    if (!session) return;
    this.session = session;
    session.introSkippable = false;
    session.enableMultiplayer();
    // Places de départ et couleurs : dans l'ordre donné par le serveur, pareil pour tous.
    const offsets = startOffsets(order.length);
    session.shiftStart(offsets[Math.max(0, order.indexOf(this.me))]);
    order
      .filter((id) => id !== this.me)
      .forEach((id, i) => {
        this.colors.set(id, opponentColor(i));
        this.floors.set(id, 1);
        session.addOpponent(id, this.name(id), opponentColor(i));
      });
    session.net = {
      interact: (doorId, p) => this.connection.send({ t: 'interact', seq: ++this.seq, doorId, p: [p.x, p.y, p.z] }),
      floor: (floor) => this.connection.send({ t: 'floor', seq: ++this.seq, floor }),
      pos: (p, ry) => this.connection.send({ t: 'pos', p: [round(p.x), round(p.y), round(p.z)], ry: round(ry) }),
    };
    this.renderFloors();
    this.seq = 0;
    this.reserve = emptyReserve();
    this.renderBar();
    window.clearInterval(this.barTimer);
    this.barTimer = window.setInterval(() => this.renderBar(), 200);
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

  private finish(reason: 'podium' | 'time' | 'forfeit', ranking: PlayerResult[]): void {
    this.session?.endRace();
    const mine = ranking.find((r) => r.id === this.me);
    const rank = mine?.rank ?? ranking.length;
    $('res-title').textContent = rank === 1 ? 'Victoire !' : place(rank);
    $('res-sub').textContent =
      reason === 'forfeit'
        ? 'Les autres joueurs ont quitté la partie.'
        : reason === 'time'
          ? 'Temps écoulé après la première arrivée.'
          : rank === 1
            ? 'Tu as atteint le sommet en premier !'
            : `${ranking[0].name} a atteint le sommet en premier.`;
    $('res-list').innerHTML = ranking
      .map((r) => {
        const detail = r.left ? 'a quitté la partie' : r.time !== undefined ? formatTime(r.time) : `étage ${r.floor}`;
        return `<li class="${r.rank === 1 ? 'winner' : ''}"><span><b class="rank r${Math.min(r.rank, 4)}">${r.rank}</b>${escape(r.name)}${r.id === this.me ? ' (toi)' : ''}</span><small>${detail} · ${r.falls} chute${r.falls > 1 ? 's' : ''}</small></li>`;
      })
      .join('');
    $('res-status').textContent = '';
    const rematch = $<HTMLButtonElement>('btn-res-rematch');
    rematch.disabled = this.players.length < MIN_PLAYERS;
    rematch.textContent = 'Revanche';
    // Celui qui vient d'arriver profite d'abord de sa célébration au sommet.
    this.timers.push(window.setTimeout(() => this.host.show('screen-results'), mine?.time !== undefined ? 1900 : 700));
    this.host.play(rank === 1 ? 'victory' : 'riskyLose');
  }

  private rematch(): void {
    this.connection.send({ t: 'rematch' });
    this.rematchReady.add(this.me);
    const button = $<HTMLButtonElement>('btn-res-rematch');
    button.disabled = true;
    button.textContent = 'En attente…';
    $('res-status').textContent = `En attente des autres joueurs (${this.rematchReady.size}/${this.players.length})…`;
  }

  private onConnectionLost(): void {
    if (!this.active && !this.code) return;
    const wasRacing = this.active;
    this.reset();
    if (wasRacing) {
      this.host.backToMenu();
      this.host.hud.showToast('Connexion perdue', 'bad', 3, 'La partie est interrompue');
    } else {
      this.setWaiting(false);
      this.status('Connexion perdue avec le serveur.', true);
    }
  }

  private reset(): void {
    this.clearTimers();
    this.host.hud.hideCloud();
    window.clearInterval(this.barTimer);
    this.active = false;
    this.code = '';
    this.players = [];
    this.names.clear();
    this.floors.clear();
    this.session = null;
    document.body.classList.remove('multi');
    this.host.hud.setOpponentFloors([]);
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
      await navigator.share({ title: 'PyraRush', text: `Viens jouer avec moi sur PyraRush ! Code : ${this.code}`, url: this.link() });
    } catch {
      /* partage annulé */
    }
  }

  private setWaiting(waiting: boolean): void {
    document.querySelector('.room-card')!.classList.toggle('waiting', waiting);
  }

  private status(text: string, error = false): void {
    const el = $('room-status');
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
const vec = ([x, y, z]: [number, number, number]) => ({ x, y, z });
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
