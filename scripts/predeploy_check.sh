#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

FILES=(index.html js/map.js css/style.css README.md)

if [[ ! -f index.html ]]; then
  echo "[ERRO] index.html não encontrado." >&2
  exit 1
fi

if ! head -n 1 index.html | grep -q '^<!DOCTYPE html>'; then
  echo "[ERRO] index.html não começa com <!DOCTYPE html>." >&2
  echo "       Isso pode indicar publicação de conteúdo inválido (ex.: trecho de diff)." >&2
  exit 1
fi

if rg -n '^(diff --git|@@ |\+\+\+ |--- )' "${FILES[@]}" >/tmp/predeploy_diff_markers.txt; then
  echo "[ERRO] Marcadores de diff encontrados em arquivos da aplicação:" >&2
  cat /tmp/predeploy_diff_markers.txt >&2
  exit 1
fi

echo "[OK] Predeploy check passou."
