class_name Rival
## The computer opponent. It only reads the world and returns a command, exactly as the player's thumbs do.
## Carried over from build 20 (src/ai.js). The difficulty numbers live in res://data/rules.json:
##   parry: chance it parries a charged strike it sees coming.  guard: chance it raises its guard against a normal swing.
##   deflect: chance that guard is timed as a parry.  kick: how readily it kicks a guard down.
##   lag: how long it hesitates between presses.  dodge: chance it dodges.  armor: chance it charges through a swing.
##   focus: how often its attack is a charged strike.  launch: how often a string ends in the uppercut.
##   finish: how often it plays a string to its finisher.  punish: chance it takes an opening.  skill: how readily it uses its special.

var p: Dictionary
var rng := RandomNumberGenerator.new()
var mode := "approach"
var mode_t := 0.0
var mode_dur := 1.0
var circle_dir := 1.0
var combo_left := 0
var plan := "combo"
var seq := ""
var hold := {}
var tried_ground := false
var guard := {}
var press_at := 0.0
var seen_swing := -1
var opening_key := ""
var take_opening := false
var react := {}
var clock := 0.0
var last_round := -1
var launched := false

func _init(level := "normal", seed_value := 1234) -> void:
	var d: Dictionary = Sim.data().difficulty
	p = d.get(level, d.normal)
	rng.seed = seed_value

func r() -> float:
	return rng.randf()

func _set_mode(m: String, dur: float) -> void:
	mode = m; mode_t = 0.0; mode_dur = dur

## Decide what the next attack will be: a string of normal hits, or a charged strike.
func _plan_attack(force_focus := false) -> void:
	plan = "focus" if (force_focus or r() < p.focus) else "combo"
	var roll := r()
	var full: String = "HHV" if roll < p.launch else ("VVV" if roll < p.launch + 0.22 else ("VVH" if roll < p.launch + 0.44 else ("HHH" if roll < 0.9 else "HVH")))
	if plan == "focus": seq = "H" if r() < 0.5 else "V"
	elif r() < p.finish: seq = full
	else: seq = full.substr(0, 1 + int(r() * p.comboMax))
	combo_left = seq.length()
	launched = false
	_set_mode("attack", 2.6)

func think(w: Dictionary, self_idx: int) -> Dictionary:
	var f: Dictionary = w.fighters[self_idx]
	var e: Dictionary = w.fighters[1 - self_idx]
	var cmd := Sim.empty_cmd()
	var dt := Sim.TICK
	clock += dt; mode_t += dt
	if last_round != w.round:
		last_round = w.round; react = {}; hold = {}; guard = {}; _set_mode("approach", 1)
	if w.phase != "fight" or f.state == "dead" or e.state == "dead": return cmd

	var dx: float = e.x - f.x
	var dz: float = e.z - f.z
	var dist: float = max(Sim.hyp(dx, dz), 0.001)
	var to_e := atan2(dx, dz)
	if dist < 18: cmd.faceYaw = to_e
	var reach_bonus: float = f.stats.reach
	var nx := dx / dist
	var nz := dz / dist
	var free: bool = f.state == "idle"

	# --- A guard in progress: keep it up until the blow has come and gone.
	if not guard.is_empty():
		if clock >= guard.until or f.state == "stagger" or f.disarmed: guard = {}
		elif clock >= guard.from:
			cmd.guard = true; cmd.plain = not guard.timed; cmd.mx = -nx * 0.3; cmd.mz = -nz * 0.3
			return cmd

	# --- A charge in progress: keep the button down until it is time to let go.
	if not hold.is_empty():
		var started: bool = f.state == "charge" or (f.state == "attack" and not f.atk.focus)
		if not started and clock - hold.start > 0.25: hold = {}
		elif hold.feint and f.state == "charge" and clock >= hold.until - 0.1:
			cmd.mx = -nz * circle_dir; cmd.mz = nx * circle_dir; cmd.dodge = true; hold = {}   # feint: dodge out of the charge
			return cmd
		elif clock < hold.until or (dist > 3.2 + reach_bonus and clock < hold.until + 0.5):
			if hold.btn == "V": cmd.vHold = true
			else: cmd.hHold = true
			if dist > 1.9: cmd.mx = nx; cmd.mz = nz
			return cmd
		else: hold = {}

	# --- Defence: decide once per incoming swing how to answer it.
	if e.state == "attack" and e.swingId != seen_swing and dist < e.atk.range + e.stats.reach + 1.2:
		seen_swing = e.swingId
		var impact: float = clock + max(0.0, e.atk.windup - e.t)
		var roll := r()
		react = {}
		if e.atk.skill:
			if roll < p.dodge * 2.5 + 0.1: react = {"type": "dodge", "at": max(clock + 0.03, impact - 0.14)}   # a special cannot be parried
		elif e.atk.focus:
			# a charged strike goes through a held guard, so it must be parried or dodged
			if roll < p.parry and not f.disarmed and f.parryCd <= impact - clock:
				react = {"type": "guard", "timed": true, "at": max(clock + 0.02, impact - 0.13), "until": impact + 0.25}
			elif roll < p.parry + p.dodge * 2: react = {"type": "dodge", "at": max(clock + 0.03, impact - 0.12)}
		elif e.atk.guardBreak:
			if roll < p.dodge * 2 + 0.1: react = {"type": "dodge", "at": max(clock + 0.03, impact - 0.12)}   # a guard is no use against a kick
		elif roll < p.dodge: react = {"type": "dodge", "at": max(clock + 0.05, impact - 0.12)}
		elif roll < p.dodge + p.guard and not f.disarmed and f.guardM > 25 and impact - clock > 0.2:
			# A swing slow enough to see coming: raise the guard to block it, or, with the timing right, to turn it aside.
			var timed: bool = r() < p.deflect and f.parryCd <= impact - clock
			react = {"type": "guard", "timed": timed, "at": max(clock + 0.02, impact - 0.12) if timed else clock + 0.1 + r() * 0.08, "until": impact + 0.3 + r() * 0.5}
		elif roll < p.dodge + p.guard + p.armor and free and f.stam > 35: react = {"type": "armor", "at": clock}
	if not react.is_empty() and clock >= react.at:
		var kind: String = react.type
		var until: float = react.get("until", 0.0)
		var timed2: bool = react.get("timed", false)
		react = {}
		if kind == "guard" and (free or f.state == "guard"):
			guard = {"from": clock, "until": until, "timed": timed2}; cmd.guard = true; cmd.plain = not timed2
			return cmd
		if kind == "dodge" and free:
			var side := 1.0 if r() < 0.5 else -1.0
			var back := r() < 0.5
			cmd.mx = -nx if back else -nz * side
			cmd.mz = -nz if back else nx * side
			cmd.dodge = true
			return cmd
		if kind == "armor" and free:
			_begin_hold(cmd, 0.7 + r() * 0.3, false, "H" if r() < 0.5 else "V")
			return cmd

	# Disarmed: nothing matters but getting the weapon back.
	if f.disarmed:
		var wx: float = f.dropX - f.x
		var wz: float = f.dropZ - f.z
		var wd: float = max(Sim.hyp(wx, wz), 0.001)
		cmd.mx = wx / wd; cmd.mz = wz / wd; cmd.faceYaw = null; cmd.sprint = wd > 3 and f.stam > 25
		# Roll toward it when the enemy is about to land a blow.
		if free and e.state == "attack" and e.t < e.atk.windup and dist < e.atk.range + 0.6 and f.stam > 25 and r() < p.dodge * 0.5 + 0.03: cmd.dodge = true
		hold = {}
		if mode == "attack": _set_mode("circle", 0.4)
		return cmd

	# Out of breath: back off and recover.
	if f.winded > 0 and mode != "retreat": _set_mode("retreat", 1.4)

	# A charging enemy shrugs off normal hits. A smart fighter stops swinging and gets ready to parry.
	if p.smart and Sim.armored(e) and mode == "attack" and plan == "combo":
		circle_dir = 1.0 if r() < 0.5 else -1.0; _set_mode("circle", 0.5 + r() * 0.5)

	# An opening is the enemy off balance, recovering from a swing, out of breath or without a weapon.
	var opening: bool = e.disarmed or e.state == "air" or (e.state == "stagger" and e.staggerDur - e.t > 0.25) or (e.state == "attack" and e.t > e.atk.windup + e.atk.active) or e.winded > 0.4
	var key: String = "%s:%d:%d" % [e.state, e.swingId, roundi((clock - e.t) * 5)]
	if opening and key != opening_key:
		opening_key = key; take_opening = r() < p.punish
	if opening and take_opening and dist < 3.4 + reach_bonus and f.stam > 20 and f.winded <= 0 and mode != "attack":
		# A parried enemy is helpless long enough for a full charged strike; anything else gets a quick string.
		var thrown: bool = e.state == "stagger" and e.parried
		_plan_attack(thrown and r() < 0.6)
		if not thrown and plan == "focus":
			plan = "combo"; seq = "HH" if e.state == "air" else ("HHH" if r() < 0.5 else "VVV"); combo_left = seq.length()

	# The special: used when it is ready and the moment suits it.
	if free and f.energy >= 100 and e.state != "down" and e.state != "getup" and r() < p.skill * 0.03:
		var kind2: String = f.skill.atk.name if f.skill.atk != null else "wind"
		if (kind2 == "sunburst" and dist < 3.8) or ((kind2 == "rush" or kind2 == "flash") and dist > 3 and dist < 8) or (kind2 == "wind" and (f.stam < 35 or f.winded > 0)):
			cmd.skill = true
			return cmd
	var facing: bool = absf(Sim.ang_diff(f.yaw, to_e)) < 0.5
	# An enemy sitting behind a guard: kick it down, or wind up a charged strike, which goes through it.
	if e.state == "guard" and e.t > 0.35 and free and facing and f.stam > 20:
		if dist < 2.2 + reach_bonus and r() < p.kick * 0.07:
			_press(cmd, "V", -1, nx, nz)
			return cmd
		if dist < 3 and mode == "attack" and plan == "combo" and p.smart and r() < 0.03:
			plan = "focus"; seq = "V"; combo_left = 1
	# Just out of reach: sometimes close the gap with a lunge or a leaping blow.
	if free and facing and e.state != "down" and e.state != "getup" and dist > 2.9 + reach_bonus and dist < 3.7 + reach_bonus and f.stam > 30 and mode != "retreat" and r() < p.aggro * p.aggro * 0.05:
		_press(cmd, "H" if r() < 0.65 else "V", 1, nx, nz)
		return cmd
	# Pressed hard at close range: sometimes spring back with a cut.
	if free and facing and e.state == "attack" and e.t < e.atk.windup * 0.5 and not e.atk.focus and dist < 2.4 and f.stam > 30 and r() < p.dodge * 0.25:
		_press(cmd, "H", -1, nx, nz)
		return cmd
	# A fighter on the ground can be struck once, with a vertical attack.
	if e.state == "down":
		if not tried_ground and not e.groundHit and free and facing and dist < 2.3 + reach_bonus and f.stam > 20:
			tried_ground = true
			if r() < p.punish * 0.6:
				cmd.v = true
				return cmd
	else: tried_ground = false
	if (e.state == "down" or e.state == "getup") and mode == "attack":
		circle_dir = 1.0 if r() < 0.5 else -1.0; _set_mode("circle", 0.4 + r() * 0.4)

	match mode:
		"approach":
			cmd.mx = nx; cmd.mz = nz; cmd.sprint = dist > 9 and f.stam > 40
			if dist < 3.3 + reach_bonus:
				if f.stam > 35 and r() < p.aggro: _plan_attack()
				else:
					circle_dir = 1.0 if r() < 0.5 else -1.0; _set_mode("circle", 0.5 + r() * 1.1)
		"circle":
			# Strafe around the enemy while holding a comfortable distance.
			var want: float = 3.1 + reach_bonus * 0.5
			var radial: float = clampf((dist - want) * 0.9, -1, 1)
			var v := Vector2(-nz * circle_dir + nx * radial, nx * circle_dir + nz * radial).normalized()
			cmd.mx = v.x * 0.75; cmd.mz = v.y * 0.75
			if dist > 6: _set_mode("approach", 1)
			elif f.stam < 22: _set_mode("retreat", 1.2 + r())
			# Circling at close range, it sometimes keeps its guard up for a while, as a wary fighter does.
			elif free and dist < 3.6 and f.guardM > 40 and not e.disarmed and e.state != "down" and r() < p.guard * 0.035:
				guard = {"from": clock, "until": clock + 0.5 + r() * 0.9, "timed": false}
			elif mode_t > mode_dur and not (p.smart and Sim.armored(e)):
				if f.stam > 35 and r() < p.aggro: _plan_attack()
				else:
					if r() < 0.4: circle_dir *= -1
					_set_mode("circle", 0.4 + r() * p.rest)
		"attack":
			var reach: float = (2.6 if plan == "focus" else 2.0) + reach_bonus * 0.8
			if dist > reach: cmd.mx = nx; cmd.mz = nz
			var can_chain: bool = f.state == "attack" and not f.atk.focus and f.t > f.atk.windup + f.atk.active and f.queue == ""      # press during the follow-through: the cut is queued and flows out at the cancel point
			if dist <= reach + 0.25 and facing and combo_left > 0 and f.stam > 16:
				if plan == "focus" and free:
					_begin_hold(cmd, 0.72 + r() * 0.5, r() < p.feint, seq[0]); combo_left = 0
				elif plan == "combo" and (free or can_chain) and clock >= press_at:
					_press(cmd, seq[seq.length() - combo_left], 0, nx, nz); combo_left -= 1; press_at = clock + p.lag * (0.6 + r() * 0.8)
			# The uppercut landed: two more hits while the enemy hangs in the air.
			if e.state == "air" and not launched and plan == "combo" and combo_left <= 0:
				launched = true; seq = "HH"; combo_left = 2; mode_dur = mode_t + 1.6
			var done: bool = combo_left <= 0 and free and hold.is_empty()
			if done or mode_t > mode_dur or f.stam < 14:
				circle_dir = 1.0 if r() < 0.5 else -1.0
				if f.stam < 30 or r() > p.aggro: _set_mode("retreat", 0.7 + r() * p.rest)
				else: _set_mode("circle", 0.3 + r() * p.rest)
		"retreat":
			var v2 := Vector2(-nx + -nz * circle_dir * 0.6, -nz + nx * circle_dir * 0.6).normalized()
			cmd.mx = v2.x; cmd.mz = v2.y
			if dist > 7 or mode_t > mode_dur or Sim.hyp(f.x, f.z) > w.R - 2.5:
				_set_mode("approach" if f.stam > 45 else "circle", 0.6 + r() * p.rest)
	return cmd

## A press with the stick let go continues a string; toward (1) or away (-1) makes it a directional move.
func _press(cmd: Dictionary, btn: String, stick: int, nx: float, nz: float) -> void:
	if btn == "V": cmd.v = true; cmd.vHold = true
	else: cmd.h = true; cmd.hHold = true
	cmd.mx = nx * stick; cmd.mz = nz * stick

func _begin_hold(cmd: Dictionary, secs: float, feint: bool, btn: String) -> void:
	_press(cmd, btn, 0, 0, 0)
	hold = {"start": clock, "until": clock + secs, "feint": feint, "btn": btn}
