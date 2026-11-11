"""Builds the art for the café (src/office/ui/cafe.js) from a local install of Smash Girls.

    python -I scripts/vn-assets.py "D:/Games/Smash Girls" [public/assets/vn] [--original]

The art belongs to its studio: it is read from your own copy and written to public/assets/vn/, which git ignores. Do
not commit or publish it. Taken: the standing portraits, the in-game pixel characters' everyday animations, the
backgrounds, three battle stages (scripts/vn_stage.py) and the characters' battle voice lines (no story voices).
The standing art's Live2D models are converted for the web too (scripts/vn_live2d.py), and Live2D's Cubism Core for
Web, the runtime that plays them, is fetched from Live2D's own site into the same folder (Live2D's licence: it is not
part of this repository either).
The six heroines get colours of their own (scripts/vn_recolor.py: hair and outfits turned to new hues, skin kept);
--original keeps the game's colours.
Needs: pip install UnityPy pillow numpy
"""
import json
import os
import re
import struct
import sys
import urllib.request

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vn_live2d  # noqa: E402
import vn_stage  # noqa: E402
import vn_recolor  # noqa: E402

if len([a for a in sys.argv[1:] if a != '--original']) < 1:
    sys.exit(__doc__)
ORIGINAL = '--original' in sys.argv
ARGS = [a for a in sys.argv[1:] if a != '--original']
GAME = ARGS[0]
OUT = ARGS[1] if len(ARGS) > 1 else os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'vn')
paint = (lambda im, cid: im) if ORIGINAL else vn_recolor.recolor   # noqa: E731
BUNDLES = os.path.join(GAME, 'SmashGirls_Data', 'StreamingAssets', 'aa', 'StandaloneWindows64')
if not os.path.isdir(BUNDLES):
    sys.exit(f'No game data at {BUNDLES}')

# the cast: id -> (sprite, name, height on stage relative to a grown-up, face: centre x, centre y, diameter, all as
# fractions of the trimmed sprite's width / height / width)
CAST = {
    'mio': ('LevelCharacter_Mio', 'Mio', 1.0, (0.42, 0.058, 0.16)),
    'lilith': ('LevelCharacter_Lilith', 'Lilith', 1.0, (0.56, 0.074, 0.13)),
    'chika': ('LevelCharacter_Chika', 'Chika', 0.98, (0.38, 0.075, 0.22)),
    'mango': ('LevelCharacter_Mango', 'Mango', 1.0, (0.38, 0.1, 0.32)),
    'shigure': ('LevelCharacter_Shigure', 'Shigure', 1.03, (0.7, 0.085, 0.15)),
    'xao': ('LevelCharacter_Xao', 'Xao', 0.97, (0.47, 0.13, 0.27)),
    'sosuke': ('Sosuke', 'Sosuke', 1.05, (0.62, 0.09, 0.26)),
    'penguin': ('Penguin', 'Penguin', 0.62, (0.53, 0.14, 0.4)),
}
# silhouettes, for subagents (people you only see the outline of)
SHADOWS = {
    'f1': ('FemaleMob_1', 0.98), 'f2': ('FemaleMob_2', 0.98), 'f3': ('FemaleMob_3', 0.98),
    'm1': ('MaleMob_1', 1.04), 'm2': ('MaleMob_2', 1.04), 'm3': ('MaleMob_3', 1.04),
    'kid1': ('MaleChild', 0.72), 'kid2': ('FemaleChild', 0.72),
}
# places, each in the light of the time of day (the game's own variants of one picture)
PLACES = {
    'office': {'day': 'Kyoukakai_a', 'dusk': 'Kyoukakai_b', 'eve': 'Kyoukakai_c', 'night': 'Kyoukakai_d'},
    'street': {'day': 'MainStreet_a', 'rain': 'MainStreet_b', 'dusk': 'MainStreet_c', 'night': 'MainStreet_d'},
    'cafe': {'day': 'Restaurant_a', 'dusk': 'Restaurant_c', 'night': 'Restaurant_d'},
    'room': {'day': 'Home_a', 'dusk': 'Home_b', 'night': 'Home_e'},
    'corner': {'day': 'RoadCorner_a', 'dusk': 'RoadCorner_b', 'night': 'RoadCorner_c'},
    'city': {'day': 'EastCity_b', 'dusk': 'EastCity_a', 'night': 'EastCity_c'},
    'church': {'day': 'ChurchStreet_a', 'dusk': 'ChurchStreet_b', 'night': 'ChurchStreet_c'},
    'deck': {'day': 'ObservationDeck_a', 'night': 'ObservationDeck_d'},
    'hall': {'day': 'Warehouse_a', 'dusk': 'Warehouse_c', 'night': 'Warehouse_d'},
}

# the in-game pixel characters (frame-by-frame animation): id -> the game's name for them
SPRITES = {
    'mio': 'Mio', 'lilith': 'Lilith', 'chika': 'Chika', 'mango': 'Mango', 'shigure': 'Shigure', 'xao': 'Xao',
    'penguin': 'Penguin', 'popsicle': 'Popsicle', 'police': 'Police', 'sparkle': 'Sparkle', 'mercenary': 'Mercenary',
    'believer': 'Believer', 'thug': 'Thug', 'gangster': 'Gangster', 'mafia': 'Mafia',
}
MOVES = ['Idle', 'Walk', 'Run', 'TakeOff', 'Rise', 'Fall', 'Land', 'GroundHurt', 'Attack1', 'Special']

# (looked up by file name, under the game's character and background folders)
want = {n for n, *_ in CAST.values()} | {n for n, _ in SHADOWS.values()} | {f for p in PLACES.values() for f in p.values()}
found = {}   # name -> PIL image
moves = {}   # (sprite id, move) -> bundle file
l2d = {}     # cast id -> its Live2D model's bundle file
L2D_NAME = {cid: src.replace('LevelCharacter_', '') for cid, (src, *_rest) in CAST.items()}
# the battle stages, as layers to draw with parallax
STAGES = {'street': 'Street_Stage', 'church': 'Church_Stage', 'arcade': 'Arcade_Stage'}
stage_bundles = {}
# battle voice lines (Japanese) the café plays: picked up, ready, a win, a loss, effort, a hit
VOICE_KINDS = ('Selection', 'Ready', 'BattleStart', 'Victory', 'Defeat', 'Force', 'Damage', 'SmashGirls', 'Studio')
voice_bundles = {}   # (cast id, file name) -> bundle
print('reading the game data (about a minute)...')
for f in sorted(os.listdir(BUNDLES)):
    env = UnityPy.load(os.path.join(BUNDLES, f))
    for path, obj in env.container.items():
        sm = re.search(r'/Prefab/Smash/Stage/Stage/(\w+)\.prefab$', path)
        if sm:
            for sid, game in STAGES.items():
                if game == sm.group(1):
                    stage_bundles[sid] = f
            continue
        vm = re.search(r'/VoiceClip/jp/Battle/(\w+)/\1_Voice_(\w+?)(?:_(\d+))?\.wav$', path)
        if vm:
            if vm.group(2) in VOICE_KINDS:
                for cid, game in L2D_NAME.items():
                    if game == vm.group(1):
                        voice_bundles[(cid, f'{vm.group(2)}{vm.group(3) or ""}')] = f
            continue
        lm = re.search(r'/Live2D/Battle/Intro/(\w+)Live2D\.prefab$', path)
        if lm:
            for cid, game in L2D_NAME.items():
                if game == lm.group(1):
                    l2d[cid] = f
            continue
        a = re.search(r'/Smash/Character/\w+/(\w+)/AnimationInfo/.*/\1_(\w+)_AnimationInfo\.asset$', path)
        if a and a.group(2) in MOVES:
            for sid, game in SPRITES.items():
                if game == a.group(1):
                    moves[(sid, a.group(2))] = f
            continue
        m = re.search(r'/(Character/Graphic|Background)/(?:Novel/)?([^/]+)\.(?:png|jpg)$', path)
        name = m and m.group(2)
        if name not in want or obj.type.name not in ('Sprite', 'Texture2D'):
            continue
        if name in found and obj.type.name == 'Texture2D':
            continue   # (the sprite, already cut out of its texture, wins)
        found[name] = obj.read().image
missing = sorted(want - set(found))
if missing:
    print('not found:', ', '.join(missing))

os.makedirs(os.path.join(OUT, 'cast'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'bg'), exist_ok=True)


def trimmed(im):
    im = im.convert('RGBA')
    return im.crop(im.getbbox())


manifest = {'cast': {}, 'shadows': {}, 'places': {}}
for cid, (src, name, h, (fx, fy, fd)) in CAST.items():
    if src not in found:
        continue
    im = paint(trimmed(found[src]), cid)
    if im.height > 1600:
        im = im.resize((round(im.width * 1600 / im.height), 1600), Image.LANCZOS)
    im.save(os.path.join(OUT, 'cast', f'{cid}.webp'), quality=92, method=6)
    d = fd * im.width
    box = (round(fx * im.width - d / 2), round(fy * im.height - d / 2), round(fx * im.width + d / 2), round(fy * im.height + d / 2))
    face = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]))
    face.alpha_composite(im.crop(box))
    face.resize((160, 160), Image.LANCZOS).save(os.path.join(OUT, 'cast', f'{cid}-face.webp'), quality=90)
    manifest['cast'][cid] = {'name': name, 'src': f'cast/{cid}.webp', 'face': f'cast/{cid}-face.webp', 'w': im.width, 'h': im.height, 'k': h, 'head': [fx, fy]}
for sid, (src, h) in SHADOWS.items():
    if src not in found:
        continue
    im = trimmed(found[src])
    if im.height > 900:
        im = im.resize((round(im.width * 900 / im.height), 900), Image.LANCZOS)
    im.save(os.path.join(OUT, 'cast', f'shadow-{sid}.webp'), quality=88)
    manifest['shadows'][sid] = {'src': f'cast/shadow-{sid}.webp', 'w': im.width, 'h': im.height, 'k': h}
for pid, light in PLACES.items():
    have = {}
    for when, src in light.items():
        if src not in found:
            continue
        im = found[src].convert('RGB')
        if im.width > 1920:
            im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, 'bg', f'{pid}-{when}.webp'), quality=84, method=6)
        have[when] = f'bg/{pid}-{when}.webp'
    if have:
        manifest['places'][pid] = have


# the pixel characters: every move's frames (in the order and for the time the game's clip shows them) laid out in one
# sheet per character, each frame in a cell of the same size with the feet at the same point
def f32(bits):
    return struct.unpack('<f', struct.pack('<I', bits & 0xFFFFFFFF))[0]


def clip_keys(clip):
    """[(time, frame number)] from a sprite-swapping clip (one curve of object references)."""
    data, out, i = clip['m_MuscleClip']['m_Clip']['data']['m_StreamedClip']['data'], [], 0
    while i < len(data):
        time, n = f32(data[i]), data[i + 1]
        i += 2
        for _ in range(n):
            if data[i] == 0:
                out.append((max(0.0, time), int(round(f32(data[i + 4])))))
            i += 5
    return out


os.makedirs(os.path.join(OUT, 'sprites'), exist_ok=True)
manifest['sprites'] = {}
for sid in SPRITES:
    frames, anims = [], {}
    for mv in MOVES:
        if (sid, mv) not in moves:
            continue
        env = UnityPy.load(os.path.join(BUNDLES, moves[(sid, mv)]))
        sprites, clip, info = {}, None, {}
        for o in env.objects:
            if o.type.name == 'Sprite':
                sprites[o.path_id] = o
            elif o.type.name == 'AnimationClip':
                clip = o.read_typetree()
            elif o.type.name == 'MonoBehaviour':
                try:
                    info = o.read_typetree()
                except Exception:
                    pass
        if not clip:
            continue
        refs = [m['m_PathID'] for m in clip['m_ClipBindingConstant']['pptrCurveMapping']]
        keys = clip_keys(clip)
        seq = []
        for k, (tm, fi) in enumerate(keys[:-1]):   # (the last key only marks where the clip ends)
            if fi < len(refs) and refs[fi] in sprites:
                seq.append((refs[fi], keys[k + 1][0] - tm))
        seq = [x for x in seq if x[1] > 0.001]
        if not seq:
            continue
        fr = []
        for pid, dur in seq:
            sp = sprites[pid].read()
            img = sp.image.convert('RGBA')
            frames.append((img, (sp.m_Pivot.x * img.width, (1 - sp.m_Pivot.y) * img.height)))
            fr.append([len(frames) - 1, max(16, round(dur * 1000))])
        anims[mv] = {'frames': fr, 'loop': bool(info.get('_isLoop', mv in ('Idle', 'Walk', 'Run')))}
    if not frames:
        continue
    left = max(pv[0] for _, pv in frames)
    right = max(im.width - pv[0] for im, pv in frames)
    up = max(pv[1] for _, pv in frames)
    down = max(im.height - pv[1] for im, pv in frames)
    cw, ch, cols = int(left + right) + 2, int(up + down) + 2, 16
    sheet = Image.new('RGBA', (cw * cols, ch * ((len(frames) + cols - 1) // cols)))
    for i, (im, pv) in enumerate(frames):
        sheet.alpha_composite(im, ((i % cols) * cw + 1 + int(round(left - pv[0])), (i // cols) * ch + 1 + int(round(up - pv[1]))))
    sheet = sheet if ORIGINAL else vn_recolor.recolor(sheet, sid, pixel=True)
    sheet.save(os.path.join(OUT, 'sprites', f'{sid}.png'), optimize=True)
    manifest['sprites'][sid] = {'src': f'sprites/{sid}.png', 'cw': cw, 'ch': ch, 'cols': cols, 'px': int(left) + 1, 'py': int(up) + 1, 'anims': anims}

# the stages
manifest['stages'] = {}
for sid, f in stage_bundles.items():
    st = vn_stage.export(os.path.join(BUNDLES, f), os.path.join(OUT, 'stages', sid), sid)
    if st and st['ground']:
        manifest['stages'][sid] = f'stages/{sid}/stage.json'
# the voice lines: { cast id: { kind: [files] } }
manifest['voices'] = {}
for (cid, name), f in sorted(voice_bundles.items()):
    env = UnityPy.load(os.path.join(BUNDLES, f))
    for o in env.objects:
        if o.type.name != 'AudioClip':
            continue
        try:
            data = next(iter(o.read().samples.values()))
        except Exception as err:   # (no decoder for it here)
            print('voice', cid, name, err)
            break
        os.makedirs(os.path.join(OUT, 'voice', cid), exist_ok=True)
        with open(os.path.join(OUT, 'voice', cid, f'{name}.wav'), 'wb') as fh:
            fh.write(data)
        kind = re.sub(r'\d+$', '', name)
        manifest['voices'].setdefault(cid, {}).setdefault(kind, []).append(f'voice/{cid}/{name}.wav')
        break

# the standing art as Live2D, and the runtime that plays it
manifest['live2d'] = {}
for cid, f in sorted(l2d.items()):
    print('live2d', cid)
    if vn_live2d.export(os.path.join(BUNDLES, f), os.path.join(OUT, 'live2d', cid), transform=lambda im, c=cid: paint(im, c)):
        manifest['live2d'][cid] = f'live2d/{cid}/model.model3.json'
CORE = os.path.join(OUT, 'live2d', 'live2dcubismcore.min.js')
if manifest['live2d'] and not os.path.exists(CORE):
    try:
        urllib.request.urlretrieve('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js', CORE)
    except Exception as err:   # (offline: the café shows the still portraits instead)
        print('could not fetch the Cubism Core:', err)

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
    json.dump(manifest, fh, indent=1)
print(f"wrote {len(manifest['cast'])} portraits, {len(manifest['live2d'])} Live2D models, {len(manifest['stages'])} stages, {sum(len(v) for x in manifest['voices'].values() for v in x.values())} voice lines, {len(manifest['sprites'])} pixel characters, {len(manifest['shadows'])} silhouettes, {len(manifest['places'])} places to {os.path.abspath(OUT)}")
