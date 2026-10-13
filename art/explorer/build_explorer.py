"""Explorateur encapuchonné (style « cartoon » de design/caracters.png), construit entièrement par script.

Usage (Blender 4.5, sans interface) :
    blender -b --factory-startup --python art/explorer/build_explorer.py -- [--no-render]

Produit :
    public/models/explorer/explorer.glb   modèle + squelette + animations (fiche technique : ART_DIRECTION.md § 7.3)
et, à côté de ce script :
    explorer.blend    fichier source Blender
    previews/*.png    rendus d'aperçu (vues de face/profil/dos, planche des animations)

Conventions : mètres, origine au centre de la base (entre les pieds), le personnage regarde -Y dans Blender
(= +Z après l'export glTF, Y vers le haut). Matériaux nommés par rôle ; `scarf` = couleur du joueur.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(HERE, "..", "..", "public", "models", "explorer", "explorer.glb")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FPS = 30

# --------------------------------------------------------------------------------------------------------------
# Matériaux (couleurs sRGB de character.ts ; rôles réutilisables pour la recoloration par thème / joueur)
# --------------------------------------------------------------------------------------------------------------


def srgb(hex_color):
    c = [((hex_color >> s) & 0xFF) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


MATERIALS = {
    # nom: (couleur, rugosité, métal, émission)
    "cloth": (0xF3ECE0, 0.75, 0.0, None),
    "cloth_shade": (0xE2D6C0, 0.8, 0.0, None),
    "leather": (0x7A4E2C, 0.6, 0.0, None),
    "leather_dark": (0x4A2E1A, 0.55, 0.0, None),
    "gold": (0xE0B040, 0.35, 0.85, None),
    "scarf": (0x2F5FB0, 0.6, 0.0, None),
    "face": (0x17131F, 0.45, 0.0, None),
    "eyes": (0xFFD24A, 0.4, 0.0, 5.0),
}
MATS = {}


def make_materials():
    for name, (color, rough, metal, emit) in MATERIALS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = srgb(color)
        p.inputs["Roughness"].default_value = rough
        p.inputs["Metallic"].default_value = metal
        if emit:
            p.inputs["Emission Color"].default_value = srgb(color)
            p.inputs["Emission Strength"].default_value = emit
        m.diffuse_color = srgb(color)
        MATS[name] = m


# --------------------------------------------------------------------------------------------------------------
# Squelette : nom -> (tête, queue, parent). Coordonnées du monde, personnage au repos (bras légèrement écartés).
# --------------------------------------------------------------------------------------------------------------

def mirror(p):
    return (-p[0], p[1], p[2])


SCARF_PATH = [(0.04, 0.15, 0.80), (0.06, 0.21, 0.67), (0.08, 0.25, 0.54), (0.10, 0.28, 0.42)]
HOOD_CENTER = Vector((0.0, 0.02, 1.08))
HOOD_TIP_DIR = Vector((0.0, 0.58, 0.81)).normalized()

BONES = {
    "root": ((0, 0, 0), (0, 0, 0.15), None),
    "hips": ((0, 0, 0.40), (0, 0, 0.55), "root"),
    "spine": ((0, 0, 0.55), (0, 0, 0.80), "hips"),
    "head": ((0, 0, 0.82), (0, 0, 1.20), "spine"),
    "hood_tip": (tuple(HOOD_CENTER + HOOD_TIP_DIR * 0.24), tuple(HOOD_CENTER + HOOD_TIP_DIR * 0.44), "head"),
    "cape.1": ((0, 0.19, 0.79), (0, 0.235, 0.55), "spine"),
    "cape.2": ((0, 0.235, 0.55), (0, 0.27, 0.30), "cape.1"),
    "scarf.1": (SCARF_PATH[0], SCARF_PATH[1], "spine"),
    "scarf.2": (SCARF_PATH[1], SCARF_PATH[2], "scarf.1"),
    "scarf.3": (SCARF_PATH[2], SCARF_PATH[3], "scarf.2"),
}
for side, sx in (("L", 1), ("R", -1)):
    def m(p):
        return (p[0] * sx, p[1], p[2])
    BONES.update({
        f"thigh.{side}": (m((0.095, 0, 0.38)), m((0.095, 0, 0.24)), "hips"),
        f"shin.{side}": (m((0.095, 0, 0.24)), m((0.095, 0, 0.09)), f"thigh.{side}"),
        f"foot.{side}": (m((0.095, 0, 0.09)), m((0.095, -0.12, 0.04)), f"shin.{side}"),
        f"upperarm.{side}": (m((0.20, 0, 0.72)), m((0.265, -0.005, 0.57)), "spine"),
        f"forearm.{side}": (m((0.265, -0.005, 0.57)), m((0.295, -0.02, 0.45)), f"upperarm.{side}"),
        f"hand.{side}": (m((0.295, -0.02, 0.45)), m((0.305, -0.03, 0.36)), f"forearm.{side}"),
    })

# --------------------------------------------------------------------------------------------------------------
# Géométrie : petites fonctions bmesh, tout est construit directement en coordonnées du monde.
# --------------------------------------------------------------------------------------------------------------


def lathe(profile, segs=20, sy=1.0, center=(0, 0, 0)):
    """Surface de révolution autour de Z ; profile = [(rayon, z)] du bas vers le haut (rayon 0 = pôle)."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((center[0], center[1], center[2] + z))])
        else:
            rings.append([
                bm.verts.new((center[0] + r * math.cos(a), center[1] + r * math.sin(a) * sy, center[2] + z))
                for a in (2 * math.pi * i / segs for i in range(segs))
            ])
    for a, b in zip(rings, rings[1:]):
        n = max(len(a), len(b))
        for i in range(n):
            j = (i + 1) % n
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ellipsoid(center, radii, segs=16, rings=10, deform=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        p = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if deform:
            p = deform(p)
        v.co = p + Vector(center)
    return bm


def capsule(p1, p2, r1, r2, segs=14):
    """Capsule effilée entre deux points (membres)."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    length = d.length
    prof = []
    for i in range(4):
        a = math.pi / 2 * i / 4
        prof.append((r1 * math.sin(a), -r1 * math.cos(a)))
    prof.append((r1, 0.0))
    prof.append((r2, length))
    for i in range(1, 5):
        a = math.pi / 2 * i / 4
        prof.append((r2 * math.cos(a), length + r2 * math.sin(a)))
    prof[-1] = (0.0, prof[-1][1])
    bm = lathe(prof, segs)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p1) @ rot, verts=bm.verts)
    return bm


def box(center, size, rot_y=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    mat = Matrix.Translation(center) @ Matrix.Rotation(rot_y, 4, "Y") @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    return bm


def torus(center, major, minor, sy=1.0, rot=(0, 0, 0), segs=24, tube=8):
    bm = bmesh.new()
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ring = []
        for j in range(tube):
            b = 2 * math.pi * j / tube
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        verts.append(ring)
    for i in range(segs):
        for j in range(tube):
            a, b = verts[i], verts[(i + 1) % segs]
            bm.faces.new((a[j], b[j], b[(j + 1) % tube], a[(j + 1) % tube]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    from mathutils import Euler
    mat = Matrix.Translation(center) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((1, sy, 1, 1))
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    return bm


def sheet(rows, cols, point, gold_rows=()):
    """Grille paramétrique (u, v) -> point ; les rangées de gold_rows reçoivent le matériau n° 1 (or)."""
    bm = bmesh.new()
    grid = [[bm.verts.new(point(u / cols, v / rows)) for u in range(cols + 1)] for v in range(rows + 1)]
    for v in range(rows):
        for u in range(cols):
            f = bm.faces.new((grid[v][u], grid[v][u + 1], grid[v + 1][u + 1], grid[v + 1][u]))
            if v in gold_rows:
                f.material_index = 1
    return bm


PARTS = []  # (objet, os candidats)


def part(name, bm, mats, bones, subsurf=1, solidify=None, bevel=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in ([mats] if isinstance(mats, str) else mats):
        me.materials.append(MATS[m])
    if solidify:
        mod = ob.modifiers.new("solidify", "SOLIDIFY")
        mod.thickness, mod.offset = solidify[0], solidify[1]
        mod.use_even_offset = True
        if len(solidify) > 2:
            mod.material_offset, mod.material_offset_rim = solidify[2], solidify[3]
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments = bevel, 2
    if subsurf:
        mod = ob.modifiers.new("subsurf", "SUBSURF")
        mod.levels = mod.render_levels = subsurf
    PARTS.append((ob, bones))
    return ob


def build_body():
    # Tunique / manteau : évasé en bas, cintré à la taille.
    part("tunic", lathe([
        (0.0, 0.30), (0.20, 0.265), (0.255, 0.235), (0.245, 0.30), (0.21, 0.40), (0.19, 0.47),
        (0.20, 0.58), (0.20, 0.66), (0.17, 0.74), (0.11, 0.80), (0.0, 0.82),
    ], segs=16, sy=0.85), "cloth", ["hips", "spine"])

    part("belt", torus((0, 0, 0.47), 0.198, 0.028, sy=0.85, segs=32, tube=8), "leather", ["hips"], subsurf=0)
    part("buckle", box((0, -0.192, 0.47), (0.075, 0.02, 0.06)), "gold", ["hips"], subsurf=0, bevel=0.008)
    part("strap", torus((0, 0, 0.62), 0.207, 0.016, sy=0.84, rot=(0, 0.55, 0), segs=32, tube=6), "leather", ["spine"],
         subsurf=0)
    part("strap_medal", ellipsoid((-0.085, -0.17, 0.585), (0.028, 0.012, 0.028), 12, 8), "gold", ["spine"], subsurf=0)
    for sx in (1, -1):
        part("pouch", box((sx * 0.15, -0.105, 0.43), (0.06, 0.04, 0.065), rot_y=sx * 0.1), "leather", ["hips"],
             subsurf=0, bevel=0.012)

    # Tabard (couleur du joueur) en pointe, bordure dorée et losange.
    def tabard(u, v):
        z = 0.45 - 0.25 * v
        w = 0.065 + 0.015 * v
        x = (u - 0.5) * 2 * w
        z -= 0.035 * v * (1 - abs(u - 0.5) * 2) ** 1.5
        y = -0.172 - 0.063 * v + 1.2 * x * x
        return (x, y, z)
    part("tabard", sheet(5, 4, tabard, gold_rows=(4,)), ["scarf", "gold"], ["hips"], solidify=(0.012, 0))
    part("tabard_gem", box((0, -0.207, 0.35), (0.04, 0.012, 0.04), rot_y=math.pi / 4), "gold", ["hips"],
         subsurf=0, bevel=0.004)

    # Cape courte à l'arrière, plis légers, bordure dorée.
    def cape(u, v):
        heights = [0.80, 0.70, 0.60, 0.50, 0.42, 0.36, 0.335, 0.30]
        z = heights[round(v * 7)]
        k = (0.80 - z) / 0.50
        a = (u - 0.5) * math.radians(220)
        r = 0.175 + 0.12 * k + 0.014 * math.sin(a * 6) * max(0.0, k - 0.2)
        return (r * math.sin(a), 0.01 + r * math.cos(a) * 0.9, z)
    part("cape", sheet(7, 14, cape, gold_rows=(6,)), ["cloth_shade", "gold"], ["spine", "cape.1", "cape.2"],
         solidify=(0.014, -1))

    # Écharpe : deux rouleaux autour du cou et deux pans qui flottent dans le dos.
    part("scarf_low", torus((0, 0, 0.795), 0.125, 0.06, rot=(0.14, 0, 0), segs=28, tube=12), "scarf", ["spine"], subsurf=0)
    part("scarf_high", torus((0, 0.01, 0.85), 0.1, 0.05, rot=(0.1, 0, 0), segs=28, tube=12), "scarf", ["spine"],
         subsurf=0)
    for offset, width, length in ((0.05, 0.095, 1.0), (-0.035, 0.08, 0.72)):
        def ribbon(u, v, offset=offset, width=width, length=length):
            t = v * length * (len(SCARF_PATH) - 1)
            i = min(int(t), len(SCARF_PATH) - 2)
            a, b = Vector(SCARF_PATH[i]), Vector(SCARF_PATH[i + 1])
            p = a.lerp(b, t - i)
            w = width * (0.85 + 0.25 * v)
            return (p.x + offset + (u - 0.5) * w, p.y, p.z)
        part("scarf_tail", sheet(8, 2, ribbon, gold_rows=(7,)), ["scarf", "gold"], ["scarf.1", "scarf.2", "scarf.3"],
             solidify=(0.016, 0))


def build_limbs():
    for sx in (1, -1):
        def m(x, y, z):
            return (x * sx, y, z)
        side = "L" if sx > 0 else "R"
        # Jambes, revers de botte, bottes arrondies (semelle aplatie).
        part("leg", capsule(m(0.095, 0, 0.37), m(0.095, -0.005, 0.13), 0.068, 0.06), "cloth",
             [f"thigh.{side}", f"shin.{side}"], subsurf=0)
        part("boot_cuff", lathe([(0.0, 0.10), (0.072, 0.10), (0.078, 0.14), (0.074, 0.175), (0.0, 0.175)],
                                segs=20, center=m(0.095, -0.005, 0)), "leather", [f"shin.{side}"], subsurf=0)

        def flat(p):
            return Vector((p.x, p.y, p.z * (0.6 if p.z < 0 else 1.0)))
        part("boot", ellipsoid(m(0.095, -0.035, 0.044), (0.092, 0.135, 0.072), segs=12, rings=8, deform=flat), "leather_dark",
             [f"foot.{side}"])

        # Bras : manche, avant-bras, brassard en cuir, gant et pouce.
        part("sleeve", capsule(m(0.20, 0, 0.72), m(0.265, -0.005, 0.57), 0.066, 0.056), "cloth",
             [f"upperarm.{side}"], subsurf=0)
        part("forearm", capsule(m(0.265, -0.005, 0.57), m(0.295, -0.02, 0.45), 0.055, 0.05), "cloth",
             [f"forearm.{side}"], subsurf=0)
        part("bracer", capsule(m(0.284, -0.014, 0.515), m(0.296, -0.02, 0.46), 0.061, 0.061), "leather",
             [f"forearm.{side}"], subsurf=0)
        part("glove", ellipsoid(m(0.30, -0.025, 0.405), (0.062, 0.058, 0.066), 12, 8), "leather", [f"hand.{side}"])
        part("thumb", ellipsoid(m(0.272, -0.062, 0.425), (0.024, 0.024, 0.03), 10, 6), "leather", [f"hand.{side}"], subsurf=0)


def build_head():
    # Capuche : sphère ouverte à l'avant, pointe vers l'arrière, épaisseur avec liseré doré (rim) et intérieur sombre.
    front = Vector((0, -1, -0.12)).normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    # Coupe plane = ouverture parfaitement ronde (bord net, sans escalier).
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=front * 0.5, plane_no=front,
                           clear_outer=True)
    for v in bm.verts:
        p = Vector((v.co.x * 0.29, v.co.y * 0.28, v.co.z * 0.27))
        t = p.normalized().dot(HOOD_TIP_DIR)
        if t > 0.3:
            f = ((t - 0.3) / 0.7) ** 2.0
            along = HOOD_TIP_DIR * p.dot(HOOD_TIP_DIR)
            p = along + (p - along) * (1 - 0.7 * f) + HOOD_TIP_DIR * 0.22 * f + Vector((0, 0.1, -0.05)) * f * f
        v.co = p + HOOD_CENTER
    part("hood", bm, ["cloth", "gold", "face"], ["head", "hood_tip"], solidify=(0.035, -1, 2, 1))

    part("face", ellipsoid((0, 0.03, 1.065), (0.225, 0.14, 0.205), 20, 12), "face", ["head"], subsurf=0)
    for sx in (1, -1):
        part("eye", ellipsoid((sx * 0.075, -0.095, 1.065), (0.04, 0.02, 0.058), 14, 10), "eyes", ["head"], subsurf=0)


# --------------------------------------------------------------------------------------------------------------
# Assemblage : modificateurs appliqués, poids calculés par distance aux os candidats, un seul maillage skinné.
# --------------------------------------------------------------------------------------------------------------


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def assemble():
    dg = bpy.context.evaluated_depsgraph_get()
    bone_segments = {n: (Vector(h), Vector(t)) for n, (h, t, _) in BONES.items()}
    objs = []
    for ob, bones in PARTS:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        ob.data = me
        groups = {n: ob.vertex_groups.new(name=n) for n in bones}
        for v in me.vertices:
            if len(bones) == 1:
                groups[bones[0]].add([v.index], 1.0, "REPLACE")
                continue
            ws = sorted(((1.0 / (seg_dist(v.co, *bone_segments[n]) + 0.015) ** 4, n) for n in bones), reverse=True)[:2]
            total = sum(w for w, _ in ws)
            for w, n in ws:
                if w / total > 0.02:
                    groups[n].add([v.index], w / total, "REPLACE")
        objs.append(ob)

    body = objs[0]
    with bpy.context.temp_override(active_object=body, object=body, selected_objects=objs,
                                   selected_editable_objects=objs):
        bpy.ops.object.join()
    body.name = body.data.name = "explorer"
    bmesh_clean(body.data)
    return body


def bmesh_clean(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()


def build_armature(body):
    arm = bpy.data.armatures.new("explorer_rig")
    rig = bpy.data.objects.new("explorer_rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (h, t, parent) in BONES.items():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = h, t
        direction = (Vector(t) - Vector(h)).normalized()
        # Axe Z de chaque os vers l'avant (-Y) : rotation X positive = balancer vers l'avant, partout.
        eb.align_roll(Vector((0, 0, 1)) if abs(direction.y) > 0.9 else Vector((0, -1, 0)))
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = (Vector(arm.edit_bones[parent].tail) - Vector(h)).length < 1e-4
    arm.edit_bones["root"].use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")
    body.parent = rig
    mod = body.modifiers.new("rig", "ARMATURE")
    mod.object = rig
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


# --------------------------------------------------------------------------------------------------------------
# Animations (noms du § 5.3) : chaque pose = {os: (rx, ry, rz)} ; +rx = balancer vers l'avant ; « hips » porte
# aussi une translation verticale (clé "lift"). Côtés : sym() inverse ry/rz pour le côté droit.
# --------------------------------------------------------------------------------------------------------------

S = math.sin
TAU = 2 * math.pi


def sym(pose, base, l, r=None):
    r = r if r is not None else l
    pose[f"{base}.L"] = l
    pose[f"{base}.R"] = (r[0], -r[1], -r[2])


def idle(p):
    b = S(TAU * p)
    pose = {
        "spine": (0.03 * b, 0, 0), "head": (-0.03 * b + 0.02, 0, 0.03 * S(TAU * p + 1)),
        "hood_tip": (-0.12 + 0.06 * S(TAU * p - 0.8), 0, 0),
        "cape.1": (0.03 * S(TAU * p - 0.5), 0, 0), "cape.2": (0.04 * S(TAU * p - 1), 0, 0),
        "scarf.1": (-0.05, 0, 0.04 * S(TAU * p)), "scarf.2": (0.04 * S(TAU * p - 0.7), 0, 0.05 * S(TAU * p - 1)),
        "scarf.3": (0.06 * S(TAU * p - 1.4), 0, 0.06 * S(TAU * p - 1.6)),
        "lift": -0.006 * (1 - b),
    }
    sym(pose, "upperarm", (0.05, 0, 0.06 + 0.025 * b))
    sym(pose, "forearm", (0.25 + 0.03 * b, 0, 0))
    sym(pose, "thigh", (0.02, 0, 0))
    sym(pose, "shin", (-0.04, 0, 0))
    return pose


def run(p):
    s, c = S(TAU * p), math.cos(TAU * p)
    knee = lambda ph: -0.25 - 1.0 * max(0.0, S(TAU * p + ph))  # noqa: E731
    pose = {
        "hips": (0.05, -0.18 * s, 0), "spine": (0.2, 0.14 * s, 0), "head": (-0.12, -0.05 * s, 0),
        "hood_tip": (-0.45 + 0.1 * S(2 * TAU * p), 0, 0.06 * s),
        "cape.1": (-0.5 + 0.07 * S(2 * TAU * p), 0, 0.05 * s), "cape.2": (-0.3 + 0.15 * S(2 * TAU * p + 1), 0, 0),
        "scarf.1": (-1.1, 0, 0.1 * s), "scarf.2": (-0.25 + 0.2 * S(2 * TAU * p), 0, 0.15 * S(2 * TAU * p + 1)),
        "scarf.3": (-0.2 + 0.3 * S(2 * TAU * p + 1.2), 0, 0.2 * S(2 * TAU * p + 2)),
        "lift": 0.045 * abs(c) - 0.03,
    }
    pose["thigh.L"], pose["thigh.R"] = (0.85 * s, 0, 0), (-0.85 * s, 0, 0)
    pose["shin.L"], pose["shin.R"] = (knee(math.pi + 0.6), 0, 0), (knee(0.6), 0, 0)
    pose["foot.L"], pose["foot.R"] = (0.25 * s, 0, 0), (-0.25 * s, 0, 0)
    pose["upperarm.L"], pose["upperarm.R"] = (-0.9 * s, 0, 0.12), (0.9 * s, 0, -0.12)
    pose["forearm.L"], pose["forearm.R"] = (1.0 - 0.25 * s, 0, 0), (1.0 + 0.25 * s, 0, 0)
    return pose


def jump_keys():
    crouch = {"hips": (0.1, 0, 0), "spine": (0.3, 0, 0), "head": (-0.2, 0, 0), "lift": -0.07,
              "cape.1": (0.1, 0, 0), "scarf.1": (0.1, 0, 0), "hood_tip": (0.1, 0, 0)}
    sym(crouch, "thigh", (0.75, 0, 0.05))
    sym(crouch, "shin", (-1.3, 0, 0))
    sym(crouch, "foot", (0.55, 0, 0))
    sym(crouch, "upperarm", (-0.7, 0, 0.2))
    sym(crouch, "forearm", (0.4, 0, 0))
    up = {"spine": (-0.12, 0, 0), "head": (-0.1, 0, 0), "lift": 0.03, "cape.1": (-0.9, 0, 0), "cape.2": (-0.3, 0, 0),
          "scarf.1": (-1.0, 0, 0), "scarf.2": (-0.4, 0, 0), "hood_tip": (-0.4, 0, 0)}
    up.update({"thigh.L": (0.9, 0, 0), "shin.L": (-1.4, 0, 0), "thigh.R": (-0.15, 0, 0), "shin.R": (-0.35, 0, 0),
               "foot.R": (-0.4, 0, 0)})
    sym(up, "upperarm", (0.6, 0, 1.6))
    sym(up, "forearm", (0.3, 0, 0))
    air = dict(up)
    air.update({"thigh.L": (0.7, 0, 0), "shin.L": (-1.1, 0, 0), "lift": 0.0, "cape.1": (-1.2, 0, 0),
                "scarf.1": (-1.3, 0, 0)})
    sym(air, "upperarm", (0.4, 0, 1.95))
    return [(0, {}), (4, crouch), (9, up), (14, air)]


def fall(p):
    s = S(TAU * p)
    pose = {
        "spine": (-0.12, 0, 0.05 * s), "head": (-0.2, 0, 0.08 * S(TAU * p + 1)),
        "hood_tip": (-0.7 + 0.15 * S(2 * TAU * p), 0, 0),
        "cape.1": (-1.9 + 0.12 * S(2 * TAU * p), 0, 0), "cape.2": (-0.4 + 0.2 * S(2 * TAU * p + 1), 0, 0),
        "scarf.1": (-2.0, 0, 0.15 * s), "scarf.2": (-0.3 + 0.25 * S(2 * TAU * p + 0.5), 0, 0.2 * s),
        "scarf.3": (0.25 * S(2 * TAU * p + 1.5), 0, 0.25 * S(2 * TAU * p)),
    }
    pose["upperarm.L"], pose["upperarm.R"] = (0.4 + 0.35 * s, 0, 2.05 + 0.25 * s), (0.4 - 0.35 * s, 0, -2.05 + 0.25 * s)
    pose["forearm.L"], pose["forearm.R"] = (0.5 - 0.3 * s, 0, 0), (0.5 + 0.3 * s, 0, 0)
    pose["thigh.L"], pose["thigh.R"] = (0.5 + 0.35 * s, 0, 0.1), (0.5 - 0.35 * s, 0, -0.1)
    pose["shin.L"], pose["shin.R"] = (-0.9 - 0.4 * s, 0, 0), (-0.9 + 0.4 * s, 0, 0)
    return pose


def push(p):
    s = S(TAU * p)
    pose = {
        "hips": (0.2, 0.06 * s, 0), "spine": (0.38, -0.05 * s, 0), "head": (-0.4, 0, 0), "lift": -0.03,
        "hood_tip": (-0.2, 0, 0), "cape.1": (-0.25, 0, 0), "cape.2": (-0.1, 0, 0),
        "scarf.1": (-0.4, 0, 0.05 * s), "scarf.2": (0.05 * S(TAU * p + 1), 0, 0),
    }
    pose["thigh.L"], pose["thigh.R"] = (-0.2 + 0.35 * s, 0, 0), (-0.2 - 0.35 * s, 0, 0)
    pose["shin.L"] = (-0.35 - 0.45 * max(0.0, S(TAU * p + math.pi + 0.5)), 0, 0)
    pose["shin.R"] = (-0.35 - 0.45 * max(0.0, S(TAU * p + 0.5)), 0, 0)
    pose["foot.L"], pose["foot.R"] = (0.3, 0, 0), (0.3, 0, 0)
    sym(pose, "upperarm", (1.25 + 0.05 * s, 0, 0.1))
    sym(pose, "forearm", (0.35, 0, 0))
    sym(pose, "hand", (-0.6, 0, 0))
    return pose


def hit_keys():
    knock = {"hips": (-0.25, 0, 0), "spine": (-0.45, 0, 0.1), "head": (-0.45, 0, -0.15), "lift": -0.02,
             "hood_tip": (0.6, 0, 0), "cape.1": (0.4, 0, 0), "cape.2": (0.2, 0, 0), "scarf.1": (0.3, 0, 0),
             "scarf.2": (0.3, 0, 0)}
    sym(knock, "upperarm", (0.7, 0, 1.0))
    sym(knock, "forearm", (0.6, 0, 0))
    sym(knock, "thigh", (0.45, 0, 0.05))
    sym(knock, "shin", (-0.6, 0, 0))
    sym(knock, "foot", (-0.3, 0, 0))
    dizzy = lambda tilt: {**knock, "spine": (-0.15, 0, tilt * 0.5), "head": (-0.1, 0, tilt), "hips": (-0.05, 0, 0),  # noqa: E731
                          "hood_tip": (-0.1, 0, -tilt * 1.5), "lift": -0.01,
                          **{f"upperarm.{s}": (0.2, 0, 0.5 if s == "L" else -0.5) for s in "LR"}}
    return [(0, {}), (3, knock), (8, dizzy(0.3)), (12, dizzy(-0.25)), (16, dizzy(0.12)), (21, {})]


def celebrate(p):
    s = S(TAU * p)
    hop = max(0.0, s)
    pose = {
        "spine": (-0.12, 0, 0), "head": (-0.25, 0, 0.05 * S(2 * TAU * p)), "lift": 0.09 * hop - 0.01,
        "hood_tip": (-0.3 - 0.25 * hop, 0, 0), "cape.1": (-0.3 - 0.5 * hop, 0, 0), "cape.2": (-0.2 * hop, 0, 0),
        "scarf.1": (-0.4 - 0.5 * hop, 0, 0.1 * s), "scarf.2": (-0.2 * hop, 0, 0.1 * s),
    }
    sym(pose, "upperarm", (0.25, 0, 2.3))
    pose["forearm.L"], pose["forearm.R"] = (0.35 + 0.5 * max(0.0, S(2 * TAU * p)), 0, 0), \
        (0.35 + 0.5 * max(0.0, S(2 * TAU * p + math.pi)), 0, 0)
    sym(pose, "thigh", (0.45 * hop, 0, 0.05))
    sym(pose, "shin", (-0.8 * hop, 0, 0))
    sym(pose, "foot", (0.3 * hop, 0, 0))
    return pose


ANIMATIONS = {
    # nom: (fonction de phase, nombre d'images) ou liste de clés
    "idle": (idle, 60),
    "run": (run, 16),
    "jump": jump_keys(),
    "fall": (fall, 20),
    "push": (push, 32),
    "hit": hit_keys(),
    "celebrate": (celebrate, 30),
}


def apply_pose(rig, pose, frame):
    for pb in rig.pose.bones:
        pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
        pb.keyframe_insert("rotation_euler", frame=frame, group=pb.name)
    hips = rig.pose.bones["hips"]
    hips.location = (0, pose.get("lift", 0.0), 0)  # Y local de « hips » = vers le haut
    hips.keyframe_insert("location", frame=frame, group="hips")


def build_animations(rig):
    rig.animation_data_create()
    actions = {}
    for name, spec in ANIMATIONS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        if isinstance(spec, tuple):
            fn, frames = spec
            for f in range(0, frames + 1, 2 if frames > 20 else 1):
                apply_pose(rig, fn((f % frames) / frames), f)
        else:
            for f, pose in spec:
                apply_pose(rig, pose, f)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, act)
        track.mute = True
        actions[name] = act
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return actions


# --------------------------------------------------------------------------------------------------------------
# Export et aperçus
# --------------------------------------------------------------------------------------------------------------


def export(rig, body):
    for ob in bpy.context.scene.objects:
        ob.select_set(ob in (rig, body))
    bpy.context.view_layer.objects.active = rig
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.normpath(GLB), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_animations=True, export_animation_mode="ACTIONS",
        export_skins=True, export_all_influences=False, export_def_bones=False, export_optimize_animation_size=True,
        export_extras=False, export_cameras=False, export_lights=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "explorer.blend"))


def setup_preview_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 720
    scene.view_settings.view_transform = "Standard"
    scene.render.fps = FPS

    world = bpy.data.worlds.new("preview")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.09, 0.075, 0.06, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world

    floor_me = bpy.data.meshes.new("floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(floor_me)
    floor = bpy.data.objects.new("floor", floor_me)
    fm = bpy.data.materials.new("floor")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.042, 0.035, 1)
    floor_me.materials.append(fm)
    scene.collection.objects.link(floor)

    def light(name, kind, energy, loc, color, size=1.0):
        ld = bpy.data.lights.new(name, kind)
        ld.energy, ld.color = energy, color
        if kind == "AREA":
            ld.size = size
        if kind == "SUN":
            ld.angle = 0.1
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        ob.rotation_euler = (Vector((0, 0, 0.7)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(ob)
    light("key", "SUN", 3.2, (-2.5, -3, 4), (1.0, 0.86, 0.68))
    light("rim", "AREA", 220, (2.2, 3, 2.5), (1.0, 0.7, 0.4), 2.5)
    light("fill", "AREA", 70, (3, -2.5, 1.2), (0.6, 0.7, 1.0), 3)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 60
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0, -4.2, 1.05)
    cam.rotation_euler = (Vector((0, 0, 0.74)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def montage(paths, cols, out):
    """Planche d'images (de gauche à droite, de haut en bas)."""
    import numpy as np
    import OpenImageIO as oiio
    imgs = [oiio.ImageBuf(p).get_pixels(oiio.FLOAT)[:, :, :3] for p in paths]
    h, w = imgs[0].shape[:2]
    rows = math.ceil(len(imgs) / cols)
    sheet_px = np.zeros((rows * h, cols * w, 3), dtype=np.float32)
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols)
        sheet_px[r * h:(r + 1) * h, c * w:(c + 1) * w] = im
    spec = oiio.ImageSpec(cols * w, rows * h, 3, oiio.UINT8)
    buf = oiio.ImageBuf(spec)
    buf.set_pixels(oiio.ROI(0, cols * w, 0, rows * h), sheet_px)
    buf.write(out)
    for p in paths:
        os.remove(p)


def render_previews(rig):
    out = os.path.join(HERE, "previews")
    os.makedirs(out, exist_ok=True)
    setup_preview_scene()
    views = [("face", 0), ("trois-quarts", -35), ("profil", -90), ("dos", 180)]
    paths = []
    for name, deg in views:
        rig.rotation_euler = (0, 0, math.radians(deg))
        paths.append(os.path.join(out, f"_{name}.png"))
        render_to(paths[-1])
    montage(paths, 4, os.path.join(out, "vues.png"))

    rig.rotation_euler = (0, 0, math.radians(-30))
    shots = [("idle", 15), ("run", 4), ("run", 12), ("jump", 4), ("jump", 9), ("fall", 5), ("push", 8),
             ("hit", 3), ("hit", 8), ("celebrate", 7)]
    paths = []
    for name, frame in shots:
        rig.animation_data.action = bpy.data.actions[name]
        bpy.context.scene.frame_set(frame)
        paths.append(os.path.join(out, f"_{name}_{frame}.png"))
        render_to(paths[-1])
    montage(paths, 5, os.path.join(out, "animations.png"))
    rig.animation_data.action = None


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    make_materials()
    build_body()
    build_limbs()
    build_head()
    body = assemble()
    rig = build_armature(body)
    build_animations(rig)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[explorer] triangles: {tris}, sommets: {len(body.data.vertices)}, os: {len(rig.data.bones)}, "
          f"matériaux: {[m.name for m in body.data.materials]}")
    export(rig, body)
    if "--no-render" not in ARGS:
        render_previews(rig)


if __name__ == "__main__":
    main()
