#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

version="$(node -p "require('./manifest.json').version")"
archive="dist/github-pr-focus-${version}.zip"

mkdir -p dist
zip -FS -r "$archive" manifest.json src assets/icons
echo "$archive"
