from __future__ import annotations

import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response


def council_command(
    results_file: Path,
    host: str = "127.0.0.1",
    port: int = 8000,
) -> None:
    """Run a local dashboard to review an Arbiter eval results JSON file.

    Serves a simple FastAPI app that exposes:
      - GET /          -> dashboard HTML
      - GET /data.json -> contents of the provided results JSON file
    """
    from rich.console import Console

    console = Console(highlight=False)

    results_path = Path(results_file).expanduser().resolve()
    if not results_path.exists():
        console.print(f"Results file not found: {results_path}", style="red")
        raise SystemExit(1)

    # Load HTML asset from installed package
    # Use importlib.resources to locate the packaged index.html
    try:
        import importlib.resources as resources

        with resources.files("arbiter.assets").joinpath("index.html").open("rb") as f:
            index_html_bytes = f.read()
            index_html = index_html_bytes.decode("utf-8")
    except Exception as e:  # pragma: no cover
        console.print(f"Failed to load dashboard asset: {e}", style="red")
        raise SystemExit(1)

    # Preload JSON so /data.json can respond quickly; also validate it's JSON
    try:
        with open(results_path, "r", encoding="utf-8") as f:
            preloaded_json = json.load(f)
    except Exception as e:
        console.print(f"Failed to read/parse JSON: {e}", style="red")
        raise SystemExit(1)

    app = FastAPI(title="Arbiter Council")

    # Enable permissive CORS in case the dashboard HTML is hosted elsewhere
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", response_class=HTMLResponse)
    async def root() -> HTMLResponse:
        return HTMLResponse(content=index_html, status_code=200)

    @app.get("/data.json")
    async def data() -> JSONResponse:
        return JSONResponse(content=preloaded_json)

    # Vendor bundles are now loaded directly from CDNs in index.html

    # Serve favicon from packaged assets if present
    @app.get("/favicon.ico")
    async def favicon() -> Response:
        try:
            import importlib.resources as resources

            with resources.files("arbiter.assets").joinpath("favicon.ico").open("rb") as f:
                ico_bytes = f.read()
            return Response(content=ico_bytes, media_type="image/x-icon")
        except Exception:
            # If not bundled, return 404 so browsers stop retrying
            return Response(status_code=404)

    console.print(
        f"Starting Arbiter Council at http://{host}:{port} \n  reviewing: {results_path}",
        style="green",
    )

    uvicorn.run(app, host=host, port=port)
