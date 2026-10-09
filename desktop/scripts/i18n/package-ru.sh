#!/bin/bash
# Подписывает собранный Buzz.app постоянным самоподписанным сертификатом
# Pride-Automatics и упаковывает в zip для раздачи сотрудникам.
#
# Зачем постоянная подпись: связка ключей macOS запоминает «Разрешать всегда»
# по сертификату. С ad-hoc подписью пароль спрашивался бы после каждой
# пересборки; с одним и тем же сертификатом — только при первой установке.
#
#   scripts/i18n/package-ru.sh  →  ~/Downloads/Buzz-RU-<версия>.zip
set -euo pipefail
cd "$(dirname "$0")/../.."
source ~/.buzz/keystores/codesign.env
APP=../target/release/bundle/macos/Buzz.app
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")

security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
# Сначала вложенные бинарники, потом сам бандл (с entitlements приложения).
for bin in "$APP"/Contents/MacOS/*; do
  [[ "$(basename "$bin")" == buzz-desktop ]] && continue
  codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" "$bin"
done
codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" \
  --entitlements src-tauri/Entitlements.plist "$APP"
codesign --verify --deep --strict "$APP"

OUT="$HOME/Downloads/Buzz-RU-$VERSION.zip"
rm -f "$OUT"
ditto -c -k --keepParent "$APP" "$OUT"
echo "$OUT"
