#!/usr/bin/env bash
set -e

echo "Probar endpoints principales..."
curl -I http://localhost:8080/api/health || true
curl -I http://localhost:8080/api/obras || true
curl -I http://localhost:8081/api/auctions || true
curl -I http://localhost:8081/api/history-global || true
