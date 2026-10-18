const KL = require('../src/solver.js'); const {deal, toPos} = require('./bench.js');
const draw = +process.argv[2], n = +process.argv[3], maxNodes = +(process.argv[4] || 200000), start = +(process.argv[5] || 1);
const tally = {win: 0, lose: 0, unknown: 0}; let tot = 0;
for (let s = start; s < start + n; s++) {
  const t0 = Date.now(); const r = KL.solve(toPos(deal(s, draw)), {maxNodes}); const dt = Date.now() - t0;
  tot += dt; tally[r.result]++;
  if (dt > 300) console.log(s, r.result, r.nodes, dt + 'ms');
}
console.log('draw', draw, tally, 'total', tot, 'ms');
