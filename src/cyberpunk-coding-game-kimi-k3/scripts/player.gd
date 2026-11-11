class_name Player
extends CharacterBody3D
## First-person controller built entirely in code: capsule collision,
## camera, interaction raycast, WASD movement, mouse look, screen shake.

const WALK_SPEED := 4.5
const SPRINT_SPEED := 7.0
const MOUSE_SENS := 0.0022
const GRAVITY := 20.0

var camera: Camera3D
var ray: RayCast3D
var frozen := false

var _pitch := 0.0
var _trauma := 0.0


static func create() -> Player:
	var p := Player.new()
	p.name = "Player"

	var col := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.35
	capsule.height = 1.8
	col.shape = capsule
	col.position.y = 0.9
	p.add_child(col)

	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position.y = 1.6
	cam.fov = 75.0
	cam.current = true
	p.add_child(cam)
	p.camera = cam

	var r := RayCast3D.new()
	r.name = "InteractRay"
	r.target_position = Vector3(0.0, 0.0, -2.8)
	r.enabled = true
	cam.add_child(r)
	p.ray = r

	return p


func _unhandled_input(event: InputEvent) -> void:
	if frozen:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * MOUSE_SENS)
		_pitch = clampf(_pitch - event.relative.y * MOUSE_SENS, -1.45, 1.45)
		camera.rotation.x = _pitch


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta

	if frozen:
		velocity.x = 0.0
		velocity.z = 0.0
	else:
		var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		var speed := SPRINT_SPEED if Input.is_action_pressed("sprint") else WALK_SPEED
		var dir := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
		velocity.x = dir.x * speed
		velocity.z = dir.z * speed

	move_and_slide()


func _process(delta: float) -> void:
	if _trauma > 0.0:
		_trauma = maxf(_trauma - delta * 1.5, 0.0)
		var s := _trauma * _trauma * 0.25
		camera.h_offset = randf_range(-s, s)
		camera.v_offset = randf_range(-s, s)
	else:
		camera.h_offset = 0.0
		camera.v_offset = 0.0


func add_shake(amount: float) -> void:
	_trauma = minf(_trauma + amount, 1.0)


func get_interact_target() -> Object:
	if ray.is_colliding():
		return ray.get_collider()
	return null
