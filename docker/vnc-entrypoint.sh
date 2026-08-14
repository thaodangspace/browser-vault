#!/bin/sh
set -eu

# The VNC services are started only by the dedicated Compose service. They are
# intentionally bound to localhost by compose.yaml; authentication state shown
# in this display is sensitive.
export DISPLAY="${DISPLAY:-:99}"

Xvfb "$DISPLAY" -screen 0 "${VNC_SCREEN:-1280x900x24}" -ac +extension RANDR &
xvfb_pid=$!

# Wait briefly for the display socket so headed Chromium does not race Xvfb.
for _ in $(seq 1 50); do
  [ -S "/tmp/.X11-unix/X${DISPLAY#:}" ] && break
  sleep 0.1
done

if ! kill -0 "$xvfb_pid" 2>/dev/null; then
  echo "Xvfb failed to start" >&2
  exit 1
fi

x11vnc -display "$DISPLAY" -localhost -forever -shared -nopw -rfbport 5900 &
x11vnc_pid=$!
# Explicit zero timeouts keep the noVNC listener alive between viewer sessions.
websockify --timeout 0 --idle-timeout 0 --web /usr/share/novnc 6080 localhost:5900 &
websockify_pid=$!

# `docker compose ... run browser-vault-vnc profile login ...` retains its
# one-off CLI behavior. Starting the service with `up` supplies no arguments,
# so keep the virtual display and noVNC available for later `compose exec` use.
if [ "$#" -gt 0 ]; then
  exec node /app/dist/cli.js "$@"
fi

cleanup() {
  kill "$websockify_pid" "$x11vnc_pid" "$xvfb_pid" 2>/dev/null || true
}
trap 'cleanup; exit 0' INT TERM

while kill -0 "$xvfb_pid" 2>/dev/null \
  && kill -0 "$x11vnc_pid" 2>/dev/null \
  && kill -0 "$websockify_pid" 2>/dev/null; do
  sleep 1
done

echo "VNC service exited unexpectedly" >&2
cleanup
exit 1
