"""Gives a character new colours: every coloured pixel's hue is turned by the character's own amount (its saturation and
brightness scaled too, if asked), while skin, lips and blush (warm, soft tones) and the greys keep theirs. The same
change goes on every picture of a character (the pixel sprites, the portraits, the Live2D textures), so they all still
match. Used by vn-assets.py."""
import numpy as np
from PIL import Image

# character id -> (hue turn in degrees, saturation scale, brightness scale)
SCHEMES = {
    'mio': (60, 1.6, 1.0),        # violet accents, a pink tint in the silver hair
    'lilith': (300, 1.0, 1.0),    # coral hair, a purple dress
    'chika': (240, 1.0, 1.0),     # sky blue
    'mango': (240, 1.0, 1.0),     # violet hair, a blue top
    'shigure': (180, 1.05, 1.0),  # a teal cape and tie
    'xao': (120, 1.0, 1.0),       # pink hood, a pink slime
}


def _rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    h = h / 6.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def _hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.empty(h.shape + (3,), dtype=np.float32)
    for k, (a, b_, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel, 0], out[sel, 1], out[sel, 2] = a[sel], b_[sel], c[sel]
    return out


def recolor(im, cid, pixel=False):
    """The picture with the character's colours changed (unchanged for a character without a scheme). pixel: pixel art,
    whose skin is shaded in saturated orange-browns (kept too)."""
    sc = SCHEMES.get(cid)
    if not sc:
        return im
    im = im.convert('RGBA')
    if im.width * im.height > 4_000_000:   # (a Live2D texture: in strips, so it fits in memory)
        out = Image.new('RGBA', im.size)
        for y in range(0, im.height, 512):
            out.paste(_recolor(im.crop((0, y, im.width, min(im.height, y + 512))), sc, pixel), (0, y))
        return out
    return _recolor(im, sc, pixel)


def _recolor(im, sc, pixel):
    turn, sat, val = sc
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:]
    h, s, v = _rgb_to_hsv(rgb)
    hd = h * 360
    # skin and its shading kept: warm, soft tones (skin, lips, blush) from red-pink to orange, softly at the edge; in pixel
    # art also, however saturated, the orange-browns its skin is shaded in (hair of that hue moves only if lighter or
    # redder than skin)
    warm = ((hd >= 345) | (hd <= 42)) & (v > 0.2)
    keep = np.where(warm & (s < 0.62), 1.0, np.where(warm & (s < 0.72), (0.72 - s) / 0.10, 0.0))
    if pixel:
        keep = np.maximum(keep, np.where((hd >= 16) & (hd <= 33.5) & (v > 0.2), 1.0, 0.0))
        keep = np.maximum(keep, np.where((hd > 33.5) & (hd < 36) & (v > 0.2), (36 - hd) / 2.5, 0.0))
    grey = np.clip((s - 0.06) / 0.08, 0, 1)                # (greys and near-greys barely move)
    w = (1 - keep) * grey
    h2 = (h + w * (turn / 360.0)) % 1.0
    s2 = np.clip(s * (1 + w * (sat - 1)), 0, 1)
    v2 = np.clip(v * (1 + w * (val - 1)), 0, 1)
    out = _hsv_to_rgb(h2, s2, v2)
    res = np.concatenate([out, alpha], -1)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
