"""Texture de détail d'un sol (sable, herbe, neige…), préparée à partir d'une texture photo (ex. Poly Haven, CC0).

    blender -b --factory-startup --python art/textures/prepare_detail.py -- <diffuse.jpg> <normal_gl.jpg> <dossier/nom> [--contraste 2.2]

Produit dans public/textures/<dossier>/ (ordinateur 1024 px, mobile 512 px) :
    <nom>.jpg / <nom>-mobile.jpg                nuances de gris (moyenne 0,8) : la couleur vient du thème
    <nom>-normal.jpg / <nom>-normal-mobile.jpg  relief (convention OpenGL, comme Three.js)
Utilisation dans un thème : option `detail` des composants terrain, esplanade et sandDrifts (ex. "sand/ripples").

Textures préparées ainsi :
    sand/ripples   « Aerial Beach 01 » (Poly Haven), contraste 2,2
    grass/leafy    « Leafy Grass » (Poly Haven), contraste 1,6
"""

import os
import sys

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index("--") + 1:]
diffuse, normal, target = ARGS[:3]
CONTRAST = float(ARGS[ARGS.index("--contraste") + 1]) if "--contraste" in ARGS else 2.2
folder, name = target.split("/")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "textures", folder))
os.makedirs(OUT, exist_ok=True)


def resized(path, size):
    src = oiio.ImageBuf(path)
    dst = oiio.ImageBufAlgo.resize(src, roi=oiio.ROI(0, size, 0, size, 0, 1, 0, 3))
    return dst.get_pixels(oiio.FLOAT)[:, :, :3]


def write(pixels, file):
    h, w = pixels.shape[:2]
    buf = oiio.ImageBuf(oiio.ImageSpec(w, h, 3, oiio.UINT8))
    buf.set_pixels(oiio.ROI(0, w, 0, h, 0, 1, 0, 3), np.clip(pixels, 0, 1).astype(np.float32))
    buf.specmod().attribute("Compression", "jpeg:88")
    buf.write(os.path.join(OUT, file))


for size, suffix in ((1024, ""), (512, "-mobile")):
    px = resized(diffuse, size)
    # Luminance, contraste renforcé autour de la moyenne, moyenne ramenée à 0,8 (le jeu compense).
    lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lum = (lum - lum.mean()) * CONTRAST + 0.8
    write(np.repeat(lum[:, :, None], 3, axis=2), f"{name}{suffix}.jpg")
    write(resized(normal, size), f"{name}-normal{suffix}.jpg")
print("ok", OUT)
