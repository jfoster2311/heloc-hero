"""Contrast audit for lib/theme.ts. Run: python3 scripts/contrast-audit.py

Checks every foreground/background token pairing the app actually uses, in BOTH
palettes, against WCAG AA — 4.5:1 for normal text, 3:1 for large text and for UI
boundaries that identify a control.

Exits non-zero if a pairing regresses, so it can gate a commit. The seven
expected failures are card borders, row dividers and the switch track: all
decorative, and exempt from 1.4.11 because a card is identified by its fill and
shadow rather than its edge.
"""
import re, sys, os

# Parses lib/theme.ts directly rather than importing it — theme.ts pulls in
# react-native's StyleSheet, which will not load outside the RN runtime.
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, '..', 'lib', 'theme.ts')).read()

def block(start_pat):
    i = re.search(start_pat, src).end()
    d = 0
    j = src.index('{', i - 1)
    k = j
    while True:
        if src[k] == '{': d += 1
        elif src[k] == '}':
            d -= 1
            if d == 0: break
        k += 1
    return src[j:k]

def strip_comments(b):
    """Drop // and /* */ comments before parsing.

    Not cosmetic: theme.ts documents its own history inline, and several notes
    quote a superseded hex in prose — "for the same reason: '#6B7280' measured
    4.40:1". The token regex below matched `reason: '#6B7280'` out of that
    sentence and invented a palette entry from a comment. Harmless while the
    audit only measured named pairings, and actively misleading once it started
    sweeping every token in the block.
    """
    b = re.sub(r'/\*.*?\*/', '', b, flags=re.S)
    return re.sub(r'//[^\n]*', '', b)

def parse(b):
    return {m.group(1): m.group(2) for m in
            re.finditer(r"(\w+):\s*'(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))'", strip_comments(b))}

LIGHT = parse(block(r'export const Colors ='))
DARK  = parse(block(r'export const DarkColors: typeof Colors ='))
ONDARK = parse(block(r'export const OnDark ='))
AURORA = ['#081A0F', '#0C2A18', '#0F3D22']

def rgb(c):
    c = c.strip()
    if c.startswith('#'):
        c = c[1:]
        if len(c) == 3: c = ''.join(ch*2 for ch in c)
        return (int(c[0:2],16), int(c[2:4],16), int(c[4:6],16), 1.0)
    m = re.match(r'rgba?\(([^)]*)\)', c)
    p = [x.strip() for x in m.group(1).split(',')]
    a = float(p[3]) if len(p) > 3 else 1.0
    return (int(p[0]), int(p[1]), int(p[2]), a)

def over(fg, bg):
    """Composite a translucent fg over bg."""
    fr,fg_,fb,fa = rgb(fg); br,bg_,bb,_ = rgb(bg)
    return (round(fr*fa + br*(1-fa)), round(fg_*fa + bg_*(1-fa)), round(fb*fa + bb*(1-fa)), 1.0)

def lum(t):
    def ch(v):
        v = v/255
        return v/12.92 if v <= 0.03928 else ((v+0.055)/1.055)**2.4
    return 0.2126*ch(t[0]) + 0.7152*ch(t[1]) + 0.0722*ch(t[2])

def ratio(fg, bg):
    f = over(fg, bg) if rgb(fg)[3] < 1 else rgb(fg)
    b = rgb(bg)
    l1, l2 = lum(f), lum(b)
    if l1 < l2: l1, l2 = l2, l1
    return (l1+0.05)/(l2+0.05)

# (fg token, bg token, need, what it is)
PAIRS = [
  ('textPrimary','background',4.5,'body text on the page'),
  ('textSecondary','background',4.5,'secondary text on the page'),
  ('textMuted','background',4.5,'muted label on the page'),
  ('textPrimary','surface',4.5,'body text on a card'),
  ('textSecondary','surface',4.5,'secondary text on a card'),
  ('textMuted','surface',4.5,'muted label / eyebrow on a card'),
  ('gray500','surface',4.5,'negative numbers on a card'),
  ('gray500','background',4.5,'negative numbers on the page'),
  ('accentInk','surface',4.5,'accent text / link on a card'),
  ('mint700','surface',4.5,'accent ink on a card'),
  ('accentInk','background',4.5,'accent text on the page'),
  ('mint700','mint50',4.5,'accent ink on a mint tint (chips, rule card)'),
  ('textSecondary','mint50',4.5,'body text on a mint tint'),
  ('textPrimary','gray50',4.5,'input text on a sunken field'),
  ('textMuted','gray50',4.5,'placeholder in a field'),
  ('onAccent','mint600',3.0,'label on the primary CTA (16pt bold)'),
  ('white','mint800',3.0,'label on a filled pill (14pt semibold)'),
  ('accentInk','mint50',4.5,'accent ink on a mint tint'),
  ('border','surface',3.0,'field + card border (UI component)'),
  ('borderSubtle','surface',3.0,'card divider (UI component)'),
  ('border','background',3.0,'border against the page'),
  ('error','surface',4.5,'error message on a card'),
  ('error','background',4.5,'error message on the page'),
  ('borderField','surface',3.0,'INPUT boundary (UI component)'),
  ('borderField','gray50',3.0,'INPUT boundary on a sunken fill'),
  ('mint400','surface',3.0,'secondary mark / switch track'),
  # ── Machined Silver ──────────────────────────────────────────────────────
  # Absent until 2026-08-11, which is part of why that family shipped a hue
  # bug for five days: nothing here looked at it. Every ink against every one
  # of the three faces, since a token measured on one surface is not measured
  # on another.
  ('textPrimary','machinedCanvas',4.5,'body text on the machined canvas'),
  ('textSecondary','machinedCanvas',4.5,'secondary text on the machined canvas'),
  ('textMuted','machinedCanvas',4.5,'muted label on the machined canvas'),
  ('accentInk','machinedCanvas',4.5,'accent text on the machined canvas'),
  ('textPrimary','machinedNear',4.5,'body text on a machined card'),
  ('textSecondary','machinedNear',4.5,'secondary text on a machined card'),
  ('textMuted','machinedNear',4.5,'muted label on a machined card'),
  ('accentInk','machinedNear',4.5,'accent text on a machined card'),
  ('textPrimary','machinedFar',4.5,'body text on the machined far stop'),
  ('textSecondary','machinedFar',4.5,'secondary text on the machined far stop'),
  # The tightest pairing in the app. Treat as a floor: machinedFar cannot be
  # darkened without breaking it, which is also why the machined family has no
  # room to re-separate itself from the paper card by lightness.
  ('textMuted','machinedFar',4.5,'muted label on the machined far stop [TIGHTEST]'),
  ('accentInk','machinedFar',4.5,'accent text on the machined far stop'),
  ('sentinel','machinedNear',3.0,'sentinel dot on a machined card (UI indicator)'),
  ('sentinel','machinedFar',3.0,'sentinel dot on the machined far stop'),
]

# ── Hue coherence ───────────────────────────────────────────────────────────
# Contrast alone would never have caught the defect this section exists for.
#
# The light Machined Silver family shipped as a generic slate recipe at hue
# 256-264 degrees while every other surface in the app sits at 153-164, so four
# of five tabs drew blue-grey cards on a green page. Every ratio passed. It was
# a colour bug, not a contrast bug, and the audit was blind to it.
#
# CLAUDE.md's palette is monochrome green: gray400/gray500 are the only tokens
# allowed to be neutral, and Semantic depends on their neutrality. So any token
# with real chroma has to sit on the brand hue. Near-neutral tokens are exempt
# because hue angle is meaningless at low chroma (and numerically unstable --
# an 8-bit near-white can land anywhere on the wheel).
BRAND_HUE = (140.0, 185.0)   # the app's green band, with margin
CHROMA_FLOOR = 2.0           # below this a token is neutral; hue is not meaningful
HUE_EXEMPT = {
    'gray400', 'gray500',    # the two deliberate neutrals -- see lib/theme.ts
    # Both are literally gray500's value. CLAUDE.md bans red outright, so a
    # warning and an error resolve to the neutral and carry severity by label
    # and icon instead. Exempt for exactly the reason gray500 is.
    'warning', 'error',
    'sentinel',              # the one recorded blue exception, gated by isAdministrative
    'white',
}

def _lab(c):
    r, g, b, _ = rgb(c)
    def f(v):
        v = v/255
        return v/12.92 if v <= 0.04045 else ((v+0.055)/1.055)**2.4
    r, g, b = f(r), f(g), f(b)
    X = (r*0.4124 + g*0.3576 + b*0.1805)/0.95047
    Y =  r*0.2126 + g*0.7152 + b*0.0722
    Z = (r*0.0193 + g*0.1192 + b*0.9505)/1.08883
    def q(t): return t**(1/3) if t > 0.008856 else (7.787*t + 16/116)
    fx, fy, fz = q(X), q(Y), q(Z)
    return (116*fy - 16, 500*(fx - fy), 200*(fy - fz))

def hue_chroma(c):
    import math
    _, a, b = _lab(c)
    h = math.degrees(math.atan2(b, a))
    return (h + 360 if h < 0 else h), math.hypot(a, b)

def audit_hue(name, pal):
    print("\n" + "="*78)
    print(name + " — HUE COHERENCE (monochrome green policy)")
    print("="*78)
    bad = []
    for tok, val in sorted(pal.items()):
        if tok in HUE_EXEMPT or not val.startswith('#'):
            continue
        h, c = hue_chroma(val)
        if c < CHROMA_FLOOR:
            continue
        if not (BRAND_HUE[0] <= h <= BRAND_HUE[1]):
            bad.append((tok, val, h, c))
            print("  FAIL  %-16s %s  hue %6.1f  chroma %5.2f  <-- off-brand" % (tok, val, h, c))
    if not bad:
        print("  PASS  every chromatic token sits in the brand band "
              "(%.0f-%.0f deg)" % BRAND_HUE)
    return bad

def audit(name, pal):
    print("\n" + "="*78)
    print(name)
    print("="*78)
    fails = []
    for fg, bg, need, what in PAIRS:
        if fg not in pal or bg not in pal:
            print("  ?  missing token:", fg, bg); continue
        r = ratio(pal[fg], pal[bg])
        ok = r >= need
        tag = "PASS" if ok else "FAIL"
        if not ok: fails.append((fg,bg,r,need,what))
        print("  %-4s %5.2f:1  (need %.1f)  %-14s on %-14s  %s" % (tag, r, need, fg, bg, what))
    return fails

f1 = audit("LIGHT", LIGHT)
f2 = audit("DARK", DARK)

print("\n" + "="*78)
print("ON THE AURORA (fixed dark greens, both themes)")
print("="*78)
f3 = []
for tok in ['primary','secondary','muted','faint','accent']:
    need = 4.5 if tok in ('primary','secondary','muted') else 3.0
    worst = min(AURORA, key=lambda b: ratio(ONDARK[tok], b))
    r = ratio(ONDARK[tok], worst)
    ok = r >= need
    if not ok: f3.append(('OnDark.'+tok, worst, r, need, 'text on the aurora'))
    print("  %-4s %5.2f:1  (need %.1f)  OnDark.%-10s on %s (worst of 3)" %
          ("PASS" if ok else "FAIL", r, need, tok, worst))
for tok in ['hairline','fillStrong']:
    worst = min(AURORA, key=lambda b: ratio(ONDARK[tok], b))
    r = ratio(ONDARK[tok], worst)
    print("  %-4s %5.2f:1  (need 3.0)  OnDark.%-10s on %s  [UI edge]" %
          ("PASS" if r>=3 else "FAIL", r, tok, worst))

print("\n" + "="*78)
print("SUMMARY OF FAILURES")
print("="*78)
for label, fails in (("LIGHT", f1), ("DARK", f2), ("AURORA", f3)):
    for fg,bg,r,need,what in fails:
        print("  %-7s %-15s on %-14s %5.2f:1  need %.1f   %s" % (label,fg,bg,r,need,what))
print("  total failures:", len(f1)+len(f2)+len(f3))

h1 = audit_hue("LIGHT", LIGHT)
h2 = audit_hue("DARK", DARK)

EXPECTED = 7  # decorative borders/dividers/switch track — see the module docstring
total = len(f1) + len(f2) + len(f3)
rc = 0
if total > EXPECTED:
    print("\n  REGRESSION: %d contrast failures, expected %d" % (total, EXPECTED))
    rc = 1
else:
    print("\n  OK — %d known-decorative failures, no text pairing below AA." % total)

if h1 or h2:
    print("  REGRESSION: %d off-brand token(s). The palette is monochrome green;\n"
          "  add to HUE_EXEMPT only with a recorded reason, as `sentinel` has."
          % (len(h1) + len(h2)))
    rc = 1
else:
    print("  OK — no off-brand hues.")
sys.exit(rc)
