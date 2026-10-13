#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_DIR/manage.py" "$@"
else
  printf '%s\n' 'Instala Python 3.12+ antes de ejecutar este script.' >&2
  exit 1
fi
