class_name Room
extends Node3D
## One room of the facility. All geometry is generated from primitives in
## build(): dark metallic walls/floor, neon emissive accent strips, pipes,
## a glowing terminal (group "terminal"), a sliding exit door in the room's
## entry wall (owned by the room you walk INTO), warning light, fog light.
##
## Door convention: rooms are laid out along +X, 12m wide each. Room i>0
## has its entry door in its left wall (x = -6); it opens when room i-1 is
## solved. Room 0's left wall and the last room's right wall are solid.

signal entered(room: Room)
signal timed_out(room: Room)

const W := 12.0   # width  (x)
const H := 5.0    # height (y)
const D := 12.0   # depth  (z)
const DOOR_W := 2.2
const DOOR_H := 3.0

var index := 0
var config := {}
var accent := Color.RED
var is_last := false

var solved := false
var timer_running := false
var time_left := 0.0
var time_limit := 1.0
var door_is_open := false

var _wall_mat: StandardMaterial3D
var _floor_mat: StandardMaterial3D
var _accent_mat: StandardMaterial3D
var _screen_mat: StandardMaterial3D
var _locked_mat: StandardMaterial3D
var _unlocked_mat: StandardMaterial3D

var _door_panel_a: StaticBody3D
var _door_panel_b: StaticBody3D
var _door_light_mesh: MeshInstance3D
var _exit_panel_a: StaticBody3D
var _exit_panel_b: StaticBody3D
var _exit_light_mesh: MeshInstance3D
var exit_door_open := false
var _warn_light: OmniLight3D
var _warn_phase := 0.0


static func create(idx: int, cfg: Dictionary, last: bool) -> Room:
	var r := Room.new()
	r.index = idx
	r.config = cfg
	r.accent = cfg["color"]
	r.is_last = last
	r.time_limit = cfg["time_limit"]
	r.time_left = r.time_limit
	r.name = "Room%d" % (idx + 1)
	return r


func _ready() -> void:
	_build_materials()
	_build_structure()
	_build_decor()
	_build_terminal()
	if index > 0:
		_build_door()
	if is_last:
		_build_exit_door()
	_build_entry_area()
	_build_lights()


func _process(delta: float) -> void:
	if timer_running and not solved:
		time_left -= delta
		if time_left <= 0.0:
			time_left = 0.0
			timer_running = false
			timed_out.emit(self)
	_warn_phase += delta
	if _warn_light != null:
		_warn_light.light_energy = 0.8 + 0.5 * sin(_warn_phase * 2.5)


# ------------------------------------------------------------- public API ---

func start_timer() -> void:
	if not solved and not timer_running:
		timer_running = true


func time_fraction() -> float:
	return clampf(time_left / time_limit, 0.0, 1.0)


func solve() -> void:
	solved = true
	timer_running = false


func open_door() -> void:
	if door_is_open or _door_panel_a == null:
		return
	door_is_open = true
	_door_light_mesh.set_surface_override_material(0, _unlocked_mat)
	var t := create_tween().set_parallel(true)
	t.tween_property(_door_panel_a, "position:z", -DOOR_W * 0.75 - 0.55, 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(_door_panel_b, "position:z", DOOR_W * 0.75 + 0.55, 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)


func open_exit_door() -> void:
	if exit_door_open or _exit_panel_a == null:
		return
	exit_door_open = true
	_exit_light_mesh.set_surface_override_material(0, _unlocked_mat)
	var t := create_tween().set_parallel(true)
	t.tween_property(_exit_panel_a, "position:z", -DOOR_W * 0.75 - 0.55, 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(_exit_panel_b, "position:z", DOOR_W * 0.75 + 0.55, 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)


func reset_room() -> void:
	solved = false
	timer_running = false
	time_left = time_limit
	if _door_panel_a != null:
		var t := create_tween()
		if t != null:
			t.kill()
		_door_panel_a.position.z = -DOOR_W * 0.25
		_door_panel_b.position.z = DOOR_W * 0.25
		door_is_open = false
		_door_light_mesh.set_surface_override_material(0, _locked_mat)
	if _exit_panel_a != null:
		_exit_panel_a.position.z = -DOOR_W * 0.25
		_exit_panel_b.position.z = DOOR_W * 0.25
		exit_door_open = false
		_exit_light_mesh.set_surface_override_material(0, _locked_mat)


# ---------------------------------------------------------------- build ---

func _build_materials() -> void:
	_wall_mat = StandardMaterial3D.new()
	_wall_mat.albedo_color = Color(0.11, 0.12, 0.14)
	_wall_mat.metallic = 0.85
	_wall_mat.roughness = 0.38

	_floor_mat = StandardMaterial3D.new()
	_floor_mat.albedo_color = Color(0.07, 0.075, 0.09)
	_floor_mat.metallic = 0.9
	_floor_mat.roughness = 0.3

	_accent_mat = StandardMaterial3D.new()
	_accent_mat.albedo_color = accent
	_accent_mat.emission_enabled = true
	_accent_mat.emission = accent
	_accent_mat.emission_energy_multiplier = 2.5

	_screen_mat = StandardMaterial3D.new()
	_screen_mat.albedo_color = accent.lerp(Color.WHITE, 0.4)
	_screen_mat.emission_enabled = true
	_screen_mat.emission = accent.lerp(Color.WHITE, 0.5)
	_screen_mat.emission_energy_multiplier = 3.0

	_locked_mat = StandardMaterial3D.new()
	_locked_mat.albedo_color = Color(0.9, 0.1, 0.1)
	_locked_mat.emission_enabled = true
	_locked_mat.emission = Color(1.0, 0.05, 0.05)
	_locked_mat.emission_energy_multiplier = 3.0

	_unlocked_mat = StandardMaterial3D.new()
	_unlocked_mat.albedo_color = Color(0.1, 0.9, 0.2)
	_unlocked_mat.emission_enabled = true
	_unlocked_mat.emission = Color(0.1, 1.0, 0.25)
	_unlocked_mat.emission_energy_multiplier = 3.0


func _box(parent: Node, size: Vector3, pos: Vector3, mat: Material, with_collision := false, body: StaticBody3D = null) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	m.mesh = bm
	m.position = pos
	if mat != null:
		m.set_surface_override_material(0, mat)
	parent.add_child(m)
	if with_collision and body != null:
		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = size
		cs.shape = bs
		cs.position = pos
		body.add_child(cs)
	return m


func _build_structure() -> void:
	var body := StaticBody3D.new()
	body.name = "Structure"
	add_child(body)

	# Floor and ceiling.
	_box(self, Vector3(W, 0.2, D), Vector3(0, -0.1, 0), _floor_mat, true, body)
	_box(self, Vector3(W, 0.2, D), Vector3(0, H + 0.1, 0), _wall_mat, true, body)
	# Back walls (z).
	_box(self, Vector3(W, H, 0.3), Vector3(0, H * 0.5, -D * 0.5), _wall_mat, true, body)
	_box(self, Vector3(W, H, 0.3), Vector3(0, H * 0.5, D * 0.5), _wall_mat, true, body)
	# Left wall (x = -W/2): door gap for rooms after the first.
	var lx := -W * 0.5
	if index == 0:
		_box(self, Vector3(0.3, H, D), Vector3(lx, H * 0.5, 0), _wall_mat, true, body)
	else:
		var seg_w := (D - DOOR_W) * 0.5
		_box(self, Vector3(0.3, H, seg_w), Vector3(lx, H * 0.5, -(DOOR_W * 0.5 + seg_w * 0.5)), _wall_mat, true, body)
		_box(self, Vector3(0.3, H, seg_w), Vector3(lx, H * 0.5, DOOR_W * 0.5 + seg_w * 0.5), _wall_mat, true, body)
		_box(self, Vector3(0.3, H - DOOR_H, DOOR_W), Vector3(lx, DOOR_H + (H - DOOR_H) * 0.5, 0), _wall_mat, true, body)
	# Right wall: only the last room has one — with an exit door gap to the meadow.
	if is_last:
		var rx := W * 0.5
		var rseg := (D - DOOR_W) * 0.5
		_box(self, Vector3(0.3, H, rseg), Vector3(rx, H * 0.5, -(DOOR_W * 0.5 + rseg * 0.5)), _wall_mat, true, body)
		_box(self, Vector3(0.3, H, rseg), Vector3(rx, H * 0.5, DOOR_W * 0.5 + rseg * 0.5), _wall_mat, true, body)
		_box(self, Vector3(0.3, H - DOOR_H, DOOR_W), Vector3(rx, DOOR_H + (H - DOOR_H) * 0.5, 0), _wall_mat, true, body)


func _build_decor() -> void:
	# Neon strips along the top edges of the back walls.
	_box(self, Vector3(W - 0.4, 0.08, 0.08), Vector3(0, H - 0.25, -D * 0.5 + 0.25), _accent_mat)
	_box(self, Vector3(W - 0.4, 0.08, 0.08), Vector3(0, H - 0.25, D * 0.5 - 0.25), _accent_mat)
	# Vertical accent strip beside the door / entry.
	_box(self, Vector3(0.08, H - 0.6, 0.08), Vector3(-W * 0.5 + 0.25, H * 0.5, DOOR_W * 0.5 + 0.4), _accent_mat)
	# Floor guide strip leading from entry to the terminal.
	_box(self, Vector3(0.12, 0.02, D - 3.0), Vector3(-1.0, 0.02, -0.5), _accent_mat)
	# Pipes along the back wall.
	for i in 3:
		var pipe := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.1 + i * 0.03
		cm.bottom_radius = 0.1 + i * 0.03
		cm.height = W - 0.6
		pipe.mesh = cm
		pipe.rotation_degrees.z = 90.0
		pipe.position = Vector3(0, H - 1.0 - i * 0.45, -D * 0.5 + 0.45)
		pipe.set_surface_override_material(0, _wall_mat)
		add_child(pipe)
	# A few crates for industrial feel.
	var rng := RandomNumberGenerator.new()
	rng.seed = 1000 + index
	for i in 3:
		var s := rng.randf_range(0.5, 0.9)
		_box(self, Vector3(s, s, s), Vector3(rng.randf_range(2.0, 4.5), s * 0.5, rng.randf_range(2.5, 4.5)), _wall_mat)


func _build_terminal() -> void:
	var term := StaticBody3D.new()
	term.name = "Terminal"
	term.add_to_group("terminal")
	term.set_meta("room", self)
	add_child(term)
	var tx := 0.0
	var tz := -D * 0.5 + 0.65
	# Desk.
	_box(term, Vector3(1.8, 1.0, 0.6), Vector3(tx, 0.5, tz), _wall_mat)
	# Screen.
	_box(term, Vector3(1.5, 0.95, 0.1), Vector3(tx, 1.65, tz - 0.1), _screen_mat)
	# Keyboard slab.
	_box(term, Vector3(1.2, 0.06, 0.35), Vector3(tx, 1.03, tz + 0.28), _accent_mat)
	# Collision covering the whole terminal.
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(1.9, 2.2, 0.9)
	cs.shape = bs
	cs.position = Vector3(tx, 1.1, tz)
	term.add_child(cs)


func _build_door() -> void:
	var lx := -W * 0.5
	# Panel A (slides to -z), panel B (slides to +z).
	_door_panel_a = _make_door_panel(Vector3(lx, DOOR_H * 0.5, -DOOR_W * 0.25))
	_door_panel_b = _make_door_panel(Vector3(lx, DOOR_H * 0.5, DOOR_W * 0.25))
	# Status light beside the door.
	_door_light_mesh = _box(self, Vector3(0.18, 0.18, 0.18), Vector3(lx + 0.3, DOOR_H + 0.35, DOOR_W * 0.5 + 0.4), _locked_mat)


func _build_exit_door() -> void:
	var rx := W * 0.5
	_exit_panel_a = _make_door_panel(Vector3(rx, DOOR_H * 0.5, -DOOR_W * 0.25))
	_exit_panel_b = _make_door_panel(Vector3(rx, DOOR_H * 0.5, DOOR_W * 0.25))
	_exit_light_mesh = _box(self, Vector3(0.18, 0.18, 0.18), Vector3(rx - 0.3, DOOR_H + 0.35, DOOR_W * 0.5 + 0.4), _locked_mat)


func _make_door_panel(pos: Vector3) -> StaticBody3D:
	var panel := StaticBody3D.new()
	panel.position = pos
	add_child(panel)
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.22, DOOR_H, DOOR_W * 0.5)
	m.mesh = bm
	m.set_surface_override_material(0, _wall_mat)
	panel.add_child(m)
	# Accent edge on the panel.
	var edge := MeshInstance3D.new()
	var em := BoxMesh.new()
	em.size = Vector3(0.24, DOOR_H, 0.06)
	edge.mesh = em
	edge.set_surface_override_material(0, _accent_mat)
	panel.add_child(edge)
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(0.22, DOOR_H, DOOR_W * 0.5)
	cs.shape = bs
	panel.add_child(cs)
	return panel


func _build_entry_area() -> void:
	var area := Area3D.new()
	area.name = "EntryArea"
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(W - 0.5, H - 0.5, D - 0.5)
	cs.shape = bs
	cs.position.y = H * 0.5
	area.add_child(cs)
	add_child(area)
	area.body_entered.connect(_on_body_entered)


func _build_lights() -> void:
	_warn_light = OmniLight3D.new()
	_warn_light.position = Vector3(0, H - 0.8, 0)
	_warn_light.light_color = accent.lerp(Color.WHITE, 0.55)
	_warn_light.light_energy = 1.0
	_warn_light.omni_range = 13.0
	_warn_light.omni_attenuation = 1.2
	add_child(_warn_light)


func _on_body_entered(body: Node3D) -> void:
	if body is Player:
		entered.emit(self)
