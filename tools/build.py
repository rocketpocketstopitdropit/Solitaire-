#!/usr/bin/env python3
"""Assemble the game from src/ into:
  web/index.html     the installable web app (also bundled into the Android app)
  dist/artifact.html the same game as a page fragment for a Claude artifact
Run from the repository root: python3 tools/build.py
"""
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
game = (root / 'src' / 'game.html').read_text()
solver = (root / 'src' / 'solver.js').read_text()
assert '/*@SOLVER@*/' in game
game = game.replace('/*@SOLVER@*/', solver.strip())

(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'artifact.html').write_text(game)

split = game.index('<div class="app">')
head, body = game[:split], game[split:]
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="description" content="Klondike solitaire that tells you when you're out of useful moves, and whether the deal could have been won.">
<meta name="theme-color" content="#12301f">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Solitaire">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<style>
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
body{{margin:0;font:14px system-ui,sans-serif}}
[hidden]{{display:none!important}}
</style>
{head.strip()}
</head>
<body>
{body.strip()}
<script>
// Offline support for the installed web app (the Android app ships its files inside).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/[?&]app=1/.test(location.search)) {{
  navigator.serviceWorker.register('sw.js').catch(function () {{}});
}}
</script>
</body>
</html>
'''
(root / 'web' / 'index.html').write_text(page)
print('built web/index.html', len(page), 'bytes; dist/artifact.html', len(game), 'bytes')
