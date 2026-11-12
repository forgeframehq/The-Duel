extends SceneTree
## Fits animations made for other skeletons onto the fighters' shared 24-bone skeleton and saves them as one library.
##   godot --headless --path <this project> --script res://bake.gd
## How: for every frame, each source bone's turn away from its rest pose (measured in the model's own space, after lining
## the two rest poses up limb by limb) is applied to the matching fighter bone. Hips height is scaled to the fighter's legs.

const BONES := ["Hips", "Spine02", "Spine01", "Spine", "neck", "Head", "head_end", "headfront", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
	"RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"]
## which bone a limb points toward, for lining up rest poses; bones not listed copy their parent's correction
const AIM := {"Spine02": "Spine01", "Spine01": "Spine", "Spine": "neck", "neck": "Head",
	"LeftShoulder": "LeftArm", "LeftArm": "LeftForeArm", "LeftForeArm": "LeftHand", "RightShoulder": "RightArm", "RightArm": "RightForeArm", "RightForeArm": "RightHand",
	"LeftUpLeg": "LeftLeg", "LeftLeg": "LeftFoot", "LeftFoot": "LeftToeBase", "RightUpLeg": "RightLeg", "RightLeg": "RightFoot", "RightFoot": "RightToeBase"}

static func side(m: Dictionary, pairs: Dictionary, l: String, r: String) -> void:
	for k in pairs:
		m["Left" + k] = pairs[k] % l; m["Right" + k] = pairs[k] % r

func maps() -> Dictionary:
	var q := {"Hips": "pelvis", "Spine02": "spine_01", "Spine01": "spine_02", "Spine": "spine_03", "neck": "neck_01", "Head": "Head"}
	side(q, {"Shoulder": "clavicle_%s", "Arm": "upperarm_%s", "ForeArm": "lowerarm_%s", "Hand": "hand_%s", "UpLeg": "thigh_%s", "Leg": "calf_%s", "Foot": "foot_%s", "ToeBase": "ball_%s"}, "l", "r")
	var mco := {"Hips": "Hips", "Spine02": "Spine", "Spine01": "Spine1", "Spine": "Spine2", "neck": "Neck", "Head": "Head"}
	side(mco, {"Shoulder": "%sShoulder", "Arm": "%sArm", "ForeArm": "%sForeArm", "Hand": "%sHand", "UpLeg": "%sUpLeg", "Leg": "%sLeg", "Foot": "%sFoot", "ToeBase": "%sToeBase"}, "Left", "Right")
	var kev := {"Hips": "B-hips", "Spine02": "B-spine", "Spine": "B-chest", "neck": "B-neck", "Head": "B-head"}
	side(kev, {"Shoulder": "B-shoulder.%s", "Arm": "B-upperArm.%s", "ForeArm": "B-forearm.%s", "Hand": "B-hand.%s", "UpLeg": "B-thigh.%s", "Leg": "B-shin.%s", "Foot": "B-foot.%s", "ToeBase": "B-toe.%s"}, "L", "R")
	var mx := {"Hips": "mixamorig_Hips", "Spine02": "mixamorig_Spine", "Spine01": "mixamorig_Spine1", "Spine": "mixamorig_Spine2", "neck": "mixamorig_Neck", "Head": "mixamorig_Head"}
	side(mx, {"Shoulder": "mixamorig_%sShoulder", "Arm": "mixamorig_%sArm", "ForeArm": "mixamorig_%sForeArm", "Hand": "mixamorig_%sHand", "UpLeg": "mixamorig_%sUpLeg", "Leg": "mixamorig_%sLeg", "Foot": "mixamorig_%sFoot", "ToeBase": "mixamorig_%sToeBase"}, "Left", "Right")
	return {"q": q, "mco": mco, "kev": kev, "mx": mx}

var tgt: Skeleton3D
var tgt_rest_g := {}      # bone name -> Transform3D in model space, rest pose
var lib := AnimationLibrary.new()

## Every bone's rest transform in model space.
func rest_globals(sk: Skeleton3D) -> Array:
	var out := []
	var base := sk.global_transform
	for i in sk.get_bone_count():
		var p := sk.get_bone_parent(i)
		out.append((out[p] if p >= 0 else base) * sk.get_bone_rest(i))
	return out

func facing(sk: Skeleton3D, g: Array, l_foot: String, l_toe: String, r_foot: String, r_toe: String) -> float:
	var d: Vector3 = (g[sk.find_bone(l_toe)].origin - g[sk.find_bone(l_foot)].origin) + (g[sk.find_bone(r_toe)].origin - g[sk.find_bone(r_foot)].origin)
	return atan2(d.x, d.z)

const KNUCKLES := {"pelvis": ["index_01_r", "pinky_01_r"], "Hips": ["RightHandIndex1", "RightHandPinky1"], "B-hips": ["B-indexFinger01.R", "B-pinky01.R"], "mixamorig_Hips": ["mixamorig_RightHandIndex1", "mixamorig_RightHandPinky1"]}
const BLADE := Vector3(0, 0.7071, 0.7071)     # the way the blade leaves the fighter's hand, in the hand bone's own space
var hand_roll := {}                            # per source skeleton: a twist of the sword hand found by calibrate()

## Everything about one source file that does not change from frame to frame.
func open(path: String, m: Dictionary, roll: float) -> Dictionary:
	var scene: Node3D = (load(path) as PackedScene).instantiate(); root.add_child(scene)
	var sk: Skeleton3D = scene.find_child("Skeleton3D", true, false)
	var g_rest := rest_globals(sk)
	# turn the source to face the way the fighter faces
	var yaw := facing(tgt, _tgt_g, "LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase") - facing(sk, g_rest, m.LeftFoot, m.LeftToeBase, m.RightFoot, m.RightToeBase)
	var turn := Basis(Vector3.UP, yaw)
	var src_id := {}
	for b in m:
		src_id[b] = sk.find_bone(m[b]); assert(src_id[b] >= 0, "missing source bone " + m[b])
	# the correction that lines each source limb's rest direction up with the fighter's
	var align := {}
	for b in BONES:
		if not m.has(b): continue
		var a := Basis.IDENTITY
		if AIM.has(b):
			var to: String = AIM[b]
			while not m.has(to): to = AIM[to]
			var ds: Vector3 = (turn * (g_rest[src_id[to]].origin - g_rest[src_id[b]].origin)).normalized()
			var dt: Vector3 = (tgt_rest_g[to].origin - tgt_rest_g[b].origin).normalized()
			a = Basis(Quaternion(ds, dt))
		elif b != "Hips":
			a = align[tgt.get_bone_name(tgt.get_bone_parent(tgt.find_bone(b)))]
		align[b] = a
	# the sword hand gets an extra twist about the forearm, so the blade leaves the fist the way it does in the source
	var fore: Vector3 = (tgt_rest_g["RightHand"].origin - tgt_rest_g["RightForeArm"].origin).normalized()
	align["RightHand"] = Basis(fore, roll) * align["RightForeArm"]
	var base_q := sk.global_transform.basis.orthonormalized()
	var rest_rot := []
	for i in sk.get_bone_count():
		var pr := sk.get_bone_parent(i)
		rest_rot.append(((rest_rot[pr] if pr >= 0 else base_q) * sk.get_bone_rest(i).basis.orthonormalized()).orthonormalized())
	var ref := {}
	for b in m: ref[b] = (align[b] * (turn * rest_rot[src_id[b]]).orthonormalized()).inverse()
	# Which way a gripped blade leaves this skeleton's fist: along the knuckles, from the little finger to the index finger.
	var kn: Array = KNUCKLES[m.Hips]
	var blade_model: Vector3 = (turn * (g_rest[sk.find_bone(kn[0])].origin - g_rest[sk.find_bone(kn[1])].origin)).normalized()
	var hand_at_rest: Basis = ((turn * rest_rot[src_id["RightHand"]]).orthonormalized() * ref["RightHand"] * tgt_rest_g["RightHand"].basis.orthonormalized()).orthonormalized()
	var blade: Vector3 = (hand_at_rest.inverse() * blade_model).normalized()
	return {"blade": blade, "scene": scene, "sk": sk, "ap": scene.find_child("AnimationPlayer", true, false), "m": m, "turn": turn, "src_id": src_id, "ref": ref, "base_q": base_q,
		"scale_h": tgt_rest_g["Hips"].origin.y / g_rest[src_id["Hips"]].origin.y}

func tracks_of(c: Dictionary, src: Animation) -> Array:
	var rot := {}; var pos := {}
	for t in src.get_track_count():
		var bone: int = c.sk.find_bone(str(src.track_get_path(t).get_concatenated_subnames()))
		if bone < 0: continue
		if src.track_get_type(t) == Animation.TYPE_ROTATION_3D: rot[bone] = t
		elif src.track_get_type(t) == Animation.TYPE_POSITION_3D: pos[bone] = t
	return [rot, pos]

## The fighter's pose for one moment of a source clip: { bone: rotation in model space }, plus "hips_y".
func pose(c: Dictionary, src: Animation, tr: Array, time: float) -> Dictionary:
	var sk: Skeleton3D = c.sk
	var g := []
	for i in sk.get_bone_count():
		var rest := sk.get_bone_rest(i)
		var local := Transform3D(Basis(src.rotation_track_interpolate(tr[0][i], time)) if tr[0].has(i) else rest.basis.orthonormalized(), src.position_track_interpolate(tr[1][i], time) if tr[1].has(i) else rest.origin)
		var p := sk.get_bone_parent(i)
		g.append((g[p] if p >= 0 else Transform3D(c.base_q, sk.global_transform.origin)) * local)
	var tg := {}
	var tgt_q := tgt.global_transform.basis.orthonormalized()
	for b in BONES:
		var bi := tgt.find_bone(b)
		var parent := tgt.get_bone_parent(bi)
		var parent_g: Basis = tg[tgt.get_bone_name(parent)] if parent >= 0 else tgt_q
		if c.m.has(b): tg[b] = ((c.turn * g[c.src_id[b]].basis).orthonormalized() * c.ref[b] * tgt_rest_g[b].basis.orthonormalized()).orthonormalized()
		else: tg[b] = (parent_g * tgt.get_bone_rest(bi).basis.orthonormalized()).orthonormalized()
	tg["hips_y"] = g[c.src_id["Hips"]].origin.y * sk.global_transform.basis.get_scale().y * c.scale_h
	var k: float = sk.global_transform.basis.get_scale().y * c.scale_h
	tg["hand"] = g[c.src_id["RightHand"]].origin * k
	tg["hips"] = c.turn * (g[c.src_id["Hips"]].origin * k)
	var hips: Vector3 = g[c.src_id["Hips"]].origin
	var lf: Vector3 = (g[c.src_id["LeftFoot"]].origin - hips) * k
	var rf: Vector3 = (g[c.src_id["RightFoot"]].origin - hips) * k
	tg["foot"] = lf if lf.y < rf.y else rf      # the planted foot, measured from the hips
	tg["foot_id"] = 0 if lf.y < rf.y else 1
	return tg

## Find the twist of the sword hand that makes the blade point up and forward in a ready stance.
func calibrate(path: String, m: Dictionary, clip: String, want: Vector3) -> float:
	var best := 0.0
	var best_score := -9.0
	for step in 1:
		var roll := 0.0
		var c := open(path, m, roll)
		var src: Animation = c.ap.get_animation(clip)
		var tr := tracks_of(c, src)
		var score := 0.0
		for k in 4: score += (pose(c, src, tr, src.length * k / 4.0)["RightHand"] * c.blade).dot(want.normalized())
		c.scene.free()
		if score > best_score:
			best_score = score; best = roll
	var c2 := open(path, m, 0.0)
	print("  ", path.get_file(), ": blade leaves the hand along ", c2.blade.snapped(Vector3.ONE * 0.01), "; in the ready stance it points up-and-forward %.2f" % (best_score / 4))
	c2.scene.free()
	return best

func bake_file(path: String, m: Dictionary, roll: float, only := [], rename := {}) -> void:
	var c := open(path, m, roll)
	var tgt_base := tgt.global_transform
	var tgt_q := tgt_base.basis.orthonormalized()
	for clip_name in c.ap.get_animation_list():
		if not only.is_empty() and not (str(clip_name) in only): continue
		var src: Animation = c.ap.get_animation(clip_name)
		var tr := tracks_of(c, src)
		var out := Animation.new(); out.length = src.length; out.loop_mode = Animation.LOOP_NONE
		var tracks := {}
		for b in BONES:
			var t := out.add_track(Animation.TYPE_ROTATION_3D); out.track_set_path(t, NodePath("Armature/Skeleton3D:" + b)); tracks[b] = t
		var hips_t := out.add_track(Animation.TYPE_POSITION_3D); out.track_set_path(hips_t, NodePath("Armature/Skeleton3D:Hips"))
		var hand := []; var slide := 0.0; var slide_n := 0; var last := {}; var travel := Vector3.ZERO; var hip0 := Vector3.ZERO
		for f in int(ceil(src.length * 30.0)) + 1:
			var time: float = min(src.length, f / 30.0)
			var tg := pose(c, src, tr, time)
			hand.append(tg.hand)
			if f == 0: hip0 = tg.hips
			travel = tg.hips - hip0
			if not last.is_empty() and last.foot_id == tg.foot_id:
				slide += Vector2(tg.foot.x - last.foot.x, tg.foot.z - last.foot.z).length() * 30.0; slide_n += 1
			last = tg
			for b in BONES:
				var parent := tgt.get_bone_parent(tgt.find_bone(b))
				var parent_g: Basis = tg[tgt.get_bone_name(parent)] if parent >= 0 else tgt_q
				out.rotation_track_insert_key(tracks[b], time, (parent_g.inverse() * tg[b]).orthonormalized().get_rotation_quaternion())
			# hips height, scaled to the fighter's leg length; kept over the feet
			out.position_track_insert_key(hips_t, time, tgt_base.affine_inverse() * Vector3(tgt_rest_g["Hips"].origin.x, tg.hips_y, tgt_rest_g["Hips"].origin.z))
		out.set_meta("blade", c.blade)
		# how fast the ground passes under the planted foot: the speed a fighter must travel for the feet not to slide
		out.set_meta("speed", slide / max(1, slide_n))
		# the moments the sword hand moves fastest: where the blows land
		var peaks := []
		for i in range(2, hand.size() - 2):
			var v: float = (hand[i + 1] - hand[i - 1]).length() * 15.0
			var before: float = (hand[i] - hand[i - 2]).length() * 15.0
			var after: float = (hand[i + 2] - hand[i]).length() * 15.0
			if v > 2.5 and v >= before and v > after: peaks.append([snappedf(i / 30.0, 0.01), snappedf(v, 0.1)])
		out.set_meta("peaks", peaks)
		var final_name: String = rename.get(str(clip_name), str(clip_name))
		if final_name == "mixamo_com": final_name = path.get_file().get_basename()      # every Mixamo clip is called the same; use the file's name
		out.set_meta("travel", travel)
		lib.add_animation(final_name, out)
		print("  ", final_name, "  ", "%.2f s" % src.length, "  travel ", Vector2(travel.x, travel.z).snapped(Vector2.ONE * 0.1), "  hand peaks ", peaks)
	c.scene.free()

var _tgt_g := []

func _init() -> void:
	var model: Node3D = (load("res://tgt/wuixi.glb") as PackedScene).instantiate(); root.add_child(model)
	tgt = model.find_child("Skeleton3D", true, false)
	await process_frame
	_tgt_g = rest_globals(tgt)
	for b in BONES: tgt_rest_g[b] = _tgt_g[tgt.find_bone(b)]
	var m := maps()
	var cfg: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://jobs.json"))
	for k in cfg.calibrate:
		var cal: Dictionary = cfg.calibrate[k]
		hand_roll[k] = calibrate(cal.file, m[k], cal.clip, Vector3(cal.want[0], cal.want[1], cal.want[2]))
	for j in cfg.jobs:
		print(j.file)
		bake_file(j.file, m[j.map], hand_roll[j.map], j.get("only", []), j.get("rename", {}))
	ResourceSaver.save(lib, "res://out/extra_anims.res")
	print(lib.get_animation_list().size(), " clips saved")
	quit()
