# Niveau 1 — Étape 0 : état de référence (« avant »)

Mesures et captures de l'état actuel, avant toute amélioration graphique (bible graphique § 13).
Données brutes : [`avant/metrics.json`](avant/metrics.json) · tableau généré : [`avant/README.md`](avant/README.md).

**Outils mis en place**
- Compteur en jeu : `?stats=1` (images par seconde, temps par image et 95e centile, saccades, **temps GPU réel**
  quand le navigateur fournit `EXT_disjoint_timer_query_webgl2`, appels de dessin et triangles de toutes les passes,
  géométries, textures, shaders, mémoire JavaScript).
- Capture reproductible des vues de référence : `npm run capture -- --label <nom>` (`tools/capture-reference.mjs`),
  graine fixe 20261011, profils desktop (1536×864) et mobile (844×390, densité 2).
- Contrôle automatique des zones interdites au décor : `src/client/scene/components/placement.ts` et son test.

⚠️ Captures faites dans un navigateur automatisé **sans carte graphique** (rendu logiciel) : les **compteurs**
(appels de dessin, triangles, textures, poids) sont fiables ; la **fluidité et le temps GPU ne le sont pas**
(1 à 3 images/s ici). Les temps de chargement sont mesurés en local, sans réseau : ils ne représentent pas la 4G.

---

## 1. Compteurs (vue la plus chargée de chaque profil)

| Mesure | Desktop | Mobile | Objectif desktop | Objectif mobile | Statut |
|---|---|---|---|---|---|
| Appels de dessin | **558** | **558** | < 400 | < 150 | ❌ hors objectif (×1,4 desktop, ×3,7 mobile) |
| Triangles visibles | 134 000 | 111 000 | < 2 M | < 500 000 | ✅ large marge |
| Textures | 27 | 27 | — | — | ✅ |
| Shaders (programmes) | 28 | 28 | — | — | ✅ |
| Téléchargé jusqu'au jeu | 0,94 Mo | 0,94 Mo | < 15 Mo / univers | < 8 Mo / univers | ✅ |
| Build de production | JS 759 Ko (209 Ko compressé) · modèles 354 Ko · polices 42 Ko | | | | ✅ |
| Chargement jusqu'à l'accueil (local) | 384 ms | 342 ms | < 3 s | < 5 s (4G) | à mesurer en réseau réel |
| Lancement du niveau (local) | 111 ms | 82 ms | < 1,5 s | < 3 s | ✅ (local) |
| Erreurs console | 0 | 0 | 0 | 0 | ✅ |

### D'où viennent les appels de dessin (analyse de la scène de jeu)

| Objets | Nombre | Appels (rendu) | Appels (ombres) |
|---|---|---|---|
| **Blocs de la pyramide** (6 groupes de matériaux par bloc) | 33 | **198** | **198** |
| Objets instanciés (portes, décor, modèles Kenney) | 49 | 49 | 41 |
| Autres meshes (sol, eau, ciel, personnage…) | 40 | 40 | 20 |
| Particules | 2 | 2 | 0 |
| **Total** (+ ~10 passes de post-traitement) | | **289** | **259** |

👉 **Les blocs de la pyramide représentent environ 72 % des appels** (≈ 400 sur 550) : chaque bloc est une boîte
à 6 groupes de matériaux, et ce coût est doublé par le calcul des ombres. Les objets instanciés coûtent très peu.
**Piste (étape 1)** : fusionner les blocs en 2 géométries (parois, dessus) → environ **150–170 appels** au total,
soit sous l'objectif mobile, sans changement visuel.

## 2. Zones interdites au décor (règles du gameplay)

| Niveau | Infractions (graine 42) | Détail |
|---|---|---|
| 1 | 44 | braseros de rebord : leur coupe (rayon 0,45 m) déborde de 0,4 m dans la bande de marche |
| 2 à 6 | 60 à 144 | même problème + 4 à 8 braseros trop près d'un trou |

Statues, jarres et plantes respectent les règles. Les infractions sont enregistrées comme **connues** dans le test
(`it.fails`) : elles seront corrigées après validation, et le test le signalera.

## 3. Constat visuel (captures `avant/`)

| Vue | Constat |
|---|---|
| Accueil | composition lisible ; pyramide et décor visibles ; flammes en cônes pâles ; miniatures présentes |
| Jeu (proche) | portes à piliers et bannières lisibles ; **sol quadrillé** régulier ; **statues très géométriques** ; matériaux plats |
| Gros plan porte | la porte visée devient **cyan pâle presque blanc** (surbrillance + lueur trop forte) ; hiéroglyphe brûlé ; pierre plate |
| Terrasse | **répétition** des portes et bannières identiques ; **braseros en cônes** ; un brasero de rebord gêne la vue |
| Vue aérienne | silhouette du temple monotone (longs anneaux identiques) ; nombreux points lumineux |

Correspondance avec les défauts ciblés par la bible : sol quadrillé ✔, répétition des portes ✔, flammes en cônes ✔,
statues géométriques ✔, matériaux plats ✔, manque de variété architecturale ✔, lueur excessive ✔.

## 4. Mesures à faire sur appareils réels (par toi)

1. Lancer `npm run build && npm run preview -- --host`, ouvrir l'adresse réseau sur le téléphone avec `?stats=1`.
2. Jouer 5 minutes au niveau 1 (vue proche, puis vue large) et relever : images/s, temps par image (p95), saccades,
   temps GPU (affiché « n/d » sur Safari : utiliser alors l'inspecteur web de Safari).
3. Appareils de référence : un Android milieu de gamme récent, un iPhone de 3–4 ans, un PC portable à GPU intégré.
4. Noter les valeurs dans ce fichier (section à compléter).

| Appareil | Navigateur | i/s (proche) | i/s (large) | p95 (ms) | GPU (ms) | Saccades / 5 min | Chauffe |
|---|---|---|---|---|---|---|---|
| _à compléter_ | | | | | | | |
