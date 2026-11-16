"""Generates the How-to-play overlay (HTML + inline SVG diagrams) for index.html."""
import math, sys

BLUE, GOLD, ORANGE, TEAL, CREAM, MUTED, LINE = '#5cb8f0', '#f2b544', '#ff8a2a', '#2fd3c4', '#f1ead9', '#8d8a82', '#2a2a31'
BLOCK = '#ff5d73'
COURT, FREE = '#2a74d6', '#114058'

def svg(w, h, body, label):
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{label}" class="ht-svg">{body}</svg>'

def text(x, y, s, fill=CREAM, size=13, anchor='middle', weight=700, cls=''):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" class="{cls}">{s}</text>'

# ---------------- 1. keyboard ----------------
def keyboard():
    AIM = '#b48cff'
    out = []
    hl = {'W': BLUE, 'A': BLUE, 'S': BLUE, 'D': BLUE, 'J': GOLD, 'K': ORANGE, 'L': BLOCK, 'F': '#c9a35a', 'H': '#9aa3b2', 'N': '#9aa3b2'}
    rows = [('QWERTYUIOP', 40, 20), ('ASDFGHJKL', 55, 72), ('ZXCVBNM', 120, 124)]
    for keys, x0, y in rows:
        for i, k in enumerate(keys):
            x = x0 + i * 50
            col = hl.get(k)
            out.append(f'<rect x="{x}" y="{y}" width="44" height="44" rx="4" fill="{col or "#1b1b20"}" stroke="{LINE}"/>')
            out.append(text(x + 22, y + 29, k, '#0d0d10' if col else '#55555c', 17, weight=800))
    out.append(f'<rect x="20" y="124" width="94" height="44" rx="4" fill="#1b1b20" stroke="{LINE}"/>' + text(67, 153, 'SHIFT', '#55555c', 15, weight=800))   # no dash
    out.append(f'<rect x="170" y="176" width="270" height="40" rx="4" fill="{TEAL}"/>' + text(305, 202, 'SPACE', '#0d0d10', 15, weight=800))
    # arrow cluster
    for (x, y, g) in [(625, 124, '▲'), (575, 176, '◀'), (625, 176, '▼'), (675, 176, '▶')]:
        out.append(f'<rect x="{x}" y="{y}" width="44" height="40" rx="4" fill="{AIM}"/>' + text(x + 22, y + 27, g, '#0d0d10', 16, weight=800))
    out.append(text(647, 112, 'AIM', AIM, 13, weight=800))
    leg = [
        (BLUE, 'W A S D', 'move (never aims)'),
        (AIM, '◀ ▶', 'move your aim dot left / right'),
        (AIM, '▲ ▼', 'move it deeper / shorter (combos = diagonal)'),
        (BLOCK, 'L', 'block at the net — press as their attack crosses over you'),
        (TEAL, 'SPACE', 'jump — for spikes and blocks'),
        (GOLD, 'J', 'TAP on green to set / control'),
        (ORANGE, 'K', 'TAP on green to kick · in the air = clear / smash / spike'),
        ('#c9a35a', 'F', 'practice: ball machine feed'),
        ('#9aa3b2', 'H · N', 'help · sound'),
    ]
    for i, (c, k, d) in enumerate(leg):
        y = 26 + i * 23
        out.append(f'<rect x="760" y="{y - 12}" width="13" height="13" rx="2" fill="{c}"/>')
        out.append(text(781, y - 1, k, CREAM, 13, 'start', 800))
        out.append(text(860, y - 1, d, MUTED, 12, 'start', 600))
    return svg(1180, 228, ''.join(out), 'Keyboard controls')

# ---------------- 2. court ----------------
def court():
    S = 25  # px per metre
    W, H = 21.4 * S + 40, 13.0 * S + 70
    ox, oz = W / 2, 30 + 6.5 * S
    X = lambda x: ox + x * S
    Z = lambda z: oz + z * S
    o = []
    o.append(f'<rect x="{X(-10.7)}" y="{Z(-6.5)}" width="{21.4*S}" height="{13.0*S}" fill="{FREE}" stroke="{GOLD}" stroke-width="4"/>')
    o.append(f'<rect x="{X(-7.7)}" y="{Z(-3.5)}" width="{15.4*S}" height="{7.0*S}" fill="{COURT}" stroke="#fff" stroke-width="2"/>')
    o.append(f'<line x1="{X(0)}" y1="{Z(-3.5)}" x2="{X(0)}" y2="{Z(3.5)}" stroke="#fff" stroke-width="1.5"/>')
    for sx in (-1, 1):
        o.append(f'<circle cx="{X(sx*4.9)}" cy="{Z(0)}" r="{0.3*S}" fill="none" stroke="#fff" stroke-width="2"/>')
        for sz in (-1, 1):
            a0 = math.atan2(-sz, sx) - math.pi / 4
            a1 = a0 + math.pi / 2
            r = 0.9 * S
            x0, y0 = X(0) + r * math.cos(a0), Z(sz * 3.5) + r * math.sin(a0)
            x1, y1 = X(0) + r * math.cos(a1), Z(sz * 3.5) + r * math.sin(a1)
            o.append(f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}" fill="none" stroke="#fff" stroke-width="1.5"/>')
    # net + posts
    o.append(f'<line x1="{X(0)}" y1="{Z(-3.8)}" x2="{X(0)}" y2="{Z(3.8)}" stroke="{CREAM}" stroke-width="5" stroke-dasharray="3 2"/>')
    for sz in (-1, 1):
        o.append(f'<circle cx="{X(0)}" cy="{Z(sz*3.8)}" r="5" fill="{CREAM}"/>')
    # players
    o.append(f'<circle cx="{X(-5.6)}" cy="{Z(0)}" r="9" fill="#3d8bff" stroke="#fff" stroke-width="2"/>')
    o.append(f'<circle cx="{X(5.6)}" cy="{Z(0.8)}" r="9" fill="#ff3b30" stroke="#fff" stroke-width="2"/>')
    # labels
    o.append(text(X(-3.4), Z(-1.6), 'YOUR HALF', CREAM, 15, weight=800))
    o.append(text(X(3.4), Z(-1.6), 'OPPONENT', CREAM, 15, weight=800))
    o.append(text(X(-5.6), Z(0.85), 'service circle', CREAM, 11))
    o.append(text(X(0), Z(-3.8) - 12, 'NET  1.52 m high', GOLD, 12, weight=800))
    o.append(text(X(-9.2), Z(-5.3), 'FREE ZONE 3 m', MUTED, 12, 'start'))
    o.append(text(X(0), Z(6.5) + 22, 'LED boards = the wall around the play area  ·  you can never cross the net line', GOLD, 12))
    o.append(text(X(-3.8), Z(3.5) + 18, '15.4 m × 7.0 m court (15% bigger than ISTAF)  ·  lines are IN', CREAM, 12))
    o.append(text(X(1.15), Z(2.0), 'quarter circle', CREAM, 10, 'start'))
    return svg(W, H, ''.join(o), 'Top-down court diagram')

# ---------------- 3. three touches ----------------
def touches():
    S = 62
    gy = 290
    X = lambda m: 40 + m * S
    Y = lambda m: gy - m * S
    netx = 7.4
    o = [f'<line x1="0" y1="{gy}" x2="980" y2="{gy}" stroke="{LINE}" stroke-width="3"/>']
    # net
    o.append(f'<rect x="{X(netx)-2}" y="{Y(1.52)}" width="4" height="{0.7*S}" fill="{CREAM}" opacity=".8"/>')
    o.append(f'<line x1="{X(netx)}" y1="{Y(1.52)}" x2="{X(netx)}" y2="{gy}" stroke="{MUTED}" stroke-width="2"/>')
    o.append(text(X(netx), Y(1.52) - 8, 'net', MUTED, 12))
    def fig(x, jump=0, color=ORANGE, pose='stand'):
        b = Y(jump)
        parts = [f'<circle cx="{x}" cy="{b-1.62*S}" r="9" fill="{color}"/>',
                 f'<line x1="{x}" y1="{b-1.5*S}" x2="{x}" y2="{b-0.9*S}" stroke="{color}" stroke-width="7" stroke-linecap="round"/>']
        if pose == 'spike':
            parts.append(f'<line x1="{x}" y1="{b-0.9*S}" x2="{x+30}" y2="{b-1.75*S}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
            parts.append(f'<line x1="{x}" y1="{b-0.9*S}" x2="{x-14}" y2="{b-0.1*S}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
        elif pose == 'sila':
            parts.append(f'<line x1="{x}" y1="{b-0.9*S}" x2="{x+22}" y2="{b-0.45*S}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
            parts.append(f'<line x1="{x}" y1="{b-0.9*S}" x2="{x-6}" y2="{b}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
        else:
            parts.append(f'<line x1="{x}" y1="{b-0.9*S}" x2="{x-10}" y2="{b}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
            parts.append(f'<line x1="{x}" y1="{b-0.9*S}" x2="{x+10}" y2="{b}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>')
        return ''.join(parts)
    o.append(fig(X(1.6), pose='sila'))
    o.append(fig(X(6.2), jump=0.75, pose='spike'))
    # incoming ball
    o.append(f'<path d="M{X(13.5)},{Y(2.2)} Q{X(9)},{Y(4.2)} {X(2.0)},{Y(0.55)}" fill="none" stroke="{MUTED}" stroke-width="2" stroke-dasharray="6 5"/>')
    o.append(text(X(13.2), Y(2.2) - 10, 'incoming', MUTED, 12))
    # 1 control
    o.append(f'<path d="M{X(2.0)},{Y(0.55)} Q{X(3.0)},{Y(3.1)} {X(4.2)},{Y(1.6)}" fill="none" stroke="{GOLD}" stroke-width="3"/>')
    # 2 set
    o.append(f'<path d="M{X(4.2)},{Y(1.6)} Q{X(5.6)},{Y(4.1)} {X(6.45)},{Y(2.35)}" fill="none" stroke="{GOLD}" stroke-width="3"/>')
    # 3 spike
    o.append(f'<path d="M{X(6.45)},{Y(2.35)} L{X(10.6)},{Y(0.07)}" fill="none" stroke="{ORANGE}" stroke-width="4"/>')
    for (mx, my, n, c) in [(2.0, 0.55, '1', GOLD), (4.2, 1.6, '2', GOLD), (6.45, 2.35, '3', ORANGE)]:
        o.append(f'<circle cx="{X(mx)}" cy="{Y(my)}" r="11" fill="{c}"/>' + text(X(mx), Y(my) + 5, n, '#0d0d10', 14, weight=800))
    for i, (n, t, sub, c) in enumerate([('1', 'CONTROL', 'J — kill the pace', GOLD), ('2', 'SET TO YOURSELF', 'J — pops it up near the net', GOLD), ('3', 'SPIKE', 'SPACE, then tap K on green', ORANGE)]):
        lx = 40 + i * 310
        o.append(f'<circle cx="{lx+11}" cy="24" r="11" fill="{c}"/>' + text(lx + 11, 29, n, '#0d0d10', 14, weight=800))
        o.append(text(lx + 30, 29, t, c, 15, 'start', 800) + text(lx + 30, 47, sub, MUTED, 12, 'start'))
    o.append(text(X(10.6), gy + 20, 'fast &amp; steep', ORANGE, 12))
    return svg(980, 320, ''.join(o), 'Three-touch rally diagram')

# ---------------- 4. reach / body parts ----------------
def reach():
    S = 78
    gy = 300
    Y = lambda m: gy - m * S
    fx = 220
    bands = [(0, 0.75, 'INSIDE FOOT (sila)', '#2f6f9f', 'best control — aim to play balls here'),
             (0.75, 1.15, 'KNEE', '#3d6b8a', 'good control, a bit less accurate'),
             (1.15, 1.55, 'CHEST', '#5a5f7a', 'cushion it — then set'),
             (1.55, 2.1, 'HEADER', '#6a5a7a', 'standing reach tops out ~2.1 m'),
             (2.1, 3.0, 'SPIKE ZONE', '#8a5a2a', 'jump first — K while airborne')]
    o = [f'<line x1="0" y1="{gy}" x2="980" y2="{gy}" stroke="{LINE}" stroke-width="3"/>']
    for lo, hi, name, col, sub in bands:
        o.append(f'<rect x="{fx-120}" y="{Y(hi)}" width="560" height="{(hi-lo)*S}" fill="{col}" opacity=".35"/>')
        o.append(f'<line x1="{fx-120}" y1="{Y(hi)}" x2="{fx+440}" y2="{Y(hi)}" stroke="{col}" stroke-width="1"/>')
        o.append(text(fx + 460, Y((lo + hi) / 2) - 2, name, CREAM, 14, 'start', 800))
        o.append(text(fx + 460, Y((lo + hi) / 2) + 15, sub, MUTED, 12, 'start', 600))
    # standing figure 1.72 m
    c = ORANGE
    o.append(f'<circle cx="{fx}" cy="{Y(1.62)}" r="{0.11*S}" fill="{c}"/>')
    o.append(f'<line x1="{fx}" y1="{Y(1.48)}" x2="{fx}" y2="{Y(0.92)}" stroke="{c}" stroke-width="12" stroke-linecap="round"/>')
    o.append(f'<line x1="{fx}" y1="{Y(0.92)}" x2="{fx-12}" y2="{Y(0)}" stroke="{c}" stroke-width="9" stroke-linecap="round"/>')
    o.append(f'<line x1="{fx}" y1="{Y(0.92)}" x2="{fx+40}" y2="{Y(0.45)}" stroke="{c}" stroke-width="9" stroke-linecap="round"/>')
    o.append(f'<circle cx="{fx+48}" cy="{Y(0.42)}" r="8" fill="{GOLD}"/>')
    # reach arrow
    o.append(f'<line x1="{fx}" y1="{Y(0.05)+0}" x2="{fx+S*1.0}" y2="{Y(0.05)}" stroke="{CREAM}" stroke-width="2" marker-end="url(#arr)"/>')
    o.append(text(fx + S * 0.5 + 10, Y(0.05) - 10, 'reach ≈ 1 m', CREAM, 12))
    # jumping ghost
    jx = fx + 210
    j = 0.8
    o.append(f'<g opacity=".9"><circle cx="{jx}" cy="{Y(1.62+j)}" r="{0.11*S}" fill="{TEAL}"/>')
    o.append(f'<line x1="{jx}" y1="{Y(1.48+j)}" x2="{jx}" y2="{Y(0.92+j)}" stroke="{TEAL}" stroke-width="12" stroke-linecap="round"/>')
    o.append(f'<line x1="{jx}" y1="{Y(0.92+j)}" x2="{jx+38}" y2="{Y(2.65)}" stroke="{TEAL}" stroke-width="9" stroke-linecap="round"/>')
    o.append(f'<line x1="{jx}" y1="{Y(0.92+j)}" x2="{jx-14}" y2="{Y(j)}" stroke="{TEAL}" stroke-width="9" stroke-linecap="round"/></g>')
    o.append(f'<circle cx="{jx+46}" cy="{Y(2.7)}" r="8" fill="{GOLD}"/>')
    o.append(text(jx, gy + 20, 'jump + K = roll spike', TEAL, 12))
    o.append(text(fx, gy + 20, 'standing', ORANGE, 12))
    defs = f'<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="{CREAM}"/></marker></defs>'
    return svg(980, 330, defs + ''.join(o), 'Reach and body-part height bands')

# ---------------- 5. timing ----------------
def timing():
    o = []
    mx, my, mw = 60, 70, 520
    o.append(text(mx, my - 26, 'The meter appears by itself as the ball comes in. TAP J or K on green.', CREAM, 16, 'start', 800))
    o.append(f'<rect x="{mx}" y="{my}" width="{mw}" height="30" fill="#141417" stroke="#555" />')
    o.append(f'<rect x="{mx}" y="{my}" width="{mw*0.58}" height="30" fill="{BLUE}" opacity=".25"/>')
    o.append(f'<rect x="{mx+mw*0.47}" y="{my}" width="{mw*0.32}" height="30" fill="{GOLD}" opacity=".45"/>')
    o.append(f'<rect x="{mx+mw*0.57}" y="{my}" width="{mw*0.12}" height="30" fill="#5fd38a"/>')
    o.append(f'<rect x="{mx+mw*0.58-3}" y="{my-10}" width="6" height="50" fill="#fff"/>')
    o.append(text(mx + mw * 0.63, my + 58, 'GREEN', '#5fd38a', 14, weight=800))
    o.append(text(mx + mw * 0.63, my + 76, 'hard, fast, on target', MUTED, 12, weight=600))
    o.append(text(mx + mw * 0.47, my + 104, 'AMBER', GOLD, 14, weight=800))
    o.append(text(mx + mw * 0.47, my + 122, 'weaker, slower, a bit off', MUTED, 12, weight=600))
    o.append(text(mx + mw * 0.12, my + 58, 'GRAY = way off', ORANGE, 14, weight=800))
    o.append(text(mx + mw * 0.12, my + 76, 'sails out, or floats up', MUTED, 12, weight=600))
    o.append(text(mx + mw * 0.12, my + 94, 'easy for them', MUTED, 12, weight=600))
    o.append(text(mx + mw * 0.58, my - 14, 'needle', CREAM, 12, weight=700))
    tx = 640
    lines = [('The green zone never moves. The needle is', CREAM),
             ('synced to the ball: it hits the middle of', CREAM),
             ('green the instant the ball is perfect for you.', CREAM),
             ('No meter = the ball isn’t in your reach.', MUTED),
             ('Watch out: sometimes the needle starts slow', GOLD),
             ('and ACCELERATES into the green.', GOLD),
             ('Tapping with no meter showing is a whiff.', MUTED),
             ('The ring on the ball shrinks to the same', CREAM),
             ('moment and turns green — with a tick.', CREAM)]
    for i, (t, c) in enumerate(lines):
        o.append(text(tx, 40 + i * 22, t, c, 14, 'start', 600))
    return svg(980, 230, ''.join(o), 'Charge meter diagram')

# ---------------- 6. aiming ----------------
def aiming():
    AIM = '#b48cff'
    S = 37
    cx, net_y = 300, 330
    X = lambda z: cx + z * S
    Y = lambda d: net_y - d * S
    o = [f'<rect x="{X(-3.5)}" y="{Y(7.7)}" width="{7.0*S}" height="{7.7*S}" fill="{COURT}" stroke="#fff" stroke-width="2"/>']
    o.append(f'<line x1="{X(-3.9)}" y1="{net_y}" x2="{X(3.9)}" y2="{net_y}" stroke="{CREAM}" stroke-width="6" stroke-dasharray="3 2"/>')
    o.append(text(cx, net_y + 24, 'NET  —  you are on this side', GOLD, 13, weight=800))
    rows = [(6.6, '▲', 'BACK'), (4.0, '', ''), (1.6, '▼', 'FRONT')]
    cols = [(-2.4, '◀', 'LEFT'), (0, '', ''), (2.4, '▶', 'RIGHT')]
    for d, rk, rn in rows:
        for z, ck, cn in cols:
            centre = not rk and not ck
            keys = (rk + ' ' + ck).strip()
            o.append(f'<circle cx="{X(z)}" cy="{Y(d)}" r="18" fill="none" stroke="{GOLD if centre else "#ffffff"}" stroke-width="{3.5 if centre else 2}" opacity="{1 if centre else .7}"/>')
            if centre:
                o.append(f'<circle cx="{X(z)}" cy="{Y(d)}" r="6" fill="#ffffff"/>')
            name = 'CENTER (default)' if centre else (rn + ' ' + cn).strip() if (rn and cn) else ('SIDE ' + cn if cn else rn + ' CENTER')
            o.append(text(X(z), Y(d) + 34, name, GOLD if centre else CREAM, 11, weight=800))
            if keys: o.append(text(X(z), Y(d) + 48, keys, AIM, 12, weight=800))
    tx = 560
    lines = [('Nine spots on their side. Your dot shows', CREAM),
             ('where your next K will go.', CREAM),
             ('Arrow keys move the dot one spot at a time:', AIM),
             ('▲ deeper · ▼ shorter · ◀ ▶ sideways.', AIM),
             ('Combos go diagonal: ▲ + ◀ = back left.', AIM),
             ('Change it ANY time — even while they', CREAM),
             ('have the ball. Only you can see your dot.', CREAM),
             ('After each kick it resets to CENTER.', GOLD),
             ('WASD never aims. Bad timing drifts off target.', MUTED)]
    for i, (t, c) in enumerate(lines):
        o.append(text(tx, 50 + i * 26, t, c, 14, 'start', 600))
    return svg(980, 400, ''.join(o), 'Nine-spot aim diagram')

def meter():
    o = []
    mx, my, mw = 60, 70, 560
    o.append(text(mx, my - 24, 'SPIN METER', CREAM, 18, 'start', 800))
    o.append(f'<defs><linearGradient id="mg" x1="0" x2="1"><stop offset="0" stop-color="#5cb8f0"/><stop offset=".55" stop-color="#f2b544"/><stop offset="1" stop-color="#ff5a1a"/></linearGradient></defs>')
    o.append(f'<rect x="{mx}" y="{my}" width="{mw}" height="26" fill="#101014" stroke="#3a3a44"/>')
    o.append(f'<rect x="{mx}" y="{my}" width="{mw*0.7}" height="26" fill="url(#mg)"/>')
    for f in (0.25, 0.5, 0.75):
        o.append(f'<rect x="{mx+mw*f-1}" y="{my}" width="2" height="26" fill="#ffffff" opacity=".3"/>')
    o.append(text(mx + mw * 0.25, my + 46, '25% — ULTIMATE unlocked', '#ffb36b', 13, weight=800))
    lines = [('PERFECT touch  +20%', '#5fd38a'), ('GOOD touch  +5%', CREAM),
             ('Way off / whiff / ball drops in your court  →  EMPTY', ORANGE),
             ('With 25%+: jump and K on green = ULTIMATE SPIN KICK', GOLD),
             ('Fuller meter = faster, more accurate, double spin, ball on FIRE', GOLD),
             ('The Ultimate uses up the whole meter.', MUTED)]
    for i, (t, c) in enumerate(lines):
        o.append(text(mx, my + 86 + i * 24, t, c, 14, 'start', 700))
    return svg(980, 300, ''.join(o), 'Spin meter diagram')

def markers():
    BLU, RED_, GRN, GRY = '#3d8bff', '#ff3b30', '#4fdc86', '#a0a0a8'
    o = []
    def dring(cx, cy, r, col, x=False, op=1):
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="5" stroke-dasharray="11 8" opacity="{op}"/>')
        if x: o.append(f'<path d="M{cx-9},{cy-9} L{cx+9},{cy+9} M{cx+9},{cy-9} L{cx-9},{cy+9}" stroke="{col}" stroke-width="4" opacity="{op}"/>')
        else: o.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{col}" opacity="{op}"/>')
    items = [
        ('drop', BLU, 'COMING TO YOU', 'where the ball lands — run here'),
        ('drop', '#ffffff', 'LANDS ON THEIR SIDE', 'your shot, in the air'),
        ('out', GRY, 'GOING OUT', 'leave it — it lands out'),
        ('dig', GRN, 'DIG ZONE', 'their attack: stand inside, J on green'),
        ('x', RED_, 'THEIR AIM', 'only while they are about to hit'),
        ('dia', BLU, 'YOUR AIM', 'move it with the arrow keys'),
    ]
    for i, (kind, col, title, sub) in enumerate(items):
        cx = 90 + (i % 3) * 300
        cy = 70 + (i // 3) * 130
        if kind == 'drop':
            o.append(f'<circle cx="{cx+45}" cy="{cy-48}" r="9" fill="#f5c02e"/>')
            dring(cx, cy, 24, col, op=1 if col == BLU else .75)
        elif kind == 'out': dring(cx, cy, 22, col, x=True)
        elif kind == 'dig': dring(cx, cy, 34, col)
        elif kind == 'x':
            o.append(f'<path d="M{cx},{cy-18} L{cx+18},{cy} L{cx},{cy+18} L{cx-18},{cy} Z" fill="{col}"/>')
        elif kind == 'dia':
            o.append(f'<path d="M{cx},{cy-18} L{cx+18},{cy} L{cx},{cy+18} L{cx-18},{cy} Z" fill="{col}"/>')
        o.append(text(cx + 70, cy - 4, title, CREAM, 15, 'start', 800))
        o.append(text(cx + 70, cy + 16, sub, MUTED, 12, 'start', 600))
    o.append(text(490, 258, 'Blue = you / coming to you  ·  Red = your opponent  ·  White = neutral  ·  Grey X = out', GOLD, 13, weight=800))
    return svg(980, 275, ''.join(o), 'Court markers')

# ---------------- 7. serving ----------------
def serving():
    o = []
    gy = 200
    for i, (title, sub) in enumerate([('1  YOUR SERVE', 'you’re placed in the circle'),
                                      ('2  J — TOSS', 'the ball goes up in front of you'),
                                      ('3  TAP J AGAIN', 'on the green')]):
        x = 70 + i * 310
        o.append(f'<ellipse cx="{x+60}" cy="{gy}" rx="46" ry="12" fill="none" stroke="#9fdcff" stroke-width="3"/>')
        o.append(f'<circle cx="{x+60}" cy="{gy-118}" r="10" fill="{ORANGE}"/>')
        o.append(f'<line x1="{x+60}" y1="{gy-104}" x2="{x+60}" y2="{gy-58}" stroke="{ORANGE}" stroke-width="9" stroke-linecap="round"/>')
        if i == 2:
            o.append(f'<line x1="{x+60}" y1="{gy-58}" x2="{x+102}" y2="{gy-80}" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round"/>')
            o.append(f'<line x1="{x+60}" y1="{gy-58}" x2="{x+54}" y2="{gy}" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round"/>')
            o.append(f'<path d="M{x+110},{gy-86} Q{x+190},{gy-170} {x+260},{gy-40}" fill="none" stroke="{GOLD}" stroke-width="3" stroke-dasharray="7 5"/>')
            o.append(f'<circle cx="{x+110}" cy="{gy-86}" r="8" fill="{GOLD}"/>')
        else:
            o.append(f'<line x1="{x+60}" y1="{gy-58}" x2="{x+48}" y2="{gy}" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round"/>')
            o.append(f'<line x1="{x+60}" y1="{gy-58}" x2="{x+72}" y2="{gy}" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round"/>')
        if i == 1:
            o.append(f'<line x1="{x+92}" y1="{gy-80}" x2="{x+92}" y2="{gy-160}" stroke="{GOLD}" stroke-width="2" stroke-dasharray="5 4"/>')
            o.append(f'<circle cx="{x+92}" cy="{gy-165}" r="8" fill="{GOLD}"/>')
        if i == 0:
            o.append(f'<circle cx="{x+80}" cy="{gy-62}" r="8" fill="{GOLD}"/>')
        o.append(text(x + 60, gy + 34, title, CREAM, 14, weight=800))
        o.append(text(x + 60, gy + 54, sub, MUTED, 12, weight=600))
    return svg(980, 270, ''.join(o), 'Serve steps')

pages = [
    ('controls', 'Controls', keyboard(), '<p>WASD moves. When the meter pops up, tap J (set) or K (kick) on green. At the net, L blocks their attack as it crosses. The arrow keys are optional aiming. You never pick the body part — the game uses foot, knee, chest or head depending on how high the ball is when you touch it.</p>'),
    ('court', 'The court', court(), '<p>Official ISTAF court. You stay on your half; the LED boards are the outer wall. The glow ring at your feet shows where you are: <b class="c-team">team colour</b> in court, <b class="c-gold">gold</b> in the free zone, <b class="c-blue">blue</b> in your service circle.</p>'),
    ('touches', '3 touches', touches(), '<p>You get <b>up to 3 touches</b> before the ball must go over — and you can take all three yourself. Sending it straight back with K is safe but slow and loopy. J pops the ball up HIGH and out into open space (← → pick the side) — move under it. Passing to yourself (J, J) lets you hit flatter and harder, and a <b>spike</b> (jump near the net, K at the top) is the fastest shot in the game — or jump exactly the same way and tap <b>J</b> for a <b>feint</b>: a soft chip that drops just over the net while they wait deep for the spike. Hard balls are hard to kick cleanly: <b>control them with J first</b> — a J that digs a smash pops the ball <b>way</b> up. Jump kicks work on any touch: off your own set it’s a <b>spike</b>, straight off their clear it’s a <b>smash</b>, otherwise it’s a high, soft <b>clear</b> they can easily return.</p><p><b>Teams (2v2 / 3v3):</b> your side still gets 3 touches between you — e.g. one controls, the other spikes. Your teammate is light blue. The serve passes to the other team every 3 points, and each time your team gets it back the next teammate serves. 3v3 plays on its own venue — a bigger court out on the Lotus Pond: a server at the back and two feeders at the front left and right.</p>'),
    ('defend', 'Defending', '', '<p>When they spike or smash, a <b>red mark</b> shows where it will land. Get into it (it turns green) and a dig meter appears — tap <b>J</b> on <b>green</b> and the ball pops straight up over you like a set; <b>yellow</b> still digs it, just lower and scrappier. Careful: if they jump but only <b>chip it softly</b>, that’s a <b>feint</b> — no dig zone appears, so sprint in toward the net. Way off (or no tap) is their point.</p><p>At the net you can <b>block</b> instead: jump and tap <b>L</b> as their attack crosses over you. A perfect block stuffs it straight back down. Everyone sees <b>BLOCKED!</b>.</p>'),
    ('reach', 'Reach', reach(), '<p>You can play the ball when it is within about a metre of you. The touch is judged by height: low balls on the inside of the foot give the cleanest control. A <b>spike</b> needs you airborne, close to the net (within ~3 m) and the ball above ~1.7 m.</p>'),
    ('timing', 'Timing', timing(), '<p>As the ball comes into your reach a timing meter pops up above your player by itself — just <b>tap J or K when the needle is in the green</b>. Sometimes the needle accelerates into the green to catch you out. Your grade — Perfect, Good, Early or Late — pops up above your head. If the ball hits you and you didn’t press anything, it bounces off your body and still counts as a touch.</p>'),
    ('aim', 'Aiming', aiming(), ''),
    ('markers', 'Markers', markers(), '<p>Every marker means one thing. While a ball is in the air, a <b>dashed ring</b> shows exactly where it will land — it shrinks as the ball comes down. The ball’s outline uses the same colours. Their <b>red diamond</b> only appears while they are about to hit; your <b>blue diamond</b> is always your own aim.</p>'),
    ('serve', 'Serving', serving(), '<p>When it’s your serve you’re placed in your service circle automatically and held there until you kick. <b>J</b> tosses; as it drops the meter appears — tap on green. <b>J, J = Snap serve</b>: flat and quick, and the receiver’s green comes <b>early</b>. <b>J, K = Hang serve</b>: high and floaty, and the receiver’s green comes <b>late</b>. Read it as a receiver: snap has thin white streaks and a crisp “tsk”; hang leaves warm smoke and a low “whomp”; the meter says which, and a thin white tick shows where green normally is. Arrow keys aim if you want. Serve passes to the other player <b>every 3 points</b>; tossing and not kicking loses the point. In practice, press <b>J</b> any time to go serve.</p>'),
    ('rules', 'Scoring', '', '''<div class="rules">
      <div class="rule"><span class="rb win">+1</span><div><b>Ball lands in their court</b><small>the ball touching the line is IN</small></div></div>
      <div class="rule"><span class="rb lose">−</span><div><b>Ball lands in your court</b><small>you didn’t get to it</small></div></div>
      <div class="rule"><span class="rb lose">OUT</span><div><b>Your shot lands out</b><small>outside the lines, or into the boards</small></div></div>
      <div class="rule"><span class="rb lose">NET</span><div><b>Into the net / under it</b><small>clipping the tape and rolling over is fine</small></div></div>
      <div class="rule"><span class="rb lose">WIDE</span><div><b>Over the net outside the side tapes</b><small>the ball must cross between the white tapes</small></div></div>
      <div class="rule"><span class="rb lose">4</span><div><b>A fourth touch</b><small>3 touches max per side — body touches count too</small></div></div>
      <div class="rule"><span class="rb lose">FOOT</span><div><b>Serving outside your circle</b><small>or tossing and not kicking</small></div></div>
      <div class="rule"><span class="rb info">7</span><div><b>First to 7 wins</b><small>every rally scores a point</small></div></div>
      <div class="rule"><span class="rb info">BLK</span><div><b>Blocks are free</b><small>at the net, jump + L right as their attack crosses: perfect stuffs it back down · a block never uses a touch</small></div></div>
      <div class="rule"><span class="rb lose">DIG</span><div><b>Their smash: get to the red mark</b><small>stand in it and dig on GREEN — anything else is their point</small></div></div>
    </div>'''),
]

tabs = ''.join(f'<button class="ht-tab{" on" if i == 0 else ""}" data-page="{k}">{t}</button>' for i, (k, t, _, _) in enumerate(pages))
body = ''.join(f'<section class="ht-page{" on" if i == 0 else ""}" data-page="{k}"><h3>{t}</h3>{d}{s}</section>' for i, (k, t, s, d) in enumerate(pages))
html = f'''<div id="howto" class="hidden">
    <div class="ht-card">
      <div class="ht-head">
        <h2>How to play</h2>
        <label class="ht-opt">Graphics <select id="opt-quality" class="ht-select"><option value="auto">Auto</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select> <span id="quality-now" class="ht-dim"></span></label>
        <label class="ht-opt"><input type="checkbox" id="opt-sound" /> Sound <span class="key sm">N</span></label>
        <label class="ht-opt"><input type="checkbox" id="opt-controls" /> Controls bar</label>
        <input type="checkbox" id="opt-landing" hidden />
        <button id="howto-close" class="sq-btn" title="Close (Esc)">&#10005;</button>
      </div>
      <nav class="ht-tabs">{tabs}</nav>
      <div class="ht-body">{body}</div>
    </div>
  </div>'''
sys.stdout.write(html)
