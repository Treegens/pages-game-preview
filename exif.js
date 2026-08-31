// =============================================================================
// exif.js — minimal client-side EXIF GPS reader for Proof-of-Plant.
// Parses JPEG → APP1 "Exif" → TIFF → IFD0 → GPS IFD → lat/lng (DMS→decimal).
// No dependencies; returns null for anything it can't read (PNG, stripped
// EXIF, screenshots…) so the UI can fall back to device geolocation.
// =============================================================================

const Exif = (() => {
  async function gpsFromFile(file) {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer(); // EXIF lives up front
      return gps(new DataView(buf));
    } catch (e) { return null; }
  }

  function gps(v) {
    try {
      if (v.getUint16(0) !== 0xffd8) return null; // not a JPEG
      let off = 2;
      while (off < v.byteLength - 4) {
        const marker = v.getUint16(off);
        if ((marker & 0xff00) !== 0xff00) break;
        const size = v.getUint16(off + 2);
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
          return parseTiff(v, off + 10);
        }
        off += 2 + size;
      }
    } catch (e) {}
    return null;
  }

  function parseTiff(v, base) {
    const little = v.getUint16(base) === 0x4949; // "II" = Intel byte order
    const u16 = (o) => v.getUint16(base + o, little);
    const u32 = (o) => v.getUint32(base + o, little);
    if (u16(2) !== 42) return null;

    // IFD0 → GPS sub-IFD pointer (tag 0x8825)
    const ifd0 = u32(4);
    let gpsOff = null;
    const n = u16(ifd0);
    for (let i = 0; i < n; i++) {
      const e = ifd0 + 2 + i * 12;
      if (u16(e) === 0x8825) { gpsOff = u32(e + 8); break; }
    }
    if (!gpsOff) return null;

    const rational = (o) => {
      const den = u32(o + 4);
      return den ? u32(o) / den : 0;
    };
    const dms = (ptr) => rational(ptr) + rational(ptr + 8) / 60 + rational(ptr + 16) / 3600;

    let latRef = "N", lonRef = "E", lat = null, lng = null;
    const gn = u16(gpsOff);
    for (let i = 0; i < gn; i++) {
      const e = gpsOff + 2 + i * 12;
      const tag = u16(e);
      if (tag === 1) latRef = String.fromCharCode(v.getUint8(base + e + 8));
      else if (tag === 3) lonRef = String.fromCharCode(v.getUint8(base + e + 8));
      else if (tag === 2) lat = dms(u32(e + 8));
      else if (tag === 4) lng = dms(u32(e + 8));
    }
    if (lat === null || lng === null || !isFinite(lat) || !isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null; // null island = stripped/blank GPS
    return {
      lat: latRef === "S" ? -lat : lat,
      lng: lonRef === "W" ? -lng : lng,
    };
  }

  return { gpsFromFile, _gps: gps };
})();
window.Exif = Exif;
