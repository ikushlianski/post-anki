#!/usr/bin/env bash
# Sourced by the dev build scripts. Sets BUILD_DIR to a per-worktree folder under one cache root
# and deletes sibling build folders not used for DEV_BUILD_KEEP_DAYS (default 3).
DEV_BUILD_ROOT="${POSTANKI_DEV_BUILD_ROOT:-$HOME/Library/Caches/post-anki-dev-builds}"
DEV_BUILD_KEEP_DAYS="${DEV_BUILD_KEEP_DAYS:-3}"
DEV_BUILD_KEY="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")"
BUILD_DIR="$DEV_BUILD_ROOT/$DEV_BUILD_KEY"

mkdir -p "$BUILD_DIR"
touch "$BUILD_DIR"

for OLD in $(find "$DEV_BUILD_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$DEV_BUILD_KEEP_DAYS" ! -name "$DEV_BUILD_KEY" 2>/dev/null); do
  pgrep -f "$OLD/" >/dev/null 2>&1 || rm -rf "$OLD"
done
