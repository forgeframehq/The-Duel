extends Node3D
## First pipeline test: one fighter standing in a lit scene, to prove that the game loads on a phone.

func _ready() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new(); var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color(0.25, 0.5, 0.85); mat.sky_horizon_color = Color(0.86, 0.92, 0.96); mat.ground_bottom_color = Color(0.3, 0.4, 0.2); mat.ground_horizon_color = Color(0.7, 0.8, 0.75)
	sky.sky_material = mat
	e.background_mode = Environment.BG_SKY; e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; e.ambient_light_energy = 0.9
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e; add_child(env)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-50, -35, 0); sun.light_energy = 1.6; sun.light_color = Color(1, 0.95, 0.85); sun.shadow_enabled = true; add_child(sun)
	var ground := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(60, 60); ground.mesh = pm
	var gm := StandardMaterial3D.new(); gm.albedo_color = Color(0.3, 0.45, 0.2); ground.material_override = gm; add_child(ground)

	var fighter: Node3D = (load("res://models/wuixi.glb") as PackedScene).instantiate()
	add_child(fighter)
	var player: AnimationPlayer = fighter.find_child("AnimationPlayer", true, false)
	player.add_animation_library("moves", Clips.library())
	var stance: Animation = Clips.library().get_animation("Combat_Stance"); stance.loop_mode = Animation.LOOP_LINEAR
	player.play("moves/Combat_Stance")
	fighter.rotation.y = 0.5

	var cam := Camera3D.new(); cam.fov = 40; cam.position = Vector3(0.4, 1.3, 3.6); add_child(cam); cam.look_at(Vector3(0, 0.95, 0))
	var label := Label.new(); label.text = "The Duel   Godot test 0.1   If you can read this and see Wuixi, it works"
	label.add_theme_font_size_override("font_size", 28); label.position = Vector2(30, 24); add_child(label)

	if OS.get_environment("DUEL_SHOT") != "":
		await get_tree().create_timer(1.2).timeout
		get_viewport().get_texture().get_image().save_png(OS.get_environment("DUEL_SHOT"))
		get_tree().quit()
