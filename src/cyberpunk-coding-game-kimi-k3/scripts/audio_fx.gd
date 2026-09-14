class_name AudioFX
extends Node
## Fully procedural audio: one AudioStreamGenerator whose buffer is filled
## each frame. Continuous layers (heartbeat scheduling, siren, alarm) are
## driven by the tension level; one-shot effects are precomputed sample
## buffers appended to a pending queue.

const MIX_RATE := 22050.0

var _player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback

var _time := 0.0
var _tension := 0  # 0 none, 1 slow heartbeat, 2 faster + siren, 3 rapid + alarm
var _heart_timer := 0.0

var _pending := PackedVector2Array()
var _pending_pos := 0

var _siren_phase := 0.0
var _alarm_phase := 0.0

# Ambient music bed state (deterministic generative loop).
const ROOM_ROOTS := [55.0, 49.0, 58.27, 65.41, 51.91]  # A1 G1 Bb1 C2 Ab1 — one per room
const PENTA := [0.0, 3.0, 5.0, 7.0, 10.0, 12.0]  # minor pentatonic semitones
const STEP_LEN := 0.1667  # 16th note at ~90 bpm
var _root := 55.0
var _music_time := 0.0
var _music_step := -1
var _pad_phase_a := 0.0
var _pad_phase_b := 0.0
var _pad_phase_c := 0.0
var _bass_phase := 0.0
var _bass_env := 0.0
var _arp_phase := 0.0
var _arp_freq := 0.0
var _arp_env := 0.0
var _peaceful := false


func _ready() -> void:
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = MIX_RATE
	gen.buffer_length = 0.5
	_player = AudioStreamPlayer.new()
	_player.stream = gen
	_player.volume_db = -6.0
	add_child(_player)
	_player.play()
	_playback = _player.get_stream_playback()


func set_tension(level: int) -> void:
	_tension = clampi(level, 0, 3)


func set_music_room(idx: int) -> void:
	_root = ROOM_ROOTS[clampi(idx, 0, ROOM_ROOTS.size() - 1)]


func set_peaceful(on: bool) -> void:
	# Warm major-key pad for the meadow; replaces the dark facility bed.
	_peaceful = on


func stop_all() -> void:
	_tension = 0
	_pending.clear()
	_pending_pos = 0


func _process(delta: float) -> void:
	_time += delta
	if _tension >= 1:
		_heart_timer -= delta
		if _heart_timer <= 0.0:
			_heart_timer = _heartbeat_interval()
			_enqueue(_make_thump())
	if _playback == null:
		return
	if _pending_pos > 0 and _pending_pos >= _pending.size():
		_pending.clear()
		_pending_pos = 0
	var avail: int = _playback.get_frames_available()
	for i in avail:
		var s := _continuous_frame()
		if _pending_pos < _pending.size():
			s += _pending[_pending_pos].x
			_pending_pos += 1
		_playback.push_frame(Vector2(clampf(s, -1.0, 1.0), clampf(s, -1.0, 1.0)))


func _heartbeat_interval() -> float:
	match _tension:
		1: return 1.1
		2: return 0.7
		_: return 0.45


func _continuous_frame() -> float:
	var s := 0.0
	if _tension == 2:
		_siren_phase += TAU * (650.0 + 280.0 * sin(TAU * 0.55 * _time)) / MIX_RATE
		s += sin(_siren_phase) * 0.10
	if _tension >= 3:
		_alarm_phase += TAU * 1150.0 / MIX_RATE
		if fmod(_time * 5.0, 1.0) < 0.5:
			s += sign(sin(_alarm_phase)) * 0.09
	s += _music_frame()
	return s


# ----------------------------------------------------------- ambient bed ---
# Generative dark-ambient loop: detuned pad drone + pulsing bass + sparse
# minor-pentatonic arpeggio. Deterministic (seeded by step index). Layering
# follows the spec's tension bands:
#   level 0 (100-50%): full bed
#   level 1 (50-25%):  thinner — pad detuned, arp muted, bass stays
#   level 2 (25-10%):  ducked under the siren
#   level 3 (<10%):    mostly buried under the alarm

func _music_frame() -> float:
	_music_time += 1.0 / MIX_RATE
	if _peaceful:
		return _peaceful_frame()
	var step := int(_music_time / STEP_LEN)
	if step != _music_step:
		_music_step = step
		# Bass pulse: on the beat and the "and" of 2 (steps 0, 3 mod 8).
		if step % 8 == 0 or step % 8 == 3:
			_bass_env = 1.0
		# Sparse arpeggio, deterministic hash of the step index.
		var h: float = fposmod(sin(float(step) * 12.9898) * 43758.5453, 1.0)
		if h < 0.4 and _tension == 0:
			var semis: float = PENTA[int(h * 997.0) % PENTA.size()] + (24.0 if h < 0.12 else 12.0)
			_arp_freq = _root * pow(2.0, semis / 12.0)
			_arp_env = 1.0

	# Duck the whole bed as tension rises.
	var bed_gain: float = [1.0, 0.55, 0.3, 0.12][_tension]
	var s := 0.0

	# Pad: root octave + detuned partner + fifth, slow breathing LFO.
	var detune := 1.008 if _tension == 1 else 1.002
	var lfo := 0.6 + 0.4 * sin(TAU * 0.07 * _music_time)
	_pad_phase_a += TAU * _root * 2.0 / MIX_RATE
	_pad_phase_b += TAU * _root * 2.0 * detune / MIX_RATE
	_pad_phase_c += TAU * _root * 3.0 / MIX_RATE
	s += (sin(_pad_phase_a) + sin(_pad_phase_b) + 0.5 * sin(_pad_phase_c)) * 0.028 * lfo

	# Bass: short root pulses.
	if _tension <= 2 and _bass_env > 0.001:
		_bass_phase += TAU * _root / MIX_RATE
		s += sin(_bass_phase) * 0.09 * _bass_env
		_bass_env *= 0.99935

	# Arpeggio: soft plucks, only in the calm band.
	if _arp_env > 0.001 and _arp_freq > 0.0:
		_arp_phase += TAU * _arp_freq / MIX_RATE
		s += (sin(_arp_phase) + 0.4 * sin(_arp_phase * 2.0)) * 0.035 * _arp_env
		_arp_env *= 0.9990

	return s * bed_gain


func _peaceful_frame() -> float:
	# Warm C-major pad: root + major third + fifth (+ octave), slow breathing,
	# with occasional soft major-pentatonic plucks. No bass pulse, no detune.
	const ROOT := 130.81  # C3
	const MAJOR_PENTA := [0.0, 2.0, 4.0, 7.0, 9.0, 12.0]
	var step := int(_music_time / 0.3333)
	if step != _music_step:
		_music_step = step
		var h: float = fposmod(sin(float(step) * 7.233) * 24634.6345, 1.0)
		if h < 0.35:
			var semis: float = MAJOR_PENTA[int(h * 991.0) % MAJOR_PENTA.size()] + 12.0
			_arp_freq = ROOT * pow(2.0, semis / 12.0)
			_arp_env = 1.0
	var lfo := 0.7 + 0.3 * sin(TAU * 0.05 * _music_time)
	_pad_phase_a += TAU * ROOT / MIX_RATE
	_pad_phase_b += TAU * ROOT * pow(2.0, 4.0 / 12.0) / MIX_RATE
	_pad_phase_c += TAU * ROOT * 1.5 / MIX_RATE
	var s := (sin(_pad_phase_a) + 0.7 * sin(_pad_phase_b) + 0.6 * sin(_pad_phase_c)) * 0.03 * lfo
	if _arp_env > 0.001 and _arp_freq > 0.0:
		_arp_phase += TAU * _arp_freq / MIX_RATE
		s += (sin(_arp_phase) + 0.3 * sin(_arp_phase * 2.0)) * 0.03 * _arp_env
		_arp_env *= 0.9994
	return s


func _enqueue(frames: PackedVector2Array) -> void:
	if _pending_pos > 0:
		_pending = _pending.slice(_pending_pos)
		_pending_pos = 0
	_pending.append_array(frames)


# ---------------------------------------------------------------- effects ---

func play_effect(name: String) -> void:
	match name:
		"laser":
			_enqueue(_make_chirp(1700.0, 140.0, 0.65, 0.5, 0.25))
			_enqueue(_make_note_seq([220.0, 174.6, 146.8], 0.16, 0.22))  # falling minor stinger
		"ice":
			_enqueue(_make_crackle(0.9, 0.45))
			_enqueue(_make_note_seq([880.0, 932.3, 830.6], 0.22, 0.14))  # cold cluster
		"zap":
			_enqueue(_make_zap())
			_enqueue(_make_note_seq([233.1, 220.0], 0.25, 0.2))  # dissonant sag
		"railgun":
			_enqueue(_make_chirp(320.0, 55.0, 0.45, 0.7, 0.15))
			_enqueue(_make_tone(1900.0, 0.3, 0.18))
			_enqueue(_make_note_seq([110.0, 110.0, 82.4], 0.12, 0.3))  # low execution hits
		"explosion":
			_enqueue(_make_explosion())
			_enqueue(_make_note_seq([130.8, 98.0, 65.4], 0.35, 0.24))  # collapsing minor
		"success":
			# Bright major sting: root - fifth - octave.
			_enqueue(_make_note_seq([523.3, 659.3, 784.0, 1046.5], 0.11, 0.26))
		"fail":
			_enqueue(_make_chirp(300.0, 120.0, 0.35, 0.30, 0.0))
		"unlock":
			_enqueue(_make_tone(520.0, 0.12, 0.28))
			_enqueue(_make_tone(780.0, 0.20, 0.28))
		"click":
			_enqueue(_make_tone(1200.0, 0.05, 0.15))


# ------------------------------------------------------------- synthesis ---

func _make_tone(freq: float, dur: float, vol: float) -> PackedVector2Array:
	var n := int(dur * MIX_RATE)
	var out := PackedVector2Array()
	out.resize(n)
	for i in n:
		var t := float(i) / MIX_RATE
		var env := clampf(1.0 - t / dur, 0.0, 1.0)
		var v := sin(TAU * freq * t) * vol * env
		out[i] = Vector2(v, v)
	return out


func _make_note_seq(freqs: Array, note_dur: float, vol: float) -> PackedVector2Array:
	# Short melodic stinger: back-to-back notes with a soft attack/decay.
	var out := PackedVector2Array()
	for f in freqs:
		var n := int(note_dur * MIX_RATE)
		for i in n:
			var t := float(i) / MIX_RATE
			var env := clampf(t / (note_dur * 0.15), 0.0, 1.0) * clampf(1.0 - t / note_dur, 0.0, 1.0)
			var v := (sin(TAU * f * t) + 0.3 * sin(TAU * f * 2.0 * t)) * vol * env
			out.append(Vector2(v, v))
	return out


func _make_chirp(f0: float, f1: float, dur: float, vol: float, noise_amt: float) -> PackedVector2Array:
	var n := int(dur * MIX_RATE)
	var out := PackedVector2Array()
	out.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / MIX_RATE
		var frac := t / dur
		var freq := lerpf(f0, f1, frac)
		phase += TAU * freq / MIX_RATE
		var env := clampf(1.0 - frac, 0.0, 1.0)
		var v := (sin(phase) + (randf() * 2.0 - 1.0) * noise_amt) * vol * env
		out[i] = Vector2(v, v)
	return out


func _make_thump() -> PackedVector2Array:
	# Two low sine bursts: "lub-dub".
	var out := PackedVector2Array()
	out.append_array(_make_tone(58.0, 0.12, 0.55))
	out.append_array(PackedVector2Array([Vector2.ZERO]))
	var gap := int(0.08 * MIX_RATE)
	var silence := PackedVector2Array()
	silence.resize(gap)
	out.append_array(silence)
	out.append_array(_make_tone(52.0, 0.10, 0.4))
	return out


func _make_crackle(dur: float, vol: float) -> PackedVector2Array:
	var n := int(dur * MIX_RATE)
	var out := PackedVector2Array()
	out.resize(n)
	var gate := 0.0
	for i in n:
		var t := float(i) / MIX_RATE
		if randf() < 0.004:
			gate = 1.0
		gate *= 0.995
		var env := clampf(1.0 - t / dur, 0.0, 1.0)
		var v := (randf() * 2.0 - 1.0) * vol * env * (0.15 + gate)
		out[i] = Vector2(v, v)
	return out


func _make_zap() -> PackedVector2Array:
	var dur := 0.55
	var n := int(dur * MIX_RATE)
	var out := PackedVector2Array()
	out.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / MIX_RATE
		phase += TAU * 95.0 / MIX_RATE
		var env := clampf(1.0 - t / dur, 0.0, 1.0)
		var v: float = (sign(sin(phase)) * 0.5 + (randf() * 2.0 - 1.0) * 0.5) * 0.4 * env
		out[i] = Vector2(v, v)
	return out


func _make_explosion() -> PackedVector2Array:
	var dur := 1.2
	var n := int(dur * MIX_RATE)
	var out := PackedVector2Array()
	out.resize(n)
	var phase := 0.0
	var smooth := 0.0
	for i in n:
		var t := float(i) / MIX_RATE
		phase += TAU * 48.0 / MIX_RATE
		smooth = smooth * 0.96 + (randf() * 2.0 - 1.0) * 0.04
		var env := exp(-3.5 * t)
		var v := (smooth * 6.0 + sin(phase) * 0.6) * 0.55 * env
		out[i] = Vector2(v, v)
	return out
