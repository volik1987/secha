import http.server,time,sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        time.sleep(float(s.path.strip('/') or 10));s.send_response(200);s.send_header('Content-Type','image/gif');s.end_headers();s.wfile.write(b'GIF89a')
    def log_message(s,*a):pass
http.server.ThreadingHTTPServer(('127.0.0.1',8799),H).serve_forever()
