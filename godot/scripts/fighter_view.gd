class_name FighterView
extends Node3D
## One fighter on screen: the body, the weapon in its hand, and the pose for whatever the rules say it is doing.
## The pose is blended by hand from the shared clips (see Clips.table), each held at an exact moment, the same way
## build 20 did it: a swing follows the rules' clock, so what you see is exactly when the hit lands.

const MODELS := {"sun_warlord": "res://models/aurelian.glb", "varek": "res://models/varek.glb", "wuixi": "res://models/wuixi.glb"}
const FOCUS_GLOW := Color(0.25, 0.6, 1.0)

var def: Dictionary
var weapon: Dictionary
var skeleton: Skeleton3D
var bone_ids: PackedInt32Array
var clips: Dictionary
var weights := {}      # clip name -> how much of it is showing (0 to 1)
var times := {}        # clip name -> the moment of the clip being shown
var started := false
var last_state := ""
var last_t := 0.0
var flinch := "Hit_Reaction_1"
var hop := false
var cheer := false
var focus_mix := 0.0
var clock := 0.0
var blade_mat: StandardMaterial3D
var base_emission := Color.BLACK
var held: Node3D
var dropped: Node3D
var aura: MeshInstance3D
var tilt: Node3D
var glow_light: OmniLight3D
var trail: MeshInstance3D
var trail_pts: Array = []        # [base, tip, age] of the blade over the last moments of a swing
var tip_y := 1.05
var set_kind := "HumanM_"     # which body the movement clips were made for
var stride := 0.0               # where in the step cycle the legs are, 0 to 1; shared by every movement clip so feet stay in time
## How a fighter stands, guards and flinches with each kind of weapon. `guard` is [clip, moment to hold]; a moment of -1 plays it as a loop.
const STYLES := {
	"sword": {"stance": "KBS_Ready_Idle_001", "guard": ["Sword_Parry_Backward", 0.4], "flinch": ["Hit_Reaction_1", "Hit_Reaction_to_Waist", "Hit_Chest", "Hit_Head"], "tip": 1.05},
	"sword_shield": {"stance": "ss_sword_and_shield_idle", "guard": ["ss_sword_and_shield_block_idle", -1.0], "flinch": ["ss_sword_and_shield_impact", "ss_sword_and_shield_impact_2", "ss_sword_and_shield_impact_3"], "tip": 1.05},
	"greatsword": {"stance": "gs_great_sword_idle", "guard": ["gs_great_sword_blocking_2", 0.45], "flinch": ["gs_great_sword_impact", "gs_great_sword_impact_2", "gs_great_sword_impact_4"], "tip": 1.5},
	"axe": {"stance": "ax_standing_idle", "guard": ["ax_standing_block_idle", -1.0], "flinch": ["ax_standing_react_large_from_left", "ax_standing_react_large_gut", "ax_standing_block_react_large"], "tip": 1.02},
}
var style: Dictionary = STYLES.sword
var kind := "sword"             # which weapon is in hand: sword, katana, divine, sword_shield, greatsword, axe
var shield: Node3D
var STANCE := "KBS_Ready_Idle_001"
const WALK := "KBS_Walk_F_001_IP"
## movement clips by direction of travel, every 45 degrees from straight ahead round to the left
const DIRS := ["Run01_Forward", "StrafeRun01_ForwardLeft", "StrafeRun01_Left", "StrafeRun01_BackwardLeft", "Run01_Backward", "StrafeRun01_BackwardRight", "StrafeRun01_Right", "StrafeRun01_ForwardRight"]
const RUN_SPEED := 4.0          # metres a second the run clips cover; the legs are played faster or slower to match the ground
const WALK_SPEED := 1.6

func setup(fighter_def: Dictionary, weapon_id := "") -> FighterView:
	def = fighter_def
	kind = weapon_id if weapon_id != "" else def.weapon
	weapon = Sim.weapon_of(kind)
	style = STYLES.get(kind, STYLES.sword)
	STANCE = style.stance
	clips = Clips.table()
	tilt = Node3D.new(); add_child(tilt)
	var body: Node3D = (load(MODELS[def.id]) as PackedScene).instantiate()
	tilt.add_child(body)
	var old: Node = body.find_child("AnimationPlayer", true, false)
	if old: old.queue_free()
	skeleton = body.find_child("Skeleton3D", true, false)
	bone_ids = PackedInt32Array()
	for b in Clips.BONES: bone_ids.append(skeleton.find_bone(b))

	blade_mat = StandardMaterial3D.new()
	blade_mat.albedo_color = Color(0.86, 0.88, 0.9); blade_mat.metallic = 0.85; blade_mat.roughness = 0.28
	blade_mat.emission_enabled = true
	if kind == "katana": base_emission = Color(0.35, 0.03, 0.05)
	elif def.id == "sun_warlord":
		blade_mat.albedo_color = Color(0.98, 0.9, 0.62); base_emission = Color(0.35, 0.24, 0.05)
	blade_mat.emission = base_emission
	# The hand bone lives in centimetre space; the holder undoes that so the weapon can be built in metres.
	var hand := BoneAttachment3D.new(); hand.bone_name = "RightHand"; skeleton.add_child(hand)
	var holder := Node3D.new(); hand.add_child(holder)
	holder.scale = Vector3.ONE * 100.0
	held = _build_weapon(_model_kind()); held.rotation.x = PI / 4; holder.add_child(held)
	set_kind = "HumanF_" if def.id == "wuixi" else "HumanM_"
	# A second copy that lies on the ground while the fighter is disarmed.
	dropped = Node3D.new(); dropped.visible = false; dropped.top_level = true; add_child(dropped)
	var spare := _build_weapon(_model_kind()); spare.rotation = Vector3(0, 0.6, PI / 2); spare.position.y = 0.07; dropped.add_child(spare)
	var marker := MeshInstance3D.new(); var tm := TorusMesh.new(); tm.inner_radius = 0.5; tm.outer_radius = 0.58; marker.mesh = tm
	var mm := StandardMaterial3D.new(); mm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; mm.albedo_color = Color(1, 0.85, 0.3, 0.8); mm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	marker.material_override = mm; marker.position.y = 0.05; dropped.add_child(marker)

	# The blue light a fighter burns with while charging: the thing a player learns to parry.
	aura = MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.3; cm.bottom_radius = 0.62; cm.height = 2.1; cm.cap_top = false; cm.cap_bottom = false; aura.mesh = cm
	var am := StandardMaterial3D.new(); am.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; am.albedo_color = Color(0.3, 0.65, 1.0, 0.0)
	am.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; am.blend_mode = BaseMaterial3D.BLEND_MODE_ADD; am.cull_mode = BaseMaterial3D.CULL_DISABLED
	aura.material_override = am; aura.position.y = 1.05; aura.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; aura.visible = false; add_child(aura)
	# the streak a blade leaves through the air, so a slash can be seen and read
	tip_y = 0.93 if kind == "katana" else style.tip
	trail = MeshInstance3D.new(); trail.mesh = ImmediateMesh.new(); trail.top_level = true; trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var tm2 := StandardMaterial3D.new(); tm2.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; tm2.vertex_color_use_as_albedo = true
	tm2.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; tm2.blend_mode = BaseMaterial3D.BLEND_MODE_ADD; tm2.cull_mode = BaseMaterial3D.CULL_DISABLED
	trail.material_override = tm2; add_child(trail)
	if weapon.shield: call_deferred("_add_shield")
	glow_light = OmniLight3D.new(); glow_light.light_color = FOCUS_GLOW; glow_light.omni_range = 3.5; glow_light.position = Vector3(0, 1.3, 0.5); glow_light.visible = false; add_child(glow_light)
	return self

func _part(mesh: Mesh, mat: Material, pos: Vector3) -> MeshInstance3D:
	var m := MeshInstance3D.new(); m.mesh = mesh; m.material_override = mat; m.position = pos; return m

func _std(color: Color, metal := 0.0, rough := 0.7) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = color; m.metallic = metal; m.roughness = rough; return m

func _model_kind() -> String:
	if kind == "greatsword" or kind == "axe" or kind == "katana": return kind
	return "divine" if def.id == "sun_warlord" else "sword"

## The shield sits on the left hand, turned so that in the guard pose it stands upright and faces the enemy.
func _add_shield() -> void:
	var hand := BoneAttachment3D.new(); hand.bone_name = "LeftHand"; skeleton.add_child(hand)
	var holder := Node3D.new(); holder.scale = Vector3.ONE * 100.0; hand.add_child(holder)
	shield = Node3D.new(); holder.add_child(shield)
	var rim := _std(Color(0.5, 0.42, 0.25), 0.8, 0.4)
	var face := _std(Color(0.2, 0.035, 0.035) if def.id != "sun_warlord" else Color(0.75, 0.72, 0.66), 0.25, 0.55)
	# a kite shield: a rounded top narrowing to a point, gently curved round the arm
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var outline := []
	for i in 13:
		var a := PI * i / 12.0
		outline.append(Vector2(cos(a) * 0.27, 0.16 + sin(a) * 0.2))
	outline.append(Vector2(-0.27, 0.0)); outline.append(Vector2(-0.14, -0.38)); outline.append(Vector2(0.0, -0.56)); outline.append(Vector2(0.14, -0.38)); outline.append(Vector2(0.27, 0.0))
	var bulge := func(p: Vector2) -> Vector3: return Vector3(p.x, p.y, 0.07 - p.x * p.x * 0.9)
	for i in outline.size():
		var a2: Vector2 = outline[i]
		var b2: Vector2 = outline[(i + 1) % outline.size()]
		for v in [Vector2(0, -0.05), a2, b2]:
			st.set_normal(Vector3(v.x * 1.5, 0, 1).normalized()); st.add_vertex(bulge.call(v))
	st.generate_normals()
	var plate := MeshInstance3D.new(); plate.mesh = st.commit()
	var fm := face; fm.cull_mode = BaseMaterial3D.CULL_DISABLED; plate.material_override = fm; shield.add_child(plate)
	var boss := SphereMesh.new(); boss.radius = 0.07; boss.height = 0.09
	shield.add_child(_part(boss, rim, Vector3(0, -0.02, 0.075)))
	# find the turn that stands it upright, facing forward, when the guard is up
	var g: Array = style.guard
	weights = {g[0]: 1.0}; times = {g[0]: 0.3}; _apply(); skeleton.force_update_all_bone_transforms()
	var hb := (skeleton.global_transform * skeleton.get_bone_global_pose(skeleton.find_bone("LeftHand"))).basis.orthonormalized()
	var here := global_transform.basis.orthonormalized()
	shield.basis = hb.inverse() * here                     # shield axes = the fighter's own: x across, y up, z forward
	shield.position = hb.inverse() * (here * Vector3(0.0, 0.02, 0.07))
	weights.clear()

## A real blade shape: a flat diamond in cross-section with sharp edges, tapering to a point. Base at y = 0.
func _blade(length: float, width: float, thick: float, taper_from := 0.8, base_width := -1.0) -> ArrayMesh:
	var bw := width if base_width < 0 else base_width
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var ring := func(y: float, w: float, t: float) -> Array:
		return [Vector3(0, y, w / 2), Vector3(t / 2, y, 0), Vector3(0, y, -w / 2), Vector3(-t / 2, y, 0)]
	var a: Array = ring.call(0.0, bw, thick)
	var b: Array = ring.call(length * taper_from, width, thick)
	var tip := Vector3(0, length, 0)
	for i in 4:
		var j := (i + 1) % 4
		for v in [a[i], b[i], b[j], a[i], b[j], a[j], b[i], tip, b[j]]: st.add_vertex(v)
	for v in [a[0], a[1], a[2], a[0], a[2], a[3]]: st.add_vertex(v)
	st.generate_normals()
	return st.commit()

## Weapons are built here, pointing along +Y from the grip, in metres.
func _build_weapon(kind: String) -> Node3D:
	var g := Node3D.new()
	var gold := _std(Color(0.83, 0.62, 0.22), 0.9, 0.28)
	var steel := _std(Color(0.55, 0.57, 0.6), 0.9, 0.35)
	var leather := _std(Color(0.16, 0.1, 0.07), 0.0, 0.85)
	var cyl := func(r_top: float, r_bottom: float, h: float) -> CylinderMesh:
		var c := CylinderMesh.new(); c.top_radius = r_top; c.bottom_radius = r_bottom; c.height = h; c.radial_segments = 14; return c
	var ball := func(r: float) -> SphereMesh:
		var m := SphereMesh.new(); m.radius = r; m.height = r * 2; m.radial_segments = 14; m.rings = 8; return m
	var box := func(x: float, y: float, z: float) -> BoxMesh:
		var m := BoxMesh.new(); m.size = Vector3(x, y, z); return m
	# the grip, wound with bands, shared by every sword
	var grip := func(length: float, mat: Material) -> void:
		g.add_child(_part(cyl.call(0.017, 0.019, length), mat, Vector3.ZERO))
		for i in 5: g.add_child(_part(cyl.call(0.0205, 0.0205, 0.006), _std(Color(0.08, 0.05, 0.04), 0.2, 0.6), Vector3(0, -length / 2 + length * (i + 0.5) / 5, 0)))
	# a crossguard whose arms narrow and sweep toward the blade
	var guard := func(span: float, mat: Material, sweep: float) -> void:
		g.add_child(_part(box.call(0.034, 0.03, 0.07), mat, Vector3(0, 0.115, 0)))
		for side in [-1.0, 1.0]:
			var arm := _part(cyl.call(0.007, 0.015, span), mat, Vector3(0, 0.115 + sweep * span * 0.5, side * (0.03 + span * 0.5)))
			arm.rotation.x = side * (PI / 2 - sweep); g.add_child(arm)
			g.add_child(_part(ball.call(0.012), mat, Vector3(0, 0.115 + sweep * span, side * (0.03 + span))))
	if kind == "greatsword":
		# A two-handed sword: a long broad blade, a wide guard and a grip long enough for both hands.
		g.add_child(_part(_blade(1.32, 0.075, 0.016, 0.82, 0.09), blade_mat, Vector3(0, 0.2, 0)))
		g.add_child(_part(_blade(0.8, 0.018, 0.018, 0.9), _std(Color(0.25, 0.26, 0.28), 0.9, 0.4), Vector3(0, 0.21, 0)))
		g.add_child(_part(cyl.call(0.019, 0.021, 0.42), leather, Vector3(0, -0.02, 0)))
		g.add_child(_part(box.call(0.04, 0.035, 0.36), steel, Vector3(0, 0.19, 0)))
		g.add_child(_part(ball.call(0.04), steel, Vector3(0, -0.25, 0)))
	elif kind == "axe":
		# A war axe: a long ash haft with a bearded steel head and a back spike.
		g.add_child(_part(cyl.call(0.02, 0.023, 1.15), _std(Color(0.32, 0.22, 0.13), 0.0, 0.8), Vector3(0, 0.38, 0)))
		var head := _part(_blade(0.3, 0.34, 0.03, 0.0, 0.1), blade_mat, Vector3(0, 0.88, 0.02)); head.rotation.x = PI / 2; g.add_child(head)
		var spike := _part(_blade(0.14, 0.05, 0.03, 0.2), steel, Vector3(0, 0.88, -0.02)); spike.rotation.x = -PI / 2; g.add_child(spike)
		g.add_child(_part(_blade(0.12, 0.04, 0.03, 0.2), steel, Vector3(0, 0.95, 0)))
		g.add_child(_part(cyl.call(0.027, 0.027, 0.1), steel, Vector3(0, 0.88, 0)))
	elif kind == "katana":
		# A long slender blade with a gentle backward curve, a round guard and a grip bound in crimson.
		var n := 12
		var length := 0.78
		for i in n:
			var t0 := float(i) / n
			var t1 := float(i + 1) / n
			var z0 := -0.075 * t0 * t0
			var z1 := -0.075 * t1 * t1
			var last := i == n - 1
			var seg := _part(_blade(length / n * 1.03, 0.03 * (1.0 - t1 * 0.15), 0.006, 0.05 if last else 1.0, 0.03 * (1.0 - t0 * 0.15)), blade_mat, Vector3(0, 0.15 + t0 * length, z0))
			seg.rotation.x = atan2(z1 - z0, length / n)
			g.add_child(seg)
		var disc := _part(cyl.call(0.046, 0.046, 0.007), _std(Color(0.1, 0.08, 0.07), 0.6, 0.45), Vector3(0, 0.142, 0)); disc.scale = Vector3(0.8, 1, 1); g.add_child(disc)
		g.add_child(_part(cyl.call(0.02, 0.02, 0.02), gold, Vector3(0, 0.128, 0)))
		grip.call(0.27, _std(Color(0.5, 0.06, 0.1), 0.0, 0.8))
		g.add_child(_part(cyl.call(0.02, 0.017, 0.024), gold, Vector3(0, -0.146, 0)))
	elif kind == "divine":
		# Dawnbreaker: a broad leaf-shaped blade of pale gold, upswept wings for a guard and a sun at its heart.
		g.add_child(_part(_blade(0.98, 0.085, 0.018, 0.72, 0.105), blade_mat, Vector3(0, 0.13, 0)))
		g.add_child(_part(_blade(0.62, 0.02, 0.024, 0.9), gold, Vector3(0, 0.14, 0)))       # the raised rib down the middle
		grip.call(0.22, _std(Color(0.93, 0.9, 0.84), 0.2, 0.5))
		for side in [-1.0, 1.0]:
			for i in 3:
				var feather := _part(_blade(0.2 - i * 0.04, 0.045 - i * 0.008, 0.012, 0.35), gold, Vector3(0, 0.115 + i * 0.012, side * 0.03))
				feather.rotation.x = side * (1.25 - i * 0.3); g.add_child(feather)
		var sun := _part(cyl.call(0.05, 0.05, 0.03), gold, Vector3(0, 0.125, 0)); sun.rotation.z = PI / 2; g.add_child(sun)
		var gm := _std(Color(1, 0.96, 0.78)); gm.emission_enabled = true; gm.emission = Color(1, 0.84, 0.4); gm.emission_energy_multiplier = 2.5
		var gem := _part(ball.call(0.026), gm, Vector3(0, 0.125, 0)); gem.scale = Vector3(1.5, 1, 1); g.add_child(gem)
		var pommel := _part(_blade(0.07, 0.05, 0.05, 0.5), gold, Vector3(0, -0.11, 0)); pommel.rotation.x = PI; g.add_child(pommel)
	else:
		# A knight's longsword: tapering steel blade with a dark channel, swept crossguard, leather grip, wheel pommel.
		g.add_child(_part(_blade(0.92, 0.05, 0.012, 0.8, 0.062), blade_mat, Vector3(0, 0.13, 0)))
		g.add_child(_part(_blade(0.55, 0.014, 0.014, 0.9), _std(Color(0.25, 0.26, 0.28), 0.9, 0.4), Vector3(0, 0.135, 0)))
		grip.call(0.2, leather)
		guard.call(0.1, steel, 0.22)
		var wheel := _part(cyl.call(0.03, 0.03, 0.02), steel, Vector3(0, -0.125, 0)); wheel.rotation.z = PI / 2; g.add_child(wheel)
	return g

func _show(want: Dictionary, clip: String, time: float, weight := 1.0) -> void:
	if not clips.has(clip): return
	want[clip] = weight; times[clip] = time

func _loop(want: Dictionary, clip: String, weight: float, rate: float, dt: float) -> void:
	if not clips.has(clip): return
	want[clip] = weight
	times[clip] = fposmod(times.get(clip, 0.0) + dt * rate, clips[clip].length)

## Decide which clips should be showing, and where in each, for the fighter's current state.
func _pose(f: Dictionary, dt: float) -> void:
	var want := {}
	var speed := Sim.hyp(f.vx, f.vz)
	var fwd: float = f.vx * sin(f.yaw) + f.vz * cos(f.yaw)
	var fade := 12.0
	if cheer and f.state != "dead":
		_loop(want, "victory", 1.0, 1.0, dt); fade = 6.0
	else:
		match f.state:
			"air":
				# Knocked into the air: the clip rises, hangs and comes down across the time spent airborne.
				_show(want, "BeHit_FlyUp", 0.02 + min(1.0, f.t / f.airDur) * 0.6); fade = 40.0
			"down":
				_show(want, "Stand_Up1", 1.0 + f.t)
			"getup":
				_show(want, "Stand_Up1", 4.35 + min(1.0, f.t / 0.7) * 1.6); fade = 30.0
			"attack":
				var a: Dictionary = f.atk
				var an: Array = a.anim
				var t: float = an[1] + (an[2] - an[1]) * (f.t / a.windup) if f.t < a.windup else an[2] + (an[3] - an[2]) * min(1.0, (f.t - a.windup) / (a.active + a.recover))
				# Blend in a touch slower at the very start of a swing, so one move flows into the next instead of snapping.
				_show(want, an[0], t); fade = 13.0 if f.t < 0.1 else 22.0
			"charge":
				# Wound back and held, trembling, until the button is let go.
				var atk: Dictionary = weapon.focusH if f.charge == "h" else weapon.focusV
				var e: float = min(1.0, f.t / 0.28)
				_show(want, atk.anim[0], atk.hold - 0.3 * (1 - e) + sin(f.t * 55) * 0.012 * min(1.0, f.t / 0.6)); fade = 16.0
			"guard":
				# Weapon raised across the body and held there. A blow landing on it jolts it back for a moment.
				var jolt: float = (f.guardRest - 1.05) * 1.6 if f.guardRest > 1.05 else 0.0
				var g: Array = style.guard
				if g[1] < 0: _show(want, g[0], fposmod(f.t, clips[g[0]].length))
				else: _show(want, g[0], g[1] - 0.3 + min(1.0, f.t / 0.14) * 0.3 + (jolt if g[0] == "Sword_Parry_Backward" else 0.0))
				fade = 30.0
			"dodge":
				# Dodging straight back is a hop that keeps the fighter facing the enemy; any other way is a roll.
				hop = f.ddx * sin(f.yaw) + f.ddz * cos(f.yaw) < -0.6
				if hop:
					_show(want, "Back_Jump", 0.06 + min(1.0, f.t / 0.55) * 0.86); fade = 34.0
				else:
					_show(want, "Roll_Dodge", 0.32 + min(1.0, f.t / 0.55) * 1.3); fade = 30.0
			"stagger":
				# Two different flinches, picked each time a new hit lands, so repeated hits do not look identical.
				if last_state != "stagger" or f.t < last_t: flinch = (style.flinch as Array).pick_random()
				var clip: String = "Hit_Reaction" if f.parried else flinch
				var length: float = 1.3 if f.parried else (0.85 if clip == "Hit_Reaction_1" else (1.2 if clip == "Hit_Reaction_to_Waist" else clips[clip].length))
				_show(want, clip, min(1.0, f.t / f.staggerDur) * length); fade = 25.0
			"dead":
				if f.floored: _show(want, "Stand_Up1", 1.6)      # killed while already on the ground: stays there
				elif f.launched:
					_show(want, "Knock_Down", min(2.4, 0.15 + f.t * 1.25)); fade = 30.0   # flung off their feet by a charged strike
				else:
					_show(want, "Shot_and_Fall_Backward", min(clips["Shot_and_Fall_Backward"].length - 0.05, 0.7 + f.t * 1.5)); fade = 14.0
			_:
				# Standing ready, a walk and an eight-way run, chosen by how fast and which way the fighter is travelling.
				# The legs are played at the pace that matches the ground, so the feet grip instead of gliding.
				var left: float = f.vx * cos(f.yaw) - f.vz * sin(f.yaw)
				var stand: float = clampf(1 - speed / 0.9, 0, 1)
				var ahead: float = clampf(fwd / max(speed, 0.01), 0, 1)
				var walk: float = (1 - stand) * clampf((2.6 - speed) / 1.0, 0, 1) * ahead      # only walking forward has a walk of its own
				var run: float = 1 - stand - walk
				_loop(want, STANCE, stand, 1.0, dt)
				var rate: float = clampf(speed / RUN_SPEED, 0.55, 1.5) / 0.6 if run > walk else clampf(speed / WALK_SPEED, 0.6, 1.6) / clips[WALK].length
				stride = fposmod(stride + dt * rate, 1.0)
				if walk > 0: _show(want, WALK, stride * clips[WALK].length, walk)
				if run > 0:
					var a: float = fposmod(atan2(left, fwd), TAU) / (TAU / 8)
					var i := int(a) % 8
					var k2: float = a - int(a)
					for pair in [[i, 1 - k2], [(i + 1) % 8, k2]]:
						var clip: String = set_kind + DIRS[pair[0]]
						if pair[1] > 0: _show(want, clip, stride * clips[clip].length, want.get(clip, 0.0) + run * pair[1])
	last_state = f.state; last_t = f.t
	var k: float = min(1.0, fade * dt)
	for clip in want:
		if not weights.has(clip): weights[clip] = 0.0
	for clip in weights.keys():
		var w: float = weights[clip] + (want.get(clip, 0.0) - weights[clip]) * k
		if w < 0.002 and not want.has(clip): weights.erase(clip)
		else: weights[clip] = w
	_apply()

## Blend the showing clips, bone by bone, onto the skeleton.
func _apply() -> void:
	var names := weights.keys()
	if names.is_empty(): return
	for i in bone_ids.size():
		var bone := bone_ids[i]
		if bone < 0: continue
		var q := Quaternion.IDENTITY
		var total := 0.0
		for clip in names:
			var c: Dictionary = clips[clip]
			var track: int = c.rot[i]
			var w: float = weights[clip]
			if track < 0 or w <= 0.0: continue
			var r: Quaternion = c.anim.rotation_track_interpolate(track, clampf(times[clip], 0.0, c.length))
			total += w
			q = r if total == w else q.slerp(r, w / total)
		if total > 0.0: skeleton.set_bone_pose_rotation(bone, q)
	# the sword sits in the fist the way the showing clips expect
	var blade := Vector3.ZERO
	for clip in names: blade += clips[clip].blade * weights[clip]
	if blade.length() > 0.01:
		held.basis = Basis(Quaternion(Clips.BLADE, blade.normalized())) * Basis(Vector3.RIGHT, PI / 4)
	# the hips are the only bone that also moves (bobbing, crouching, falling)
	var hips := bone_ids[0]
	var p := Vector3.ZERO
	var total_p := 0.0
	for clip in names:
		var c: Dictionary = clips[clip]
		if c.hips < 0: continue
		var w: float = weights[clip]
		p += c.anim.position_track_interpolate(c.hips, clampf(times[clip], 0.0, c.length)) * w; total_p += w
	if total_p > 0.0: skeleton.set_bone_pose_position(hips, p / total_p)

func update(f: Dictionary, dt: float) -> void:
	if not started:
		position = Vector3(f.x, 0, f.z); rotation.y = f.yaw; started = true
	var k: float = min(1.0, 28 * dt)
	position.x += (f.x - position.x) * k; position.z += (f.z - position.z) * k
	# Knocked into the air, the body rises and comes back down.
	position.y = sin(min(1.0, f.t / f.airDur) * PI) * Sim.AIR_HEIGHT * 0.6 if f.state == "air" else lerpf(position.y, 0.0, min(1.0, 20 * dt))
	# While rolling, the body points the way it is travelling, not at the enemy.
	var rolling: bool = f.state == "dodge" and not (f.ddx * sin(f.yaw) + f.ddz * cos(f.yaw) < -0.6)
	var body_yaw: float = atan2(f.ddx, f.ddz) if rolling else f.yaw
	rotation.y += Sim.ang_diff(rotation.y, body_yaw) * min(1.0, 22 * dt)
	_pose(f, dt)

	# A charging weapon burns blue, brighter the longer it is held, and stays lit until the strike has landed.
	var striking: bool = f.state == "attack" and f.atk.focus and not f.atk.skill and f.t < f.atk.windup + f.atk.active
	var focus: float = 0.35 + 0.65 * smoothstep(0.0, 1.0, f.t / 0.9) if f.state == "charge" else (1.0 if striking else 0.0)
	focus_mix += (focus - focus_mix) * min(1.0, 14 * dt)
	clock += dt
	blade_mat.emission = base_emission.lerp(FOCUS_GLOW, min(1.0, focus_mix * 1.5))
	blade_mat.emission_energy_multiplier = 1.0 + focus_mix * 5.0
	aura.visible = focus_mix > 0.02
	(aura.material_override as StandardMaterial3D).albedo_color.a = focus_mix * (0.13 + 0.05 * sin(clock * 16))
	glow_light.light_energy = focus_mix * 3.0; glow_light.visible = focus_mix > 0.02
	var grow := 1 + 0.12 * sin(clock * 9)
	aura.scale = Vector3(grow, 1, grow)

	_trail(f, dt)
	held.visible = not f.disarmed
	dropped.visible = f.disarmed
	if f.disarmed:
		dropped.global_position = Vector3(f.dropX, 0, f.dropZ)
		dropped.get_child(1).scale = Vector3.ONE * (1 + 0.18 * sin(clock * 7))

## Jump straight to the fighter's current state with no blending (round start).
func snap(f: Dictionary) -> void:
	started = false; weights.clear(); focus_mix = 0.0; cheer = false; trail_pts.clear()
	update(f, 1.0)

## Draw the blade's streak: a ribbon through where the blade has just been, brightest at the blade and fading behind it.
func _trail(f: Dictionary, dt: float) -> void:
	var swinging: bool = f.state == "attack" and not f.disarmed and not f.atk.kick and f.t > f.atk.windup * 0.3 and f.t < f.atk.windup + f.atk.active + 0.1
	for p in trail_pts: p[2] += dt
	while not trail_pts.is_empty() and trail_pts[0][2] > 0.2: trail_pts.pop_front()
	if swinging:
		var g := held.global_transform
		trail_pts.append([g * Vector3(0, 0.22, 0), g * Vector3(0, tip_y, 0), 0.0])
	var im := trail.mesh as ImmediateMesh
	im.clear_surfaces()
	trail.global_transform = Transform3D.IDENTITY
	if trail_pts.size() < 2: return
	var tint: Color = FOCUS_GLOW if (f.state == "attack" and f.atk.focus) else Color(1.0, 0.97, 0.9)
	im.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for p in trail_pts:
		var a: float = clampf(1.0 - p[2] / 0.2, 0, 1)
		im.surface_set_color(Color(tint.r, tint.g, tint.b, 0.0)); im.surface_add_vertex(p[0])
		im.surface_set_color(Color(tint.r, tint.g, tint.b, a * a * 0.75)); im.surface_add_vertex(p[1])
	im.surface_end()
