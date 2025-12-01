#!/usr/bin/env bash
# Script opcional para simular configuración y actividad básica

set -e

BASE_M=http://localhost:8080
BASE_P=http://localhost:8081

ORDER_JSON='["mona-lisa","dance-class","absenta","woman-in-hat","woman-red-hair","dora-maar","self-portrait"]'
PRECIO='{"mona-lisa":200000000,"dance-class":10000000,"absenta":19000000,"woman-in-hat":67000000,"woman-red-hair":120000000,"dora-maar":90000000,"self-portrait":100000000}'
INCR='{"mona-lisa":100000,"dance-class":100000,"absenta":80000,"woman-in-hat":120000,"woman-red-hair":150000,"dora-maar":110000,"self-portrait":95000}'
DUR='{"mona-lisa":60,"dance-class":75,"absenta":70,"woman-in-hat":90,"woman-red-hair":85,"dora-maar":80,"self-portrait":100}'

echo "Enviando configuración de ejemplo al manejador..."
curl -X POST "$BASE_M/api/config" \
  -H "Content-Type: application/json" \
  -d "{\"orden\":$ORDER_JSON,\"precioBase\":$PRECIO,\"incrementoMinimo\":$INCR,\"duracion\":$DUR}" || true

echo "Registrando postores de prueba..."
curl -X POST "$BASE_P/api/auctions/mona-lisa/register" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Usuario Demo","email":"demo@example.com"}' || true

echo "Enviando puja de prueba..."
curl -X POST "$BASE_P/api/auctions/mona-lisa/bid" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Usuario Demo","monto":200100000}' || true

echo "Seed básico completado."
