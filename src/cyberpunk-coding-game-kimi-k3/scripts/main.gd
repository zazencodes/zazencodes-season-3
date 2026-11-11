class_name Main
extends Node3D
## Code to Live — run orchestration.
## Builds the whole facility (five Room instances along +X), the player,
## terminal UI, overlay UI and procedural audio, then manages the game
## state machine: PLAY -> TERMINAL -> (solved | DEAD -> OVER -> reset) -> WIN.

enum State { PLAY, TERMINAL, DEAD, OVER, MEADOW }

const ROOM_SPACING := 12.0
const SPAWN := Vector3(0.0, 0.05, 3.0)
const EXIT_X := 4.0 * ROOM_SPACING + 6.0  # Room 5 exit door plane (global x)
const MEADOW_CENTER := Vector3(EXIT_X + 40.0, 0.0, 0.0)
const FADE_START_X := EXIT_X + 14.0
const FADE_RANGE := 22.0

var _state: int = State.PLAY

var _rooms: Array[Room] = []
var _current_room: Room = null
var _focused_room: Room = null

var _player: Player
var _terminal_ui: TerminalUI
var _overlay: OverlayUI
var _audio: AudioFX

var _world_env: WorldEnvironment
var _facility_env: Environment
var _meadow_env: Environment
var _sun: DirectionalLight3D
var _meadow_active := false
var _room5_solved := false
var _fade_complete := false


func _ready() -> void:
	add_to_group("main")
	_setup_input()
	_build_environment()
	_build_rooms()
	_build_meadow()
	_player = Player.create()
	add_child(_player)
	_reset_player()
	_audio = AudioFX.new()
	add_child(_audio)
	_terminal_ui = TerminalUI.new()
	add_child(_terminal_ui)
	_overlay = OverlayUI.new()
	add_child(_overlay)

	_terminal_ui.run_requested.connect(_on_run_requested)
	_terminal_ui.closed.connect(_on_terminal_closed)
	_overlay.death_sequence_finished.connect(_on_death_sequence_finished)

	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_on_room_entered(_rooms[0])


# ------------------------------------------------------------------ setup ---

func _setup_input() -> void:
	_bind_keys("move_forward", [KEY_W, KEY_UP])
	_bind_keys("move_back", [KEY_S, KEY_DOWN])
	_bind_keys("move_left", [KEY_A, KEY_LEFT])
	_bind_keys("move_right", [KEY_D, KEY_RIGHT])
	_bind_keys("interact", [KEY_E])
	_bind_keys("sprint", [KEY_SHIFT])
	_bind_keys("restart", [KEY_R])


func _bind_keys(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	for k in keys:
		var found := false
		for e in InputMap.action_get_events(action):
			if e is InputEventKey and e.physical_keycode == k:
				found = true
		if not found:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event(action, ev)


func _build_environment() -> void:
	_facility_env = Environment.new()
	_facility_env.background_mode = Environment.BG_COLOR
	_facility_env.background_color = Color(0.005, 0.006, 0.01)
	_facility_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_facility_env.ambient_light_color = Color(0.06, 0.07, 0.1)
	_facility_env.ambient_light_energy = 0.6
	_facility_env.fog_enabled = true
	_facility_env.fog_light_color = Color(0.05, 0.06, 0.09)
	_facility_env.fog_density = 0.02
	_facility_env.tonemap_mode = Environment.TONE_MAPPER_ACES
	_facility_env.adjustment_enabled = true
	_facility_env.adjustment_brightness = 1.05

	_meadow_env = Environment.new()
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.25, 0.5, 0.9)
	sky_mat.sky_horizon_color = Color(0.65, 0.82, 0.98)
	sky_mat.ground_bottom_color = Color(0.3, 0.5, 0.25)
	sky_mat.ground_horizon_color = Color(0.6, 0.8, 0.6)
	sky_mat.sun_angle_max = 20.0
	sky.sky_material = sky_mat
	_meadow_env.background_mode = Environment.BG_SKY
	_meadow_env.sky = sky
	_meadow_env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	_meadow_env.ambient_light_energy = 1.0
	_meadow_env.fog_enabled = true
	_meadow_env.fog_light_color = Color(0.8, 0.88, 0.95)
	_meadow_env.fog_density = 0.004
	_meadow_env.tonemap_mode = Environment.TONE_MAPPER_ACES

	_world_env = WorldEnvironment.new()
	_world_env.environment = _facility_env
	add_child(_world_env)

	# Warm sunlight, only active in the meadow.
	_sun = DirectionalLight3D.new()
	_sun.rotation_degrees = Vector3(-50, -35, 0)
	_sun.light_color = Color(1.0, 0.95, 0.85)
	_sun.light_energy = 1.3
	_sun.visible = false
	add_child(_sun)


func _build_meadow() -> void:
	add_child(Meadow.create(MEADOW_CENTER))


func _build_rooms() -> void:
	var configs := Challenges.get_room_configs()
	for i in configs.size():
		var room := Room.create(i, configs[i], i == configs.size() - 1)
		room.position = Vector3(i * ROOM_SPACING, 0.0, 0.0)
		add_child(room)
		room.entered.connect(_on_room_entered)
		room.timed_out.connect(_on_room_timed_out)
		_rooms.append(room)


# ------------------------------------------------------------------- loop ---

func _process(_delta: float) -> void:
	if _current_room == null:
		return
	var room := _current_room
	var running := room.timer_running and not room.solved
	var frac := room.time_fraction() if running else 1.0

	_overlay.set_hud("ROOM %d — %s" % [room.index + 1, room.config["name"]], room.accent, room.time_left, frac, running)
	if running and _state != State.DEAD and _state != State.OVER:
		_overlay.set_tension(room.accent, frac)
		_audio.set_tension(_tension_level(frac))
	elif _state == State.PLAY or _state == State.TERMINAL:
		_overlay.set_tension(room.accent, 1.0)
		_audio.set_tension(0)

	if _terminal_ui.is_open() and _focused_room != null:
		_terminal_ui.set_time(_focused_room.time_left, _focused_room.time_fraction() < 0.1)
	# The big HUD timer sits behind the terminal panel, so hide it while the
	# terminal (with its own large timer) is focused; also hidden in the meadow.
	_overlay.set_hud_timer_visible(not _terminal_ui.is_open() and _state != State.MEADOW)

	# Interact prompt.
	if _state == State.PLAY:
		var target := _player.get_interact_target()
		if target != null and target.is_in_group("terminal"):
			_overlay.show_prompt("[E]  ACCESS TERMINAL")
		else:
			_overlay.hide_prompt()

	# Meadow: environment takeover + distance-driven fade to white.
	if _state == State.MEADOW:
		_update_meadow()


func _update_meadow() -> void:
	var px := _player.global_position.x
	var want_meadow := px > EXIT_X + 0.6
	if want_meadow != _meadow_active:
		_set_meadow_environment(want_meadow)
	if px > FADE_START_X and not _fade_complete:
		var a := clampf((px - FADE_START_X) / FADE_RANGE, 0.0, 1.0)
		_overlay.set_white_fade(a)
		if a >= 1.0:
			_fade_complete = true
			_fade_out_and_reset()


func _set_meadow_environment(on: bool) -> void:
	_meadow_active = on
	_world_env.environment = _meadow_env if on else _facility_env
	_sun.visible = on
	_audio.set_peaceful(on)


func _fade_out_and_reset() -> void:
	await get_tree().create_timer(1.5).timeout
	# Guard against the player pressing R during the hold.
	if _fade_complete:
		_reset_run()


func _tension_level(frac: float) -> int:
	if frac <= 0.1:
		return 3
	if frac <= 0.25:
		return 2
	if frac <= 0.5:
		return 1
	return 0


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact") and _state == State.PLAY:
		var target := _player.get_interact_target()
		if target != null and target.is_in_group("terminal"):
			_focus_terminal(target.get_meta("room"))

	elif event.is_action_pressed("ui_cancel"):
		# Close the terminal in ANY state it is open (PLAY/TERMINAL, but also
		# after Room 5 is solved where _state has already moved to MEADOW).
		if _terminal_ui.is_open():
			_terminal_ui.close_terminal()
		elif _state == State.PLAY and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

	elif event is InputEventMouseButton and event.pressed:
		if (_state == State.PLAY or _state == State.MEADOW) and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

	elif event.is_action_pressed("restart") and (_state == State.MEADOW or _state == State.OVER):
		_reset_run()


# ------------------------------------------------------------- room flow ---

func _on_room_entered(room: Room) -> void:
	if _state == State.DEAD or _state == State.OVER or _state == State.MEADOW:
		return
	_current_room = room
	_audio.set_music_room(room.index)
	if not room.solved and not room.timer_running:
		room.start_timer()
		if room.index > 0:
			_overlay.show_message("ROOM %d — %s" % [room.index + 1, room.config["name"].to_upper()], room.accent, 2.0)


func _focus_terminal(room: Room) -> void:
	_state = State.TERMINAL
	_focused_room = room
	_player.frozen = true
	_overlay.hide_prompt()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_audio.play_effect("click")
	_terminal_ui.open_terminal(room.config)


func _on_terminal_closed() -> void:
	if _state == State.TERMINAL:
		_state = State.MEADOW if _room5_solved else State.PLAY
		_player.frozen = false
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		if _state == State.MEADOW:
			_enter_meadow()


func _on_run_requested(code: String) -> void:
	if _focused_room == null or _focused_room.solved:
		return
	_audio.play_effect("click")
	_terminal_ui.show_running()
	var data := PythonRunner.run_tests(code, _focused_room.config["harness"])
	_terminal_ui.show_results(data)
	var all_pass := false
	if data.get("ok", false):
		all_pass = true
		for r in data["results"]:
			if r["status"] != "PASS":
				all_pass = false
	if all_pass:
		_on_room_solved(_focused_room)
	else:
		_audio.play_effect("fail")


func _on_room_solved(room: Room) -> void:
	room.solve()
	_audio.set_tension(0)
	_audio.play_effect("success")
	_overlay.set_tension(room.accent, 1.0)
	_overlay.flash(room.accent, 0.25, 0.6)
	_terminal_ui.show_success()
	if room.index < _rooms.size() - 1:
		_rooms[room.index + 1].open_door()
		await get_tree().create_timer(0.6).timeout
		_audio.play_effect("unlock")
		_overlay.show_message("EXIT UNLOCKED", Color(0.4, 1.0, 0.5), 2.0)
	else:
		_room5_solved = true
		room.open_exit_door()
		await get_tree().create_timer(0.6).timeout
		_audio.play_effect("unlock")
		_overlay.show_message("EXIT UNLOCKED — THE WAY OUT", Color(0.4, 1.0, 0.5), 2.5)


func _on_room_timed_out(room: Room) -> void:
	if _state == State.DEAD or _state == State.OVER or _state == State.MEADOW:
		return
	_state = State.DEAD
	_focused_room = null
	if _terminal_ui.is_open():
		_terminal_ui.close_terminal()
	_player.frozen = true
	_overlay.hide_prompt()
	_audio.stop_all()
	_overlay.play_death_effect(room.config["death"], room.accent, _audio, _player)


func _on_death_sequence_finished() -> void:
	_state = State.OVER
	_overlay.set_glitch(1.0)
	_overlay.show_game_over(true)
	_audio.play_effect("fail")
	await get_tree().create_timer(1.8).timeout
	if _state == State.OVER:
		_reset_run()


func _enter_meadow() -> void:
	# Free walk to the meadow: no timers, no tension, victory text as HUD.
	_overlay.set_tension(Color.WHITE, 1.0)
	_audio.set_tension(0)
	_overlay.show_end_text(true)
	_overlay.set_hud_timer_visible(false)


# ------------------------------------------------------------------ reset ---

func _reset_run() -> void:
	_overlay.show_game_over(false)
	_overlay.show_victory(false)
	_overlay.set_glitch(0.0)
	_overlay.set_white_fade(0.0)
	_overlay.show_end_text(false)
	_room5_solved = false
	_fade_complete = false
	if _meadow_active:
		_set_meadow_environment(false)
	_audio.stop_all()
	_audio.set_peaceful(false)
	for room in _rooms:
		room.reset_room()
	if _terminal_ui.is_open():
		_terminal_ui.close_terminal()
	_reset_player()
	_state = State.PLAY
	_current_room = _rooms[0]
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_on_room_entered(_rooms[0])


func _reset_player() -> void:
	_player.global_position = SPAWN
	_player.rotation = Vector3.ZERO
	_player.velocity = Vector3.ZERO
	_player.frozen = false
