// Easy deals are ones the plain strategy (KL.playsOut) wins two ways. Check that the
// full solver agrees every such deal can be won, and report how often each level hits.
const KL = require('../src/solver.js'), RV = require('../src/review.js');
let bad = 0;
for (const draw of [1, 3]) {
  let easy = 0, normal = 0; const N = 1500;
  for (let s = 1; s <= N; s++) {
    const p = RV.toPos(RV.deal(s, draw));
    if (KL.solve(p, { maxNodes: 5000, tableBits: 17 }).result === 'win') normal++;
    if (!(KL.playsOut(p, 0) && KL.playsOut(p, 1))) continue;
    easy++;
    if (KL.solve(p, { maxNodes: 2e6, tableBits: 22 }).result === 'lose') { bad++; console.log('easy deal the solver says is lost:', s, draw); }
  }
  console.log(`draw ${draw}: easy ${(100 * easy / N).toFixed(1)}% of deals, normal (quick win) ${(100 * normal / N).toFixed(1)}%`);
}
process.exit(bad ? 1 : 0);
