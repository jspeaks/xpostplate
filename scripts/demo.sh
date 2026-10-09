#!/usr/bin/env bash
# Rebuild assets/demo.gif and assets/demo.mp4 (README and social demo).
# Records assets/demo.tape with VHS (the command, its stderr, and a chafa preview
# in the terminal), then crossfades to the real PNG for the last 3 seconds.
# Needs vhs, chafa, ffmpeg, and xpostplate on PATH: brew install vhs chafa ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."

url=https://x.com/SpaceX/status/2106090316747207047
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

vhs assets/demo.tape
xpostplate "$url" > "$tmp/post.png"

fade=0.6
offset=$(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/demo.mp4 | awk -v f="$fade" '{ printf "%.2f", $1 - f }')

ffmpeg -y -loglevel error -i assets/demo.mp4 -loop 1 -framerate 25 -t 3.6 -i "$tmp/post.png" -filter_complex "\
[1:v]scale=-2:740:flags=lanczos,pad=1200:820:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setsar=1,fps=25,settb=AVTB[card];\
[0:v]setsar=1,fps=25,settb=AVTB[term];\
[term][card]xfade=transition=fade:duration=${fade}:offset=${offset},format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -preset slow -crf 23 -movflags +faststart "$tmp/demo.mp4"
mv "$tmp/demo.mp4" assets/demo.mp4

ffmpeg -y -loglevel error -i assets/demo.mp4 -vf "\
fps=15,scale=1000:-1:flags=lanczos,split[a][b];\
[a]palettegen=max_colors=160:stats_mode=full[p];\
[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" assets/demo.gif

ls -l assets/demo.gif assets/demo.mp4
