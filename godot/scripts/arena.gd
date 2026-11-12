class_name Arena
extends Node3D
## The Whispering Meadow: sky, sun, rolling ground, grass that moves in the wind, and the trees, rocks and
## buildings around the ring. Fighters can walk R metres from the centre.

## Which arena this is: "storm" (Stormfield: dark sky, low warm light, trampled grass and mud, mist) or "meadow" (the bright one).
var look := "storm"
const R := 22.0
const SPAWNS := [{"x": 0.0, "z": -4.5, "yaw": 0.0}, {"x": 0.0, "z": 4.5, "yaw": PI}]

const GROUND_SHADER := """
shader_type spatial;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D dirt_tex : source_color, repeat_enable, filter_linear_mipmap_anisotropic;
uniform float ring = 22.0;
varying vec3 wpos;
float height(vec2 p) {
	float r = length(p);
	float n = texture(noise_tex, p * 0.004 + vec2(0.31, 0.72)).r;
	float fine = texture(noise_tex, p * 0.02).r;
	return smoothstep(ring + 1.5, ring + 34.0, r) * (1.5 + n * 16.0) + smoothstep(ring + 2.0, ring + 10.0, r) * (fine - 0.5) * 1.4;
}
void vertex() {
	vec2 p = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	VERTEX.y = height(p);
	float e = 1.5;
	NORMAL = normalize(vec3(height(p - vec2(e, 0.0)) - height(p + vec2(e, 0.0)), 2.0 * e, height(p - vec2(0.0, e)) - height(p + vec2(0.0, e))));
	wpos = vec3(p.x, VERTEX.y, p.y);
}
void fragment() {
	float n = texture(noise_tex, wpos.xz * 0.03).r;
	float m = texture(noise_tex, wpos.xz * 0.25).r;
	float patch = texture(noise_tex, wpos.xz * 0.011 + vec2(0.5, 0.2)).r;
	vec3 grass = mix(vec3(0.03, 0.105, 0.012), vec3(0.085, 0.235, 0.03), clamp(n * 0.7 + patch * 0.6 - 0.15, 0.0, 1.0));
	vec3 dirt = texture(dirt_tex, wpos.xz * 0.22).rgb * vec3(0.8, 0.72, 0.6);
	// a worn patch of earth in the middle of the ring, where the fighting happens
	float worn = smoothstep(5.0, 1.5, length(wpos.xz) + (n - 0.5) * 4.0);
	// fine grain from noise. (A moss photo was tried here: it is a sheet of separate fronds, and printed fern shapes all over the lawn.)
	float grain = 0.82 + m * 0.36;
	ALBEDO = mix(grass * grain * 1.2, dirt, worn * 0.75);
	ROUGHNESS = 0.95;
}
"""

const STORM_GROUND_SHADER := """
shader_type spatial;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D ground_tex : source_color, repeat_enable, filter_linear_mipmap_anisotropic;
uniform float ring = 22.0;
varying vec3 wpos;
float height(vec2 p) {
	float r = length(p);
	float n = texture(noise_tex, p * 0.004 + vec2(0.31, 0.72)).r;
	float fine = texture(noise_tex, p * 0.02).r;
	return smoothstep(ring + 1.5, ring + 34.0, r) * (1.5 + n * 16.0) + smoothstep(ring + 2.0, ring + 10.0, r) * (fine - 0.5) * 1.4;
}
void vertex() {
	vec2 p = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	VERTEX.y = height(p);
	float e = 1.5;
	NORMAL = normalize(vec3(height(p - vec2(e, 0.0)) - height(p + vec2(e, 0.0)), 2.0 * e, height(p - vec2(0.0, e)) - height(p + vec2(0.0, e))));
	wpos = vec3(p.x, VERTEX.y, p.y);
}
void fragment() {
	// the painted ground, laid at two sizes and mixed so that its repeats do not show
	vec3 near_t = texture(ground_tex, wpos.xz * 0.17).rgb;
	vec3 far_t = texture(ground_tex, wpos.zx * 0.045 + vec2(0.37, 0.11)).rgb;
	vec3 turf = mix(near_t, far_t, 0.4) * vec3(2.6, 3.0, 3.6);
	float n = texture(noise_tex, wpos.xz * 0.03).r;
	// churned mud where the fighting happens
	float worn = smoothstep(6.5, 2.0, length(wpos.xz) + (n - 0.5) * 4.5);
	vec3 mud = vec3(0.2, 0.165, 0.13) * (0.55 + dot(near_t, vec3(0.33)) * 2.6);
	ALBEDO = mix(turf, mud, worn * 0.85);
	ROUGHNESS = mix(0.95, 0.75, worn);
	// no glare off the turf when looking toward the low sun; the churned mud keeps a faint wet sheen
	SPECULAR = mix(0.03, 0.22, worn);
}
"""

const GRASS_SHADER := """
shader_type spatial;
render_mode cull_disabled;
uniform vec3 fighter_a;
uniform vec3 fighter_b;
uniform vec3 root_col = vec3(0.04, 0.14, 0.018);
uniform vec3 tip_col = vec3(0.19, 0.42, 0.06);
varying float tip;
void vertex() {
	tip = UV.y;
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 root = MODEL_MATRIX[3].xyz;
	// wind: slow rolling gusts plus a quick flutter, stronger toward the tip of the blade
	float gust = sin(root.x * 0.18 + TIME * 1.3) * cos(root.z * 0.13 + TIME * 0.9);
	float flutter = sin(root.x * 2.1 + root.z * 1.7 + TIME * 5.0) * 0.25;
	vec2 push = vec2(0.22, 0.12) * (gust + flutter + 0.35);
	// blades lean away from a fighter standing in them
	vec2 da = root.xz - fighter_a.xz; vec2 db = root.xz - fighter_b.xz;
	push += normalize(da + 0.001) * smoothstep(1.1, 0.2, length(da)) * 0.5 + normalize(db + 0.001) * smoothstep(1.1, 0.2, length(db)) * 0.5;
	w.xz += push * tip * tip;
	w.y -= dot(push, push) * tip * 0.6;
	VERTEX = (inverse(MODEL_MATRIX) * vec4(w, 1.0)).xyz;
	NORMAL = vec3(0.0, 1.0, 0.0);
}
void fragment() {
	ALBEDO = mix(root_col, tip_col, tip) * COLOR.rgb;
	// lit as if every blade faced the sky, front and back alike, so the lawn reads as one soft surface instead of dark spikes
	NORMAL = normalize((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	ROUGHNESS = 0.9;
}
"""

var grass_mat: ShaderMaterial
var noise_img: Image
var grass: MultiMesh
var sun: DirectionalLight3D

func _noise(u: float, v: float) -> float:
	var x := fposmod(u, 1.0) * 512.0 - 0.5
	var y := fposmod(v, 1.0) * 512.0 - 0.5
	var x0 := int(floor(x)); var y0 := int(floor(y))
	var fx := x - x0; var fy := y - y0
	var a := noise_img.get_pixel(posmod(x0, 512), posmod(y0, 512)).r
	var b := noise_img.get_pixel(posmod(x0 + 1, 512), posmod(y0, 512)).r
	var c := noise_img.get_pixel(posmod(x0, 512), posmod(y0 + 1, 512)).r
	var d := noise_img.get_pixel(posmod(x0 + 1, 512), posmod(y0 + 1, 512)).r
	return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fy)

## How high the ground is at (x, z). The same sum the ground shader does, so things stand on the hills, not in them.
func height_at(x: float, z: float) -> float:
	var r := sqrt(x * x + z * z)
	if r < R + 1.5: return 0.0
	var n := _noise(x * 0.004 + 0.31, z * 0.004 + 0.72)
	var fine := _noise(x * 0.02, z * 0.02)
	return smoothstep(R + 1.5, R + 34.0, r) * (1.5 + n * 16.0) + smoothstep(R + 2.0, R + 10.0, r) * (fine - 0.5) * 1.4
var env: Environment

func _ready() -> void:
	_sky()
	var fn := FastNoiseLite.new(); fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH; fn.frequency = 0.012; fn.fractal_octaves = 4
	noise_img = fn.get_seamless_image(512, 512); noise_img.convert(Image.FORMAT_L8)
	var with_mips := noise_img.duplicate() as Image; with_mips.generate_mipmaps()
	var noise := ImageTexture.create_from_image(with_mips)
	var ground := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(420, 420); pm.subdivide_width = 160; pm.subdivide_depth = 160; ground.mesh = pm
	var gm := ShaderMaterial.new(); var gs := Shader.new(); gs.code = STORM_GROUND_SHADER if look == "storm" else GROUND_SHADER; gm.shader = gs
	if look == "storm": gm.set_shader_parameter("ground_tex", load("res://textures/storm_ground.jpg"))
	gm.set_shader_parameter("noise_tex", noise); gm.set_shader_parameter("dirt_tex", load("res://textures/dirt_color.jpg")); gm.set_shader_parameter("ring", R)
	ground.material_override = gm; ground.extra_cull_margin = 40.0; add_child(ground)
	_grass()
	_scenery()

func _sky() -> void:
	var we := WorldEnvironment.new(); env = Environment.new()
	var sky := Sky.new()
	if look == "storm":
		_storm_sky(we, sky)
		return
	var hdr := "res://sky/sky.hdr"
	# where the sun should stand: behind and to one side of the player at the start of a round, so fighters are lit from the front
	var sun_dir := Basis.from_euler(Vector3(deg_to_rad(-48), deg_to_rad(145), 0)) * Vector3(0, 0, 1)
	if ResourceLoader.exists(hdr):
		# a photographed sky (Poly Haven "Kloofendal 48d Partly Cloudy", CC0). Its sun sits 36 degrees round from the middle
		# of the picture and 48 degrees up; the sky is turned so that the sun in the picture is where the light comes from.
		var pan := PanoramaSkyMaterial.new(); pan.panorama = load(hdr); sky.sky_material = pan
		var phi := deg_to_rad(35.9)
		var in_photo := Vector3(sin(phi), 0, -cos(phi))
		env.sky_rotation = Vector3(0, (atan2(sun_dir.x, sun_dir.z) - atan2(in_photo.x, in_photo.z)) * float(OS.get_environment("DUEL_SKYSIGN") if OS.get_environment("DUEL_SKYSIGN") != "" else "1"), 0)
		env.background_energy_multiplier = 1.9
	else:
		var mat := ProceduralSkyMaterial.new()
		mat.sky_top_color = Color(0.20, 0.42, 0.78); mat.sky_horizon_color = Color(0.80, 0.86, 0.90); mat.sky_curve = 0.12
		mat.ground_bottom_color = Color(0.22, 0.30, 0.16); mat.ground_horizon_color = Color(0.70, 0.78, 0.76)
		sky.sky_material = mat
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.62
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC; env.tonemap_white = 4.0
	# the look: a clear, vivid summer day. Strong colour, deep shadows, almost no haze.
	env.adjustment_enabled = true; env.adjustment_contrast = 1.12; env.adjustment_saturation = 1.16
	env.fog_enabled = true; env.fog_light_color = Color(0.55, 0.72, 0.95); env.fog_density = 0.0011; env.fog_sky_affect = 0.0
	env.glow_enabled = true; env.glow_intensity = 0.5; env.glow_bloom = 0.05; env.glow_hdr_threshold = 1.1
	we.environment = env; add_child(we)
	sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-48, 145, 0); sun.light_energy = 1.75; sun.light_color = Color(1.0, 0.94, 0.80)
	sun.shadow_enabled = true; sun.directional_shadow_max_distance = 60.0; sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS; sun.shadow_blur = 0.8
	add_child(sun)

## Stormfield: a painted storm sky with the light breaking through low on one side, warm and weak, long shadows, mist.
func _storm_sky(we: WorldEnvironment, sky: Sky) -> void:
	var pan := PanoramaSkyMaterial.new(); pan.panorama = load("res://sky/storm.jpg"); sky.sky_material = pan
	# In the painting the light breaks through 19 degrees left of centre, 25 degrees up. The sky is turned to put that break
	# behind the far side of the ring, so the fighters are edged with light and their shadows reach toward the camera.
	var sun_dir := Basis.from_euler(Vector3(deg_to_rad(-25), deg_to_rad(-20), 0)) * Vector3(0, 0, 1)
	var phi := deg_to_rad(-19.4)
	var in_photo := Vector3(sin(phi), 0, -cos(phi))
	env.sky_rotation = Vector3(0, atan2(sun_dir.x, sun_dir.z) - atan2(in_photo.x, in_photo.z), 0)
	env.background_mode = Environment.BG_SKY; env.sky = sky; env.background_energy_multiplier = 1.0
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.5, 0.56, 0.66); env.ambient_light_energy = 0.8
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC; env.tonemap_white = 3.5
	env.adjustment_enabled = true; env.adjustment_contrast = 1.14; env.adjustment_saturation = 0.78
	env.fog_enabled = true; env.fog_light_color = Color(0.37, 0.39, 0.41); env.fog_density = 0.014; env.fog_sky_affect = 0.0
	env.glow_enabled = true; env.glow_intensity = 0.6; env.glow_bloom = 0.08; env.glow_hdr_threshold = 0.95
	we.environment = env; add_child(we)
	sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-25, -20, 0); sun.light_energy = 1.05; sun.light_color = Color(1.0, 0.87, 0.7)
	sun.shadow_enabled = true; sun.directional_shadow_max_distance = 48.0; sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL; sun.directional_shadow_pancake_size = 80.0; sun.shadow_blur = 1.2
	add_child(sun)
	# a weak cool light from the camera's side, so faces and armour are not lost in shadow
	var fill := DirectionalLight3D.new(); fill.rotation_degrees = Vector3(-35, 165, 0); fill.light_energy = 0.45; fill.light_color = Color(0.7, 0.78, 0.95); add_child(fill)

func _grass() -> void:
	# one blade: a tapering strip three segments tall
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rows := 3
	for i in rows - 1:
		var y0 := float(i) / (rows - 1)
		var y1 := float(i + 1) / (rows - 1)
		var w0 := 0.016 * (1.0 - y0 * 0.9)
		var w1 := 0.016 * (1.0 - y1 * 0.9)
		var quad := [Vector3(-w0, y0, 0), Vector3(w0, y0, 0), Vector3(w1, y1, 0), Vector3(-w0, y0, 0), Vector3(w1, y1, 0), Vector3(-w1, y1, 0)]
		for v in quad:
			st.set_uv(Vector2(0.5, v.y)); st.add_vertex(v)
	var blade := st.commit()
	grass_mat = ShaderMaterial.new(); var sh := Shader.new(); sh.code = GRASS_SHADER; grass_mat.shader = sh
	if look == "storm":
		grass_mat.set_shader_parameter("root_col", Vector3(0.03, 0.036, 0.02)); grass_mat.set_shader_parameter("tip_col", Vector3(0.13, 0.15, 0.065))
	var rng := RandomNumberGenerator.new(); rng.seed = 7
	var count := 90000 if look == "storm" else 110000
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = blade; mm.instance_count = count
	for i in count:
		# thick near the ring, thinning out toward the hills; sparse on the worn earth in the middle
		var r := sqrt(rng.randf()) * (R + 7.0)
		if r < 5.0 and rng.randf() > r / 5.0 * 0.6: r = 5.0 + rng.randf() * (R + 2.0)
		var a := rng.randf() * TAU
		var h := 0.09 + rng.randf() * 0.17
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(1.0 + rng.randf(), h, 1.0))
		mm.set_instance_transform(i, Transform3D(b, Vector3(sin(a) * r, height_at(sin(a) * r, cos(a) * r), cos(a) * r)))
		var tint := 0.8 + rng.randf() * 0.35
		mm.set_instance_color(i, Color(tint, tint * (0.95 + rng.randf() * 0.1), tint * 0.9))
	grass = mm
	var inst := MultiMeshInstance3D.new(); inst.multimesh = mm; inst.material_override = grass_mat
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(inst)

## Put a copy of a model at (x, z), turned and scaled so that it stands `height` metres tall.
func _place(scene: PackedScene, x: float, z: float, turn: float, height: float, y := 0.0, shadow := true) -> void:
	var n: Node3D = scene.instantiate()
	var box := AABB()
	var first := true
	for m in n.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		var b: AABB = _local(n, mi) * mi.get_aabb()
		box = b if first else box.merge(b); first = false
		if not shadow: mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var k: float = height / max(box.size.y, 0.001)
	n.scale = Vector3.ONE * k; n.rotation.y = turn
	n.position = Vector3(x, height_at(x, z) + y - box.position.y * k, z)
	add_child(n)

func _local(root: Node3D, node: Node3D) -> Transform3D:
	var t := Transform3D.IDENTITY
	var cur: Node = node
	while cur != root and cur is Node3D:
		t = (cur as Node3D).transform * t; cur = cur.get_parent()
	return t

func _hash(v: float) -> float:
	return fposmod(sin(v * 127.1) * 43758.5453, 1.0)

## Darken a model's own colours (Stormfield's trees and buildings sit under a storm sky). Done once per model file.
var _tinted := {}
func _tint(scene: PackedScene, tint: Color) -> PackedScene:
	if _tinted.has(scene): return scene
	_tinted[scene] = true
	var n: Node = scene.instantiate()
	for m in n.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = (m as MeshInstance3D).mesh
		for i in mesh.get_surface_count():
			var mat := mesh.surface_get_material(i) as BaseMaterial3D
			if mat: mat.albedo_color = tint
	n.free()
	return scene

func _storm_scenery() -> void:
	var tree: PackedScene = _tint(load("res://scenery/tree_broadleaf.glb"), Color(0.42, 0.45, 0.38))
	var tree_mid: PackedScene = _tint(load("res://scenery/tree_broadleaf_mid.glb"), Color(0.42, 0.45, 0.38))
	var rock: PackedScene = _tint(load("res://scenery/boulders.glb"), Color(0.6, 0.6, 0.56))
	var hut: PackedScene = _tint(load("res://scenery/hut.glb"), Color(0.72, 0.68, 0.6))
	var pavilion: PackedScene = _tint(load("res://scenery/pavilion.glb"), Color(0.75, 0.62, 0.58))
	# old oaks ringing the ring, more on the hills behind
	for i in 18:
		var a := (float(i) / 18) * TAU + _hash(i * 4.1) * 0.3
		var d := R + 3.5 + _hash(i * 6.3) * 13.0
		_place(tree, sin(a) * d, cos(a) * d, _hash(i * 2.3) * TAU, 11 + _hash(i * 8.7) * 6, -0.25)
	for i in 34:
		var a := _hash(i * 3.7 + 9) * TAU
		var d := 44.0 + _hash(i * 5.1 + 2) * 80.0
		_place(tree_mid, sin(a) * d, cos(a) * d, _hash(i * 1.9) * TAU, 11 + _hash(i * 7.3) * 7, -0.3, false)
	for i in 22:
		var a := _hash(i * 5.7 + 1) * TAU
		var d := 8.0 + _hash(i * 3.1) * 34.0
		_place(rock, sin(a) * d, cos(a) * d, _hash(i * 9.9) * TAU, 0.35 + _hash(i * 2.7) * (0.5 if d < R else 2.4), -0.1, d > R)
	# the cottage back left and the shrine back right, as in the picture this arena was made from
	_place(hut, 17, 22, -2.6, 6.5, -0.3)
	_place(pavilion, -18, 20, 2.4, 7.5, -0.3)

func _scenery() -> void:
	if look == "storm":
		_storm_scenery()
		return
	var N := "res://scenery/nature/"
	var trees: Array = [1, 2, 3, 4, 5].map(func(i): return load(N + "CommonTree_%d.gltf" % i))
	var rock: PackedScene = load("res://scenery/boulders.glb")
	var hut: PackedScene = load("res://scenery/hut.glb")
	var pavilion: PackedScene = load("res://scenery/pavilion.glb")
	# leafy trees ringing the meadow (they throw the long shadows across the grass) ...
	for i in 24:
		var a := (float(i) / 24) * TAU + _hash(i * 4.1) * 0.22
		var d := R + 4.5 + _hash(i * 6.3) * 12.0
		_place(trees[i % 5], sin(a) * d, cos(a) * d, _hash(i * 2.3) * TAU, 9.5 + _hash(i * 8.7) * 5.0, -0.15)
	# ... and scattered over the hills behind, where they only need to read as trees
	for i in 60:
		var a := _hash(i * 3.7 + 9) * TAU
		var d := 44.0 + _hash(i * 5.1 + 2) * 95.0
		_place(trees[(i * 3) % 5], sin(a) * d, cos(a) * d, _hash(i * 1.9) * TAU, 10 + _hash(i * 7.3) * 7, -0.3, false)
	for i in 10:
		var a := _hash(i * 5.7 + 1) * TAU
		var d := R + 3 + _hash(i * 3.1) * 40
		_place(rock, sin(a) * d, cos(a) * d, _hash(i * 9.9) * TAU, 1.2 + _hash(i * 2.7) * 2.6, -0.2, d < 45)
	_place(pavilion, -27, 22, 2.2, 7.5, -0.3)
	_place(hut, 30, 27, -2.3, 6, -0.3); _place(hut, 38, 16, -1.2, 5.4, -0.3); _place(hut, -34, -24, 0.9, 6, -0.3); _place(hut, 21, -38, 2.6, 5.6, -0.3)
	var bush_f: PackedScene = load(N + "Bush_Common_Flowers.gltf")
	for i in 34:
		var a := _hash(i * 2.9 + 4) * TAU
		var d := R + 1.5 + _hash(i * 4.3 + 1) * 16.0
		_place(bush_f, sin(a) * d, cos(a) * d, _hash(i * 6.1) * TAU, 1.0 + _hash(i * 3.3) * 1.3, -0.1, d < R + 10)
	# low things strewn through the lawn: tufts of longer grass, clover, and drifts of flowers
	_strew(N + "Flower_3_Group.gltf", 90, 7.0, R + 10.0, 0.35, 0.6, 15, true)
	_strew(N + "Flower_4_Group.gltf", 60, 7.0, R + 10.0, 0.35, 0.6, 16, true)

var strewn: Array[MultiMesh] = []

## Scatter many copies of one small model over the ground between two distances from the centre, each `lo` to `hi` metres tall.
## `drifts` gathers them into patches, the way flowers grow.
func _strew(path: String, count: int, near: float, far: float, lo: float, hi: float, seed_value: int, drifts := false, tint := Color.WHITE) -> void:
	var scene: Node3D = (load(path) as PackedScene).instantiate()
	var rng := RandomNumberGenerator.new(); rng.seed = seed_value
	for found in scene.find_children("*", "MeshInstance3D", true, false):
		var src := found as MeshInstance3D
		var box := src.get_aabb()
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = src.mesh; mm.instance_count = count
		var local := _local(scene, src)
		var r2 := RandomNumberGenerator.new(); r2.seed = seed_value      # the same places for every part of the model
		var centre := Vector2.ZERO
		for i in count:
			if not drifts or i % 9 == 0:
				var a := r2.randf() * TAU
				var d := sqrt(lerpf(near * near, far * far, r2.randf()))
				centre = Vector2(sin(a) * d, cos(a) * d)
			var p := centre + (Vector2(r2.randf() - 0.5, r2.randf() - 0.5) * 2.4 if drifts else Vector2.ZERO)
			var k: float = lerpf(lo, hi, r2.randf()) / max(box.size.y, 0.01)
			var t := Transform3D(Basis(Vector3.UP, r2.randf() * TAU).scaled(Vector3.ONE * k), Vector3(p.x, height_at(p.x, p.y), p.y)) * local
			mm.set_instance_transform(i, t)
		var inst := MultiMeshInstance3D.new(); inst.multimesh = mm
		if tint != Color.WHITE:
			# the pack's grass is painted with autumn-yellow tips; tint it to sit in a summer lawn
			var mat := (src.mesh.surface_get_material(0) as BaseMaterial3D).duplicate() as BaseMaterial3D
			mat.albedo_color = tint; inst.material_override = mat
		inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(inst); strewn.append(mm)
	scene.free()

func set_fighters(a: Vector3, b: Vector3) -> void:
	grass_mat.set_shader_parameter("fighter_a", a); grass_mat.set_shader_parameter("fighter_b", b)

## "Low" is for phones that struggle: a third of the grass, no shadows, and the 3D picture drawn a little smaller.
func set_quality(low: bool) -> void:
	grass.visible_instance_count = 35000 if low else -1
	for mm in strewn: mm.visible_instance_count = mm.instance_count / 3 if low else -1
	sun.shadow_enabled = not low
	get_viewport().scaling_3d_scale = 0.7 if low else 1.0
