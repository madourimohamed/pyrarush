# PyraRush (dossier : pyrafall)

Jeu 3D de course sur pyramide, jouable dans le navigateur (mobile + desktop).

- Le concept complet et la feuille de route sont dans [GAME_DESIGN.md](GAME_DESIGN.md). Le relire avant toute évolution du jeu.
- Toute décision de design ou technique validée avec l'utilisateur doit être ajoutée au « Journal des décisions » à la fin de GAME_DESIGN.md.
- Ne pas implémenter de fonctionnalités d'une version ultérieure (robots, serveur, salons) avant que la version courante soit validée.

## Commandes

Node 22 est requis. Dans ce WSL, `npm` pointe vers le npm Windows : utiliser le Node Linux installé dans `~/.local/share/node-v22.20.0-linux-x64/bin` (à mettre en tête du PATH).

- `npm run dev` : serveur de développement (http://localhost:5173, accessible aussi depuis le réseau local pour tester sur téléphone)
- `npm test` : tests du moteur de règles (Vitest)
- `npm run build` : vérification des types + build statique dans `dist/`

Paramètres d'URL utiles : `?seed=123` (rejouer une pyramide), `?debloquer=6` (débloque les niveaux jusqu'à 6 pour tester), `?indices=scarab|hotCold|none`.
En dev, `window.__session()` donne accès à la partie en cours.

## Architecture

Trois couches : **socle** (`src/core`), **niveaux** (`src/levels`), **affichage** (`src/client`). Ne jamais mettre de logique spécifique à un niveau dans le socle ou le client : un niveau = des données.

- `src/core/` : le socle, TypeScript pur, **aucune dépendance 3D ni DOM**. Sera réutilisé tel quel par les robots et le serveur (V2).
  - `level.ts` : forme d'un niveau (`defineLevel`, `band`, `buildLevels`, valeurs par défaut). `theme.ts` : forme d'un thème (données pures) + `defineTheme` (surcharge du thème de base).
  - `mechanics/` : un type de porte = un objet `Mechanic` enregistré dans `registry.ts`. Ajouter une mécanique : créer l'objet, l'enregistrer, l'utiliser dans un niveau.
  - `layout.ts` : génération déterministe par graine + garantie qu'une pyramide est terminable.
  - `geometry.ts` : géométrie de la pyramide à degrés (positions des portes, trous, points d'arrivée, boîtes de collision).
  - `game.ts` : état de la partie ; les actions (`interact`, `reportFloor`, `update`) renvoient des événements.
- `src/levels/` : un fichier par niveau (règles + thème + musique), ordre de progression dans `index.ts`, briques partagées dans `shared.ts`. Ajouter un niveau = un fichier + une ligne dans `index.ts`.
- `src/client/` : navigateur uniquement (Three.js + HTML/CSS).
  - `session.ts` relie moteur, physique, rendu et commandes ; il réagit aux événements du moteur.
  - `physics.ts` : contrôleur de personnage maison contre des boîtes alignées sur les axes (pas de moteur physique).
  - `camera.ts` : caméra automatique autour de la pyramide.
  - `input/input.ts` : clavier (`event.code`, donc AZERTY et QWERTY), souris, joystick tactile et boutons.
  - `render.ts` : renderer + post-traitement (bloom). Les couleurs > 1 (HDR) déclenchent la lueur.
  - `audio/` : son généré (Web Audio) : `sfx.ts` (recettes d'effets), `music.ts` (séquenceur, style tiré du thème), `audio.ts` (moteur, réglages).
  - `scene/` : rendu (le monde n'applique aucune règle, il affiche). `environment.ts` (ciel, décor), `textures.ts` (textures procédurales en canvas, aucun fichier image), `props.ts` (scarabée, gant de boxe), `world.ts` (pyramide, portes).
- Tests visuels : Playwright + Chromium headless (rendu logiciel, très lent : piloter `session.frame(dt)` manuellement pour capturer les animations).
