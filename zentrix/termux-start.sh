#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════╗
# ║   🎬  ZENTRIX — Termux Dev Launcher      ║
# ╚══════════════════════════════════════════╝

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Get local IP for easy access from browser
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   🎬  ZENTRIX STREAMING — Termux          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Starting backend + frontend..."
echo ""
echo "  📱 Open in browser:"
echo "  → http://localhost:5173"
if [ -n "$LOCAL_IP" ]; then
  echo "  → http://$LOCAL_IP:5173  (network access)"
fi
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Start backend in background
node "$SCRIPT_DIR/backend/index.js" &
BACKEND_PID=$!

# Start frontend (vite dev server)
cd "$SCRIPT_DIR/frontend" && npx vite --host

# Kill backend when frontend exits
kill $BACKEND_PID 2>/dev/null
