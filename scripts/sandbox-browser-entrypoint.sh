#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export DISPLAY=:1
export HOME=/tmp/aetherbot-home
export XDG_CONFIG_HOME="${HOME}/.config"
export XDG_CACHE_HOME="${HOME}/.cache"

CDP_PORT="${OPENCLAW_BROWSER_CDP_PORT:-${CLAWDBOT_BROWSER_CDP_PORT:-9222}}"
VNC_PORT="${OPENCLAW_BROWSER_VNC_PORT:-${CLAWDBOT_BROWSER_VNC_PORT:-5900}}"
NOVNC_PORT="${OPENCLAW_BROWSER_NOVNC_PORT:-${CLAWDBOT_BROWSER_NOVNC_PORT:-6080}}"
ENABLE_NOVNC="${OPENCLAW_BROWSER_ENABLE_NOVNC:-${CLAWDBOT_BROWSER_ENABLE_NOVNC:-1}}"
HEADLESS="${OPENCLAW_BROWSER_HEADLESS:-${CLAWDBOT_BROWSER_HEADLESS:-0}}"
EXPOSE_CDP="${OPENCLAW_BROWSER_EXPOSE_CDP:-${CLAWDBOT_BROWSER_EXPOSE_CDP:-0}}"
CDP_BIND_HOST="${OPENCLAW_BROWSER_CDP_BIND_HOST:-${CLAWDBOT_BROWSER_CDP_BIND_HOST:-127.0.0.1}}"
NOVNC_BIND_HOST="${OPENCLAW_BROWSER_NOVNC_BIND_HOST:-${CLAWDBOT_BROWSER_NOVNC_BIND_HOST:-127.0.0.1}}"
CDP_TOKEN="${OPENCLAW_BROWSER_CDP_TOKEN:-${CLAWDBOT_BROWSER_CDP_TOKEN:-}}"
NOVNC_TOKEN="${OPENCLAW_BROWSER_NOVNC_TOKEN:-${CLAWDBOT_BROWSER_NOVNC_TOKEN:-}}"
ALLOW_INSECURE_CDP_LAN="${OPENCLAW_BROWSER_ALLOW_INSECURE_CDP_LAN:-${CLAWDBOT_BROWSER_ALLOW_INSECURE_CDP_LAN:-0}}"
ALLOW_INSECURE_NOVNC_LAN="${OPENCLAW_BROWSER_ALLOW_INSECURE_NOVNC_LAN:-${CLAWDBOT_BROWSER_ALLOW_INSECURE_NOVNC_LAN:-0}}"
AUTH_PROXY_SCRIPT="${OPENCLAW_BROWSER_AUTH_PROXY_SCRIPT:-${SCRIPT_DIR}/browser-auth-proxy.mjs}"

is_loopback_host() {
  local host="${1:-}"
  [[ "${host}" == "127.0.0.1" || "${host}" == "localhost" || "${host}" == "::1" ]]
}

mkdir -p "${HOME}" "${HOME}/.chrome" "${XDG_CONFIG_HOME}" "${XDG_CACHE_HOME}"

Xvfb :1 -screen 0 1280x800x24 -ac -nolisten tcp &

if [[ "${HEADLESS}" == "1" ]]; then
  CHROME_ARGS=(
    "--headless=new"
    "--disable-gpu"
  )
else
  CHROME_ARGS=()
fi

if [[ "${CDP_PORT}" -ge 65535 ]]; then
  CHROME_CDP_PORT="$((CDP_PORT - 1))"
else
  CHROME_CDP_PORT="$((CDP_PORT + 1))"
fi

CHROME_ARGS+=(
  "--remote-debugging-address=127.0.0.1"
  "--remote-debugging-port=${CHROME_CDP_PORT}"
  "--user-data-dir=${HOME}/.chrome"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-dev-shm-usage"
  "--disable-background-networking"
  "--disable-features=TranslateUI"
  "--disable-breakpad"
  "--disable-crash-reporter"
  "--metrics-recording-only"
  "--no-sandbox"
)

chromium "${CHROME_ARGS[@]}" about:blank &

for _ in $(seq 1 50); do
  if curl -sS --max-time 1 "http://127.0.0.1:${CHROME_CDP_PORT}/json/version" >/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "${EXPOSE_CDP}" != "1" ]]; then
  CDP_BIND_HOST="127.0.0.1"
else
  if ! is_loopback_host "${CDP_BIND_HOST}" && [[ "${ALLOW_INSECURE_CDP_LAN}" != "1" ]]; then
    echo "ERROR: refusing non-loopback CDP bind (${CDP_BIND_HOST}) without OPENCLAW_BROWSER_ALLOW_INSECURE_CDP_LAN=1."
    exit 1
  fi
  if ! is_loopback_host "${CDP_BIND_HOST}" && [[ -z "${CDP_TOKEN}" ]]; then
    echo "ERROR: OPENCLAW_BROWSER_CDP_TOKEN is required for non-loopback CDP exposure."
    exit 1
  fi
  echo "WARNING: exposing CDP on ${CDP_BIND_HOST}:${CDP_PORT}. Set OPENCLAW_BROWSER_EXPOSE_CDP=0 to keep loopback-only."
  if ! is_loopback_host "${CDP_BIND_HOST}"; then
    if ! command -v node >/dev/null 2>&1; then
      echo "ERROR: node is required to enforce auth for non-loopback CDP exposure."
      exit 1
    fi
    if [[ ! -f "${AUTH_PROXY_SCRIPT}" ]]; then
      echo "ERROR: missing auth proxy script (${AUTH_PROXY_SCRIPT})."
      exit 1
    fi
  fi
fi

if is_loopback_host "${CDP_BIND_HOST}"; then
  socat \
    TCP-LISTEN:"${CDP_PORT}",fork,reuseaddr,bind="${CDP_BIND_HOST}" \
    TCP:127.0.0.1:"${CHROME_CDP_PORT}" &
else
  OPENCLAW_BROWSER_AUTH_PROXY_BIND_HOST="${CDP_BIND_HOST}" \
    OPENCLAW_BROWSER_AUTH_PROXY_BIND_PORT="${CDP_PORT}" \
    OPENCLAW_BROWSER_AUTH_PROXY_UPSTREAM_HOST="127.0.0.1" \
    OPENCLAW_BROWSER_AUTH_PROXY_UPSTREAM_PORT="${CHROME_CDP_PORT}" \
    OPENCLAW_BROWSER_AUTH_PROXY_TOKEN="${CDP_TOKEN}" \
    node "${AUTH_PROXY_SCRIPT}" &
fi

if [[ "${ENABLE_NOVNC}" == "1" && "${HEADLESS}" != "1" ]]; then
  x11vnc -display :1 -rfbport "${VNC_PORT}" -shared -forever -nopw -localhost &
  if is_loopback_host "${NOVNC_BIND_HOST}"; then
    websockify --web /usr/share/novnc/ --host "${NOVNC_BIND_HOST}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
  else
    if [[ "${ALLOW_INSECURE_NOVNC_LAN}" != "1" ]]; then
      echo "ERROR: refusing non-loopback noVNC bind (${NOVNC_BIND_HOST}) without OPENCLAW_BROWSER_ALLOW_INSECURE_NOVNC_LAN=1."
      exit 1
    fi
    if [[ -z "${NOVNC_TOKEN}" ]]; then
      echo "ERROR: OPENCLAW_BROWSER_NOVNC_TOKEN is required for non-loopback noVNC exposure."
      exit 1
    fi
    if ! command -v node >/dev/null 2>&1; then
      echo "ERROR: node is required to enforce auth for non-loopback noVNC exposure."
      exit 1
    fi
    if [[ ! -f "${AUTH_PROXY_SCRIPT}" ]]; then
      echo "ERROR: missing auth proxy script (${AUTH_PROXY_SCRIPT})."
      exit 1
    fi

    if [[ "${NOVNC_PORT}" -ge 65535 ]]; then
      NOVNC_INTERNAL_PORT="$((NOVNC_PORT - 1))"
    else
      NOVNC_INTERNAL_PORT="$((NOVNC_PORT + 1))"
    fi
    websockify --web /usr/share/novnc/ --host 127.0.0.1 "${NOVNC_INTERNAL_PORT}" "localhost:${VNC_PORT}" &
    OPENCLAW_BROWSER_AUTH_PROXY_BIND_HOST="${NOVNC_BIND_HOST}" \
      OPENCLAW_BROWSER_AUTH_PROXY_BIND_PORT="${NOVNC_PORT}" \
      OPENCLAW_BROWSER_AUTH_PROXY_UPSTREAM_HOST="127.0.0.1" \
      OPENCLAW_BROWSER_AUTH_PROXY_UPSTREAM_PORT="${NOVNC_INTERNAL_PORT}" \
      OPENCLAW_BROWSER_AUTH_PROXY_TOKEN="${NOVNC_TOKEN}" \
      node "${AUTH_PROXY_SCRIPT}" &
  fi
fi

wait -n
