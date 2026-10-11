/**
 * Icônes SVG de l'interface, définies une seule fois.
 * Dans le HTML : <span data-icon="nom"></span> (remplacé au démarrage par applyIcons) ; en TypeScript : icon('nom').
 */
const stroke = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  gear: stroke('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  chart: stroke('<path d="M5 20V11M12 20V5M19 20v-7"/>'),
  gamepad: stroke('<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 11v4M5.5 13h4"/><circle cx="16" cy="12" r="0.6" fill="currentColor"/><circle cx="18" cy="14.5" r="0.6" fill="currentColor"/>'),
  trophy: stroke('<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>'),
  users: stroke('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  clock: stroke('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  floors: stroke('<path d="M12 3l9 16H3z"/><path d="M7 12h10M5.3 15.5h13.4"/>'),
  lock: stroke('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z" fill="currentColor"/></svg>',
  cross: stroke('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity="0.85"/><path d="M9 9l6 6M15 9l-6 6" stroke="#1a1208"/>'),
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/></svg>',
  check: stroke('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity="0.9"/><path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#1a1208"/>'),
  sound: stroke('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: stroke('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  expand: stroke('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: stroke('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  zoom: stroke('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  up: stroke('<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>'),
  down: stroke('<path d="M12 5v14M5.5 12.5L12 19l6.5-6.5"/>'),
  hand: stroke('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5a1.5 1.5 0 0 1 3 0v5M14 10.5V7a1.5 1.5 0 0 1 3 0v6a6.5 6.5 0 0 1-6.5 7h-.5a6 6 0 0 1-5-2.7L3.5 14a1.6 1.6 0 0 1 2.6-1.8L8 14"/>'),
  thermo: stroke('<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
  scarab: stroke('<ellipse cx="12" cy="14" rx="5" ry="6.2"/><circle cx="12" cy="6" r="2.2"/><path d="M12 8v12M7 11L3.5 9M7 15l-3.5 1M17 11l3.5-2M17 15l3.5 1"/>'),
  info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>'),
  pow: stroke('<path d="M12 2.5l2 5.5 5.5-1.5-3 5 4.5 3.5-5.8.6L16 21l-4-4.2L8 21l.8-5.4L3 15l4.5-3.5-3-5L10 8z"/>'),
  pyramid:
    '<svg viewBox="0 0 100 88" aria-hidden="true"><defs><linearGradient id="pyr-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="0.5" stop-color="#ffc83d"/><stop offset="1" stop-color="#e08a1e"/></linearGradient></defs><path d="M50 3L97 85H3z" fill="url(#pyr-g)"/><path d="M50 3L97 85H50z" fill="#000" opacity="0.16"/><path d="M27 46h46M16 66h68" stroke="#7a4210" stroke-width="3" opacity="0.45"/><path d="M50 3l6 10H44z" fill="#fff8d6"/></svg>',
} as const;

export type IconName = keyof typeof ICONS;

export const icon = (name: IconName): string => ICONS[name];

/** Remplace chaque <span data-icon="nom"> par son icône. */
export function applyIcons(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-icon]'))) {
    const name = el.dataset.icon as IconName;
    if (name in ICONS && !el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', ICONS[name]);
    el.classList.add('icon');
  }
}
