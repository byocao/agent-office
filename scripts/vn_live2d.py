"""The game's Live2D models (its visual-novel standing art) as a Cubism web model: the .moc3, the texture, and every
animation clip turned into a .motion3.json, tied together by a .model3.json. Used by vn-assets.py."""
import json
import os
import re
import struct
import zlib

import UnityPy
from PIL import Image

FPS = 30


def f32(bits):
    return struct.unpack('<f', struct.pack('<I', bits & 0xFFFFFFFF))[0]


def streamed_keys(data, count):
    """Per curve: [(time, (c0, c1, c2, c3))], from a streamed clip (Hermite pieces as cubic coefficients)."""
    keys = [[] for _ in range(count)]
    i = 0
    while i < len(data):
        time, n = f32(data[i]), data[i + 1]
        i += 2
        for _ in range(n):
            ci = data[i]
            c = tuple(f32(x) for x in data[i + 1:i + 5])
            i += 5
            if ci < count and time != float('-inf'):
                keys[ci].append((max(0.0, time), c))
    return keys


def value_at(keys, t):
    if not keys:
        return None
    k = keys[0]
    for kk in keys:
        if kk[0] <= t + 1e-6:
            k = kk
        else:
            break
    dt = t - k[0]
    c0, c1, c2, c3 = k[1]
    return ((c0 * dt + c1) * dt + c2) * dt + c3


def motion3(clip, names):
    """A .motion3.json from a Unity clip whose curves drive CubismParameter values (and CubismPart opacities)."""
    mc = clip['m_MuscleClip']
    data = mc['m_Clip']['data']
    binds = clip['m_ClipBindingConstant']['genericBindings']
    if not binds:
        return None
    start, stop = mc['m_StartTime'], mc['m_StopTime']
    dur = max(1.0 / FPS, stop - start)
    sc = data['m_StreamedClip']
    n_stream = sc.get('curveCount', 0)
    dense = data['m_DenseClip']
    n_dense = dense['m_CurveCount']
    const = data['m_ConstantClip']['data']
    skeys = streamed_keys(sc['data'], n_stream)
    frames = max(1, round(dur * FPS))
    times = [min(dur, f / FPS) for f in range(frames + 1)]
    curves = []
    for bi, b in enumerate(binds):
        target = names.get(b['path'])
        if not target:
            continue
        kind, pid = target
        if bi < n_stream:
            vals = [value_at(skeys[bi], start + t) for t in times]
            if vals[0] is None:
                continue
        elif bi < n_stream + n_dense:
            j = bi - n_stream
            arr, fc, rate, t0 = dense['m_SampleArray'], dense['m_FrameCount'], dense['m_SampleRate'], dense['m_BeginTime']
            vals = [arr[min(fc - 1, max(0, round((start + t - t0) * rate))) * n_dense + j] for t in times]
        else:
            j = bi - n_stream - n_dense
            if j >= len(const):
                continue
            vals = [const[j]] * len(times)
        seg = [0.0, round(vals[0], 4)]
        for t, v in zip(times[1:], vals[1:]):
            seg += [0, round(t, 4), round(v, 4)]
        curves.append({'Target': kind, 'Id': pid, 'Segments': seg})
    if not curves:
        return None
    segs = sum((len(c['Segments']) - 2) // 3 for c in curves)
    return {'Version': 3, 'Meta': {'Duration': round(dur, 4), 'Fps': FPS, 'Loop': True, 'AreBeziersRestricted': True, 'CurveCount': len(curves),
                                   'TotalSegmentCount': segs, 'TotalPointCount': segs + len(curves), 'UserDataCount': 0, 'TotalUserDataSize': 0},
            'Curves': curves}


def export(bundle_path, out_dir, max_tex=4096):
    """Writes model.model3.json, model.moc3, the textures and motions/*.motion3.json to out_dir. Returns the motion names."""
    env = UnityPy.load(bundle_path)
    os.makedirs(os.path.join(out_dir, 'motions'), exist_ok=True)
    moc, textures, clips, params, parts = None, [], [], [], []
    for o in env.objects:
        t = o.type.name
        if t == 'Texture2D':
            textures.append(o.read())
        elif t == 'AnimationClip':
            clips.append(o.read_typetree())
        elif t == 'MonoBehaviour':
            d = o.read()
            try:
                cn = d.m_Script.read().m_ClassName
            except Exception:
                continue
            if cn == 'CubismMoc':
                moc = bytes(o.read_typetree()['_bytes'])
            elif cn == 'CubismParameter':
                params.append(d.m_GameObject.read().m_Name)
            elif cn == 'CubismPart':
                parts.append(d.m_GameObject.read().m_Name)
    if not moc:
        return None
    with open(os.path.join(out_dir, 'model.moc3'), 'wb') as fh:
        fh.write(moc)
    tex_files = []
    for i, tx in enumerate(sorted(textures, key=lambda x: x.m_Name)):
        im = tx.image
        if im.width > max_tex:
            im = im.resize((max_tex, round(im.height * max_tex / im.width)), Image.LANCZOS)
        name = f'texture_{i:02d}.png'
        im.save(os.path.join(out_dir, name), optimize=True)
        tex_files.append(name)
    # an animated field is named by the CRC32 of its path under the model: Parameters/<id>, Parts/<id>
    names = {zlib.crc32(f'Parameters/{p}'.encode()): ('Parameter', p) for p in params}
    names.update({zlib.crc32(f'Parts/{p}'.encode()): ('PartOpacity', p) for p in parts})
    motions = {}
    for c in clips:
        m = motion3(c, names)
        if not m:
            continue
        safe = re.sub(r'[^A-Za-z0-9_-]+', '_', c['m_Name']).strip('_')
        with open(os.path.join(out_dir, 'motions', f'{safe}.motion3.json'), 'w', encoding='utf-8') as fh:
            json.dump(m, fh, separators=(',', ':'))
        motions[safe] = {'File': f'motions/{safe}.motion3.json', 'FadeInTime': 0.5, 'FadeOutTime': 0.5}
    model = {'Version': 3, 'FileReferences': {'Moc': 'model.moc3', 'Textures': tex_files, 'Motions': {k: [v] for k, v in motions.items()}},
             'Groups': [{'Target': 'Parameter', 'Name': 'EyeBlink', 'Ids': [p for p in ('ParamEyeLOpen', 'ParamEyeROpen') if p in params]},
                        {'Target': 'Parameter', 'Name': 'LipSync', 'Ids': [p for p in ('ParamMouthOpenY',) if p in params]}]}
    with open(os.path.join(out_dir, 'model.model3.json'), 'w', encoding='utf-8') as fh:
        json.dump(model, fh, indent=1)
    return sorted(motions)
