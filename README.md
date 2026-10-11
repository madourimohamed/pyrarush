# PyraRush

**Course en 3D au sommet d'une pyramide, jouable directement dans le navigateur, sur ordinateur comme sur smartphone.**

Explore les portes de la pyramide pour découvrir les passages secrets, évite les pièges, mémorise ton chemin et atteins le sommet le plus vite possible.

![Menu de PyraRush](docs/screenshots/menu.png)

> Statut : **V1, prototype solo jouable.** Les robots et le multijoueur sont prévus pour la V2 (voir la [feuille de route](#feuille-de-route)).

---

## Sommaire

- [Le jeu](#le-jeu)
- [Commandes](#commandes)
- [Démarrage rapide](#démarrage-rapide)
- [Scripts](#scripts)
- [Paramètres d'URL](#paramètres-durl)
- [Architecture](#architecture)
- [Ajouter une mécanique ou une pyramide](#ajouter-une-mécanique-ou-une-pyramide)
- [Tests](#tests)
- [Choix techniques](#choix-techniques)
- [Feuille de route](#feuille-de-route)
- [Documentation de design](#documentation-de-design)

---

## Le jeu

La pyramide est **à degrés** : chaque étage est une terrasse qui fait le tour complet de la pyramide. Sa paroi est percée de portes. Pour monter, il faut trouver les bonnes portes.

| Porte | Effet |
|---|---|
| **Passage** | Tu montes d'un étage. Il s'illumine quelques secondes pour tous les joueurs. |
| **Mur** | Rien ne se passe… mais un indice t'aide (voir ci-dessous). |
| **Piège** | Un **gant de boxe** jaillit (« POW ! ») et t'envoie à l'étage du dessous. |
| **Porte risquée ±2** | Dorée et reconnaissable : un pari, **+2 ou −2 étages**. Un seul essai par partie. |

**Les règles qui comptent :**

- **Les portes ne changent jamais pendant une partie** : ce que tu apprends reste vrai. Une nouvelle partie génère une nouvelle disposition.
- **Une chute fait perdre de la progression, pas la mémoire.** Les passages que tu as déjà trouvés restent marqués en doré, pour toi seul.
- **Les terrasses ont des trous** : saute par-dessus, sinon tu tombes à l'étage du dessous.
- **Règle d'or du design** : tes décisions doivent compter davantage que la chance. Les paris sont visibles, les indices permettent de déduire.

### Indices (au choix dans le menu)

| Mode | Fonctionnement |
|---|---|
| **Scarabée** (par défaut) | Un scarabée doré sort du mur et détale vers le passage le plus proche. S'il s'agite et scintille, c'est tout près. |
| **Chaud / froid** | La porte devient rouge, orange ou bleue selon la distance du passage. |
| **Aucun** | Pure mémoire et observation. |

| Le scarabée indique la direction | Un piège déclenche le gant de boxe |
|---|---|
| ![Scarabée](docs/screenshots/scarabee.png) | ![Gant de boxe](docs/screenshots/gant-de-boxe.png) |

### Pyramides

| Pyramide | Étages | Statut | Contenu |
|---|---|---|---|
| 1 — Facile | 6 | **Jouable** | Passages, murs, petits pièges (−1), trous, une porte ±2 à l'étage 3 |
| 2 — Intermédiaire | 8 | En test (`?pyramide=2`) | + gros pièges (jusqu'à −3), téléporteurs (+2) |
| 3 — Difficile | 10 | En test (`?pyramide=3`) | + pièges jusqu'à −5, téléporteurs +3/+4, téléporteurs piégés, portes ±3 |

### Caméra

La caméra est automatique : elle reste à l'extérieur de la pyramide et la contourne quand tu longes une terrasse. Trois niveaux de zoom sont proposés : **Proche**, **Moyen** et **Large**. En zoom large, toute la pyramide est visible.

![Vue large](docs/screenshots/vue-large.png)

---

## Commandes

### Ordinateur

| Action | Touche |
|---|---|
| Se déplacer | **ZQSD** (AZERTY) / **WASD** (QWERTY) / flèches |
| Sauter | **Espace** |
| Ouvrir une porte | **E** ou **Entrée** |
| Tourner la caméra | Glisser avec la souris |
| Zoom | Molette, **C** (changer de niveau), **+** / **−** |
| Pause | **Échap** ou **P** |

Les touches sont lues par leur **position physique**, si bien qu'AZERTY et QWERTY fonctionnent sans réglage.

### Smartphone (mode paysage conseillé)

| Action | Commande |
|---|---|
| Se déplacer | Joystick virtuel (moitié gauche de l'écran) |
| Sauter | Bouton **SAUT** |
| Ouvrir une porte | Bouton **AGIR** (il pulse quand une porte est à portée) |
| Tourner la caméra | Glisser le doigt sur la moitié droite |
| Zoom | Bouton **🔍** |

<img src="docs/screenshots/mobile.png" alt="Menu sur mobile" width="480" />

---

## Démarrage rapide

**Prérequis : Node.js 22 ou plus** (et npm).

```bash
git clone git@github.com:madourimohamed/pyrarush.git
cd pyrarush
npm install
npm run dev
```

Ouvre ensuite **http://localhost:5173**.

### Tester sur un téléphone

`npm run dev` expose aussi le jeu sur le réseau local. Depuis le téléphone, connecté au même Wi-Fi, ouvre l'adresse **Network** affichée dans le terminal (par exemple `http://192.168.1.20:5173`).

> **WSL2** : il faudra peut-être autoriser le port 5173 dans le pare-feu Windows, ou activer le mode réseau « mirrored » de WSL.

### Build de production

```bash
npm run build
npm run preview
```

Le dossier `dist/` est un site **100 % statique**. Il s'héberge gratuitement (GitHub Pages, Cloudflare Pages, Netlify…).

---

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement avec rechargement à chaud |
| `npm test` | Tests du moteur de règles (Vitest) |
| `npm run typecheck` | Vérification des types TypeScript |
| `npm run build` | Vérification des types, puis build de production dans `dist/` |
| `npm run preview` | Sert le build de production en local |

---

## Paramètres d'URL

| Paramètre | Effet | Exemple |
|---|---|---|
| `seed` | Rejoue exactement la même pyramide (la graine est affichée en fin de partie) | `?seed=4242` |
| `pyramide` | Déverrouille les pyramides avancées pour les tester | `?pyramide=3` |
| `indices` | Force le mode d'indice | `?indices=hotCold` (`scarab`, `hotCold`, `none`) |

En développement, `window.__session()` donne accès à la partie en cours depuis la console.

---

## Architecture

Le projet sépare strictement **les règles du jeu** et **leur affichage**. Ainsi, le même moteur pourra servir en V2 à un joueur humain, à un robot ou à un serveur multijoueur.

```
src/
├── core/                  ← TypeScript pur : aucune dépendance 3D ni DOM
│   ├── config/pyramids.ts   règles et équilibrage de chaque pyramide (données)
│   ├── mechanics/           un type de porte = un module
│   │   ├── mechanic.ts        interface Mechanic
│   │   ├── basic.ts           passage, mur (indices), petit piège
│   │   ├── advanced.ts        gros piège, téléporteurs, porte risquée
│   │   └── registry.ts        enregistrement des mécaniques
│   ├── layout.ts            génération déterministe par graine + garantie « terminable »
│   ├── geometry.ts          géométrie de la pyramide à degrés, boîtes de collision
│   ├── game.ts              état de la partie : actions → événements
│   ├── rng.ts               générateur pseudo-aléatoire (mulberry32)
│   └── core.test.ts         tests du moteur
└── client/                ← navigateur uniquement
    ├── main.ts              écrans, options, boucle de rendu
    ├── session.ts           relie moteur, physique, rendu et commandes
    ├── physics.ts           contrôleur de personnage (collisions boîtes alignées)
    ├── camera.ts            caméra automatique et zoom
    ├── render.ts            renderer Three.js + lueur (bloom)
    ├── input/input.ts       clavier, souris, joystick tactile
    ├── ui/hud.ts            interface en jeu
    └── scene/
        ├── world.ts           pyramide, portes, braseros
        ├── environment.ts     ciel, dunes, oasis, mesas, nuages
        ├── props.ts           scarabée, gant de boxe
        ├── character.ts       personnage
        ├── textures.ts        textures procédurales (canvas, aucun fichier image)
        └── fx.ts              animations et particules
```

### Flux d'une interaction

```
Joueur appuie sur E
  → session.ts trouve la porte la plus proche
  → game.interact(joueur, porte, temps, position)        (core, pur)
      → la mécanique de la porte calcule l'effet
      → le moteur borne l'effet selon la pyramide
      → renvoie des événements : doorResult, publicReveal, floorChanged, victory
  → session.ts joue les animations (gant, scarabée, passage…) et met à jour l'interface
```

Le moteur ne connaît ni Three.js ni le DOM, et le temps lui est toujours fourni. En V2, un serveur appellera exactement les mêmes méthodes, et un robot enverra les mêmes actions qu'un humain.

---

## Ajouter une mécanique ou une pyramide

### Une nouvelle porte (ex. un bouclier)

1. Créer l'objet dans `src/core/mechanics/` :

   ```ts
   export const myDoor: Mechanic = {
     id: 'myDoor',
     label: 'Ma porte',
     appearance: { color: 0x8a2be2, symbol: () => '★' }, // optionnel : porte reconnaissable
     oncePerPlayer: true,                                 // optionnel
     canPlace: (floor) => floor >= 2,                     // optionnel
     generateParams: (rng) => ({ amount: rng.int(1, 2) }), // fixé pour toute la partie
     resolve: ({ door }) => ({ delta: door.params.amount, fx: 'teleportUp', message: 'Bonus !' }),
   };
   ```

2. L'enregistrer dans `src/core/mechanics/registry.ts`.
3. L'activer dans une pyramide (`src/core/config/pyramids.ts`), par exemple `mechanics: { myDoor: [0, 1] }`.

### Une nouvelle pyramide

Tout se règle par la configuration, sans toucher au moteur :

```ts
{
  id: 'p4', name: 'Pyramide 4', difficulty: 'Expert',
  floors: 12,
  doorsPerSideAtTop: 2,
  maxFloorsLost: 5, maxFloorsGained: 4, protectedTopFloors: 2,
  publicRevealMs: 4000,
  hints: 'scarab',
  bands: [
    { floors: [1, 4], passages: 3, mechanics: { smallTrap: 4, teleportUp: [0, 1] }, holes: [1, 2] },
    // …
  ],
  limits: { teleportUp: 2 },
  settings: { teleportUp: { min: 3, max: 4 } },
}
```

La génération vérifie automatiquement que chaque étage possède au moins un passage : **une pyramide est toujours terminable**.

---

## Tests

```bash
npm test
```

Les tests du moteur (`src/core/core.test.ts`) vérifient notamment :

- que chaque pyramide est **toujours terminable** (sur 500 graines) ;
- qu'une même graine produit toujours la même pyramide ;
- les bornes de chute et de gain, la protection des derniers étages, l'usage unique des téléporteurs ;
- la porte ±2 de la pyramide 1 (étage 3 uniquement, mène au 5 ou au 1) ;
- que le scarabée part dans la bonne direction ;
- qu'un point d'arrivée ne tombe jamais dans un trou.

---

## Choix techniques

| Domaine | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript | Le même code pour le navigateur, les robots et le serveur |
| 3D | [Three.js](https://threejs.org) | Léger, très répandu, parfait pour le low-poly sur mobile |
| Build | [Vite](https://vite.dev) | Démarrage instantané, build statique |
| Physique | Contrôleur maison | Le monde n'est fait que de blocs alignés : plus léger qu'un moteur physique, et déterministe |
| Interface | HTML / CSS | Pas de framework : inutile pour un HUD |
| Police | [Fredoka](https://fonts.google.com/specimen/Fredoka) via Fontsource | Embarquée, fonctionne hors ligne |
| Tests | [Vitest](https://vitest.dev) | Rapide, intégré à Vite |
| Multijoueur (V2) | [Colyseus](https://colyseus.io) envisagé | Salons, codes d'invitation, synchronisation d'état |

Le rendu vise de bonnes performances sur smartphone : décor fusionné en peu d’objets, textures générées par le code, ombres en résolution réduite et sans anticrénelage sur mobile. La lueur peut être désactivée dans le menu (« Effets lumineux »).

---

## Feuille de route

- [x] **V1** : jeu solo, pyramide facile (6 étages), indices, pièges, porte ±2, chronomètre, victoire, mobile et ordinateur
- [ ] **V2.1** : robots (IA soumise aux mêmes règles que les humains, plusieurs niveaux)
- [ ] **V2.2** : multijoueur privé entre amis (salon, code d'invitation)
- [ ] **V2.3** : parties mêlant humains et robots
- [ ] **V3** : pyramides 2 et 3 ouvertes, nouvelles mécaniques (bouclier, passage temporaire, piège à retardement, indices par hiéroglyphes…), sons, personnalisation, classements

---

## Documentation de design

Le concept complet, les principes d'équilibrage et le **journal de toutes les décisions** se trouvent dans [GAME_DESIGN.md](GAME_DESIGN.md).
