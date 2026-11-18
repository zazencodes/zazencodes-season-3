"""Print a repeatable set of sample coding-agent sessions as JSON Lines."""

import json


def main():
    for number in range(1, 151):
        waiting = number % 37 == 0
        session = {
            "session_id": f"demo-{number:04}",
            "project": "sample-app",
            "state": "waiting_for_approval" if waiting else "complete",
            "command": "run integration tests" if waiting else "run unit tests",
        }
        print(json.dumps(session))


if __name__ == "__main__":
    main()
