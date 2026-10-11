import '@fontsource-variable/fredoka';
import { randomSeed, type HintMode, type Level, type PyramidConfig } from '../core';
import { levels } from '../levels';
import { Input } from './input/input';
import { Renderer } from './render';
import { AudioEngine } from './audio/audio';
import { ZOOM_LABELS, type ZoomLevel } from './camera';
import { GameSession, type SessionResult } from './session';
import { formatTime, Hud } from './ui/hud';
import { hex } from './scene/themes';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : on continue sans */
    }
  },
};

// ---------- Niveaux et progression ----------
/** Niveaux débloqués : on débloque le suivant en terminant le précédent. `?debloquer=6` pour tester. */
const clampLevel = (n: number) => Math.min(levels.length, Math.max(1, Math.floor(n) || 1));
let unlocked = clampLevel(Math.max(Number(storage.get('unlocked') ?? 1), Number(params.get('debloquer') ?? 1)));
let selected: Level = levels[clampLevel(Number(storage.get('level') ?? unlocked)) - 1];
if (selected.number > unlocked) selected = levels[unlocked - 1];

function bestTime(level: Level): number | null {
  const v = Number(storage.get(`best:${level.config.id}`));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Couleurs de l'interface accordées au thème du niveau. */
function applyUiTheme(level: Level): void {
  const theme = level.theme;
  const root = document.documentElement.style;
  root.setProperty('--accent-a', theme.accent[0]);
  root.setProperty('--accent-b', theme.accent[1]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex(theme.sky.mid));
  document.body.style.background = hex(theme.sky.mid);
}

// ---------- Son ----------
const audio = new AudioEngine();
// Les navigateurs n'autorisent le son qu'après une interaction de l'utilisateur.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => audio.unlock(), { capture: true });
document.addEventListener('click', (e) => (e.target as HTMLElement).closest('button') && audio.play('click'));

function bindToggle(id: string, key: string, apply: (on: boolean) => void): void {
  const box = $<HTMLInputElement>(id);
  box.checked = storage.get(key) !== '0';
  apply(box.checked);
  box.addEventListener('change', () => {
    storage.set(key, box.checked ? '1' : '0');
    apply(box.checked);
    syncSoundButton();
  });
}
bindToggle('opt-music', 'music', (on) => audio.setMusicOn(on));
bindToggle('opt-sfx', 'sfx', (on) => audio.setSfxOn(on));
function syncSoundButton(): void {
  $('btn-sound').textContent = audio.musicOn || audio.sfxOn ? '🔊' : '🔇';
}
$('btn-sound').addEventListener('click', () => {
  const on = !(audio.musicOn || audio.sfxOn);
  for (const [id, key] of [['opt-music', 'music'], ['opt-sfx', 'sfx']]) {
    $<HTMLInputElement>(id).checked = on;
    storage.set(key, on ? '1' : '0');
  }
  audio.setMusicOn(on);
  audio.setSfxOn(on);
  syncSoundButton();
});
syncSoundButton();

// ---------- Options ----------
const HINT_RULES: Record<HintMode, string> = {
  scarab: 'Un mur libère un <b class="c-hint">scarabée</b> : il file vers le passage le plus proche. S’il s’agite, c’est tout près !',
  hotCold: 'Un mur t’indique si un passage est <b class="c-chaud">chaud</b>, <b class="c-tiede">tiède</b> ou <b class="c-froid">froid</b>.',
  none: 'Aucun indice : à toi de deviner et de mémoriser !',
};
const hintParam = params.get('indices') ?? (params.get('chaudfroid') === '1' ? 'hotCold' : null);
let hintMode: HintMode = (hintParam ?? storage.get('hints') ?? 'scarab') as HintMode;
if (!(hintMode in HINT_RULES)) hintMode = 'scarab';
function renderHintOptions(): void {
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#opt-hints button'))) {
    btn.classList.toggle('selected', btn.dataset.mode === hintMode);
  }
  $('rule-hints').innerHTML = HINT_RULES[hintMode];
}
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#opt-hints button'))) {
  btn.addEventListener('click', () => {
    hintMode = btn.dataset.mode as HintMode;
    storage.set('hints', hintMode);
    renderHintOptions();
  });
}
renderHintOptions();

$('controls-help').textContent = isTouch
  ? 'Joystick à gauche · SAUT et AGIR à droite · glisse pour tourner la caméra · 🔍 pour zoomer'
  : 'ZQSD / WASD ou flèches : bouger · Espace : sauter · E : ouvrir · glisser la souris : caméra · molette ou C : zoom';

// ---------- Zoom ----------
let zoom = Math.min(2, Math.max(0, Number(storage.get('zoom') ?? 0))) as ZoomLevel;
function setZoom(level: number, announce = false): void {
  zoom = Math.min(2, Math.max(0, level)) as ZoomLevel;
  storage.set('zoom', String(zoom));
  if (session) session.camera.zoom = zoom;
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#opt-zoom button'))) {
    btn.classList.toggle('selected', Number(btn.dataset.zoom) === zoom);
  }
  $('zoom-label').textContent = ZOOM_LABELS[zoom];
  if (announce) hud.showToast(`Caméra : ${ZOOM_LABELS[zoom].toLowerCase()}`, 'info', 1);
}
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#opt-zoom button'))) {
  btn.addEventListener('click', () => setZoom(Number(btn.dataset.zoom)));
}
$('btn-zoom').addEventListener('click', () => setZoom((zoom + 1) % 3, true));
$('touch').addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (current === null) setZoom(zoom + Math.sign(e.deltaY), true);
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  if (current !== null) return;
  if (e.code === 'KeyC') setZoom((zoom + 1) % 3, true);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(zoom - 1, true);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(zoom + 1, true);
});

// ---------- Rendu ----------
const lowQuality = isTouch;
const renderer = new Renderer($<HTMLCanvasElement>('game'), lowQuality);
const effectsBox = $<HTMLInputElement>('opt-effects');
effectsBox.checked = storage.get('effects') !== '0';
renderer.effects = effectsBox.checked;
effectsBox.addEventListener('change', () => {
  renderer.effects = effectsBox.checked;
  storage.set('effects', effectsBox.checked ? '1' : '0');
});

const input = new Input($('touch'), $('joy-base'), $('joy-knob'), $('btn-jump'), $('btn-act'));
const hud = new Hud();
let session: GameSession | null = null;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  session?.camera.resize(w, h);
  updateRotateHint();
}
window.addEventListener('resize', resize);

// ---------- Écrans ----------
const screens = ['screen-menu', 'screen-pause', 'screen-victory', 'screen-howto'] as const;
type Screen = (typeof screens)[number];
let current: Screen | null = null;
/** Écran à rouvrir en fermant « Comment jouer ? » (menu ou pause). */
let howtoReturn: Screen = 'screen-menu';
function show(screen: Screen | null): void {
  current = screen;
  for (const id of screens) $(id).classList.toggle('show', id === screen);
  const onMenu = screen === 'screen-menu' || (screen === 'screen-howto' && howtoReturn === 'screen-menu');
  $('hud').style.visibility = onMenu ? 'hidden' : 'visible';
  $('touch').style.visibility = onMenu ? 'hidden' : 'visible';
  if (session) session.attract = onMenu;
  input.enabled = screen === null;
  if (screen) input.reset();
}

let rotateDismissed = false;
function updateRotateHint(): void {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate-hint').classList.toggle('show', isTouch && portrait && !rotateDismissed);
}
$('btn-rotate-ok').addEventListener('click', () => {
  rotateDismissed = true;
  updateRotateHint();
});

function renderLevelList(): void {
  const list = $('level-list');
  list.innerHTML = '';
  for (const level of levels) {
    const locked = level.number > unlocked;
    const theme = level.theme;
    const card = document.createElement('button');
    card.className = `level-card${level === selected ? ' selected' : ''}${locked ? ' locked' : ''}`;
    card.style.setProperty('--sky', `linear-gradient(160deg, ${hex(theme.sky.top)}, ${hex(theme.sky.mid)} 55%, ${hex(theme.sky.horizon)})`);
    const best = bestTime(level);
    card.innerHTML = `
      <span class="level-num">${locked ? '🔒' : level.number}</span>
      <span class="level-name">${locked ? `Niveau ${level.number}` : level.name}</span>
      <span class="level-meta">${locked ? 'Termine le niveau précédent' : best ? `⏱ ${formatTime(best)}` : `${level.config.floors} étages`}</span>`;
    card.disabled = locked;
    card.addEventListener('click', () => selectLevel(level) && showBackground());
    list.appendChild(card);
  }
  $('level-title').textContent = `Niveau ${selected.number} · ${selected.name}`;
  $('level-tagline').textContent = selected.tagline;
}

/** Sélectionne un niveau débloqué (couleurs de l'interface comprises). Renvoie true si la sélection a changé. */
function selectLevel(level: Level): boolean {
  if (level.number > unlocked) return false;
  const changed = level !== selected;
  selected = level;
  storage.set('level', String(level.number));
  applyUiTheme(level);
  renderLevelList();
  return changed;
}

function createSession(config: PyramidConfig, level: Level, seed: number): GameSession {
  session?.dispose();
  const theme = level.theme;
  renderer.renderer.toneMappingExposure = theme.exposure;
  const created = new GameSession(config, theme, seed, input, hud, lowQuality, window.innerWidth / window.innerHeight, onVictory, audio);
  audio.setMusic(theme.music, level.number);
  created.camera.resize(window.innerWidth, window.innerHeight);
  created.camera.zoom = zoom;
  return created;
}

/** La pyramide du niveau sélectionné, en arrière-plan du menu. */
function showBackground(): void {
  session = createSession(selected.config, selected, randomSeed());
  session.attract = true;
}

let playing: Level = selected;
function startGame(seed: number, level: Level = selected): void {
  playing = level;
  applyUiTheme(level);
  session = createSession({ ...level.config, hints: hintMode }, level, seed);
  show(null);
}

function onVictory(result: SessionResult): void {
  const key = `best:${result.config.id}`;
  const previous = Number(storage.get(key) ?? Infinity);
  const isRecord = result.time < previous;
  if (isRecord) storage.set(key, String(Math.round(result.time)));
  $('v-title').textContent = `Niveau ${playing.number} terminé !`;
  $('v-time').textContent = formatTime(result.time);
  $('v-record').classList.toggle('show', isRecord && Number.isFinite(previous));
  $('v-falls').textContent = String(result.falls);
  $('v-doors').textContent = String(result.doorsTested);
  $('v-seed').textContent = String(result.seed);

  const next = levels[playing.number];
  const justUnlocked = next !== undefined && next.number > unlocked;
  if (justUnlocked) {
    unlocked = next.number;
    storage.set('unlocked', String(unlocked));
  }
  $('v-unlock').classList.toggle('show', justUnlocked);
  if (justUnlocked) setTimeout(() => audio.play('unlock'), 600);
  if (next) $('v-unlock').innerHTML = `🔓 Nouveau niveau débloqué :<br /><b>Niveau ${next.number} · ${next.name}</b>`;
  $('btn-v-next').style.display = next && next.number <= unlocked ? '' : 'none';
  $('v-final').classList.toggle('show', !next);
  renderLevelList();
  show('screen-victory');
}

function pause(): void {
  if (!session || session.paused || current !== null) return;
  session.paused = true;
  show('screen-pause');
}

function resume(): void {
  if (!session) return;
  session.paused = false;
  show(null);
}

$('btn-play').addEventListener('click', () => startGame(Number(params.get('seed')) || randomSeed()));
$('btn-pause').addEventListener('click', pause);
function openHowto(): void {
  howtoReturn = current === 'screen-pause' ? 'screen-pause' : 'screen-menu';
  show('screen-howto');
}
$('btn-howto').addEventListener('click', openHowto);
$('btn-pause-howto').addEventListener('click', openHowto);
$('btn-howto-close').addEventListener('click', () => show(howtoReturn));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => session && startGame(session.seed, playing));
$('btn-new').addEventListener('click', () => startGame(randomSeed(), playing));
/** Retour au menu : après une victoire, le niveau suivant (s'il est débloqué) est présélectionné. */
function backToMenu(): void {
  const next = levels[playing.number];
  selectLevel(current === 'screen-victory' && next && next.number <= unlocked ? next : playing);
  showBackground();
  show('screen-menu');
}
$('btn-menu').addEventListener('click', backToMenu);
$('btn-v-next').addEventListener('click', () => {
  const next = levels[playing.number];
  if (next) {
    selectLevel(next);
    startGame(randomSeed(), next);
  }
});
$('btn-v-new').addEventListener('click', () => startGame(randomSeed(), playing));
$('btn-v-retry').addEventListener('click', () => session && startGame(session.seed, playing));
$('btn-v-menu').addEventListener('click', backToMenu);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (current === 'screen-howto') show(howtoReturn);
  else if (current === 'screen-pause') resume();
  else if (current === null) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  audio.suspend(document.hidden);
});
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- Démarrage ----------
applyUiTheme(selected);
renderLevelList();
showBackground();
resize();
setZoom(zoom);
show('screen-menu');

let last = performance.now();
renderer.renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  if (session) {
    session.frame(dt);
    renderer.render(session.world.scene, session.camera.camera);
  }
});

// Accès de débogage (développement uniquement) : window.__session()
if (import.meta.env.DEV) (window as unknown as { __session: () => GameSession | null }).__session = () => session;
