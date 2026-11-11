class_name Sim
## The rules of a fight. No drawing, no touch input: the world moves forward in fixed steps (60 a second)
## from one command per fighter, so the same rules serve the player, the rival and the automatic checks.
## This is build 20's rule set (src/sim.js in the web edition) carried over line for line.
##
##   a tap is a quick attack; three in a row make a string, and the order of the buttons picks the finisher
##   the stick held toward or away from the enemy turns the press into a different move (lunge, back-step cut, leap, kick)
##   holding the button on after the hit winds up a blue charged strike, which normal attacks cannot stop
##   holding Guard blocks normal attacks from the front until the guard meter runs out
##   pressing Guard just as a blow lands is a parry: a normal attack is turned aside, a charged one also disarms
##   a kick or a charged strike goes through a held guard; a special goes through everything but a dodge

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
	return _data

static func weapon_of(id: String) -> Dictionary:
	var w: Dictionary = data().weapons
	return w.get(id, w.sword)

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
		"connected": false, "winded": 0.0, "regenDelay": 0.0}

static func _make_fighter(id: int, stats: Dictionary) -> Dictionary:
	var f := {"id": id, "stats": stats, "weapon": weapon_of(stats.weapon), "skill": skill_of(stats.skill),
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
	f.state = "attack"; f.t = 0.0; f.atk = atk; f.hitDone = false; f.connected = false; f.swung = false; f.swingId += 1
	w.events.append({"type": "windup", "id": f.id, "heavy": atk.focus})

## Is the stick held toward ("F") or away from ("B") the way the fighter faces?
static func _stick_dir(f: Dictionary, cmd: Dictionary) -> String:
	var mag := hyp(cmd.mx, cmd.mz)
	if mag < 0.55: return ""
	var along: float = (cmd.mx * sin(f.yaw) + cmd.mz * cos(f.yaw)) / mag
	return "F" if along > 0.6 else ("B" if along < -0.6 else "")

static func _start_attack(f: Dictionary, btn: String, w: Dictionary, cmd: Dictionary) -> bool:
	var dir := _stick_dir(f, cmd)
	var special: Dictionary = f.weapon.dir[btn + dir] if dir != "" else {}
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
	return f.state == "guard" and f.parryOk and f.t <= PARRY_WINDOW

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
			var recover: float = a.recover * (1.0 if (f.connected or f.t < a.windup + a.active) else 1.4)
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
				if f.t > a.windup * (0.3 if a.dash else 0.55) and f.t < a.windup + a.active and gap > 1.35:
					tvx = fx * a.lunge; tvz = fz * a.lunge
				# A back-step move springs away from the enemy first, then comes back in with the cut.
				if a.back > 0 and f.t < a.windup * 0.55:
					tvx = -fx * a.back; tvz = -fz * a.back
				accel = 18.0
				if not f.swung and f.t >= a.windup:
					f.swung = true; w.events.append({"type": "swing", "id": f.id, "heavy": a.focus})
				if cmd.dodge and f.t >= a.windup + a.active + recover * 0.45 and _start_dodge(f, cmd, w): pass
				elif f.t >= total:
					var q: String = f.queue.substr(0, 1)
					var free: bool = a.launch or a.name == "riposte"
					f.state = "idle"; f.t = 0.0; f.queue = f.queue.substr(1); f.seqT = STRING_GAP
					# A string is three presses at most; a finisher, a charged strike or a special always ends one.
					var ended: bool = a.focus or a.ender or a.solo or free or f.seq.length() >= 3
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

	var guarding: bool = b.state == "guard" and off <= 1.6
	if guarding and not atk.skill and parrying(b):
		b.stam = min(b.stats.maxStam, b.stam + 20); b.regenDelay = 0.0; b.seq = ""; b.chargeMul = 1.0; b.parryCd = 0.5
		b.yaw = atan2(-dx, -dz); _gain(b, 18)
		if atk.focus:
			# Parrying a charged strike: the attacker's weapon is knocked out of their hand,
			# they are thrown wide open, and the defender counters at once.
			_stagger(a, 1.2, -nx * 2, -nz * 2, true)
			_disarm(a, b, w)
			_begin_swing(b, b.weapon.riposte, w)
			w.events.append({"type": "parry", "id": b.id, "target": a.id, "x": px, "z": pz})
		else:
			# Parrying a normal attack: it is turned aside and the attacker is left off balance. The weapon stays in hand,
			# and the defender is free at once, so the next blow is theirs to choose (and counts as a riposte).
			_stagger(a, 0.8, -nx * 3, -nz * 3, true)
			b.state = "idle"; b.t = 0.0
			w.events.append({"type": "deflect", "id": b.id, "target": a.id, "x": px, "z": pz})
		return
	if guarding and not atk.focus and not atk.skill:
		# A held guard stops a normal attack from the front at the cost of guard meter (and a scratch of damage).
		# A kick, or the blow that empties the meter, breaks the guard and leaves the defender reeling.
		b.guardM -= GUARD_MAX if atk.guardBreak else raw * 2.1
		b.guardRest = 1.3
		if b.guardM <= 0:
			b.guardM = 0.0; b.guardRest = 2.2
			var bd: float = raw * (1.0 if atk.guardBreak else 0.5) * (1 - b.stats.armor)
			b.hp = max(1.0, b.hp - bd)
			_stagger(b, 1.0, nx * 4, nz * 4)
			w.events.append({"type": "guardbreak", "id": a.id, "target": b.id, "dmg": bd, "x": px, "z": pz})
		else:
			b.hp = max(1.0, b.hp - raw * 0.1 * (1 - b.stats.armor))
			b.vx = nx * (1.5 + atk.knock * 0.25); b.vz = nz * (1.5 + atk.knock * 0.25)
			_gain(b, 4)
			w.events.append({"type": "block", "id": a.id, "target": b.id, "heavy": atk.heavy, "x": px, "z": pz})
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
