/**
 * Plein écran sur mobile : masque la barre du navigateur et verrouille le paysage quand c'est possible (Android).
 * Sur iPhone, Safari ne permet pas le plein écran d'une page : on propose d'ajouter le jeu à l'écran d'accueil
 * (le manifeste l'ouvre alors sans barre, comme une application).
 */
const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export const fullscreenSupported = (): boolean => !!(root.requestFullscreen || root.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
const isFullscreen = () => !!(document.fullscreenElement || doc.webkitFullscreenElement);
export const isStandalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function enterFullscreen(): Promise<void> {
  if (isFullscreen() || !fullscreenSupported()) return;
  try {
    await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen!());
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape').catch(() => {});
  } catch {
    /* refusé par le navigateur : on continue sans plein écran */
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (!isFullscreen()) return enterFullscreen();
  await (document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.())?.catch(() => {});
}

/** Branche les boutons et tient à jour les classes du body (can-fullscreen, is-fullscreen, ios). */
export function setupFullscreen(isTouch: boolean, buttons: HTMLElement[]): void {
  document.body.classList.toggle('can-fullscreen', isTouch && fullscreenSupported() && !isStandalone());
  document.body.classList.toggle('ios', isIos() && !isStandalone());
  const sync = () => document.body.classList.toggle('is-fullscreen', isFullscreen());
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  for (const button of buttons) button.addEventListener('click', () => void toggleFullscreen());
}
