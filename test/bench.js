const KL = require('../src/solver.js');
const SUITS = ['S','H','D','C'];
function rng(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function deal(seed, draw){
  const r = rng(seed), deck = [];
  for(const s of SUITS) for(let k = 1; k <= 13; k++) deck.push(s + k);
  for(let i = deck.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const g = {seed, draw, stock: [], waste: [], f: [[],[],[],[]], t: [[],[],[],[],[],[],[]], up: {}};
  for(let r2 = 0; r2 < 7; r2++) for(let c = r2; c < 7; c++) g.t[c].push(deck.pop());
  g.t.forEach(col => g.up[col[col.length-1]] = true);
  g.stock = deck;
  return g;
}
const num = id => SUITS.indexOf(id[0]) * 13 + (+id.slice(1)) - 1;
function toPos(S){
  const found = [0,0,0,0];
  S.f.forEach(p => { if(p.length) found[SUITS.indexOf(p[0][0])] = p.length; });
  return { cols: S.t.map(c => c.map(num)), down: S.t.map(c => c.filter(id => !S.up[id]).length), found,
    talon: [...S.waste, ...S.stock.slice().reverse()].map(num), w: S.waste.length - 1, draw: S.draw };
}
module.exports = {deal, toPos};
if (require.main === module) {
  const draw = +(process.argv[2]||3), n = +(process.argv[3]||300), start = +(process.argv[4]||1);
  const tally = {win:0, lose:0, unknown:0}; const times = []; let stuckAtStart = 0;
  for (let s = start; s < start + n; s++) {
    const p = toPos(deal(s, draw));
    if (!KL.hasUsefulMove(p)) stuckAtStart++;
    const t0 = Date.now(); const r = KL.solve(p, {maxNodes: 1500000}); const dt = Date.now() - t0;
    tally[r.result]++; times.push([dt, r.result, r.nodes, s]);
  }
  times.sort((a,b)=>b[0]-a[0]);
  const tot = times.reduce((a,b)=>a+b[0],0);
  console.log('draw', draw, tally, 'win%', (100*tally.win/n).toFixed(1), 'stuck at start', stuckAtStart);
  console.log('total ms', tot, 'median', times[Math.floor(n/2)][0], 'slowest', times.slice(0,8).map(x=>x.join('/')).join('  '));
}
