"""Prépare l'image d'accueil (écran de chargement) à partir de design/welcome.png.

    blender -b --factory-startup --python art/welcome/prepare_welcome.py

Produit public/welcome/welcome.jpg (pleine résolution de la source, ordinateur) et welcome-mobile.jpg (1440 px :
les téléphones ont des écrans très denses, une image plus petite paraît pixelisée).
"""

import os

import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "welcome")
os.makedirs(OUT, exist_ok=True)

src = oiio.ImageBuf(os.path.join(ROOT, "design", "welcome.png"))
spec = src.spec()
for width, suffix, quality in ((spec.width, "", 92), (1440, "-mobile", 86)):
    height = round(spec.height * width / spec.width)
    dst = src if width == spec.width else oiio.ImageBufAlgo.resize(src, filtername="lanczos3", roi=oiio.ROI(0, width, 0, height, 0, 1, 0, 3))
    dst.specmod().attribute("Compression", f"jpeg:{quality}")
    dst.write(os.path.join(OUT, f"welcome{suffix}.jpg"))
    print(f"welcome{suffix}.jpg {width}x{height}")
