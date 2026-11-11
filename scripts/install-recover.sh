#!/bin/bash
# Instala (o reinstala) el envío automático desde el Mac de las grabaciones que el iPhone no
# logró subir. Corre scripts/recover.mjs cada 30 minutos con launchd.
#
# El script se COPIA a ~/.local/bin: launchd no logra ejecutar archivos guardados dentro de
# ~/Downloads. Por eso, después de editar scripts/recover.mjs hay que correr esto de nuevo:
#
#   npm run install-recover
#
set -euo pipefail

LABEL="com.bolsillo.recover"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node)"
SCRIPT="$HOME/.local/bin/bolsillo-recover.mjs"
CONFIG="$HOME/.config/bolsillo/env"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/bolsillo-recover.log"

mkdir -p "$HOME/.local/bin" "$HOME/.config/bolsillo" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cp "$REPO/scripts/recover.mjs" "$SCRIPT"
echo "script  -> $SCRIPT"

# Solo las dos variables que necesita, fuera del repo y legibles solo por el usuario.
umask 077
grep -E '^(PUBLIC_URL|BOLSILLO_SECRET)=' "$REPO/.env.local" > "$CONFIG"
chmod 600 "$CONFIG"
[ "$(wc -l < "$CONFIG" | tr -d ' ')" = 2 ] || { echo "Faltan PUBLIC_URL o BOLSILLO_SECRET en .env.local"; exit 1; }
echo "config  -> $CONFIG"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file=$CONFIG</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null
echo "plist   -> $PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "launchd -> cargado (cada 30 minutos y al iniciar sesión)"
echo
echo "Ver qué hizo:  tail -20 $LOG"
