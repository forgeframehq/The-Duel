extends Node3D
## The Duel, Godot edition. This script runs the whole game: the menu, a match, the camera, sounds and effects.
## The rules themselves are in scripts/sim.gd; this only feeds them the player's thumbs and shows what they decide.

const VERSION := "0.3"
const CAM := {"dist": 3.5, "side": 1.0, "height": 1.4, "pitch": 0.26, "fov": 54.0}

var arena: Arena
var cam: Camera3D
var hud: Hud
var pad: TouchPad
var menu: Control
var result: Control
var world := {}
var views: Array[FighterView] = []
var rival: Rival
var roster: Array
var mode := "menu"          # menu, fight, result
var pick := int(OS.get_environment("DUEL_PICK")) if OS.get_environment("DUEL_PICK") != "" else 2   # which fighter the player has chosen (index into the roster)
var foe := 0
var level := "normal"
var low := false
var acc := 0.0
var hitstop := 0.0
var shake := 0.0
var cam_yaw := 0.0
var spin := 0.0
var preview: FighterView
var preview_f := {}
var sfx := {}
var voices: Array[AudioStreamPlayer] = []
var music: AudioStreamPlayer
var auto := OS.get_environment("DUEL_AUTO") != ""     # test runs: the rival plays both sides
var auto_ai: Rival
var shot_path := OS.get_environment("DUEL_SHOT")
var clock := 0.0
var shot_n := 0

func _ready() -> void:
	roster = Sim.data().roster
	arena = Arena.new(); add_child(arena)
	cam = Camera3D.new(); cam.fov = CAM.fov; cam.near = 0.1; cam.far = 400.0; add_child(cam)
	var layer := CanvasLayer.new(); add_child(layer)
	hud = Hud.new(); layer.add_child(hud); hud.visible = false
	pad = TouchPad.new(); layer.add_child(pad); pad.visible = false
	for n in ["block1", "block2", "death", "dodge", "exhausted", "gong", "guard_break", "hit1", "hit2", "hit_heavy", "horn", "parry", "swing1", "swing2", "swing_heavy", "ui_select", "ui_start", "ui_tap", "victory_hit"]:
		sfx[n] = load("res://audio/sfx/%s.mp3" % n)
	for i in 8:
		var v := AudioStreamPlayer.new(); add_child(v); voices.append(v)
	music = AudioStreamPlayer.new(); add_child(music)
	_build_menu(layer)
	_build_result(layer)
	_show_menu()
	if auto or OS.get_environment("DUEL_START") != "": _start_match()

# ---------------------------------------------------------------- sound

func play(n: String, volume_db := -6.0, pitch := 1.0) -> void:
	for v in voices:
		if not v.playing:
			v.stream = sfx[n]; v.volume_db = volume_db; v.pitch_scale = pitch * randf_range(0.96, 1.04); v.play(); return

func play_music(file: String, volume_db: float, loop := true) -> void:
	var s: AudioStreamMP3 = load("res://audio/music/%s.mp3" % file)
	s.loop = loop
	music.stream = s; music.volume_db = volume_db; music.play()

# ---------------------------------------------------------------- menu

func _style(color: Color, border := Color(1, 1, 1, 0.25), radius := 10) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new(); sb.bg_color = color; sb.set_corner_radius_all(radius); sb.set_border_width_all(2); sb.border_color = border
	sb.content_margin_left = 18; sb.content_margin_right = 18; sb.content_margin_top = 10; sb.content_margin_bottom = 10
	return sb

func _button(text: String, px: int, on_press: Callable, gold := false) -> Button:
	var b := Button.new(); b.text = text; b.add_theme_font_size_override("font_size", px); b.focus_mode = Control.FOCUS_NONE
	b.add_theme_stylebox_override("normal", _style(Color(0.75, 0.55, 0.15, 0.9) if gold else Color(0, 0, 0, 0.45), Color(1, 0.85, 0.5, 0.9) if gold else Color(1, 1, 1, 0.25)))
	b.add_theme_stylebox_override("hover", _style(Color(0.85, 0.65, 0.2, 0.95) if gold else Color(0, 0, 0, 0.55)))
	b.add_theme_stylebox_override("pressed", _style(Color(1.0, 0.8, 0.3, 1.0) if gold else Color(1, 1, 1, 0.25)))
	b.pressed.connect(func() -> void:
		play("ui_tap", -10); on_press.call())
	return b

func _label(text: String, px: int, color := Color.WHITE) -> Label:
	var l := Label.new(); l.text = text; l.add_theme_font_size_override("font_size", px); l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7)); l.add_theme_constant_override("outline_size", max(3, px / 7))
	return l

func _build_menu(layer: CanvasLayer) -> void:
	menu = Control.new(); menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); layer.add_child(menu)
	var title := _label("THE DUEL", 64, Color(1.0, 0.86, 0.5)); title.position = Vector2(44, 22); menu.add_child(title)
	var ver := _label("Godot edition  " + VERSION, 16, Color(1, 1, 1, 0.6)); ver.position = Vector2(50, 100); menu.add_child(ver)

	# right-hand panel: who the chosen fighter is
	var panel := VBoxContainer.new(); panel.name = "Panel"; panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	panel.offset_left = -470; panel.offset_right = -40; panel.offset_top = 30; panel.add_theme_constant_override("separation", 6); menu.add_child(panel)
	var nm := _label("", 34, Color(1.0, 0.9, 0.65)); nm.name = "Name"; nm.autowrap_mode = TextServer.AUTOWRAP_WORD; panel.add_child(nm)
	var origin := _label("", 18, Color(0.8, 0.9, 1.0)); origin.name = "Origin"; panel.add_child(origin)
	var blurb := _label("", 17); blurb.name = "Blurb"; blurb.autowrap_mode = TextServer.AUTOWRAP_WORD; blurb.custom_minimum_size = Vector2(430, 0); panel.add_child(blurb)
	var stats := _label("", 17, Color(0.9, 0.9, 0.9)); stats.name = "Stats"; panel.add_child(stats)

	# bottom-left: the fighters to choose from
	var cards := HBoxContainer.new(); cards.name = "Cards"; cards.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	cards.offset_left = 44; cards.offset_top = -190; cards.offset_bottom = -30; cards.add_theme_constant_override("separation", 14); menu.add_child(cards)
	for i in roster.size():
		var card := Button.new(); card.custom_minimum_size = Vector2(120, 160); card.focus_mode = Control.FOCUS_NONE; card.clip_contents = true
		var face := TextureRect.new(); face.texture = load("res://ui/%s.webp" % roster[i].id); face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		face.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED; face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); face.mouse_filter = Control.MOUSE_FILTER_IGNORE
		face.offset_left = 3; face.offset_top = 3; face.offset_right = -3; face.offset_bottom = -3; card.add_child(face)
		var tag := _label(roster[i].short, 18); tag.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); tag.offset_top = -30; tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tag.mouse_filter = Control.MOUSE_FILTER_IGNORE; card.add_child(tag)
		card.pressed.connect(func() -> void:
			play("ui_select", -10); pick = i; _refresh_menu())
		cards.add_child(card)

	# bottom-right: how hard the rival is, and the button that starts the match
	var right := VBoxContainer.new(); right.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT); right.offset_left = -470; right.offset_right = -40; right.offset_top = -240; right.offset_bottom = -30
	right.alignment = BoxContainer.ALIGNMENT_END; right.add_theme_constant_override("separation", 14); menu.add_child(right)
	var levels := HBoxContainer.new(); levels.name = "Levels"; levels.add_theme_constant_override("separation", 10); right.add_child(levels)
	for l in ["easy", "normal", "hard"]:
		var b := _button(l.capitalize(), 22, func() -> void:
			level = l; _refresh_menu())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.set_meta("level", l); levels.add_child(b)
	var gfx := _button("Graphics: High", 18, func() -> void:
		low = not low; arena.set_quality(low); menu.find_child("Gfx", true, false).text = "Graphics: Low" if low else "Graphics: High")
	gfx.name = "Gfx"; right.add_child(gfx)
	var go := _button("FIGHT", 40, _start_match, true); go.custom_minimum_size = Vector2(0, 84); right.add_child(go)

func _refresh_menu() -> void:
	var d: Dictionary = roster[pick]
	var panel := menu.get_node("Panel")
	panel.get_node("Name").text = d.name
	panel.get_node("Origin").text = d.origin + "   ·   " + Sim.weapon_of(d.weapon).label + "   ·   " + Sim.skill_of(d.skill).name
	panel.get_node("Blurb").text = d.blurb
	var st: Dictionary = d.stats
	panel.get_node("Stats").text = "Health %d    Stamina %d    Power %.2f    Speed %.1f" % [st.maxHp, st.maxStam, st.power, st.speed]
	var cards := menu.get_node("Cards")
	for i in cards.get_child_count():
		var on := i == pick
		for state in ["normal", "hover", "pressed"]:
			(cards.get_child(i) as Button).add_theme_stylebox_override(state, _style(Color(0, 0, 0, 0.5), Color(1.0, 0.82, 0.4) if on else Color(1, 1, 1, 0.2), 8))
	for b in _level_buttons():
		var on: bool = b.get_meta("level") == level
		b.add_theme_stylebox_override("normal", _style(Color(0.75, 0.55, 0.15, 0.85) if on else Color(0, 0, 0, 0.45), Color(1, 0.85, 0.5, 0.9) if on else Color(1, 1, 1, 0.25)))
	# the chosen fighter stands in the meadow behind the menu
	if preview: preview.queue_free()
	preview = FighterView.new().setup(d); add_child(preview)
	preview_f = Sim.create_world({"R": Arena.R, "spawns": [{"x": 0.0, "z": 0.0, "yaw": PI - 0.35}, {"x": 0.0, "z": 50.0, "yaw": 0.0}]}, d.stats, d.stats).fighters[0]
	preview.snap(preview_f)

func _level_buttons() -> Array:
	return menu.find_child("Levels", true, false).get_children()

func _show_menu() -> void:
	mode = "menu"
	for v in views: v.queue_free()
	views.clear(); world = {}; hud.world = {}
	menu.visible = true; result.visible = false; hud.visible = false; pad.visible = false
	_refresh_menu()
	play_music("menu", -20.0)

func _build_result(layer: CanvasLayer) -> void:
	result = Control.new(); result.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); result.visible = false; layer.add_child(result)
	var shade := ColorRect.new(); shade.color = Color(0, 0, 0, 0.45); shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); result.add_child(shade)
	var box := VBoxContainer.new(); box.set_anchors_preset(Control.PRESET_CENTER); box.grow_horizontal = Control.GROW_DIRECTION_BOTH; box.grow_vertical = Control.GROW_DIRECTION_BOTH
	box.add_theme_constant_override("separation", 18); box.alignment = BoxContainer.ALIGNMENT_CENTER; result.add_child(box)
	var head := _label("VICTORY", 90, Color(1.0, 0.86, 0.5)); head.name = "Head"; head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(head)
	var sub := _label("", 24); sub.name = "Sub"; sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(sub)
	var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.add_theme_constant_override("separation", 20); box.add_child(row)
	row.add_child(_button("Fight again", 30, _start_match, true))
	row.add_child(_button("Change fighter", 30, _show_menu))

# ---------------------------------------------------------------- a match

func _start_match() -> void:
	play("ui_start", -8)
	if preview:
		preview.queue_free(); preview = null
	for v in views: v.queue_free()
	views.clear()
	# the rival is one of the other fighters
	var others := range(roster.size()).filter(func(i): return i != pick)
	foe = others[randi() % others.size()]
	world = Sim.create_world({"R": Arena.R, "spawns": Arena.SPAWNS}, roster[pick].stats, roster[foe].stats)
	rival = Rival.new(level, randi())
	auto_ai = Rival.new("hard", randi())
	for i in 2:
		var v := FighterView.new().setup(roster[pick if i == 0 else foe]); add_child(v); views.append(v)
	hud.world = world; hud.names = [roster[pick].short, roster[foe].short]; hud.shown_hp = [1.0, 1.0]
	cam_yaw = 0.0; acc = 0.0; hitstop = 0.0
	mode = "fight"; menu.visible = false; result.visible = false; hud.visible = true; pad.visible = not auto
	play_music("battle1", -24.0)

## What the player's thumbs are asking for this step.
func _player_cmd(first_step: bool) -> Dictionary:
	var cmd := Sim.empty_cmd()
	var p: Dictionary = world.fighters[0]
	var e: Dictionary = world.fighters[1]
	var s := pad.stick
	# keyboard, for testing on a computer
	var kx := Input.get_axis("ui_left", "ui_right")
	var ky := Input.get_axis("ui_up", "ui_down")
	if absf(kx) + absf(ky) > 0: s = Vector2(kx, ky).limit_length(1.0)
	if s.length() < 0.18: s = Vector2.ZERO
	# the stick is read from the camera's point of view: up is away from the camera
	var fx := sin(cam_yaw)
	var fz := cos(cam_yaw)
	cmd.mx = -fz * s.x + fx * -s.y
	cmd.mz = fx * s.x + fz * -s.y
	cmd.faceYaw = atan2(e.x - p.x, e.z - p.z)
	cmd.sprint = s.length() > 0.96 and Sim.hyp(e.x - p.x, e.z - p.z) > 5.0
	cmd.hHold = pad.down("h") or Input.is_physical_key_pressed(KEY_J)
	cmd.vHold = pad.down("v") or Input.is_physical_key_pressed(KEY_K)
	cmd.guard = pad.down("guard") or Input.is_physical_key_pressed(KEY_L)
	if first_step:
		cmd.h = pad.take("h") or Input.is_action_just_pressed("ui_accept")
		cmd.v = pad.take("v")
		cmd.dodge = pad.take("dodge")
		cmd.skill = pad.take("skill")
		pad.take("guard")
	return cmd

func _process(dt: float) -> void:
	clock += dt
	if mode == "menu":
		spin += dt * 0.12
		if preview:
			preview.update(preview_f, dt)
			arena.set_fighters(Vector3.ZERO, Vector3(0, 0, 50))
		var a := 0.35 + sin(spin) * 0.25
		cam.fov = 36.0
		cam.position = Vector3(-sin(a) * 4.6 - 0.7, 1.25, -cos(a) * 4.6)
		cam.look_at(Vector3(-0.7, 1.0, 0))
	else:
		_run_match(dt)
	# test runs: save a picture at each of the moments listed in DUEL_SHOT_AT ("3,5,8"), then stop
	if shot_path != "":
		var at := (OS.get_environment("DUEL_SHOT_AT") if OS.get_environment("DUEL_SHOT_AT") != "" else "3").split(",")
		if clock > float(at[shot_n]):
			get_viewport().get_texture().get_image().save_png(shot_path.replace(".png", "_%d.png" % shot_n))
			shot_n += 1
			if shot_n >= at.size(): get_tree().quit()

func _run_match(dt: float) -> void:
	acc = min(acc + dt, 0.1)
	var first := true
	while acc >= Sim.TICK:
		acc -= Sim.TICK
		if hitstop > 0:
			hitstop -= Sim.TICK; continue
		var mine: Dictionary = auto_ai.think(world, 0) if auto else _player_cmd(first)
		first = false
		Sim.step_world(world, [mine, rival.think(world, 1)])
		for ev in world.events: _on_event(ev)
		world.events.clear()
	for i in 2: views[i].update(world.fighters[i], dt)
	pad.energy = world.fighters[0].energy / 100.0
	pad.queue_redraw()
	_camera(dt)

func _camera(dt: float) -> void:
	var p := views[0].position
	var e := views[1].position
	var flat := Vector2(e.x - p.x, e.z - p.z)
	if flat.length() > 0.6: cam_yaw += Sim.ang_diff(cam_yaw, atan2(flat.x, flat.y)) * min(1.0, 5.0 * dt)
	var fx := sin(cam_yaw)
	var fz := cos(cam_yaw)
	var back: float = cos(CAM.pitch) * CAM.dist
	# pull back a little when the fighters are far apart, so both stay in view
	var extra := clampf((flat.length() - 4.0) * 0.18, 0.0, 1.6)
	var pos := Vector3(p.x - fx * (back + extra) - fz * CAM.side, CAM.height + sin(CAM.pitch) * CAM.dist + extra * 0.3, p.z - fz * (back + extra) + fx * CAM.side)
	shake = max(0.0, shake - dt * 2.4)
	if shake > 0: pos += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * shake * 0.12
	cam.fov = CAM.fov - (6.0 if get_viewport().get_visible_rect().size.aspect() > 2.0 else 0.0)
	cam.position = pos
	cam.look_at(Vector3(p.x * 0.55 + e.x * 0.45, 1.2, p.z * 0.55 + e.z * 0.45))
	arena.set_fighters(p, e)

# ---------------------------------------------------------------- what happens on screen when the rules say something happened

func _spark(x: float, z: float, color: Color, amount: int, speed := 4.0, y := 1.15) -> void:
	var ps := CPUParticles3D.new()
	var q := QuadMesh.new(); q.size = Vector2(0.055, 0.055)
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = color; m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES; m.vertex_color_use_as_albedo = true
	q.material = m; ps.mesh = q
	ps.one_shot = true; ps.explosiveness = 0.95; ps.amount = amount; ps.lifetime = 0.45
	ps.direction = Vector3.UP; ps.spread = 180.0; ps.initial_velocity_min = speed * 0.4; ps.initial_velocity_max = speed; ps.gravity = Vector3(0, -9, 0)
	ps.scale_amount_min = 0.5; ps.scale_amount_max = 1.6
	var ramp := Gradient.new(); ramp.set_color(0, Color(1, 1, 1, 1)); ramp.set_color(1, Color(1, 1, 1, 0)); ps.color_ramp = ramp
	ps.position = Vector3(x, y, z); add_child(ps); ps.emitting = true
	get_tree().create_timer(1.0).timeout.connect(ps.queue_free)

func _on_event(ev: Dictionary) -> void:
	var mine: bool = ev.get("id", -1) == 0
	match ev.type:
		"round":
			hud.say("ROUND %d" % ev.round, 1.8)
			if OS.get_environment("DUEL_AUTO") == "ko": world.fighters[1].hp = 1.0
			for i in views.size(): views[i].snap(world.fighters[i])
			var p: Dictionary = world.fighters[0]
			var e: Dictionary = world.fighters[1]
			cam_yaw = atan2(e.x - p.x, e.z - p.z)
		"fight":
			hud.say("FIGHT!", 0.9, Color(1.0, 0.86, 0.5)); play("gong", -8)
		"swing":
			play("swing_heavy" if ev.heavy else ("swing1" if randf() < 0.5 else "swing2"), -12)
		"dodge": play("dodge", -12)
		"winded": play("exhausted", -10)
		"string":
			if mine and ev.title != "": hud.say_move(ev.title)
		"skill":
			play("horn", -10); hud.say_move(ev.name); shake = max(shake, 0.5)
		"hit":
			var big: bool = ev.heavy or ev.kill
			play("hit_heavy" if big else ("hit1" if randf() < 0.5 else "hit2"), -5 if big else -8)
			_spark(ev.x, ev.z, Color(0.45, 0.75, 1.0) if ev.blue else Color(1.0, 0.75, 0.35), 26 if big else 12, 6.0 if big else 4.0, 0.3 if ev.ground else 1.15)
			hitstop = max(hitstop, 0.09 if big else 0.045)
			shake = max(shake, 0.9 if big else 0.3)
			if ev.kill: play("death", -6)
			elif ev.launch and mine: hud.say_move("Rising Fang  ·  keep hitting!")
		"block":
			play("block1" if randf() < 0.5 else "block2", -8); _spark(ev.x, ev.z, Color(0.9, 0.95, 1.0), 8, 3.0); hitstop = max(hitstop, 0.03)
		"armor":
			play("block2", -8, 0.8); _spark(ev.x, ev.z, Color(0.4, 0.7, 1.0), 10, 3.0)
		"guardbreak":
			play("guard_break", -5); _spark(ev.x, ev.z, Color(1.0, 0.5, 0.2), 24, 6.0); shake = max(shake, 0.8); hitstop = max(hitstop, 0.08)
			hud.say("GUARD BROKEN", 0.8, Color(1.0, 0.6, 0.3))
		"deflect":
			play("parry", -5); _spark(ev.x, ev.z, Color(1, 1, 1), 22, 6.0); hitstop = max(hitstop, 0.1); shake = max(shake, 0.5)
			hud.say("DEFLECT", 0.7, Color(0.8, 0.92, 1.0))
		"parry":
			play("parry", -3, 0.85); _spark(ev.x, ev.z, Color(0.5, 0.8, 1.0), 40, 8.0); hitstop = max(hitstop, 0.16); shake = max(shake, 1.0)
			hud.say("PARRY!", 0.9, Color(0.5, 0.8, 1.0))
		"clash":
			play("parry", -6, 1.2); _spark(ev.x, ev.z, Color(1.0, 0.9, 0.6), 24, 6.0); hitstop = max(hitstop, 0.08); shake = max(shake, 0.5)
		"land":
			_spark(ev.x, ev.z, Color(0.7, 0.6, 0.4, 0.8), 10, 2.0, 0.1)
		"roundend":
			hud.say("TIME" if ev.timeout else "K.O.", 2.4, Color(1.0, 0.86, 0.5)); play("victory_hit", -6)
			if ev.winner >= 0: views[ev.winner].cheer = true
		"matchover":
			var won: bool = ev.winner == 0
			mode = "result"; result.visible = true; pad.visible = false
			result.find_child("Head", true, false).text = "VICTORY" if won else "DEFEAT"
			result.find_child("Head", true, false).add_theme_color_override("font_color", Color(1.0, 0.86, 0.5) if won else Color(0.85, 0.35, 0.3))
			result.find_child("Sub", true, false).text = "%s  %d : %d  %s" % [roster[pick].short, world.score[0], world.score[1], roster[foe].short]
			play_music("victory" if won else "defeat", -16.0, false)
