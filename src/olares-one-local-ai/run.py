#!/usr/bin/python3
import fcntl
import json
import os
import secrets
import struct
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
FILES_DESTINATION = "drive/Home/Pictures/Book Wallpapers"
WIDTH = 1920
HEIGHT = 1080
RENDER_HEIGHT = 1088  # The Qwen VAE decodes to a multiple of 16 pixels.
BOOKS = (
    ("The Time Machine", "H. G. Wells", "the-time-machine"),
    ("The Wonderful Wizard of Oz", "L. Frank Baum", "the-wonderful-wizard-of-oz"),
    ("Frankenstein", "Mary Shelley", "frankenstein"),
    ("Alice's Adventures in Wonderland", "Lewis Carroll", "alices-adventures-in-wonderland"),
    ("A Journey into the Interior of the Earth", "Jules Verne", "a-journey-into-the-interior-of-the-earth"),
    ("A Princess of Mars", "Edgar Rice Burroughs", "a-princess-of-mars"),
)
DIRECTIONS = (
    "a wide landscape seen from a dramatic height",
    "a quiet discovery shown through a small detail in the foreground",
    "an interior dominated by its unusual architecture",
    "a crossing or threshold with striking light on the far side",
    "a largely unpeopled setting transformed by unusual weather",
    "a low viewpoint with an unexpected sense of scale",
    "an overhead composition using a strong diagonal",
    "a silhouette revealed by reflected light",
)


def log(message):
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {message}", flush=True)


def atomic_write(path, data):
    part = path.with_name(f".{path.name}.part")
    with part.open("wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    part.replace(path)


def save_state(state):
    atomic_write(ROOT / "state.json", (json.dumps(state, indent=2) + "\n").encode())


def stem(sequence, slug):
    return f"{sequence:08d}-{slug}"


def create_scene(sequence, title, author, slug):
    recent = []
    for old_sequence in range(sequence - len(BOOKS), max(0, sequence - 5 * len(BOOKS)), -len(BOOKS)):
        scene_file = ROOT / "prompts" / (stem(old_sequence, slug) + ".txt")
        if scene_file.is_file():
            recent.append(scene_file.read_text().strip())

    prompt = (
        f'Describe one original 16:9 widescreen desktop wallpaper inspired by the novel "{title}" by {author}. '
        "Draw on the book's world and imagery. Invent a distinct moment or viewpoint. "
        "Use cinematic depth, painterly detail, atmospheric lighting, and a strong focal point. "
        "Build a wide composition with visual depth across the frame. "
        "Aim for a finished image free of lettering, signs, logos, or watermarks. "
        f"For this image, try {secrets.choice(DIRECTIONS)}. "
        "Write one visual paragraph of 55 to 95 words."
    )
    if recent:
        prompt += (
            "\nThese are recent scenes for this book. Choose a different subject, setting, "
            "composition, and lighting:\n" + "\n".join(f"- {item}" for item in recent)
        )

    response = subprocess.run(
        [
            "/usr/local/bin/olares-cli", "router", "call", "chat", "--model", "default-chat",
            "-o", "json", "--timeout", "75s", "--temperature", "0.95", "--max-tokens", "1800",
            "--system", "You write image prompts. Respond with the image description alone.",
        ],
        input=prompt, text=True, stdout=subprocess.PIPE, check=True, timeout=85,
    )
    answer = json.loads(response.stdout)["choices"][0]
    if answer["finish_reason"] != "stop":
        raise RuntimeError(f"Qwen finish reason: {answer['finish_reason']}")
    scene = " ".join(answer["message"]["content"].split())
    if not scene or any(scene.casefold() == item.casefold() for item in recent):
        raise RuntimeError("Qwen returned an empty or repeated scene")
    return scene


def comfy_url():
    address = subprocess.check_output(
        [
            "/usr/local/bin/kubectl", "--request-timeout=8s", "-n", "comfyuisharev3-shared",
            "get", "svc", "comfyui", "-o", "jsonpath={.spec.clusterIP}",
        ],
        text=True, timeout=12,
    ).strip()
    if not address or address == "None":
        raise RuntimeError("Olares ComfyUI service has no ClusterIP")
    return f"http://{address}:8190"


def fetch(base, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {} if data is None else {"Content-Type": "application/json"}
    try:
        with urlopen(Request(base + path, data=data, headers=headers), timeout=25) as response:
            return response.read()
    except HTTPError as error:
        raise RuntimeError(f"ComfyUI {path}: HTTP {error.code} {error.read(1600).decode(errors='replace')}") from error


def workflow(scene, seed):
    nodes = {
        "1": ("UNETLoader", {"unet_name": "qwen_image_2.1_int8_convrot.safetensors", "weight_dtype": "default"}),
        "2": ("CLIPLoader", {"clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"}),
        "3": ("VAELoader", {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}),
        "4": ("TextEncodeQwenImage21", {"clip": ["2", 0], "prompt": scene, "negative_prompt": "", "resolution": 1024}),
        "5": ("QwenImage21Cache", {"model": ["1", 0], "device": "auto", "dtype": "default"}),
        "6": ("EmptyLatentImage", {"width": WIDTH, "height": RENDER_HEIGHT, "batch_size": 1}),
        "7": ("KSampler", {
            "model": ["5", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["6", 0],
            "seed": seed, "steps": 25, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
        }),
        "8": ("VAEDecode", {"samples": ["7", 0], "vae": ["3", 0]}),
        "10": ("ImageCrop", {
            "image": ["8", 0], "width": WIDTH, "height": HEIGHT,
            "x": 0, "y": (RENDER_HEIGHT - HEIGHT) // 2,
        }),
        "9": ("PreviewImage", {"images": ["10", 0]}),
    }
    return {key: {"class_type": kind, "inputs": fields} for key, (kind, fields) in nodes.items()}


class RenderFailed(RuntimeError):
    pass


def render(base, scene, seed, job_id):
    history_path = f"/history/{job_id}"
    result = json.loads(fetch(base, history_path)).get(job_id)
    if result is None:
        queue = json.loads(fetch(base, "/queue"))
        # Check queue before history a second time in case the job just finished.
        active = any(job[1] == job_id for key in ("queue_running", "queue_pending") for job in queue[key])
        result = json.loads(fetch(base, history_path)).get(job_id)
        if result is None and not active:
            job = json.loads(fetch(base, "/prompt", {
                "prompt_id": job_id,
                "client_id": "olares-book-wallpapers",
                "prompt": workflow(scene, seed),
            }))
            if job["prompt_id"] != job_id:
                raise RuntimeError("ComfyUI assigned an unexpected job ID")
            log(f"Queued ComfyUI job {job_id}")
    deadline = time.monotonic() + 110
    while result is None and time.monotonic() < deadline:
        time.sleep(2)
        result = json.loads(fetch(base, history_path)).get(job_id)

    if result is None:
        raise TimeoutError(f"ComfyUI job {job_id} did not complete before the deadline")
    if result["status"]["status_str"] != "success":
        for event, detail in result["status"]["messages"]:
            if event == "execution_error":
                log(f"ComfyUI {detail['node_type']}: {detail['exception_message']}")
        raise RenderFailed(f"ComfyUI job {job_id} failed")

    image = result["outputs"]["9"]["images"][0]
    query = urlencode({key: image[key] for key in ("filename", "subfolder", "type")})
    data = fetch(base, f"/view?{query}")
    if data[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" or struct.unpack(">II", data[16:24]) != (WIDTH, HEIGHT):
        raise RuntimeError(f"ComfyUI returned an invalid {WIDTH} by {HEIGHT} PNG")
    return data


def publish(local_file):
    remote_file = f"{FILES_DESTINATION}/{local_file.name}"
    files = ["/usr/local/bin/olares-cli", "files"]
    probe = subprocess.run(
        [*files, "ls", remote_file, "-o", "json"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20,
    )
    if probe.returncode:
        message = json.loads(probe.stderr)["error"]["message"]
        if ": HTTP 404 " not in message:
            raise RuntimeError(f"Olares Files lookup failed: {message}")
        subprocess.run(
            [*files, "upload", str(local_file), remote_file], check=True, timeout=35,
        )

    published = subprocess.check_output([*files, "cat", remote_file], timeout=25)
    if published != local_file.read_bytes():
        raise RuntimeError(f"Olares Files has different content for {remote_file}")


def run():
    started = time.monotonic()
    state_path = ROOT / "state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {"completed": 0}
    sequence = state["completed"] + 1
    title, author, slug = BOOKS[(sequence - 1) % len(BOOKS)]
    name = stem(sequence, slug)
    output = ROOT / "staging" / "widescreen" / (name + ".png")
    prompt_file = ROOT / "prompts" / (name + ".txt")

    if not output.exists():
        pending = state.get("pending")
        log(f"Started {name} | {title} by {author}")
        if pending is None:
            pending = {
                "scene": create_scene(sequence, title, author, slug),
                "seed": secrets.randbits(48),
                "job_id": str(uuid.uuid4()),
            }
            state["pending"] = pending
            save_state(state)
            log(f"Qwen scene ready after {time.monotonic() - started:.1f}s")

        try:
            data = render(comfy_url(), pending["scene"], pending["seed"], pending["job_id"])
        except RenderFailed:
            pending["job_id"] = str(uuid.uuid4())
            save_state(state)
            raise
        atomic_write(prompt_file, (pending["scene"] + "\n").encode())
        atomic_write(output, data)

    publish(output)
    save_state({"completed": sequence})
    output.unlink()
    log(f"Saved {FILES_DESTINATION}/{output.name} in {time.monotonic() - started:.1f}s")


if __name__ == "__main__":
    os.umask(0o077)
    with (ROOT / "run.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("Skipped this minute while the previous render is still running")
        else:
            try:
                run()
            except Exception as error:
                log(f"Run failed: {error}")
                raise
