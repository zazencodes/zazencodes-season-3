class_name Meadow
extends Node3D
## The ending "paradise": a bright outdoor meadow past Room 5's exit door,
## built entirely from primitives — grass plane with color-varied patches,
## trunk+canopy trees, stem flowers, soft clouds, and invisible boundary
## walls so the player can't walk off the world.
##
## IMPORTANT: the meadow node sits at MEADOW_CENTER (global x = 94) and ALL
## geometry must stay at local x >= X_NEAR (global x >= 54, Room 5's exit
## wall) so nothing reaches back into the facility and z-fights its floors.
## The ground top is y = 0, flush with the facility floor at the doorway.

const X_NEAR := -40.0        # local x of Room 5's exit wall plane
const X_FAR := 75.0          # local x of the far edge
const Z_BOUND := 48.0        # invisible side walls at +/- z
const CLEARING_X := -18.0    # keep trees out of the door clearing
const CLEARING_Z := 8.0


static func create(center: Vector3) -> Meadow:
	var m := Meadow.new()
	m.name = "Meadow"
	m.position = center
	return m


func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 4242
	_build_ground(rng)
	_build_trees(rng)
	_build_flowers(rng)
	_build_clouds(rng)
	_build_bounds()


func _mat(col: Color, emission := 0.0) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = col
	mat.roughness = 0.9
	if emission > 0.0:
		mat.emission_enabled = true
		mat.emission = col
		mat.emission_energy_multiplier = emission
	return mat


func _build_ground(rng: RandomNumberGenerator) -> void:
	var size := Vector3(X_FAR - X_NEAR, 0.2, 150.0)
	var center_x := (X_NEAR + X_FAR) * 0.5
	var ground := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	ground.mesh = bm
	ground.position = Vector3(center_x, -0.1, 0)
	ground.set_surface_override_material(0, _mat(Color(0.24, 0.58, 0.19)))
	add_child(ground)
	var body := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	cs.position = Vector3(center_x, -0.1, 0)
	body.add_child(cs)
	add_child(body)
	# Lighter / darker grass patches for variation.
	for i in 60:
		var patch := MeshInstance3D.new()
		var pm := BoxMesh.new()
		var s := rng.randf_range(1.5, 4.5)
		pm.size = Vector3(s, 0.04, s)
		patch.mesh = pm
		patch.position = Vector3(rng.randf_range(X_NEAR + 2.0, X_FAR - 3.0), 0.02, rng.randf_range(-70.0, 70.0))
		var shade := rng.randf_range(-0.08, 0.1)
		patch.set_surface_override_material(0, _mat(Color(0.24 + shade, 0.58 + shade, 0.19 + shade * 0.5)))
		add_child(patch)


func _build_trees(rng: RandomNumberGenerator) -> void:
	var trunk_mat := _mat(Color(0.4, 0.27, 0.15))
	var leaf_a := _mat(Color(0.15, 0.5, 0.16))
	var leaf_b := _mat(Color(0.3, 0.65, 0.2))
	var placed := 0
	var attempts := 0
	while placed < 16 and attempts < 200:
		attempts += 1
		var pos := Vector3(rng.randf_range(X_NEAR + 4.0, X_FAR - 7.0), 0, rng.randf_range(-Z_BOUND + 4, Z_BOUND - 4))
		if pos.x < CLEARING_X and absf(pos.z) < CLEARING_Z:
			continue  # keep the door clearing open
		placed += 1
		var tree := Node3D.new()
		tree.position = pos
		var h := rng.randf_range(2.5, 4.5)
		var trunk := MeshInstance3D.new()
		var tm := CylinderMesh.new()
		tm.top_radius = 0.16
		tm.bottom_radius = 0.24
		tm.height = h
		trunk.mesh = tm
		trunk.position.y = h * 0.5
		trunk.set_surface_override_material(0, trunk_mat)
		tree.add_child(trunk)
		for j in rng.randi_range(2, 3):
			var canopy := MeshInstance3D.new()
			var sm := SphereMesh.new()
			var r := rng.randf_range(1.0, 1.8)
			sm.radius = r
			sm.height = r * 1.6
			canopy.mesh = sm
			canopy.position = Vector3(rng.randf_range(-0.5, 0.5), h + rng.randf_range(-0.2, 0.9), rng.randf_range(-0.5, 0.5))
			canopy.set_surface_override_material(0, leaf_a if j % 2 == 0 else leaf_b)
			tree.add_child(canopy)
		add_child(tree)


func _build_flowers(rng: RandomNumberGenerator) -> void:
	var stem_mat := _mat(Color(0.2, 0.5, 0.2))
	var petal_colors := [
		Color(1.0, 0.4, 0.5), Color(1.0, 0.85, 0.25), Color(0.95, 0.95, 1.0),
		Color(0.8, 0.45, 1.0), Color(1.0, 0.55, 0.2),
	]
	for i in 50:
		var flower := Node3D.new()
		flower.position = Vector3(rng.randf_range(X_NEAR + 1.5, X_FAR - 5.0), 0, rng.randf_range(-Z_BOUND + 2, Z_BOUND - 2))
		var stem := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.02
		cm.bottom_radius = 0.02
		cm.height = 0.4
		stem.mesh = cm
		stem.position.y = 0.2
		stem.set_surface_override_material(0, stem_mat)
		flower.add_child(stem)
		var head := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.1
		sm.height = 0.16
		head.mesh = sm
		head.position.y = 0.44
		head.set_surface_override_material(0, _mat(petal_colors[i % petal_colors.size()], 0.6))
		flower.add_child(head)
		add_child(flower)


func _build_clouds(rng: RandomNumberGenerator) -> void:
	var cloud_mat := _mat(Color(1, 1, 1), 0.35)
	for i in 10:
		var cloud := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = rng.randf_range(3.0, 6.0)
		sm.height = sm.radius * 0.8
		cloud.mesh = sm
		cloud.scale.y = 0.35
		cloud.position = Vector3(rng.randf_range(X_NEAR + 4.0, X_FAR + 20.0), rng.randf_range(22, 34), rng.randf_range(-90, 90))
		cloud.set_surface_override_material(0, cloud_mat)
		add_child(cloud)


func _build_bounds() -> void:
	var body := StaticBody3D.new()
	body.name = "Bounds"
	# No wall on the near (-x) side: that is the doorway back into Room 5.
	# Far wall.
	_add_wall(body, Vector3(X_FAR + 2, 5, 0), Vector3(1, 10, Z_BOUND * 2 + 4))
	# Side walls.
	_add_wall(body, Vector3((X_NEAR + X_FAR) * 0.5, 5, Z_BOUND + 2), Vector3(X_FAR - X_NEAR, 10, 1))
	_add_wall(body, Vector3((X_NEAR + X_FAR) * 0.5, 5, -Z_BOUND - 2), Vector3(X_FAR - X_NEAR, 10, 1))
	add_child(body)


func _add_wall(body: StaticBody3D, pos: Vector3, size: Vector3) -> void:
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	cs.position = pos
	body.add_child(cs)
