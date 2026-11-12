#!/bin/sh
# Moose Locks installer for a Home Assistant hub. Run in the hub's Terminal:
#   curl -fsSL crew.moosemanagement.com/hub.sh|bash
# (Brandon 2026-11-11: one short line instead of a long paste the Terminal kept cutting.)
set -e
echo "== Moose Locks: installing =="
D=/config
[ -d /homeassistant ] && D=/homeassistant
cd /tmp
rm -f ml.zip
curl -fsSL -o ml.zip https://crew.moosemanagement.com/moose_locks.zip || wget -qO ml.zip https://crew.moosemanagement.com/moose_locks.zip
mkdir -p "$D/custom_components"
unzip -oq ml.zip -d "$D"
if [ ! -f "$D/custom_components/moose_locks/manifest.json" ]; then
  echo "!! Something went wrong: Moose Locks files not found. Call Brandon."; exit 1
fi
V=$(grep -o '"version"[^,]*' "$D/custom_components/moose_locks/manifest.json" | head -1)
echo "== Moose Locks installed ($V) =="
echo "== Restarting Home Assistant. This page will drop out for about a minute. =="
echo "== Then go back to the Hub setup page and do step 7 (Add Moose Locks). =="
ha core restart
