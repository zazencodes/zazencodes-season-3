#!/usr/bin/env bash
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
export LC_ALL=C

here=$(cd -- "$(dirname -- "$0")" && pwd)
target="$HOME/book-wallpapers"
pictures='drive/Home/Pictures'

if ! systemctl is-active --quiet cron; then
  printf '%s\n' 'Start the Linux cron service before running this installer.' >&2
  exit 1
fi

mkdir -p "$target/prompts" "$target/staging/widescreen"
listing=$(olares-cli files ls "$pictures" -o json)
if ! jq -e 'any(.items[]; .name == "Book Wallpapers")' <<<"$listing" >/dev/null; then
  olares-cli files mkdir "$pictures/Book Wallpapers"
fi
olares-cli files ls "$pictures/Book Wallpapers" -o json | jq -e '.isDir' >/dev/null

exec 9>"$target/run.lock"
flock -w 120 9
install -m 700 "$here/run.py" "$target/.run.py.new"
mv "$target/.run.py.new" "$target/run.py"
touch "$target/run.log"

entry="* * * * * PATH=$PATH /usr/bin/python3 $target/run.py >> $target/run.log 2>&1 # book-wallpapers"
if ! schedule=$(crontab -l 2>&1); then
  if [[ "$schedule" != "no crontab for $(id -un)" ]]; then
    printf '%s\n' "$schedule" >&2
    exit 1
  fi
  schedule=
fi
if ! grep -Fxq "$entry" <<<"$schedule"; then
  if grep -Eq '# book-wallpapers[[:space:]]*$' <<<"$schedule"; then
    printf '%s\n' 'Update the existing book-wallpapers entry in crontab -e.' >&2
    exit 1
  fi
  {
    if [[ -n "$schedule" ]]; then printf '%s\n' "$schedule"; fi
    printf '%s\n' "$entry"
  } | crontab -
fi

printf 'Wallpaper generation starts at the next minute. Follow %s/run.log\n' "$target"
