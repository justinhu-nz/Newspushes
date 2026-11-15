"""Turn the logos in svgs/ into one-colour square notification glyphs.

Each glyph: square viewBox tightly fitted to the mark (small even margin),
every shape filled with currentColor, no backgrounds, gradients, text or
clip paths. Bounding boxes are measured by rendering with rsvg-convert and
trimming with ImageMagick.
"""
import re, subprocess, sys, os, tempfile

SRC = sys.argv[1]           # svgs/
OUT = os.path.join(SRC, 'glyphs')
os.makedirs(OUT, exist_ok=True)

def read(name):
    return open(os.path.join(SRC, name), encoding='utf-8').read()

def paths(svg):
    return re.findall(r'<path\b[^>]*?\bd="([^"]*)"', svg, re.S)

def measure(body, vb):
    """Render body inside viewBox vb, return its tight bbox in user units."""
    x, y, w, h = vb
    scale = 2000 / max(w, h)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w*scale:.0f}" height="{h*scale:.0f}">{body}</svg>'
    with tempfile.TemporaryDirectory() as t:
        s, p = os.path.join(t, 'a.svg'), os.path.join(t, 'a.png')
        open(s, 'w').write(svg)
        subprocess.run(['rsvg-convert', s, '-o', p], check=True)
        g = subprocess.run(['magick', p, '-alpha', 'extract', '-threshold', '1%', '-format', '%@', 'info:'],
                           capture_output=True, text=True, check=True).stdout
    gw, gh, gx, gy = map(int, re.match(r'(\d+)x(\d+)\+(\d+)\+(\d+)', g).groups())
    return x + gx / scale, y + gy / scale, gw / scale, gh / scale

def write(name, body, vb, margin=0.04, title='', square=True):
    bx, by, bw, bh = measure(body, vb)
    cx, cy = bx + bw / 2, by + bh / 2
    if square: bw = bh = max(bw, bh)
    w, h = bw * (1 + 2 * margin), bh + bw * 2 * margin
    v = f'{cx - w/2:.3f} {cy - h/2:.3f} {w:.3f} {h:.3f}'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{v}" width="{24*w/h:.1f}" height="24" fill="currentColor">'
           f'<title>{title}</title>{body}</svg>\n')
    open(os.path.join(OUT, name), 'w').write(svg)
    print(name, v)

# NZ Herald: the blackletter H; already one colour, just recoloured and cropped.
s = read('The_New_Zealand_Herald_logo.svg')
write('nz-herald.svg', ''.join(f'<path d="{d}"/>' for d in paths(s)), (173, 3313.977, 49.814, 62.255), title='NZ Herald')

# RNZ: the waves only. No red block, no "RNZ" letters.
s = read('rnz-logo-inverted-RGB-2025.svg')
waves = re.search(r'class="cls-1" d="([^"]*)"', s).group(1)
write('rnz.svg', f'<path fill-rule="evenodd" d="{waves}"/>', (0, 0, 210, 300), title='RNZ')

# The Spinoff: the disc with the S cut out of it (one compound path).
s = read('The_Spinoff_idSfLPbgAt_1.svg')
sd = paths(s)[0]
# The S sits under two translates: (3762, -909) then (-3892.202, 836.526).
# Its only absolute command is the first M, so shifting that moves it all.
m = re.match(r'M([\d.]+),([\d.]+)', sd)
sx, sy = float(m.group(1)) + 3762 - 3892.202, float(m.group(2)) - 909 + 836.526
sd = f'M{sx:.3f},{sy:.3f}' + sd[m.end():]
disc = 'M0,10a10,10 0 1,0 20,0a10,10 0 1,0 -20,0z'
write('the-spinoff.svg', f'<path fill-rule="evenodd" d="{disc}{sd}"/>', (-1, -1, 22, 22), margin=0.0, title='The Spinoff')

# Stuff: the outlined S from the wordmark (matches the app icon).
s = read('Stuff_2022.svg')
p = paths(s)
s_paths = [d for d in p if d.startswith(('M80.3,161.8', 'M134.1,115.5'))]
assert len(s_paths) == 2
write('stuff.svg', ''.join(f'<path d="{d}"/>' for d in s_paths), (0, 0, 792.5, 276.9), title='Stuff')

# 1News: the ringed "1" from the TVNZ 1 mark in its own colours, without
# the "tvnz" letters. Kept exactly as drawn: the red gradient swirls
# clipped to the ring, and the "1" (which uses currentColor, black by
# default). The ring's group transform is dropped and the crop works in
# its own coordinates, which is also the space its gradients use.
# Use as an <img>, not a CSS mask, or the colours are lost.
s = read('TVNZ_1_logo.svg')
defs = ''.join(re.findall(r'<linearGradient\b[^>]*/>|<linearGradient\b[^>]*[^/]>.*?</linearGradient>'
                          r'|<clipPath\b.*?</clipPath>', s, re.S))
group = re.search(r'<g transform="[^"]*">(.*?)</g>', s, re.S).group(1)
body = f'<defs>{defs}</defs>{group}'
for old in 'abcdef':   # unique ids so the glyph can be inlined beside others
    body = re.sub(rf'(id="|url\(#|xlink:href="#){old}([")])', rf'\g<1>n1{old}\g<2>', body)
body = body.replace('xlink:href=', 'href=')   # plain href: no xlink namespace needed
write('1news.svg', body, (250, 445, 75, 75), title='1News')

# TVNZ+: the "+" in its cyan-to-blue gradient (the full "tvnz+" is
# unreadable at 18px). Use as an <img>, not a CSS mask.
s = read('idJ5YLa7fW_1794652422998.svg')
grad = re.search(r'<linearGradient\b.*?</linearGradient>', s, re.S).group(0)
grad = grad.replace('paint0_linear_151_70348', 'tvnzplus')
plus = [d for d in paths(s) if d.startswith('M83.4477')][0]
write('tvnz-plus.svg', f'<defs>{grad}</defs><path fill="url(#tvnzplus)" d="{plus}"/>', (0, 0, 84, 23), title='TVNZ+')
# …and the whole wordmark too: "tvnz" in currentColor (it's white in the
# original, invisible on a white card), the "+" in its gradient.
tvnz = [d for d in paths(s) if not d.startswith('M83.4477')][0]
write('tvnz-plus-wordmark.svg',
      f'<defs>{grad}</defs><path d="{tvnz}"/><path fill="url(#tvnzplus)" d="{plus}"/>',
      (0, 0, 84, 23), title='TVNZ+', square=False)

# AT Mobile: the AT roundel without its white disc.
s = read('Auckland_Transport_id7wev8Fws_1.svg')
blue = [d for d in paths(s) if not d.startswith('M44,22')]
write('at-mobile.svg', ''.join(f'<path d="{d}"/>' for d in blue), (0, 0, 44, 44), margin=0.0, title='AT Mobile')

# The Spinoff, S only: for drawing inside a coloured circle (Lollipop
# style), where the disc version would be a circle inside a circle.
write('the-spinoff-s.svg', f'<path d="{sd}"/>', (-1, -1, 22, 22), title='The Spinoff')

# 1News, one colour: for drawing white inside a red circle (Lollipop
# style). Each swirl band is kept as its own shape, stacked in the logo's
# order, with a thin gap cut around each band where it crosses the ones
# beneath, so the swirl reads without colour. The "1" sits in the hole.
s = read('TVNZ_1_logo.svg')
ring = re.search(r'<clipPath id="c"><path d="([^"]*)"', s).group(1)
group = re.search(r'<g transform="[^"]*">(.*?)</g>', s, re.S).group(1)
one = re.search(r'<path d="(m284\.6[^"]*)"', group).group(1)
bands = re.findall(r'<path clip-path="url\(#c\)" d="([^"]*)"', group)
GAP = 2.6   # stroke width; half of it shows as the gap (≈2% of the logo)
stack = ''.join(f'<path d="{d}" fill="#fff" stroke="#000" stroke-width="{GAP}" paint-order="stroke"/>' for d in bands)
body = (f'<defs><clipPath id="n1ring"><path d="{ring}"/></clipPath>'
        f'<mask id="n1bands" maskUnits="userSpaceOnUse" x="250" y="445" width="75" height="75">'
        f'<g clip-path="url(#n1ring)">{stack}</g></mask></defs>'
        f'<rect x="250" y="445" width="75" height="75" mask="url(#n1bands)"/><path d="{one}"/>')
write('1news-mono.svg', body, (250, 445, 75, 75), title='1News')
