extends SceneTree
## Which way should the blade point out of the hand? Measures, over every sword attack at its moment of impact,
## the hand-space direction that points most nearly at the enemy, and compares it with the direction the game uses.
func _init() -> void:
	var roster: Array = Sim.data().roster
	var v := FighterView.new().setup(roster[1]); root.add_child(v)
	await process_frame
	var hand := v.skeleton.find_bone("RightHand")
	var fore := v.skeleton.find_bone("RightForeArm")
	var w: Dictionary = Sim.weapon_of("sword")
	var attacks: Array = w.h + w.v + [w.focusH, w.focusV, w.launch, w.strings.VVV, w.strings.VVH, w.dir.HF]
	var sum := Vector3.ZERO
	var cur_axis := Basis.from_euler(Vector3(PI / 4, 0, 0)) * Vector3.UP
	var cur_score := 0.0
	for a in attacks:
		v.weights = {a.anim[0]: 1.0}; v.times = {a.anim[0]: a.anim[2]}; v._apply()
		v.skeleton.force_update_all_bone_transforms()
		var g: Transform3D = v.skeleton.get_bone_global_pose(hand)
		var basis := (v.skeleton.global_transform * g).basis.orthonormalized()
		var local_fwd := basis.inverse() * Vector3(0, 0, 1)      # the enemy's direction, seen from the hand
		sum += local_fwd
		var d := basis * cur_axis
		var arm: Vector3 = ((v.skeleton.global_transform * g).origin - (v.skeleton.global_transform * v.skeleton.get_bone_global_pose(fore)).origin).normalized()
		cur_score += d.z
		print("%-24s blade now points %s   forearm points %s" % [a.anim[0], d.snapped(Vector3.ONE * 0.01), arm.snapped(Vector3.ONE * 0.01)])
	print("best hand-space direction ", (sum / attacks.size()).normalized().snapped(Vector3.ONE * 0.01), "  agreement ", "%.2f" % (sum.length() / attacks.size()))
	print("current direction         ", cur_axis.snapped(Vector3.ONE * 0.01), "  mean forward ", "%.2f" % (cur_score / attacks.size()))
	for clip in ["Combat_Stance"]:
		v.weights = {clip: 1.0}; v.times = {clip: 0.5}; v._apply(); v.skeleton.force_update_all_bone_transforms()
		print(clip, " blade points ", ((v.skeleton.global_transform * v.skeleton.get_bone_global_pose(hand)).basis.orthonormalized() * cur_axis).snapped(Vector3.ONE * 0.01))
	quit()
