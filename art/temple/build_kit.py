"""Kit de maçonnerie « temple » : blocs de paroi et dalles de sol en pierre taillée et usée, construits par script.

Usage (Blender 4.5, sans interface) :
    blender -b --factory-startup --python art/temple/build_kit.py -- [--no-render]

Produit :
    public/models/temple/block_<variante>.glb      bloc de paroi détaillé (biseau, surface irrégulière, éclats)
    public/models/temple/slab_<variante>.glb       dalle de sol détaillée
    public/models/temple/<pièce>_lo.glb            même pièce simplifiée (profil « qualité réduite », téléphones)
et, à côté de ce script :
    temple_kit.blend    fichier source Blender
    previews/kit.png    aperçu d'un pan de mur et d'un dallage assemblés (Cycles)

Les pièces sont posées par les composants de décor `masonry` et `flagstones` (src/client/scene/components/masonry.ts) :
instanciées (un appel de dessin par variante), recolorées par le thème (matériau `stone`), ajustées à la place libre.
Le relief et l'usure sont dans la géométrie et dans les couleurs des sommets (COLOR_0) : arêtes éclaircies (usure),
creux et joints assombris (occlusion précalculée), marbrures du grès. Aucune texture à télécharger.

Détail : chaque face est découpée en facettes d'environ `step` mètres, légèrement déplacées (pierre bosselée).
Les grandes pièces ont des facettes plus grandes : leur coût en triangles reste proche de celui des moyennes.

Conventions (ART_DIRECTION.md § 7.3) : mètres, origine au centre de la base, Y vers le haut après export.
Blocs : face visible vers -Y dans Blender (= +Z dans le jeu). Faces toujours cachées supprimées
(arrière et dessous des blocs, dessous des dalles).
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models", "temple"))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

# Blocs de paroi : (nom, largeur, hauteur, profondeur, facette, graine). Hauteur nominale d'une assise : 1 m ;
# les blocs « t » couvrent deux assises (gros blocs de la maquette).
BLOCKS = [
    ("m1", 1.2, 1.0, 0.4, 0.22, 11),
    ("m2", 1.6, 1.0, 0.4, 0.22, 23),
    ("l1", 2.2, 1.0, 0.45, 0.35, 37),
    ("l2", 2.8, 1.0, 0.45, 0.35, 41),
    ("t1", 1.5, 2.0, 0.45, 0.35, 59),
    ("t2", 2.1, 2.0, 0.45, 0.35, 67),
]
# Dalles de sol : (nom, longueur, largeur, épaisseur, facette, graine).
SLABS = [
    ("a", 1.1, 1.0, 0.16, 0.55, 13),
    ("b", 1.5, 1.0, 0.16, 0.55, 29),
    ("c", 1.9, 1.0, 0.16, 0.6, 43),
    ("d", 2.4, 1.0, 0.16, 0.6, 61),
]
# Biseau : (largeur, segments) en version détaillée et simplifiée.
BEVEL = {"hi": (0.04, 2), "lo": (0.04, 1)}

SANDSTONE = 0xD4924C


def srgb(hex_color):
    c = [((hex_color >> s) & 0xFF) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def stone_material():
    m = bpy.data.materials.get("stone")
    if m:
        return m
    m = bpy.data.materials.new("stone")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    p = nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = srgb(SANDSTONE)
    p.inputs["Roughness"].default_value = 0.9
    # Couleurs des sommets × couleur de base (comme dans le jeu : material.color × COLOR_0).
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["A"].default_value = srgb(SANDSTONE)
    m.node_tree.links.new(attr.outputs["Color"], mix.inputs["B"])
    m.node_tree.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m


def subdivide_axis(bm, axis, size, step):
    """Coupe les arêtes parallèles à un axe pour obtenir des segments d'environ `step` mètres."""
    cuts = max(0, round(size / step) - 1)
    if not cuts:
        return
    edges = [e for e in bm.edges if abs((e.verts[1].co - e.verts[0].co).normalized()[axis]) > 0.99]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)


def build_piece(name, kind, size, step, seed, quality):
    """kind = "block" (face visible -Y, base en z = 0) ou "slab" (face visible +Z, dessus en z = épaisseur)."""
    rng = random.Random(seed)
    sx, sy, sz = size
    bevel_width, segments = BEVEL[quality]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, (v.co.z + 0.5) * sz))
    if quality == "hi":
        # Facettes sur les faces visibles seulement (épaisseurs cachées : une seule découpe au plus).
        subdivide_axis(bm, 0, sx, step)
        subdivide_axis(bm, 1, sy, step if kind == "slab" else step * 1.5)
        subdivide_axis(bm, 2, sz, step if kind == "block" else sz)

    # Biseau sur toutes les arêtes vives (entre deux faces à angle droit).
    bm.normal_update()
    sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5]
    bmesh.ops.bevel(bm, geom=sharp, offset=bevel_width, offset_type="OFFSET", segments=segments, profile=0.7,
                    affect="EDGES", clamp_overlap=True)
    bm.normal_update()

    # Surface irrégulière : bosses douces (amplitude proportionnelle à la facette, pour rester crédible).
    off = Vector((seed * 1.37, seed * 0.71, seed * 2.13))
    amp = (0.05 * step if kind == "block" else 0.02 * step) if quality == "hi" else 0.004
    for v in bm.verts:
        n = noise.noise(v.co * 2.6 + off) * amp + noise.noise(v.co * 7.0 + off) * amp * 0.35
        v.co += v.normal * n
    # Éclats : un ou deux coins de la face visible enfoncés.
    if kind == "block":
        corners = [Vector((x * sx / 2, -sy / 2, z)) for x in (-1, 1) for z in (0, sz)]
        center = Vector((0, 0, sz / 2))
    else:
        corners = [Vector((x * sx / 2, y * sy / 2, sz)) for x in (-1, 1) for y in (-1, 1)]
        center = Vector((0, 0, 0))
    for corner in rng.sample(corners, rng.choice([1, 2])):
        radius = rng.uniform(0.1, 0.2)
        for v in bm.verts:
            d = (v.co - corner).length
            if d < radius:
                v.co += (center - corner).normalized() * (radius - d) * 0.4
    bm.normal_update()

    # Faces toujours cachées : arrière et dessous des blocs (dans la paroi), dessous des dalles.
    def hidden(f):
        c, n = f.calc_center_median(), f.normal
        if n.z < -0.9 and c.z < 0.05:
            return True
        return kind == "block" and n.y > 0.9 and c.y > sy / 2 - 0.05

    bmesh.ops.delete(bm, geom=[f for f in bm.faces if hidden(f)], context="FACES")
    bm.normal_update()

    # Couleurs des sommets : usure des arêtes (convexe = plus clair), creux (concave = plus sombre), marbrures,
    # et joints assombris : plus on s'enfonce depuis la face visible, plus c'est sombre (occlusion des joints).
    color = bm.loops.layers.color.new("Col")
    shade = {}
    for v in bm.verts:
        neighbours = [e.other_vert(v).co - v.co for e in v.link_edges]
        curvature = sum(d.normalized().dot(v.normal) for d in neighbours if d.length > 1e-6) / max(1, len(neighbours))
        mottle = noise.noise(v.co * 1.4 + off * 0.5) * 0.13 + noise.noise(v.co * 5.0 + off) * 0.06
        edge = 1 - max(abs(v.normal.x), abs(v.normal.y), abs(v.normal.z))
        depth = (v.co.y + sy / 2) if kind == "block" else (sz - v.co.z)
        joint = 1 - 0.45 * smoothstep(0.02, 0.14, depth)
        value = (0.9 + mottle - curvature * 1.1 + edge * 0.45) * joint
        shade[v] = max(0.4, min(1.12, value))
    for f in bm.faces:
        for loop in f.loops:
            s = shade[loop.vert]
            # Légère dominante chaude dans les zones claires, froide dans les creux.
            loop[color] = (min(1.0, s * 1.02), min(1.0, s), min(1.0, s * 0.97), 1.0)

    # UV en projection cubique, 1 unité = 1 m (texture de grain répétée par le jeu).
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        axis = max(range(3), key=lambda i: abs(f.normal[i]))
        for loop in f.loops:
            p = loop.vert.co
            loop[uv].uv = (p.x, p.z) if axis == 1 else (p.y, p.z) if axis == 0 else (p.x, p.y)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(stone_material())
    for poly in mesh.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export(ob):
    os.makedirs(OUT, exist_ok=True)
    for other in bpy.context.scene.objects:
        other.select_set(other == ob)
    bpy.context.view_layer.objects.active = ob
    loc = ob.location.copy()
    ob.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, ob.name + ".glb"), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_vertex_color="ACTIVE", export_normals=True, export_texcoords=True,
        export_materials="EXPORT", export_extras=False, export_cameras=False, export_lights=False,
        export_animations=False,
    )
    ob.location = loc
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"  {ob.name}: {tris} triangles")


def fill(length, widths, rng, gap):
    """Découpe une longueur en morceaux de largeurs tirées au hasard (même principe que le jeu)."""
    x, out = 0.0, []
    while length - x > 0.3:
        w = rng.choice(widths) * rng.uniform(0.92, 1.08)
        if length - x - w < min(widths) * 0.6:
            w = length - x
        out.append((x, w - gap))
        x += w
    return out


def place_copy(src, collection, location, scale):
    ob = src.copy()
    ob.hide_render = False
    collection.objects.link(ob)
    ob.location = location
    ob.scale = scale
    return ob


def preview(blocks, slabs):
    """Pan de mur (2 grandes assises + une petite) au-dessus d'un dallage, soleil rasant : contrôle visuel du kit."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("ciel")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.5, 0.8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    scene.world = world
    rng = random.Random(5)
    group = bpy.data.collections.new("apercu")
    scene.collection.children.link(group)
    length = 9.0
    single = [b for b in blocks if b.dimensions.z < 1.5]
    tall = [b for b in blocks if b.dimensions.z >= 1.5]
    # Assises de 1,2 m, 1,2 m et 0,6 m (comme dans le jeu), un gros bloc double par endroits.
    y0 = 0.0
    reserved = []
    for course, height in enumerate((1.2, 1.2, 0.6)):
        free = [(-length / 2, length / 2)]
        if course == 1:
            for r0, r1 in sorted(reserved):
                free = [p for lo, hi in free for p in ((lo, min(hi, r0)), (max(lo, r1), hi)) if p[1] - p[0] > 0.3]
        for lo0, hi0 in free:
            for start, w in fill(hi0 - lo0, [b.dimensions.x for b in single], rng, 0.03):
                lo = lo0 + start
                if course == 0 and rng.random() < 0.25:
                    src = min(tall, key=lambda b: abs(b.dimensions.x - w))
                    place_copy(src, group, (lo + w / 2, 0, 0), (w / src.dimensions.x, 1, 2.37 / src.dimensions.z))
                    reserved.append((lo - 0.015, lo + w + 0.015))
                    continue
                src = min(single, key=lambda b: abs(b.dimensions.x - w))
                place_copy(src, group, (lo + w / 2, 0, y0), (w / src.dimensions.x, 1, (height - 0.03) / src.dimensions.z))
        y0 += height
    # Dallage devant le mur : rangées de 0,9 à 1,3 m.
    y = -0.25
    while y > -5.5:
        depth = rng.uniform(0.9, 1.3)
        for start, w in fill(length, [s.dimensions.x for s in slabs], rng, 0.035):
            src = min(slabs, key=lambda s: abs(s.dimensions.x - w))
            place_copy(src, group, (-length / 2 + start + w / 2, y - depth / 2, -src.dimensions.z + 0.03),
                       (w / src.dimensions.x, (depth - 0.035) / src.dimensions.y, 1))
        y -= depth
    ground = bpy.data.meshes.new("sol")
    gbm = bmesh.new()
    bmesh.ops.create_grid(gbm, x_segments=1, y_segments=1, size=12)
    gbm.to_mesh(ground)
    gbm.free()
    gob = bpy.data.objects.new("sol", ground)
    gob.location = (0, -4, -0.05)
    scene.collection.objects.link(gob)
    sun = bpy.data.lights.new("soleil", "SUN")
    sun.energy = 4.5
    sun.color = (1.0, 0.82, 0.6)
    sun.angle = math.radians(2)
    sob = bpy.data.objects.new("soleil", sun)
    sob.rotation_euler = (math.radians(58), 0, math.radians(-38))
    scene.collection.objects.link(sob)
    cam = bpy.data.cameras.new("camera")
    cam.lens = 32
    cob = bpy.data.objects.new("camera", cam)
    cob.location = (2.5, -9.5, 4.2)
    cob.rotation_euler = (math.radians(70), 0, math.radians(14))
    scene.collection.objects.link(cob)
    scene.camera = cob
    os.makedirs(os.path.join(HERE, "previews"), exist_ok=True)
    scene.render.filepath = os.path.join(HERE, "previews", "kit.png")
    bpy.ops.render.render(write_still=True)


def main():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for name in os.listdir(OUT) if os.path.isdir(OUT) else []:
        if name.endswith(".glb"):
            os.remove(os.path.join(OUT, name))
    print("Kit temple :")
    blocks, slabs = [], []
    for quality in ("hi", "lo"):
        suffix = "" if quality == "hi" else "_lo"
        for name, w, h, d, step, seed in BLOCKS:
            ob = build_piece(f"block_{name}{suffix}", "block", (w, d, h), step, seed, quality)
            export(ob)
            (blocks if quality == "hi" else []).append(ob)
        for name, length, width, thick, step, seed in SLABS:
            ob = build_piece(f"slab_{name}{suffix}", "slab", (length, width, thick), step, seed, quality)
            export(ob)
            (slabs if quality == "hi" else []).append(ob)
    # Les pièces sources sont rangées hors champ et masquées au rendu ; l'aperçu en pose des copies.
    for i, ob in enumerate(bpy.context.scene.objects):
        ob.location = (i * 3, 30, 0)
        ob.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "temple_kit.blend"))
    if "--no-render" not in ARGS:
        preview(blocks, slabs)


main()
