import '@fontsource-variable/fredoka';
import { pyramids, randomSeed, type HintMode, type PyramidConfig } from '../core';
import { Input } from './input/input';
import { Renderer } from './render';
import { ZOOM_LABELS, type ZoomLevel } from './camera';
import { GameSession, type SessionResult } from './session';
import { formatTime, Hud } from './ui/hud';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

/** V1 : seule la pyramide 1 est ouverte ; les autres sont accessibles en test via ?pyramide=2|3. */
const unlockedCount = Number(params.get('pyramide') ?? 1);
let selected: PyramidConfig = pyramids[Math.min(pyramids.length, Math.max(1, unlockedCount)) - 1];

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

function renderPyramidList(): void {
  const list = $('pyramid-list');
  list.innerHTML = '';
  pyramids.forEach((config, i) => {
    const locked = i + 1 > unlockedCount;
    const card = document.createElement('button');
    card.className = `pyramid-card${config === selected ? ' selected' : ''}${locked ? ' locked' : ''}`;
    card.innerHTML = `<b>${locked ? '🔒 ' : ''}${config.difficulty}</b>${config.floors} étages`;
    if (!locked) {
      card.addEventListener('click', () => {
        selected = config;
        renderPyramidList();
      });
    }
    list.appendChild(card);
  });
}

function startGame(seed: number): void {
  session?.dispose();
  const config: PyramidConfig = { ...selected, hints: hintMode };
  session = new GameSession(config, seed, input, hud, lowQuality, window.innerWidth / window.innerHeight, onVictory);
  session.camera.resize(window.innerWidth, window.innerHeight);
  session.camera.zoom = zoom;
  show(null);
}

function onVictory(result: SessionResult): void {
  const key = `best:${result.config.id}`;
  const previous = Number(storage.get(key) ?? Infinity);
  const isRecord = result.time < previous;
  if (isRecord) storage.set(key, String(Math.round(result.time)));
  $('v-time').textContent = formatTime(result.time);
  $('v-record').classList.toggle('show', isRecord && Number.isFinite(previous));
  $('v-falls').textContent = String(result.falls);
  $('v-doors').textContent = String(result.doorsTested);
  $('v-seed').textContent = String(result.seed);
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
$('btn-restart').addEventListener('click', () => session && startGame(session.seed));
$('btn-new').addEventListener('click', () => startGame(randomSeed()));
$('btn-menu').addEventListener('click', () => show('screen-menu'));
$('btn-v-new').addEventListener('click', () => startGame(randomSeed()));
$('btn-v-retry').addEventListener('click', () => session && startGame(session.seed));
$('btn-v-menu').addEventListener('click', () => show('screen-menu'));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (current === 'screen-howto') show(howtoReturn);
  else if (current === 'screen-pause') resume();
  else if (current === null) pause();
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- Démarrage ----------
renderPyramidList();
// Une pyramide en arrière-plan du menu.
session = new GameSession(selected, randomSeed(), input, hud, lowQuality, window.innerWidth / window.innerHeight, onVictory);
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
