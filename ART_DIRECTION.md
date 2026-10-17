# PyraRush — Bible graphique

> **Ambition : un jeu « stylized 3D premium » qui donne envie de jouer dès les premières secondes**, dans l'esprit
> des maquettes du dossier [`design/`](design/), et optimisé pour le web et le mobile.
> Les maquettes sont des **références artistiques** (ambiance, palette, matières, composition, personnage),
> **pas des plans géométriques** : la forme de la pyramide est dictée par le gameplay.
> Toute décision graphique validée est consignée dans le journal de [GAME_DESIGN.md](GAME_DESIGN.md).

**Sommaire** : 1. Intention · 2. Règles absolues du gameplay · 3. Principes de composition · 4. Lumière, matières, effets ·
5. Éléments du jeu · 6. Identité de chaque univers · 7. Système de thèmes · 8. Budgets de performance ·
9. Faisabilité (immédiat / assets externes / coûteux) · 10. Pipeline de production des assets ·
11. Outils et licences · 12. Critères de validation · 13. Plan d'amélioration du niveau 1

---

## 1. Intention

Une aventure de course et d'exploration **chaleureuse, drôle et lisible** : temples, matières riches, lumière dorée,
petit explorateur encapuchonné aux yeux lumineux. Le joueur doit **comprendre immédiatement** où aller, ce qui
est une porte et où il peut tomber, et **avoir envie de voir le niveau suivant**.

**Style : 3D stylisée premium.** Proportions et formes stylisées (pas de réalisme), mais avec de la **matière** :
pierre taillée avec usure et variations, métaux qui accrochent la lumière, tissus, eau vivante, feu crédible,
végétation qui bouge, lumière et ombres soignées. Références d'esprit : les maquettes du projet, et la famille
des jeux d'aventure stylisés (*A Short Hike*, *Kirby et le monde oublié*, *Sackboy*, *Fall Guys*), **adaptée
aux budgets du web** (§ 8).

On **ne réduit pas l'ambition** parce que le jeu tourne dans un navigateur : Three.js permet des rendus stylisés de
grande qualité. On **adapte les moyens** (lumière précalculée, instanciation, matériaux et textures optimisés,
qualité réglable par appareil) pour tenir la fluidité sur mobile.

---

## 2. Règles absolues du gameplay (le décor ne passe jamais avant)

1. **La structure est fixée par le jeu** : étages accessibles, terrasses praticables, portes interactives, trous.
   Le décor habille cette structure, il ne la modifie pas (géométrie et collisions : `src/core/geometry.ts`).
2. **Zones interdites au décor** (aucun objet, même sans collision) :
   - la **zone d'interaction** devant chaque porte (rayon de 1,8 m autour du point d'interaction) ;
   - la **bande de marche** de chaque terrasse : au moins 2 m de large, libre sur tout le tour ;
   - les **trous** et leurs abords (0,5 m) ;
   - tout ce qui pourrait faire croire qu'on peut monter sans porte (escalier praticable, rampe…).
3. **Zones autorisées** : la face des parois (saillie ≤ 0,4 m), le rebord extérieur des terrasses (bande ≤ 0,5 m),
   les coins des terrasses, l'esplanade hors des bandes de marche, tout l'extérieur de l'île.
4. **Visibilité** : le personnage, la porte visée et le bord de la terrasse restent visibles en permanence.
   Aucun objet haut sur la moitié extérieure d'une terrasse ; un objet qui masque le personnage devient
   transparent (à implémenter, § 13).
5. **Couleurs réservées au jeu**, jamais utilisées par le décor : cyan lumineux (passage découvert), or lumineux
   (indice privé), symbole cyan qui pulse (porte mystère), rouge vif (piège), rouge / orange / bleu (chaud / tiède / froid).
6. **Les portes ne trahissent jamais leur contenu** avant ouverture (sauf la porte mystère, visible par conception).

Ces règles sont **vérifiables automatiquement** : les emplacements de décor (`src/client/scene/components/slots.ts`)
sont calculés à partir de la géométrie du jeu, et des tests contrôlent les zones interdites (§ 12).

---

## 3. Principes de composition

1. **Élégance et lisibilité plutôt que surcharge.** Une pyramide bien composée, avec des respirations, vaut mieux
   qu'un décor spectaculaire mais encombré. En cas de doute, on retire.
2. **Hiérarchie visuelle** : personnage > porte visée > portes > bords de terrasse > ornements > décor lointain.
   Les contrastes (valeur, saturation, lumière) suivent cet ordre.
3. **Variété sans bruit** : on évite la répétition mécanique (portes, dalles, blocs identiques alignés) par des
   variantes et des ruptures de rythme, pas en ajoutant des objets.
4. **Trois plans de profondeur** : le temple (détail), l'île et l'eau (contexte), l'horizon (silhouettes dans la brume).
5. **Densité adaptée à l'appareil** : le profil mobile allège d'abord le décor lointain et la végétation, jamais
   la lisibilité du premier plan.

---

## 4. Lumière, matières, effets

**Lumière**
- Une lumière principale par univers (soleil, lune, projecteurs…), avec une direction qui sculpte le temple ;
  un éclairage d'ambiance (hémisphère ou environnement) qui débouche les ombres avec la couleur du ciel.
- **Occlusion ambiante précalculée** (dans les couleurs des sommets ou dans des textures) : ombres de contact au
  pied des murs, sous les linteaux, dans les joints. C'est la première source de « profondeur premium ».
- Pas de lumières dynamiques multiples : la lueur des braseros est **simulée** (matériau émissif, halo, légère
  teinte au sol), pas calculée.

**Matières**
- Pierre : variations de teinte par bloc, **usure des arêtes**, joints ombrés, salissures en bas des murs, sable
  accumulé au pied des parois.
- Sols : dalles **irrégulières** (tailles et teintes variées), jamais une grille régulière visible.
- Métaux (or, bronze) : reflet doux via une carte d'environnement légère.
- Végétation : couleurs riches, légère ondulation au vent (shader), bords nets (pas de transparence coûteuse).

**Effets**
- **Lueur (bloom) maîtrisée** : seuil haut, intensité faible ; seuls les éléments vraiment lumineux brillent
  (flammes, hiéroglyphes, yeux, pierre de faîte). Jamais de blanc brûlé : les flammes gardent leur dégradé de couleur.
- **Feu** : flammes en shader (forme organique, dégradé jaune-orange-rouge, ondulation, étincelles), jamais des cônes.
- **Étalonnage** (color grading) par univers : contraste, saturation et teinte globale.
- Particules légères (poussière, pollen, neige, braises), toujours discrètes.

---

## 5. Éléments du jeu

### 5.1 Le temple
- **Structure** (fixée par le jeu) : étages en terrasses, parois percées de portes, terrasses praticables, trous.
- **Habillage** : blocs de pierre taillée, corniches au sommet de chaque paroi, liseré lisible au bord des
  terrasses, pylônes ou tours d'angle, panneaux de reliefs (hiéroglyphes) entre les portes, portail d'entrée
  principal plus monumental au premier étage, pierre de faîte lumineuse.
- **Variété architecturale** : variantes d'encadrements selon l'étage, alternance des ornements, ruptures de
  rythme (pylônes, reliefs, niches), sans jamais toucher à la structure jouable.

### 5.2 Les portes
| Porte | Avant ouverture | À l'ouverture |
|---|---|---|
| Normale (passage, mur ou piège caché) | battant sombre, hiéroglyphe gravé lumineux (plusieurs motifs) | passage : s'ouvre, lumière cyan ; mur : tremble (indice) ; piège : flash rouge, gant de boxe |
| Mystère (±N) | symbole ±N cyan qui pulse | gain : tourbillon doré ; perte : gant de boxe |

Les portes sont **reconnaissables entre elles** (motifs, variantes d'encadrement) sans jamais révéler leur contenu.

### 5.3 Le personnage
L'explorateur encapuchonné (variante « cartoon » de la planche) : capuche blanche à pointe, visage sombre,
yeux jaunes lumineux, écharpe flottante (couleur = joueur en multijoueur), tunique, ceinture et bottes en cuir,
petite cape. Animations : `idle`, `run`, `jump`, `fall`, `push`, `hit`, `celebrate`.
Toujours le plus contrasté de l'écran (contour léger si nécessaire sur fond clair).

### 5.4 Effets de jeu
Scarabée doré (indice), gant de boxe et « POW ! », sifflet de chute, téléportation, confettis de victoire :
courts (< 1,5 s), drôles, lisibles, toujours au service de l'information de jeu.

### 5.5 Interface
Panneaux de verre dépoli, police arrondie (Fredoka), icônes au trait, boutons aux couleurs de l'univers.
L'interface ne masque jamais le personnage ni la porte visée (mobile en priorité).

---

## 6. Identité de chaque univers

Chaque univers a ses **propres matériaux, modèles, lumières, effets, décor, musique**, et pas seulement une palette.

| Univers | Architecture et matières | Lumière et ciel | Décor et effets propres |
|---|---|---|---|
| **Désert** (Temple des Sables) | grès doré, piliers à bandes bleues et or, statues d'Anubis | heure dorée, soleil rasant | île, douves turquoise, palmiers, obélisques, pyramides à l'horizon, poussière dorée |
| **Oasis** | pierre moussue, turquoise et or, lianes | lumière de midi, ciel limpide | cascades sur la pyramide, bassins, nénuphars, ponts de bois, pierre de faîte en cristal vert |
| **Jungle** | temple de type maya, pierre sombre, racines et mousse | lumière filtrée, brume | canopée, lianes, fleurs géantes, oiseaux, rayons de lumière |
| **Crépuscule** | grès rosé, ornements dorés | soleil couchant rose et violet | lanternes, silhouettes de palmiers, premières étoiles |
| **Glace** | blocs de glace translucides, givre | lumière froide, ciel pâle | neige qui tombe, stalactites, sapins, aurore boréale |
| **Football** | pyramide-stade : terrasses en gazon tondu à bandes, lignes blanches, tribunes | projecteurs de stade, nuit | foule stylisée, drapeaux, ballons géants, confettis, écrans |
| **Espace** | métal et panneaux lumineux, technologie extraterrestre | lumière d'étoile, nébuleuse | planètes, astéroïdes, hologrammes, particules d'énergie |

**Règles de progression et de différenciation**
- **Nombre d'étages progressivement croissant** d'un niveau à l'autre (avec de nouvelles mécaniques), jamais en baisse.
- **Pas de thèmes redondants** : deux univers doivent se distinguer sur une vignette en noir et blanc (silhouette
  du temple, matières, décor), pas seulement par la couleur. Exemple de risque : *oasis* et *jungle* (eau + végétation)
  doivent rester opposés — l'oasis est un point d'eau clair dans le désert (pierre claire, ciel limpide, eau
  turquoise), la jungle une forêt dense et sombre (temple maya, brume, racines). Si la différence ne tient pas, on
  en fusionne un.
- Les univers actuels du code (Sanctuaire de Lave, Cité Céleste) restent possibles ; la liste et l'ordre définitifs
  sont à arrêter dans le journal de GAME_DESIGN.md (la Cité Céleste et l'Espace, par exemple, se recouvrent).

---

## 7. Système de thèmes (extensible, sans toucher au moteur)

Un niveau = des règles de jeu + un **thème**. Le thème décrit tout l'habillage ; le moteur et la structure
jouable ne changent jamais.

### 7.1 Ce qui existe déjà
- **Palette** (`src/core/theme.ts`) : ciel, soleil, ambiance, brume, exposition, sol, pierres, ornements, portes,
  couleurs d'interface, musique.
- **Composants de décor** (`theme.components`) : liste ordonnée `{ use, id?, …options }` construite par le registre
  `src/client/scene/components/`. Chaque composant se place sur des **emplacements génériques** qui respectent les
  règles du § 2. Exemples : `sky`, `terrain`, `moat`, `props` (n'importe quel modèle GLB), `doorFrames`,
  `banners`, `braziers`, `statues`, `capstone`, `particles`.
- **Modèles GLB** (`src/client/scene/models.ts`) : préchargement, instanciation (un appel de dessin par matériau),
  recoloration par nom de matériau.
- **Thèmes en fichiers de données** (`content/themes/<nom>.json`) : héritage (`extends`), seules les différences
  sont écrites, couleurs en `'#rrggbb'` (format : `src/core/themeFile.ts`). Modifiables sans toucher au code.
- **Options décrites** (`src/core/schema.ts`) : chaque composant déclare le type, la valeur par défaut et les limites de ses
  options ; la palette aussi (`PALETTE_SCHEMA`). Sert au typage, à la validation et aux formulaires de l'éditeur de décor.
- **Contrôles automatiques** : chaque composant cité par un niveau existe, chaque option est connue et du bon type,
  chaque palette est complète (tests) ; le thème complet de chaque niveau est figé par un test de référence.

### 7.2 Ce qu'il faut ajouter (évolutions prévues, dans cet ordre)
1. **Matériaux du thème** : `theme.materials.{ wall, terrace, ground, trim, door }`, chacun décrit par un
   *générateur procédural* (grès, dalles irrégulières, gazon, glace, métal…) avec ses paramètres, **ou** par des
   textures externes. Registre de matériaux comme pour les composants.
2. **Kit d'architecture** : `theme.structure` pour habiller la structure jouable avec des modèles GLB modulaires
   (segment de paroi, corniche, rebord, coin, encadrement de porte, battant), instanciés sur les emplacements du jeu.
   Par défaut : les formes procédurales actuelles.
3. **Lumière et effets du thème** : `theme.lighting` (type de lumière principale, environnement, ombres) et
   `theme.effects` (lueur, étalonnage, vignette, particules), avec des valeurs par profil (desktop / mobile).
4. **Ambiance sonore** : `theme.audio` (musique + sons d'ambiance), déjà amorcé avec `theme.music`.

**Principe** : remplacer un asset ou un matériau d'un niveau = modifier la configuration de son thème. Ajouter un
nouveau type d'élément = un composant (ou un générateur de matériau) enregistré une fois, réutilisable par tous les niveaux.

### 7.3 Fiche technique des modèles (souple, orientée qualité)
- **Format** glTF binaire (**GLB**) ; mètres ; Y vers le haut ; avant vers +Z ; **origine au centre de la base** ;
  transformations appliquées.
- **Matériaux** nommés par rôle (`stone`, `gold`, `cloth`, `leafs`, `wood`, `water`…) pour la recoloration par thème ;
  PBR simple (couleur, rugosité, métal, émission) ; textures en atlas quand c'est possible.
- **Personnages** : un squelette, animations nommées comme au § 5.3.
- **Optimisation à l'export** : compression géométrique (Meshopt ou Draco) et textures KTX2 via `gltf-transform` ;
  niveaux de détail (LOD) pour les modèles lourds vus de loin.
- **Pas de limite arbitraire par objet** : la contrainte est le **budget global de la scène** (§ 8). Un modèle
  très détaillé est accepté s'il est peu répété ou s'il a des LOD.
- **Rangement** : `public/models/<pack>/<nom>.glb` + `LICENSE.txt` du pack + ligne dans [CREDITS.md](CREDITS.md).

---

## 8. Budgets de performance (objectifs initiaux, à mesurer)

Ces budgets sont des **objectifs de départ, pas des garanties** : ils seront ajustés après mesure sur de vrais
appareils. Deux profils, choisis automatiquement (et réglables dans le menu) :

| Mesure (scène de jeu, vue la plus chargée) | Desktop | Mobile (milieu de gamme) |
|---|---|---|
| Images par seconde | 60 stables | 60 visés, **30 minimum** sans saccade |
| Temps GPU par image | < 10 ms | < 16 ms |
| Appels de dessin | < 400 | **< 150** |
| Triangles visibles | < 2 millions | **< 500 000** |
| Mémoire GPU (textures + géométrie) | < 512 Mo | **< 200 Mo** |
| Textures | 2048 px max, KTX2 | 1024 px max, KTX2 |
| Ombres | 1 lumière, carte 2048, filtrage doux | 1 lumière, carte 1024, ombres simplifiées |
| Post-traitement | lueur + étalonnage + anticrénelage | lueur demi-résolution + étalonnage, ou désactivé |
| Chargement initial jusqu'à l'accueil | < 3 s (fibre) | **< 5 s en 4G** |
| Changement de niveau | < 1,5 s | < 3 s |
| Poids téléchargé par univers | < 15 Mo | < 8 Mo (assets compressés, chargés à la demande) |

**Comment mesurer** (`renderer.info` ne suffit pas : il compte les appels et les triangles, pas le coût réel GPU) :
- **Compteur en jeu** `?stats=1` : images par seconde, temps par image (moyenne et 95e centile), images longues
  (> 33 ms), **temps GPU réel** via la requête de chronométrage WebGL (`EXT_disjoint_timer_query_webgl2`, quand le
  navigateur la fournit), appels de dessin et triangles de **toutes** les passes (rendu + post-traitement),
  géométries, textures, mémoire JavaScript (Chrome).
- **Outils des navigateurs** : enregistrement de performances de Chrome (piste GPU, images, mémoire),
  débogage à distance d'un Android par USB (`chrome://inspect`), inspecteur web de Safari pour iPhone (images et mémoire).
- **Capture d'une image** avec Spector.js pour analyser appel par appel ce que coûte une scène.
- **Endurance** : 5 minutes de jeu sur téléphone pour détecter la baisse de cadence due à la chauffe.
- **Appareils de référence** : un Android milieu de gamme récent, un iPhone de 3–4 ans, un PC portable avec GPU intégré.
- Les mesures en navigateur automatisé (rendu logiciel, sans GPU) ne valent que pour les **compteurs**
  (appels de dessin, triangles, textures), jamais pour la fluidité.

---

## 9. Faisabilité

### 9.1 Réalisable immédiatement (stack actuelle + ressources gratuites)
- Lumière : réglage de la lueur, étalonnage, occlusion ambiante précalculée dans les couleurs des sommets,
  ombres plus douces, carte d'environnement légère pour les métaux.
- Matières procédurales : grès stylisé avec usure et variation, dalles irrégulières, sable au pied des murs,
  sol de l'île en sable (fin du quadrillage).
- Feu en shader (flammes organiques), eau animée (douves, cascades), végétation qui ondule.
- Variété architecturale procédurale : corniches, pylônes d'angle, panneaux de reliefs, portail principal,
  variantes d'encadrements de porte.
- Modèles libres CC0 : végétation, rochers, colonnes, obélisques (Kenney, Quaternius, KayKit) ;
  textures CC0 (Poly Haven, ambientCG) si utiles.
- Transparence des objets qui masquent le personnage ; profils de qualité desktop / mobile.

### 9.2 Nécessite des assets externes ou un travail dans Blender

Le procédural ne suffit pas pour la qualité finale. **Un vrai asset 3D est nécessaire** dès qu'un élément :
- est vu **de près** en jeu ou à l'accueil (statues, portes, braseros, personnage) ;
- a une **forme organique** ou sculptée (animal, visage, ornement, végétation travaillée) ;
- porte la **signature** d'un univers (kit d'architecture, objets emblématiques) ;
- ou ne peut atteindre la grille de lecture du § 12.2 qu'avec du détail modélisé.

Le procédural reste adapté aux grandes surfaces (murs, sols, eau, ciel), aux effets (feu, particules) et aux
éléments répétés simples.
| Élément | Pourquoi | Solution recommandée |
|---|---|---|
| **Statues d'Anubis** | les formes procédurales restent trop géométriques | génération par IA (image → 3D) à partir d'un extrait de maquette, retouche et simplification dans Blender |
| **Battants de porte sculptés** (3–4 variantes) | relief, gravure, matière | Blender (modélisation simple + texture), ou génération IA puis retouche |
| **Braseros sculptés** | coupe et pied ouvragés | génération IA ou Blender |
| **Kit d'architecture par univers** (blocs, corniches, coins, encadrements) | la « signature » visuelle de chaque univers | Blender (graphiste ou génération IA par pièce), sur la fiche du § 7.3 |
| **Personnage final** et ses animations | proportions et détails de la planche | Blender (ou IA + rig automatique), animations sur mesure ou Mixamo |
| Univers football et espace | aucun pack libre cohérent | kit sur mesure (graphiste) ou packs payants |

### 9.3 Envisageable mais coûteux en performances (avec la parade)
| Technique | Coût | Parade web |
|---|---|---|
| Occlusion ambiante en temps réel (SSAO) | élevé sur mobile | occlusion précalculée ; SSAO réservée au profil desktop |
| Plusieurs lumières dynamiques (braseros éclairant la scène) | très élevé | émission + halo + teinte au sol simulée |
| Reflets d'eau en temps réel | élevé | eau stylisée : dégradé, écume, reflet d'environnement statique |
| Rayons de lumière volumétriques | élevé | plans additifs dégradés (faux volumétrique) |
| Végétation dense avec transparence | surcharge des pixels | modèles à bords nets, densité réduite sur mobile, imposteurs au loin |
| Ombres haute résolution, plusieurs cascades | élevé | une carte d'ombre ajustée à la zone visible |
| Profondeur de champ, flou de mouvement | moyen à élevé | réservés à l'accueil ou au profil desktop |

---

## 10. Pipeline de production des assets 3D (reproductible)

Chaque asset suit les mêmes six étapes ; chaque étape laisse une trace dans le dossier source de l'asset
(`assets-src/<univers>/<asset>/`, hors du dossier publié) pour pouvoir refaire ou corriger l'asset plus tard.

| # | Étape | Contenu | Livrable |
|---|---|---|---|
| 1 | **Référence** | extrait de maquette, croquis ou planche ; dimensions en mètres ; rôle en jeu ; emplacement autorisé (§ 2) | `reference.png` + fiche `asset.md` (taille, matériaux, emplacement) |
| 2 | **Création ou génération** | modélisation dans Blender, **ou** génération IA (image → 3D) avec un outil à licence vérifiée (§ 11) | fichier source + outil, version et abonnement utilisés (traçabilité des droits) |
| 3 | **Nettoyage dans Blender** | retopologie ou réduction des polygones, normales, origine au centre de la base, échelle en mètres, axes, matériaux renommés par rôle, UV et atlas, occlusion ambiante précalculée, LOD si nécessaire | `<asset>.blend` |
| 4 | **Optimisation** | `gltf-transform` : déduplication, soudure, simplification des LOD, compression Meshopt (ou Draco), textures KTX2 redimensionnées par profil | commande enregistrée dans un script (reproductible) |
| 5 | **Export GLB** | glTF binaire selon la fiche du § 7.3 | `public/models/<pack>/<asset>.glb` (+ `LICENSE.txt` du pack) |
| 6 | **Intégration et contrôle qualité** | déclaration dans le thème du niveau (aucune modification du moteur) ; captures des vues de référence ; mesures (§ 8) ; tests des zones interdites ; licence vérifiée et ligne dans CREDITS.md | captures avant/après + mesures soumises à validation |

**Critères d'acceptation d'un asset** : conforme à la fiche du § 7.3 ; lisible et cohérent avec l'univers sur les
vues de référence ; budgets globaux toujours tenus ; licence commerciale vérifiée et tracée ; aucune régression de
gameplay (tests verts).

---

## 11. Outils et licences

> Conditions de Meshy, Tripo, TRELLIS.2 et Hunyuan3D vérifiées en octobre 2026 ; les autres sont les conditions
> publiques connues, à reconfirmer au moment de l'utilisation. Les conditions des services évoluent : relire la
> licence avant chaque nouvel usage commercial.

| Outil / ressource | Usage | Coût | Licence et conditions commerciales |
|---|---|---|---|
| **Blender** | modélisation, retouche, précalcul de l'occlusion, export GLB | gratuit | logiciel GPL ; **les créations appartiennent à leur auteur** |
| **Kenney, Quaternius, KayKit** | modèles stylisés (nature, ruines, personnages animés) | gratuit | **CC0** (domaine public) ; à reconfirmer pack par pack au téléchargement |
| **Poly Haven, ambientCG** | textures et environnements | gratuit | **CC0** |
| **gltf-transform**, **KTX-Software** | compression des modèles et des textures | gratuit | libres (MIT, Apache 2.0) |
| **Mixamo** (Adobe) | rig automatique et animations de personnages | gratuit (compte Adobe) | utilisable dans des jeux commerciaux ; redistribution des animations seules interdite |
| **TRELLIS.2** (Microsoft) | génération image → 3D, en local | gratuit | **MIT**, commercial autorisé ; demande une carte graphique NVIDIA d'environ 24 Go |
| **Meshy** | génération image/texte → 3D en ligne | gratuit ou ~20 $/mois | gratuit : sorties **CC BY 4.0** (commercial autorisé **avec crédit**) ; payant : propriété et droits commerciaux complets |
| **Tripo** | génération image → 3D en ligne | ~16–20 $/mois | gratuit : **pas de droits commerciaux** selon ses conditions ; payant : droits commerciaux |
| Hunyuan3D (Tencent) | génération 3D | gratuit | ⚠️ **licence non applicable dans l'Union européenne** : à ne pas utiliser |

Règles : garder la trace de l'outil et de l'abonnement utilisés pour chaque asset généré (les droits dépendent du
plan au moment de la génération) ; n'utiliser comme images de référence que nos propres maquettes ; crédits dans
CREDITS.md ; aucun asset payant dans un dépôt public.

---

## 12. Critères de validation

### 12.1 Performance (mesurés, profils du § 8)
Chaque niveau doit tenir ses budgets (objectifs initiaux, ajustés après mesures réelles) sur la vue la plus chargée (vue large du niveau entier) et en jeu, mesurés
avec `?stats=1` et sur les appareils de référence.

### 12.2 Rendu (vues de référence)
Cinq vues fixes, capturées automatiquement avant et après chaque amélioration et comparées côte à côte :
**accueil**, **jeu en vue proche**, **gros plan d'une porte**, **terrasse intermédiaire**, **vue aérienne**.
Grille de lecture :
- le personnage se repère en moins d'une seconde (contraste suffisant sur tous les fonds) ;
- une porte se distingue du mur à 15 m, et la porte visée se distingue des autres ;
- le bord de chaque terrasse est lisible ;
- aucune zone blanche brûlée (lueur), aucune zone noire bouchée ;
- aucun motif répétitif évident (sol, portes, blocs) dans les vues proche et aérienne ;
- chaque univers est reconnaissable sur une vignette en noir et blanc (silhouettes et matières, pas seulement la couleur) ;
- l'accueil donne envie de jouer : composition claire, pyramide mise en valeur, personnage présent.

### 12.3 Gameplay (automatisés)
- Aucun élément de décor dans les zones interdites du § 2 (test sur les emplacements générés pour chaque niveau).
- Le décor n'ajoute aucune collision qui gêne la marche ou l'accès aux portes.
- Les tests existants restent verts : pyramide toujours terminable, jamais d'arrivée dans un trou.

---

## 13. Plan d'amélioration progressif du niveau 1

Défauts actuels ciblés : sol trop quadrillé, répétition des portes, flammes en cônes, statues trop géométriques,
matériaux plats, manque de variété architecturale, lueur excessive.

| # | Étape | Contenu | Résultat vérifiable |
|---|---|---|---|
| 0 | **Mesurer** | compteur `?stats=1` ; script de capture des 5 vues de référence ; test des zones interdites | état « avant » chiffré et capturé ; budgets mesurés sur desktop et mobile |
| 1 | **Lumière et lueur** | lueur abaissée (seuil haut, intensité faible), étalonnage, occlusion précalculée au pied des murs et sous les linteaux, ombres plus douces | plus aucune zone brûlée ; murs et terrasses gagnent en relief sur les vues proche et aérienne |
| 2 | **Matériaux** | grès stylisé (variations, usure d'arêtes, salissures), dalles irrégulières, sable au pied des parois, île en sable | fin du quadrillage sur les vues proche et aérienne ; matières lisibles en gros plan |
| 3 | **Feu et eau** | flammes en shader avec étincelles ; douves avec écume au bord et reflets doux | plus aucun cône ; flamme crédible en gros plan, sans blanc brûlé |
| 4 | **Variété architecturale** | corniches, pylônes d'angle, panneaux de reliefs, portail principal à l'étage 1, 3 variantes d'encadrements selon l'étage, motifs de battants variés | plus de rangée de portes identiques ; silhouette du temple enrichie en vue aérienne, sans encombrer les terrasses |
| 5 | **Composition et lisibilité** | revue de la densité (moins mais mieux), transparence des objets qui masquent le personnage, profil mobile | grille de lecture du § 12.2 validée en vue proche et sur téléphone |
| 6 | **Assets externes** | statues d'Anubis, battants sculptés, braseros (pipeline du § 10), branchés par configuration | statues organiques en gros plan ; remplacement sans modification du moteur |
| 7 | **Accueil** | plan « héroïque » : pyramide mise en valeur, personnage au premier plan, lumière dorée | capture de l'accueil comparée à la maquette pour l'ambiance et la composition |

**Révision du 2026-10-13** (comparaison avec la maquette `design/level1.png`) : l'écart principal vient de la **géométrie des
parois** (murs plats avec briques dessinées, au lieu de vrais blocs en relief) et de la **lumière / palette** (tout orange,
pas de contraste chaud / froid). Nouvel ordre : **A** lumière, palette, environnement, étalonnage, ombres de contact
(composants `environment`, `grade`, `wallShadows`) et **B** kit de blocs Blender (`art/temple/build_kit.py`, composant
`masonry`) en premier, puis végétation et accessoires, éléments vus de près (portes, Anubis, braseros), effets.
Un nouveau kit (glace, lave…) = un script Blender qui exporte des blocs selon le § 7.3 + `{ use: 'masonry', kit: [...] }`
dans le thème ; aucune modification du moteur.

Chaque étape est livrée seule, avec ses captures avant/après et ses mesures, et validée avant de passer à la suivante.
**Priorité constante** : la lisibilité des portes, du personnage et des terrasses ; on ne surcharge jamais la pyramide.
Les étapes 1 à 5 améliorent ce que le procédural sait bien faire ; la qualité finale des éléments vus de près
(statues, portes, braseros, personnage) viendra des vrais assets de l'étape 6.
Les étapes 1 à 5 ne demandent aucun asset externe ; l'étape 6 peut être préparée en parallèle (génération et retouche des modèles).
