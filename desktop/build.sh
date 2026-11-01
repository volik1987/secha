#!/bin/sh
# Сборка настольной версии: копия игры в app/, затем установщики в dist/
cd "$(dirname "$0")" && rm -rf app && mkdir app && cp -R ../index.html ../js ../img app/
npx electron-builder --mac --win "$@"
