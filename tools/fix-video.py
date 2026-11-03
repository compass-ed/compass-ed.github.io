"""Fix a video exported from Moda before it goes on the site. Moda writes a "fragmented" MP4 whose header says the video
lasts 0 seconds; on slow school networks browsers then see only the first few seconds and loop or race through them.
This rewrites it as a plain MP4 (index first, real length). The frames are copied byte for byte: nothing is re-encoded.
Usage: python3 tools/fix-video.py in.mp4 out.mp4   (it re-reads out.mp4 and checks every frame against in.mp4)"""
import struct, sys, hashlib

def boxes(d, s, e):
    i = s
    while i + 8 <= e:
        size, t = struct.unpack(">I4s", d[i:i + 8]); h = 8
        if size == 1: size = struct.unpack(">Q", d[i + 8:i + 16])[0]; h = 16
        elif size == 0: size = e - i
        if size < h or i + size > e: raise ValueError("bad box %r at %d" % (t, i))
        yield t.decode("latin1"), i, size, i + h
        i += size

def child(d, s, e, name):
    for t, i, sz, b in boxes(d, s, e):
        if t == name: return i, sz, b
    return None

def full(d, b): v = struct.unpack(">I", d[b:b + 4])[0]; return v >> 24, v & 0xFFFFFF, b + 4

def read_fragmented(d):
    top = list(boxes(d, 0, len(d)))
    moov = next(x for x in top if x[0] == "moov"); ms, me = moov[3], moov[1] + moov[2]
    traks = [x for x in boxes(d, ms, me) if x[0] == "trak"]
    if len(traks) != 1: raise ValueError("expected one track, found %d" % len(traks))
    trak = traks[0]; ts_, te = trak[3], trak[1] + trak[2]
    tkhd = child(d, ts_, te, "tkhd"); mdia = child(d, ts_, te, "mdia"); ma, mb = mdia[2], mdia[0] + mdia[1]
    mdhd = child(d, ma, mb, "mdhd"); hdlr = child(d, ma, mb, "hdlr"); minf = child(d, ma, mb, "minf"); na, nb = minf[2], minf[0] + minf[1]
    stbl = child(d, na, nb, "stbl"); stsd = child(d, stbl[2], stbl[0] + stbl[1], "stsd")
    if child(d, ts_, te, "edts"): raise ValueError("edit lists are not handled")
    v, _, p = full(d, mdhd[2]); timescale = struct.unpack(">I", d[p + 8:p + 12] if v == 0 else d[p + 16:p + 20])[0]
    lang = d[p + 16:p + 18] if v == 0 else d[p + 28:p + 30]
    v, _, p = full(d, tkhd[2]); track_id = struct.unpack(">I", d[p + 8:p + 12] if v == 0 else d[p + 16:p + 20])[0]
    wh = d[tkhd[0] + tkhd[1] - 8:tkhd[0] + tkhd[1]]   # width, height (16.16), the last 8 bytes of tkhd
    mvex = child(d, ms, me, "mvex"); trex = child(d, mvex[2], mvex[0] + mvex[1], "trex")
    _, _, p = full(d, trex[2]); _, _, def_dur, def_size, def_flags = struct.unpack(">IIIII", d[p:p + 20])
    keep = {k: d[x[0]:x[0] + x[1]] for k, x in (("hdlr", hdlr), ("stsd", stsd))}
    keep["minf_rest"] = b"".join(d[i:i + sz] for t, i, sz, b in boxes(d, na, nb) if t in ("vmhd", "smhd", "dinf"))
    samples = []   # (data, duration, is_sync, composition_offset)
    for t, i, sz, b in top:
        if t != "moof": continue
        for tt, ti, tsz, tb in boxes(d, b, i + sz):
            if tt != "traf": continue
            tfhd = child(d, tb, ti + tsz, "tfhd"); _, fl, p = full(d, tfhd[2]); tid = struct.unpack(">I", d[p:p + 4])[0]; p += 4
            if tid != track_id: continue
            base = i; dur, size, flags = def_dur, def_size, def_flags
            if fl & 0x1: base = struct.unpack(">Q", d[p:p + 8])[0]; p += 8
            if fl & 0x2: p += 4
            if fl & 0x8: dur = struct.unpack(">I", d[p:p + 4])[0]; p += 4
            if fl & 0x10: size = struct.unpack(">I", d[p:p + 4])[0]; p += 4
            if fl & 0x20: flags = struct.unpack(">I", d[p:p + 4])[0]; p += 4
            pos = None
            for rt, ri, rsz, rb in boxes(d, tb, ti + tsz):
                if rt != "trun": continue
                ver, rf, p = full(d, rb); n = struct.unpack(">I", d[p:p + 4])[0]; p += 4
                if rf & 0x1: pos = base + struct.unpack(">i", d[p:p + 4])[0]; p += 4
                elif pos is None: pos = base
                first = None
                if rf & 0x4: first = struct.unpack(">I", d[p:p + 4])[0]; p += 4
                for k in range(n):
                    sd, ss, sf, co = dur, size, flags, 0
                    if rf & 0x100: sd = struct.unpack(">I", d[p:p + 4])[0]; p += 4
                    if rf & 0x200: ss = struct.unpack(">I", d[p:p + 4])[0]; p += 4
                    if rf & 0x400: sf = struct.unpack(">I", d[p:p + 4])[0]; p += 4
                    if k == 0 and first is not None: sf = first
                    if rf & 0x800: co = struct.unpack(">i" if ver else ">I", d[p:p + 4])[0]; p += 4
                    samples.append((d[pos:pos + ss], sd, not (sf & 0x10000), co)); pos += ss
    if not samples: raise ValueError("no frames found")
    return dict(timescale=timescale, lang=lang, track_id=track_id, wh=wh, keep=keep, samples=samples)

def box(t, payload): return struct.pack(">I4s", 8 + len(payload), t.encode()) + payload
def fbox(t, v, fl, payload): return box(t, struct.pack(">I", (v << 24) | fl) + payload)
UNITY = struct.pack(">9I", 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)

def write_plain(m):
    S, ts = m["samples"], m["timescale"]; total = sum(s[1] for s in S); movie = round(total * 1000 / ts)
    runs = []
    for s in S:
        if runs and runs[-1][1] == s[1]: runs[-1][0] += 1
        else: runs.append([1, s[1]])
    stts = fbox("stts", 0, 0, struct.pack(">I", len(runs)) + b"".join(struct.pack(">II", *r) for r in runs))
    sync = [i + 1 for i, s in enumerate(S) if s[2]]
    stss = fbox("stss", 0, 0, struct.pack(">I", len(sync)) + b"".join(struct.pack(">I", n) for n in sync)) if len(sync) < len(S) else b""
    ctts = b""
    if any(s[3] for s in S):
        cr = []
        for s in S:
            if cr and cr[-1][1] == s[3]: cr[-1][0] += 1
            else: cr.append([1, s[3]])
        neg = any(c[1] < 0 for c in cr)
        ctts = fbox("ctts", 1 if neg else 0, 0, struct.pack(">I", len(cr)) + b"".join(struct.pack(">Ii" if neg else ">II", *c) for c in cr))
    stsz = fbox("stsz", 0, 0, struct.pack(">II", 0, len(S)) + b"".join(struct.pack(">I", len(s[0])) for s in S))
    stsc = fbox("stsc", 0, 0, struct.pack(">I", 1) + struct.pack(">III", 1, len(S), 1))   # one chunk holds every frame
    def build(off):
        stco = fbox("stco", 0, 0, struct.pack(">II", 1, off))
        stbl = box("stbl", m["keep"]["stsd"] + stts + ctts + stss + stsc + stsz + stco)
        minf = box("minf", m["keep"]["minf_rest"] + stbl)
        mdhd = fbox("mdhd", 0, 0, struct.pack(">IIII", 0, 0, ts, total) + m["lang"] + b"\0\0")
        mdia = box("mdia", mdhd + m["keep"]["hdlr"] + minf)
        tkhd = fbox("tkhd", 0, 3, struct.pack(">IIIII", 0, 0, m["track_id"], 0, movie) + b"\0" * 8 + struct.pack(">hhhH", 0, 0, 0, 0) + UNITY + m["wh"])
        trak = box("trak", tkhd + mdia)
        mvhd = fbox("mvhd", 0, 0, struct.pack(">IIIIIh", 0, 0, 1000, movie, 0x10000, 0x100) + b"\0" * 10 + UNITY + b"\0" * 24 + struct.pack(">I", m["track_id"] + 1))
        return box("moov", mvhd + trak)
    ftyp = box("ftyp", b"isom" + struct.pack(">I", 512) + b"isomiso2avc1mp41")
    size = len(ftyp) + len(build(0)) + 8                     # moov's size does not depend on the offset value
    data = b"".join(s[0] for s in S)
    if size + len(data) >= 2 ** 32: raise ValueError("too big for 32-bit offsets")
    return ftyp + build(size) + struct.pack(">I4s", 8 + len(data), b"mdat") + data, total / ts

def read_plain(d):
    moov = next(x for x in boxes(d, 0, len(d)) if x[0] == "moov")
    def find(s, e, path):
        for t, i, sz, b in boxes(d, s, e):
            if t == path[0]: return (i, sz, b) if len(path) == 1 else find(b, i + sz, path[1:])
    stsz = find(moov[3], moov[1] + moov[2], ["trak", "mdia", "minf", "stbl", "stsz"]); _, _, p = full(d, stsz[2])
    _, n = struct.unpack(">II", d[p:p + 8]); sizes = struct.unpack(">%dI" % n, d[p + 8:p + 8 + 4 * n])
    stco = find(moov[3], moov[1] + moov[2], ["trak", "mdia", "minf", "stbl", "stco"]); _, _, p = full(d, stco[2]); off = struct.unpack(">I", d[p + 4:p + 8])[0]
    out = []
    for s in sizes: out.append(d[off:off + s]); off += s
    return out

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    d = open(src, "rb").read()
    if not any(t == "moof" for t, *_ in boxes(d, 0, len(d))): sys.exit(f"{src} is already a plain MP4: nothing to fix.")
    m = read_fragmented(d); out, secs = write_plain(m)
    open(dst, "wb").write(out)
    back = read_plain(out)   # self-check: the new file's frames are the old file's frames, in order
    assert len(back) == len(m["samples"]) and all(a == s[0] for a, s in zip(back, m["samples"])), "frame mismatch"
    assert out.index(b"moov") < out.index(b"mdat"), "index must come first"
    h = lambda xs: hashlib.sha256(b"".join(xs)).hexdigest()[:12]
    print(f"{src}: {len(m['samples'])} frames, {secs:.2f}s, keyframes {sum(s[2] for s in m['samples'])}, "
          f"{len(d) / 1e6:.1f} MB -> {len(out) / 1e6:.1f} MB, frames identical ({h(back)})")
