# Calculator API

A simple calculator HTTP server built with FastAPI.

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## Docker

```bash
docker build -t calculator .
docker run -p 18347:18347 calculator
```

Open [http://localhost:18347](http://localhost:18347).
