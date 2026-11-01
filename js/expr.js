/* Safe formula parser for x(t). No eval: tokens -> recursive descent -> closures. */
window.MM = window.MM || {};
(function () {
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, sign: Math.sign, min: Math.min, max: Math.max
  };
  const CONSTS = { pi: Math.PI, e: Math.E };

  function normalize(src) {
    return String(src)
      .replace(/^\s*x\s*\(\s*t\s*\)\s*=/i, '')
      .replace(/[−–]/g, '-')
      .replace(/[×·]/g, '*')
      .replace(/÷/g, '/')
      .replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/π/g, 'pi')
      .toLowerCase();
  }

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('Bad number near "' + s.slice(i, i + 4) + '"');
        out.push({ k: 'num', v: parseFloat(m[0]) });
        i += m[0].length; continue;
      }
      if (/[a-z]/.test(c)) {
        const m = /^[a-z]+/.exec(s.slice(i))[0];
        // split glued names like "tsin" or "pit" into known pieces
        let rest = m;
        while (rest.length) {
          const known = Object.keys(FUNCS).concat(Object.keys(CONSTS), ['t'])
            .filter(n => rest.startsWith(n)).sort((a, b) => b.length - a.length)[0];
          if (!known) throw new Error('Unknown name "' + rest + '"');
          out.push({ k: 'id', v: known });
          rest = rest.slice(known.length);
        }
        i += m.length; continue;
      }
      if ('+-*/^(),'.includes(c)) { out.push({ k: c }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return out;
  }

  function parse(tokens) {
    let p = 0;
    const peek = () => tokens[p];
    const take = k => {
      const t = tokens[p];
      if (!t || t.k !== k) throw new Error('Expected "' + k + '"');
      p++; return t;
    };
    const startsPrimary = t => t && (t.k === 'num' || t.k === 'id' || t.k === '(');

    function expr() {
      let left = term();
      while (peek() && (peek().k === '+' || peek().k === '-')) {
        const op = tokens[p++].k, a = left, b = term();
        left = op === '+' ? t => a(t) + b(t) : t => a(t) - b(t);
      }
      return left;
    }
    function term() {
      let left = unary();
      for (;;) {
        const t = peek();
        if (t && (t.k === '*' || t.k === '/')) {
          p++;
          const a = left, b = unary();
          left = t.k === '*' ? x => a(x) * b(x) : x => a(x) / b(x);
        } else if (startsPrimary(t)) { // implicit multiplication: 2t, 3sin(t), (t)(t)
          const a = left, b = power();
          left = x => a(x) * b(x);
        } else return left;
      }
    }
    function unary() {
      const t = peek();
      if (t && t.k === '-') { p++; const a = unary(); return x => -a(x); }
      if (t && t.k === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (peek() && peek().k === '^') {
        p++;
        const ex = unary();
        return x => Math.pow(base(x), ex(x));
      }
      return base;
    }
    function primary() {
      const t = tokens[p++];
      if (!t) throw new Error('Formula ends too early');
      if (t.k === 'num') { const v = t.v; return () => v; }
      if (t.k === '(') { const e = expr(); take(')'); return e; }
      if (t.k === 'id') {
        if (t.v === 't') return x => x;
        if (t.v in CONSTS) { const v = CONSTS[t.v]; return () => v; }
        const f = FUNCS[t.v];
        if (!peek() || peek().k !== '(') throw new Error(t.v + ' needs parentheses, like ' + t.v + '(t)');
        p++;
        const args = [expr()];
        while (peek() && peek().k === ',') { p++; args.push(expr()); }
        take(')');
        if (args.length === 1) { const a = args[0]; return x => f(a(x)); }
        return x => f.apply(null, args.map(a => a(x)));
      }
      throw new Error('Unexpected "' + t.k + '"');
    }

    const fn = expr();
    if (p < tokens.length) throw new Error('Unexpected "' + (tokens[p].k === 'num' ? tokens[p].v : tokens[p].k) + '"');
    return fn;
  }

  function compile(src) {
    try {
      const s = normalize(src);
      if (!s.trim()) return { error: 'Type a formula, for example 6 sin(t)' };
      const fn = parse(tokenize(s));
      let ok = 0;
      for (let t = 0; t <= 20; t += 0.5) if (Number.isFinite(fn(t))) ok++;
      if (!ok) return { error: 'This formula has no real values for t between 0 and 20 s' };
      return { fn: t => { const v = fn(t); return Number.isFinite(v) ? v : 0; } };
    } catch (err) {
      return { error: err.message };
    }
  }

  MM.Expr = { compile };
})();
