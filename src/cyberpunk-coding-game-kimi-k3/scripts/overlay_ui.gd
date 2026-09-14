class_name OverlayUI
extends CanvasLayer
## Full-screen overlay: vignette/glitch shader driven by the room timer,
## HUD (timer, room name, interact prompt), flash effects, the four
## room-specific death sequences, game-over and victory panels.

signal death_sequence_finished

const SCREEN_SHADER := """
shader_type canvas_item;

uniform vec4 accent : source_color = vec4(1.0, 0.1, 0.1, 1.0);
uniform float vignette : hint_range(0.0, 1.0) = 0.3;
uniform float pulse : hint_range(0.0, 1.0) = 0.0;
uniform float glitch : hint_range(0.0, 1.0) = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	vec2 uv = UV;
	if (glitch > 0.001) {
		float row = floor(uv.y * 60.0);
		float band = step(1.0 - glitch * 0.25, hash(vec2(row, floor(TIME * 16.0))));
		uv.x += band * (hash(vec2(floor(TIME * 24.0), row)) - 0.5) * 0.1 * glitch;
	}
	vec2 d = uv - vec2(0.5);
	float dist = length(d) * 1.9;
	float p = pulse * (0.6 + 0.4 * sin(TIME * (4.0 + pulse * 6.0)));
	float edge = smoothstep(0.35, 1.0, dist);
	vec3 col = accent.rgb * edge * (0.25 + p);
	float scan = step(0.5, fract(uv.y * 220.0)) * glitch * 0.05;
	col += accent.rgb * scan;
	float a = edge * vignette * 0.55 + edge * p * 0.55 + glitch * 0.04 + scan;
	COLOR = vec4(col, clamp(a, 0.0, 0.85));
}
"""

var _shader_rect: ColorRect
var _shader_mat: ShaderMaterial
var _flash_rect: ColorRect
var _death_layer: Control

var _hud_timer: Label
var _hud_room: Label
var _prompt: Label
var _message: Label

var _game_over: CenterContainer
var _victory: CenterContainer
var _white_rect: ColorRect
var _end_label: Label

var _death_running := false


func _ready() -> void:
	layer = 5
	_build_shader_layer()
	_build_hud()
	_build_flash()
	_build_death_layer()
	_build_panels()


# ------------------------------------------------------------------ build ---

func _build_shader_layer() -> void:
	_shader_rect = ColorRect.new()
	_shader_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_shader_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shader_mat = ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = SCREEN_SHADER
	_shader_mat.shader = sh
	_shader_rect.material = _shader_mat
	add_child(_shader_rect)


func _build_hud() -> void:
	var hud := Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hud)

	_hud_timer = Label.new()
	_hud_timer.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_hud_timer.position = Vector2(-250, 6)
	_hud_timer.size = Vector2(500, 130)
	_hud_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var bold := SystemFont.new()
	bold.font_names = PackedStringArray(["Monaco", "Menlo", "Courier New", "monospace"])
	bold.font_weight = 800
	_hud_timer.add_theme_font_override("font", bold)
	_hud_timer.add_theme_font_size_override("font_size", 96)
	_hud_timer.add_theme_constant_override("outline_size", 10)
	_hud_timer.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	hud.add_child(_hud_timer)

	_hud_room = Label.new()
	_hud_room.position = Vector2(18, 12)
	_hud_room.add_theme_font_size_override("font_size", 16)
	hud.add_child(_hud_room)

	_prompt = Label.new()
	_prompt.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_prompt.position = Vector2(-200, -90)
	_prompt.size = Vector2(400, 30)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.add_theme_font_size_override("font_size", 18)
	_prompt.visible = false
	hud.add_child(_prompt)

	_message = Label.new()
	_message.set_anchors_preset(Control.PRESET_CENTER)
	_message.position = Vector2(-400, -180)
	_message.size = Vector2(800, 40)
	_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_message.add_theme_font_size_override("font_size", 26)
	_message.visible = false
	hud.add_child(_message)

	# Persistent ending text for the meadow walk (non-blocking HUD).
	_end_label = Label.new()
	_end_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_end_label.position = Vector2(-500, 150)
	_end_label.size = Vector2(1000, 90)
	_end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_end_label.add_theme_font_size_override("font_size", 28)
	_end_label.add_theme_color_override("font_color", Color(0.5, 1.0, 0.6))
	_end_label.add_theme_constant_override("outline_size", 6)
	_end_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_end_label.visible = false
	hud.add_child(_end_label)


func _build_flash() -> void:
	_flash_rect = ColorRect.new()
	_flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash_rect.modulate.a = 0.0
	add_child(_flash_rect)
	_white_rect = ColorRect.new()
	_white_rect.color = Color(1, 1, 1)
	_white_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_white_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_white_rect.modulate.a = 0.0
	add_child(_white_rect)


func _build_death_layer() -> void:
	_death_layer = Control.new()
	_death_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_death_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_death_layer)


func _build_panels() -> void:
	_game_over = _make_panel("SIGNAL LOST", Color(1, 0.15, 0.15), "reinitializing run from Room 1 ...")
	_victory = _make_panel("CORE BREACHED — YOU LIVE", Color(0.5, 1.0, 0.6), "All five rooms cleared. Press R to run again.")


func _make_panel(text: String, col: Color, sub: String) -> CenterContainer:
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	cc.visible = false
	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.85)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	bg.hide()
	cc.visibility_changed.connect(func() -> void: bg.visible = cc.visible)
	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	cc.add_child(vb)
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 44)
	l.add_theme_color_override("font_color", col)
	vb.add_child(l)
	var s := Label.new()
	s.text = sub
	s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	s.add_theme_font_size_override("font_size", 18)
	s.add_theme_color_override("font_color", Color(0.7, 0.7, 0.75))
	vb.add_child(s)
	add_child(cc)
	return cc


# -------------------------------------------------------------- HUD API ---

func set_hud(room_name: String, accent: Color, seconds: float, fraction: float, running: bool) -> void:
	_hud_room.text = room_name
	_hud_room.add_theme_color_override("font_color", accent)
	if running:
		var s := maxf(seconds, 0.0)
		_hud_timer.text = "%02d:%02d" % [int(s) / 60, int(s) % 60]
		if fraction < 0.1:
			_hud_timer.add_theme_color_override("font_color", Color(1, 0.1, 0.1) if fmod(s * 3.0, 1.0) < 0.5 else Color(0.5, 0, 0))
		elif fraction < 0.25:
			_hud_timer.add_theme_color_override("font_color", Color(1, 0.5, 0.3))
		else:
			_hud_timer.add_theme_color_override("font_color", accent.lerp(Color.WHITE, 0.35))
	else:
		_hud_timer.text = "--:--"
		_hud_timer.add_theme_color_override("font_color", Color(0.4, 0.45, 0.5))


func set_tension(accent: Color, fraction: float) -> void:
	var vignette := 0.35
	var pulse := 0.0
	var glitch := 0.0
	if fraction <= 0.1:
		vignette = 0.75
		pulse = 1.0
		glitch = 0.55
	elif fraction <= 0.25:
		vignette = 0.55
		pulse = 0.65
		glitch = 0.3
	elif fraction <= 0.5:
		vignette = 0.45
		pulse = 0.35
		glitch = 0.12
	_shader_mat.set_shader_parameter("accent", accent)
	_shader_mat.set_shader_parameter("vignette", vignette)
	_shader_mat.set_shader_parameter("pulse", pulse)
	_shader_mat.set_shader_parameter("glitch", glitch)


func set_glitch(amount: float) -> void:
	_shader_mat.set_shader_parameter("glitch", amount)


func set_hud_timer_visible(show: bool) -> void:
	_hud_timer.visible = show


func show_prompt(text: String) -> void:
	_prompt.text = text
	_prompt.visible = true


func hide_prompt() -> void:
	_prompt.visible = false


func show_message(text: String, col: Color, duration: float) -> void:
	_message.text = text
	_message.add_theme_color_override("font_color", col)
	_message.visible = true
	var t := create_tween()
	t.tween_interval(duration)
	t.tween_callback(func() -> void: _message.visible = false)


func flash(col: Color, strength: float, duration := 0.4) -> void:
	_flash_rect.color = col
	_flash_rect.modulate.a = strength
	var t := create_tween()
	t.tween_property(_flash_rect, "modulate:a", 0.0, duration)


func show_game_over(show: bool) -> void:
	_game_over.visible = show


func show_victory(show: bool) -> void:
	_victory.visible = show


func set_white_fade(alpha: float) -> void:
	_white_rect.modulate.a = clampf(alpha, 0.0, 1.0)


func show_end_text(show: bool) -> void:
	_end_label.text = "SYSTEM BREACHED — YOU'RE FREE\nwalk into the light   ·   R to restart"
	_end_label.visible = show


# ----------------------------------------------------------- death effects ---

func play_death_effect(kind: String, accent: Color, audio: AudioFX, player: Player) -> void:
	if _death_running:
		return
	_death_running = true
	hide_prompt()
	match kind:
		"laser":
			audio.play_effect("laser")
			flash(Color(1, 0.05, 0.05), 0.7, 0.9)
			_spawn_laser_lines(accent)
		"ice":
			audio.play_effect("ice")
			flash(Color(0.5, 0.95, 1.0), 0.65, 0.9)
			var t := create_tween()
			t.tween_method(func(v: float) -> void: set_glitch(v), 1.0, 0.0, 0.9)
		"zap":
			audio.play_effect("zap")
			var t := create_tween()
			for i in 5:
				t.tween_callback(func() -> void: _flash_rect.color = Color(1, 0.95, 0.5); _flash_rect.modulate.a = 0.75)
				t.tween_interval(0.08)
				t.tween_callback(func() -> void: _flash_rect.modulate.a = 0.05)
				t.tween_interval(0.08)
			t.tween_callback(func() -> void: _flash_rect.modulate.a = 0.0)
		"railgun":
			_spawn_crosshair(Color(1, 0.2, 0.3))
			var t := create_tween()
			t.tween_interval(0.45)
			t.tween_callback(func() -> void:
				audio.play_effect("railgun")
				flash(Color(1, 1, 1), 0.85, 0.6)
				player.add_shake(0.6))
		"explosion":
			audio.play_effect("explosion")
			flash(Color(1, 1, 1), 0.95, 1.0)
			player.add_shake(1.0)
	var done := create_tween()
	done.tween_interval(1.05)
	done.tween_callback(_finish_death)


func _finish_death() -> void:
	for c in _death_layer.get_children():
		c.queue_free()
	_death_running = false
	death_sequence_finished.emit()


func _spawn_laser_lines(col: Color) -> void:
	var vp := get_viewport().get_visible_rect().size
	for i in 6:
		var line := ColorRect.new()
		line.color = Color(1, 0.1, 0.1, 0.9)
		line.size = Vector2(vp.x * 1.6, 3.0)
		line.position = Vector2(-vp.x * 0.3, -20)
		line.rotation = randf_range(-0.6, 0.6)
		line.pivot_offset = line.size * 0.5
		_death_layer.add_child(line)
		var t := create_tween()
		t.tween_interval(i * 0.09)
		t.tween_property(line, "position:y", vp.y + 20, 0.45)


func _spawn_crosshair(col: Color) -> void:
	var vp := get_viewport().get_visible_rect().size
	var center := vp * 0.5
	var h := ColorRect.new()
	h.color = col
	h.size = Vector2(120, 3)
	h.position = center - Vector2(60, 1.5)
	_death_layer.add_child(h)
	var v := ColorRect.new()
	v.color = col
	v.size = Vector2(3, 120)
	v.position = center - Vector2(1.5, 60)
	_death_layer.add_child(v)
	var ring := Label.new()
	ring.text = "[ TARGET LOCKED ]"
	ring.add_theme_color_override("font_color", col)
	ring.add_theme_font_size_override("font_size", 20)
	ring.position = center + Vector2(-110, 80)
	_death_layer.add_child(ring)
