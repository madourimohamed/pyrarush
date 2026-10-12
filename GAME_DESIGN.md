# Projet : PyraRush — Jeu multijoueur 3D sur navigateur

> Nom initial du cahier des charges : « Pyramid Rush ». Nom retenu : **PyraRush**.

> Document de référence du concept (cahier des charges initial).
> À relire avant toute évolution du jeu. Les décisions validées ultérieurement
> sont consignées dans la section « Journal des décisions » en fin de document.

## 1. Présentation du concept

Je souhaite développer un jeu vidéo multijoueur en 3D, accessible directement depuis un navigateur web, aussi bien sur smartphone que sur ordinateur.

Le concept est simple : plusieurs joueurs se retrouvent autour d'une pyramide composée de plusieurs étages. Tous commencent au premier étage et doivent atteindre le sommet avant les autres.

Pour monter, les joueurs doivent explorer les différentes cases présentes sur les faces de la pyramide afin de découvrir les passages secrets.

Certaines cases permettent de monter, d'autres sont des murs sans effet, et d'autres déclenchent des pièges qui font perdre un ou plusieurs étages.

Le jeu mélange :
- Exploration
- Mémoire
- Hasard
- Plateforme 3D
- Compétition multijoueur
- Observation et opportunisme

**Objectif principal : être le premier joueur à atteindre le sommet de la pyramide.**

Le jeu doit être facile à comprendre, amusant, rapide à prendre en main et visuellement très simple.

## 2. Structure des pyramides

Le jeu propose plusieurs pyramides avec des difficultés progressives.

| Pyramide | Nombre d'étages | Difficulté |
|---|---|---|
| Pyramide 1 | 5 | Facile |
| Pyramide 2 | 8 | Moyenne |
| Pyramide 3 | 10 | Difficile |

Chaque pyramide est construite à partir de blocs géométriques simples.

Chaque étage est composé de plusieurs cases de dimensions équivalentes.

Les joueurs commencent au premier étage et progressent vers le sommet.

Les étages supérieurs peuvent devenir progressivement plus difficiles, avec davantage de pièges et d'obstacles.

La pyramide doit être visible en 3D, avec une caméra permettant de suivre le personnage.

## 3. Fonctionnement des cases

Les joueurs doivent se déplacer physiquement jusqu'à une case et interagir avec elle pour découvrir son effet.

Il existe quatre types de cases :

### A. Bonne case — Passage supérieur

- Le joueur interagit avec la bonne case.
- Un passage lui permet d'accéder à l'étage supérieur.
- La case s'illumine temporairement.
- Tous les autres joueurs peuvent voir cette indication.
- Après quelques secondes, l'indication disparaît.

Cette mécanique permet aux joueurs situés derrière de profiter des découvertes des autres.

### B. Mur

- Le joueur interagit avec la case.
- Rien ne se passe.
- Le joueur doit chercher un autre passage.

### C. Petit piège

- Le joueur déclenche un piège.
- Il est envoyé à l'étage inférieur.
- Une animation simple illustre la chute.

### D. Gros piège

- Un mécanisme peut surgir de la case et repousser le joueur.
- Le joueur peut perdre plusieurs étages.
- Le piège doit être visuellement compréhensible, avec une animation courte et amusante.

## 4. Génération et mémoire des cases

**Règle fondamentale : les cases restent fixes pendant toute la partie.**

Au début de chaque partie, le jeu génère une disposition de bonnes cases, de murs et de pièges.

Une fois la partie commencée :
- La disposition ne change plus.
- Une case qui permet de monter continuera de le permettre.
- Les pièges restent aux mêmes emplacements.
- Les joueurs peuvent mémoriser les passages.

Une nouvelle partie peut générer une nouvelle disposition.

Le serveur doit conserver la disposition réelle des cases et vérifier les interactions afin d'éviter la triche.

## 5. Mécanique d'entraide indirecte

Lorsqu'un joueur découvre une bonne case :

1. Il monte à l'étage supérieur.
2. La bonne case devient visuellement identifiable.
3. Cette indication est visible par tous les joueurs pendant quelques secondes.
4. Les autres joueurs peuvent profiter de cette information.
5. L'indication disparaît automatiquement.

Cela crée une compétition intéressante : un joueur peut découvrir un passage, mais ses concurrents peuvent immédiatement l'utiliser.

La durée exacte de visibilité sera ajustée pendant les tests.

## 6. Système d'indices privés après une chute

C'est une mécanique essentielle du jeu.

Lorsqu'un joueur atteint un étage supérieur, puis tombe à un étage inférieur, il ne doit pas être obligé de recommencer toute son exploration.

Exemple :

- Le joueur atteint l'étage 6.
- Il déclenche un piège.
- Il retombe à l'étage 2.
- Les bonnes cases des étages déjà franchis lui sont indiquées visuellement.
- Ces indications sont privées : lui seul peut les voir.
- Il peut retrouver plus rapidement son chemin jusqu'à son précédent niveau.

**Principe : une chute fait perdre de la progression physique, mais pas les connaissances acquises.**

Les autres joueurs ne voient pas les indices privés.

Les indications ne doivent révéler que les passages que le joueur a effectivement découverts ou empruntés.

## 7. Déplacement des personnages

Le jeu utilise de petits personnages 3D très simples.

Les joueurs contrôlent directement leur personnage.

Actions nécessaires :

- Avancer
- Reculer
- Aller à gauche
- Aller à droite
- Sauter
- Interagir avec une case
- Orienter la caméra

Les joueurs doivent pouvoir se déplacer sur les plateformes de la pyramide.

Certains espaces peuvent contenir des trous qu'il faut franchir en sautant.

Une chute accidentelle peut entraîner une perte d'étage.

Le déplacement doit être fluide, simple et adapté aux écrans tactiles.

## 8. Commandes sur mobile

Le jeu doit fonctionner sur navigateur mobile, sans installation.

Interface proposée :

**À gauche de l'écran :**
- Joystick virtuel pour les déplacements.

**À droite de l'écran :**
- Bouton SAUT.
- Bouton INTERAGIR.

**Caméra :**
- Glissement du doigt sur une zone libre pour orienter la caméra.

Les boutons doivent être suffisamment grands et espacés pour être confortables sur smartphone.

Le mode paysage peut être privilégié si cela améliore la visibilité et la maniabilité.

## 9. Commandes sur ordinateur

Proposition :

| Action | Commande |
|---|---|
| Avancer | Z / W |
| Reculer | S |
| Gauche | Q / A |
| Droite | D |
| Sauter | Espace |
| Interagir | E |
| Caméra | Souris |

Les commandes pourront être adaptées en fonction du moteur retenu.

## 10. Multijoueur

Plusieurs joueurs participent simultanément à une même partie.

Tous voient les déplacements des autres personnages en temps réel.

Le serveur gère :
- La création des parties.
- L'arrivée des joueurs.
- Leurs positions et leurs étages.
- La disposition des cases.
- Les interactions avec les cases.
- Les pièges.
- Les indications publiques temporaires.
- Les indications privées.
- La victoire.

Le nombre maximal de joueurs par partie reste à déterminer en fonction des performances et des tests de gameplay.

L'objectif est de créer une expérience compétitive, avec des situations amusantes lorsque plusieurs joueurs découvrent ou suivent le même passage.

## 11. Victoire

Le premier joueur à atteindre le sommet remporte la partie.

Une animation simple célèbre sa victoire.

Un écran de résultat peut afficher :
- Le gagnant.
- Le classement.
- Le temps de la partie.
- Le nombre de chutes.
- Le nombre de cases testées.

Le comportement des autres joueurs après la première victoire reste à définir : fin immédiate ou possibilité de terminer la course.

## 12. Direction artistique

**Je veux des graphismes 3D minimalistes, pas un jeu réaliste.**

Références visuelles :
- Low-poly.
- Blocs géométriques simples.
- Personnages stylisés et colorés.
- Couleurs agréables.
- Ombres légères.
- Animations courtes.
- Interface épurée.

La pyramide doit ressembler à une construction simple en cubes ou en blocs de pierre.

Pas besoin de textures détaillées, de monuments complexes, de décors égyptiens chargés ou d'effets visuels spectaculaires.

Les personnages peuvent être constitués de formes géométriques élémentaires.

Priorités :
1. Lisibilité des cases.
2. Fluidité des déplacements.
3. Visibilité des autres joueurs.
4. Compréhension immédiate des pièges.
5. Bonnes performances sur smartphone.

## 13. Plateformes cibles

Priorité au navigateur web.

Le jeu doit fonctionner sur :
- Chrome Android.
- Safari iPhone.
- Navigateurs desktop modernes.

Il doit être responsive et utilisable sur écran tactile.

Une application mobile native pourra éventuellement être envisagée plus tard, mais elle ne fait pas partie des exigences initiales.

## 14. Liberté technique

Tu as **carte blanche sur les choix techniques**.

Choisis librement :
- Le moteur ou framework 3D.
- Le langage.
- Le framework frontend.
- Le backend.
- La technologie multijoueur.
- La gestion des collisions et de la physique.
- La structure du projet.
- Les bibliothèques nécessaires.

Je privilégie une solution :
- Simple à développer.
- Facile à maintenir.
- Performante sur mobile.
- Peu coûteuse à héberger.
- Adaptée au multijoueur temps réel.
- Facile à faire évoluer.

Ne choisis pas une architecture complexe si une solution plus légère suffit.

## 15. Première version à développer (MVP)

Je souhaite commencer par un prototype jouable, plutôt que développer immédiatement toutes les fonctionnalités.

### MVP — Première étape

- Une pyramide 3D de 5 étages.
- Un personnage contrôlable.
- Une caméra 3D.
- Les déplacements.
- Le saut.
- Les collisions.
- Les trous.
- Les cases interactives.
- Les quatre types de résultats.
- La progression entre les étages.
- Les chutes.
- La mémorisation des bonnes cases.
- Les indices privés après une chute.
- Un écran de victoire.

### Deuxième étape — Multijoueur

- Plusieurs joueurs simultanés.
- Synchronisation des positions.
- Interactions validées côté serveur.
- Cases découvertes temporairement visibles par tous.
- Indices privés par joueur.
- Détection du gagnant.
- Classement.

### Troisième étape — Enrichissement

- Pyramides de 8 et 10 étages.
- Difficultés progressives.
- Amélioration des animations.
- Sons.
- Personnalisation des personnages.
- Interface d'accueil et sélection des pyramides.

## 16. Points encore ouverts

Certaines décisions doivent être proposées, mais pas considérées comme des règles déjà validées :

- Nombre de joueurs par partie.
- Nombre de cases par étage.
- Possibilité de faire le tour complet de la pyramide.
- Nombre de passages corrects par étage.
- Durée d'affichage public d'une bonne case.
- Comportement des joueurs après la première victoire.
- Durée maximale d'une partie.
- Gestion des joueurs inactifs.
- Positionnement et comportement exacts de la caméra.
- Répartition des trous et des pièges.

Propose des solutions simples et cohérentes pour ces points, en expliquant tes choix.

## 17. Ce que j'attends de toi

Je veux que tu agisses comme un développeur de jeux vidéo expérimenté, capable de prendre des décisions techniques et de gameplay.

Commence par :

1. Analyser la faisabilité du jeu sur navigateur mobile.
2. Choisir la stack technique la plus appropriée et justifier brièvement ce choix.
3. Définir une architecture simple.
4. Proposer une première version jouable avec des graphismes 3D minimalistes.
5. Implémenter progressivement le prototype.

**Priorité absolue : obtenir rapidement une véritable expérience jouable, fluide et amusante, et non une simple maquette visuelle.**

Évite le surdéveloppement, les systèmes inutiles et les graphismes trop sophistiqués.

Le cœur du jeu doit rester : **monter, explorer, découvrir, tomber, mémoriser et recommencer jusqu'à atteindre le sommet avant les autres.**

## 18. Modes de jeu et évolution du projet

Le jeu doit évoluer progressivement. Il ne faut surtout pas chercher à développer toutes les fonctionnalités dès le départ.

### V1 — Mode solo (priorité absolue)

La première version doit être un jeu entièrement jouable par un seul joueur humain, sans adversaire et sans connexion à un serveur multijoueur.

Fonctionnalités :

- Une pyramide 3D de 5 étages.
- Un personnage contrôlable.
- Déplacements, saut et interaction avec les cases.
- Pièges, murs et passages vers les étages supérieurs.
- Mémorisation des passages découverts.
- Indices privés après une chute.
- Chronomètre pour mesurer le temps nécessaire pour atteindre le sommet.
- Écran de victoire.
- Possibilité de recommencer avec une nouvelle disposition aléatoire des cases.

Objectif : valider le plaisir de jeu, les commandes et les mécaniques avant d'investir dans le multijoueur.

La V1 doit fonctionner intégralement dans le navigateur, sur mobile et sur ordinateur.

### V2 — Modes solo avec robots et multijoueur

La deuxième version introduira plusieurs modes.

#### Mode A — Solo avec robots (IA)

Le joueur humain affronte des personnages contrôlés par l'ordinateur.

Les robots doivent :

- Explorer les étages.
- Choisir des cases.
- Découvrir les passages.
- Déclencher des pièges.
- Tomber et remonter.
- Mémoriser les passages découverts.
- Profiter des passages révélés par d'autres joueurs.

Plusieurs niveaux de difficulté pourront être proposés en ajustant leur vitesse de déplacement, leur mémoire et leur comportement d'exploration.

Les robots doivent respecter les mêmes règles que les joueurs humains. Ils ne doivent pas connaître automatiquement les bonnes cases.

#### Mode B — Multijoueur entre amis

Les joueurs peuvent créer une partie privée et inviter leurs amis à l'aide d'un code ou d'un lien.

Fonctionnalités :

- Création d'un salon.
- Invitation des amis.
- Choix de la pyramide.
- Affichage des participants.
- Lancement de la partie.
- Synchronisation des joueurs en temps réel.
- Classement final.

#### Mode C — Multijoueur avec robots

Le créateur d'une partie peut ajouter des robots pour compléter les places disponibles.

Exemple : une partie de 10 participants peut comprendre 4 joueurs humains et 6 robots.

Les robots et les humains participent à la même course et interagissent avec les mêmes cases.

### Préparation technique dès la V1

Même si la première version est exclusivement solo, l'architecture doit permettre d'ajouter ultérieurement les robots et le multijoueur.

Il faut notamment séparer :

- La logique des règles du jeu.
- La représentation graphique 3D.
- Le contrôle du personnage.
- La gestion des cases et des pièges.
- La gestion de l'état d'une partie.

La logique de jeu doit pouvoir être réutilisée en V2 par un joueur humain, un robot ou un serveur multijoueur.

**Important : ne pas développer de serveur multijoueur, de système de salons ou d'IA de robots dans la V1. Il faut uniquement éviter les choix techniques qui rendraient leur ajout difficile.**

### Ordre de développement recommandé

1. V1 : jeu solo, un personnage, une pyramide de 5 étages.
2. V2.1 : ajout des robots et du mode course solo contre l'ordinateur.
3. V2.2 : multijoueur privé entre amis.
4. V2.3 : possibilité de mélanger humains et robots.
5. V3 éventuelle : matchmaking public, classements, personnalisation et autres pyramides.

L'objectif reste de construire un jeu simple, amusant et performant, en validant chaque étape avant de passer à la suivante.

## 19. Progression par niveaux et catalogue de mécaniques

### Vocabulaire

- **Niveau** : une pyramide complète (Niveau 1, Niveau 2…). On débloque le niveau suivant en terminant le précédent.
- **Étage** : une terrasse de la pyramide. On « monte d'un étage » ou on « tombe de N étages ».

### Principe

Chaque niveau **reprend les mécaniques des niveaux précédents et en ajoute une ou deux nouvelles**. Le jeu ne se limite pas à 3 ou 4 règles : il apprend progressivement au joueur un vocabulaire de plus en plus riche (comme les mondes d'un Mario).

Chaque niveau est **une configuration de données** (nombre d'étages, portes par face, répartition des pièges, chute maximale, mécaniques activées). Chaque mécanique est **un module indépendant** branché sur le moteur de règles. Ajouter une règle revient à ajouter un module et à l'activer dans un niveau, sans réécrire le cœur du jeu.

### Pyramides validées

| Pyramide | Étages | Perte max par piège | Mécaniques | Objectif |
|---|---|---|---|---|
| 1 — Facile | 6 | **1 étage** (pièges) | Bonnes portes, murs, petits pièges, quelques trous, une porte risquée ±2 à l'étage 3 | Apprendre les commandes, explorer, comprendre le jeu. Aucun piège excessivement punitif. |
| 2 — Intermédiaire | 8 | **3 étages** | + gros pièges, + **téléporteurs ascendants** (plusieurs étages) | Davantage de surprises et de risques. |
| 3 — Difficile | 10 | **5 étages** | + téléporteurs +3/+4 (surtout sur les étages bas), combinaison de pièges et de bonus, portes à double effet | Davantage de retournements de situation. |

### Catalogue extensible de mécaniques (idées à explorer, pas toutes à implémenter)

| Mécanique | Effet | Visible avant usage ? |
|---|---|---|
| Passage classique | +1 étage | Non |
| Mur | Rien, indice chaud/froid optionnel | Non |
| Petit piège | −1 étage | Non |
| Gros piège | −N étages selon la pyramide et l'étage | Non |
| Téléporteur ascendant | +N étages (rattrapage, rare) | Non |
| Téléporteur descendant | Renvoie vers un étage inférieur | Non |
| Porte risquée (double effet) | +3 **ou** −3, résultat fixé pour la partie | **Oui** : c'est un pari assumé |
| Case surprise | Événement aléatoire | À définir |
| Bouclier | Protège temporairement contre une chute | À définir |
| Passage temporaire | Raccourci ouvert quelques secondes | À définir |
| Piège à retardement | Effet déclenché après un court délai | À définir |

### Principes d'équilibrage

1. Les premières pyramides sont faciles à comprendre.
2. Les pyramides avancées introduisent progressivement de nouvelles mécaniques.
3. Un joueur en retard peut revenir grâce à des bonus ou des téléporteurs, mais ceux-ci restent **rares** pour ne pas rendre l'exploration inutile.
4. Le joueur en tête n'est pas systématiquement pénalisé.
5. Les pièges restent surprenants sans devenir injustes.
6. Chaque pyramide possède sa propre configuration de règles, facilement modifiable.
7. **Règle d'or : le joueur doit toujours sentir que ses décisions comptent davantage que la chance.** Concrètement :
   - les paris (porte risquée) sont **visibles** avant d'être pris : c'est un choix, pas une punition cachée ;
   - le résultat de chaque case est **fixé pour la partie** : ce qu'on apprend (soi-même ou en observant les autres) reste vrai ;
   - les murs peuvent donner un indice chaud/froid, ce qui transforme l'essai au hasard en déduction.

### Configuration d'une pyramide

Chaque pyramide est un objet de configuration (pas de conditions codées en dur) qui définit :
- son nombre d'étages ;
- les mécaniques autorisées et leur nombre par étage (par tranches d'étages) ;
- le nombre maximal d'étages perdus et gagnés ;
- les règles spécifiques selon l'étage (nombre de passages, trous, pièges) ;
- l'activation de l'indice chaud/froid.

La génération garantit qu'une pyramide est **toujours terminable** (au moins un passage par étage, vérifié automatiquement par des tests).

### Niveaux suivants (proposés, à tester)

| Niveau | Étages | Chute max | Nouveautés proposées |
|---|---|---|---|
| 4 | 12 | 5 | **Rochers roulants** qui dévalent la pyramide (à esquiver en sautant) ; **paliers de sécurité** (étages sous lesquels on ne peut plus retomber). |
| 5 | 12 | 6 | **Levier** : les portes d'un étage restent fermées tant que quelqu'un n'a pas actionné le levier caché sur la terrasse ; **dalles fragiles** qui s'effondrent après passage. |
| 6 | 15 | 7 | **Brouillard** (pas d'indice chaud/froid sur certains étages) ; **amulette** à ramasser qui annule le prochain piège ; **porte-mirage** qui s'illumine publiquement comme une bonne porte mais qui est un piège. |

### Règles détaillées des mécaniques

- **Force des pièges** : chaque piège a une force fixe, déterminée à la génération (la disposition ne change pas pendant la partie). La force augmente avec la hauteur de l'étage, plafonnée par la chute max du niveau. On ne descend jamais sous l'étage 1, ni sous un palier de sécurité atteint.
- **Téléporteur** :
  - placé uniquement dans la moitié basse de la pyramide ;
  - effet : +3 ou +4 étages (valeur fixe par téléporteur) ;
  - ne peut jamais déposer le joueur sur le dernier étage, ni sur l'avant-dernier : le sommet se mérite ;
  - **utilisable une seule fois par joueur et par partie** (après usage, il se comporte comme un mur pour ce joueur) ;
  - comme une bonne porte, il s'illumine publiquement quelques secondes lorsqu'il est découvert.
  - Rôle : mécanique de rattrapage pour un joueur tombé très bas.
- **Mécaniques réservées au multijoueur (V2, idées)** : échange de place avec un adversaire, bousculade, levier qui ouvre les portes pour tout le monde.

### Rejouabilité

- 1 à 3 étoiles par niveau selon le temps réalisé.
- Graine (seed) affichée en fin de partie pour rejouer exactement la même pyramide.

---

## Journal des décisions

_Les décisions de design et techniques validées seront ajoutées ici (date + décision + raison)._

- **2026-10-11** — Progression en niveaux : Niveau 1 = 5 étages (chute max 1), Niveau 2 = 8 étages (chute max 3), Niveau 3 = 10 étages (chute max 5 + téléporteur +3/+4 sur les étages bas). Chaque niveau ajoute de nouvelles mécaniques pour enrichir le jeu au-delà de quelques règles. _Raison : apprendre progressivement les règles et garder le jeu frais._
- **2026-10-11** — Architecture « données + modules » : un niveau est une configuration, une mécanique est un module de règles indépendant. _Raison : pouvoir ajouter des règles sans toucher au cœur du moteur._
- **2026-10-11** — Distinction des termes « niveau » (pyramide) et « étage » (terrasse).
- **2026-10-11** — Pyramide 2 : les téléporteurs ascendants apparaissent dès la pyramide 2 (+2), la pyramide 3 les porte à +3/+4. Les portes à double effet (+3/−3) sont réservées aux pyramides avancées.
- **2026-10-11** — Validé : pyramide à degrés avec terrasses en anneau, et caméra automatique (sous réserve d'un bon ressenti sur mobile).
- **2026-10-11** — Indice chaud/froid : à expérimenter, activable/désactivable facilement (menu + configuration de la pyramide) pour comparer.
- **2026-10-11** — Règle d'or : les décisions du joueur doivent compter plus que la chance.
- **2026-10-11** — V1 : seule la pyramide 1 (5 étages) est jouable. Le moteur et les configurations des pyramides 2 et 3 existent pour valider l'architecture (accessibles en test via `?pyramide=2` ou `?pyramide=3`).
- **2026-10-11** — Réglages initiaux de la pyramide 1 (à ajuster en jouant, dans `src/core/config/pyramids.ts`) : 24, 20, 16, 12 puis 8 portes par étage ; 3 passages à l'étage 1 puis 2 par étage ; 2 à 3 petits pièges par étage ; aucun trou à l'étage 1, puis 1 à 2 trous par terrasse ; révélation publique de 4 s ; un trou ne se trouve jamais devant une porte.
- **2026-10-11** — Indices privés : les passages connus restent dorés (avec un losange flottant) sur les étages que le joueur doit encore franchir ou refranchir.
- **2026-10-11** — Stack V1 : TypeScript + Vite + Three.js, interface en HTML/CSS. **Pas de moteur physique** : le monde est entièrement fait de blocs alignés sur les axes, et un contrôleur de collision maison (boîtes alignées) suffit. Il est plus léger que Rapier, déterministe et réutilisable par les robots et le serveur. _Raison : simplicité et performances mobiles._
- **2026-10-11** — Nom du jeu : **PyraRush**.
- **2026-10-11** — Retour du premier test (web) : jeu « pas mal du tout », pyramide 1 terminée en moins de 2 minutes avec chaud/froid → trop court. Ajustement : 2 passages à l'étage 1, et un seul passage aux étages 4 et 5.
- **2026-10-11** — Indices : système configurable par pyramide (`hints`). Nouveau mode par défaut **scarabée** : un mur libère un scarabée doré qui détale vers le passage le plus proche (direction, pas la porte exacte) et s'agite s'il est à 2 portes ou moins. Chaud/froid et « aucun » restent sélectionnables dans le menu (`?indices=scarab|hotCold|none`). Idée pour les pyramides avancées : indices par hiéroglyphes (déduction).
- **2026-10-11** — Pièges : un **gant de boxe** jaillit de la porte (« POW ! ») et projette le joueur à l'étage inférieur. À l'étage 1, il repousse le joueur en arrière (perte de temps), pour que le piège ait toujours un effet visible.
- **2026-10-11** — Pyramide 1 : **porte risquée ±2**, dorée et marquée « ±2 », une aux étages 2 et 3 : +2 ou −2 étages, résultat fixé pour la partie, un seul essai par joueur. À l'étage 2, la perte est limitée à 1 étage (on ne descend jamais sous l'étage 1). Les pièges restent à −1 ; seule la porte risquée, visible et choisie, va jusqu'à ±2.
- **2026-10-11** — Direction artistique : « fin d'après-midi dorée » stylisée. Ciel en dégradé avec soleil, nuages, mesas, dunes basses-poly, oasis et palmiers, pierres taillées texturées (textures procédurales), liserés dorés sur les bords de terrasse, portes turquoise à hiéroglyphes lumineux, braseros, poussière dorée, lueur (bloom, désactivable dans le menu), écran d'accueil avec caméra en orbite, interface en verre dépoli (police Fredoka).
- **2026-10-11** — Pyramide 1 passe à **6 étages** (28, 24, 20, 16, 12, 8 portes). La porte risquée ±2 est placée **uniquement à l'étage 3** : +2 mène à l'étage 5 (jamais au dernier étage directement), −2 ramène à l'étage 1. Un bonus ne peut jamais déposer le joueur sur le dernier étage (`protectedTopFloors: 1`). Passages : 2 par étage jusqu'au 4, puis 1 aux étages 5 et 6.
- **2026-10-11** — Bouton **« Comment jouer ? »** (menu et pause) qui ouvre un écran de règles ; le menu ne contient plus que les choix et « Jouer ».
- **2026-10-11** — **Zoom au choix** : Proche (le personnage), Moyen, Large (toute la pyramide visible). Réglable dans le menu, avec le bouton 🔍 en jeu, la molette ou la touche C ; choix mémorisé. De loin, une flèche flotte au-dessus du personnage pour le repérer.
- **2026-10-11** — **Niveaux numérotés et nommés** à la place de Facile / Intermédiaire / Difficile. Chaque niveau se débloque en terminant le précédent (progression sauvegardée), possède son nom, son thème graphique complet (ciel, lumière, sol, montagnes, pierres, portes, particules, végétation, couleurs de l'interface) et apporte une nouveauté. 6 niveaux : 1 Le Temple des Sables (6 étages, bases + porte ±2), 2 L'Oasis Émeraude (6, gant géant −2), 3 Le Crépuscule Pourpre (8, téléporteurs +2), 4 La Pyramide de Glace (8, téléporteurs piégés, porte ±3), 5 Le Sanctuaire de Lave (10, jusqu'à −4), 6 La Cité Céleste (10, −5 / +4 / ±3). La porte risquée n'est jamais placée là où un pari gagné déposerait sur un étage protégé.
- **2026-10-11** — **Architecture socle + niveaux** : `src/core` (socle : moteur, mécaniques, génération, forme des niveaux et des thèmes), `src/levels` (un fichier de données par niveau : règles + thème + musique), `src/client` (affichage générique). Ajouter un niveau = un fichier + une ligne ; aucune duplication (valeurs par défaut, thème de base surchargé, briques de règles partagées) ; une seule pyramide en mémoire à la fois.
- **2026-10-11** — **Musique et effets sonores** générés en Web Audio (aucun fichier) : une musique par thème (gamme, tempo, instrument, rythme), effets cartoon (ressort et « POW » du gant, sifflet de chute, trombone triste au pari perdu, jackpot au pari gagné, grésillement du scarabée, fanfare de victoire). Musique et sons réglables séparément ; bouton 🔊 en jeu.
- **2026-10-11** — **Refonte graphique d'après les maquettes** (`design/`) : explorateur encapuchonné (capuche blanche, visage sombre aux yeux lumineux, écharpe bleue, cape), portes sombres à hiéroglyphes, bannières entre les portes, jarres, lianes (oasis), pyramides lointaines et obélisques (désert), cascades et douves (oasis), porte mystère au symbole cyan. Accueil « Campagne · Choisis ta pyramide » avec miniatures 3D des niveaux, badges (Nouveau, couronne, cadenas), durée estimée, fiche du niveau et bouton Jouer, boutons Réglages / Records / Profil (nom du joueur). Interface en jeu : pastille du niveau, chrono, étage, messages en cartes à icône. Non repris (fonctionnalités hors périmètre) : achat « Débloque toutes les pyramides », classements en ligne, jeu entre amis (V2).
- **2026-10-11** — **Architecture pour ~100 niveaux et thèmes** : niveaux découverts automatiquement (`src/levels/NNN-nom.ts`), familles de thèmes partagées et `defineTheme(surcharges, base)` avec fusion sur un niveau de profondeur, miniatures limitées aux niveaux débloqués et mises en cache par empreinte, décor instancié. Tests de numérotation et de validité de chaque niveau.
- **2026-10-11** — Constat partagé : les maquettes de `design/` ont un niveau de détail de jeu console. **Stratégie graphique hybride** retenue : (1) bible graphique web et modèles libres CC0 maintenant, (2) objets égyptiens générés par IA puis retouchés dans Blender, (3) graphiste freelance quand le jeu est validé. Direction précisée ensuite par le porteur du projet (entrée suivante).
- **2026-10-11** — Décor **par composants** : un thème = palette + liste de composants (`props` pour tout modèle GLB, `doorFrames`, `banners`, `braziers`, `statues`, `moat`…), sur des emplacements génériques qui respectent le jeu. Premiers modèles libres : Kenney Nature Kit (CC0). Portes instanciées (quelques appels de dessin au lieu de plus de mille).
- **2026-10-11** — **Niveau 1 en temple compact** : 4 portes par face en bas, 2 en haut (16, 16, 12, 12, 8, 8 portes), réparties sur toute la paroi ; trous toujours entre les portes de deux parois successives ; arrivée toujours devant une porte. Caméra de jeu en vue de trois-quarts, plus proche (comme sur les maquettes).
- **2026-10-11** — **Bible graphique réécrite** ([ART_DIRECTION.md](ART_DIRECTION.md)) selon les exigences du porteur du projet : ambition **« stylized 3D premium »** (pas de réduction d'ambition à cause du web), qualité des assets avant gratuité, **budgets de performance globaux et mesurables** par profil desktop / mobile (pas de limite arbitraire par objet), **gameplay intouchable** (zones interdites au décor, maquettes = références artistiques, pas plans géométriques), **identité propre à chaque univers** (matériaux, modèles, lumières, effets, décor), système de thèmes extensible (matériaux, kit d'architecture, lumière et effets par thème à ajouter), sobriété et lisibilité. Univers évoqués : désert, oasis, crépuscule, glace, **football**, **espace**, **jungle** (liste et ordre définitifs à arrêter ; lave et céleste existent déjà dans le code).
- **2026-10-11** — Plan d'amélioration progressif du niveau 1 en 8 étapes (mesurer, lumière, matériaux, feu et eau, variété architecturale, composition, assets externes, accueil), chacune livrée avec captures avant/après et mesures. Aucune refonte massive avant validation.
- **2026-10-11** — Bible graphique validée avec ajustements : budgets = objectifs initiaux à mesurer sur de vrais appareils (temps GPU réel, outils des navigateurs, endurance) ; **pipeline de production des assets reproductible** en 6 étapes (référence → création/génération → nettoyage Blender → optimisation → export GLB → intégration et contrôle qualité) ; critères explicites de recours à un vrai asset 3D ; **nombre d'étages croissant** d'un niveau à l'autre et **pas de thèmes redondants** ; lisibilité des portes, du personnage et des terrasses toujours prioritaire.
- **2026-10-11** — **Enrichissement du gameplay : cinq fonctionnalités**, réalisées une par une (qualité plutôt que quantité ; pas de multijoueur, classement, compétences ni combat pour l'instant) :
  1. **Portes lisibles et indices à déduction** : trace privée des portes essayées (mur scellé, piège fissuré), scarabée qui indique direction **et distance**, réactions du personnage.
  2. **Trois étoiles** (terminer ; temps cible ; peu de chutes), meilleur temps, écran de victoire repensé avec **aperçu du prochain univers**, étoiles dans le menu. Une étoile suffit pour débloquer la suite.
  3. **Coffres au sommet** : trois coffres, un seul choix, un **bonus en réserve** (un emplacement) utilisable une fois dans une partie suivante : Œil de Râ (montre un passage de l'étage 5 s), Bouclier d'Anubis (annule la prochaine chute), Sablier de Thot (−10 s). Jamais indispensables.
  4. **Deux pièges bien réalisés** : **dalles fragiles** (avertissement puis effondrement, esquivables : adresse) et **gardien qui surgit** (momie, variante visuelle du piège).
  5. **Sensation d'ascension** : bannière à chaque nouvel étage, musique qui s'enrichit avec la hauteur, lumière qui se réchauffe vers le sommet.
  Écartés ou reportés : checkpoints (à étudier pour les pyramides de 8 étages et plus), changements de décor en cours de partie. Avant tout : fusion des blocs de la pyramide (gain de performance sans changement visuel).

- **2026-10-11** — Fonctionnalité 3 réalisée : à chaque victoire, **écran « Trésor du sommet »** avant le bilan (trois coffres mélangés, on en ouvre un, les deux autres se dévoilent). Le bonus gagné **remplace** celui en réserve (un seul emplacement, sauvegardé). En jeu : bouton doré (touche **B** sur ordinateur), inutilisable pendant l'introduction, une animation ou la pause. Règles dans le moteur (`Game.useBonus`, événements `bonusUsed`, `privateReveal`, `shielded`) pour rester valables en multijoueur : l'Œil de Râ désigne de préférence un passage encore inconnu, le Bouclier absorbe un piège (on reste à l'étage) ou une chute dans un trou (on est remonté devant la porte la plus proche), le Sablier retire 10 s au chronomètre. Une chute annulée ne compte pas pour les étoiles.
- **2026-10-11** — Les commits sont désormais poussés sur le dépôt distant au fur et à mesure (accord du porteur du projet).
- **2026-10-11** — Fonctionnalité 4, premier piège : **dalles fragiles**. Elles occupent les emplacements de trou (jamais devant une porte, déjà évités par le décor), recouvertes d'une dalle fissurée bien visible. Au premier pas, la dalle tremble et craque, puis s'effondre 0,25 s plus tard (trop court pour la traverser en courant : il faut la **sauter**, c'est de l'adresse, pas de la chance) ; elle se reforme 4 s après, jamais sur le joueur. La chute passe par la règle habituelle (`reportFloor`), donc le Bouclier d'Anubis l'annule. Introduction douce : niveau 1 à partir de l'étage 4 (une par étage), puis davantage dans les niveaux suivants (`band(..., trous, dalles)`). Les dispositions des niveaux sans dalles restent identiques pour une même graine.
- **2026-10-11** — Fonctionnalité 4, second piège : **gardien momie**. Les pièges ont désormais des « gardiens » interchangeables (`client/scene/guardians.ts`) : le gant de boxe (« POW ! ») et la momie qui sort de la porte bras tendus (« BOUH ! », grognement). Le thème liste ses gardiens (`trapStyles`, par défaut gant + momie) ; chaque porte piégée en reçoit un, toujours le même pour la partie. Les règles ne changent pas (même recul d'étages), seule la mise en scène varie : un futur univers (football, espace) pourra avoir ses propres gardiens.
- **2026-10-11** — Fonctionnalité 5 réalisée : **sensation d'ascension**. À chaque étage atteint pour la première fois dans la partie : bannière centrale (« Étage 4 · 3 étages avant le sommet », « Dernier étage ! »), accord montant, courte vibration et gerbe dorée à l'arrivée. La musique s'enrichit avec la hauteur (charleston en croches au premier tiers, mélodie doublée à l'octave et basse plus active aux deux tiers) et le soleil se réchauffe et s'intensifie en douceur vers le sommet. Les cinq fonctionnalités de l'enrichissement du gameplay sont terminées.
- **2026-10-11** — **V1 validée, début de la V2 par le duel entre amis** (mode B, à deux joueurs). Un joueur crée une salle depuis la fiche d'un niveau (« Défier un ami ») et obtient un **code de 4 caractères** (sans caractères ambigus) et un **lien direct** (`?salle=CODE`, copier ou partager). Dès que l'ami arrive : **compte à rebours de 5 s** (l'introduction de la caméra sert de décompte, impossible à passer), même pyramide pour les deux (graine commune). Architecture : **un petit serveur Node** (`server/`) sert le jeu et les WebSockets sur le même port ; chaque navigateur fait tourner le moteur pour son joueur (réponse immédiate) et envoie ses actions ; le serveur les rejoue sur sa propre partie (même moteur, mêmes contrôles de distance) et **fait foi pour la victoire**. L'adversaire est affiché en temps réel (écharpe rouge, nom au-dessus de la tête, repère sur l'échelle des étages) ; ses passages découverts brillent aussi pour l'autre (entraide indirecte, § 5) ; les indices et portes essayées restent privés. Premier au sommet = vainqueur, la course s'arrête pour les deux ; départ en cours de course = victoire par forfait ; **revanche** quand les deux la demandent (nouvelle pyramide). En duel : pas de coffres, d'étoiles ni de records ; la pause ne fige pas la course. **Bonus des coffres en duel : autorisés à partir du niveau 2** (Œil de Râ et Bouclier ; le Sablier, sans chronomètre à battre, ne sert pas), règle vérifiée aussi par le serveur. Hébergement : pour l'instant le PC derrière le tunnel Cloudflare temporaire ; hébergement permanent à choisir plus tard.
- **2026-10-12** — **Duel combatif** (retour du premier test : « pas mal, mais manque de combativité »). Nouvelle porte, la **porte à pouvoir**, identique aux autres avant ouverture (environ 2 par étage en duel, à la place de murs, uniquement en duel ; chaque joueur peut ouvrir chaque porte une fois). **Quatre pouvoirs** cumulables sans limite (affichage plafonné à 9), activés d'un toucher ou d'un clic dans une barre d'icônes, sans menu, et non consommés s'ils ne peuvent pas servir :
  - **Turbo** : vitesse au sol ×2 pendant 10 s (saut inchangé).
  - **Bouclier d'Anubis** : bulle visible par les deux, absorbe le premier impact (mine, gant, momie, chute) ; un clic quand il est déjà actif ne consomme rien.
  - **Sceau magique** : scelle automatiquement la dernière bonne porte franchie (dans les 8 s), pour l'adversaire seulement, pendant 10 s ; puis 10 s de repos pendant lesquelles elle ne peut pas être rescellée ; un seul sceau actif par joueur. Jamais de blocage permanent.
  - **Mine** (choisie à la place du missile, reporté) : posée à ses pieds sur une terrasse, loin des portes et pas au-dessus d'un trou ; armée après 1 s ; explose au passage de l'adversaire (sauter par-dessus l'évite ; léger scintillement pour la repérer) ; 3 posées au maximum, 60 s de durée de vie.
  Une attaque fait perdre **au plus un étage** (au premier étage : simple recul), puis **4 s d'immunité**. Contenu des portes à pouvoir **selon le classement** au moment de l'ouverture (en retard : plutôt turbo et bouclier ; en tête : plutôt sceau et mine), tiré par le serveur. Les **bonus solo des coffres sont désactivés en duel** (remplace la règle « à partir du niveau 2 »). Le serveur fait autorité sur les réserves, les pouvoirs, les mines, les boucliers, les sceaux et les étages ; le navigateur prédit ses propres actions et se recale sur l'état renvoyé par le serveur. Réglages d'équilibrage centralisés dans `src/core/duel.ts`.
  Pouvoirs candidats pour plus tard : **Nuage de confusion** (brouille légèrement la vue de l'adversaire 3 s), **Bottes rebondissantes** (saut renforcé 8 s, plafonné sous la hauteur d'une marche pour ne jamais contourner les portes), **Échange de place** (version ultérieure), **Missile**.
- **2026-10-12** — Pouvoirs du duel **cachés et renouvelables** (demande du porteur du projet, remplace les « portes à pouvoir » fixes) : le serveur, seul à connaître leurs emplacements (anti-triche), cache des pouvoirs derrière des **portes vides** au hasard. Un pouvoir ramassé disparaît et **réapparaît 15 s plus tard derrière une autre porte vide du même étage** : un pouvoir n'est jamais perdu pour la partie, et sa position change à chaque fois. À la création de la salle, le joueur choisit **« peu » ou « beaucoup » de pouvoirs** ; le jeu en déduit le nombre par étage d'après le nombre de portes de l'étage (≈ 8 % ou 20 % des portes, au moins un par étage), donc selon le niveau. La pyramide du duel est celle du solo (génération inchangée). Le contenu reste tiré au moment du ramassage selon le classement.
- **2026-10-12** — Deux pouvoirs de duel ajoutés (demande du porteur du projet) : **Nuage de confusion** (voile flou et nuages sur l'écran de l'adversaire pendant 3 s ; le HUD, le joystick et les boutons restent par-dessus, nets et utilisables ; le bouclier ne l'arrête pas, ce n'est pas un impact) et **Bottes rebondissantes** (impulsion du saut ×1,15 pendant 8 s : sommet ≈ 2,5 m, sous la marche de 3 m, vérifié par un test de la physique ; on ne contourne jamais les portes). Six pouvoirs au total, touches 1 à 6. Répartition selon le classement mise à jour (en retard : plutôt turbo, bouclier, bottes ; en tête : plutôt mine, sceau, nuage). **Échange de place** et **Missile** restent pour une version ultérieure.
- **2026-10-12** — **Multijoueur de 2 à 4 joueurs, extensible** (demande du porteur du projet : « 4 joueurs, mais extensible à 5, 6 ou 8 ; code et architecture cohérents »). Le nombre de joueurs n'est plus supposé nulle part : une seule constante (`MAX_PLAYERS`, protocole) fixe la taille des salles ; tout le reste travaille sur des listes (adversaires affichés avec chacun sa couleur d'écharpe et son nom, pastilles de couleur sur l'échelle des étages, places de départ centrées, classement, cibles des pouvoirs). Le vocabulaire du code suit : « duel » et « rival » deviennent « multijoueur », « salle » et « adversaires ». Règles retenues :
  - **Lancement** : le créateur lance quand il veut à partir de 2 joueurs ; la partie part toute seule quand la salle est pleine ; on ne rejoint pas une partie en cours (on peut rejoindre entre deux courses pour la revanche).
  - **Fin de partie** : la course continue après le premier arrivé, jusqu'au **podium** (3 arrivées, ou tous sauf un) ou **45 s** après la première arrivée. Classement : arrivés par temps, puis les autres par étage atteint (puis moins de chutes), ceux qui ont quitté la partie en dernier. Un joueur qui part ne termine pas la partie des autres ; s'il ne reste qu'un joueur en course, la partie s'arrête.
  - **Nuage de confusion** : vise le joueur **juste devant** soi ; en tête, il vise le deuxième.
  - **Pouvoirs selon le classement** : seul en tête → plutôt mine, sceau, nuage ; seul dernier → plutôt turbo, bouclier, bottes ; au milieu → répartition équilibrée.
  - **Revanche** : quand tous les joueurs présents l'ont demandée (au moins 2).
- **2026-10-12** — **Scènes de piège cartoon** (esprit Crash Bandicoot, l'effet gag passe avant tout) : **3 s en solo, 2 s en multijoueur** (mêmes temps forts, version raccourcie), jamais passables. **Gant de boxe** : « POW ! », propulsion très haut en vrille, bras qui moulinent, suspendu un instant en gros plan (« AAAH ! »), chute, nuage de poussière, « boing », étoiles autour de la tête. **Momie** : elle attrape le joueur et le tire dans la porte, la porte tremble (« BIM ! », « POF ! », « BAM ! », bruits de bagarre), elle le ressort emmailloté de bandelettes (cocon, yeux qui dépassent) et l'expédie à l'étage inférieur, où le cocon éclate. Seule la caméra du joueur touché passe en gros plan (et revient d'elle-même) ; les autres joueurs rejouent la même scène sur son personnage, sans toucher à leur caméra (message `trapped` relayé par le serveur). Le moteur et le serveur gardent la main sur les conséquences (étage, bouclier, qui bloque toujours le piège) ; pendant la scène, le joueur ne déclenche pas de mine. Animations scénarisées (aucune physique), état final garanti (fin normale, fin de partie, déconnexion), gardiens prêtés aux scènes simultanées.
