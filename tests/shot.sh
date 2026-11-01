#!/bin/sh
# shot.sh <сценарий.js> <out.png> [ширина высота] — снимок игры в headless Chrome со вставленным сценарием
T=$(cd "$(dirname "$0")" && pwd);G=$(dirname "$T");W=${TMPDIR:-/tmp}/secha-shot
mkdir -p $W && rsync -a --delete --exclude .git --exclude raw --exclude tests "$G/" "$W/"
python3 -c "import sys;s=open('$W/index.html').read();open('$W/t.html','w').write(s.replace('</body>','<script>'+open('$1').read()+'</script></body>'))"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir=$W/profile --hide-scrollbars --window-size=${3:-1440},${4:-900} --virtual-time-budget=${5:-20000} --screenshot="$2" file://$W/t.html 2>/dev/null
rm -rf $W/profile
