# 5 Token Saving Tools for Coding Agents

In the video I used Pi, Codex and Claude Code on Agentio. This companion gives you a small public dataset so you can try the same five approaches in your own checkout. It contains 150 fictional coding-agent sessions, including four waiting for approval.

From this folder, run:

```sh
python3 demo.py > sessions.jsonl
```

Try one tool at a time in a fresh agent session. For the context tools, ask the agent to read the **whole file** and list the exact IDs waiting for approval. The four correct IDs are `demo-0037`, `demo-0074`, `demo-0111` and `demo-0148`. Compare its answer and usage with a run on the same model without the tool.

| Tool | Setup from the video | What to try |
| --- | --- | --- |
| [RTK](https://github.com/rtk-ai/rtk) | Install RTK (video version 1.2.0), then run `rtk init --agent pi` in your project and reload Pi. | Compare `git log -10` with `rtk git log -10`. Run `rtk gain` to inspect RTK’s estimated savings. |
| [Headroom](https://github.com/headroomlabs-ai/headroom) | Install with `uv tool install --python 3.13 'headroom-ai[proxy]==0.44.0'`, then launch `headroom wrap codex`. | Try the session-ID task. Run `headroom perf` to inspect the proxy’s counters and check whether Codex retrieved an original result. |
| [Caveman](https://github.com/JuliusBrussee/caveman) | Ask Pi to install the repo’s `skills/caveman` directory as a project skill. Reload Pi and invoke `/skill:caveman`. | Ask “Explain how demo.py selects the sessions that need approval.” Compare the answer length and whether the rule stays accurate. |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Run `pi install --local git:github.com/DietrichGebert/ponytail` and reload Pi. | Ask “Add a flag to demo.py to print only sessions waiting for approval.” Check the diff, whether the default still prints 150 rows, and whether the flag prints the four expected IDs. |
| [PXPIPE](https://github.com/teamchong/pxpipe) | Start the proxy with `npx --yes --package=pxpipe-proxy@0.16.0 pxpipe`. In another terminal launch `npx --yes --package=pxpipe-proxy@0.16.0 pxpipe warp -- claude`. | Try the session-ID task on a supported vision model. Inspect the dashboard at http://localhost:47821 for rendered pages and compare the exact IDs. |

RTK filters shell output. Headroom and PXPIPE change what reaches the model. Caveman changes how the agent explains things, and Ponytail changes what it chooses to implement. For each run, record the model, whether the tool actually engaged, and whether the answer or code passed the check.
