extends SceneTree
## Reads every animation-driven move out of res://data/rules.json and measures it on a real fighter's skeleton:
##   where the sword hand and the blade are at every 60th of a second of the clip,
##   when the blade is moving fast enough to cut (the damage window),
##   how far the planted foot says the body should travel (so feet do not slide),
##   and the moment the next move may begin.
## Writes res://data/moves.json. Not part of the game (left out of the APK). Run after changing rules.json:
##     godot --headless --path godot --script res://tests/moves_bake.gd
const STEP := 1.0 / 60.0

func _init() -> void:
	var rules: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/rules.json"))
	var wanted := {}
	for w in rules.weapons.values():
		var list: Array = []
		list.append_array(w.h); list.append_array(w.v); list.append_array(w.strings.values()); list.append_array(w.dir.values())
		list.append(w.focusH); list.append(w.focusV)
		for a in list:
			if a.get("path", false): wanted[a.move] = [a.clip, a.start, a.end]
	if OS.get_environment("BAKE_TRY") != "":
		wanted.clear()
		for part in OS.get_environment("BAKE_TRY").split(","):
			var bits := part.split("@"); var r := bits[1].split("-")
			wanted[part] = ["ss_sword_and_shield_" + bits[0], float(r[0]), float(r[1])]
	var view := FighterView.new().setup(rules.roster[1], "f_long", "wood")
	root.add_child(view)
	await process_frame
	await process_frame
	var sk := view.skeleton
	var rhand := sk.find_bone("RightHand")
	var feet := [sk.find_bone("LeftFoot"), sk.find_bone("RightFoot")]
	var inv := view.global_transform.affine_inverse()
	var out := {}
	for key in wanted:
		var clip: String = wanted[key][0]
		var start: float = wanted[key][1]
		var end: float = wanted[key][2]
		var total: Vector3 = view.clips[clip].anim.get_meta("travel", Vector3.ZERO)
		var length: float = view.clips[clip].length
		# sample the whole clip, so the travel can be shared out over it and then cut to the stretch in use
		var n_all := int(ceil(length / STEP)) + 1
		var hand := []; var dir := []; var foot := []
		for i in n_all:
			view.weights = {clip: 1.0}; view.times = {clip: min(i * STEP, length)}
			view._apply(); sk.force_update_all_bone_transforms()
			# (bone attachments only follow the skeleton once a frame is drawn, so the sword's place is worked out from the hand bone)
			var g: Transform3D = inv * sk.global_transform * sk.get_bone_global_pose(rhand) * Transform3D(Basis().scaled(Vector3.ONE * 100.0), Vector3.ZERO) * view.held.transform
			hand.append(g.origin); dir.append((g.basis * Vector3.UP).normalized())
			var fp := []
			for b in feet: fp.append(inv * (sk.global_transform * sk.get_bone_global_pose(b)).origin)
			foot.append(fp)
		# the planted foot: the lower one, when it is near the ground. The body moves opposite to how that foot slides.
		var floor_y := 1e9
		for fp in foot: floor_y = min(floor_y, min(fp[0].y, fp[1].y))
		var trav := [Vector2.ZERO]
		var vel := Vector2.ZERO
		for i in range(1, n_all):
			var k := 0 if foot[i][0].y < foot[i][1].y else 1
			if foot[i][k].y < floor_y + 0.07 and foot[i - 1][k].y < floor_y + 0.07:
				var d: Vector3 = foot[i][k] - foot[i - 1][k]
				vel = Vector2(-d.x, -d.z)
			trav.append(trav[i - 1] + vel)
		# make the whole clip cover exactly what the source animation covered (and nothing, if it stood still)
		var raw: Vector2 = trav[n_all - 1]
		var sx: float = total.x / raw.x if absf(raw.x) > 0.25 and absf(total.x) > 0.25 else 0.0
		var sz: float = total.z / raw.y if absf(raw.y) > 0.25 and absf(total.z) > 0.25 else 0.0
		sx = clampf(sx, 0.0, 2.5); sz = clampf(sz, 0.0, 2.5)
		var i0 := int(round(start / STEP)); var i1: int = min(n_all - 1, int(round(end / STEP)))
		# the blade tip's speed: where it peaks is the cut
		var L := 0.9
		var speed := []
		for i in range(i0, i1 + 1):
			var a: Vector3 = hand[max(i - 1, 0)] + dir[max(i - 1, 0)] * L
			var b: Vector3 = hand[min(i + 1, n_all - 1)] + dir[min(i + 1, n_all - 1)] * L
			speed.append(a.distance_to(b) / (2 * STEP))
		var pk := 0
		var score := []
		for i in speed.size():
			# only count moments when the blade is out in front of the body
			var tip: Vector3 = hand[i0 + i] + dir[i0 + i] * L
			score.append(speed[i] * clampf(tip.z, 0.0, 1.2))      # fast and reaching forward: that is the cut, not the draw-back
			if score[i] > score[pk]: pk = i
		var lo := pk; var hi := pk
		while lo > 0 and speed[lo - 1] > speed[pk] * 0.5 and pk - lo < 9: lo -= 1
		while hi < speed.size() - 1 and speed[hi + 1] > speed[pk] * 0.5 and hi - pk < 9: hi += 1
		if hi - lo < 4: hi = min(speed.size() - 1, lo + 4)
		# the follow-through is over, and the next move may start, once the blade has slowed to a quarter of its peak
		var cn := hi
		while cn < speed.size() - 1 and speed[cn] > speed[pk] * 0.25: cn += 1
		cn = min(speed.size() - 1, max(cn, hi + 4))
		var reach := 0.0
		if OS.get_environment("BAKE_SHOW") != "" and key.contains(OS.get_environment("BAKE_SHOW")):
			for i in range(0, speed.size(), 3): print("   t %.2f  tip speed %5.1f  tip forward %.2f  tip height %.2f  hand forward %.2f" % [start + i * STEP, speed[i], hand[i0 + i].z + dir[i0 + i].z * L, hand[i0 + i].y + dir[i0 + i].y * L, hand[i0 + i].z])
		var m := {"clip": clip, "start": start, "end": end, "hit0": start + lo * STEP, "peak": start + pk * STEP, "hit1": start + hi * STEP, "cancel": start + cn * STEP,
			"peakSpeed": snappedf(speed[pk], 0.1), "hx": [], "hy": [], "hz": [], "dx": [], "dy": [], "dz": [], "tx": [], "tz": []}
		for i in range(i0, i1 + 1):
			m.hx.append(snappedf(hand[i].x, 0.001)); m.hy.append(snappedf(hand[i].y, 0.001)); m.hz.append(snappedf(hand[i].z, 0.001))
			m.dx.append(snappedf(dir[i].x, 0.001)); m.dy.append(snappedf(dir[i].y, 0.001)); m.dz.append(snappedf(dir[i].z, 0.001))
			m.tx.append(snappedf((trav[i].x - trav[i0].x) * sx, 0.001)); m.tz.append(snappedf((trav[i].y - trav[i0].y) * sz, 0.001))
			if i - i0 >= lo and i - i0 <= hi: reach = max(reach, hand[i].z + dir[i].z * L)
		m["reach"] = snappedf(reach, 0.01)       # how far forward a 0.9 m blade gets during the cut
		out[key] = m
		var ta: Vector3 = hand[i0 + lo] + dir[i0 + lo] * L; var tb: Vector3 = hand[i0 + hi] + dir[i0 + hi] * L
		print("      blade tip goes from height %.2f to %.2f, and across from %.2f to %.2f" % [ta.y, tb.y, ta.x, tb.x])
		print("%-44s cut %.2f-%.2f (peak %.2f, %.1f m/s)  next move from %.2f  reach %.2f  travel to cut %.2f, in all %.2f / %.2f sideways" % [key, m.hit0, m.hit1, m.peak, speed[pk], m.cancel, reach, m.tz[lo], m.tz[m.tz.size() - 1], m.tx[m.tx.size() - 1]])
	if OS.get_environment("BAKE_TRY") != "":
		quit(); return
	var f := FileAccess.open("res://data/moves.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(out))
	f.close()
	quit()
