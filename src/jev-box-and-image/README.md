# Jev Can See Now: Images + Box (ZazenCodes Season 3)

Jev 1.14 (`jev-1.14.0`, released Oct 14, 2026) takes **images**, adds a new question type, **`Box`**, that finds things in them, and unlocks **long context** up to 262k tokens. Follow-up to the [Jev System 1 demo](../jev-system-one-model-python-demo).

## Setup

You need [uv](https://docs.astral.sh/uv/) and a TypeSafe API key from <https://console.typesafe.ai/keys>.

```bash
cd src/jev-box-and-image
uv sync
cp .env.example .env   # set TYPESAFE_API_KEY and SEC_USER_AGENT
```

## Part 1: The Notebook

```bash
nvb jev_box_and_image.ipynb
```

Or `uv run --with jupyter jupyter notebook jev_box_and_image.ipynb`. It covers 1. images, 2. `Box`, 3. long context.

> Note: we use Meta's Q3 2026 10-Q, which isn't in the repo. Run the **Appendix** at the bottom of the notebook once to download it from SEC EDGAR.

## Part 2: Build a Screen Watcher

Hand this prompt to a coding agent in this folder:

```text
Build screen_watch.py in this folder: a Python script that watches my screen with Jev.

Every second, take a screenshot with macOS screencapture, shrink it to fit 1568 px,
and ask Jev in one call:
- what I'm doing (Choice: coding, writing, meeting, browsing)
- how focused the screen looks (Score: Distracted to Deep work)
- whether I'm distracted by social media, videos, shopping or news (Noul)

Print one line per check with the answers, latency, cost and running total cost
(input tokens at $0.042 per million), append it to screen_log.jsonl, and send a
macOS notification when I look distracted.

Use the TypeSafe Python SDK already in this project, run with uv. Images need the
header TypeSafe-Danger-Zone-Images: true. See jev_box_and_image.ipynb for how
images work.

Don't look in the solutions/ folder.
```

Your terminal needs Screen Recording permission (System Settings → Privacy & Security → Screen Recording).

A finished version is in [`solutions/screen_watch.py`](solutions/screen_watch.py): `uv run solutions/screen_watch.py`.


## Part 3: In the Wild

Things people built in the first ten days.

**Cameras and tracking**
- [Jev's Eye](https://x.com/Sethnuzum/status/2110753767150981509): live webcam object detection (Seth Nuzum)
- [jev-box-tracking](https://github.com/BenCaunt/jev-box-tracking): Box plus optical flow for smooth tracking (Ben Caunt)
- [Drone camera sim](https://jev-dronecam-bq3fs.sprites.app): fly to the box or keep searching (Todd Dailey)
- [Multimodal Jev Clearly Explained](https://www.youtube.com/watch?v=ciQghn271rA): damage claims and a webcam detector (Akshay Pachaar)

**Screens and UIs**
- [Screenshot to spreadsheet](https://x.com/dfinke/status/2112939789024641482): Box finds the table, out comes Excel (Doug Finke)
- [jev-click-bench](https://github.com/arthurkatcher/jev-click-bench): how well Box finds things on screens (Arthur Katcher)
- [hitbox](https://github.com/Azri-Muhsin/hitbox): UI tests without selectors (Azri Muhsin)
- [claude-code-jev](https://github.com/pachelbel23/claude-code-jev): a Claude Code skill for images and Box (pachelbel23)

**Games**
- [Where is Hotdog?](https://demos.trev.in/hotdog) (Trevin Chow)
- [Jev Cards](https://github.com/Jose-Sabater/jevcards): race Jev to tap the right thing (José Sabater)
- [jev-where-is-waldo](https://github.com/maxim-kich/jev-where-is-waldo) (Maxim Kich)
- [laravel-jev-hotdog](https://github.com/phoenix1331/laravel-jev-hotdog): Not Hotdog in Laravel (phoenix1331)
- [Drawing game](https://x.com/ajitomatix/status/2113355201583407323) (Ajit Datar)

**Tests**
- [Box in .NET](https://laurentkempe.com/2026/10/17/typesafe-dotnet-sdk-v0-7-0/) (Laurent Kempé)
- [Clothing classifier](https://x.com/wesbos/status/2110509898958008515) (Wes Bos)
- [jev-box-study](https://github.com/RINNECODER/jev-box-study): can Box find mistakes in AI images? (0xRinne)

## References

- [Jev 1.14 release post](https://typesafe.ai/blog/jev-1-14)
- [TypeSafe docs](https://docs.typesafe.ai)
- [Python SDK](https://github.com/typesafe-ai/typesafe-sdk-python)
