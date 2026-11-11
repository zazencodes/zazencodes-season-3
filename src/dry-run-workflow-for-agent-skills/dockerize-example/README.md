# Japanese Story FastAPI

Very small FastAPI app that renders and streams Japanese characters in a browser.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Docker

```bash
docker build -t streaming-story .
docker run -p 18347:18347 streaming-story
```

Open [http://localhost:18347](http://localhost:18347).
