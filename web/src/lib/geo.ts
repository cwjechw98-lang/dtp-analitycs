const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Центр геохэш-ячейки: [lat, lon] */
export function geohashDecode(hash: string): [number, number] {
  let evenBit = true;
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  for (const ch of hash.toLowerCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error(`bad geohash char: ${ch}`);
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (evenBit) {
        const mid = (lonMin + lonMax) / 2;
        if (bit === 1) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit === 1) latMin = mid; else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return [(latMin + latMax) / 2, (lonMin + lonMax) / 2];
}
