#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
CONFIG_FILE="${ROOT_DIR}/ngrok.yml"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ "${NGROK_ENABLED:-false}" != "true" ]]; then
  echo "NGROK_ENABLED is not true. Skipping ngrok startup."
  exit 0
fi

if [[ -z "${NGROK_AUTHTOKEN:-}" ]]; then
  echo "NGROK_AUTHTOKEN is required when NGROK_ENABLED=true."
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok CLI is not installed or not in PATH."
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  if [[ -f "${ROOT_DIR}/ngrok.example.yml" ]]; then
    cp "${ROOT_DIR}/ngrok.example.yml" "${CONFIG_FILE}"
    echo "Created ${CONFIG_FILE} from ngrok.example.yml."
  else
    echo "Missing ${CONFIG_FILE} and ngrok.example.yml."
    exit 1
  fi
fi

ngrok config add-authtoken "${NGROK_AUTHTOKEN}"
ngrok start patchloom-api --config "${CONFIG_FILE}"
