from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

TITLE = "月の川と化けたぬき"
STORY_TEXT = (
    "むかし むかし、 霧 の 深い 山里 に さき という 糸紡ぎ の 娘 が いました。 "
    "村 では 毎年 秋祭り の 夜 に、 川 の 石橋 から 金色 の 灯 が 流れる と 豊作 に なる と 信じられて いました。 "
    "ところが ある 年、 灯 は ひとつ も 現れず、 人々 は 不吉 だ と ささやきました。 "
    "さき が 川辺 で 泣いて いる と、 ずぶぬれ の たぬき が 現れて 「わし の 太鼓 が 盗まれた」 と 頭 を 下げました。 "
    "その 太鼓 は 月 の 光 を 集める 不思議 な 皮 で できて いて、 叩く と 灯 が 生まれる のだ と いいます。 "
    "さき は 一晩 じゅう 山道 を 歩き、 古い 杉 の うろ で 眠って いた 山犬 から 太鼓 を 取り戻しました。 "
    "たぬき は 礼 に 化ける 術 を 教えよう と しました が、 さき は 「姿 は 変えなくて いい、 心 が まっすぐ なら」 と 笑いました。 "
    "祭り の 夜、 たぬき が 太鼓 を 三度 打つ と、 川面 に 小さな 月 が いくつ も 跳ねて、 金色 の 灯 が 村 じゅう を 流れました。 "
    "人々 は 手 を 合わせ、 さき の 糸 で 織った 帯 を 神社 に 奉げました。 "
    "それ から 山里 では、 困った 旅人 に 粥 を 分ける 家 ほど よく 実る と 語り継がれ、 "
    "石橋 には いま も 太鼓 の 音 が 聞こえる と いわれて います。"
)

DEFAULT_DELAY_MS = 40
MIN_DELAY_MS = 0
MAX_DELAY_MS = 1000

app = FastAPI(title="Streaming Story App")


def clamp_delay(delay_ms: int) -> float:
    safe_delay = max(MIN_DELAY_MS, min(MAX_DELAY_MS, delay_ms))
    return safe_delay / 1000


async def iter_characters(text: str, delay_ms: int) -> AsyncIterator[str]:
    delay_seconds = clamp_delay(delay_ms)
    for char in text:
        yield char
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)


async def iter_sse_characters(text: str, delay_ms: int) -> AsyncIterator[bytes]:
    delay_seconds = clamp_delay(delay_ms)
    for char in text:
        payload = f"data: {json.dumps({'char': char}, ensure_ascii=False)}\n\n"
        yield payload.encode("utf-8")
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)
    yield b'data: {"done": true}\n\n'


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    html = f"""
    <!DOCTYPE html>
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{TITLE}</title>
        <style>
          body {{
            font-family: sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 0 16px;
            line-height: 1.8;
          }}
          h1 {{ margin-bottom: 8px; }}
          .controls {{ display: flex; gap: 12px; align-items: center; margin: 16px 0; }}
          .story {{
            white-space: pre-wrap;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 16px;
            min-height: 260px;
          }}
          button {{ padding: 8px 14px; cursor: pointer; }}
          input {{ width: 100px; padding: 6px; }}
        </style>
      </head>
      <body>
        <h1>{TITLE}</h1>
        <p>FastAPI から文字を 1 文字ずつ配信します。</p>

        <div class="controls">
          <label for="delayMs">delay(ms)</label>
          <input id="delayMs" type="number" min="0" max="1000" value="{DEFAULT_DELAY_MS}" />
          <button id="startBtn">Start</button>
          <button id="resetBtn">Reset</button>
        </div>

        <div id="story" class="story"></div>

        <script>
          const storyEl = document.getElementById("story");
          const delayEl = document.getElementById("delayMs");
          const startBtn = document.getElementById("startBtn");
          const resetBtn = document.getElementById("resetBtn");

          let currentReader = null;

          async function startStreaming() {{
            if (currentReader) {{
              currentReader.cancel();
              currentReader = null;
            }}

            storyEl.textContent = "";
            const delay = Number(delayEl.value || {DEFAULT_DELAY_MS});
            const response = await fetch(`/stream?delay_ms=${{encodeURIComponent(delay)}}`);
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            currentReader = reader;

            try {{
              while (true) {{
                const {{ value, done }} = await reader.read();
                if (done) break;
                storyEl.textContent += decoder.decode(value, {{ stream: true }});
              }}
              storyEl.textContent += decoder.decode();
            }} catch (error) {{
              if (error?.name !== "AbortError") {{
                console.error(error);
              }}
            }} finally {{
              if (currentReader === reader) {{
                currentReader = null;
              }}
            }}
          }}

          startBtn.addEventListener("click", startStreaming);
          resetBtn.addEventListener("click", () => {{
            if (currentReader) {{
              currentReader.cancel();
              currentReader = null;
            }}
            storyEl.textContent = "";
          }});
        </script>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


@app.get("/story")
async def get_story() -> JSONResponse:
    return JSONResponse({"title": TITLE, "story_text": STORY_TEXT})


@app.get("/stream")
async def stream_story(
    include_title: bool = Query(default=True),
    delay_ms: int = Query(default=DEFAULT_DELAY_MS, ge=MIN_DELAY_MS, le=MAX_DELAY_MS),
) -> StreamingResponse:
    text = f"{TITLE}\n\n{STORY_TEXT}" if include_title else STORY_TEXT
    return StreamingResponse(
        iter_characters(text, delay_ms), media_type="text/plain; charset=utf-8"
    )


@app.get("/stream-sse")
async def stream_story_sse(
    include_title: bool = Query(default=True),
    delay_ms: int = Query(default=DEFAULT_DELAY_MS, ge=MIN_DELAY_MS, le=MAX_DELAY_MS),
) -> StreamingResponse:
    text = f"{TITLE}\n\n{STORY_TEXT}" if include_title else STORY_TEXT
    return StreamingResponse(
        iter_sse_characters(text, delay_ms),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
