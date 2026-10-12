/**
 * Anti-robot Cloudflare Turnstile (gratuit, vérifications illimitées), en mode invisible.
 * Clé publique : VITE_TURNSTILE_SITE_KEY à la compilation. Sans clé (développement local), aucun jeton n'est demandé
 * et le serveur, sans clé secrète, ne vérifie rien.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  execute(widget: string): void;
  reset(widget: string): void;
}

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    script.onerror = () => reject(new Error('Vérification anti-robot indisponible.'));
    document.head.appendChild(script);
  });
  return loading;
}

/** Jeton anti-robot à joindre à la création d'un compte ou à une connexion (undefined sans clé configurée). */
export async function turnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const turnstile = await load();
  const holder = document.createElement('div');
  holder.style.display = 'none';
  document.body.appendChild(holder);
  try {
    return await new Promise<string>((resolve, reject) => {
      const widget = turnstile.render(holder, {
        sitekey: SITE_KEY,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: resolve,
        'error-callback': () => reject(new Error('Vérification anti-robot échouée.')),
      });
      turnstile.execute(widget);
    });
  } finally {
    holder.remove();
  }
}
