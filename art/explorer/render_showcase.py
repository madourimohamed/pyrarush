"""Images de présentation de l'explorateur (à lancer après build_explorer.py).

    blender -b --factory-startup --python art/explorer/render_showcase.py

Produit dans previews/ : portrait.png (gros plan), couleurs.png (couleurs du multijoueur), course.png (cycle de course).
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_explorer as bx  # noqa: E402

OUT = os.path.join(HERE, "previews")
# Joueur (bleu) puis adversaires (src/client/multiplayer/opponent.ts).
PLAYER_COLORS = [0x2F5FB0, 0xD8402E, 0x2E9E4F, 0xE0A020, 0x8A3AD0, 0x20A8B8]


def set_pose(rig, pose):
    for pb in rig.pose.bones:
        pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
        pb.location = (0, 0, 0)
    rig.pose.bones["hips"].location = (0, pose.get("lift", 0.0), 0)


def aim(cam, loc, target, lens):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens


def render(path, w, h, samples):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.cycles.samples = samples
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "explorer.blend"))
    rig, body = bpy.data.objects["explorer_rig"], bpy.data.objects["explorer"]
    rig.animation_data.action = None
    scene = bx.setup_preview_scene()
    cam = scene.camera

    # Portrait : trois-quarts, cadré sur la tête et le buste.
    set_pose(rig, bx.idle(0.25))
    rig.rotation_euler = (0, 0, math.radians(-28))
    aim(cam, (0.0, -3.0, 1.15), (0.0, 0.0, 0.88), 80)
    render(os.path.join(OUT, "portrait.png"), 1200, 1200, 64)

    # Couleurs du multijoueur : six explorateurs en pleine course, phases décalées.
    riders = [(rig, body)]
    for i in range(1, len(PLAYER_COLORS)):
        r, b = rig.copy(), body.copy()
        scene.collection.objects.link(r)
        scene.collection.objects.link(b)
        b.parent = r
        b.modifiers["rig"].object = r
        riders.append((r, b))
    for i, ((r, b), color) in enumerate(zip(riders, PLAYER_COLORS)):
        slot = next(s for s in b.material_slots if s.material and s.material.name.startswith("scarf"))
        mat = bpy.data.materials["scarf"].copy()
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = bx.srgb(color)
        slot.link = "OBJECT"
        slot.material = mat
        r.location = ((i - 2.5) * 0.78, 0, 0)
        r.rotation_euler = (0, 0, math.radians(62))
        set_pose(r, bx.run(i / len(PLAYER_COLORS)))
    aim(cam, (0.0, -6.6, 1.25), (0.0, 0.0, 0.72), 50)
    render(os.path.join(OUT, "couleurs.png"), 2400, 900, 48)
    for r, b in riders[1:]:
        bpy.data.objects.remove(b)
        bpy.data.objects.remove(r)

    # Cycle de course vu de profil, 8 images.
    rig.location = (0, 0, 0)
    rig.rotation_euler = (0, 0, math.radians(90))
    aim(cam, (0.0, -4.2, 1.05), (0.0, 0.0, 0.74), 60)
    paths = []
    for k in range(8):
        set_pose(rig, bx.run(k / 8))
        paths.append(os.path.join(OUT, f"_course_{k}.png"))
        render(paths[-1], 560, 560, 32)
    bx.montage(paths, 4, os.path.join(OUT, "course.png"))


main()
