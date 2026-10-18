// Replay each solution the solver finds with an independent rules simulator.
const KL = require('../src/solver.js'); const {deal, toPos} = require('./bench.js');
const red = c => { const s = (c / 13) | 0; return s === 1 || s === 2; }, rank = c => c % 13, suit = c => (c / 13) | 0;
function fits(p, c, d) { const q = p.cols[d]; if (!q.length) return rank(c) === 12; const t = q[q.length - 1]; return red(t) !== red(c) && rank(t) === rank(c) + 1; }
function flip(p, s) { if (p.cols[s].length && p.down[s] === p.cols[s].length) p.down[s]--; }
let ok = 0, fail = 0;
for (let seed = 1; seed <= 60; seed++) for (const draw of [1, 3]) {
  const start = toPos(deal(seed, draw)); const res = KL.solve(start, {maxNodes: 200000, trace: true});
  if (res.result !== 'win') continue;
  const p = JSON.parse(JSON.stringify(start)); let err = null;
  for (const m of res.path) {
    if (m.t === 1 || m.t === 2) {
      const c = m.c; let guard = 0;
      while (p.talon[p.w] !== c && guard++ < 200) { const L = p.talon.length; p.w = p.w < L - 1 ? Math.min(p.w + draw, L - 1) : -1; }
      if (p.talon[p.w] !== c) { err = 'talon card unreachable'; break; }
      p.talon.splice(p.w, 1); p.w--;
      if (m.t === 1) { if (p.found[suit(c)] !== rank(c)) { err = 'bad WF'; break; } p.found[suit(c)]++; }
      else { if (!fits(p, c, m.d)) { err = 'bad WT'; break; } p.cols[m.d].push(c); }
    } else if (m.t === 0) { const q = p.cols[m.s], c = q[q.length - 1]; if (p.down[m.s] === q.length || p.found[suit(c)] !== rank(c)) { err = 'bad TF'; break; } q.pop(); p.found[suit(c)]++; flip(p, m.s); }
    else if (m.t === 3) { const q = p.cols[m.s]; if (m.idx < p.down[m.s] || !fits(p, q[m.idx], m.d)) { err = 'bad TT'; break; } p.cols[m.d].push(...q.splice(m.idx)); flip(p, m.s); }
    else if (m.t === 4) { const c = m.su * 13 + p.found[m.su] - 1; if (!fits(p, c, m.d)) { err = 'bad FT'; break; } p.found[m.su]--; p.cols[m.d].push(c); }
  }
  if (!err) {
    // Finish: all face up; play lowest available card to foundation repeatedly, drawing as needed.
    for (let g = 0; g < 5000 && p.found.reduce((a, b) => a + b) < 52; g++) {
      let moved = false;
      for (let s = 0; s < 7 && !moved; s++) { const q = p.cols[s]; if (q.length && p.found[suit(q[q.length-1])] === rank(q[q.length-1])) { p.found[suit(q.pop())]++; flip(p, s); moved = true; } }
      if (!moved && p.w >= 0 && p.found[suit(p.talon[p.w])] === rank(p.talon[p.w])) { p.found[suit(p.talon.splice(p.w, 1)[0])]++; p.w--; moved = true; }
      if (!moved && p.talon.length) { const L = p.talon.length; p.w = p.w < L - 1 ? Math.min(p.w + draw, L - 1) : -1; }
      else if (!moved) break;
    }
    if (p.found.reduce((a, b) => a + b) < 52) err = 'could not finish';
  }
  if (err) { fail++; console.log('seed', seed, 'draw', draw, err); } else ok++;
}
console.log({ok, fail});
