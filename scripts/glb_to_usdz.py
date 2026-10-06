import bpy
import sys
import os

input_glb = os.path.abspath("assets/models/appu_photoframe.glb")
output_usdz = os.path.abspath("assets/models/appu_photoframe.usdz")

print(f"Converting {input_glb} -> {output_usdz}")

# Clear existing objects in default scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import GLB
bpy.ops.import_scene.gltf(filepath=input_glb)

# Export USDZ
bpy.ops.wm.usd_export(
    filepath=output_usdz,
    generate_preview_surface=True,
    export_materials=True,
    export_uvmaps=True,
    export_normals=True
)

if os.path.exists(output_usdz):
    size_mb = os.path.getsize(output_usdz) / (1024 * 1024)
    print(f"SUCCESS: Exported USDZ ({size_mb:.2f} MB) to {output_usdz}")
else:
    print(f"ERROR: Failed to export {output_usdz}")
    sys.exit(1)
