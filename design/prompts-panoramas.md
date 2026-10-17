# Prompts des panoramas (4 vues par niveau)

Méthode qui a marché pour les niveaux 1 et 2 : **4 images de 90°** générées avec ChatGPT, assemblées ensuite par
`art/panoramas/build_horizon.py` (raccords, fond 360°, bande d'horizon nette).

## Consignes communes (à mettre au début de chaque demande)

```text
Image de paysage pour l'arrière-plan d'un jeu vidéo 3D stylisé (rendu 3D cartoon de qualité, couleurs vives, style jeu mobile haut de gamme). Format paysage 1536×1024. Vue à hauteur d'homme, regard parfaitement horizontal, champ de vision de 90°. Ligne d'horizon bien droite, placée à environ 60 % de la hauteur en partant du haut. Aucun personnage, aucun texte, aucun objet au premier plan : le bas de l'image est une étendue plate et simple. Cette image est une des 4 vues d'un panorama à 360° : même hauteur d'horizon, même ciel et même lumière sur toute la largeur, pour que ses bords gauche et droit se raccordent aux vues voisines.
```

Conseils :
- Générer les 4 vues **dans la même conversation**, l'une après l'autre (« même style, même ciel, même lumière que
  l'image précédente »), pour garder la cohérence.
- Le **soleil** (ou l'astre principal) doit être dans la **vue 1**, au centre de l'image.
- Ranger les images dans `design/niveau N/` (comme pour le niveau 2) en indiquant laquelle est la vue 1, 2, 3, 4.

---

## Niveau 3 · Le Crépuscule Pourpre

Ambiance (maquette `design/level3.png`) : crépuscule rose et violet, éclipse, îles flottantes, ruines, cristaux
violets, cascades lumineuses violettes.

```text
Le bas de l'image est un lac calme qui reflète le ciel rose et violet. Ciel de crépuscule dégradé du violet profond (en haut) au rose et à l'orange (à l'horizon), quelques nuages lumineux, premières étoiles.
```

```text
Vue 1 : au centre du ciel, un soleil en éclipse (disque sombre entouré d'un anneau de lumière rose orangé) ; au loin, des ruines de temple égyptien en grès rosé, silhouettes de palmiers.
```
```text
Vue 2 : des îles rocheuses flottantes dans le ciel, avec de petites cascades violettes lumineuses qui en tombent ; des cristaux violets brillants sur les rochers.
```
```text
Vue 3 : hautes falaises de grès rosé et colonnes en ruine, de grands cristaux violets lumineux au pied des falaises, des ponts de corde suspendus entre deux pitons.
```
```text
Vue 4 : plaine de ruines et d'obélisques au loin, silhouettes de palmiers, quelques îles flottantes plus petites dans le ciel.
```

---

## Niveau 4 · La Pyramide de Glace

Ambiance (maquette `design/level4.png`) : sommets enneigés, sapins, cascades gelées, colonnes de glace, ciel bleu
froid et lumineux.

```text
Le bas de l'image est un lac gelé lisse, légèrement enneigé. Lumière froide et claire de montagne, ciel bleu pâle avec quelques nuages blancs, petits flocons dans l'air.
```

```text
Vue 1 : au centre du ciel, un soleil pâle et éclatant au-dessus d'une chaîne de pics enneigés très pointus.
```
```text
Vue 2 : forêt de sapins enneigés au pied des montagnes, une grande cascade gelée en glace bleue translucide.
```
```text
Vue 3 : glacier bleu avec des colonnes et des arches de glace, au loin des ruines de temple couvertes de neige.
```
```text
Vue 4 : vallée enneigée avec des sapins et des rochers, montagnes plus douces à l'horizon, aurore boréale très légère dans le ciel.
```

---

## Niveau 5 · Le Sanctuaire de Lave

```text
Le bas de l'image est une plaine plate de roche volcanique noire, parcourue de fines fissures de lave orange lumineuse. Ciel sombre rouge et orangé, nuages de cendre, lueur de la lave sur les nuages.
```

```text
Vue 1 : au centre du ciel, un soleil rouge voilé par la fumée, au-dessus d'un grand volcan en éruption.
```
```text
Vue 2 : falaises de basalte noir avec des chutes de lave orange qui tombent dans une rivière de lave.
```
```text
Vue 3 : ruines de temple en pierre sombre à moitié englouties, braises qui flottent dans l'air, rivière de lave sinueuse.
```
```text
Vue 4 : champ de pitons rocheux pointus et de cristaux rouges, volcans plus petits fumants à l'horizon.
```

---

## Niveau 6 · La Cité Céleste

Ambiance (maquette `design/level6.png`, « Observatoire Céleste ») : espace, galaxies, planètes, rochers flottants,
architecture dorée.

```text
Le bas de l'image est une mer de nuages plate et douce, éclairée par les étoiles. Ciel de nuit spatiale bleu nuit et violet, rempli d'étoiles, nébuleuses colorées.
```

```text
Vue 1 : au centre du ciel, une grande planète lumineuse avec des anneaux dorés, qui éclaire la scène.
```
```text
Vue 2 : une galaxie spirale violette et bleue, des astéroïdes et rochers flottants au-dessus des nuages.
```
```text
Vue 3 : au loin, des tours d'observatoire en pierre claire et or posées sur des rochers flottants, reliées par des anneaux lumineux.
```
```text
Vue 4 : plusieurs petites planètes et lunes, une nébuleuse rose, quelques rochers flottants plus proches.
```

---

## Niveau 7 · Le Stade Légendaire

Ambiance (maquette `design/level5.png`) : pyramide-stade, pelouse à bandes, tribunes, projecteurs, drapeaux,
ballon géant au sommet. Ranger les images dans `design/niveau 7/`.

```text
Le bas de l'image est une pelouse de football tondue à bandes, parfaitement plate. Ciel de fin de journée orange et violet, projecteurs allumés.
```

```text
Vue 1 : au centre, le soleil couchant juste au-dessus du toit ouvert d'un immense stade.
Vue 2 : tribunes pleines de supporters stylisés, drapeaux rouges et bleus, grands projecteurs.
Vue 3 : écran géant et tribunes, confettis dans l'air.
Vue 4 : tribunes et entrée monumentale du stade, drapeaux qui flottent.
```
