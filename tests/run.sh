#!/bin/sh
# run.sh <тест.js> [бюджет мс] — копия игры, вставка теста, вывод <pre id="out">
T=$(cd "$(dirname "$0")" && pwd);G=$(dirname "$T");W=${TMPDIR:-/tmp}/secha-test
mkdir -p $W && rsync -a --delete --exclude .git --exclude raw --exclude tests "$G/" "$W/"
python3 -c "import sys;s=open('$W/index.html').read();open('$W/t.html','w').write(s.replace('</body>','<script>'+open('$1').read()+'</script></body>'))"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir=$W/profile --window-size=1440,900 --virtual-time-budget=${2:-30000} --dump-dom file://$W/t.html 2>/dev/null | python3 -c "import sys,re,html;m=re.search(r'<pre id=\"out\"[^>]*>(.*?)</pre>',sys.stdin.read(),re.S);print(html.unescape(m.group(1)) if m else 'NO OUTPUT')"
rm -rf $W/profile
