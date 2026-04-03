#!/usr/bin/env python3
"""WorldTime local HTTP server – run at startup via LaunchAgent"""
import os, http.server, socketserver

PORT = 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({'.html': 'text/html; charset=utf-8'})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
