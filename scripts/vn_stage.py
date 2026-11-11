"""The game's battle stages (side-view pixel art made for the same characters) as layers the café can draw with
parallax: every sprite renderer of the stage prefab, placed in the stage's pixels (32 to a unit, the characters' own),
its animation as a base picture and the patches that change, and the floor and platforms people can stand on.
Used by vn-assets.py."""
import json
import os
import struct

import UnityPy
from PIL import Image, ImageChops

PPU = 32


def f32(bits):
    return struct.unpack('<f', struct.pack('<I', bits & 0xFFFFFFFF))[0]


def sprite_keys(clip):
    """[(curve, time, frame number)] of a sprite-swapping clip."""
    data, out, i = clip['m_MuscleClip']['m_Clip']['data']['m_StreamedClip']['data'], [], 0
    while i < len(data):
        time, n = f32(data[i]), data[i + 1]
        i += 2
        for _ in range(n):
            out.append((data[i], max(0.0, time), int(round(f32(data[i + 4])))))
            i += 5
    return out


def export(bundle_path, out_dir, sid):
    env = UnityPy.load(bundle_path)
    os.makedirs(out_dir, exist_ok=True)
    tr = {o.path_id: o.read() for o in env.objects if o.type.name == 'Transform'}
    sprites = {o.path_id: o for o in env.objects if o.type.name == 'Sprite'}
    clips = {o.path_id: o.read_typetree() for o in env.objects if o.type.name == 'AnimationClip'}

    tid_of = {id(t): k for k, t in tr.items()}

    def chain(t):
        out = []
        while t:
            out.append(t)
            f = t.m_Father
            t = tr.get(f.path_id) if f and f.path_id else None
        return out

    def chain_ids(t):
        return [tid_of[id(c)] for c in chain(t)]

    def world(t):
        x = y = z = 0.0
        sx = sy = 1.0
        for c in chain(t):
            x = c.m_LocalPosition.x + x * c.m_LocalScale.x
            y = c.m_LocalPosition.y + y * c.m_LocalScale.y
            z += c.m_LocalPosition.z
            sx *= c.m_LocalScale.x
            sy *= c.m_LocalScale.y
        return x, y, z, sx, sy

    def names(t):
        return [c.m_GameObject.read().m_Name for c in chain(t)]

    def active(t):
        return all(c.m_GameObject.read().m_IsActive for c in chain(t))

    # the parallax rate of each background layer, the field the camera keeps to, the platforms, the sky's colour
    rates, field, plats, clear = {}, None, [], (24, 26, 40)
    for o in env.objects:
        if o.type.name == 'Camera':
            c = o.read().m_BackGroundColor
            clear = tuple(round(v * 255) for v in (c.r, c.g, c.b))
        if o.type.name != 'MonoBehaviour':
            continue
        d = o.read()
        try:
            cn = d.m_Script.read().m_ClassName
        except Exception:
            continue
        tt = o.read_typetree()
        if cn == 'BackgroundParallaxMono':
            for li in tt['_backgroundLayerInfos']:
                rates[li['_layer']['m_PathID']] = (li['_distanceRate']['x'], li['_distanceRate']['y'])
        elif cn == 'CameraLimitField':
            t = tr[d.m_GameObject.read().m_Transform.path_id]
            x, y, *_ = world(t)
            field = (x, y, tt['_size']['x'], tt['_size']['y'])
        elif cn == 'Platform':
            t = tr[d.m_GameObject.read().m_Transform.path_id]
            x, y, *_ = world(t)
            plats.append({'x': x, 'y': y, 'w': tt['_size']['x'], 'fall': bool(tt['_canFall'])})
    if not field:
        return None
    fx, fy, fw, fh = field
    px = lambda wx: round((wx - fx) * PPU)   # noqa: E731
    py = lambda wy: round((fy - wy) * PPU)   # noqa: E731

    # the animations: an Animator's state plays a clip that swaps its renderer's sprite
    anim_of = {}   # GameObject path id -> the clip its Animator plays (the first that swaps sprites)
    for o in env.objects:
        if o.type.name != 'Animator':
            continue
        a = o.read()
        if not (a.m_Controller and a.m_Controller.path_id):
            continue
        cc = a.m_Controller.read_typetree()
        for ref in cc.get('m_AnimationClips', []):
            cl = clips.get(ref['m_PathID'])
            if cl and cl['m_ClipBindingConstant']['pptrCurveMapping']:
                anim_of[a.m_GameObject.path_id] = cl
                break

    layers = []
    for tid, t in tr.items():
        go = t.m_GameObject.read()
        for c in go.m_Component:
            ptr = c.component if hasattr(c, 'component') else c
            if ptr.type.name != 'SpriteRenderer':
                continue
            sr = ptr.read()
            if not sr.m_Enabled or not active(t):
                continue
            try:
                sp = sr.m_Sprite.read()
            except Exception:
                continue
            path = names(t)
            x, y, z, sx, sy = world(t)
            zone = 'front' if 'ForegroundParent' in path else 'plat' if 'PlatformParent' in path else 'back'
            rate = next((rates[i] for i in chain_ids(t) if i in rates), (0.0, 0.0))
            col = (sr.m_Color.r, sr.m_Color.g, sr.m_Color.b, sr.m_Color.a)
            frames = [sp]
            durs = [1.0]
            clip = anim_of.get(t.m_GameObject.path_id)
            if clip:
                refs = [m['m_PathID'] for m in clip['m_ClipBindingConstant']['pptrCurveMapping']]
                keys = [k for k in sprite_keys(clip) if k[0] == 0]
                seq = []
                for i, (_, tm, fi) in enumerate(keys[:-1]):
                    if fi < len(refs) and refs[fi] in sprites:
                        seq.append((sprites[refs[fi]].read(), keys[i + 1][1] - tm))
                seq = [s for s in seq if s[1] > 0.001]
                if len(seq) > 1:
                    frames, durs = [s[0] for s in seq], [s[1] for s in seq]
            # every frame scaled to the stage's pixels, tinted, flipped as drawn
            ims = []
            for f in frames:
                im = f.image.convert('RGBA')
                k = PPU / f.m_PixelsToUnits
                ww, hh = max(1, round(im.width * k * abs(sx))), max(1, round(im.height * k * abs(sy)))
                smooth = ww > im.width * 3 or hh > im.height * 3
                if (ww, hh) != im.size:
                    im = im.resize((ww, hh), Image.BICUBIC if smooth else Image.NEAREST)
                if sr.m_FlipX or sx < 0:
                    im = im.transpose(Image.FLIP_LEFT_RIGHT)
                if col[:3] != (1.0, 1.0, 1.0) or col[3] < 1:
                    r, g, b, a = im.split()
                    r = r.point(lambda v: v * col[0]); g = g.point(lambda v: v * col[1]); b = b.point(lambda v: v * col[2]); a = a.point(lambda v: v * col[3])
                    im = Image.merge('RGBA', (r, g, b, a))
                ox = x - f.m_Pivot.x * ww / PPU * (1 if not (sr.m_FlipX or sx < 0) else 1)
                oy = y + (1 - f.m_Pivot.y) * hh / PPU
                ims.append((im, ox, oy))
            n = len(layers)
            base, bx, by = ims[0]
            name = f'{n:02d}.png'
            base.save(os.path.join(out_dir, name), optimize=True)
            L = {'src': name, 'x': px(bx), 'y': py(by), 'w': base.width, 'h': base.height, 'zone': zone, 'z': round(z, 3),
                 'order': sr.m_SortingOrder, 'rate': [round(rate[0], 3), round(rate[1], 3)], 'name': path[0],
                 'smooth': any(i[0].width > f.image.width * 3 for i, f in zip(ims, frames))}
            if len(ims) > 1:
                # the frames as patches over the base: only the box that differs from it
                patches = []
                for j, (im, ox, oy) in enumerate(ims):
                    if im.size != base.size:
                        im2 = Image.new('RGBA', base.size); im2.alpha_composite(im.crop((0, 0, min(im.width, base.width), min(im.height, base.height)))); im = im2
                    bb = ImageChops.difference(im, base).getbbox()
                    if not bb:
                        patches.append(None)
                        continue
                    pname = f'{n:02d}-{j:02d}.png'
                    im.crop(bb).save(os.path.join(out_dir, pname), optimize=True)
                    patches.append({'src': pname, 'x': bb[0], 'y': bb[1]})
                L['frames'] = [[p, round(d * 1000)] for p, d in zip(patches, durs)]
            layers.append(L)
    # back to front: farther first (the zone, then the depth, then the sorting order)
    zr = {'back': 0, 'plat': 1, 'front': 2}
    layers.sort(key=lambda L: (zr[L['zone']], -L['z'], L['order']))
    ground = max((p for p in plats if not p['fall']), key=lambda p: p['w'], default=None)
    out = {'id': sid, 'w': round(fw * PPU), 'h': round(fh * PPU), 'clear': '#%02x%02x%02x' % clear, 'layers': layers,
           'ground': {'x0': px(ground['x']), 'x1': px(ground['x'] + ground['w']), 'y': py(ground['y'])} if ground else None,
           'platforms': [{'x0': px(p['x']), 'x1': px(p['x'] + p['w']), 'y': py(p['y'])} for p in plats if p['fall']],
           'home': [px(0), py(0)]}
    with open(os.path.join(out_dir, 'stage.json'), 'w', encoding='utf-8') as fh_:
        json.dump(out, fh_, indent=1)
    return out
