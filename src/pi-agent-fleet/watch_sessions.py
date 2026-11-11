#!/usr/bin/env python3
"""Live chat-style viewer for agent session .jsonl files.

Usage:
    python3 watch_sessions.py [sessions_dir]

Keys:
    1-9     switch between session files
    Tab     cycle to next session
    Up/Down, PgUp/PgDn, j/k   scroll
    G / End jump to bottom (resume auto-follow)
    g / Home jump to top
    t       toggle thinking blocks
    r       toggle tool results
    q       quit
"""

import curses
import json
import os
import sys
import textwrap
import time
from datetime import datetime
from pathlib import Path

DEFAULT_DIR = Path(__file__).parent / "work" / "sessions"
POLL_INTERVAL = 0.5  # seconds between file checks
TOOL_RESULT_MAX_LINES = 6
TOOL_ARG_MAX_CHARS = 300

# color pair ids
C_USER, C_ASSISTANT, C_THINKING, C_TOOL, C_RESULT, C_ERROR, C_META, C_TS, C_TAB_ACTIVE, C_TAB = range(1, 11)


def fmt_ts(entry):
    ts = entry.get("timestamp")
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%H:%M:%S")
        except ValueError:
            return "--:--:--"
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S")
    return "--:--:--"


def short_args(args):
    try:
        s = json.dumps(args, ensure_ascii=False)
    except (TypeError, ValueError):
        s = str(args)
    if len(s) > TOOL_ARG_MAX_CHARS:
        s = s[:TOOL_ARG_MAX_CHARS] + "…"
    return s


class Block:
    """One renderable chat block: a header line plus body text."""

    def __init__(self, ts, label, color, body, kind="text"):
        self.ts = ts
        self.label = label
        self.color = color
        self.body = body
        self.kind = kind  # text | thinking | tool | result


class Session:
    def __init__(self, path: Path):
        self.path = path
        self.offset = 0
        self.partial = b""
        self.blocks = []
        self.meta = {}
        self.mtime = 0

    @property
    def name(self):
        return self.path.stem

    def poll(self):
        """Read any new bytes and parse complete lines. Returns True if new content."""
        try:
            size = self.path.stat().st_size
        except OSError:
            return False
        if size < self.offset:  # file truncated/rewritten
            self.offset = 0
            self.partial = b""
            self.blocks = []
        if size == self.offset:
            return False
        with open(self.path, "rb") as f:
            f.seek(self.offset)
            data = self.partial + f.read()
            self.offset = f.tell()
        lines = data.split(b"\n")
        self.partial = lines.pop()  # last element is incomplete (or empty)
        added = False
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            added |= self.ingest(entry)
        return added

    def ingest(self, entry):
        ts = fmt_ts(entry)
        etype = entry.get("type")
        if etype == "session":
            self.meta["started"] = ts
            self.blocks.append(Block(ts, "session", C_META, f"started in {entry.get('cwd', '?')}"))
            return True
        if etype == "model_change":
            self.meta["model"] = entry.get("modelId", "?")
            self.blocks.append(Block(ts, "model", C_META, f"{entry.get('provider', '?')} / {entry.get('modelId', '?')}"))
            return True
        if etype == "thinking_level_change":
            self.blocks.append(Block(ts, "thinking-level", C_META, str(entry.get("thinkingLevel", "?"))))
            return True
        if etype != "message":
            return False

        msg = entry.get("message", {})
        role = msg.get("role", "?")
        added = False
        for part in msg.get("content", []):
            ptype = part.get("type")
            if ptype == "text":
                text = part.get("text", "").strip()
                if not text:
                    continue
                if role == "user":
                    self.blocks.append(Block(ts, "user", C_USER, text))
                else:
                    self.blocks.append(Block(ts, "assistant", C_ASSISTANT, text))
                added = True
            elif ptype == "thinking":
                text = part.get("thinking", "").strip()
                if text:
                    self.blocks.append(Block(ts, "thinking", C_THINKING, text, kind="thinking"))
                    added = True
            elif ptype == "toolCall":
                name = part.get("name", "?")
                self.blocks.append(Block(ts, f"tool: {name}", C_TOOL, short_args(part.get("arguments", {})), kind="tool"))
                added = True
        if role == "toolResult":
            texts = [p.get("text", "") for p in msg.get("content", []) if p.get("type") == "text"]
            body = "\n".join(texts).strip() or "(empty)"
            lines = body.splitlines()
            if len(lines) > TOOL_RESULT_MAX_LINES:
                body = "\n".join(lines[:TOOL_RESULT_MAX_LINES]) + f"\n… ({len(lines) - TOOL_RESULT_MAX_LINES} more lines)"
            is_err = msg.get("isError", False)
            label = f"result: {msg.get('toolName', '?')}" + (" ✗" if is_err else "")
            self.blocks.append(Block(ts, label, C_ERROR if is_err else C_RESULT, body, kind="result"))
            added = True
        return added


class App:
    def __init__(self, stdscr, sessions_dir: Path):
        self.scr = stdscr
        self.dir = sessions_dir
        self.sessions = {}   # path -> Session
        self.order = []      # stable ordering for number keys
        self.active = 0
        self.scroll = 0      # lines scrolled up from bottom; 0 = follow
        self.show_thinking = True
        self.show_results = True
        self.last_poll = 0

    def discover(self):
        for path in sorted(self.dir.glob("*.jsonl")):
            if path not in self.sessions:
                self.sessions[path] = Session(path)
                self.order.append(path)

    def poll(self):
        self.discover()
        changed = False
        for s in self.sessions.values():
            changed |= s.poll()
        return changed

    def current(self):
        if not self.order:
            return None
        return self.sessions[self.order[self.active]]

    def visible_blocks(self, session):
        for b in session.blocks:
            if b.kind == "thinking" and not self.show_thinking:
                continue
            if b.kind == "result" and not self.show_results:
                continue
            yield b

    def render_lines(self, session, width):
        """Flatten blocks into (text, attr) display lines."""
        lines = []
        body_width = max(20, width - 11)  # 9 for "HH:MM:SS  " gutter
        for b in self.visible_blocks(session):
            attr = curses.color_pair(b.color)
            header_attr = attr | curses.A_BOLD
            lines.append((f"{b.ts}  ", curses.color_pair(C_TS), b.label, header_attr))
            for para in b.body.splitlines():
                wrapped = textwrap.wrap(para, body_width) or [""]
                for w in wrapped:
                    lines.append((" " * 10, 0, w, attr))
            lines.append(("", 0, "", 0))  # blank spacer
        return lines

    def draw(self):
        self.scr.erase()
        h, w = self.scr.getmaxyx()

        # tab bar
        x = 0
        for i, path in enumerate(self.order):
            label = f" {i + 1}:{path.stem} "
            attr = curses.color_pair(C_TAB_ACTIVE) | curses.A_BOLD if i == self.active else curses.color_pair(C_TAB)
            if x + len(label) >= w:
                break
            self.scr.addnstr(0, x, label, w - x - 1, attr)
            x += len(label) + 1
        if not self.order:
            self.scr.addnstr(0, 0, f" watching {self.dir} — no .jsonl files yet ", w - 1, curses.color_pair(C_TAB))

        session = self.current()
        view_h = h - 2
        if session:
            lines = self.render_lines(session, w)
            max_scroll = max(0, len(lines) - view_h)
            self.scroll = min(self.scroll, max_scroll)
            start = max(0, len(lines) - view_h - self.scroll)
            for row, (gutter, gattr, text, tattr) in enumerate(lines[start:start + view_h]):
                y = row + 1
                try:
                    if gutter:
                        self.scr.addnstr(y, 0, gutter, w - 1, gattr)
                    if text:
                        self.scr.addnstr(y, len(gutter), text, max(1, w - 1 - len(gutter)), tattr)
                except curses.error:
                    pass

        # status bar
        follow = "FOLLOW" if self.scroll == 0 else f"↑{self.scroll}"
        flags = f"[t]hinking:{'on' if self.show_thinking else 'off'} [r]esults:{'on' if self.show_results else 'off'}"
        model = session.meta.get("model", "") if session else ""
        status = f" {follow} | {flags} | {model} | 1-9 switch · Tab next · j/k scroll · G bottom · q quit "
        try:
            self.scr.addnstr(h - 1, 0, status.ljust(w - 1), w - 1, curses.color_pair(C_TAB))
        except curses.error:
            pass
        self.scr.refresh()

    def run(self):
        curses.curs_set(0)
        self.scr.timeout(int(POLL_INTERVAL * 1000))
        self.poll()
        self.draw()
        while True:
            key = self.scr.getch()
            now = time.monotonic()
            dirty = False
            if now - self.last_poll >= POLL_INTERVAL:
                self.last_poll = now
                dirty = self.poll()
            if key == -1:
                if dirty:
                    self.draw()
                continue
            if key in (ord("q"), 27):
                return
            elif ord("1") <= key <= ord("9"):
                idx = key - ord("1")
                if idx < len(self.order):
                    self.active = idx
                    self.scroll = 0
            elif key == ord("\t"):
                if self.order:
                    self.active = (self.active + 1) % len(self.order)
                    self.scroll = 0
            elif key in (curses.KEY_UP, ord("k")):
                self.scroll += 1
            elif key in (curses.KEY_DOWN, ord("j")):
                self.scroll = max(0, self.scroll - 1)
            elif key == curses.KEY_PPAGE:
                self.scroll += max(1, self.scr.getmaxyx()[0] - 3)
            elif key == curses.KEY_NPAGE:
                self.scroll = max(0, self.scroll - max(1, self.scr.getmaxyx()[0] - 3))
            elif key in (ord("G"), curses.KEY_END):
                self.scroll = 0
            elif key in (ord("g"), curses.KEY_HOME):
                self.scroll = 10**9  # clamped in draw()
            elif key == ord("t"):
                self.show_thinking = not self.show_thinking
            elif key == ord("r"):
                self.show_results = not self.show_results
            elif key == curses.KEY_RESIZE:
                pass
            self.draw()


def main(stdscr, sessions_dir):
    curses.use_default_colors()
    curses.start_color()
    pairs = {
        C_USER: curses.COLOR_GREEN,
        C_ASSISTANT: curses.COLOR_WHITE,
        C_THINKING: curses.COLOR_BLUE,
        C_TOOL: curses.COLOR_YELLOW,
        C_RESULT: curses.COLOR_CYAN,
        C_ERROR: curses.COLOR_RED,
        C_META: curses.COLOR_MAGENTA,
        C_TS: curses.COLOR_BLACK + 8 if curses.COLORS > 8 else curses.COLOR_WHITE,
    }
    for pid, fg in pairs.items():
        curses.init_pair(pid, fg, -1)
    curses.init_pair(C_TAB_ACTIVE, curses.COLOR_BLACK, curses.COLOR_GREEN)
    curses.init_pair(C_TAB, curses.COLOR_WHITE, curses.COLOR_BLACK + 8 if curses.COLORS > 8 else curses.COLOR_BLACK)
    App(stdscr, sessions_dir).run()


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    if not target.is_dir():
        sys.exit(f"Not a directory: {target}")
    os.environ.setdefault("ESCDELAY", "25")
    curses.wrapper(main, target)
