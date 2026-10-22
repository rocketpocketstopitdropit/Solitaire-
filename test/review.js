// Plays games the way a hurried human might until they get stuck, then reviews them:
// the log must replay to the same table, the turning point must be consistent
// (winnable at k, lost at k + 1), and the winning line from k must play out to a win
// under the game's own rules.
// node test/review.js [games] [draw] [budget ms per review]
const KL = require('../src/solver.js'), RV = require('../src/review.js');
const games = +(process.argv[2] || 24), onlyDraw = +(process.argv[3] || 0), budget = +(process.argv[4] || 60000);

function actions(g) {
  const out = [];
  if (g.stock.length || g.waste.length) out.push({ d: 1 });
  const refs = [{ k: 'w' }];
  for (let i = 0; i < 4; i++) refs.push({ k: 'f', i });
  for (let i = 0; i < 7; i++) refs.push({ k: 't', i });
  for (const f of refs) {
    const p = RV.pile(g, f);
    for (let i = 0; i < p.length; i++) {
      if (!g.up[p[i]]) continue;
      for (const t of refs) {
        if (t.k === 'w') continue;
        if (t.k === 't' && f.k === 't' && i === 0 && !g.t[t.i].length) continue;
        const a = { f, i, t };
        if (RV.legal(g, a)) out.push(a);
      }
    }
  }
  return out;
}
// Greedy-ish: foundation moves and moves that turn a card over first, otherwise a
// random move or a stock tap. Rarely takes cards back off the foundation.
function play(seed, draw) {
  const g = RV.deal(seed, draw);
  let r = seed * 2654435761 >>> 0;
  const rand = n => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % n; };
  for (let step = 0; step < 500; step++) {
    if (!KL.hasUsefulMove(RV.toPos(g))) break;
    const all = actions(g).filter(a => !(a.f && a.f.k === 'f' && rand(8)));
    const good = all.filter(a => a.t && (a.t.k === 'f' || (a.f.k === 't' && a.i > 0 && !g.up[g.t[a.f.i][a.i - 1]]) || a.f.k === 'w'));
    const pick = good.length && rand(5) ? good[rand(good.length)] : all[rand(all.length)];
    if (!pick) break;
    RV.apply(g, pick); g.log.push(pick);
    if (g.f.every(p => p.length === 13)) break;
  }
  return g;
}

module.exports = { play };
if (require.main === module) {
let reviewed = 0, exact = 0, lostFromStart = 0, unsettled = 0, problems = 0, totalMs = 0, maxMs = 0, lines = [];
for (let n = 0; n < games; n++) {
  const draw = onlyDraw || (n % 2 ? 3 : 1), seed = 1000 + n;
  const g = play(seed, draw);
  const states = RV.replay(seed, draw, g.log);
  if (!states || !RV.sameTable(states[states.length - 1], g)) { problems++; console.log('REPLAY MISMATCH', seed, draw); continue; }
  if (g.f.every(p => p.length === 13)) continue;
  const t0 = Date.now();
  const tp = KL.turningPoint(states.map(RV.toPos), { ms: budget });
  const dt = Date.now() - t0; totalMs += dt; maxMs = Math.max(maxMs, dt); reviewed++;
  let note = '';
  if (tp.k < 0) { if (tp.lost === 0) lostFromStart++; else unsettled++; note = tp.lost === 0 ? 'lost from the deal' : 'no win found'; }
  else {
    if (tp.exact) exact++; else unsettled++;
    const line = RV.lineFrom(states[tp.k], tp.path);
    if (!line) { problems++; note = 'WINNING LINE DID NOT PLAY OUT'; }
    else {
      lines.push(line.steps.length);
      note = `turning point after move ${tp.k} of ${g.log.length}${tp.exact ? '' : ` (lost by ${tp.lost})`}, winning line ${line.steps.length} steps`;
      // Independent check of the claim: the position right after the player's move there is lost.
      if (tp.exact && tp.k + 1 < states.length) {
        const again = KL.solve(RV.toPos(states[tp.k + 1]), { maxNodes: 3e6, tableBits: 23 });
        if (again.result === 'win') { problems++; note += ' — BUT next position solves as a win'; }
      }
    }
  }
  console.log(`seed ${seed} draw ${draw}: ${note} [${tp.tried} solves, ${dt} ms]`);
}
lines.sort((a, b) => a - b);
console.log({ reviewed, exact, lostFromStart, unsettled, problems, avgMs: Math.round(totalMs / Math.max(1, reviewed)), maxMs,
  medianLine: lines[lines.length >> 1], longestLine: lines[lines.length - 1] });
process.exit(problems ? 1 : 0);
}
