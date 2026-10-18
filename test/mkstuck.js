// Find a stuck position from random play and print it as a saved game for the page.
const KL = require('../src/solver.js'); const {deal, toPos} = require('./bench.js');
const SUITS = ['S','H','D','C'], id = c => SUITS[(c / 13) | 0] + (c % 13 + 1);
const red = c => { const s = (c / 13) | 0; return s === 1 || s === 2; }, rank = c => c % 13, suit = c => (c / 13) | 0;
function fits(p, c, d) { const q = p.cols[d]; if (!q.length) return rank(c) === 12; const t = q[q.length - 1]; return red(t) !== red(c) && rank(t) === rank(c) + 1; }
const wantDraw = +process.argv[2] || 3, want = process.argv[3] || 'win';
for (let seed = 1; seed < 500; seed++) {
  const verdict = KL.solve(toPos(deal(seed, wantDraw)), {maxNodes: 300000}).result;
  if (verdict !== want) continue;
  const p = toPos(deal(seed, wantDraw)); let r = seed;
  const rand = n => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r % n; };
  let moves = 0;
  for (let step = 0; step < 300 && KL.hasUsefulMove(p); step++) {
    const m = [];
    if (p.w >= 0) { const c = p.talon[p.w]; if (p.found[suit(c)] === rank(c)) m.push(() => { p.talon.splice(p.w, 1); p.w--; p.found[suit(c)]++; }); for (let d = 0; d < 7; d++) if (fits(p, c, d)) m.push(() => { p.talon.splice(p.w, 1); p.w--; p.cols[d].push(c); }); }
    for (let s = 0; s < 7; s++) { const q = p.cols[s]; if (!q.length) continue; const c = q[q.length - 1];
      if (p.found[suit(c)] === rank(c)) m.push(() => { q.pop(); p.found[suit(c)]++; if (q.length && p.down[s] === q.length) p.down[s]--; });
      for (let i = p.down[s]; i < q.length; i++) for (let d = 0; d < 7; d++) if (d !== s && fits(p, q[i], d) && !(i === 0 && !p.cols[d].length)) m.push(() => { p.cols[d].push(...q.splice(i)); if (q.length && p.down[s] === q.length) p.down[s]--; }); }
    if (!m.length || rand(4) === 0) { const L = p.talon.length; if (L) p.w = p.w < L - 1 ? Math.min(p.w + p.draw, L - 1) : -1; }
    else m[rand(m.length)]();
    moves++;
  }
  if (KL.hasUsefulMove(p)) continue;
  const S = {seed, draw: wantDraw, stock: p.talon.slice(p.w + 1).reverse().map(id), waste: p.talon.slice(0, p.w + 1).map(id),
    f: [[], [], [], []], t: p.cols.map(c => c.map(id)), up: {}, moves, elapsed: 312, started: true, won: false};
  p.found.forEach((n, su) => { for (let k = 0; k < n; k++) S.f[su].push(SUITS[su] + (k + 1)); });
  S.waste.forEach(x => S.up[x] = true);
  p.cols.forEach((c, i) => c.forEach((x, j) => { if (j >= p.down[i]) S.up[id(x)] = true; }));
  console.log(JSON.stringify(S));
  process.exit(0);
}
