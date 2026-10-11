import '@fontsource-variable/fredoka';
import { randomSeed, starsFor, type HintMode, type Level, type PyramidConfig } from '../core';
import { levels } from '../levels';
import { AudioEngine } from './audio/audio';
import { ZOOM_LABELS, type ZoomLevel } from './camera';
import { Input } from './input/input';
import { Renderer } from './render';
import { hex } from './scene/themes';
import { GameSession, type SessionResult } from './session';
import { progress, storage } from './storage';
import { loadLevelThumbnails, renderPortrait } from './thumbnails';
import { Hud } from './ui/hud';
import { applyIcons } from './ui/icons';
import { enterFullscreen, setupFullscreen } from './ui/fullscreen';
import { MoveTutorial } from './ui/tutorial';
import { renderVictory } from './ui/victory';
import { renderBonusButton, renderChests } from './ui/bonus';
import { DuelController } from './duel/controller';
import { renderLevelCards, renderLevelInfo, renderRecords, showThumbnail, type MenuState } from './ui/menu';
import { preloadComponents } from './scene/components';
import { installDebugApi } from './debug/api';
import { PerfStats } from './debug/stats';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
applyIcons();
setupFullscreen(isTouch, [$('btn-fullscreen'), $('btn-hud-fullscreen')]);

// ---------- Rendu, commandes, son ----------
const lowQuality = isTouch;
const renderer = new Renderer($<HTMLCanvasElement>('game'), lowQuality);
const input = new Input($('touch'), $('joy-base'), $('joy-knob'), $('btn-jump'), $('btn-act'));
const hud = new Hud();
const audio = new AudioEngine();
let session: GameSession | null = null;

// Les navigateurs n'autorisent le son qu'après une interaction de l'utilisateur.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => audio.unlock(), { capture: true });
document.addEventListener('click', (e) => (e.target as HTMLElement).closest('button') && audio.play('click'));

// ---------- Progression ----------
/** `?debloquer=6` débloque les niveaux jusqu'au 6 (pour tester). */
let unlocked = progress.unlocked(levels.length, Number(params.get('debloquer') ?? 1));
let selected: Level = levels[Math.min(unlocked, Number(storage.get('level') ?? unlocked) || 1) - 1];
let playing: Level = selected;
const thumbnails = new Map<number, string>();
const menuState = (): MenuState => ({ levels, selected, unlocked, best: (l) => progress.best(l), stars: (l) => progress.stars(l), thumbnails });

// ---------- Options (écran Réglages) ----------
function bindToggle(id: string, key: string, apply: (on: boolean) => void): HTMLInputElement {
  const box = $<HTMLInputElement>(id);
  box.checked = storage.get(key) !== '0';
  apply(box.checked);
  box.addEventListener('change', () => {
    storage.set(key, box.checked ? '1' : '0');
    apply(box.checked);
    syncSoundButton();
  });
  return box;
}

/** Contrôle segmenté (boutons data-<attr>) lié à une valeur. */
function bindSegmented(containerId: string, attr: string, current: () => string, onPick: (value: string) => void): () => void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(`#${containerId} button`));
  const render = () => buttons.forEach((b) => b.classList.toggle('selected', b.dataset[attr] === current()));
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      onPick(b.dataset[attr]!);
      render();
    }),
  );
  render();
  return render;
}

bindToggle('opt-music', 'music', (on) => audio.setMusicOn(on));
bindToggle('opt-sfx', 'sfx', (on) => audio.setSfxOn(on));
bindToggle('opt-effects', 'effects', (on) => (renderer.effects = on));

function syncSoundButton(): void {
  $('btn-sound').classList.toggle('muted', !(audio.musicOn || audio.sfxOn));
}
$('btn-sound').addEventListener('click', () => {
  const on = !(audio.musicOn || audio.sfxOn);
  for (const [id, key] of [
    ['opt-music', 'music'],
    ['opt-sfx', 'sfx'],
  ]) {
    $<HTMLInputElement>(id).checked = on;
    storage.set(key, on ? '1' : '0');
  }
  audio.setMusicOn(on);
  audio.setSfxOn(on);
  syncSoundButton();
});
syncSoundButton();

const HINT_RULES: Record<HintMode, string> = {
  scarab: 'Un mur libère un <b class="c-hint">scarabée</b> : il file vers le passage le plus proche. S’il s’agite, c’est tout près !',
  hotCold: 'Un mur t’indique si un passage est <b class="c-chaud">chaud</b>, <b class="c-tiede">tiède</b> ou <b class="c-froid">froid</b>.',
  none: 'Aucun indice : à toi de deviner et de mémoriser !',
};
let hintMode = (params.get('indices') ?? storage.get('hints') ?? 'scarab') as HintMode;
if (!(hintMode in HINT_RULES)) hintMode = 'scarab';
const renderHintRule = () => ($('rule-hints').innerHTML = HINT_RULES[hintMode]);
bindSegmented('opt-hints', 'mode', () => hintMode, (v) => {
  hintMode = v as HintMode;
  storage.set('hints', hintMode);
  renderHintRule();
});
renderHintRule();

/** Zoom de jeu par défaut : moyen (on voit plusieurs étages). */
let zoom = Math.min(2, Math.max(0, Number(storage.get('zoom') ?? 1))) as ZoomLevel;
const renderZoomOptions = bindSegmented('opt-zoom', 'zoom', () => String(zoom), (v) => setZoom(Number(v)));
function setZoom(level: number, announce = false): void {
  zoom = Math.min(2, Math.max(0, level)) as ZoomLevel;
  storage.set('zoom', String(zoom));
  if (session) session.camera.zoom = zoom;
  $('zoom-label').textContent = ZOOM_LABELS[zoom];
  renderZoomOptions();
  if (announce) hud.showToast('Caméra', 'info', 1, ZOOM_LABELS[zoom]);
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

const nameInput = $<HTMLInputElement>('opt-name');
nameInput.value = storage.get('name') ?? '';
nameInput.addEventListener('input', () => {
  storage.set('name', nameInput.value.trim());
  renderProfile();
});

$('controls-help').textContent = isTouch
  ? 'Joystick à gauche · boutons sauter et ouvrir à droite · glisse pour tourner la caméra · loupe pour zoomer'
  : 'ZQSD / WASD ou flèches : bouger · Espace : sauter · E : ouvrir · glisser la souris : caméra · molette ou C : zoom';

// ---------- Écrans ----------
const screens = ['screen-menu', 'screen-duel', 'screen-duel-result', 'screen-pause', 'screen-chests', 'screen-victory', 'screen-howto', 'screen-settings', 'screen-records'] as const;
type Screen = (typeof screens)[number];
/** Écrans ouverts par-dessus un autre (menu ou pause), qui y reviennent à la fermeture. */
const overlays: Screen[] = ['screen-howto', 'screen-settings', 'screen-records'];
let current: Screen | null = null;
let returnTo: Screen = 'screen-menu';

function show(screen: Screen | null): void {
  current = screen;
  for (const id of screens) $(id).classList.toggle('show', id === screen);
  const onMenu = screen === 'screen-menu' || screen === 'screen-duel' || (screen !== null && overlays.includes(screen) && returnTo === 'screen-menu');
  $('hud').style.visibility = onMenu ? 'hidden' : 'visible';
  $('touch').style.visibility = onMenu ? 'hidden' : 'visible';
  if (session) session.attract = onMenu;
  input.enabled = screen === null;
  if (screen) input.reset();
}

function openOverlay(screen: Screen): void {
  if (current && !overlays.includes(current)) returnTo = current;
  if (screen === 'screen-records') renderRecords(menuState());
  show(screen);
}
const closeOverlay = () => show(returnTo);

let rotateDismissed = false;
function updateRotateHint(): void {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate-hint').classList.toggle('show', isTouch && portrait && !rotateDismissed);
}
$('btn-rotate-ok').addEventListener('click', () => {
  rotateDismissed = true;
  updateRotateHint();
});

// ---------- Accueil ----------
/** Couleurs de l'interface accordées au thème du niveau. */
function applyUiTheme(level: Level): void {
  const { theme } = level;
  const root = document.documentElement.style;
  root.setProperty('--accent-a', theme.accent[0]);
  root.setProperty('--accent-b', theme.accent[1]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex(theme.sky.mid));
  document.body.style.background = hex(theme.sky.mid);
}

function renderMenu(): void {
  renderLevelCards(menuState(), (level) => selectLevel(level) && showBackground());
  renderLevelInfo(selected);
  renderProfile();
}

/**
 * Miniatures des niveaux débloqués et du suivant uniquement (les autres restent verrouillés et grisés) :
 * le coût ne dépend pas du nombre total de niveaux.
 */
function refreshThumbnails(): void {
  const visible = levels.filter((l) => l.number <= unlocked + 1 && !thumbnails.has(l.number));
  void loadLevelThumbnails(visible, (level, url) => {
    thumbnails.set(level.number, url);
    showThumbnail(level, url);
  });
}

function renderProfile(): void {
  $('profile-name').textContent = storage.get('name') || 'Explorateur';
  $('profile-level').textContent = String(unlocked);
  $('unlock-count').textContent = `${unlocked} / ${levels.length}`;
}

/** Sélectionne un niveau débloqué. Renvoie true si la sélection a changé. */
function selectLevel(level: Level): boolean {
  if (level.number > unlocked) return false;
  const changed = level !== selected;
  selected = level;
  storage.set('level', String(level.number));
  applyUiTheme(level);
  renderMenu();
  return changed;
}

// ---------- Parties ----------
/**
 * Crée la partie d'un niveau, après avoir chargé ses modèles 3D (une seule fois par modèle).
 * Si une autre demande arrive pendant le chargement, seule la plus récente est construite.
 */
let sessionRequest = 0;
async function createSession(config: PyramidConfig, level: Level, seed: number): Promise<GameSession | null> {
  const request = ++sessionRequest;
  await preloadComponents(level.theme.components);
  if (request !== sessionRequest) return null;
  session?.dispose();
  const { theme } = level;
  renderer.renderer.toneMappingExposure = theme.exposure;
  const created = new GameSession(config, theme, seed, input, hud, lowQuality, window.innerWidth / window.innerHeight, onVictory, audio);
  audio.setMusic(theme.music, level.number);
  audio.setIntensity(0);
  created.camera.resize(window.innerWidth, window.innerHeight);
  created.camera.zoom = zoom;
  return created;
}

/** La pyramide du niveau sélectionné, en arrière-plan de l'accueil. */
async function showBackground(): Promise<void> {
  const created = await createSession(selected.config, selected, randomSeed());
  if (!created) return;
  session = created;
  session.attract = current === 'screen-menu' || (current !== null && overlays.includes(current));
}

/** Lance une partie ; `intro` = durée de l'introduction (en duel : le compte à rebours). */
async function startGame(seed: number, level: Level = selected, intro?: number): Promise<GameSession | null> {
  performance.mark('pyrarush:level-start');
  playing = level;
  applyUiTheme(level);
  const created = await createSession({ ...level.config, hints: hintMode }, level, seed);
  if (!created) return null;
  session = created;
  hud.setLevel(level.number, level.name);
  show(null);
  created.onIntroEnd = () => tutorial.start(created);
  created.onShieldEnd = refreshBonusButton;
  refreshBonusButton();
  created.startIntro(zoom, intro);
  performance.measure('pyrarush:level-ready', 'pyrarush:level-start');
  return created;
}

function onVictory(result: SessionResult): void {
  // En duel, c'est le serveur qui annonce le vainqueur (écran de résultat du duel, sans coffres ni étoiles).
  if (duel.active) return;
  const { isRecord, hadPrevious } = progress.recordTime(playing, result.time);
  const stars = starsFor(playing.goals, result.time, result.falls);
  progress.recordStars(playing, stars.stars);

  // Une seule étoile (terminer) suffit pour débloquer la suite.
  const next = levels[playing.number];
  const justUnlocked = next !== undefined && next.number > unlocked;
  if (justUnlocked) {
    unlocked = next.number;
    progress.unlock(unlocked);
    refreshThumbnails();
  }
  renderMenu();
  // D'abord le trésor du sommet, puis le bilan du niveau.
  renderChests({
    current: progress.bonus(),
    onOpen: () => audio.play('chest'),
    onPick: (bonus) => progress.setBonus(bonus),
    onDone: () => {
      renderVictory({
        level: playing,
        time: result.time,
        falls: result.falls,
        doorsTested: result.doorsTested,
        seed: result.seed,
        result: stars,
        newRecord: isRecord && hadPrevious,
        next,
        nextThumbnail: next ? thumbnails.get(next.number) : undefined,
        justUnlocked,
        onStar: (i) => audio.play(`star${i}`),
      });
      show('screen-victory');
      if (justUnlocked) setTimeout(() => audio.play('unlock'), 1900);
    },
  });
  show('screen-chests');
}

// ---------- Bonus ----------
function refreshBonusButton(): void {
  renderBonusButton(progress.bonus(), session?.shieldActive ?? false);
}

function useBonus(): void {
  const bonus = progress.bonus();
  if (!bonus) return;
  // En duel, les bonus solo sont remplacés par les pouvoirs du duel.
  if (duel.active) return;
  if (!session?.useBonus(bonus)) return;
  progress.setBonus(null);
  refreshBonusButton();
}
$('btn-bonus').addEventListener('click', useBonus);

function pause(): void {
  if (!session || session.paused || current !== null) return;
  // En duel la course continue : le menu s'affiche mais rien n'est figé.
  session.paused = !duel.active;
  show('screen-pause');
}

function resume(): void {
  if (!session) return;
  session.paused = false;
  show(null);
}

/** Retour à l'accueil : après une victoire, le niveau suivant (s'il est débloqué) est présélectionné. */
function backToMenu(): void {
  const next = levels[playing.number];
  selectLevel(current === 'screen-victory' && next && next.number <= unlocked ? next : playing);
  showBackground();
  show('screen-menu');
}

// ---------- Duel entre amis ----------
const duel = new DuelController({
  levels,
  hud,
  selected: () => selected,
  playerName: () => storage.get('name') || 'Explorateur',
  storage,
  show,
  startRace: (level, seed, seconds) => startGame(seed, level, seconds),
  backToMenu,
  play: (name) => audio.play(name),
});
$('btn-duel').addEventListener('click', () => duel.open());

// ---------- Boutons et raccourcis ----------
$('btn-play').addEventListener('click', () => {
  // Sur mobile, toucher « Jouer » passe en plein écran (geste utilisateur requis par les navigateurs).
  if (isTouch) void enterFullscreen();
  void startGame(Number(params.get('seed')) || randomSeed());
});
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => session && startGame(session.seed, playing));
$('btn-new').addEventListener('click', () => startGame(randomSeed(), playing));
$('btn-menu').addEventListener('click', () => (duel.active ? duel.quit() : backToMenu()));
$('btn-v-next').addEventListener('click', () => {
  const next = levels[playing.number];
  if (!next) return;
  selectLevel(next);
  startGame(randomSeed(), next);
});
$('btn-v-new').addEventListener('click', () => startGame(randomSeed(), playing));
$('btn-v-retry').addEventListener('click', () => session && startGame(session.seed, playing));
$('btn-v-menu').addEventListener('click', backToMenu);
for (const [id, screen] of [
  ['btn-howto', 'screen-howto'],
  ['btn-pause-howto', 'screen-howto'],
  ['btn-settings', 'screen-settings'],
  ['btn-pause-settings', 'screen-settings'],
  ['btn-records', 'screen-records'],
  ['btn-records-2', 'screen-records'],
] as const) {
  $(id).addEventListener('click', () => openOverlay(screen));
}
$('btn-howto-close').addEventListener('click', closeOverlay);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));

window.addEventListener('keydown', (e) => {
  if (current === null && !(e.target instanceof HTMLInputElement)) {
    if (e.code === 'KeyC') setZoom((zoom + 1) % 3, true);
    if (e.code === 'KeyB') useBonus();
    if (duel.active && /^Digit[1-4]$/.test(e.code)) duel.usePowerAt(Number(e.code.slice(5)) - 1);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(zoom - 1, true);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(zoom + 1, true);
  }
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (e.code === 'KeyP' && e.target instanceof HTMLInputElement) return;
  if (current !== null && overlays.includes(current)) closeOverlay();
  else if (current === 'screen-pause') resume();
  else if (current === null) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  audio.suspend(document.hidden);
});
document.addEventListener('gesturestart', (e) => e.preventDefault());

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  session?.camera.resize(window.innerWidth, window.innerHeight);
  updateRotateHint();
}
window.addEventListener('resize', resize);

// ---------- Tutoriel de déplacement (première partie) ----------
const tutorial = new MoveTutorial(isTouch, storage);

// ---------- Mesures (étape 0 de la bible graphique) ----------
/** ?stats=1 affiche le compteur ; en développement ou avec ?debug=1, window.__debug expose les outils de mesure. */
const stats = new PerfStats(renderer.renderer, params.has('stats'));
let frozen = false;
if (import.meta.env.DEV || params.has('debug')) {
  installDebugApi({
    session: () => session,
    startLevel: async (n, seed) => void (await startGame(seed, levels[Math.min(levels.length, Math.max(1, n)) - 1])),
    setFrozen: (f) => (frozen = f),
    stats,
  });
}
performance.mark('pyrarush:start');

// ---------- Démarrage ----------
applyUiTheme(selected);
renderMenu();
void showBackground().then(() => performance.measure('pyrarush:menu-ready', 'pyrarush:start'));
resize();
setZoom(zoom);
show('screen-menu');
// Lien d'invitation à un duel : ?salle=CODE ouvre directement la salle.
const invite = params.get('salle');
if (invite) duel.open(invite);

let last = performance.now();
renderer.renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  if (session) {
    stats.beginFrame(now);
    if (!frozen) session.frame(dt);
    tutorial.update();
    renderer.render(session.world.scene, session.camera.camera);
    stats.endFrame(now);
  }
});

// Miniatures et portrait : après le premier affichage, pour ne pas retarder l'arrivée sur l'accueil.
setTimeout(() => {
  const portrait = renderPortrait();
  $<HTMLImageElement>('profile-avatar').src = portrait;
  $<HTMLImageElement>('promo-avatar').src = portrait;
  refreshThumbnails();
}, 400);

