class_name Hud
extends Control
## What is drawn over the fight: both fighters' bars, the clock, the rounds won, and the big words in the middle.

var world := {}
var names := ["", ""]
var banner := ""
var banner_t := 0.0
var banner_dur := 1.0
var banner_color := Color.WHITE
var move_name := ""
var move_t := 0.0
var shown_hp := [1.0, 1.0]      # the pale bar that trails behind the health bar, so a big hit is easy to read
var font: Font

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = ThemeDB.fallback_font

func say(text: String, secs := 1.4, color := Color.WHITE) -> void:
	banner = text; banner_t = 0.0; banner_dur = secs; banner_color = color

func say_move(text: String) -> void:
	move_name = text; move_t = 0.0

func _process(dt: float) -> void:
	banner_t += dt; move_t += dt
	if not world.is_empty():
		for i in 2:
			var f: Dictionary = world.fighters[i]
			var hp: float = f.hp / f.stats.maxHp
			shown_hp[i] = hp if hp > shown_hp[i] else move_toward(shown_hp[i], hp, dt * 0.35)
	queue_redraw()

func _bar(pos: Vector2, w: float, h: float, frac: float, color: Color, flip: bool, trail := -1.0) -> void:
	draw_rect(Rect2(pos, Vector2(w, h)), Color(0, 0, 0, 0.5))
	if trail > frac:
		var tw := w * clampf(trail, 0, 1)
		draw_rect(Rect2(Vector2(pos.x + (w - tw if flip else 0.0), pos.y), Vector2(tw, h)), Color(1, 1, 1, 0.65))
	var fw := w * clampf(frac, 0, 1)
	draw_rect(Rect2(Vector2(pos.x + (w - fw if flip else 0.0), pos.y), Vector2(fw, h)), color)
	draw_rect(Rect2(pos, Vector2(w, h)), Color(1, 1, 1, 0.35), false, 1.5)

func _text(text: String, pos: Vector2, px: int, color: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string_outline(font, pos, text, align, width, px, max(2, px / 8), Color(0, 0, 0, 0.7 * color.a))
	draw_string(font, pos, text, align, width, px, color)

func _draw() -> void:
	if world.is_empty(): return
	var s := size
	var w: float = min(470.0, s.x * 0.36)
	for i in 2:
		var f: Dictionary = world.fighters[i]
		var flip := i == 1
		var x: float = s.x - 40 - w if flip else 40.0
		var hp: float = f.hp / f.stats.maxHp
		_bar(Vector2(x, 34), w, 22, hp, Color(0.86, 0.2, 0.18) if hp < 0.3 else Color(0.95, 0.76, 0.22), flip, shown_hp[i])
		var sw: float = w * 0.62
		_bar(Vector2(x + (w - sw if flip else 0.0), 61), sw, 8, f.stam / f.stats.maxStam, Color(0.5, 0.5, 0.5) if f.winded > 0 else Color(0.35, 0.8, 0.45), flip)
		var gw: float = w * 0.42
		_bar(Vector2(x + (w - gw if flip else 0.0), 73), gw, 6, f.guardM / Sim.GUARD_MAX, Color(0.75, 0.82, 0.9), flip)
		_text(names[i], Vector2(x, 26), 20, Color.WHITE, HORIZONTAL_ALIGNMENT_RIGHT if flip else HORIZONTAL_ALIGNMENT_LEFT, w)
		# rounds won
		for k in Sim.ROUNDS_TO_WIN:
			var c := Vector2(s.x / 2 + (52 + k * 22) * (1 if flip else -1), 46)
			draw_circle(c, 7, Color(1.0, 0.8, 0.3) if world.score[i] > k else Color(0, 0, 0, 0.5))
			draw_arc(c, 7, 0, TAU, 20, Color(1, 1, 1, 0.6), 1.5, true)
	_text(str(ceili(world.timeLeft)), Vector2(s.x / 2 - 40, 60), 38, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER, 80)
	if banner != "" and banner_t < banner_dur:
		var a := clampf(banner_t / 0.12, 0, 1) * clampf((banner_dur - banner_t) / 0.3, 0, 1)
		var px := int(84 * (1.0 + 0.25 * (1 - clampf(banner_t / 0.18, 0, 1))))
		_text(banner, Vector2(0, s.y * 0.42), px, Color(banner_color, a), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	if move_name != "" and move_t < 1.1:
		_text(move_name, Vector2(0, s.y * 0.72), 30, Color(1.0, 0.86, 0.5, clampf((1.1 - move_t) / 0.3, 0, 1)), HORIZONTAL_ALIGNMENT_CENTER, s.x)
