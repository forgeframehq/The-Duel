class_name Sim
## The rules of a fight. No drawing, no touch input: the world moves forward in fixed steps (60 a second)
## from one command per fighter, so the same rules serve the player, the rival and the automatic checks.
## This is build 20's rule set (src/sim.js in the web edition) carried over line for line.
##
##   a tap is a quick attack; three in a row make a string, and the order of the buttons picks the finisher
##   the stick held toward or away from the enemy turns the press into a different move (lunge, back-step cut, leap, kick)
##   holding the button on after the hit winds up a blue charged strike, which normal attacks cannot stop
##   holding Guard raises the shield: it blocks from the front, and every blocked blow wears the guard meter down
##   pressing Guard just as a blow lands is a parry: the attacker is thrown off balance and the next hit on them is a riposte
##   a heavy attack (hold the button) takes most of a guard in one blow; a kick knocks a shield aside; a special ignores it
## (Fencing rules, Godot 0.9: every fighter has a one-handed weapon and a shield. No disarming, no air combos.)

const TICK := 1.0 / 60.0
const ROUND_TIME := 99.0
const ROUNDS_TO_WIN := 2
const DODGE_TIME := 0.55
## Keep the attack button down this long after pressing it and the fighter winds up a charge. Longer than any thumb tap.
const CHARGE_AFTER := 0.3
const MIN_CHARGE := 0.3
const FULL_CHARGE := 0.9
const MAX_CHARGE := 1.5
const PARRY_WINDOW := 0.24
const PARRY_CD := 1.4
const GUARD_MIN := 0.3
const GUARD_MAX := 100.0
const DISARM_TIME := 7.0
const PICKUP_RANGE := 1.0
const BUFFER_TIME := 0.28
const STRING_GAP := 0.75
const AIR_TIME := 1.05
const JUGGLE_MAX := 3
const DOWN_TIME := 0.7
const GETUP_TIME := 0.7
const AIR_HEIGHT := 1.5
const WINDED_TIME := 1.6
const RADIUS := 0.48

static var _data: Dictionary

## Weapons, specials, difficulty levels and the roster, read once from res://data/rules.json.
static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://data/rules.json"))
		_data["moves"] = JSON.parse_string(FileAccess.get_file_as_string("res://data/moves.json")) if FileAccess.file_exists("res://data/moves.json") else {}
		for w in _data.weapons.values(): _time_moves(w, _data.moves)
		for sk in _data.skills.values():
			if sk.atk != null: sk.atk.merge({"path": false, "cancel": 0.0, "rate": 1.0})
	return _data

## Animation first. A `path` move takes its timing from its clip (measured by tests/moves_bake.gd), played at the sword's
## pace: the wind-up lasts until the blade is moving fast enough to cut, the cut lasts while it is, and `cancel` is the
## moment in the follow-through from which the next move of a string may begin. Nothing is squeezed or stretched to fit.
static func _time_moves(w: Dictionary, moves: Dictionary) -> void:
	var list: Array = []
	list.append_array(w.h); list.append_array(w.v); list.append_array(w.strings.values()); list.append_array(w.dir.values())
	list.append(w.focusH); list.append(w.focusV); list.append(w.launch); list.append(w.riposte)
	for a in list:
		if a.has("m"): continue          # one move can sit in two places (the third Horizontal is also Tempest)
		a["cancel"] = 0.0; a["rate"] = 1.0
		if not a.get("path", false) or not moves.has(a.move):
			a["path"] = false; continue
		var m: Dictionary = moves[a.move]
		var rate: float = a.rate0 * w.get("rate", 1.0)
		a.rate = rate; a["m"] = m
		a.windup = (m.hit0 - m.start) / rate
		a.active = (m.hit1 - m.hit0) / rate
		a.recover = (m.end - m.hit1) / rate
		a.cancel = (m.cancel - m.start) / rate
		a.anim = [m.clip, m.start, m.peak, m.end]
		a.hold = m.start
		a.range = m.reach - 0.9 + w.len + 0.75        # for the rival's judgement of distance only: hits are decided by the blade

static func weapon_of(id: String) -> Dictionary:
	var w: Dictionary = data().weapons
	return w.get(id, w.f_long)

## A value from one of a move's per-frame lists (60 a second of clip time) at clip time `ct`, blended between frames.
static func _at(list: Array, ct: float) -> float:
	var x: float = clampf(ct * 60.0, 0.0, list.size() - 1.0)
	var i := int(x)
	if i >= list.size() - 1: return list[list.size() - 1]
	return lerpf(list[i], list[i + 1], x - i)

## The blade of a fighter in a `path` attack, at clip time `ct` (seconds after the move's start): [hand, tip] in the world,
## each a Vector3 (y is height). Its length is the sword's own, so a longer sword really does reach further.
static func blade_at(f: Dictionary, ct: float) -> Array:
	var m: Dictionary = f.atk.m
	var c := cos(f.yaw); var s := sin(f.yaw)
	var hx := _at(m.hx, ct); var hz := _at(m.hz, ct)
	var L: float = f.weapon.get("len", 0.9) + f.stats.reach * 0.5
	var tx := hx + _at(m.dx, ct) * L; var tz := hz + _at(m.dz, ct) * L
	return [Vector3(f.x + hx * c + hz * s, _at(m.hy, ct), f.z - hx * s + hz * c),
		Vector3(f.x + tx * c + tz * s, _at(m.hy, ct) + _at(m.dy, ct) * L, f.z - tx * s + tz * c)]

## Has the attack reached the point in its follow-through where the next move of a string may begin?
static func can_chain(f: Dictionary) -> bool:
	if f.state != "attack" or f.atk.focus: return false
	return f.t >= _cancel_at(f)

static func _cancel_at(f: Dictionary) -> float:
	var a: Dictionary = f.atk
	var total: float = a.windup + a.active + a.recover
	if not a.path: return total
	# a cut that touched nothing has to be carried further through before the next one: an opening for the other side
	return a.cancel if f.connected else (a.cancel + total) * 0.5

static func shield_of(id: String) -> Dictionary:
	var s: Dictionary = data().shields
	return s.get(id, s.wood)

static func skill_of(id: String) -> Dictionary:
	var s: Dictionary = data().skills
	return s.get(id, s.wind)

## The attack that comes out for a string of presses such as "H", "HV" or "VVH" (the last letter is the press just made).
static func attack_for(w: Dictionary, s: String) -> Dictionary:
	if w.strings.has(s): return w.strings[s]
	var list: Array = w.h if s[s.length() - 1] == "H" else w.v
	return list[min(s.length() - 1, list.size() - 1)]

static func empty_cmd() -> Dictionary:
	return {"mx": 0.0, "mz": 0.0, "faceYaw": null, "h": false, "v": false, "hHold": false, "vHold": false,
		"guard": false, "plain": false, "dodge": false, "skill": false, "sprint": false}

static func default_stats() -> Dictionary:
	return {"maxHp": 100.0, "maxStam": 100.0, "power": 1.0, "armor": 0.0, "speed": 4.4, "reach": 0.0, "weapon": "sword", "skill": "wind"}

static func hyp(a: float, b: float) -> float:
	return sqrt(a * a + b * b)

static func wrap_angle(a: float) -> float:
	return wrapf(a, -PI, PI)

static func ang_diff(a: float, b: float) -> float:
	return wrap_angle(b - a)

static func _turn_toward(cur: float, target: float, max_step: float) -> float:
	return wrap_angle(cur + clampf(ang_diff(cur, target), -max_step, max_step))

static func _fresh() -> Dictionary:
	return {"state": "idle", "t": 0.0, "atk": {}, "btn": "", "seq": "", "seqT": 0.0, "bufBtn": "", "bufT": 0.0, "hitDone": false, "swung": false, "queue": "",
		"disarmed": false, "disarmT": 0.0, "dropX": 0.0, "dropZ": 0.0, "groundHit": false, "floored": false, "launched": false,
		"held": false, "guardM": GUARD_MAX, "guardRest": 0.0, "parryCd": 0.0, "parryOk": false,
		"charge": "", "chargeMul": 1.0, "juggle": 0, "airDur": AIR_TIME, "buffT": 0.0, "staggerDur": 0.0, "parried": false, "bounced": false,
		"connected": false, "winded": 0.0, "regenDelay": 0.0, "warp": 1.0}

static func _make_fighter(id: int, stats: Dictionary) -> Dictionary:
	var f := {"id": id, "stats": stats, "weapon": weapon_of(stats.weapon), "shield": shield_of(stats.get("shield", "wood")), "skill": skill_of(stats.skill),
		"x": 0.0, "z": 0.0, "vx": 0.0, "vz": 0.0, "yaw": 0.0, "hp": stats.maxHp, "stam": stats.maxStam, "swingId": 0, "ddx": 0.0, "ddz": 0.0, "energy": 30.0}
	f.merge(_fresh())
	return f

## arena: { R, spawns: [{x, z, yaw}, {x, z, yaw}] }
static func create_world(arena: Dictionary, stats_a: Dictionary, stats_b: Dictionary) -> Dictionary:
	var w := {"R": arena.R, "spawns": arena.spawns, "fighters": [_make_fighter(0, stats_a), _make_fighter(1, stats_b)],
		"phase": "intro", "phaseT": 0.0, "round": 1, "score": [0, 0], "timeLeft": ROUND_TIME, "winner": -1, "matchWinner": -1, "events": [], "tick": 0}
	reset_round(w)
	return w

static func reset_round(w: Dictionary) -> void:
	for i in 2:
		var f: Dictionary = w.fighters[i]
		var s: Dictionary = w.spawns[i]
		f.merge(_fresh(), true)
		f.x = s.x; f.z = s.z; f.vx = 0.0; f.vz = 0.0; f.yaw = s.yaw; f.hp = f.stats.maxHp; f.stam = f.stats.maxStam
	w.phase = "intro"; w.phaseT = 0.0; w.timeLeft = ROUND_TIME; w.winner = -1
	w.events.append({"type": "round", "round": w.round})

static func _end_round(w: Dictionary, winner: int, timeout: bool) -> void:
	w.phase = "ko"; w.phaseT = 0.0; w.winner = winner
	if winner >= 0:
		w.score[winner] += 1
		if w.score[winner] >= ROUNDS_TO_WIN: w.matchWinner = winner
	w.events.append({"type": "roundend", "winner": winner, "timeout": timeout})

static func step_world(w: Dictionary, cmds: Array) -> void:
	w.tick += 1; w.phaseT += TICK
	var a: Dictionary = w.fighters[0]
	var b: Dictionary = w.fighters[1]
	var live: bool = w.phase == "fight"
	if w.phase == "intro" and w.phaseT >= 2.2:
		w.phase = "fight"; w.phaseT = 0.0; w.events.append({"type": "fight"})
	if live:
		w.timeLeft -= TICK
		if w.timeLeft <= 0:
			w.timeLeft = 0.0
			var ra: float = a.hp / a.stats.maxHp
			var rb: float = b.hp / b.stats.maxHp
			_end_round(w, -1 if ra == rb else (0 if ra > rb else 1), true)
	var idle := empty_cmd()
	_update_fighter(a, cmds[0] if live else idle, b, w)
	_update_fighter(b, cmds[1] if live else idle, a, w)
	if w.phase == "fight":
		# Both swings are found before either lands, so an even exchange is fair to both sides.
		var ha := _find_hit(a, b)
		var hb := _find_hit(b, a)
		if not ha.is_empty() and not hb.is_empty() and not ha.focus and not hb.focus: _clash(a, b, w)
		else:
			if not ha.is_empty(): _apply_hit(a, b, ha, w)
			if not hb.is_empty(): _apply_hit(b, a, hb, w)
	_separate(a, b)
	_collide(a, w); _collide(b, w)
	if w.phase == "fight" and (a.state == "dead" or b.state == "dead"):
		var both: bool = a.state == "dead" and b.state == "dead"
		_end_round(w, -1 if both else (1 if a.state == "dead" else 0), false)
	if w.phase == "ko" and w.phaseT >= 3.6:
		if w.matchWinner >= 0:
			w.phase = "over"; w.events.append({"type": "matchover", "winner": w.matchWinner})
		else:
			w.round += 1; reset_round(w)

## Spending stamina. Running dry leaves the fighter winded: for a moment they cannot attack, guard, dodge or sprint.
static func _spend(f: Dictionary, amount: float, delay: float, w: Dictionary) -> void:
	f.stam -= amount; f.regenDelay = max(f.regenDelay, delay)
	if f.stam <= 0:
		f.stam = 0.0
		if f.winded <= 0:
			f.winded = WINDED_TIME; f.regenDelay = 1.0; w.events.append({"type": "winded", "id": f.id})

static func _begin_swing(f: Dictionary, atk: Dictionary, w: Dictionary) -> void:
	f.state = "attack"; f.t = 0.0; f.atk = atk; f.hitDone = false; f.connected = false; f.swung = false; f.swingId += 1; f.warp = 1.0
	w.events.append({"type": "windup", "id": f.id, "heavy": atk.focus})

## Is the stick held toward ("F") or away from ("B") the way the fighter faces?
static func _stick_dir(f: Dictionary, cmd: Dictionary) -> String:
	var mag := hyp(cmd.mx, cmd.mz)
	if mag < 0.55: return ""
	var along: float = (cmd.mx * sin(f.yaw) + cmd.mz * cos(f.yaw)) / mag
	return "F" if along > 0.6 else ("B" if along < -0.6 else "")

static func _start_attack(f: Dictionary, btn: String, w: Dictionary, cmd: Dictionary) -> bool:
	var dir := _stick_dir(f, cmd)
	var special: Dictionary = f.weapon.dir.get(btn + dir, {}) if dir != "" else {}
	# With the weapon knocked away, the only attack left is the kick.
	if f.disarmed and not (not special.is_empty() and special.kick):
		w.events.append({"type": "unarmed", "id": f.id}); return false
	if f.winded > 0 or f.stam <= 0: return false
	# A directional move stands alone and ends any string; otherwise the press continues the string.
	var s: String = "" if not special.is_empty() else ("" if f.seq.length() >= 3 else f.seq) + btn
	var atk: Dictionary = special if not special.is_empty() else attack_for(f.weapon, s)
	_spend(f, atk.stam, 0.7, w)
	f.chargeMul = 1.0; f.seq = s; f.btn = btn; f.held = true
	_begin_swing(f, atk, w)
	w.events.append({"type": "string", "id": f.id, "seq": s, "title": atk.title})
	return true

static func _end_string(f: Dictionary, w: Dictionary) -> void:
	if f.seq != "":
		f.seq = ""; w.events.append({"type": "string", "id": f.id, "seq": "", "title": ""})
	f.seqT = 0.0

## The fighter's special. Paid for with a full energy bar, which fills by landing hits, taking them and parrying.
static func _start_skill(f: Dictionary, w: Dictionary) -> bool:
	if f.energy < 100: return false
	var sk: Dictionary = f.skill
	var has_atk: bool = sk.atk != null
	if has_atk and sk.atk.armed and f.disarmed:
		w.events.append({"type": "unarmed", "id": f.id}); return false
	f.energy = 0.0
	w.events.append({"type": "skill", "id": f.id, "name": sk.name, "kind": sk.atk.name if has_atk else "wind"})
	if has_atk:
		f.chargeMul = 1.0; _end_string(f, w); f.parried = false; f.bounced = false; _begin_swing(f, sk.atk, w)
	else:
		f.stam = f.stats.maxStam; f.winded = 0.0; f.regenDelay = 0.0; f.buffT = sk.buff
	return true

static func _gain(f: Dictionary, amount: float) -> void:
	f.energy = min(100.0, f.energy + amount)

## Raising the guard. The first instant is a parry attempt if the parry is off cooldown.
## (`plain` raises it with no parry attempt: the rival uses that, so it does not parry by reflex every time it blocks.)
static func _start_guard(f: Dictionary, w: Dictionary, plain: bool) -> bool:
	if f.disarmed or f.winded > 0: return false
	f.state = "guard"; f.t = 0.0; _end_string(f, w); f.queue = ""
	f.parryOk = f.parryCd <= 0 and not plain
	if f.parryOk: f.parryCd = PARRY_CD
	w.events.append({"type": "guardup", "id": f.id, "parry": f.parryOk})
	return true

static func _start_dodge(f: Dictionary, cmd: Dictionary, w: Dictionary) -> bool:
	if f.winded > 0 or f.stam <= 0: return false
	var dx: float = cmd.mx
	var dz: float = cmd.mz
	var m := hyp(dx, dz)
	if m > 0.2: dx /= m; dz /= m
	else: dx = -sin(f.yaw); dz = -cos(f.yaw)
	f.ddx = dx; f.ddz = dz
	_spend(f, 20, 0.6, w)
	f.state = "dodge"; f.t = 0.0; f.charge = ""; f.queue = ""
	w.events.append({"type": "dodge", "id": f.id})
	return true

static func dodge_invulnerable(f: Dictionary) -> bool:
	return f.state == "dodge" and f.t >= 0.03 and f.t <= 0.38

## While charging and while the charged strike is coming out, normal attacks cannot stop a fighter.
static func armored(f: Dictionary) -> bool:
	return f.state == "charge" or (f.state == "attack" and f.atk.focus and f.t < f.atk.windup + f.atk.active)

static func parrying(f: Dictionary) -> bool:
	return f.state == "guard" and f.parryOk and f.t <= f.shield.parry      # a small shield is quicker to bring across

static func _face(f: Dictionary, cmd: Dictionary, rate: float) -> void:
	if cmd.faceYaw != null: f.yaw = _turn_toward(f.yaw, cmd.faceYaw, rate * TICK)
	elif hyp(cmd.mx, cmd.mz) > 0.25: f.yaw = _turn_toward(f.yaw, atan2(cmd.mx, cmd.mz), rate * TICK)

static func _update_fighter(f: Dictionary, cmd: Dictionary, other: Dictionary, w: Dictionary) -> void:
	var dt := TICK
	f.t += dt
	var fx := sin(f.yaw)
	var fz := cos(f.yaw)

	if f.state != "dead":
		if f.winded > 0: f.winded -= dt
		if f.buffT > 0: f.buffT -= dt
		if f.parryCd > 0: f.parryCd -= dt
		# The guard meter comes back once the fighter has gone a moment without blocking.
		if f.guardRest > 0: f.guardRest -= dt
		elif f.guardM < GUARD_MAX: f.guardM = min(GUARD_MAX, f.guardM + 26 * dt)
		if f.regenDelay > 0: f.regenDelay -= dt
		elif f.state == "idle" or f.state == "stagger": f.stam = min(f.stats.maxStam, f.stam + 26 * dt)
		# Remember an attack pressed a moment too early, so it comes out as soon as the fighter is free.
		if f.bufT > 0: f.bufT -= dt
		if (cmd.h or cmd.v) and f.state != "idle" and f.state != "attack" and f.state != "charge":
			f.bufBtn = "H" if cmd.h else "V"; f.bufT = BUFFER_TIME
		# Disarmed: the weapon lies where it fell until its owner reaches it.
		if f.disarmed:
			f.disarmT -= dt
			var near: bool = hyp(f.x - f.dropX, f.z - f.dropZ) < PICKUP_RANGE
			if (near and (f.state == "idle" or f.state == "dodge")) or f.disarmT <= 0:
				f.disarmed = false; w.events.append({"type": "pickup", "id": f.id, "x": f.x, "z": f.z})

	var tvx := 0.0
	var tvz := 0.0
	var accel := 14.0

	match f.state:
		"idle":
			if f.seqT > 0:
				f.seqT -= dt
				if f.seqT <= 0: _end_string(f, w)
			var done := false
			if cmd.dodge and _start_dodge(f, cmd, w): done = true
			elif cmd.skill and _start_skill(f, w): done = true
			if not done:
				var press: String = "H" if cmd.h else ("V" if cmd.v else (f.bufBtn if f.bufT > 0 else ""))
				if press != "":
					f.bufT = 0.0
					if _start_attack(f, press, w, cmd): done = true
			if not done and cmd.guard and _start_guard(f, w, cmd.plain): done = true
			if not done:
				var sp: float = f.stats.speed
				var mag: float = min(1.0, hyp(cmd.mx, cmd.mz))
				if cmd.sprint and mag > 0.5 and f.winded <= 0 and f.stam > 0:
					sp *= 1.5; _spend(f, 13 * dt, 0.35, w)
				if f.winded > 0: sp *= 0.8
				# Backpedalling while facing the enemy is slower than advancing.
				if mag > 0.1 and cmd.faceYaw != null:
					var along: float = (cmd.mx * fx + cmd.mz * fz) / mag
					if along < 0: sp *= 1 + 0.3 * along
				tvx = cmd.mx * sp; tvz = cmd.mz * sp
				_face(f, cmd, 11)
		"attack":
			# A swing that touches nothing takes longer to recover from: an opening for the other side.
			var a: Dictionary = f.atk
			var recover: float = a.recover * (1.0 if (a.path or f.connected or f.t < a.windup + a.active) else 1.4)
			var total: float = a.windup + a.active + recover
			# Presses made during a swing wait their turn (two at most), so a string can be tapped out quickly.
			if cmd.h: f.queue = (f.queue + "H").substr(0, 2)
			if cmd.v: f.queue = (f.queue + "V").substr(0, 2)
			# The button kept down ever since the press, through the quick hit: wind up a charge. A tap never does this.
			if not (cmd.hHold if f.btn == "H" else cmd.vHold): f.held = false
			if f.held and not a.focus and not a.launch and not a.ender and not a.solo and a.name != "riposte" and f.t >= max(CHARGE_AFTER, a.windup + a.active):
				f.state = "charge"; f.t = 0.0; f.charge = "h" if f.btn == "H" else "v"; f.queue = ""
				_end_string(f, w)
				w.events.append({"type": "charge", "id": f.id})
			else:
				if f.t < a.windup: _face(f, cmd, 9 if a.focus else 7)
				var gap := hyp(other.x - f.x, other.z - f.z)
				if a.path:
					# The body goes where the animation's own steps carry it (measured from the planted foot), so feet do not
					# slide. Before the cut the stride is lengthened or shortened so the blade arrives at the enemy: never
					# more than 1.7 times the clip's own step, and never through them.
					var m: Dictionary = a.m
					var ct0: float = (f.t - dt) * a.rate; var ct1: float = f.t * a.rate
					var dzl := _at(m.tz, ct1) - _at(m.tz, ct0)
					var dxl := _at(m.tx, ct1) - _at(m.tx, ct0)
					var blade_reach: float = m.reach - 0.9 + f.weapon.get("len", 0.9)
					if f.t < a.windup + a.active:
						var need: float = gap - blade_reach * 0.82
						var left: float = _at(m.tz, a.windup * a.rate) - _at(m.tz, ct0)
						if left > 0.08: f.warp = clampf(need / left, 0.0, 1.7)
						else:
							# a clip that cuts on the spot: a short step in, if the enemy is just out of reach
							f.warp = 1.0
							var time_left: float = max(a.windup - f.t, dt)
							if need > 0.0 and f.t < a.windup: dzl += min(min(need, 0.55) / time_left, 2.6) * dt
					else:
						f.warp = min(f.warp, 1.0)
					if gap < RADIUS * 2 + 0.25 and dzl > 0: dzl = 0.0
					dzl *= f.warp; dxl *= min(f.warp, 1.0)
					f.vx = (dxl * fz + dzl * fx) / dt; f.vz = (-dxl * fx + dzl * fz) / dt
					accel = 0.0
				else:
					if f.t > a.windup * (0.3 if a.dash else 0.55) and f.t < a.windup + a.active and gap > 1.35:
						tvx = fx * a.lunge; tvz = fz * a.lunge
					# A back-step move springs away from the enemy first, then comes back in with the cut.
					if a.back > 0 and f.t < a.windup * 0.55:
						tvx = -fx * a.back; tvz = -fz * a.back
					accel = 18.0
				if not f.swung and f.t >= a.windup:
					f.swung = true; w.events.append({"type": "swing", "id": f.id, "heavy": a.focus})
				var free: bool = a.launch or a.name == "riposte"
				# A string is three presses at most; a finisher, a charged strike or a special always ends one.
				var ended: bool = a.focus or a.ender or a.solo or free or f.seq.length() >= 3
				var cancel_at: float = _cancel_at(f)
				if cmd.dodge and f.t >= (cancel_at if a.path else a.windup + a.active + recover * 0.45) and _start_dodge(f, cmd, w): pass
				elif a.path and f.t >= cancel_at and f.t < total and f.queue != "" and not a.focus and (not ended or a.solo):
					# The next cut of a string flows out of this one's follow-through, without waiting for the sword to come home.
					var q0: String = f.queue.substr(0, 1)
					f.state = "idle"; f.t = 0.0; f.queue = f.queue.substr(1); f.seqT = STRING_GAP; f.vx = 0.0; f.vz = 0.0
					if not _start_attack(f, q0, w, cmd): f.queue = ""
				elif f.t >= total:
					var q: String = f.queue.substr(0, 1)
					f.state = "idle"; f.t = 0.0; f.queue = f.queue.substr(1); f.seqT = STRING_GAP
					if a.path: f.vx = 0.0; f.vz = 0.0
					if ended: _end_string(f, w)
					if a.focus: f.queue = ""
					# After a finisher there is a breath before the next string, except after the uppercut or a counter.
					elif q != "" and (not ended or free or a.solo): _start_attack(f, q, w, cmd)
					else: f.queue = ""
		"charge":
			# Rooted to a slow walk, glowing, and unstoppable by normal attacks. Dodging out of it is a feint.
			if cmd.dodge and _start_dodge(f, cmd, w): pass
			else:
				f.regenDelay = max(f.regenDelay, 0.5)
				var sp2: float = f.stats.speed * 0.3
				tvx = cmd.mx * sp2; tvz = cmd.mz * sp2
				_face(f, cmd, 6)
				var held: bool = cmd.hHold if f.charge == "h" else cmd.vHold
				if (not held and f.t >= MIN_CHARGE) or f.t >= MAX_CHARGE:
					var atk: Dictionary = f.weapon.focusH if f.charge == "h" else f.weapon.focusV
					f.chargeMul = 1 + 0.3 * clampf((f.t - MIN_CHARGE) / (FULL_CHARGE - MIN_CHARGE), 0, 1)
					_spend(f, atk.stam, 0.9, w)
					f.charge = ""
					_begin_swing(f, atk, w)
		"guard":
			# Weapon up, moving slowly, facing the enemy. An attack, a dodge or a special can come straight out of it.
			if cmd.dodge and _start_dodge(f, cmd, w): pass
			elif cmd.skill and _start_skill(f, w): pass
			elif (cmd.h or cmd.v) and _start_attack(f, "H" if cmd.h else "V", w, cmd): pass
			else:
				var sp3: float = f.stats.speed * 0.42
				tvx = cmd.mx * sp3; tvz = cmd.mz * sp3
				_face(f, cmd, 8)
				if not cmd.guard and f.t >= GUARD_MIN:
					f.state = "idle"; f.t = 0.0
		"dodge":
			var k: float = 1 - f.t / DODGE_TIME
			var sp4: float = 8.8 * (0.35 + 0.65 * k)
			f.vx = f.ddx * sp4; f.vz = f.ddz * sp4; accel = 0.0
			if cmd.faceYaw != null: f.yaw = _turn_toward(f.yaw, cmd.faceYaw, 6 * dt)
			if f.t >= DODGE_TIME:
				f.state = "idle"; f.t = 0.0
		"air":
			# Knocked off the ground and helpless until landing.
			accel = 3.0
			if f.t >= f.airDur:
				f.state = "down"; f.t = 0.0; f.groundHit = false; f.vx = 0.0; f.vz = 0.0
				w.events.append({"type": "land", "id": f.id, "x": f.x, "z": f.z})
		"down":
			accel = 12.0
			if f.t >= DOWN_TIME:
				f.state = "getup"; f.t = 0.0
		"getup":
			accel = 12.0
			if f.t >= GETUP_TIME:
				f.state = "idle"; f.t = 0.0
		"stagger":
			accel = 6.0
			# A special can be fired while reeling from a hit (though not while thrown open by a parry).
			if cmd.skill and not f.parried and _start_skill(f, w): pass
			elif f.t >= f.staggerDur:
				f.state = "idle"; f.t = 0.0; f.parried = false; f.bounced = false
		"dead":
			accel = 5.0

	if accel > 0:
		var k2: float = min(1.0, accel * dt)
		f.vx += (tvx - f.vx) * k2; f.vz += (tvz - f.vz) * k2
	f.x += f.vx * dt; f.z += f.vz * dt

static func _stagger(f: Dictionary, dur: float, kx: float, kz: float, parried := false, bounced := false) -> void:
	f.state = "stagger"; f.t = 0.0; f.staggerDur = dur; f.parried = parried; f.bounced = bounced
	f.vx = kx; f.vz = kz; f.queue = ""; f.charge = ""; f.seq = ""; f.seqT = 0.0

## Knocked flat on the ground. One vertical attack can reach a fighter there before they get up.
static func _floor(f: Dictionary, kx: float, kz: float) -> void:
	f.state = "down"; f.t = 0.0; f.groundHit = false; f.vx = kx; f.vz = kz; f.queue = ""; f.charge = ""; f.seq = ""; f.seqT = 0.0

## The weapon flies out of a parried fighter's hand and lands a few steps away, off to one side.
static func _disarm(a: Dictionary, b: Dictionary, w: Dictionary) -> void:
	var away := atan2(a.x - b.x, a.z - b.z)
	var x: float = a.x
	var z: float = a.z
	var found := false
	for d in [4.2, 3.0, 2.0]:
		for turn in [0.95, -0.95, 2.0, -2.0, 0.0]:
			var cx: float = a.x + sin(away + turn) * d
			var cz: float = a.z + cos(away + turn) * d
			if hyp(cx, cz) > w.R - 1.6: continue
			x = cx; z = cz; found = true
			break
		if found: break
	a.disarmed = true; a.disarmT = DISARM_TIME; a.dropX = x; a.dropZ = z
	w.events.append({"type": "disarm", "id": a.id, "x": x, "z": z})

## The attack that is landing on b this instant, or {} if none is.
static func _find_hit(a: Dictionary, b: Dictionary) -> Dictionary:
	# A fighter getting up cannot be hit, and one lying on the ground only once and only by a vertical attack.
	if a.state != "attack" or a.hitDone or b.state == "dead" or b.state == "getup": return {}
	var atk: Dictionary = a.atk
	if b.state == "down" and (not atk.ground or b.groundHit): return {}
	if a.t < atk.windup or a.t > atk.windup + atk.active: return {}
	var dx: float = b.x - a.x
	var dz: float = b.z - a.z
	if atk.path:
		# The hit is where the blade is: it lands the moment the sword itself passes through the other fighter's body.
		for back in [0.0, 0.5]:
			var seg := blade_at(a, (a.t - back * TICK) * atk.rate)
			var p := Geometry2D.get_closest_point_to_segment(Vector2(b.x, b.z), Vector2(seg[0].x, seg[0].z), Vector2(seg[1].x, seg[1].z))
			if p.distance_to(Vector2(b.x, b.z)) <= RADIUS + 0.1: return atk
		return {}
	if hyp(dx, dz) > atk.range + a.stats.reach: return {}
	if absf(ang_diff(a.yaw, atan2(dx, dz))) > atk.arc: return {}
	return atk

## Two normal swings meeting at the same instant ring off each other and both fighters are pushed back.
static func _clash(a: Dictionary, b: Dictionary, w: Dictionary) -> void:
	var dx: float = b.x - a.x
	var dz: float = b.z - a.z
	var d: float = max(hyp(dx, dz), 0.0001)
	var nx := dx / d
	var nz := dz / d
	a.hitDone = true; b.hitDone = true; a.connected = true; b.connected = true
	_stagger(a, 0.4, -nx * 4, -nz * 4, false, true)
	_stagger(b, 0.4, nx * 4, nz * 4, false, true)
	w.events.append({"type": "clash", "x": (a.x + b.x) / 2, "z": (a.z + b.z) / 2})

static func _apply_hit(a: Dictionary, b: Dictionary, atk: Dictionary, w: Dictionary) -> void:
	if b.state == "dead": return
	var dx: float = b.x - a.x
	var dz: float = b.z - a.z
	var dist := hyp(dx, dz)
	var to_b := atan2(dx, dz)
	a.hitDone = true
	var nx: float = dx / dist if dist > 0.001 else sin(a.yaw)
	var nz: float = dz / dist if dist > 0.001 else cos(a.yaw)
	var px: float = b.x - nx * 0.35
	var pz: float = b.z - nz * 0.35
	if dodge_invulnerable(b):
		w.events.append({"type": "evade", "id": b.id, "x": b.x, "z": b.z}); return

	a.connected = true
	# How far the attacker is from the direction the defender is facing: 0 = head on, PI = from behind.
	var off := absf(ang_diff(b.yaw, to_b + PI))
	var backstab := off > 2.2
	var raw: float = atk.dmg * a.stats.power * (a.chargeMul if atk.focus else 1.0) * (1.2 if a.buffT > 0 else 1.0)
	var info := {"type": "hit", "id": a.id, "target": b.id, "dmg": 0.0, "heavy": atk.focus or atk.heavy, "title": atk.title, "x": px, "z": pz,
		"kill": false, "ground": false, "backstab": false, "riposte": false, "slam": false, "air": false, "launch": false, "blue": atk.focus and not atk.skill}

	if b.state == "down":
		# A vertical attack on a fighter lying on the ground: reduced damage, and it keeps them there a little longer.
		var gd: float = raw * 0.7 * (1 - b.stats.armor)
		b.groundHit = true; b.hp -= gd
		info.dmg = gd; info.ground = true; info.heavy = atk.focus
		if b.hp <= 0:
			b.hp = 0.0; b.state = "dead"; b.t = 0.0; b.floored = true; b.vx = 0.0; b.vz = 0.0; info.kill = true
		else: b.t = max(0.0, b.t - 0.2)
		w.events.append(info)
		return

	var guarding: bool = b.state == "guard" and off <= b.shield.arc      # a bigger shield covers more of the body
	if guarding and not atk.skill and parrying(b):
		# A parry: the blow is turned aside on the shield and the attacker is thrown off balance (longer for a heavy attack).
		# The defender is free at once, and their next hit on the reeling attacker counts as a riposte.
		b.stam = min(b.stats.maxStam, b.stam + 20); b.regenDelay = 0.0; b.seq = ""; b.chargeMul = 1.0; b.parryCd = 0.5
		b.yaw = atan2(-dx, -dz); _gain(b, 18)
		_stagger(a, 1.15 if atk.focus else 0.8, -nx * 3, -nz * 3, true)
		b.state = "idle"; b.t = 0.0
		w.events.append({"type": "parry" if atk.focus else "deflect", "id": b.id, "target": a.id, "x": px, "z": pz})
		return
	if guarding and not atk.skill:
		# A raised shield stops the blow at the cost of guard meter (and a scratch of damage). A heavy attack takes most of a
		# full guard at once; a kick, or the blow that empties the meter, knocks the shield aside and leaves the defender reeling.
		var cost: float = raw * 3.0 * b.shield.cost * a.weapon.guardDmg      # (3.0, up from 2.1: cuts now take their animation's time, so fewer land per second)
		if atk.focus: cost = 70.0 * b.shield.heavy
		if atk.guardBreak: cost = GUARD_MAX
		b.guardM -= cost
		b.guardRest = 1.3
		if b.guardM <= 0:
			b.guardM = 0.0; b.guardRest = 2.2
			var bd: float = raw * (1.0 if (atk.guardBreak or atk.focus) else 0.5) * (1 - b.stats.armor)
			b.hp = max(1.0, b.hp - bd)
			_stagger(b, 1.0, nx * 4, nz * 4)
			w.events.append({"type": "guardbreak", "id": a.id, "target": b.id, "dmg": bd, "x": px, "z": pz})
		else:
			b.hp = max(1.0, b.hp - raw * 0.1 * (1 - b.stats.armor))
			b.vx = nx * (1.5 + atk.knock * 0.25); b.vz = nz * (1.5 + atk.knock * 0.25)
			_gain(b, 4)
			w.events.append({"type": "block", "id": a.id, "target": b.id, "heavy": atk.heavy or atk.focus, "x": px, "z": pz})
		return
	if not atk.focus and armored(b) and not backstab:
		# A charged strike beats normal attacks: the blow lands for half and does not stop them.
		var ad: float = raw * 0.5 * (1 - b.stats.armor)
		if b.hp - ad > 0:
			b.hp -= ad
			w.events.append({"type": "armor", "id": a.id, "target": b.id, "dmg": ad, "x": px, "z": pz}); return
		# a killing blow goes through as a normal hit below

	var riposte: bool = b.state == "stagger" and b.parried
	if riposte: b.parried = false   # only the first hit after a parry is a riposte
	var dmg: float = raw * (1.5 if (backstab or riposte) else 1.0) * (1 - b.stats.armor)
	_gain(a, dmg * 0.9); _gain(b, dmg * 0.5)
	info.dmg = dmg; info.backstab = backstab; info.riposte = riposte
	b.hp -= dmg
	if b.hp <= 0:
		b.launched = atk.focus or b.state == "air"
		b.hp = 0.0; b.state = "dead"; b.t = 0.0; b.charge = ""; b.vx = nx * atk.knock; b.vz = nz * atk.knock
		info.kill = true
	elif b.state == "air":
		# Juggling: each hit keeps them up a little longer; a charged strike or the last allowed hit slams them down.
		b.juggle += 1
		if atk.focus or atk.slam or b.juggle >= JUGGLE_MAX:
			_floor(b, nx * 2, nz * 2); info.slam = true
		else:
			b.t = min(b.t, 0.3); b.vx = nx * 0.4; b.vz = nz * 0.4; info.air = true
	elif atk.launch:
		b.state = "air"; b.t = 0.0; b.juggle = 0; b.airDur = AIR_TIME; b.charge = ""; b.queue = ""; b.vx = nx * 0.5; b.vz = nz * 0.5
		info.launch = true
	elif atk.slam:
		# Earthsplitter drives a standing fighter into the ground.
		_floor(b, nx * atk.knock, nz * atk.knock); info.slam = true
	else:
		_stagger(b, atk.stagger, nx * atk.knock, nz * atk.knock)
	w.events.append(info)

static func _separate(a: Dictionary, b: Dictionary) -> void:
	if a.state == "dead" or b.state == "dead": return
	var dx: float = b.x - a.x
	var dz: float = b.z - a.z
	var d := hyp(dx, dz)
	var min_d := RADIUS * 2
	if d >= min_d: return
	var nx: float = dx / d if d > 0.001 else 1.0
	var nz: float = dz / d if d > 0.001 else 0.0
	var push := (min_d - d) / 2
	a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push

## Keep a fighter inside the ring.
static func _collide(f: Dictionary, w: Dictionary) -> void:
	var d := hyp(f.x, f.z)
	var max_d: float = w.R - RADIUS
	if d > max_d:
		f.x *= max_d / d; f.z *= max_d / d
