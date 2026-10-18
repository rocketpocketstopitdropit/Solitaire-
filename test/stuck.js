// Random play until the stuck detector says there is nothing useful left, then check
// the full solver agrees the position can't be won from there.
const KL = require('../src/solver.js'); const {deal, toPos} = require('./bench.js');
const red = c => { const s = (c / 13) | 0; return s === 1 || s === 2; }, rank = c => c % 13, suit = c => (c / 13) | 0;
function fits(p, c, d) { const q = p.cols[d]; if (!q.length) return rank(c) === 12; const t = q[q.length - 1]; return red(t) !== red(c) && rank(t) === rank(c) + 1; }
function flip(p, s) { if (p.cols[s].length && p.down[s] === p.cols[s].length) p.down[s]--; }
function legal(p) {
  const m = [];
  if (p.talon.length) m.push(['draw']);
  if (p.w >= 0) { const c = p.talon[p.w]; if (p.found[suit(c)] === rank(c)) m.push(['wf']); for (let d = 0; d < 7; d++) if (fits(p, c, d)) m.push(['wt', d]); }
  for (let s = 0; s < 7; s++) { const q = p.cols[s]; if (!q.length) continue; const c = q[q.length - 1]; if (p.found[suit(c)] === rank(c)) m.push(['tf', s]);
    for (let i = p.down[s]; i < q.length; i++) for (let d = 0; d < 7; d++) if (d !== s && fits(p, q[i], d) && !(i === 0 && !p.cols[d].length)) m.push(['tt', s, i, d]); }
  for (let su = 0; su < 4; su++) if (p.found[su]) { const c = su * 13 + p.found[su] - 1; for (let d = 0; d < 7; d++) if (p.cols[d].length && fits(p, c, d)) m.push(['ft', su, d]); }
  return m;
}
function apply(p, m) {
  const L = p.talon.length;
  if (m[0] === 'draw') p.w = p.w < L - 1 ? Math.min(p.w + p.draw, L - 1) : -1;
  else if (m[0] === 'wf') { const c = p.talon.splice(p.w, 1)[0]; p.w--; p.found[suit(c)]++; }
  else if (m[0] === 'wt') { const c = p.talon.splice(p.w, 1)[0]; p.w--; p.cols[m[1]].push(c); }
  else if (m[0] === 'tf') { const c = p.cols[m[1]].pop(); p.found[suit(c)]++; flip(p, m[1]); }
  else if (m[0] === 'ft') { p.found[m[1]]--; p.cols[m[2]].push(m[1] * 13 + p.found[m[1]]); }
  else { const mv = p.cols[m[1]].splice(m[2]); p.cols[m[3]].push(...mv); flip(p, m[1]); }
}
let stuck = 0, bad = 0, maxMs = 0, checks = 0, tot = 0;
for (let seed = 1; seed <= 400; seed++) {
  const draw = seed % 2 ? 3 : 1, p = toPos(deal(seed, draw));
  let r = seed * 7919;
  const rand = n => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r % n; };
  for (let step = 0; step < 400; step++) {
    const t0 = Date.now(); const useful = KL.hasUsefulMove(p); const dt = Date.now() - t0;
    checks++; tot += dt; maxMs = Math.max(maxMs, dt);
    if (!useful) {
      stuck++;
      const res = KL.solve(p, {maxNodes: 300000});
      if (res.result === 'win') { bad++; console.log('MISMATCH seed', seed, 'step', step); }
      break;
    }
    const m = legal(p); if (!m.length) { console.log("NO MOVES but useful", seed, step, JSON.stringify(p)); process.exit(); }
    const pref = m.filter(x => x[0] !== 'draw' && x[0] !== 'tt');
    apply(p, (pref.length && rand(3)) ? pref[rand(pref.length)] : m[rand(m.length)]);
    if (p.found.reduce((a, b) => a + b) === 52) break;
  }
}
console.log({stuck, bad, checks, avgMs: (tot / checks).toFixed(2), maxMs});
