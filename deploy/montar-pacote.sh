#!/usr/bin/env bash
# Monta uma pasta de deploy no layout de raiz que o builder da Discloud usa
# de fato: ele roda "npm run build" em /home/node com o package.json da
# RAIZ e ignora o BUILD/START do discloud.config (ver
# deploy/discloud-r3/LEIA-ME.md). Enviar a raiz do repositorio (com a
# subpasta gts-operations-center/) faz o codigo cair numa subpasta que
# nunca e compilada.
#
# Uso: deploy/montar-pacote.sh <commit> <pasta-saida> [pasta-config]
#   pasta-config: arquivos de raiz (start.js, deploy-build.js,
#   next.config.js, tsconfig.json, package.json). Padrao: deploy/discloud-r3
#
# Nao inclui node_modules, dist, .next, .env, public/uploads nem sessoes do
# WhatsApp - o commit da Discloud sobrepoe arquivos e preserva o que nao vem
# no pacote.
set -euo pipefail

COMMIT="${1:?informe o commit}"
SAIDA="${2:?informe a pasta de saida}"
RAIZ="$(git rev-parse --show-toplevel)"
CONFIG="${3:-$RAIZ/deploy/discloud-r3}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$RAIZ" archive "$COMMIT" gts-operations-center | tar -x -C "$TMP"
APP="$TMP/gts-operations-center"

rm -rf "$SAIDA"
mkdir -p "$SAIDA"
cp -r "$APP/src" "$APP/prisma" "$APP/public" "$SAIDA/"
cp "$APP/postcss.config.js" "$APP/tailwind.config.ts" "$SAIDA/"
for f in start.js deploy-build.js next.config.js tsconfig.json package.json; do
  # LF como no repositorio: o checkout no Windows (autocrlf) entrega CRLF.
  tr -d '\r' < "$CONFIG/$f" > "$SAIDA/$f"
done
# Lockfile da versao (a partir da 1.0.10): fixa as dependencias instaladas
# pelo "npm install" do builder e substitui o lock antigo do servidor.
if [ -f "$CONFIG/package-lock.json" ]; then
  tr -d '\r' < "$CONFIG/package-lock.json" > "$SAIDA/package-lock.json"
fi

# Garantia extra: nada de artefato local ou dado de runtime no pacote.
rm -rf "$SAIDA/public/uploads" "$SAIDA/node_modules" "$SAIDA/dist" "$SAIDA/.next"

echo "Pacote montado em $SAIDA a partir de $COMMIT (config: $CONFIG)"
