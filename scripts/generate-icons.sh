#!/bin/sh
# Renders assets/icon.svg to the PNG sizes the manifest uses.
# Requires rsvg-convert (macOS: brew install librsvg).
set -e
cd "$(dirname "$0")/.."
for size in 16 32 48 128; do
  rsvg-convert -w "$size" -h "$size" assets/icon.svg -o "public/icons/icon$size.png"
done
echo "Icons written to public/icons/"
