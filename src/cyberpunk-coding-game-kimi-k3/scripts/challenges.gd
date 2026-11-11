class_name Challenges
extends RefCounted
## Static data for the five rooms: theme, challenge text, starter code and
## the Python test harness appended to the player's code before execution.
##
## Harness output protocol (parsed by PythonRunner):
##   RESULT|<n>|PASS|<expected repr>|<received repr>
##   RESULT|<n>|FAIL|<expected repr>|<received repr>
##   RESULT|<n>|ERROR|<expected repr>|<error text>
## Fields are repr()s of simple values and never contain a "|" character.

const _HARNESS_TAIL := """

TESTS = __TESTS__

def _run():
    for _i, _t in enumerate(TESTS, 1):
        _args, _expected = _t
        try:
            _received = solve(*_args)
        except Exception as _e:
            print("RESULT|" + str(_i) + "|ERROR|" + repr(_expected) + "|" + type(_e).__name__ + ": " + str(_e))
            continue
        _ok = _received == _expected
        print("RESULT|" + str(_i) + ("|PASS|" if _ok else "|FAIL|") + repr(_expected) + "|" + repr(_received))

_run()
"""


static func _harness(tests_python_literal: String) -> String:
	return _HARNESS_TAIL.replace("__TESTS__", tests_python_literal)


static func get_room_configs() -> Array:
	return [
		{
			"id": 1,
			"name": "Security Quarantine",
			"color": Color(1.0, 0.12, 0.12),
			"time_limit": 30.0,
			"death": "laser",
			"title": "BOOT SEQUENCE // SYNTAX BREACH",
			"description": "The quarantine door AI rejected its own boot script.\nRepair the broken syntax so that solve(a, b) joins the two\ntoken parts with an underscore.\n\nExample: solve(\"SYSTEM\", \"ONLINE\") must return SYSTEM_ONLINE",
			"expected_display": "SYSTEM_ONLINE",
			"starter": "# Quarantine boot script — REPAIR ME\ndef solve(a, b)\n    result = a + \"_\" + b\n    return result\n",
			"harness": _harness("[\n    ((\"SYSTEM\", \"ONLINE\"), \"SYSTEM_ONLINE\"),\n    ((\"CORE\", \"ACTIVE\"), \"CORE_ACTIVE\"),\n    ((\"POWER\", \"RESTORED\"), \"POWER_RESTORED\"),\n]"),
		},
		{
			"id": 2,
			"name": "Cryo Core",
			"color": Color(0.15, 0.9, 1.0),
			"time_limit": 30.0,
			"death": "ice",
			"title": "CRYO REGULATOR // TYPE FAULT",
			"description": "The cryo regulator computes the right digits but the coolant\nvalve rejects them: the function returns a STRING, not a number.\nFix the type bug so solve(x) returns x * 6 as an int.\n\nExample: solve(7) must return 42",
			"expected_display": "42",
			"starter": "# Cryo regulator — valve expects an int\ndef solve(x):\n    return str(x * 6)\n",
			"harness": _harness("[\n    ((7,), 42),\n    ((10,), 60),\n    ((0,), 0),\n    ((13,), 78),\n]"),
		},
		{
			"id": 3,
			"name": "Power Grid",
			"color": Color(1.0, 0.85, 0.1),
			"time_limit": 60.0,
			"death": "zap",
			"title": "GRID AUDIT // BAD COUNT",
			"description": "The grid audit counts how many nodes report status \"ON\",\nbut the current code counts EVERY node, blowing the breakers.\nFix solve(nodes) to count only entries with status \"ON\".\nnodes is a list of (name, status) tuples.\n\nExample: the first grid below must return 7",
			"expected_display": "7",
			"starter": "# Grid audit — counts everything, should count status == \"ON\"\ndef solve(nodes):\n    total = 0\n    for node in nodes:\n        total += 1\n    return total\n",
			"harness": _harness("[\n    (([(\"n1\",\"ON\"),(\"n2\",\"OFF\"),(\"n3\",\"ON\"),(\"n4\",\"ON\"),(\"n5\",\"OFF\"),(\"n6\",\"ON\"),(\"n7\",\"ON\"),(\"n8\",\"ON\"),(\"n9\",\"ON\"),(\"n10\",\"OFF\")],), 7),\n    (([(\"a\",\"OFF\"),(\"b\",\"OFF\")],), 0),\n    (([(\"x\",\"ON\"),(\"y\",\"ON\"),(\"z\",\"ON\")],), 3),\n]"),
		},
		{
			"id": 4,
			"name": "Firewall AI",
			"color": Color(0.7, 0.25, 1.0),
			"time_limit": 60.0,
			"death": "railgun",
			"title": "FIREWALL HANDSHAKE // OPEN GATE",
			"description": "The firewall only authorizes palindrome tokens — strings that\nread the same forwards and backwards. Right now it authorizes\nEVERYTHING. Fix solve(token) to return \"AUTHORIZED\" only for\npalindromes, otherwise \"DENIED\".\n\nExample: solve(\"level\") must return AUTHORIZED",
			"expected_display": "AUTHORIZED",
			"starter": "# Firewall handshake — currently lets everything through\ndef solve(token):\n    return \"AUTHORIZED\"\n",
			"harness": _harness("[\n    ((\"level\",), \"AUTHORIZED\"),\n    ((\"hacker\",), \"DENIED\"),\n    ((\"racecar\",), \"AUTHORIZED\"),\n    ((\"firewall\",), \"DENIED\"),\n    ((\"a\",), \"AUTHORIZED\"),\n]"),
		},
		{
			"id": 5,
			"name": "Central Core",
			"color": Color(0.95, 0.95, 1.0),
			"time_limit": 60.0,
			"death": "explosion",
			"title": "CORE LOOKUP // PAIR LOCK",
			"description": "The core unlock code is the PRODUCT of two DIFFERENT list\nvalues whose sum equals the target. The current code is allowed\nto use the same element twice, corrupting the lock.\nFix solve(nums, target): find indices i != j with\nnums[i] + nums[j] == target and return nums[i] * nums[j].\nReturn -1 if no such pair exists.\n\nExample: the first test must return 9182",
			"expected_display": "9182",
			"starter": "# Core lookup — bug: i and j may be the same element\ndef solve(nums, target):\n    for i in range(len(nums)):\n        for j in range(len(nums)):\n            if nums[i] + nums[j] == target:\n                return nums[i] * nums[j]\n    return -1\n",
			"harness": _harness("[\n    (([5, 2, 4591, 7], 4593), 9182),\n    (([3, 10, 1], 13), 30),\n    (([6, 3], 12), -1),\n    (([8, 4, 11, 2], 13), 22),\n]"),
		},
	]
