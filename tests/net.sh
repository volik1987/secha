#!/bin/sh
# Сетевой тест в headless Chrome: http-сервер на 8802, «медленная» картинка держит загрузку страницы
T=$(cd "$(dirname "$0")" && pwd);G=$(dirname "$T");W=${TMPDIR:-/tmp}/secha-net
mkdir -p $W && rsync -a --delete --exclude .git --exclude raw "$G/" "$W/site/"
(cd $W/site && exec python3 -m http.server 8802 >/dev/null 2>&1) & S1=$!
python3 "$T/slow.py" & S2=$!
sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --disable-features=WebRtcHideLocalIpsWithMdns --autoplay-policy=no-user-gesture-required --user-data-dir=$W/profile --window-size=1400,900 --dump-dom http://localhost:8802/tests/netgame.html 2>/dev/null | python3 -c "import sys,re,html;m=re.search(r'<pre id=\"out\"[^>]*>(.*?)</pre>',sys.stdin.read(),re.S);print(html.unescape(m.group(1)) if m else 'NO OUTPUT')"
kill $S1 $S2; rm -rf $W/profile
