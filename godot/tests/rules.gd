extends SceneTree
## Scripted checks of the fighting rules, tapping the way a real thumb taps. Not part of the game (left out of the APK).
##     godot --headless --path godot --script res://tests/rules.gd

var fails := 0
const TAP := 9   # ticks a thumb tap keeps the button down: 0.15 s

func st(weapon := "sword", skill := "sunburst") -> Dictionary:
	return {"maxHp": 400.0, "maxStam": 400.0, "power": 1.0, "armor": 0.0, "speed": 4.4, "reach": 0.0, "weapon": weapon, "skill": skill}

func check(title: String, ok: bool, extra := "") -> void:
	print(("ok   " if ok else "FAIL ") + title + ("  " + extra if extra != "" else ""))
	if not ok: fails += 1

func fresh(weapon := "sword", gap := 2.1) -> Dictionary:
	var w := Sim.create_world({"R": 19.0, "spawns": [{"x": 0.0, "z": -gap / 2, "yaw": 0.0}, {"x": 0.0, "z": gap / 2, "yaw": PI}]}, st(weapon), st("sword", "rush"))
	while w.phase != "fight": Sim.step_world(w, [Sim.empty_cmd(), Sim.empty_cmd()])
	w.fighters[1].energy = 0.0; w.events.clear()
	return w

func cmd(over := {}) -> Dictionary:
	var c := Sim.empty_cmd(); c.merge(over, true); return c

## Tap the buttons in `s` one after the other. `foe` is a Callable(n, w) -> command, or null.
func play(w: Dictionary, s: String, gap := 20, stick := 0.0, foe = null, ticks := 360, hold := TAP) -> Array:
	var out := []
	var i := 0
	var wait := 0
	var down := 0
	var btn := ""
	for n in ticks:
		var c := cmd({"faceYaw": 0.0, "mz": stick})
		if i < s.length():
			if wait <= 0:
				btn = "h" if s[i] == "H" else "v"; c[btn] = true; down = hold; i += 1; wait = gap
			else: wait -= 1
		if down > 0: c[btn + "Hold"] = true
		down -= 1
		Sim.step_world(w, [c, foe.call(n, w) if foe != null else Sim.empty_cmd()])
		for e in w.events:
			e["n"] = n; out.append(e)
		w.events.clear()
	return out

func hits(events: Array, id := 0) -> Array:
	return events.filter(func(e): return e.type == "hit" and e.id == id)

func has(events: Array, type: String) -> bool:
	return events.any(func(e): return e.type == type)

func _init() -> void:
	for weapon in ["sword", "katana", "mace", "spear"]:
		var w := fresh(weapon)
		var ev := play(w, "HHH")
		var h := hits(ev)
		check("%s: three thumb taps are three quick hits, never a charge" % weapon, h.size() == 3 and not has(ev, "charge") and h[2].title == "Tempest", "%d hits" % h.size())
	var w := fresh()
	var first := hits(play(w, "H", 20, 0.0, null, 40))
	check("a tap lands within a quarter of a second", first.size() > 0 and first[0].n <= 15)
	for weapon in ["sword", "katana"]:
		w = fresh(weapon); var h := hits(play(w, "VVV"))
		check("%s VVV ends in Earthsplitter and floors them" % weapon, h.size() == 3 and h[2].title == "Earthsplitter" and h[2].slam)
		w = fresh(weapon); h = hits(play(w, "HHV"))
		check("%s HHV ends in Rising Fang and launches" % weapon, h.size() == 3 and h[2].title == "Rising Fang" and h[2].launch)
		w = fresh(weapon); h = hits(play(w, "VVH"))
		check("%s VVH ends in Reaper's Arc and throws them back" % weapon, h.size() == 3 and h[2].title == "Reaper's Arc" and Sim.hyp(w.fighters[1].x, w.fighters[1].z) > 3)
	w = fresh("sword", 3.0); var h2 := hits(play(w, "H", 20, 1.0, null, 60))
	check("stick toward + H is a Lunge", h2.size() == 1 and h2[0].title == "Lunge")
	w = fresh("sword", 3.0); h2 = hits(play(w, "V", 20, 1.0, null, 80))
	check("stick toward + V is Skyfall", h2.size() == 1 and h2[0].title == "Skyfall")
	w = fresh(); var z0: float = w.fighters[0].z; var back := 0.0
	for n in 60:
		Sim.step_world(w, [cmd({"faceYaw": 0.0, "mz": -1.0 if n < 6 else 0.0, "h": n == 0, "hHold": n < TAP}), Sim.empty_cmd()])
		back = min(back, w.fighters[0].z - z0)
	check("stick away + H springs back first (Back-step Cut)", back < -0.6, "moved back %.2f m" % -back)
	for btn in ["H", "V"]:
		w = fresh(); var ev := play(w, btn, 20, 0.0, null, 160, 60)
		check("keeping %s held: a quick hit, then the blue strike" % btn, has(ev, "charge") and hits(ev).size() == 2 and hits(ev)[1].blue, "%d hits" % hits(ev).size())
	w = fresh(); var charged := false
	for n in 90:
		Sim.step_world(w, [cmd({"faceYaw": 0.0, "h": n == 0, "hHold": n < 80, "dodge": n == 40}), Sim.empty_cmd()])
		if w.fighters[0].state == "charge": charged = true
	check("dodge cancels a charge", charged and w.fighters[0].state != "attack" and w.fighters[0].state != "charge")

	var guard_foe := func(_n, _w): return cmd({"faceYaw": PI, "guard": true})
	w = fresh(); w.fighters[1].parryCd = 99.0
	var ev2 := play(w, "HH", 20, 0.0, guard_foe, 90)
	check("a held guard blocks normal hits and loses guard meter", ev2.filter(func(e): return e.type == "block").size() == 2 and hits(ev2).size() == 0 and w.fighters[1].guardM < Sim.GUARD_MAX, "guard left %d" % w.fighters[1].guardM)
	w = fresh(); w.fighters[1].parryCd = 99.0
	check("enough blows break a guard", has(play(w, "HHHHHHHHHHHH", 24, 0.0, guard_foe, 480), "guardbreak"))
	w = fresh(); w.fighters[1].parryCd = 99.0
	check("stick away + V (the kick) breaks a guard at once", has(play(w, "V", 20, -1.0, guard_foe, 70), "guardbreak"))
	w = fresh(); w.fighters[1].parryCd = 99.0
	check("a blue charged strike goes through a held guard", hits(play(w, "H", 20, 0.0, guard_foe, 200, 70)).any(func(e): return e.blue))
	w = fresh(); w.fighters[1].parryCd = 99.0; w.fighters[1].yaw = 0.0
	ev2 = play(w, "H", 20, 0.0, func(_n, _w): return cmd({"guard": true}), 40)
	check("a guard does nothing against a blow from behind", hits(ev2).size() == 1 and hits(ev2)[0].backstab)

	w = fresh(); ev2 = play(w, "H", 20, 0.0, func(n, _w): return cmd({"faceYaw": PI, "guard": n >= 4 and n < 12}), 80)
	check("parrying a normal hit deflects it: no damage, weapon kept", has(ev2, "deflect") and hits(ev2).size() == 0 and not w.fighters[0].disarmed and w.fighters[1].hp == 400)
	w = fresh(); ev2 = []
	for n in 240:
		Sim.step_world(w, [cmd({"faceYaw": 0.0, "guard": n >= 54 and n < 70}), cmd({"faceYaw": PI, "v": n == 0, "vHold": n < 50})])
		ev2.append_array(w.events); w.events.clear()
	check("parrying a blue strike disarms the rival and counters", ev2.any(func(e): return e.type == "disarm" and e.id == 1) and ev2.any(func(e): return e.type == "hit" and e.riposte))
	w = fresh(); Sim.step_world(w, [cmd({"guard": true}), Sim.empty_cmd()])
	for n in 30: Sim.step_world(w, [Sim.empty_cmd(), Sim.empty_cmd()])
	Sim.step_world(w, [cmd({"guard": true}), Sim.empty_cmd()])
	check("a parry is on cooldown after an attempt (the guard still goes up)", w.fighters[0].state == "guard" and not w.fighters[0].parryOk)
	w = fresh(); w.fighters[1].merge({"disarmed": true, "disarmT": 6.0, "dropX": 9.0, "dropZ": 9.0}, true); ev2 = []
	for n in 60:
		Sim.step_world(w, [Sim.empty_cmd(), cmd({"faceYaw": PI, "mz": 1.0, "v": n == 0})])
		ev2.append_array(w.events); w.events.clear()
	check("a disarmed fighter can still kick", ev2.any(func(e): return e.type == "hit" and e.id == 1 and e.title == "Guard Breaker"))

	w = fresh(); w.fighters[1].merge({"state": "down", "t": 0.0, "groundHit": false}, true)
	check("a horizontal passes over a fighter on the ground", hits(play(w, "H", 20, 0.0, null, 40)).size() == 0)
	w = fresh(); w.fighters[1].merge({"state": "down", "t": 0.0, "groundHit": false}, true)
	check("a vertical hits a fighter on the ground exactly once", hits(play(w, "VV", 20, 0.0, null, 70)).filter(func(e): return e.ground).size() == 1)
	w = fresh(); w.fighters[0].merge({"state": "stagger", "t": 0.0, "staggerDur": 0.2}, true); var started := false
	for n in 30:
		Sim.step_world(w, [cmd({"faceYaw": 0.0, "h": n == 4}), Sim.empty_cmd()])
		if w.fighters[0].state == "attack": started = true
	check("an attack pressed while reeling comes out once free", started)
	w = fresh(); w.fighters[0].energy = 50.0; Sim.step_world(w, [cmd({"skill": true}), Sim.empty_cmd()])
	check("the special needs a full energy bar", w.fighters[0].state != "attack")
	var before: float = w.fighters[0].energy; play(w, "HHH")
	check("landing hits fills the energy bar", w.fighters[0].energy > before + 15)
	w.fighters[0].energy = 100.0; w.fighters[0].merge({"state": "stagger", "t": 0.0, "staggerDur": 0.6, "parried": false}, true)
	Sim.step_world(w, [cmd({"skill": true}), Sim.empty_cmd()])
	check("a full bar fires the special, even while reeling, and empties", w.fighters[0].state == "attack" and w.fighters[0].atk.skill and w.fighters[0].energy == 0)

	# The rival against itself: every level must be able to finish matches, and a higher level should win more.
	var roster: Array = Sim.data().roster
	for pair in [["hard", "easy"], ["normal", "easy"], ["hard", "normal"]]:
		var wins := [0, 0]
		for m in 30:
			var sa: Dictionary = roster[m % 3].stats
			var sb: Dictionary = roster[(m / 3) % 3].stats
			var world := Sim.create_world({"R": 13.0, "spawns": [{"x": 0.0, "z": -3.0, "yaw": 0.0}, {"x": 0.0, "z": 3.0, "yaw": PI}]}, sa, sb)
			var a := Rival.new(pair[0], 100 + m)
			var b := Rival.new(pair[1], 900 + m)
			var n := 0
			while world.phase != "over" and n < 60 * 600:
				Sim.step_world(world, [a.think(world, 0), b.think(world, 1)]); world.events.clear(); n += 1
			if world.matchWinner >= 0: wins[world.matchWinner] += 1
		check("%s beats %s more often than not" % pair, wins[0] > wins[1], "%d to %d" % wins)
	print("\n%d FAILED" % fails if fails else "\nall passed")
	quit(1 if fails else 0)
