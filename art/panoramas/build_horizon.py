"""Horizon d'un thème à partir de 4 vues (ouest, nord, est, sud ; chacune couvre 90°), par ex. générées avec ChatGPT.

    blender -b --factory-startup --python art/panoramas/build_horizon.py -- <nom> <vue ouest> <vue nord> <vue est> <vue sud>
        [--horizon 0.54] [--sun-u 0.784] [--dessus 272] [--dessous 112]

Les 4 vues sont collées dans l'ordre (en tournant vers la droite : ouest → nord → est → sud → ouest), avec un fondu
aux raccords. Produit dans public/textures/panoramas/ :
    <nom>.jpg / <nom>-mobile.jpg            panorama 360° équirectangulaire (2048 × 1024 / 1536 × 768) : ciel de fond,
                                            reflets et couleur de la brume (composant `panorama`) ;
    <nom>-band.jpg / <nom>-band-mobile.jpg  bande d'horizon en pleine résolution (les 4 quarts empilés), affichée devant
                                            le ciel, plus grande et nette (composant `horizon`).

Repères : la ligne d'horizon des vues est à `--horizon` de la hauteur (depuis le haut). Le soleil de la vue ouest
(au centre) est placé en u = `--sun-u` dans le panorama (0,784 : même place que l'ancien panorama du niveau 1, donc
même `rotation` dans le thème). Chaque pixel couvre 90° / largeur d'une vue, à l'horizontale comme à la verticale.
`--dessus` / `--dessous` : hauteur de la bande nette au-dessus et au-dessous de l'horizon, en pixels des vues (à monter
si le paysage est haut, ex. des falaises) ; à reporter dans les options `above` / `below` du composant `horizon`.

Horizons produits :
    sables-horizon  niveau 1, design/panoramique/ (4 vues)          --horizon 0.54
    oasis-horizon   niveau 2, design/niveau 2/ (4 vues)             --horizon 0.62 --dessus 580
    crepuscule-horizon  niveau 3, design/niveau 3/ (4 vues)         --horizon 0.62 --dessus 600
"""

import os
import sys

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "textures", "panoramas"))
ARGS = sys.argv[sys.argv.index("--") + 1:]


def option(name, default):
    return float(ARGS[ARGS.index(name) + 1]) if name in ARGS else default


name, views = ARGS[0], ARGS[1:5]
HORIZON = option("--horizon", 0.54)
SUN_U = option("--sun-u", 0.784)
# Bande : rangées au-dessus et au-dessous de l'horizon (en pixels des vues), et fondu des raccords.
BAND_ABOVE, BAND_BELOW, SEAM = int(option("--dessus", 272)), int(option("--dessous", 112)), 48


def read(path):
    return oiio.ImageBuf(path).get_pixels(oiio.FLOAT)[:, :, :3]


def resize(px, width, height):
    h, w = px.shape[:2]
    src = oiio.ImageBuf(oiio.ImageSpec(w, h, 3, oiio.FLOAT))
    src.set_pixels(oiio.ROI(0, w, 0, h, 0, 1, 0, 3), np.ascontiguousarray(px, dtype=np.float32))
    dst = oiio.ImageBufAlgo.resize(src, filtername="lanczos3", roi=oiio.ROI(0, width, 0, height, 0, 1, 0, 3))
    return dst.get_pixels(oiio.FLOAT)[:, :, :3]


def write(px, path, quality):
    h, w = px.shape[:2]
    buf = oiio.ImageBuf(oiio.ImageSpec(w, h, 3, oiio.FLOAT))
    buf.set_pixels(oiio.ROI(0, w, 0, h, 0, 1, 0, 3), np.ascontiguousarray(np.clip(px, 0, 1), dtype=np.float32))
    buf.specmod().attribute("Compression", f"jpeg:{quality}")
    buf.write(path)
    print(f"  {os.path.basename(path)} {w}×{h}")


images = [read(v) for v in views]
h, w = images[0].shape[:2]
assert all(im.shape == images[0].shape for im in images), "les 4 vues doivent avoir la même taille"
strip = np.concatenate(images, axis=1)
W = strip.shape[1]

# Raccord des couleurs : à chaque raccord, l'écart de couleur entre les deux bords (rangée par rangée, lissé) est réparti
# en dégradé sur COLOR_SPAN pixels de part et d'autre (les ciels de deux vues voisines n'ont pas exactement la même teinte).
COLOR_SPAN = w // 4
vbox = np.ones(31) / 31
for s in [w * k for k in range(4)]:
    a_edge = strip[:, [(s - 1 - i) % W for i in range(8)]].mean(axis=1)
    b_edge = strip[:, [(s + i) % W for i in range(8)]].mean(axis=1)
    diff = np.stack([np.convolve(np.pad(b_edge[:, c] - a_edge[:, c], 15, mode="edge"), vbox, "valid") for c in range(3)], axis=1)
    for k in range(COLOR_SPAN):
        weight = (1 - k / COLOR_SPAN) * 0.5
        strip[:, (s - 1 - k) % W] += diff * weight
        strip[:, (s + k) % W] -= diff * weight

# Fondu en miroir à chaque raccord (y compris sud → ouest) : de part et d'autre, on mélange chaque côté avec le reflet
# de l'autre, ce qui efface la couture sur les dunes et le ciel.
blended = strip.copy()
for s in [w * k for k in range(4)]:
    for k in range(-SEAM, SEAM):
        x = (s + k) % W
        t = (k + SEAM) / (2 * SEAM)
        t = t * t * (3 - 2 * t)
        left = strip[:, (s + k) % W] if k < 0 else strip[:, (s - 1 - k) % W]
        right = strip[:, (s + k) % W] if k >= 0 else strip[:, (s - k) % W]
        blended[:, x] = left * (1 - t) + right * t
strip = blended

# Le soleil (centre de la vue ouest, u = 0,125 de la bande) est amené en u = SUN_U.
shift = int(round((SUN_U - 0.125) * W)) % W
strip = np.roll(strip, shift, axis=1)
h0 = int(round(HORIZON * h))

os.makedirs(OUT, exist_ok=True)
print(f"Horizon « {name} » : {W}×{h}, horizon à la rangée {h0}, décalage {shift} px")

# Bande d'horizon : rangées [h0 - BAND_ABOVE, h0 + BAND_BELOW), découpée en 4 quarts empilés (une seule texture).
assert h0 - BAND_ABOVE >= 0 and h0 + BAND_BELOW <= h, "bande plus haute que les vues"
band = strip[h0 - BAND_ABOVE:h0 + BAND_BELOW]
quarters = np.concatenate([band[:, q * w:(q + 1) * w] for q in range(4)], axis=0)
for width, suffix, quality in ((w, "", 88), (w // 2, "-mobile", 85)):
    height = quarters.shape[0] * width // w
    write(resize(quarters, width, height) if width != w else quarters, os.path.join(OUT, f"{name}-band{suffix}.jpg"), quality)

# Panorama équirectangulaire : la bande complète au niveau de l'équateur ; au-dessus, le ciel prolongé vers un zénith
# plus profond ; au-dessous, le sable du bas des vues.
EW, EH = 2048, 1024
rows = h * EW // W
small = resize(strip, EW, rows)
top_row = small[:6].mean(axis=0)
bottom_row = small[-6:].mean(axis=0)
# Lissage horizontal des couleurs de prolongement (pas de stries verticales).
SMOOTH = EW // 8
kernel = np.ones(SMOOTH) / SMOOTH
smooth = lambda row: np.stack([np.convolve(np.concatenate([row[-SMOOTH:, c], row[:, c], row[:SMOOTH, c]]), kernel, "same")[SMOOTH:-SMOOTH] for c in range(3)], axis=1)
top_row, bottom_row = smooth(top_row), smooth(bottom_row)
sand = bottom_row.mean(axis=0)
zenith = top_row.mean(axis=0) * np.array([0.75, 0.82, 0.95])
equi = np.zeros((EH, EW, 3), dtype=np.float32)
start = EH // 2 - int(round(HORIZON * rows))
equi[start:start + rows] = small
for r in range(start):
    t = 1 - r / max(1, start)
    t = t * t * (3 - 2 * t)
    equi[r] = top_row * (1 - t) + zenith * t
for r in range(start + rows, EH):
    t = min(1.0, (r - start - rows) / 60)
    equi[r] = bottom_row * (1 - t) + sand * t
for i in range(24):
    t = i / 24
    equi[start + i] = equi[start + i] * t + top_row * (1 - t)
    equi[start + rows - 1 - i] = equi[start + rows - 1 - i] * t + bottom_row * (1 - t)
write(equi, os.path.join(OUT, f"{name}.jpg"), 90)
write(resize(equi, 1536, 768), os.path.join(OUT, f"{name}-mobile.jpg"), 85)
print("ok", OUT)
