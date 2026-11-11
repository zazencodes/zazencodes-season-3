class_name TerminalUI
extends CanvasLayer
## Focused coding terminal UI, built entirely in code. Fills ~86% of the
## window with large fonts, a CodeEdit with Python syntax highlighting and
## line numbers, Run button, per-test results and error output, plus the
## room countdown. Esc exits focus (the room timer keeps running).
## Zoom: Ctrl+= / Ctrl+- / Ctrl+mouse wheel, Ctrl+0 resets to the 1.8x
## default. The zoom factor persists for the whole session (rooms + deaths).

signal run_requested(code: String)
signal closed

const ZOOM_MIN := 0.6
const ZOOM_MAX := 3.0
const ZOOM_STEP := 0.1
const ZOOM_DEFAULT := 1.8

# Base font sizes at 100% zoom (readable at 1280x720).
const BASE_TITLE := 26
const BASE_TIMER := 44
const BASE_DESC := 17
const BASE_CODE := 20
const BASE_RESULTS := 17
const BASE_STATUS := 14

const PY_KEYWORDS := [
	"False", "None", "True", "and", "as", "assert", "async", "await", "break",
	"class", "continue", "def", "del", "elif", "else", "except", "finally",
	"for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
	"not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]
const PY_BUILTINS := [
	"print", "len", "range", "str", "int", "float", "list", "dict", "set",
	"tuple", "bool", "sum", "min", "max", "abs", "enumerate", "zip", "sorted",
	"reversed", "isinstance", "type", "repr", "self",
]

var _accent := Color.RED
var _zoom := ZOOM_DEFAULT

var _root: PanelContainer
var _title_label: Label
var _desc_label: Label
var _code_edit: CodeEdit
var _run_button: Button
var _results: RichTextLabel
var _timer_label: Label
var _status_label: Label
var _zoom_label: Label

var _open := false


func _ready() -> void:
	layer = 6
	_build()
	_apply_zoom()
	_root.visible = false


func is_open() -> bool:
	return _open


func _build() -> void:
	_root = PanelContainer.new()
	# ~86% of the window both axes.
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.offset_left = 90
	_root.offset_top = 50
	_root.offset_right = -90
	_root.offset_bottom = -50
	add_child(_root)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 22)
	margin.add_theme_constant_override("margin_right", 22)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	_root.add_child(margin)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	margin.add_child(vbox)

	# Header row: title + zoom indicator + timer.
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	vbox.add_child(header)
	_title_label = Label.new()
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_title_label)
	_zoom_label = Label.new()
	_zoom_label.modulate.a = 0.0
	header.add_child(_zoom_label)
	_timer_label = Label.new()
	_timer_label.add_theme_font_size_override("font_size", BASE_TIMER)
	header.add_child(_timer_label)

	var close_button := Button.new()
	close_button.text = "CLOSE (Esc)"
	close_button.pressed.connect(close_terminal)
	header.add_child(close_button)

	_desc_label = Label.new()
	_desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_desc_label)

	vbox.add_child(HSeparator.new())

	# Middle: code editor left, results right.
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation", 12)
	vbox.add_child(middle)

	_code_edit = CodeEdit.new()
	_code_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_code_edit.size_flags_stretch_ratio = 1.5
	_code_edit.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_code_edit.scroll_smooth = true
	_code_edit.caret_blink = true
	_code_edit.highlight_current_line = true
	_code_edit.gutters_draw_line_numbers = true
	_code_edit.indent_automatic = true
	_code_edit.indent_use_spaces = true
	_code_edit.indent_size = 4
	_code_edit.minimap_draw = false
	_code_edit.syntax_highlighter = _make_highlighter()
	middle.add_child(_code_edit)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.custom_minimum_size.x = 400
	right.add_theme_constant_override("separation", 10)
	middle.add_child(right)

	_run_button = Button.new()
	_run_button.text = "RUN  ▶"
	_run_button.custom_minimum_size.y = 52
	_run_button.pressed.connect(_on_run_pressed)
	right.add_child(_run_button)

	var res_title := Label.new()
	res_title.text = "TEST RESULTS"
	right.add_child(res_title)
	res_title.name = "ResultsTitle"

	_results = RichTextLabel.new()
	_results.bbcode_enabled = true
	_results.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_results.fit_content = false
	_results.add_theme_font_size_override("normal_font_size", BASE_RESULTS)
	_results.add_theme_font_size_override("mono_font_size", BASE_RESULTS)
	right.add_child(_results)

	_status_label = Label.new()
	_status_label.text = "Esc — leave terminal (countdown keeps running)   |   Ctrl +/-/0 — zoom"
	vbox.add_child(_status_label)


func _make_highlighter() -> CodeHighlighter:
	var h := CodeHighlighter.new()
	h.number_color = Color(1.0, 0.72, 0.35)          # amber
	h.symbol_color = Color(0.75, 0.85, 1.0)            # pale blue
	h.function_color = Color(0.35, 0.95, 1.0)          # neon cyan
	h.member_variable_color = Color(0.65, 0.9, 0.8)
	for kw in PY_KEYWORDS:
		h.add_keyword_color(kw, Color(1.0, 0.35, 0.55))   # hot magenta-red
	for bi in PY_BUILTINS:
		h.add_keyword_color(bi, Color(0.75, 0.45, 1.0))   # violet
	h.add_color_region("#", "", Color(0.45, 0.55, 0.5), true)   # comments
	h.add_color_region("\"", "\"", Color(0.55, 1.0, 0.6))       # strings
	h.add_color_region("'", "'", Color(0.55, 1.0, 0.6))
	return h


func open_terminal(cfg: Dictionary) -> void:
	_accent = cfg["color"]
	_title_label.text = "ROOM %d — %s\n%s" % [cfg["id"], cfg["name"].to_upper(), cfg["title"]]
	_title_label.add_theme_color_override("font_color", _accent)
	_desc_label.text = cfg["description"]
	_code_edit.text = cfg["starter"]
	_results.text = "[color=#888888]No runs yet. Press RUN to execute.[/color]"
	_apply_style()
	_apply_zoom()
	_root.visible = true
	_open = true
	_code_edit.grab_focus()


func close_terminal() -> void:
	_root.visible = false
	_open = false
	closed.emit()


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.03, 0.035, 0.05, 0.97)
	sb.border_color = _accent
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(4)
	_root.add_theme_stylebox_override("panel", sb)

	var code_sb := StyleBoxFlat.new()
	code_sb.bg_color = Color(0.0, 0.01, 0.02)
	code_sb.border_color = _accent.darkened(0.4)
	code_sb.set_border_width_all(1)
	code_sb.set_corner_radius_all(3)
	code_sb.content_margin_left = 8
	code_sb.content_margin_top = 8
	_code_edit.add_theme_stylebox_override("normal", code_sb)
	_code_edit.add_theme_stylebox_override("focus", code_sb)
	_code_edit.add_theme_color_override("font_color", Color(0.85, 0.95, 0.9))
	_code_edit.add_theme_color_override("current_line_color", Color(1, 1, 1, 0.06))
	_code_edit.add_theme_color_override("line_number_color", _accent.darkened(0.25))

	_run_button.add_theme_color_override("font_color", Color(0.02, 0.02, 0.02))
	var btn_sb := StyleBoxFlat.new()
	btn_sb.bg_color = _accent
	btn_sb.set_corner_radius_all(3)
	_run_button.add_theme_stylebox_override("normal", btn_sb)
	var btn_hover := StyleBoxFlat.new()
	btn_hover.bg_color = _accent.lightened(0.25)
	btn_hover.set_corner_radius_all(3)
	_run_button.add_theme_stylebox_override("hover", btn_hover)
	_run_button.add_theme_stylebox_override("pressed", btn_hover)


# ------------------------------------------------------------------- zoom ---

func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	var delta := 0.0
	var reset := false
	if event is InputEventKey and event.pressed and event.ctrl_pressed:
		match event.keycode:
			KEY_EQUAL, KEY_KP_ADD:
				delta = ZOOM_STEP
			KEY_MINUS, KEY_KP_SUBTRACT:
				delta = -ZOOM_STEP
			KEY_0, KEY_KP_0:
				reset = true
	elif event is InputEventMouseButton and event.pressed and event.ctrl_pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			delta = ZOOM_STEP
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			delta = -ZOOM_STEP
	if reset:
		_zoom = ZOOM_DEFAULT
		_apply_zoom(true)
		get_viewport().set_input_as_handled()
	elif delta != 0.0:
		_zoom = clampf(_zoom + delta, ZOOM_MIN, ZOOM_MAX)
		_apply_zoom(true)
		get_viewport().set_input_as_handled()


func _apply_zoom(show_badge := false) -> void:
	_title_label.add_theme_font_size_override("font_size", roundi(BASE_TITLE * _zoom))
	# Note: the timer label is HUD and intentionally NOT scaled by zoom.
	_desc_label.add_theme_font_size_override("font_size", roundi(BASE_DESC * _zoom))
	_code_edit.add_theme_font_size_override("font_size", roundi(BASE_CODE * _zoom))
	_results.add_theme_font_size_override("normal_font_size", roundi(BASE_RESULTS * _zoom))
	_results.add_theme_font_size_override("mono_font_size", roundi(BASE_RESULTS * _zoom))
	_status_label.add_theme_font_size_override("font_size", roundi(BASE_STATUS * _zoom))
	_run_button.add_theme_font_size_override("font_size", roundi(BASE_DESC * _zoom))
	_zoom_label.add_theme_font_size_override("font_size", roundi(BASE_STATUS * _zoom))
	if show_badge:
		_show_zoom_badge()


func _show_zoom_badge() -> void:
	_zoom_label.text = "ZOOM %d%%" % roundi(_zoom * 100.0)
	_zoom_label.add_theme_color_override("font_color", _accent)
	_zoom_label.modulate.a = 1.0
	var t := create_tween()
	t.tween_interval(1.0)
	t.tween_property(_zoom_label, "modulate:a", 0.0, 0.5)


# -------------------------------------------------------------- run/results ---

func set_time(seconds: float, urgent: bool) -> void:
	if not _open:
		return
	var s := maxf(seconds, 0.0)
	_timer_label.text = "%02d:%02d" % [int(s) / 60, int(s) % 60]
	if urgent and fmod(s, 1.0) < 0.5:
		_timer_label.add_theme_color_override("font_color", Color(1, 0.15, 0.15))
	else:
		_timer_label.add_theme_color_override("font_color", _accent if not urgent else Color(1, 0.4, 0.4))


func show_running() -> void:
	_results.text = "[color=#aaaaaa]Executing on python3 ...[/color]"


func show_results(data: Dictionary) -> void:
	if not data.get("ok", false):
		_results.text = "[color=#ff5555][b]ERROR[/b][/color]\n[color=#ff9999]%s[/color]" % _escape(str(data.get("error", "unknown error")))
		return
	var txt := ""
	var all_pass := true
	for r in data["results"]:
		var col := "#55ff88" if r["status"] == "PASS" else "#ff5555"
		if r["status"] != "PASS":
			all_pass = false
		txt += "[color=%s][b]Test %d: %s[/b][/color]" % [col, r["n"], r["status"]]
		if r["status"] != "PASS":
			txt += "  expected [color=#ffcc66]%s[/color], received [color=#ff6666]%s[/color]" % [_escape(r["expected"]), _escape(r["received"])]
		txt += "\n"
	var extra: String = str(data.get("extra", ""))
	if extra.strip_edges() != "":
		txt += "\n[color=#ffaa66]Output / errors:[/color]\n[color=#cc9977]%s[/color]" % _escape(extra.strip_edges())
	if all_pass:
		txt += "\n[color=#55ff88][b]ALL TESTS PASSED — EXIT UNLOCKED[/b][/color]"
	_results.text = txt


func show_success() -> void:
	_status_label.text = "ACCESS GRANTED — door unlocked. Esc to leave."
	_status_label.add_theme_color_override("font_color", Color(0.4, 1.0, 0.5))


func _escape(s: String) -> String:
	return s.replace("[", "［").replace("]", "］")


func _on_run_pressed() -> void:
	run_requested.emit(_code_edit.text)
