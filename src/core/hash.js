/* خوارزميات البصمة والتشابه والتجميع — نقية بلا DOM */

export function pop32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

export function hamming(a, b) {
  return pop32((a.lo ^ b.lo) >>> 0) + pop32((a.hi ^ b.hi) >>> 0);
}

export function colorDiff(a, b) {
  let s = 0;
  for (let i = 0; i < 48; i++) s += Math.abs(a[i] - b[i]);
  return s / 48;
}

/* يعيد مسافة هامينج إن كانتا متشابهتين وإلا null */
export function similarity(a, b, thr) {
  if (!a.sig || !b.sig) return null;
  const ra = (a.width / a.height) / (b.width / b.height);
  if (ra < 0.9 || ra > 1.11) return null;
  const d = hamming(a.sig, b.sig);
  if (d > thr) return null;
  if (colorDiff(a.sig.color, b.sig.color) > 28) return null;
  return d;
}

/* التجميع الوحيد: Union-Find (تجميع متعدٍّ صحيح) */
export function clusterImages(list, thr) {
  const n = list.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (similarity(list[i], list[j], thr) !== null) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }
  const groups = new Map();
  list.forEach((img, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(img);
  });
  return [...groups.values()];
}

/* فرق أقل من هذا (بمقياس 0–255) يُعدّ «تساوياً»: في المناطق المسطحة (خلفيات الشعارات والرسوم) تنتج الفروق المتناهية
   الصغر بتات عشوائية تُفسد المقارنة بين نسختين من الصورة نفسها، فتُثبَّت هذه البتات على 0 */
export const DHASH_EPS = 2;

/* dHash: gray = 72 قيمة (9×8) → {lo, hi} (64 بت) */
export function dhashFromGray(gray) {
  let lo = 0, hi = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (gray[y * 9 + x] - gray[y * 9 + x + 1] > DHASH_EPS) {
        const k = y * 8 + x;
        if (k < 32) lo |= (1 << k); else hi |= (1 << (k - 32));
      }
    }
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}
