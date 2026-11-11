class_name Clips
## The shared motion library. Every fighter stands on the same 24-bone Meshy skeleton, so any clip plays on any of them.
##
## The clips live in two files (res://anims/anims.glb and anims2.glb) that hold skeletons with no body. Godot imports
## those as plain node trees, one per source file, with numbers added to repeated names ("Armature6/Hips6/Spine026").
## This turns each clip into one that drives a fighter's Skeleton3D bones instead ("Armature/Skeleton3D:Spine02").

const FILES := ["res://anims/anims.glb", "res://anims/anims2.glb"]
const EXTRA := "res://anims/extra_anims.res"
const BLADE := Vector3(0, 0.7071, 0.7071)
## Clips whose hips may travel (falls); in every other clip the hips are pinned over the feet, because the rules own position.
const FREE_ROOT := ["Dead", "Shot_and_Fall_Backward", "Shot_and_Fall_Forward"]
const BONES := ["Hips", "Spine02", "Spine01", "Spine", "neck", "Head", "head_end", "headfront", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
	"RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"]

static var _library: AnimationLibrary

## One AnimationLibrary for all fighters, built the first time it is asked for. Tracks point at "Armature/Skeleton3D:<bone>".
static func library() -> AnimationLibrary:
	if _library: return _library
	_library = AnimationLibrary.new()
	for file in FILES:
		var scene: Node = (load(file) as PackedScene).instantiate()
		var player: AnimationPlayer = scene.find_child("AnimationPlayer", true, false)
		for clip_name in player.get_animation_list():
			if _library.has_animation(clip_name): continue
			_library.add_animation(clip_name, _convert(player.get_animation(clip_name), clip_name))
		scene.free()
	# moves from the free packs, already fitted to the fighters' skeleton by tools/godot_bake
	if ResourceLoader.exists(EXTRA):
		var extra: AnimationLibrary = load(EXTRA)
		for clip_name in extra.get_animation_list():
			if not _library.has_animation(clip_name): _library.add_animation(clip_name, extra.get_animation(clip_name))
	return _library

static func _convert(src: Animation, clip_name: String) -> Animation:
	var out := Animation.new()
	out.length = src.length
	out.loop_mode = Animation.LOOP_NONE
	var free_root := clip_name in FREE_ROOT
	# Each file holds one skeleton per clip it was packed from, and every clip carries tracks for all of them: real motion
	# for its own skeleton and a single frozen key for each of the others. Find the skeleton that actually moves.
	var motion := {}
	for t in src.get_track_count():
		var owner := str(src.track_get_path(t)).get_slice("/", 0)
		motion[owner] = motion.get(owner, 0) + src.track_get_key_count(t)
	var mover := ""
	for owner in motion:
		if mover == "" or motion[owner] > motion[mover]: mover = owner
	for t in src.get_track_count():
		var kind := src.track_get_type(t)
		if kind != Animation.TYPE_ROTATION_3D and kind != Animation.TYPE_POSITION_3D: continue
		var parts := str(src.track_get_path(t)).split("/")
		if parts[0] != mover: continue
		# "Armature6" -> "6": the number Godot added to every name in that source's tree
		var suffix := parts[0].trim_prefix("Armature")
		var bone := parts[parts.size() - 1]
		if suffix != "" and bone.ends_with(suffix): bone = bone.substr(0, bone.length() - suffix.length())
		if not bone in BONES: continue
		# limb lengths come from each character, not the clip: only the hips keep their movement
		if kind == Animation.TYPE_POSITION_3D and bone != "Hips": continue
		var track := out.add_track(kind)
		out.track_set_path(track, NodePath("Armature/Skeleton3D:" + bone))
		out.track_set_interpolation_type(track, Animation.INTERPOLATION_LINEAR)
		var first: Vector3
		for k in src.track_get_key_count(t):
			var time := src.track_get_key_time(t, k)
			if kind == Animation.TYPE_ROTATION_3D:
				out.rotation_track_insert_key(track, time, src.track_get_key_value(t, k))
			else:
				var p: Vector3 = src.track_get_key_value(t, k)
				if k == 0: first = p
				# pin the hips over the feet (falls keep their travel, measured from where they start)
				out.position_track_insert_key(track, time, Vector3(p.x - first.x if free_root else 0.0, p.y, p.z - first.z if free_root else 0.0))
	return out

static var _table: Dictionary

## Every clip by name, ready for sampling by hand: { anim, length, rot: [track per BONES entry, or -1], hips: track or -1 }.
## FighterView reads bone rotations straight from these and blends them itself, which lets it hold a clip at an exact moment
## (a swing is driven by the rules' clock, not by playback).
static func table() -> Dictionary:
	if not _table.is_empty(): return _table
	var lib := library()
	for clip_name in lib.get_animation_list():
		var anim := lib.get_animation(clip_name)
		var rot := []
		rot.resize(BONES.size()); rot.fill(-1)
		var hips := -1
		for t in anim.get_track_count():
			var bone := str(anim.track_get_path(t)).get_slice(":", 1)
			if anim.track_get_type(t) == Animation.TYPE_ROTATION_3D: rot[BONES.find(bone)] = t
			else: hips = t
		# `blade` is the way a gripped sword leaves the fist in this clip's hand pose (it differs between animation sources)
		_table[str(clip_name)] = {"anim": anim, "length": anim.length, "rot": rot, "hips": hips, "blade": anim.get_meta("blade", BLADE)}
	return _table
