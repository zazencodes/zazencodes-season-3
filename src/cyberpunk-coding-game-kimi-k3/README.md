# Code to Live

A short cyberpunk first-person programming game for **Godot 4.2+** (GDScript,
no external assets — all geometry is primitives, all audio is procedurally
generated at runtime).

Survive five coding rooms in one run. Each room has a terminal with a Python
challenge and a countdown. Pass all tests before the timer hits zero, or the
room kills you and the run restarts at Room 1.

## Running the game

1. Open Godot 4.2 or newer.
2. **Import** the project: select `project.godot` from this directory.
3. Press **F5** (Play). The main scene is `scenes/main.tscn`.

> **Terminals require `python3` on your PATH.** Pressing RUN writes your code
> plus a test harness to `user://_ctl_run.py` and executes it with
> `OS.execute("python3", ...)`. If `python3` is missing, the terminal shows a
> clear error instead of test results. The editor indents with 4 spaces, and
> any pasted tab characters are converted to 4 spaces before execution, so
> Python never sees mixed indentation.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Look |
| Shift | Sprint |
| E | Access terminal (when prompted) |
| Esc / CLOSE button | Leave terminal focus (timer keeps running) / release mouse |
| R | Restart after victory / game over / during the meadow walk |
| Ctrl + `=` / Ctrl + `-` | Zoom terminal UI in/out (0.6x–3x) |
| Ctrl + mouse wheel | Zoom terminal UI in/out |
| Ctrl + `0` | Reset terminal zoom to the 1.8x default |

Terminal zoom persists for the whole session (across rooms and deaths) and the
current zoom level flashes briefly in the terminal header when it changes.

## Audio

All sound is procedurally generated (AudioStreamGenerator): a dark ambient
music bed (detuned pad drone, pulsing bass, sparse minor-pentatonic arpeggio)
with a different root note per room, layered per the spec's tension bands —
full bed at 100–50% remaining time, thinned under the heartbeat (50–25%),
ducked under the siren (25–10%), and buried under the rapid alarm (<10%) —
plus a success sting, per-room death stingers, and all SFX.

## The five rooms

1. **Security Quarantine** (red, 30s) — fix broken syntax → `SYSTEM_ONLINE`
2. **Cryo Core** (cyan, 30s) — type bug → `42`
3. **Power Grid** (yellow, 60s) — filter/count transform → `7`
4. **Firewall AI** (violet, 60s) — palindrome check → `AUTHORIZED`
5. **Central Core** (white, 60s) — two-sum style lookup → `9182`

Each challenge ships with buggy starter code and 3–5 tests evaluated by an
appended Python harness. Test output lines (`RESULT|n|STATUS|expected|received`)
are parsed and shown in the terminal.

## The ending

Solving Room 5 opens its exit door instead of ending the game outright.
Behind it lies a bright outdoor **meadow** — blue procedural sky, warm
sunlight, grass, trees, flowers and clouds, all from primitives — a
deliberate visual break from the facility. A non-blocking victory message
("SYSTEM BREACHED — YOU'RE FREE") stays on the HUD, the tension overlays and
dark ambient bed fade away, and a warm major-key pad takes over. Walking
deeper into the meadow fades the screen to white (alpha driven by distance
walked); at full white the run resets to Room 1 with the facility restored.
R restarts at any point during the meadow.

## Structure

- `scripts/main.gd` — run orchestration and state machine (incl. meadow flow)
- `scripts/room.gd` — procedural room (walls, neon, pipes, terminal, doors, timer)
- `scripts/meadow.gd` — procedural ending meadow (grass, trees, flowers, clouds)
- `scripts/player.gd` — FPS controller (code-built CharacterBody3D)
- `scripts/terminal_ui.gd` — coding terminal UI (code-built)
- `scripts/overlay_ui.gd` — vignette/glitch shader, HUD, death effects, white fade
- `scripts/audio_fx.gd` — procedural audio (AudioStreamGenerator): ambient bed,
  peaceful meadow pad, heartbeat, siren, alarm, and all one-shot effects
- `scripts/challenges.gd` — room/challenge data + Python test harnesses
- `scripts/python_runner.gd` — python3 execution and result parsing

Tension escalates with the fraction of remaining time: subtle vignette →
pulsing colored vignette + glitch + heartbeat → siren → rapid alarm, aggressive
distortion and a flashing red timer below 10%.

Known limitation: `OS.execute` is synchronous, so a solution with an infinite
loop will hang the game — keep your code finite.
