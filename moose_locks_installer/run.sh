#!/bin/bash
# Moose Locks installer app (Brandon 2026-11-11: "id like our system to do it for us automatically in the hub").
# Replaces the Terminal steps: download our software, restart Home Assistant, add the Moose Locks integration.
say(){ echo "[Moose] $*"; }
API=http://supervisor
H="Authorization: Bearer ${SUPERVISOR_TOKEN}"
D=/homeassistant
[ -d "$D" ] || D=/config
say "Downloading Moose Locks..."
cd /tmp && rm -f ml.zip
if ! curl -fsSL -o ml.zip https://crew.moosemanagement.com/moose_locks.zip; then say "!! Download failed. Check the hub's internet cable, then tap Start again."; exit 1; fi
mkdir -p "$D/custom_components"
unzip -oq ml.zip -d "$D" || { say "!! Could not unpack it. Call Brandon."; exit 1; }
[ -f "$D/custom_components/moose_locks/manifest.json" ] || { say "!! Moose Locks files not found after install. Call Brandon."; exit 1; }
say "Installed $(jq -r .version "$D/custom_components/moose_locks/manifest.json" 2>/dev/null)."
say "Restarting Home Assistant (about 1 minute)..."
curl -fsS -X POST -H "$H" "$API/core/restart" >/dev/null || say "(restart call did not answer; waiting anyway)"
sleep 20
ok=""
for i in $(seq 1 60); do
  if curl -fsS -H "$H" "$API/core/api/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
[ -n "$ok" ] || { say "!! Home Assistant didn't come back. Wait a minute, then tap Add Moose Locks on the Hub setup page."; exit 1; }
sleep 10
say "Adding Moose Locks..."
R=$(curl -sS -X POST -H "$H" -H "Content-Type: application/json" -d '{"handler":"moose_locks","show_advanced_options":false}' "$API/core/api/config/config_entries/flow")
T=$(echo "$R" | jq -r '.type // empty' 2>/dev/null)
if [ "$T" = "form" ]; then
  F=$(echo "$R" | jq -r .flow_id)
  R=$(curl -sS -X POST -H "$H" -H "Content-Type: application/json" -d '{}' "$API/core/api/config/config_entries/flow/$F")
  T=$(echo "$R" | jq -r '.type // empty' 2>/dev/null)
fi
if [ "$T" = "create_entry" ]; then say "DONE. Moose Locks is added. Go back to the Hub setup page: the hub shows up in step 8 within a minute.";
elif [ "$T" = "abort" ]; then say "DONE. Moose Locks was already added on this hub ($(echo "$R" | jq -r .reason)). Go back to the Hub setup page.";
else say "!! Couldn't add Moose Locks by itself (answer: $(echo "$R" | head -c 300)). Tap Add Moose Locks on the Hub setup page instead."; exit 1; fi