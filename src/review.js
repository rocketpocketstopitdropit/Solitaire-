// Game review: replays a logged game, turns solver lines into game moves, and
// describes moves in plain words. Works on the game's own state format (card ids like
// "H7", piles stock/waste/f/t, an `up` map), so it runs in the page and in Node tests.
//
// A logged action is either { d: 1 } (tap the stock: draw, or turn the waste over)
// or { f: ref, i: index, t: ref } (move the cards from `index` up in pile `f` to pile `t`),
// where a ref is { k: 's' | 'w' | 'f' | 't', i: pile number }.

var RV = (function () {
  var SUITS = ['S', 'H', 'D', 'C'];
  var SYM = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };
  var RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  function info(id) { return { suit: id[0], rank: +id.slice(1) }; }
  function isRed(s) { return s === 'H' || s === 'D'; }
  function last(a) { return a[a.length - 1]; }
  function name(id) { var c = info(id); return RANKS[c.rank] + SYM[c.suit]; }
  function clone(g) { return JSON.parse(JSON.stringify(g)); }

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function deal(seed, draw) {
    var r = rng(seed), deck = [], i, s, k;
    for (s = 0; s < 4; s++) for (k = 1; k <= 13; k++) deck.push(SUITS[s] + k);
    for (i = deck.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
    var g = { seed: seed, draw: draw, stock: [], waste: [], f: [[], [], [], []], t: [[], [], [], [], [], [], []], up: {}, moves: 0, elapsed: 0, started: false, won: false, log: [] };
    for (var r2 = 0; r2 < 7; r2++) for (var c = r2; c < 7; c++) g.t[c].push(deck.pop());
    g.t.forEach(function (col) { g.up[last(col)] = true; });
    g.stock = deck;
    return g;
  }

  // Game state -> the solver's position format (see solver.js).
  function cardNum(id) { return SUITS.indexOf(id[0]) * 13 + (+id.slice(1)) - 1; }
  function idOf(c) { return SUITS[(c / 13) | 0] + (c % 13 + 1); }
  function toPos(g) {
    var found = [0, 0, 0, 0];
    g.f.forEach(function (p) { if (p.length) found[SUITS.indexOf(p[0][0])] = p.length; });
    return {
      cols: g.t.map(function (c) { return c.map(cardNum); }),
      down: g.t.map(function (c) { return c.filter(function (id) { return !g.up[id]; }).length; }),
      found: found,
      talon: g.waste.concat(g.stock.slice().reverse()).map(cardNum),
      w: g.waste.length - 1,
      draw: g.draw
    };
  }

  function pile(g, ref) { return ref.k === 's' ? g.stock : ref.k === 'w' ? g.waste : ref.k === 'f' ? g.f[ref.i] : g.t[ref.i]; }
  function canFound(g, id, fi) {
    var p = g.f[fi], c = info(id);
    if (!p.length) return c.rank === 1;
    var top = info(last(p));
    return top.suit === c.suit && c.rank === top.rank + 1;
  }
  function canTab(g, id, ti) {
    var col = g.t[ti], c = info(id);
    if (!col.length) return c.rank === 13;
    var topId = last(col);
    if (!g.up[topId]) return false;
    var top = info(topId);
    return isRed(top.suit) !== isRed(c.suit) && c.rank === top.rank - 1;
  }
  // Which foundation pile a card goes to: the one already holding its suit, else the
  // first empty one (the same pile a tap would pick).
  // Safe to put up: nothing could ever need to go on top of it again (an ace or two,
  // or both foundations of the other colour already hold the card one lower).
  function safe(g, id) {
    var c = info(id); if (c.rank <= 2) return true;
    var other = isRed(c.suit) ? ['S', 'C'] : ['H', 'D'], ok = 0;
    g.f.forEach(function (p) { if (p.length && other.indexOf(p[0][0]) >= 0 && p.length >= c.rank - 1) ok++; });
    return ok === 2;
  }
  function foundFor(g, id) { for (var f = 0; f < 4; f++) if (canFound(g, id, f)) return f; return -1; }

  function legal(g, a) {
    if (a.d) return g.stock.length > 0 || g.waste.length > 0;
    var from = pile(g, a.f);
    if (!from || a.i < 0 || a.i >= from.length) return false;
    var id = from[a.i];
    if (!g.up[id]) return false;
    if ((a.f.k === 'w' || a.f.k === 'f' || a.t.k === 'f') && a.i !== from.length - 1) return false;
    if (a.f.k === 's' || a.t.k === 's' || a.t.k === 'w') return false;
    if (a.f.k === a.t.k && a.f.i === a.t.i) return false;
    return a.t.k === 'f' ? canFound(g, id, a.t.i) : canTab(g, id, a.t.i);
  }
  // Applies an action in place, exactly as the game does. Returns what changed.
  function apply(g, a) {
    if (a.d) {
      if (g.stock.length) {
        var n = Math.min(g.draw, g.stock.length), moved = [];
        for (var i = 0; i < n; i++) { var id = g.stock.pop(); g.up[id] = true; g.waste.push(id); moved.push(id); }
        g.moves++;
        return { ids: moved };
      }
      g.stock = g.waste.reverse(); g.waste = [];
      g.stock.forEach(function (id) { g.up[id] = false; });
      g.moves++;
      return { ids: [], recycled: true };
    }
    var from = pile(g, a.f), to = pile(g, a.t), ids = from.splice(a.i), flipped = null;
    Array.prototype.push.apply(to, ids);
    if (a.f.k === 't' && from.length && !g.up[last(from)]) { flipped = last(from); g.up[flipped] = true; }
    g.moves++;
    return { ids: ids, flipped: flipped };
  }

  // Replays a game's log from its deal. Returns every state along the way
  // (states[i] is the table after i actions), or null if the log doesn't fit the deal.
  function replay(seed, draw, log) {
    var g = deal(seed, draw), states = [strip(g)];
    for (var i = 0; i < log.length; i++) {
      if (!legal(g, log[i])) return null;
      apply(g, log[i]);
      states.push(strip(g));
    }
    return states;
  }
  function strip(g) { return clone({ seed: g.seed, draw: g.draw, stock: g.stock, waste: g.waste, f: g.f, t: g.t, up: g.up }); }
  function sameTable(a, b) {
    var k = function (g) {
      var up = Object.keys(g.up).filter(function (id) { return g.up[id]; }).sort();
      return JSON.stringify([g.stock, g.waste, g.f, g.t, up]);
    };
    return k(a) === k(b);
  }

  // Turns a solver line (from KL.solve with trace) into steps of game actions. Each step
  // is the stock taps needed to bring a card up (if any) plus one move. When the solver
  // stops because the rest is a formality, a last step plays everything up.
  // Returns { steps: [{ acts, before }], states } or null if anything doesn't fit.
  function lineFrom(start, path) {
    var g = clone(start), steps = [], states = [strip(g)];
    function push(acts) {
      var before = strip(g);
      for (var i = 0; i < acts.length; i++) { if (!legal(g, acts[i])) return false; apply(g, acts[i]); }
      steps.push({ acts: acts, before: before, taps: acts.length - 1, ups: 0 });
      states.push(strip(g));
      return true;
    }
    function bringUp(id, acts) {
      var guard = 0, L = g.stock.length + g.waste.length;
      var h = clone(g);
      while (last(h.waste) !== id && guard++ < 2 * L + 4) { apply(h, { d: 1 }); acts.push({ d: 1 }); }
      return last(h.waste) === id;
    }
    for (var s = 0; s < path.length; s++) {
      var m = path[s], acts = [], id;
      if (m.t === 0) {
        id = last(g.t[m.s]);
        var up = { f: { k: 't', i: m.s }, i: g.t[m.s].length - 1, t: { k: 'f', i: foundFor(g, id) } };
        // A card that can go up with no possible downside rides along with the move
        // before it ("…then 2♣ goes up"), so the line has fewer steps to click through.
        var prev = steps[steps.length - 1];
        if (prev && safe(g, id) && legal(g, up)) {
          apply(g, up); prev.acts.push(up); prev.ups++;
          states[states.length - 1] = strip(g);
          continue;
        }
        acts.push(up);
      } else if (m.t === 1 || m.t === 2) {
        id = idOf(m.c);
        if (!bringUp(id, acts)) return null;
        var h = clone(g); for (var q = 0; q < acts.length; q++) apply(h, acts[q]);
        acts.push({ f: { k: 'w' }, i: h.waste.length - 1, t: m.t === 1 ? { k: 'f', i: foundFor(h, id) } : { k: 't', i: m.d } });
      } else if (m.t === 3) {
        acts.push({ f: { k: 't', i: m.s }, i: m.idx, t: { k: 't', i: m.d } });
      } else if (m.t === 4) {
        var fi = -1;
        for (var f = 0; f < 4; f++) if (g.f[f].length && g.f[f][0][0] === SUITS[m.su]) fi = f;
        if (fi < 0) return null;
        acts.push({ f: { k: 'f', i: fi }, i: g.f[fi].length - 1, t: { k: 't', i: m.d } });
      }
      if (!push(acts)) return null;
    }
    // Everything left is face up: play the lowest card that can go up, turning the
    // stock when nothing on the table can.
    var fin = [], before = strip(g), total = function () { return g.f.reduce(function (a, p) { return a + p.length; }, 0); };
    for (var guard = 0; guard < 3000 && total() < 52; guard++) {
      var best = null;
      g.t.forEach(function (col, c) {
        if (!col.length) return;
        var x = last(col), fi = foundFor(g, x);
        if (fi >= 0 && (!best || info(x).rank < info(last(pile(g, best.f))).rank)) best = { f: { k: 't', i: c }, i: col.length - 1, t: { k: 'f', i: fi } };
      });
      if (!best && g.waste.length) { var w = last(g.waste), wf = foundFor(g, w); if (wf >= 0) best = { f: { k: 'w' }, i: g.waste.length - 1, t: { k: 'f', i: wf } }; }
      if (!best) { if (!g.stock.length && !g.waste.length) return null; best = { d: 1 }; }
      apply(g, best); fin.push(best);
    }
    if (total() < 52) return null;
    if (fin.length) { steps.push({ acts: fin, before: before, finish: true }); states.push(strip(g)); }
    return { steps: steps, states: states };
  }

  // ---------- words ----------
  function where(ref) { return ref.k === 'w' ? 'the waste' : ref.k === 'f' ? 'the foundation' : 'column ' + (ref.i + 1); }
  // Describes a move (not a stock tap) about to be made from state g.
  function moveText(g, a) {
    var from = pile(g, a.f), ids = from.slice(a.i), id = ids[0], extra = ids.length - 1;
    var what = name(id) + (extra ? ' (and the ' + (extra === 1 ? 'card' : extra + ' cards') + ' on it)' : '');
    var src = a.f.k === 'w' ? ' from the waste' : a.f.k === 'f' ? ' back down from the foundation' : ' from column ' + (a.f.i + 1);
    var dst;
    if (a.t.k === 'f') dst = ' up to the foundation';
    else if (!g.t[a.t.i].length) dst = ' to the empty column ' + (a.t.i + 1);
    else dst = ' onto ' + name(last(g.t[a.t.i])) + ' in column ' + (a.t.i + 1);
    return 'Move ' + what + src + dst;
  }
  function tapText(g) {
    if (!g.stock.length) return 'Turn the waste back over to make a new stock';
    var n = Math.min(g.draw, g.stock.length);
    return g.draw === 1 ? 'Draw a card from the stock' : n === 3 ? 'Draw 3 from the stock' : 'Draw the last ' + (n === 1 ? 'card' : n + ' cards') + ' from the stock';
  }
  function actText(g, a) { return a.d ? tapText(g) : moveText(g, a); }
  // A step of the winning line: stock taps, a move, then any cards that go up after it.
  function stepText(step) {
    if (step.finish) return 'Everything is face up now. Play the rest up to the foundations';
    var acts = step.acts, taps = step.taps, mv = acts[taps];
    var h = clone(step.before);
    for (var i = 0; i < taps; i++) apply(h, acts[i]);
    var t = moveText(h, mv);
    if (taps) t = 'Tap the stock ' + (taps === 1 ? 'once' : taps + ' times') + ' to bring up ' + name(last(h.waste)) + ', then m' + t.slice(1).replace(' from the waste', '');
    if (step.ups) {
      var names = [], g3 = clone(h); apply(g3, mv);
      for (var u = taps + 1; u < acts.length; u++) { names.push(name(last(pile(g3, acts[u].f)))); apply(g3, acts[u]); }
      t += names.length > 4 ? '. Then ' + names.length + ' more cards go up to the foundations'
        : '. Then ' + list(names) + (names.length === 1 ? ' goes' : ' go') + ' up to the foundation';
    }
    return t;
  }
  function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  // The cards an action moves, for highlighting. For stock taps: the card it brings up.
  function cardsOf(g, a) {
    if (a.d) return [];
    return pile(g, a.f).slice(a.i);
  }

  return { deal: deal, toPos: toPos, apply: apply, legal: legal, replay: replay, lineFrom: lineFrom, sameTable: sameTable,
    actText: actText, stepText: stepText, cardsOf: cardsOf, name: name, pile: pile, clone: clone };
})();

if (typeof module !== 'undefined') module.exports = RV;
