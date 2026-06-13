#!/usr/bin/env bash
set -euo pipefail

curl -fsS http://localhost:4050/health >/dev/null
curl -fsS "http://localhost:4050/vector?bbox=99,21,101.5,23" >/dev/null
curl -fsS "http://localhost:4050/raster/satellite/11/1024/768" >/dev/null
curl -fsS "http://localhost:4050/raster/dem/11/1024/768" >/dev/null

echo "smoke-ok"
