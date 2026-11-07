# Blender headless: add metric box-projected UVs to a GLB that lacks them.
# Usage: blender -b --factory-startup -P scripts/blender_add_uvs.py -- in.glb out.glb
# UV space ends up in metres (1 UV unit = 1 m), so fabric textures can be tiled
# at a real-world repeat size from the web viewer (sampler scale).
import bpy, sys

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Bake object scale so cube projection is in true metres.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # Source is a triangle soup (every tri has its own verts): weld it.
    bpy.ops.mesh.remove_doubles(threshold=0.0002)
    bpy.ops.uv.cube_project(cube_size=2.0, correct_aspect=True,
                            clip_to_bounds=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Smooth shading with hard edges above 35 deg (cushions smooth, frame crisp).
    bpy.ops.object.shade_smooth_by_angle(angle=0.61)
    print(f"UV added: {obj.name} ({len(me.polygons)} faces)")

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                          export_texcoords=True, export_normals=True,
                          export_apply=True, export_yup=True)
print("EXPORTED", dst)
