// Klondike solver and "stuck" detector. Plain functions with no dependencies,
// so the same file runs in the game's Web Worker and in Node tests.
//
// Positions use card numbers 0..51: suit * 13 + (rank - 1), suits in the order
// spades, hearts, diamonds, clubs. A position is:
//   { cols: [7 arrays, bottom card first], down: [face-down count per column],
//     found: [cards on the foundation per suit], talon: [...], w, draw }
// The talon is the waste and stock as one list in the order cards are dealt:
// talon[0..w] is the waste (talon[w] on top), the rest is the stock.
// Turning the stock moves w forward by `draw` cards; at the end it goes back to -1.

var KL = (function () {
  var OPP = [[1, 2], [0, 3], [0, 3], [1, 2]];
  function suit(c) { return (c / 13) | 0; }
  function rank(c) { return c % 13; }
  function red(c) { var s = (c / 13) | 0; return s === 1 || s === 2; }

  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 13;
    }
    return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
  }

  // ---------- full solver (sees every card) ----------
  // Returns { result: 'win' | 'lose' | 'unknown', nodes }.
  function solve(inp, opts) {
    opts = opts || {};
    var maxNodes = opts.maxNodes || 1e9;
    var deadline = opts.deadline || Infinity;
    var cols = inp.cols.map(function (c) { return c.slice(); });
    var down = inp.down.slice(), found = inp.found.slice();
    var talon = inp.talon.slice(), w = inp.w, N = inp.draw;
    var nodes = 0, aborted = false;
    var TBITS = opts.tableBits || 22, TSIZE = 1 << TBITS, TMASK = TSIZE - 1, table = new Float64Array(TSIZE), filled = 0;
    var tpos = new Int8Array(52).fill(-1);
    for (var ti = 0; ti < talon.length; ti++) tpos[talon[ti]] = ti;
    var tmask = 0;
    for (ti = 0; ti < talon.length; ti++) tmask |= 1 << ti;
    function fmix(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return h ^ (h >>> 16); }
    function stateHash() {
      var sa = 0, sb = 0;
      for (var i = 0; i < 7; i++) {
        var p = cols[i], a = 0x9e3779b9 ^ down[i], b = 0x27d4eb2f + down[i] * 977;
        for (var j = 0; j < p.length; j++) {
          a = Math.imul(a ^ (p[j] + 1), 0x01000193);
          b = Math.imul(b + p[j] + 7, 0xcc9e2d51); b = (b << 15) | (b >>> 17);
        }
        sa = (sa + fmix(a)) | 0; sb = (sb + fmix(b ^ 0x5bd1e995)) | 0;
      }
      var f = found[0] | (found[1] << 4) | (found[2] << 8) | (found[3] << 12) | ((N === 1 ? 0 : w + 1) << 16);
      var A = fmix(sa ^ fmix(f) ^ Math.imul(tmask, 0x2545f491));
      var B = fmix(sb + fmix(tmask ^ 0x68e31da4) + Math.imul(f, 0x9e3779b1));
      return (A >>> 0) * 2097152 + ((B >>> 0) & 0x1fffff) + 1;
    }
    // Returns true if the position was already seen; otherwise records it.
    function visit(h) {
      var i = (h % TSIZE) & TMASK;
      while (true) {
        var v = table[i];
        if (v === 0) { table[i] = h; filled++; return false; }
        if (v === h) return true;
        i = (i + 1) & TMASK;
      }
    }

    function fits(c, d) {
      var p = cols[d];
      if (!p.length) return rank(c) === 12;
      var t = p[p.length - 1];
      return red(t) !== red(c) && rank(t) === rank(c) + 1;
    }
    function canF(c) { return found[suit(c)] === rank(c); }
    function safe(c) {
      var r = rank(c), o = OPP[suit(c)];
      return r <= 1 || (found[o[0]] >= r && found[o[1]] >= r);
    }
    function flip(s) {
      if (cols[s].length && down[s] === cols[s].length) { down[s]--; return true; }
      return false;
    }
    function reach() {
      var L = talon.length, out = [];
      if (!L) return out;
      var mark = new Uint8Array(L), p = w;
      if (p >= 0) { mark[p] = 1; out.push(p); }
      while (p < L - 1) { p = Math.min(p + N, L - 1); if (!mark[p]) { mark[p] = 1; out.push(p); } }
      p = -1;
      while (p < L - 1) { p = Math.min(p + N, L - 1); if (!mark[p]) { mark[p] = 1; out.push(p); } }
      return out;
    }
    function key() {
      var parts = [];
      for (var i = 0; i < 7; i++) {
        var s = String.fromCharCode(65 + down[i]);
        for (var j = 0; j < cols[i].length; j++) s += String.fromCharCode(48 + cols[i][j]);
        parts.push(s);
      }
      parts.sort();
      var k = String.fromCharCode(48 + found[0], 48 + found[1], 48 + found[2], 48 + found[3]);
      k += N === 1 ? '*' : String.fromCharCode(49 + w);
      for (var t = 0; t < talon.length; t++) k += String.fromCharCode(48 + talon[t]);
      return k + '|' + parts.join(',');
    }

    function doMove(m) {
      var c;
      switch (m.t) {
        case 0: c = cols[m.s].pop(); found[suit(c)]++; m.f = flip(m.s); m.c = c; break;           // tableau -> foundation
        case 1: c = talon[m.i]; talon.splice(m.i, 1); tmask ^= 1 << tpos[c]; m.ow = w; w = m.i - 1; found[suit(c)]++; m.c = c; break; // talon -> foundation
        case 2: c = talon[m.i]; talon.splice(m.i, 1); tmask ^= 1 << tpos[c]; m.ow = w; w = m.i - 1; cols[m.d].push(c); m.c = c; break; // talon -> tableau
        case 3: m.mv = cols[m.s].splice(m.idx); Array.prototype.push.apply(cols[m.d], m.mv); m.f = flip(m.s); break; // tableau -> tableau
        case 4: found[m.su]--; cols[m.d].push(m.su * 13 + found[m.su]); break;                    // foundation -> tableau
      }
    }
    function undoMove(m) {
      switch (m.t) {
        case 0: if (m.f) down[m.s]++; found[suit(m.c)]--; cols[m.s].push(m.c); break;
        case 1: found[suit(m.c)]--; talon.splice(m.i, 0, m.c); tmask ^= 1 << tpos[m.c]; w = m.ow; break;
        case 2: cols[m.d].pop(); talon.splice(m.i, 0, m.c); tmask ^= 1 << tpos[m.c]; w = m.ow; break;
        case 3: if (m.f) down[m.s]++; cols[m.d].length -= m.mv.length; Array.prototype.push.apply(cols[m.s], m.mv); break;
        case 4: cols[m.d].pop(); found[m.su]++; break;
      }
    }
    // Cards that can never be needed on the table again go up automatically.
    function autoplay() {
      var done = [], again = true;
      while (again) {
        again = false;
        for (var s = 0; s < 7; s++) {
          var p = cols[s];
          if (!p.length) continue;
          var c = p[p.length - 1];
          if (canF(c) && safe(c)) { var m = { t: 0, s: s }; doMove(m); done.push(m); again = true; }
        }
      }
      return done;
    }
    function undoAll(list) { for (var i = list.length - 1; i >= 0; i--) undoMove(list[i]); }

    // Could card x usefully take a card on top of it: a reachable stock card, or the
    // face-up stack sitting on face-down cards in another column?
    function accepts(x, R, skip) {
      var i, y;
      if (!opts.pfo) for (i = 0; i < R.length; i++) { y = talon[R[i]]; if (red(y) !== red(x) && rank(y) + 1 === rank(x)) return true; }
      for (i = 0; i < 7; i++) {
        if (i === skip || !down[i] || cols[i].length <= down[i]) continue;
        y = cols[i][down[i]];
        if (red(y) !== red(x) && rank(y) + 1 === rank(x)) return true;
      }
      return false;
    }
    function takesAnything(x, xi) {
      var i, j, y;
      for (i = 0; i < talon.length; i++) { if (i === xi) continue; y = talon[i]; if (red(y) !== red(x) && rank(y) + 1 === rank(x)) return true; }
      for (i = 0; i < 7; i++) for (j = down[i]; j < cols[i].length; j++) { y = cols[i][j]; if (red(y) !== red(x) && rank(y) + 1 === rank(x)) return true; }
      for (i = 0; i < 4; i++) { if (!found[i]) continue; y = i * 13 + found[i] - 1; if (red(y) !== red(x) && rank(y) + 1 === rank(x)) return true; }
      return false;
    }
    function gen() {
      var out = [], R = reach(), s, d, i, c, idx;
      var firstEmpty = -1;
      for (d = 0; d < 7; d++) if (!cols[d].length) { firstEmpty = d; break; }
      function okDest(c, d, s) { return d !== s && (cols[d].length || d === firstEmpty) && fits(c, d); }

      for (s = 0; s < 7; s++) { var p = cols[s]; if (p.length && canF(p[p.length - 1])) out.push({ t: 0, s: s }); }
      for (i = 0; i < R.length; i++) if (canF(talon[R[i]])) out.push({ t: 1, i: R[i] });

      var rev = [];
      for (s = 0; s < 7; s++) if (down[s] > 0 && cols[s].length > down[s]) rev.push(s);
      rev.sort(function (a, b) { return down[b] - down[a]; });
      for (var k = 0; k < rev.length; k++) {
        s = rev[k]; idx = down[s]; c = cols[s][idx];
        for (d = 0; d < 7; d++) if (okDest(c, d, s)) out.push({ t: 3, s: s, idx: idx, d: d });
      }
      for (i = 0; i < R.length; i++) {
        c = talon[R[i]];
        // With Draw 1 every stock card stays within reach, so putting one on the table
        // can wait until something is ready to go on top of it.
        if (N === 1 && !takesAnything(c, R[i])) continue;
        for (d = 0; d < 7; d++) if (okDest(c, d, -1)) out.push({ t: 2, i: R[i], d: d });
      }
      // Emptying a column only helps if a king is waiting for it.
      var kings = 0, empties = 0;
      for (s = 0; s < 7; s++) {
        if (!cols[s].length) empties++;
        else if (down[s] && rank(cols[s][down[s]]) === 12) kings++;
      }
      for (i = 0; i < R.length; i++) if (rank(talon[R[i]]) === 12) kings++;
      for (s = 0; kings > empties && s < 7; s++) {
        if (down[s] || !cols[s].length || rank(cols[s][0]) === 12) continue;
        c = cols[s][0];
        for (d = 0; d < 7; d++) if (d !== s && cols[d].length && fits(c, d)) out.push({ t: 3, s: s, idx: 0, d: d });
      }
      for (s = 0; s < 7; s++) {
        var q = cols[s];
        for (idx = down[s] + 1; idx < q.length; idx++) {
          c = q[idx]; var ex = q[idx - 1], useful = canF(ex) || accepts(ex, R, s);
          if (!useful) continue;
          for (d = 0; d < 7; d++) if (okDest(c, d, s)) out.push({ t: 3, s: s, idx: idx, d: d });
        }
      }
      for (var su = 0; su < 4; su++) {
        var r = found[su] - 1;
        if (r < 1) continue;
        var op = OPP[su];
        if (found[op[0]] >= r && found[op[1]] >= r) continue;
        c = su * 13 + r;
        if (!accepts(c, R, -1)) continue;
        for (d = 0; d < 7; d++) if (cols[d].length && fits(c, d)) out.push({ t: 4, su: su, d: d });
      }
      return out;
    }

    // Dead-end check. dep[i][j] means "the cards from position j up in column i could
    // all leave that column", worked out optimistically (ignoring how moves interfere
    // with each other). If even that says some column can never be cleared, the
    // position is lost. A card leaves by moving onto a card that can be uncovered,
    // by going to a foundation once it is on top and its lower cards can be reached,
    // or, for a king, by moving to an empty column.
    var colOf = new Int8Array(52), idxOf = new Int8Array(52);
    var dep = []; for (var di = 0; di < 7; di++) dep.push(new Uint8Array(20));
    function reachable(x) {
      if (found[suit(x)] > rank(x)) return true;
      var k = colOf[x];
      if (k < 0) return true;
      return dep[k][idxOf[x]] === 1 || dep[k][idxOf[x] + 1] === 1;
    }
    function parentOk(c) {
      var r = rank(c);
      if (r === 12) return true;
      var o = OPP[suit(c)];
      return reachable(o[0] * 13 + r + 1) || reachable(o[1] * 13 + r + 1);
    }
    function lowerOk(c) {
      var su = suit(c), r = rank(c);
      for (var k = found[su]; k < r; k++) if (!reachable(su * 13 + k)) return false;
      return true;
    }
    function frozen() {
      var i, j, p;
      colOf.fill(-1);
      for (i = 0; i < 7; i++) {
        p = cols[i]; dep[i].fill(0); dep[i][p.length] = 1;
        for (j = 0; j < p.length; j++) { colOf[p[j]] = i; idxOf[p[j]] = j; }
      }
      var changed = true;
      while (changed) {
        changed = false;
        for (i = 0; i < 7; i++) {
          p = cols[i]; var D = dep[i];
          for (j = p.length - 1; j >= 0; j--) {
            if (D[j]) continue;
            var c = p[j], pa = parentOk(c);
            if ((j >= down[i] && pa) || (D[j + 1] && (pa || lowerOk(c)))) { D[j] = 1; changed = true; }
          }
        }
      }
      for (i = 0; i < 7; i++) if (!dep[i][0]) return true;
      return false;
    }
    function score() {
      var sc = (found[0] + found[1] + found[2] + found[3]) * 2 - talon.length;
      for (var i = 0; i < 7; i++) { sc -= down[i] * (opts.dw || 5); if (!cols[i].length) sc += 1; }
      return sc;
    }
    function won() {
      if (found[0] + found[1] + found[2] + found[3] === 52) return true;
      for (var i = 0; i < 7; i++) if (down[i]) return false;
      // Everything on the table is face up. With the whole stock reachable the lowest
      // card left can always go up, so the game is won.
      return talon.length === 0 || N === 1;
    }

    function dfs() {
      if (won()) return true;
      if (visit(stateHash())) return false;
      nodes++;
      if (nodes > maxNodes || filled > TSIZE * 0.7 || ((nodes & 2047) === 0 && Date.now() > deadline)) { aborted = true; return false; }
      var moves = gen();
      if (opts.sort && moves.length > 1) {
        for (var q = 0; q < moves.length; q++) {
          var mm = moves[q]; doMove(mm); var au = autoplay();
          mm.sc = score() * 64 - q; undoAll(au); undoMove(mm);
          if (mm.t === 1 || mm.t === 2) mm.ow = undefined;
        }
        moves.sort(function (a, b) { return b.sc - a.sc; });
      }
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        doMove(m);
        var autos = autoplay();
        var r = dfs();
        if (r && path) { for (var a = autos.length - 1; a >= 0; a--) path.push(autos[a]); path.push(m); }
        undoAll(autos);
        undoMove(m);
        if (r) return true;
        if (aborted) return false;
      }
      return false;
    }

    var path = opts.trace ? [] : null;
    var first = autoplay();
    if (frozen()) return { result: 'lose', nodes: 0 };
    var ok = dfs();
    var out = { result: ok ? 'win' : aborted ? 'unknown' : 'lose', nodes: nodes };
    if (ok && path) out.path = first.concat(path.reverse());
    return out;
  }

  // ---------- stuck detector (uses only what the player can see) ----------
  // True when some sequence of legal moves gets more cards onto the foundations,
  // turns over a face-down card, or plays a card out of the stock. Moving cards back
  // and forth and cycling the stock don't count. Face-down cards are never looked at:
  // turning one over ends the search.
  function hasUsefulMove(inp, limit) {
    limit = limit || 30000;
    var N = inp.draw;
    function pot(s) { return s.found[0] + s.found[1] + s.found[2] + s.found[3] - s.talon.length; }
    function key(s) {
      var k = s.found.join('.') + ':' + s.w + ':';
      for (var i = 0; i < 7; i++) k += s.down[i] + '/' + s.cols[i].join(',') + ';';
      return k;
    }
    function clone(s) {
      return { cols: s.cols.map(function (c) { return c.slice(); }), down: s.down.slice(), found: s.found.slice(), talon: s.talon, w: s.w };
    }
    function fits(s, c, d) {
      var p = s.cols[d];
      if (!p.length) return rank(c) === 12;
      var t = p[p.length - 1];
      return red(t) !== red(c) && rank(t) === rank(c) + 1;
    }
    var start = clone(inp); start.talon = inp.talon.slice();
    var P0 = pot(start), seen = new Set([key(start)]), queue = [start], head = 0;

    while (head < queue.length) {
      if (seen.size > limit) return true;
      var s = queue[head++], next = [], d, c, i;
      var L = s.talon.length;
      if (s.w >= 0) {
        c = s.talon[s.w];
        if (s.found[suit(c)] === rank(c)) return true;
        for (d = 0; d < 7; d++) if (fits(s, c, d)) return true;
      }
      if (L) { var n = clone(s); n.w = s.w < L - 1 ? Math.min(s.w + N, L - 1) : -1; next.push(n); }
      for (var src = 0; src < 7; src++) {
        var p = s.cols[src];
        if (!p.length) continue;
        c = p[p.length - 1];
        if (s.found[suit(c)] === rank(c)) {
          var nf = clone(s); nf.cols[src].pop(); nf.found[suit(c)]++;
          if (nf.cols[src].length && nf.down[src] === nf.cols[src].length) return true;
          if (pot(nf) > P0) return true;
          next.push(nf);
        }
        for (var idx = s.down[src]; idx < p.length; idx++) {
          c = p[idx];
          for (d = 0; d < 7; d++) {
            if (d === src || !fits(s, c, d)) continue;
            if (idx === 0 && !s.cols[d].length) continue;
            if (idx === s.down[src] && s.down[src] > 0) return true;
            var nt = clone(s); var mv = nt.cols[src].splice(idx); Array.prototype.push.apply(nt.cols[d], mv);
            next.push(nt);
          }
        }
      }
      for (var su = 0; su < 4; su++) {
        if (!s.found[su]) continue;
        c = su * 13 + s.found[su] - 1;
        for (d = 0; d < 7; d++) {
          if (!fits(s, c, d)) continue;
          var nb = clone(s); nb.found[su]--; nb.cols[d].push(c); next.push(nb);
        }
      }
      for (i = 0; i < next.length; i++) {
        var k = key(next[i]);
        if (!seen.has(k)) { seen.add(k); queue.push(next[i]); }
      }
    }
    return false;
  }

  // ---------- turning point (for reviewing a finished game) ----------
  // positions[i] is the position after the player's i-th move (positions[0] is the deal).
  // Finds the last position from which the deal could still be won, seeing every card.
  // Each position follows from the one before by a legal move, so once a position is
  // lost every later one is too. That makes a binary search work: about log2(n) solves.
  // Returns { k, lost, exact, path, tried }:
  //   k     last position proven winnable (-1 if none), with path = a winning line from it
  //   lost  first position proven lost (positions.length if none)
  //   exact true when lost === k + 1, so the move from k to k+1 is the one that lost it
  function turningPoint(positions, opts) {
    opts = opts || {};
    var n = positions.length - 1, end = Date.now() + (opts.ms || 60000);
    var per = opts.perMs || 20000, bits = opts.tableBits || 21;
    var status = {}, paths = {}, tried = 0, i;
    if (opts.known) for (i in opts.known) status[i] = opts.known[i];
    function check(i, force) {
      if (status[i] && !(force && status[i] === 'win' && !paths[i])) return status[i];
      var left = end - Date.now();
      if (left <= 0 && !force) return 'unknown';
      var r = { result: 'unknown' };
      for (var b = bits; b >= 17; b -= 2) {
        try {
          r = solve(positions[i], { trace: true, tableBits: b, maxNodes: Math.floor((1 << b) * 0.68), deadline: Date.now() + Math.max(2000, Math.min(per, left)) });
          break;
        } catch (e) { r = { result: 'unknown' }; }
      }
      tried++;
      if (r.result !== 'unknown' || !status[i]) status[i] = r.result;
      if (r.path) paths[i] = r.path;
      if (opts.progress) opts.progress({ tried: tried, index: i, result: r.result });
      return status[i];
    }
    var lo = -1, hi = n + 1;
    function settle(i) { var r = check(i); if (r === 'win' && i > lo) lo = i; else if (r === 'lose' && i < hi) hi = i; }
    for (i in status) { if (status[i] === 'win' && +i > lo) lo = +i; if (status[i] === 'lose' && +i < hi) hi = +i; }
    // Most positions settle in well under a second. A first pass gives each a short
    // time; a second pass spends longer only on the ones still in the way.
    var full = per;
    for (var pass = 0; pass < 2 && hi - lo > 1; pass++) {
      per = pass ? full : Math.min(full, opts.quickMs || 3000);
      if (pass) for (i in status) if (status[i] === 'unknown' && +i >= lo && +i <= hi) delete status[i];
      // The end of the game first: if it can still be won, nothing has gone wrong yet.
      if (hi > n && !status[n]) settle(n);
      if (lo < 0 && hi > 0 && !status[0]) settle(0);
      while (hi - lo > 1 && Date.now() < end) {
        // Middle of the open range; skip positions the solver couldn't settle, leaning
        // later (later positions have fewer cards in play and solve faster).
        var ideal = (lo + hi) / 2, best = -1, bd = Infinity;
        for (i = Math.max(0, lo + 1); i < Math.min(hi, n + 1); i++) {
          if (status[i]) continue;
          var d = Math.abs(i - ideal) - (i > ideal ? 0.25 : 0);
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) break;
        settle(best);
      }
    }
    per = full;
    // A winnable start known from an earlier check has no line yet: solve it once more.
    if (lo >= 0 && !paths[lo]) { check(lo, true); if (!paths[lo]) lo = -1; }
    return { k: lo, lost: hi, exact: lo >= 0 && hi === lo + 1, path: lo >= 0 ? paths[lo] : null, tried: tried };
  }

  return { solve: solve, hasUsefulMove: hasUsefulMove, turningPoint: turningPoint };
})();

if (typeof module !== 'undefined') module.exports = KL;
