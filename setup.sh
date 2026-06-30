#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   🎬  ZENTRIX STREAMING  SETUP  🎬       ║"
echo "  ║      Movies · TV · Anime · Live TV       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

echo "📦 [1/4] Installing root dependencies..."
npm install
echo "✅ Root deps installed"
echo ""

echo "📦 [2/4] Installing backend dependencies..."
(cd "$SCRIPT_DIR/backend" && npm install)
echo "✅ Backend deps installed"
echo ""

echo "📦 [3/4] Installing frontend dependencies (includes hls.js for Live TV)..."
(cd "$SCRIPT_DIR/frontend" && npm install)
echo "✅ Frontend deps installed"
echo ""

echo "📡 [4/4] Verifying Live TV channel data..."
STREAM_COUNT=$(find "$SCRIPT_DIR/backend/data/streams" -name "*.m3u" 2>/dev/null | wc -l | tr -d ' ')
if [ "$STREAM_COUNT" -gt 0 ]; then
  echo "✅ Found $STREAM_COUNT channel playlists (backend/data/streams/)"
else
  echo "⚠  No channel playlists found in backend/data/streams/ — Live TV will show 0 channels."
  echo "   This shouldn't happen with a normal download; re-download the project if you see this."
fi
echo ""

echo "  ══════════════════════════════════════════"
echo "  ✅  All done!  Run:  npm run dev"
echo ""
echo "  Frontend  →  http://localhost:5173"
echo "  Backend   →  http://localhost:3001"
echo "  Live TV   →  http://localhost:5173/live"
echo "  ══════════════════════════════════════════"
echo ""
