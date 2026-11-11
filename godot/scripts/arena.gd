class_name Arena
extends Node3D
## The Whispering Meadow: sky, sun, rolling ground, grass that moves in the wind, and the trees, rocks and
## buildings around the ring. Fighters can walk R metres from the centre.

const R := 22.0
const SPAWNS := [{"x": 0.0, "z": -4.5, "yaw": 0.0}, {"x": 0.0, "z": 4.5, "yaw": PI}]

const GROUND_SHADER := """
shader_type spatial;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
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
	vec3 grass = mix(vec3(0.09, 0.19, 0.04), vec3(0.20, 0.32, 0.08), n);
	vec3 dirt = mix(vec3(0.20, 0.15, 0.09), vec3(0.33, 0.26, 0.16), m);
	// a worn patch of earth in the middle of the ring, where the fighting happens
	float worn = smoothstep(6.0, 2.0, length(wpos.xz) + (n - 0.5) * 4.0);
	ALBEDO = mix(grass, dirt, worn * 0.85) * (0.8 + m * 0.4);
	ROUGHNESS = 0.95;
}
"""

const GRASS_SHADER := """
shader_type spatial;
render_mode cull_disabled;
uniform vec3 fighter_a;
uniform vec3 fighter_b;
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
	ALBEDO = mix(vec3(0.07, 0.16, 0.03), vec3(0.30, 0.44, 0.12), tip) * COLOR.rgb;
	ROUGHNESS = 0.9;
	BACKLIGHT = vec3(0.25, 0.3, 0.1);
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
	var gm := ShaderMaterial.new(); var gs := Shader.new(); gs.code = GROUND_SHADER; gm.shader = gs; gm.set_shader_parameter("noise_tex", noise); gm.set_shader_parameter("ring", R)
	ground.material_override = gm; ground.extra_cull_margin = 40.0; add_child(ground)
	_grass()
	_scenery()

func _sky() -> void:
	var we := WorldEnvironment.new(); env = Environment.new()
	var sky := Sky.new()
	var hdr := "res://sky/sky.hdr"
	if ResourceLoader.exists(hdr):
		# a real photographed sky, if one has been added to the project
		var pan := PanoramaSkyMaterial.new(); pan.panorama = load(hdr); sky.sky_material = pan
	else:
		var mat := ProceduralSkyMaterial.new()
		mat.sky_top_color = Color(0.20, 0.42, 0.78); mat.sky_horizon_color = Color(0.80, 0.86, 0.90); mat.sky_curve = 0.12
		mat.ground_bottom_color = Color(0.22, 0.30, 0.16); mat.ground_horizon_color = Color(0.70, 0.78, 0.76)
		mat.sun_angle_max = 12.0; mat.sun_curve = 0.08
		sky.sky_material = mat
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.9
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.tonemap_white = 6.0
	env.fog_enabled = true; env.fog_light_color = Color(0.72, 0.80, 0.86); env.fog_density = 0.003; env.fog_sky_affect = 0.0
	env.glow_enabled = true; env.glow_intensity = 0.5; env.glow_bloom = 0.05; env.glow_hdr_threshold = 1.1
	we.environment = env; add_child(we)
	sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-46, 145, 0); sun.light_energy = 1.25; sun.light_color = Color(1.0, 0.93, 0.80)
	sun.shadow_enabled = true; sun.directional_shadow_max_distance = 45.0; sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS; sun.shadow_blur = 1.5
	add_child(sun)

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
	var rng := RandomNumberGenerator.new(); rng.seed = 7
	var count := 150000
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = blade; mm.instance_count = count
	for i in count:
		# thick near the ring, thinning out toward the hills; sparse on the worn earth in the middle
		var r := sqrt(rng.randf()) * (R + 7.0)
		if r < 5.0 and rng.randf() > r / 5.0 * 0.6: r = 5.0 + rng.randf() * (R + 2.0)
		var a := rng.randf() * TAU
		var h := 0.14 + rng.randf() * 0.22
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(1.0 + rng.randf(), h, 1.0))
		mm.set_instance_transform(i, Transform3D(b, Vector3(sin(a) * r, height_at(sin(a) * r, cos(a) * r), cos(a) * r)))
		var tint := 0.75 + rng.randf() * 0.5
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

func _scenery() -> void:
	var tree: PackedScene = load("res://scenery/tree_broadleaf.glb")
	var tree_mid: PackedScene = load("res://scenery/tree_broadleaf_mid.glb")
	var rock: PackedScene = load("res://scenery/boulders.glb")
	var hut: PackedScene = load("res://scenery/hut.glb")
	var pavilion: PackedScene = load("res://scenery/pavilion.glb")
	for i in 30:
		var a := (float(i) / 30) * TAU + _hash(i * 4.1) * 0.25
		var d := R + 6 + _hash(i * 6.3) * (16.0 if i % 3 else 55.0)
		_place(tree if d < R + 12 else tree_mid, sin(a) * d, cos(a) * d, _hash(i * 2.3) * TAU, 10 + _hash(i * 8.7) * 7, -0.25, d < 50)
	for i in 16:
		var a := _hash(i * 5.7 + 1) * TAU
		var d := R + 3 + _hash(i * 3.1) * 50
		_place(rock, sin(a) * d, cos(a) * d, _hash(i * 9.9) * TAU, 1.2 + _hash(i * 2.7) * 3.2, -0.2, d < 45)
	_place(pavilion, -27, 22, 2.2, 7.5, -0.3)
	_place(hut, 30, 27, -2.3, 6, -0.3); _place(hut, 38, 16, -1.2, 5.4, -0.3); _place(hut, -34, -24, 0.9, 6, -0.3); _place(hut, 21, -38, 2.6, 5.6, -0.3)

func set_fighters(a: Vector3, b: Vector3) -> void:
	grass_mat.set_shader_parameter("fighter_a", a); grass_mat.set_shader_parameter("fighter_b", b)

## "Low" is for phones that struggle: a third of the grass, no shadows, and the 3D picture drawn a little smaller.
func set_quality(low: bool) -> void:
	grass.visible_instance_count = 50000 if low else -1
	sun.shadow_enabled = not low
	get_viewport().scaling_3d_scale = 0.7 if low else 1.0
