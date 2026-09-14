class_name PythonRunner
extends RefCounted
## Executes the player's Python solution against a challenge harness using
## python3 from the system PATH. The combined source (user code + harness)
## is written to a temp file in user:// and executed via OS.execute.
## Output lines beginning with "RESULT|" are parsed into test results.

const TEMP_FILE := "user://_ctl_run.py"


static func run_tests(user_code: String, harness: String) -> Dictionary:
	var f := FileAccess.open(TEMP_FILE, FileAccess.WRITE)
	if f == null:
		return {"ok": false, "error": "Could not write temp file " + TEMP_FILE}
	# Normalize any tab indentation so Python never sees mixed tabs/spaces.
	f.store_string(user_code.replace("\t", "    ") + "\n" + harness)
	f.close()

	var abs_path := ProjectSettings.globalize_path(TEMP_FILE)
	var output: Array = []
	# read_stderr = true so SyntaxError / Traceback text is captured too.
	var exit_code := OS.execute("python3", [abs_path], output, true)
	if exit_code == -1:
		return {
			"ok": false,
			"error": "python3 could not be executed.\nInstall Python 3 and make sure 'python3' is on your PATH.",
		}

	var text := ""
	for chunk in output:
		text += chunk

	var results: Array = []
	var extra := ""
	for line in text.split("\n"):
		if line.begins_with("RESULT|"):
			var p := line.split("|")
			if p.size() >= 5:
				results.append({
					"n": int(p[1]),
					"status": p[2],
					"expected": p[3],
					"received": "|".join(p.slice(4)),
				})
		elif line.strip_edges() != "":
			extra += line + "\n"

	if results.is_empty():
		var msg := "No test results produced (exit code %d)." % exit_code
		if extra.strip_edges() != "":
			msg += "\n\nPython output:\n" + extra.strip_edges()
		return {"ok": false, "error": msg, "extra": extra}

	return {"ok": true, "results": results, "extra": extra, "exit": exit_code}
