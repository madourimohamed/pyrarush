# PyraRush (dossier : pyrafall)

Jeu 3D de course sur pyramide, jouable dans le navigateur (mobile + desktop).

- Le concept complet et la feuille de route sont dans [GAME_DESIGN.md](GAME_DESIGN.md). Le relire avant toute évolution du jeu.
- La direction artistique, les budgets de performance et la **fiche technique des modèles 3D** sont dans [ART_DIRECTION.md](ART_DIRECTION.md). La relire avant tout travail graphique. Les maquettes de `design/` sont une référence d'ambiance (niveau console), pas une cible au détail près.
- Tout asset externe : licence vérifiée, fichier `LICENSE.txt` dans son dossier `public/models/<pack>/`, ligne dans [CREDITS.md](CREDITS.md).
- Toute décision de design ou technique validée avec l'utilisateur doit être ajoutée au « Journal des décisions » à la fin de GAME_DESIGN.md.
- Ne pas implémenter de fonctionnalités d'une version ultérieure avant que la version courante soit validée. V1 validée le 2026-10-11 ; la V2 a commencé par le **multijoueur entre amis** (salle à code, 2 à 4 joueurs). Robots : pas avant validation du multijoueur.

## Commandes

Node 22 est requis. Dans ce WSL, `npm` pointe vers le npm Windows : utiliser le Node Linux installé dans `~/.local/share/node-v22.20.0-linux-x64/bin` (à mettre en tête du PATH).

- `npm run dev` : serveur de développement (http://localhost:5173, accessible aussi depuis le réseau local pour tester sur téléphone)
- `npm test` : tests du moteur de règles (Vitest)
- Modifier les dépendances : utiliser `npx -y npm@11 install …` (le npm 10.9 fourni avec Node 22 plante sur l'arbre de dépendances de Vitest 4, erreur `edgesOut`).
- `npm run build` : vérification des types + build statique dans `dist/`
- `npm run build:server` puis `npm run server` : serveur du jeu (`server/`) : jeu compilé (`dist/`), API des comptes (`/api`) et multijoueur (`/ws`). Variables : `PORT` (défaut 8787), `DATABASE` (défaut `data/pyrarush.sqlite`, dossier ignoré par git), `TURNSTILE_SECRET` (anti-robot, absent en local), `TRUST_CLOUDFLARE=1` (derrière Cloudflare : vraie adresse IP des joueurs). Côté jeu : `VITE_TURNSTILE_SITE_KEY` à la compilation. `npm start` fait tout (builds + serveur). En dev, Vite relaie `/ws` vers le port 8787.
- Intégration continue : `.github/workflows/ci.yml` (types, tests, build du jeu et du serveur) à chaque push sur `master` et à chaque pull request.
- Tests entre amis : le tunnel Cloudflare doit pointer vers ce serveur (et non `vite preview`, qui ne gère pas les WebSockets).

- `npm run capture -- --label <nom>` : captures des vues de référence + mesures (`tools/capture-reference.mjs`, serveur lancé au préalable, ex. `npm run preview`). Sortie dans `docs/reference/niveau-<n>/<nom>/`.

Paramètres d'URL utiles : `?seed=123` (rejouer une pyramide), `?debloquer=6` (débloque les niveaux jusqu'à 6 pour tester), `?indices=scarab|hotCold|none`, `?stats=1` (compteur de performance), `?debug=1` (outils de mesure en production).
En dev (ou avec `?debug=1`), `window.__debug` expose la partie, le gel de la simulation, les vues de référence et les mesures (`src/client/debug/`).

Mesures graphiques : toujours capturer « avant / après » avec `npm run capture` et comparer aux objectifs de la bible (§ 8). Les mesures en navigateur automatisé (rendu logiciel) ne valent que pour les compteurs.
Dans ce WSL, Chromium (Playwright) a besoin de bibliothèques extraites localement : `LD_LIBRARY_PATH=<scratchpad>/libs/usr/lib/x86_64-linux-gnu` (libnss3, libnspr4, libasound2).

Commits : committer au fur et à mesure puis pousser chaque commit sur `origin master` (accord donné par l’utilisateur le 2026-10-11).

## Architecture

Trois couches : **socle** (`src/core`), **niveaux** (`src/levels`), **affichage** (`src/client`). Ne jamais mettre de logique spécifique à un niveau dans le socle ou le client : un niveau = des données.

- `src/core/` : le socle, TypeScript pur, **aucune dépendance 3D ni DOM**. Sera réutilisé tel quel par les robots et le serveur (V2).
  - `level.ts` : forme d'un niveau (`defineLevel`, `band`, `buildLevels`, valeurs par défaut). `theme.ts` : forme d'un thème (données pures) + `defineTheme` (surcharge du thème de base).
  - `mechanics/` : un type de porte = un objet `Mechanic` enregistré dans `registry.ts`. Ajouter une mécanique : créer l'objet, l'enregistrer, l'utiliser dans un niveau.
  - `layout.ts` : génération déterministe par graine + garantie qu'une pyramide est terminable.
  - `geometry.ts` : géométrie de la pyramide à degrés (positions des portes, trous, points d'arrivée, boîtes de collision).
  - `game.ts` : état de la partie ; les actions (`interact`, `reportFloor`, `update`) renvoient des événements.
- `src/levels/` : un fichier par niveau `NNN-nom.ts`, **découvert automatiquement** (`import.meta.glob`) et trié par numéro. Familles de thèmes dans `themes.ts`, briques de règles dans `shared.ts`. Ajouter un niveau = créer un fichier, rien d'autre.
- Objectif d'échelle : **~100 niveaux et ~100 thèmes**. Règles : pas de duplication (familles de thèmes + `defineTheme(surcharges, base)`, valeurs par défaut, briques partagées), pas de code spécifique à un niveau hors de son fichier, coût d'exécution indépendant du nombre de niveaux (une seule pyramide en mémoire, miniatures seulement pour les niveaux débloqués, décor instancié).
- `src/net/protocol.ts` : messages du multijoueur (WebSocket JSON), partagés par le navigateur et le serveur. `MIN_PLAYERS` / `MAX_PLAYERS` : **seule** limite du nombre de joueurs (rien d'autre ne suppose 2 ou 4 joueurs : listes d'adversaires, couleurs, places de départ, classement, cibles des pouvoirs).
- `src/core/multiplayer.ts` : règles et réglages d'équilibrage du multijoueur (pouvoirs, densité des pouvoirs cachés, mines, place au classement, cible du Nuage, places de départ, classement final). Le moteur (`game.ts`) gère les sceaux (`sealDoor`) et les coups (`knockDown`).
- `src/net/account.ts` : format de la progression, fusion, règles des pseudos et mots de passe (partagés jeu / serveur).
- `server/` : Node uniquement. `db.ts` (SQLite intégré à Node, migrations ; modèle « un compte, plusieurs moyens de connexion » prêt pour e-mail, Google, Facebook), `accounts.ts` (invités, sécurisation pseudo + mot de passe + code de secours, sessions, progression, suppression), `api.ts` (API JSON `/api`, jeton Bearer), `security.ts` (limites de fréquence, verrouillage temporaire après échecs, Turnstile, budget de messages ; aucun bannissement définitif). `rooms.ts` (salles, codes, lancement par l'hôte, compte à rebours, arrivées et podium, départs en cours de partie, revanche ; rejoue les actions sur le même moteur et fait autorité : pouvoirs cachés et leur réapparition, réserves, mines, sceaux, coups, classement ; testé avec une horloge manuelle), `index.ts` (HTTP statique + WebSocket `/ws`).
- `src/client/` : navigateur uniquement (Three.js + HTML/CSS). `account/` (compte invité automatique, synchronisation de la progression, Turnstile), `ui/accountScreen.ts` (écran « Mon compte »), `multiplayer/` : connexion authentifiée par le jeton du compte, contrôleur (écrans de salle et de classement), adversaires affichés (`opponent.ts`, une couleur par joueur).
  - `session.ts` relie moteur, physique, rendu et commandes ; il réagit aux événements du moteur.
  - `physics.ts` : contrôleur de personnage maison contre des boîtes alignées sur les axes (pas de moteur physique).
  - `camera.ts` : caméra automatique autour de la pyramide.
  - `input/input.ts` : clavier (`event.code`, donc AZERTY et QWERTY), souris, joystick tactile et boutons.
  - `render.ts` : renderer + post-traitement (bloom). Les couleurs > 1 (HDR) déclenchent la lueur.
  - `storage.ts` (sauvegarde locale), `thumbnails.ts` (miniatures 3D mises en cache, clé = empreinte du niveau), `ui/` (`hud.ts`, `menu.ts`, `icons.ts` : icônes SVG définies une seule fois, `data-icon` dans le HTML).
  - `audio/` : son généré (Web Audio) : `sfx.ts` (recettes d'effets), `music.ts` (séquenceur, style tiré du thème), `audio.ts` (moteur, réglages).
  - `scene/` : rendu (le monde n'applique aucune règle, il affiche). `world.ts` (structure de la pyramide), `doors.ts` (battants instanciés), `components/` (décor : un composant par type, registre dans `index.ts`, emplacements génériques dans `slots.ts`, `props` pose n'importe quel modèle GLB), `models.ts` (chargement et instanciation des GLB).
  - Un thème = palette + liste de composants (`theme.components`). Changer le design d'un niveau = changer cette liste ; ajouter un design = un composant enregistré dans le registre. Les tests vérifient que chaque composant et chaque option cités existent. `environment.ts` (ciel, décor), `textures.ts` (textures procédurales en canvas), `images.ts` (images du décor dans `public/textures/<dossier>/`, chacune en version ordinateur et `-mobile`, préchargées via `Component.textures` ; panoramas 360° préparés par `art/panoramas/prepare_panorama.py`), `props.ts` (scarabée, gant de boxe), `world.ts` (pyramide, portes).
- `art/` : sources des assets générés par script (Blender 4.5 sans interface, `~/.local/bin/blender -b --factory-startup --python <script>`). `art/explorer/` : le personnage (`build_explorer.py` → `public/models/explorer/explorer.glb`, `.blend` et aperçus ; `render_showcase.py` pour les images de présentation). Côté jeu : `scene/character.ts` (modèle animé, ou formes simples en repli), chargé par `preloadCharacter` (`models.ts`).
- Tests visuels : Playwright + Chromium headless (rendu logiciel, très lent : piloter `session.frame(dt)` manuellement pour capturer les animations).
