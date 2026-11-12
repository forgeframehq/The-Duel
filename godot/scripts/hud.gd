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
var display: Font
const GOLD := Color(0.914, 0.769, 0.416)
const GOLD_DIM := Color(0.722, 0.525, 0.184)
const BONE := Color(0.965, 0.906, 0.769)

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if font == null: font = ThemeDB.fallback_font
	if display == null: display = font

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

## A bar in a dark well with a gold rim, as in Dawn of Dynasties: lighter along the top, darker along the bottom.
func _bar(pos: Vector2, w: float, h: float, frac: float, color: Color, flip: bool, trail := -1.0) -> void:
	draw_rect(Rect2(pos - Vector2(2, 2), Vector2(w + 4, h + 4)), Color(0.36, 0.25, 0.08))
	draw_rect(Rect2(pos, Vector2(w, h)), Color(0.1, 0.065, 0.04))
	if trail > frac:
		var tw := w * clampf(trail, 0, 1)
		draw_rect(Rect2(Vector2(pos.x + (w - tw if flip else 0.0), pos.y), Vector2(tw, h)), Color(BONE, 0.75))
	var fw := w * clampf(frac, 0, 1)
	var fx := pos.x + (w - fw if flip else 0.0)
	draw_rect(Rect2(Vector2(fx, pos.y), Vector2(fw, h)), color)
	draw_rect(Rect2(Vector2(fx, pos.y), Vector2(fw, h * 0.42)), Color(1, 1, 1, 0.22))
	draw_rect(Rect2(Vector2(fx, pos.y + h * 0.72), Vector2(fw, h * 0.28)), Color(0, 0, 0, 0.25))
	draw_rect(Rect2(pos - Vector2(2, 2), Vector2(w + 4, h + 4)), GOLD_DIM, false, 1.5)
	draw_line(pos - Vector2(2, 2), pos + Vector2(w + 2, -2), Color(0.95, 0.85, 0.54), 1.5)

func _text(text: String, pos: Vector2, px: int, color: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0, f: Font = null) -> void:
	if f == null: f = font
	draw_string_outline(f, pos, text, align, width, px, max(3, px / 6), Color(0.08, 0.04, 0.02, 0.85 * color.a))
	draw_string(f, pos, text, align, width, px, color)

func _draw() -> void:
	if world.is_empty(): return
	var s := size
	var w: float = min(470.0, s.x * 0.36)
	for i in 2:
		var f: Dictionary = world.fighters[i]
		var flip := i == 1
		var x: float = s.x - 40 - w if flip else 40.0
		var hp: float = f.hp / f.stats.maxHp
		_bar(Vector2(x, 34), w, 22, hp, (Color(0.7, 0.09, 0.06) if flip else Color(0.2, 0.42, 0.82)).lightened(0.25 * (0.5 + 0.5 * sin(banner_t * 9)) if hp < 0.3 else 0.0), flip, shown_hp[i])
		var sw: float = w * 0.62
		_bar(Vector2(x + (w - sw if flip else 0.0), 61), sw, 8, f.stam / f.stats.maxStam, Color(0.45, 0.42, 0.38) if f.winded > 0 else Color(0.86, 0.68, 0.25), flip)
		var gw: float = w * 0.42
		_bar(Vector2(x + (w - gw if flip else 0.0), 73), gw, 6, f.guardM / Sim.GUARD_MAX, Color(0.75, 0.82, 0.9), flip)
		_text(names[i], Vector2(x, 25), 17, BONE, HORIZONTAL_ALIGNMENT_RIGHT if flip else HORIZONTAL_ALIGNMENT_LEFT, w)
		# rounds won
		for k in Sim.ROUNDS_TO_WIN:
			var c := Vector2(s.x / 2 + (52 + k * 22) * (1 if flip else -1), 46)
			draw_circle(c, 7, GOLD if world.score[i] > k else Color(0.1, 0.065, 0.04))
			draw_arc(c, 7, 0, TAU, 20, GOLD_DIM, 1.5, true)
	_text(str(ceili(world.timeLeft)), Vector2(s.x / 2 - 40, 60), 38, GOLD, HORIZONTAL_ALIGNMENT_CENTER, 80)
	if banner != "" and banner_t < banner_dur:
		var a := clampf(banner_t / 0.12, 0, 1) * clampf((banner_dur - banner_t) / 0.3, 0, 1)
		var px := int(84 * (1.0 + 0.25 * (1 - clampf(banner_t / 0.18, 0, 1))))
		_text(banner, Vector2(0, s.y * 0.42), px, Color(banner_color, a), HORIZONTAL_ALIGNMENT_CENTER, s.x, display)
	if move_name != "" and move_t < 1.1:
		_text(move_name, Vector2(0, s.y * 0.72), 28, Color(GOLD, clampf((1.1 - move_t) / 0.3, 0, 1)), HORIZONTAL_ALIGNMENT_CENTER, s.x)
