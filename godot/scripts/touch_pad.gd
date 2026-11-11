class_name TouchPad
extends Control
## The on-screen controls: a stick under the left thumb, and five see-through buttons under the right.
##   H  horizontal attack      V  vertical attack      (tap = quick attack, keep holding = blue charged strike)
##   Guard (hold to block, press at the last moment to parry)      Dodge      Special (when the ring round it is full)

const STICK_R := 95.0
var stick := Vector2.ZERO          # x right, y down, length 0 to 1
var stick_finger := -1
var stick_origin := Vector2.ZERO
var buttons := {}                  # name -> { pos, r, finger, edge }
var energy := 0.0                  # 0 to 1: how full the special's ring is
var keys := false                  # a keyboard is in use (desktop testing)

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for n in ["h", "v", "guard", "dodge", "skill"]: buttons[n] = {"pos": Vector2.ZERO, "r": 50.0, "finger": -1, "edge": false}
	resized.connect(_layout); _layout()

func _layout() -> void:
	var s := size
	var set_b := func(n: String, x: float, y: float, r: float) -> void:
		buttons[n].pos = Vector2(s.x - x, s.y - y); buttons[n].r = r
	set_b.call("h", 135, 125, 66)
	set_b.call("v", 290, 95, 58)
	set_b.call("guard", 110, 285, 52)
	set_b.call("dodge", 262, 232, 48)
	set_b.call("skill", 425, 78, 44)
	queue_redraw()

func _input(ev: InputEvent) -> void:
	if not visible: return
	if ev is InputEventScreenTouch:
		if ev.pressed:
			for n in buttons:
				var b: Dictionary = buttons[n]
				if b.finger < 0 and ev.position.distance_to(b.pos) < b.r * 1.25:
					b.finger = ev.index; b.edge = true; queue_redraw(); return
			if stick_finger < 0 and ev.position.x < size.x * 0.5:
				stick_finger = ev.index; stick_origin = ev.position; stick = Vector2.ZERO; queue_redraw()
		else:
			if ev.index == stick_finger:
				stick_finger = -1; stick = Vector2.ZERO
			for n in buttons:
				if buttons[n].finger == ev.index: buttons[n].finger = -1
			queue_redraw()
	elif ev is InputEventScreenDrag and ev.index == stick_finger:
		var d: Vector2 = ev.position - stick_origin
		# the stick's base follows a thumb that drags past its edge, so it never gets "stuck" at full tilt
		if d.length() > STICK_R:
			stick_origin = ev.position - d.normalized() * STICK_R; d = ev.position - stick_origin
		stick = d / STICK_R
		queue_redraw()

func down(n: String) -> bool:
	return buttons[n].finger >= 0

## The buttons pressed since the last call (each press is reported once).
func take(n: String) -> bool:
	var e: bool = buttons[n].edge
	buttons[n].edge = false
	return e

func _draw() -> void:
	var white := Color(1, 1, 1, 0.55)
	# the stick: only drawn while a thumb is on it, where the thumb came down
	if stick_finger >= 0:
		draw_arc(stick_origin, STICK_R, 0, TAU, 48, Color(1, 1, 1, 0.25), 3.0, true)
		draw_circle(stick_origin + stick * STICK_R, 34, Color(1, 1, 1, 0.3))
	else:
		var rest := Vector2(170, size.y - 170)
		draw_arc(rest, STICK_R, 0, TAU, 48, Color(1, 1, 1, 0.12), 3.0, true)
		draw_circle(rest, 30, Color(1, 1, 1, 0.1))
	for n in buttons:
		var b: Dictionary = buttons[n]
		var p: Vector2 = b.pos
		var r: float = b.r
		var held: bool = b.finger >= 0
		draw_circle(p, r, Color(0, 0, 0, 0.32 if held else 0.16))
		draw_arc(p, r, 0, TAU, 48, Color(1, 1, 1, 0.9 if held else 0.45), 3.0, true)
		var c := Color(1, 1, 1, 0.95) if held else white
		match n:
			"h":   # a wide sweeping cut
				draw_arc(p + Vector2(0, r * 0.75), r * 1.05, -PI * 0.78, -PI * 0.22, 20, c, 5.0, true)
				draw_line(p + Vector2(r * 0.42, -r * 0.2), p + Vector2(r * 0.62, 0.02 * r), c, 5.0, true)
			"v":   # a downward cut
				draw_arc(p + Vector2(-r * 0.75, 0), r * 1.05, -PI * 0.28, PI * 0.28, 20, c, 5.0, true)
				draw_line(p + Vector2(r * 0.2, r * 0.42), p + Vector2(-0.02 * r, r * 0.62), c, 5.0, true)
			"guard":   # a blade held across the body
				draw_line(p + Vector2(-r * 0.5, r * 0.3), p + Vector2(r * 0.5, -r * 0.3), c, 6.0, true)
				draw_line(p + Vector2(-r * 0.42, r * 0.02), p + Vector2(-r * 0.2, r * 0.38), c, 5.0, true)
			"dodge":   # two chevrons
				for k in [-0.22, 0.18]:
					draw_polyline(PackedVector2Array([p + Vector2(r * (k - 0.15), -r * 0.35), p + Vector2(r * (k + 0.2), 0), p + Vector2(r * (k - 0.15), r * 0.35)]), c, 5.0, true)
			"skill":   # a four-pointed star, ringed by the energy bar
				var full := energy >= 1.0
				var sc := Color(1.0, 0.82, 0.35, 0.95) if full else Color(1, 1, 1, 0.3)
				var pts := PackedVector2Array()
				for i in 8: pts.append(p + Vector2.from_angle(i * PI / 4 - PI / 2) * (r * (0.62 if i % 2 == 0 else 0.2)))
				draw_colored_polygon(pts, sc)
				draw_arc(p, r + 7, -PI / 2, -PI / 2 + TAU * clampf(energy, 0, 1), 48, Color(1.0, 0.8, 0.3, 0.95) if full else Color(0.5, 0.75, 1.0, 0.85), 5.0, true)
