## Name

Code to Live

## Game technology

Godot 4.x using GDScript


## Game concept

Code or Die is a short cyberpunk first-person programming game.

The player must survive five coding rooms in one run.

Each room contains a coding terminal, a countdown timer, a programming challenge, and a lethal threat.

The gameplay loop is:

1. Enter a room.
2. Approach and interact with its coding terminal.
3. Read the challenge.
4. Edit the provided code.
5. Press Run.
6. See test results immediately.
7. Pass all tests before the timer reaches zero.
8. The threat shuts down and the exit opens.
9. Continue to the next room.

If the player fails or runs out of time, play a very short death effect and restart the run from Room 1.

Completing Room 5 wins the game.

## Goal

The primary goal is a small but complete playable game where I can walk through five cyberpunk rooms, solve increasingly difficult coding challenges under time pressure, die and restart when I fail, and reach a final victory screen when I complete all five.

## MVP scope

Build only what is necessary for the complete five-room loop.

Include:

* First-person movement and mouse look
* Five connected cyberpunk rooms
* Interactive coding terminals
* One programming language for now: Python
* Five predefined coding challenges
* Editable code
* Run button
* Visible test results and error output
* Countdown timer
* Hazard escalation as time runs out
* Locked exit doors that open after success
* Death and restart from Room 1
* Final victory screen


## The five rooms

### Room 1 — Security Quarantine

Theme: Red

Challenge: very simple syntax/debugging problem.

Example goal:
Repair broken code so its output is:

`SYSTEM_ONLINE`

Death effect:
Red screen flash with slicing laser lines and laser sound.

### Room 2 — Cryo Core

Theme: Cyan

Challenge:
Simple logic or type bug.

Example expected result:

`42`

Death effect:
Cyan flash, frozen/glitched screen effect, ice cracking sound.

### Room 3 — Power Grid

Theme: Yellow

Challenge:
Basic data transformation such as filtering or counting values.

Example expected result:

`7`

Death effect:
Yellow/white flash, electrical effects and zap sound.

### Room 4 — Firewall AI

Theme: Violet/Red

Challenge:
Simple algorithm such as palindrome checking or balanced brackets.

Example expected result:

`AUTHORIZED`

Death effect:
Targeting crosshair flash followed by weapon/railgun sound.

### Room 5 — Central Core

Theme: White

Challenge:
A moderately harder lookup/search problem such as two-sum.

Example expected result:

`9182`

Death effect:
White flash, strong screen shake and explosion/alarm sound.

The exact challenge implementations can be adjusted if needed to make them reliable and fun.

## Coding terminal

Interacting with a terminal should switch the player into a focused terminal UI.

The UI needs:

* challenge title
* challenge description
* editable code area
* starter code
* Run button
* test case results
* runtime/error output
* countdown timer

The player should be able to leave terminal focus if appropriate, but the room timer continues running.

When Run is pressed, evaluate the submitted solution against predefined tests.

Show immediate feedback such as:

* Test 1: PASS
* Test 2: PASS
* Test 3: FAIL — expected 42, received 41

Passing every required test completes the room.

## Timer and tension system

Every room has a time limit.

As the percentage of remaining time decreases, apply the same escalating screen effects throughout the game.

### 100%–50%

Mostly normal presentation.

Use:

* subtle vignette
* normal ambient sound

### 50%–25%

Warning state.

Add:

* faint pulsing room-colored vignette
* occasional glitch/CRT effects
* slow heartbeat

### 25%–10%

Critical state.

Add:

* stronger pulsing warning vignette
* more screen glitches
* faster heartbeat
* warning siren

### Below 10%

Imminent failure.

Add:

* aggressive flashing vignette
* stronger screen distortion
* rapid alarm
* flashing red timer

### Timeout

Immediately trigger the room's approximately one-second death sequence.

Keep these effects visually effective but technically simple.

## Room progression

Each room begins locked.

After all tests pass:

* stop the timer
* stop the hazard effects
* play a success sound/effect
* unlock/open the exit door
* allow the player to proceed

Entering the next room starts its challenge timer.

The player must complete all five rooms consecutively.

On death:

1. play the room-specific one-second death effect
2. show a short glitch/game-over transition
3. reset the run to Room 1

Do not reload or rebuild unnecessary systems if a cleaner run-reset system is possible.

## Visual direction

Use a simple dark cyberpunk industrial style.

Use Godot primitives and simple materials rather than requiring external assets.

The rooms should feel like parts of one facility but have recognizable accent colors:

1. Red
2. Cyan
3. Yellow
4. Violet
5. White

Use:

* dark metallic walls
* neon/emissive lighting
* cables/pipes or simple industrial geometry where useful
* glowing terminals
* warning lights
* doors between rooms
* subtle fog or atmospheric lighting if practical

Do not spend excessive effort on environmental detail before the whole game loop works.


