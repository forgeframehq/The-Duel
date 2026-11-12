extends Node3D
## The Duel, Godot edition. This script runs the whole game: the menu, a match, the camera, sounds and effects.
## The rules themselves are in scripts/sim.gd; this only feeds them the player's thumbs and shows what they decide.

const VERSION := "1.0"
## Camera angles. The game offers two, switched with the button under the clock: Shoulder (index 3; close behind the player, the
## sword arm in frame, the default) and Side-on (index 4). The first three are kept for testing (DUEL_CAM=0..2). dist: how far behind the player; side: how far off the shoulder; pitch: how steeply it
## looks down. "Side-on" stands off to one side of the two fighters instead, like a classic fighting game.
const CAMS := [
	{"name": "Classic", "dist": 3.5, "side": 1.0, "height": 1.4, "pitch": 0.26, "fov": 54.0},
	{"name": "Close", "dist": 2.5, "side": 0.8, "height": 1.35, "pitch": 0.16, "fov": 52.0},
	{"name": "Wide", "dist": 6.5, "side": 0.4, "height": 1.6, "pitch": 0.42, "fov": 56.0},
	{"name": "Shoulder", "dist": 2.9, "side": 0.95, "height": 1.2, "pitch": 0.13, "fov": 50.0},
	{"name": "Side-on", "dist": 5.0, "side": 0.0, "height": 1.2, "pitch": 0.1, "fov": 46.0, "side_on": true},
]
var cam_pick := int(OS.get_environment("DUEL_CAM")) if OS.get_environment("DUEL_CAM") != "" else 3
var CAM: Dictionary = CAMS[cam_pick]

var arena: Arena
var cam: Camera3D
var hud: Hud
var pad: TouchPad
var cam_button: Button
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
const ARENAS := {"storm": "Stormfield", "meadow": "Whispering Meadow"}
var arena_pick := OS.get_environment("DUEL_ARENA") if OS.get_environment("DUEL_ARENA") != "" else "storm"
## The weapons a player can give any fighter. "sword" is drawn as each fighter's own blade.
const ARMS := ["f_sword", "f_katana", "f_mace", "f_hammer", "f_dagger"]
const SHIELDS := ["wood", "buckler", "kite"]
var shield_pick := OS.get_environment("DUEL_SHIELD") if OS.get_environment("DUEL_SHIELD") != "" else "wood"
var shields := ["wood", "wood"]
## Fencing is fought at a walk and a short run, not a sprint: fighters move at this share of their listed speed.
const PACE := 0.72
var arm := OS.get_environment("DUEL_ARM")               # the weapon the player has chosen ("" = the fighter's own)
var arms := ["", ""]        # what each side carries in the current match
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
# the look shared with Dawn of Dynasties: Cinzel lettering, gold on dark wood, crimson for what matters
const GOLD := Color(0.914, 0.769, 0.416)
const GOLD_DIM := Color(0.722, 0.525, 0.184)
const BONE := Color(0.965, 0.906, 0.769)
const WOOD := Color(0.17, 0.11, 0.06, 0.93)
const CRIMSON := Color(0.56, 0.1, 0.07, 0.96)
var font_main: FontVariation
var font_display: Font
var splash: Control
var splash_t := 0.0
# the ultimate: the fight freezes, the camera comes round to the fighter's face, then the blow is let loose
const ULT_DUR := 1.3
var ult := {}
var ult_test := float(OS.get_environment("DUEL_ULT")) if OS.get_environment("DUEL_ULT") != "" else 0.0
var ult_id := 0
var ult_mix := 0.0
var cine: Control
var flash := 0.0

func _ready() -> void:
	roster = Sim.data().roster
	font_main = FontVariation.new(); font_main.base_font = load("res://fonts/Cinzel.ttf")
	font_main.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 700}
	font_display = load("res://fonts/CinzelDecorative-Bold.ttf")
	var th := Theme.new(); th.default_font = font_main; get_window().theme = th
	arena = Arena.new(); arena.look = arena_pick; add_child(arena)
	cam = Camera3D.new(); cam.fov = CAM.fov; cam.near = 0.1; cam.far = 400.0; add_child(cam)
	var layer := CanvasLayer.new(); add_child(layer)
	# a soft darkening toward the corners, to draw the eye to the fighters
	var vig := ColorRect.new(); vig.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var vm := ShaderMaterial.new(); var vs := Shader.new()
	vs.code = "shader_type canvas_item;\nvoid fragment() { float d = length((UV - 0.5) * vec2(1.25, 1.0)); COLOR = vec4(0.0, 0.02, 0.05, smoothstep(0.42, 0.85, d) * 0.38); }"
	vm.shader = vs; vig.material = vm; layer.add_child(vig)
	hud = Hud.new(); hud.font = font_main; hud.display = font_display; layer.add_child(hud); hud.visible = false
	cam_button = _button("Side-on view", 16, func() -> void:
		cam_pick = 4 if cam_pick != 4 else 3; CAM = CAMS[cam_pick]; cam_button.text = "Side-on view" if cam_pick == 3 else "Shoulder view")
	cam_button.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP); cam_button.offset_top = 78; cam_button.offset_left = -70; cam_button.offset_right = 70
	cam_button.grow_horizontal = Control.GROW_DIRECTION_BOTH; cam_button.modulate.a = 0.75; cam_button.visible = false
	pad = TouchPad.new(); layer.add_child(pad); pad.visible = false
	layer.add_child(cam_button)
	for n in ["block1", "block2", "death", "dodge", "exhausted", "gong", "guard_break", "hit1", "hit2", "hit_heavy", "horn", "parry", "swing1", "swing2", "swing_heavy", "ui_select", "ui_start", "ui_tap", "victory_hit"]:
		sfx[n] = load("res://audio/sfx/%s.mp3" % n)
	for i in 8:
		var v := AudioStreamPlayer.new(); add_child(v); voices.append(v)
	music = AudioStreamPlayer.new(); add_child(music)
	_build_menu(layer)
	_build_result(layer)
	_build_cine(layer)
	if shot_path == "" or OS.get_environment("DUEL_SPLASH") != "": _build_splash(layer)
	_show_menu()
	if OS.get_environment("DUEL_STRIP") != "": _strip(OS.get_environment("DUEL_STRIP"))
	elif auto or OS.get_environment("DUEL_START") != "": _start_match()

## Test tool: DUEL_STRIP="Clip_A,Clip_B" draws each clip as a row of eight moments, to judge a move without seeing it play.
func _strip(names: String) -> void:
	mode = "strip"; menu.visible = false
	if preview: preview.queue_free(); preview = null
	var rows := names.split(",")
	var n := 6
	for r in rows.size():
		var part := rows[r].split("@")       # "Clip@0.5-1.2" shows only that stretch of the clip
		rows[r] = part[0]
		var clip: Dictionary = Clips.table()[rows[r]]
		var from := 0.0
		var to: float = clip.length
		if part.size() > 1:
			from = float(part[1].split("-")[0]); to = float(part[1].split("-")[1])
		for i in n:
			var v := FighterView.new().setup(roster[pick], OS.get_environment("DUEL_ARM"), shield_pick); add_child(v)
			v.position = Vector3(-(i - (n - 1) / 2.0) * 1.9, 0, r * -4.0); v.rotation.y = PI + float(OS.get_environment("DUEL_TURN") if OS.get_environment("DUEL_TURN") != "" else "0.6")
			v.weights = {rows[r]: 1.0}; v.times = {rows[r]: from + (to - from) * (i + 0.5) / n}; v._apply()
	cam.fov = 30.0; cam.position = Vector3(0, 1.5 + rows.size() * 0.9, -8.5 - rows.size() * 2.6); cam.look_at(Vector3(0, 0.95, -(rows.size() - 1) * 2.0))
	arena.grass.visible_instance_count = 0
	if OS.get_environment("DUEL_SUN") != "":      # look toward the sun, to check the sky photo is turned to match the light
		var d: Vector3 = arena.sun.global_transform.basis.z
		cam.fov = 80.0; cam.position = Vector3(0, 1.5, 0); cam.look_at(cam.position + Vector3(d.x, 0.45, d.z))

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
	b.add_theme_font_override("font", font_main)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(c, BONE)
	b.add_theme_color_override("font_outline_color", Color(0.1, 0.05, 0.02, 0.9)); b.add_theme_constant_override("outline_size", max(3, px / 6))
	if gold:
		# the crimson laurel plate from Dawn of Dynasties
		b.add_theme_font_override("font", font_display)
		for state in ["normal", "hover", "pressed"]:
			var st := StyleBoxTexture.new(); st.texture = load("res://ui/button.png")
			st.modulate_color = Color(0.8, 0.8, 0.8) if state == "pressed" else Color.WHITE
			st.content_margin_left = 60; st.content_margin_right = 60; st.content_margin_top = 12; st.content_margin_bottom = 12
			b.add_theme_stylebox_override(state, st)
	else:
		b.add_theme_stylebox_override("normal", _style(WOOD, GOLD_DIM, 6))
		b.add_theme_stylebox_override("hover", _style(WOOD, GOLD, 6))
		b.add_theme_stylebox_override("pressed", _style(CRIMSON, GOLD, 6))
	b.pressed.connect(func() -> void:
		play("ui_tap", -10); on_press.call())
	return b

func _label(text: String, px: int, color := Color.WHITE) -> Label:
	var l := Label.new(); l.text = text; l.add_theme_font_size_override("font_size", px); l.add_theme_font_override("font", font_main); l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7)); l.add_theme_constant_override("outline_size", max(3, px / 7))
	return l

func _build_menu(layer: CanvasLayer) -> void:
	menu = Control.new(); menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); layer.add_child(menu)
	var title := TextureRect.new(); title.texture = load("res://ui/logo.webp"); title.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; title.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	title.position = Vector2(24, 6); title.size = Vector2(270, 182); title.mouse_filter = Control.MOUSE_FILTER_IGNORE; menu.add_child(title)
	var mark := TextureRect.new(); mark.texture = load("res://ui/studio_mark.png"); mark.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; mark.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	mark.position = Vector2(300, 22); mark.size = Vector2(34, 31); mark.mouse_filter = Control.MOUSE_FILTER_IGNORE; menu.add_child(mark)
	var ver := _label("A FORGE FRAME GAME   ·   " + VERSION, 12, Color(0.85, 0.74, 0.53, 0.9)); ver.position = Vector2(340, 29); menu.add_child(ver)

	# right-hand panel: who the chosen fighter is
	var panel := VBoxContainer.new(); panel.name = "Panel"; panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	panel.offset_left = -470; panel.offset_right = -40; panel.offset_top = 30; panel.add_theme_constant_override("separation", 6); menu.add_child(panel)
	var nm := _label("", 32, GOLD); nm.name = "Name"; nm.add_theme_font_override("font", font_display); nm.autowrap_mode = TextServer.AUTOWRAP_WORD; panel.add_child(nm)
	var origin := _label("", 15, Color(0.85, 0.74, 0.53)); origin.name = "Origin"; panel.add_child(origin)
	var blurb := _label("", 14, BONE); blurb.name = "Blurb"; blurb.autowrap_mode = TextServer.AUTOWRAP_WORD; blurb.custom_minimum_size = Vector2(430, 0); panel.add_child(blurb)
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
			play("ui_select", -10); pick = i; arm = ""; _refresh_menu())
		cards.add_child(card)

	# bottom-right: how hard the rival is, and the button that starts the match
	var right := VBoxContainer.new(); right.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT); right.offset_left = -470; right.offset_right = -40; right.offset_top = -300; right.offset_bottom = -30
	right.alignment = BoxContainer.ALIGNMENT_END; right.add_theme_constant_override("separation", 10); menu.add_child(right)
	var levels := HBoxContainer.new(); levels.name = "Levels"; levels.add_theme_constant_override("separation", 10); right.add_child(levels)
	for l in ["easy", "normal", "hard"]:
		var b := _button(l.capitalize(), 22, func() -> void:
			level = l; _refresh_menu())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.set_meta("level", l); levels.add_child(b)
	var gfx := _button("Graphics: High", 16, func() -> void:
		low = not low; arena.set_quality(low); menu.find_child("Gfx", true, false).text = "Graphics: Low" if low else "Graphics: High")
	gfx.name = "Gfx"; right.add_child(gfx)
	var wb := _button("Weapon", 20, func() -> void:
		var cur := ARMS.find(_arm_of(pick)); arm = ARMS[(cur + 1) % ARMS.size()]; _refresh_menu())
	wb.name = "Weaponb"; right.add_child(wb)
	var ab := _button("Arena", 16, func() -> void:
		arena_pick = "meadow" if arena_pick == "storm" else "storm"
		# the place is rebuilt from scratch: sky, light, ground and scenery all differ
		var old: Arena = arena
		arena = Arena.new(); arena.look = arena_pick; add_child(arena); move_child(arena, 0); arena.set_quality(low)
		old.queue_free(); _refresh_menu())
	ab.name = "Arenab"
	var place := HBoxContainer.new(); place.add_theme_constant_override("separation", 10); right.add_child(place)
	right.remove_child(gfx); place.add_child(gfx); place.add_child(ab)
	gfx.size_flags_horizontal = Control.SIZE_EXPAND_FILL; ab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var sb := _button("Shield", 20, func() -> void:
		shield_pick = SHIELDS[(SHIELDS.find(shield_pick) + 1) % SHIELDS.size()]; _refresh_menu())
	sb.name = "Shieldb"
	var kit := HBoxContainer.new(); kit.add_theme_constant_override("separation", 10); right.add_child(kit)
	wb.get_parent().remove_child(wb); kit.add_child(wb); kit.add_child(sb)
	wb.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var go := _button("FIGHT", 36, _start_match, true); go.custom_minimum_size = Vector2(0, 92); right.add_child(go)

## The weapon a fighter will carry: the player's choice for their own fighter, otherwise the fighter's usual one.
func _arm_of(i: int) -> String:
	var own := "f_katana" if roster[i].weapon == "katana" else "f_sword"
	return arm if (arm != "" and i == pick) else own

func _refresh_menu() -> void:
	var d: Dictionary = roster[pick]
	menu.find_child("Weaponb", true, false).text = Sim.weapon_of(_arm_of(pick)).label
	menu.find_child("Shieldb", true, false).text = Sim.shield_of(shield_pick).label
	menu.find_child("Arenab", true, false).text = ARENAS[arena_pick]
	var panel := menu.get_node("Panel")
	panel.get_node("Name").text = d.name
	panel.get_node("Origin").text = d.origin + "   ·   " + Sim.skill_of(d.skill).name
	panel.get_node("Blurb").text = d.blurb
	var st: Dictionary = d.stats
	panel.get_node("Stats").text = ""      # no room beside the weapon button on a phone; the numbers will come back on a proper fighter screen
	var cards := menu.get_node("Cards")
	for i in cards.get_child_count():
		var on := i == pick
		for state in ["normal", "hover", "pressed"]:
			(cards.get_child(i) as Button).add_theme_stylebox_override(state, _style(WOOD, GOLD if on else Color(GOLD_DIM, 0.5), 6))
	for b in _level_buttons():
		var on: bool = b.get_meta("level") == level
		b.add_theme_stylebox_override("normal", _style(CRIMSON if on else WOOD, GOLD if on else GOLD_DIM, 6))
	# the chosen fighter stands in the meadow behind the menu
	if preview: preview.queue_free()
	preview = FighterView.new().setup(d, _arm_of(pick), shield_pick); add_child(preview)
	preview_f = Sim.create_world({"R": Arena.R, "spawns": [{"x": 0.0, "z": 0.0, "yaw": PI - 0.35}, {"x": 0.0, "z": 50.0, "yaw": 0.0}]}, d.stats, d.stats).fighters[0]
	preview.snap(preview_f)

func _level_buttons() -> Array:
	return menu.find_child("Levels", true, false).get_children()

func _show_menu() -> void:
	mode = "menu"
	for v in views: v.queue_free()
	views.clear(); world = {}; hud.world = {}
	menu.visible = true; result.visible = false; hud.visible = false; pad.visible = false; cam_button.visible = false
	_refresh_menu()
	play_music("menu", -20.0)

func _build_result(layer: CanvasLayer) -> void:
	result = Control.new(); result.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); result.visible = false; layer.add_child(result)
	var shade := ColorRect.new(); shade.color = Color(0, 0, 0, 0.45); shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); result.add_child(shade)
	var box := VBoxContainer.new(); box.set_anchors_preset(Control.PRESET_CENTER); box.grow_horizontal = Control.GROW_DIRECTION_BOTH; box.grow_vertical = Control.GROW_DIRECTION_BOTH
	box.add_theme_constant_override("separation", 18); box.alignment = BoxContainer.ALIGNMENT_CENTER; result.add_child(box)
	var head := _label("VICTORY", 90, GOLD); head.name = "Head"; head.add_theme_font_override("font", font_display); head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(head)
	var sub := _label("", 24, BONE); sub.name = "Sub"; sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(sub)
	var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.add_theme_constant_override("separation", 20); box.add_child(row)
	var again := _button("Fight again", 26, _start_match, true); again.custom_minimum_size = Vector2(330, 74); row.add_child(again)
	row.add_child(_button("Change fighter", 24, _show_menu))

## The studio's card: the Forge Frame logo on the dark page for two seconds (it follows on from the boot picture without a jump). A tap skips it.
func _build_splash(layer: CanvasLayer) -> void:
	splash = Control.new(); splash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); layer.add_child(splash)
	var page := ColorRect.new(); page.color = Color(0.0706, 0.0471, 0.0275); page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); splash.add_child(page)
	var logo := TextureRect.new(); logo.texture = load("res://ui/studio_logo.png"); logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	logo.anchor_left = 0.0; logo.anchor_right = 1.0; logo.anchor_top = 0.19; logo.anchor_bottom = 0.763; splash.add_child(logo)
	var pres := _label("P R E S E N T S", 15, Color(0.79, 0.64, 0.4)); pres.name = "Pres"; pres.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pres.anchor_left = 0.0; pres.anchor_right = 1.0; pres.anchor_top = 0.8; pres.anchor_bottom = 0.8; pres.modulate.a = 0.0; splash.add_child(pres)
	page.gui_input.connect(func(ev: InputEvent) -> void:
		if (ev is InputEventScreenTouch or ev is InputEventMouseButton) and ev.pressed: splash_t = max(splash_t, 2.2))

## Black bars above and below, the ultimate's name in gold, and a flash when it is let loose.
func _build_cine(layer: CanvasLayer) -> void:
	cine = Control.new(); cine.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); cine.mouse_filter = Control.MOUSE_FILTER_IGNORE; cine.visible = false; layer.add_child(cine)
	for n in ["Top", "Bottom"]:
		var bar := ColorRect.new(); bar.name = n; bar.color = Color(0.03, 0.02, 0.01); bar.mouse_filter = Control.MOUSE_FILTER_IGNORE; cine.add_child(bar)
	var who := _label("", 16, Color(0.85, 0.74, 0.53)); who.name = "Who"; who.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; cine.add_child(who)
	var nm := _label("", 54, GOLD); nm.name = "Name"; nm.add_theme_font_override("font", font_display); nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; cine.add_child(nm)
	var fl := ColorRect.new(); fl.name = "Flash"; fl.color = Color(1, 0.93, 0.75, 0); fl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); fl.mouse_filter = Control.MOUSE_FILTER_IGNORE; cine.add_child(fl)

func _cine(dt: float) -> void:
	ult_mix = move_toward(ult_mix, 0.0 if ult.is_empty() else 1.0, dt * (5.0 if ult.is_empty() else 7.0))
	flash = max(0.0, flash - dt * 2.6)
	cine.visible = ult_mix > 0.001 or flash > 0.001
	if not cine.visible: return
	var s := get_viewport().get_visible_rect().size
	var h := s.y * 0.13 * ult_mix
	(cine.get_node("Top") as ColorRect).position = Vector2.ZERO; (cine.get_node("Top") as ColorRect).size = Vector2(s.x, h)
	(cine.get_node("Bottom") as ColorRect).position = Vector2(0, s.y - h); (cine.get_node("Bottom") as ColorRect).size = Vector2(s.x, h)
	var nm := cine.get_node("Name") as Label
	var who := cine.get_node("Who") as Label
	nm.size = Vector2(s.x, 70); nm.position = Vector2((1 - ult_mix) * -60.0, s.y * 0.87 - 104); nm.modulate.a = ult_mix
	who.size = Vector2(s.x, 22); who.position = Vector2((1 - ult_mix) * 60.0, s.y * 0.87 - 126); who.modulate.a = ult_mix
	(cine.get_node("Flash") as ColorRect).color.a = flash
	hud.modulate.a = 1 - ult_mix; pad.modulate.a = 1 - ult_mix * 0.8; cam_button.modulate.a = 0.75 * (1 - ult_mix)
	if arena.env: arena.env.adjustment_brightness = 1.0 - 0.3 * ult_mix

## Embers rising round a fighter gathering power.
func _embers(at: Vector3) -> void:
	var ps := CPUParticles3D.new()
	var q := QuadMesh.new(); q.size = Vector2(0.026, 0.026)
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(1.0, 0.72, 0.28); m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES; m.vertex_color_use_as_albedo = true
	q.material = m; ps.mesh = q
	ps.one_shot = true; ps.explosiveness = 0.0; ps.amount = 90; ps.lifetime = ULT_DUR
	ps.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING; ps.emission_ring_axis = Vector3.UP; ps.emission_ring_radius = 1.0; ps.emission_ring_inner_radius = 0.5; ps.emission_ring_height = 0.1
	ps.direction = Vector3.UP; ps.spread = 12.0; ps.initial_velocity_min = 1.2; ps.initial_velocity_max = 3.2; ps.gravity = Vector3(0, 0.6, 0)
	ps.scale_amount_min = 0.5; ps.scale_amount_max = 1.8
	var ramp := Gradient.new(); ramp.set_color(0, Color(1, 1, 1, 1)); ramp.set_color(1, Color(1, 0.4, 0.1, 0)); ps.color_ramp = ramp
	ps.position = at + Vector3(0, 0.05, 0); add_child(ps); ps.emitting = true
	get_tree().create_timer(ULT_DUR * 2.2).timeout.connect(ps.queue_free)

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
	# the rival turns up with a weapon of its own choosing
	arms = [_arm_of(pick), ARMS[randi() % ARMS.size()] if OS.get_environment("DUEL_FOE_ARM") == "" else OS.get_environment("DUEL_FOE_ARM")]
	shields = [shield_pick, SHIELDS[randi() % SHIELDS.size()]]
	var sa: Dictionary = roster[pick].stats.duplicate(); sa.weapon = arms[0]; sa.shield = shields[0]; sa.speed *= PACE
	var sb: Dictionary = roster[foe].stats.duplicate(); sb.weapon = arms[1]; sb.shield = shields[1]; sb.speed *= PACE
	world = Sim.create_world({"R": Arena.R, "spawns": Arena.SPAWNS}, sa, sb)
	rival = Rival.new(level, randi())
	auto_ai = Rival.new("hard", randi())
	for i in 2:
		var v := FighterView.new().setup(roster[pick if i == 0 else foe], arms[i], shields[i]); add_child(v); views.append(v)
	hud.world = world; hud.names = [roster[pick].short, roster[foe].short]; hud.shown_hp = [1.0, 1.0]
	cam_yaw = 0.0; acc = 0.0; hitstop = 0.0
	mode = "fight"; menu.visible = false; result.visible = false; hud.visible = true; pad.visible = not auto; cam_button.visible = true
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
	if splash:
		splash_t += dt
		(splash.get_node("Pres") as Label).modulate.a = clampf((splash_t - 0.5) / 0.6, 0, 1)
		splash.modulate.a = clampf((2.7 - splash_t) / 0.5, 0, 1)
		if splash_t > 2.7:
			splash.queue_free(); splash = null
	if mode == "menu":
		spin += dt * 0.12
		if preview:
			preview.update(preview_f, dt)
			arena.set_fighters(Vector3.ZERO, Vector3(0, 0, 50))
		var a := 0.35 + sin(spin) * 0.25
		cam.fov = 36.0
		cam.position = Vector3(-sin(a) * 4.6 - 0.7, 1.25, -cos(a) * 4.6)
		cam.look_at(Vector3(-0.7, 1.0, 0))
	elif mode != "strip":
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
	if not ult.is_empty():
		# the fight holds its breath while the power is gathered
		acc = 0.0
		ult.t += dt
		views[ult.id].ult = min(1.0, ult.t / ULT_DUR)
		if ult.t >= ULT_DUR:
			var v := views[int(ult.id)]
			v.ult = -1.0; flash = 0.55; shake = max(shake, 1.2); play("swing_heavy", -4, 0.8)
			_spark(v.position.x, v.position.z, Color(1.0, 0.8, 0.4), 70, 9.0, 0.25)
			ult = {}
	while acc >= Sim.TICK:
		acc -= Sim.TICK
		if hitstop > 0:
			hitstop -= Sim.TICK; continue
		var mine: Dictionary = auto_ai.think(world, 0) if auto else _player_cmd(first)
		first = false
		if ult_test > 0.0 and clock > ult_test:      # test runs: DUEL_ULT=seconds makes the player's fighter use their ultimate then
			world.fighters[0].energy = 100.0; mine.skill = true
		Sim.step_world(world, [mine, rival.think(world, 1)])
		for ev in world.events: _on_event(ev)
		world.events.clear()
		if not ult.is_empty():
			acc = 0.0; break
	for i in 2: views[i].update(world.fighters[i], dt)
	pad.energy = world.fighters[0].energy / 100.0
	pad.queue_redraw()
	_cine(dt)
	_camera(dt)

func _camera(dt: float) -> void:
	var p := views[0].position
	var e := views[1].position
	var flat := Vector2(e.x - p.x, e.z - p.z)
	var mid := Vector3((p.x + e.x) / 2, 1.1, (p.z + e.z) / 2)
	var pos: Vector3
	var look: Vector3
	if CAM.get("side_on", false):
		# stand off to one side of the line between the fighters; the stick is then read from that side
		if flat.length() > 0.6: cam_yaw += Sim.ang_diff(cam_yaw, atan2(flat.x, flat.y) + PI / 2) * min(1.0, 2.5 * dt)
		var away: float = CAM.dist + clampf((flat.length() - 2.5) * 0.62, 0.0, 6.0)
		pos = Vector3(mid.x - sin(cam_yaw) * away, CAM.height + sin(CAM.pitch) * away, mid.z - cos(cam_yaw) * away)
		look = mid
	else:
		if flat.length() > 0.6: cam_yaw += Sim.ang_diff(cam_yaw, atan2(flat.x, flat.y)) * min(1.0, 5.0 * dt)
		var fx := sin(cam_yaw)
		var fz := cos(cam_yaw)
		var back: float = cos(CAM.pitch) * CAM.dist
		# pull back a little when the fighters are far apart, so both stay in view
		var extra := clampf((flat.length() - 4.0) * 0.18, 0.0, 1.6)
		pos = Vector3(p.x - fx * (back + extra) - fz * CAM.side, CAM.height + sin(CAM.pitch) * CAM.dist + extra * 0.3, p.z - fz * (back + extra) + fx * CAM.side)
		look = Vector3(p.x * 0.55 + e.x * 0.45, 1.2, p.z * 0.55 + e.z * 0.45)
	var fov: float = CAM.fov - (6.0 if get_viewport().get_visible_rect().size.aspect() > 2.0 else 0.0)
	if ult_mix > 0.001:
		# come round to the front of the fighter gathering power, low and close, drifting in
		var v := views[ult_id]
		var k: float = ult.t / ULT_DUR if not ult.is_empty() else 1.0
		var side := -1.0 if ult_id == 0 else 1.0
		var ang: float = v.rotation.y + side * (0.75 - 0.4 * k)
		var d: float = 3.1 - 0.8 * k
		var e2 := smoothstep(0.0, 1.0, ult_mix)
		pos = pos.lerp(v.position + Vector3(sin(ang) * d, 0.85 + 0.2 * k, cos(ang) * d), e2)
		look = look.lerp(v.position + Vector3(0, 1.3, 0), e2)
		fov = lerpf(fov, 36.0, e2)
	shake = max(0.0, shake - dt * 2.4)
	if shake > 0: pos += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * shake * 0.12
	cam.fov = fov
	cam.position = pos
	cam.look_at(look)
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
			cam_yaw = atan2(e.x - p.x, e.z - p.z) + (PI / 2 if CAM.get("side_on", false) else 0.0)
		"fight":
			hud.say("FIGHT!", 0.9, GOLD); play("gong", -8)
		"swing":
			play("swing_heavy" if ev.heavy else ("swing1" if randf() < 0.5 else "swing2"), -12)
		"dodge": play("dodge", -12)
		"winded": play("exhausted", -10)
		"string":
			if mine and ev.title != "": hud.say_move(ev.title)
		"skill":
			play("horn", -8)
			ult = {"id": ev.id, "t": 0.0}; ult_id = ev.id; ult_test = 0.0
			(cine.get_node("Name") as Label).text = ev.name
			(cine.get_node("Who") as Label).text = roster[pick if ev.id == 0 else foe].name.to_upper()
			_embers(views[ev.id].position)
		"hit":
			var big: bool = ev.heavy or ev.kill
			play("hit_heavy" if big else ("hit1" if randf() < 0.5 else "hit2"), -5 if big else -8)
			_spark(ev.x, ev.z, Color(1.0, 0.45, 0.15) if ev.blue else Color(1.0, 0.8, 0.45), 26 if big else 12, 6.0 if big else 4.0, 0.3 if ev.ground else 1.15)
			hitstop = max(hitstop, 0.09 if big else 0.045)
			shake = max(shake, 0.9 if big else 0.3)
			if ev.kill: play("death", -6)
			elif ev.riposte and mine: hud.say_move("Riposte!")
		"block":
			play("block1" if randf() < 0.5 else "block2", -8); _spark(ev.x, ev.z, Color(0.9, 0.95, 1.0), 8, 3.0); hitstop = max(hitstop, 0.03)
		"armor":
			play("block2", -8, 0.8); _spark(ev.x, ev.z, Color(0.4, 0.7, 1.0), 10, 3.0)
		"guardbreak":
			play("guard_break", -5); _spark(ev.x, ev.z, Color(1.0, 0.5, 0.2), 24, 6.0); shake = max(shake, 0.8); hitstop = max(hitstop, 0.08)
			hud.say("GUARD BROKEN", 0.8, Color(1.0, 0.6, 0.3))
		"deflect":
			play("parry", -5); _spark(ev.x, ev.z, Color(1, 1, 1), 22, 6.0); hitstop = max(hitstop, 0.1); shake = max(shake, 0.5)
			hud.say("PARRY" if ev.id == 0 else "PARRIED", 0.7, Color(0.8, 0.92, 1.0))
		"parry":
			play("parry", -3, 0.85); _spark(ev.x, ev.z, Color(1.0, 0.85, 0.5), 40, 8.0); hitstop = max(hitstop, 0.16); shake = max(shake, 1.0)
			hud.say("PARRY!" if ev.id == 0 else "PARRIED!", 0.9, Color(1.0, 0.8, 0.4))
		"clash":
			play("parry", -6, 1.2); _spark(ev.x, ev.z, Color(1.0, 0.9, 0.6), 24, 6.0); hitstop = max(hitstop, 0.08); shake = max(shake, 0.5)
		"land":
			_spark(ev.x, ev.z, Color(0.7, 0.6, 0.4, 0.8), 10, 2.0, 0.1)
		"roundend":
			hud.say("TIME" if ev.timeout else "K.O.", 2.4, GOLD); play("victory_hit", -6)
			if ev.winner >= 0: views[ev.winner].cheer = true
		"matchover":
			var won: bool = ev.winner == 0
			mode = "result"; result.visible = true; pad.visible = false; cam_button.visible = false
			result.find_child("Head", true, false).text = "VICTORY" if won else "DEFEAT"
			result.find_child("Head", true, false).add_theme_color_override("font_color", GOLD if won else Color(0.85, 0.35, 0.3))
			result.find_child("Sub", true, false).text = "%s  %d : %d  %s" % [roster[pick].short, world.score[0], world.score[1], roster[foe].short]
			play_music("victory" if won else "defeat", -16.0, false)
