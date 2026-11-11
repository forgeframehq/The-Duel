extends SceneTree
## Every clip the game uses must carry real motion (more than one key on the sword arm, or on the hips for body moves).
func _init() -> void:
	var t := Clips.table()
	var bad := 0
	for n in t:
		var c: Dictionary = t[n]
		var most := 0
		for tr in c.rot: if tr >= 0: most = max(most, c.anim.track_get_key_count(tr))
		if most < 5:
			bad += 1; print("FAIL no motion in clip ", n)
	print("%d clips, %d without motion" % [t.size(), bad])
	quit(1 if bad else 0)
