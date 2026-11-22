# Build Your 24/7 Local AI Image Generator with the Olares One

Turn six science fiction and fantasy books into an ongoing set of desktop wallpapers. Qwen3.8-27B writes the descriptions through Olares Router. Qwen-Image 2.1 renders them in ComfyUI. Linux cron runs the whole workflow on the Olares host.

## Prerequisites

- SSH into the Olares Linux host. You need Python 3, Git, `jq`, and a signed-in `olares-cli` profile. Run `olares-cli profile whoami` to check the profile.
- Install and start the packaged **ComfyUI** app (`comfyuisharev3`). The script looks up its `comfyui` Kubernetes service in `comfyuisharev3-shared` and calls its local API on port `8190`. Check that `kubectl -n comfyuisharev3-shared get svc comfyui` works for the SSH user.
- Install Qwen3.8-27B (llama.cpp) from Olares Market and set it as Router's `default-chat` target. Confirm with `olares-cli router route get default-chat`.
- Add the following files to ComfyUI. [Comfy-Org’s Qwen-Image 2.1 package](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)

| Model directory | File |
| --- | --- |
| `diffusion_models` | `qwen_image_2.1_int8_convrot.safetensors` |
| `text_encoders` | `qwen3vl_8b_int8_convrot.safetensors` |
| `vae` | `qwen_image_2.1_vae_bf16.safetensors` |

## Generate one wallpaper

Clone the companion from the Olares SSH shell.

```bash
cd ~
git clone https://github.com/zazencodes/zazencodes-season-3.git
cd zazencodes-season-3/src/olares-one-local-ai
```

Ask Qwen for a scene, give that prompt to ComfyUI, and put the resulting image in Olares Files.

```bash
scene=$(olares-cli router call chat --model default-chat -o json \
  'Write one image prompt for a 16:9 wallpaper inspired by The Time Machine by H. G. Wells. Invent a scene in the world of the book. The image is painterly, atmospheric, and free of lettering. Return the description alone.' |
  jq -er '.choices[0] | select(.finish_reason == "stop") | .message.content | strings | select(length > 0)')
python3 render-image.py "$scene" "$HOME/time-machine.png"
olares-cli files upload "$HOME/time-machine.png" 'drive/Home/Pictures/'
```

Open **Files → Drive → Home → Pictures** to view `time-machine.png`.

## Run the book rotation every minute

Install the Linux cron service if the Olares host needs it. Run the installer from the companion folder as your regular SSH user.

```bash
sudo apt-get install cron
sudo systemctl enable --now cron
bash install-cron.sh
crontab -l
```

The job rotates through *The Time Machine*, *The Wonderful Wizard of Oz*, *Frankenstein*, *Alice's Adventures in Wonderland*, *A Journey into the Interior of the Earth*, and *A Princess of Mars*. For each book, it gives Qwen the recent scenes for that title, asks for a fresh composition, and renders a **1920 × 1080** PNG with a new seed. The ComfyUI graph renders at 1920 × 1088 to align with the VAE and center-crops four pixels from the top and bottom.

Read the logs in SSH and open **Files → Drive → Home → Pictures → Book Wallpapers** for the images.

```bash
tail -n 25 ~/book-wallpapers/run.log
olares-cli files ls 'drive/Home/Pictures/Book Wallpapers'
```

Cron continues after SSH disconnects. A tick skips while a run holds the lock. The cursor advances once the runner verifies the PNG in Files. A failed or interrupted run retries the same book at the next available tick. `~/book-wallpapers/state.json` tracks the cursor and any pending ComfyUI job. `~/book-wallpapers/prompts/` keeps the descriptions used in the finished images. To pause generation, comment out the `book-wallpapers` entry with `crontab -e`.

On the demo Olares One, native cron completed the six-book rotation and published the first 1920 × 1080 wallpaper to Olares Files after the rotation wrapped.
