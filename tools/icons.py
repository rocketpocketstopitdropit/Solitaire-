#!/usr/bin/env python3
"""Draw the app icons (web/icon-*.png): a fanned pair of cards on green felt."""
import math, pathlib, re
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = pathlib.Path(__file__).resolve().parent.parent
FELT, FELT_DEEP = (35, 84, 65), (18, 48, 31)
CARD, EDGE, BACK, BRASS, INK = (251, 248, 241), (216, 208, 191), (123, 36, 49), (216, 180, 106), (28, 32, 38)
# Spade outline (Material Design Icons "cards-spade", Apache 2.0) on a 24x24 grid.
SPADE = "M12,2C9,7 4,9 4,14C4,16 6,18 8,18C9,18 10,18 11,17C11,17 11.32,19 9,22H15C13,19 13,17 13,17C14,18 15,18 16,18C18,18 20,16 20,14C20,9 15,7 12,2Z"

def spade_points(cx, cy, size):
    toks = re.findall(r'[MCHZ]|-?\d+\.?\d*', SPADE)
    pts, i, cur, cmd = [], 0, (0, 0), None
    while i < len(toks):
        t = toks[i]
        if t in 'MCHZ': cmd = t; i += 1
        if cmd == 'M':
            cur = (float(toks[i]), float(toks[i + 1])); pts.append(cur); i += 2
        elif cmd == 'C':
            p1 = (float(toks[i]), float(toks[i + 1])); p2 = (float(toks[i + 2]), float(toks[i + 3])); p3 = (float(toks[i + 4]), float(toks[i + 5]))
            for k in range(1, 25):
                u = k / 24
                x = (1-u)**3*cur[0] + 3*(1-u)**2*u*p1[0] + 3*(1-u)*u*u*p2[0] + u**3*p3[0]
                y = (1-u)**3*cur[1] + 3*(1-u)**2*u*p1[1] + 3*(1-u)*u*u*p2[1] + u**3*p3[1]
                pts.append((x, y))
            cur = p3; i += 6
        elif cmd == 'H':
            cur = (float(toks[i]), cur[1]); pts.append(cur); i += 1
        elif cmd == 'Z':
            continue
    s = size / 24
    return [(cx + (x - 12) * s, cy + (y - 12) * s) for x, y in pts]

def card_layer(S, w, h, angle, face):
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0 = (S - w) / 2, (S - h) / 2
    r = w * 0.1
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], r, fill=CARD, outline=EDGE, width=max(1, int(S * 0.004)))
    if face:
        d.polygon(spade_points(S / 2, S / 2 + h * 0.06, w * 0.62), fill=INK)
        try:
            f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', int(w * 0.3))
            d.text((x0 + w * 0.1, y0 + w * 0.05), 'A', font=f, fill=INK)
        except OSError:
            pass
    else:
        inset = w * 0.07
        d.rounded_rectangle([x0 + inset, y0 + inset, x0 + w - inset, y0 + h - inset], r * 0.6, fill=BACK)
        step = max(3, int(w * 0.07))
        hatch = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(hatch)
        for k in range(-int(h), int(w + h), step):
            hd.line([(x0 + k, y0), (x0 + k + h, y0 + h)], fill=BRASS + (90,), width=max(1, int(S * 0.003)))
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([x0 + inset, y0 + inset, x0 + w - inset, y0 + h - inset], r * 0.6, fill=255)
        layer.paste(hatch, (0, 0), Image.composite(hatch.split()[3], Image.new('L', (S, S), 0), mask))
        d.rounded_rectangle([x0, y0, x0 + w, y0 + h], r, outline=CARD, width=int(inset))
    return layer.rotate(angle, resample=Image.BICUBIC, center=(S / 2, S / 2))

def icon(S, scale=1.0):
    img = Image.new('RGBA', (S, S), FELT_DEEP)
    glow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(glow).ellipse([-S * 0.2, -S * 0.25, S * 1.2, S * 1.05], fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.18))
    img.paste(Image.new('RGBA', (S, S), FELT), (0, 0), glow)
    w, h = S * 0.36 * scale, S * 0.504 * scale
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for lay in (card_layer(S, w, h, 14, False), card_layer(S, w, h, -8, True)):
        a = lay.split()[3].filter(ImageFilter.GaussianBlur(S * 0.02))
        sh = Image.new('RGBA', (S, S), (0, 0, 0, 110)); sh.putalpha(a.point(lambda v: v * 0.45))
        img.alpha_composite(sh, (int(S * 0.01), int(S * 0.025)))
        img.alpha_composite(lay, (int(S * 0.02) if lay is not None else 0, 0))
    return img.convert('RGB')

out = root / 'web'
for size in (180, 192, 512):
    icon(size).save(out / f'icon-{size}.png', optimize=True)
icon(512, scale=0.82).save(out / 'icon-maskable-512.png', optimize=True)
print('icons written')
