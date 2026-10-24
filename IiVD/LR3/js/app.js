
(function () {
  let DATA = [];
  let TOTAL = 0;
  const G = 0, S = 1, ATT = 2, C = 3, AGE = 4, G2 = 5, A1 = 6, E1 = 7, A2 = 8, E2 = 9, T = 10;
  const TARGET = ["Выпустились", "Ещё учатся", "Отчислены"];
  const TARGET_SHORT = ["выпуск", "учёба", "отчисление"];
  let COLORS = ["#2c5a38", "#355572", "#a33a22"];
  const STAGE = ["Нет оценок", "0 сдано", "1–5 сдано", "6+ сдано"];
  const STAGE_ORDER = [3, 2, 1, 0];
  const GROUPS = [
    "Здравоохранение",
    "Соц. работа",
    "Управление и маркетинг",
    "Дизайн и медиа",
    "STEM и агро",
    "Образование и туризм"
  ];
  let GROUP_COLORS = [];
  let SHEET = "#fbf3e0";
  let INK = "#2c170c";
  let MUTED = "#6d4e3a";
  let RULE = "#cbb58a";
  let FONT_UI = "Source Sans 3, Segoe UI, sans-serif";
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function refreshTheme() {
    COLORS = [cssVar("--grad", "#2c5a38"), cssVar("--enr", "#355572"), cssVar("--drop", "#a33a22")];
    GROUP_COLORS = [
      cssVar("--g0", "#4a6b58"),
      cssVar("--g1", "#a07830"),
      cssVar("--g2", "#6a4e3a"),
      cssVar("--g3", "#7a4460"),
      cssVar("--g4", "#3e5c48"),
      cssVar("--g5", "#8a4a32")
    ];
    SHEET = cssVar("--sheet", "#fbf3e0");
    INK = cssVar("--ink", "#2c170c");
    MUTED = cssVar("--muted", "#6d4e3a");
    RULE = cssVar("--rule", "#cbb58a");
    FONT_UI = cssVar("--font-ui", "Source Sans 3, Segoe UI, sans-serif");
  }
  const WORD = { one: "студент", few: "студента", many: "студентов" };

  const state = {
    gender: "all",
    sch: "all",
    att: "all",
    sunGroup: null,
    beeMetric: "age",
    beeIndex: -1,
    beePinned: false,
    skSel: null
  };

  const $ = (id) => document.getElementById(id);
  const nf0 = new Intl.NumberFormat("ru-RU");
  const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  function plural(n) {
    const abs = Math.abs(n) % 100;
    const d = abs % 10;
    if (abs > 10 && abs < 20) return WORD.many;
    if (d === 1) return WORD.one;
    if (d >= 2 && d <= 4) return WORD.few;
    return WORD.many;
  }
  function num(n) { return nf0.format(n); }
  function pct(part, whole) {
    if (!whole) return "—";
    return nf1.format((100 * part) / whole) + " %";
  }
  function stageOf(approved, enrolled) {
    if (enrolled === 0) return 0;
    if (approved === 0) return 1;
    if (approved <= 5) return 2;
    return 3;
  }
  function median(values) {
    if (!values.length) return null;
    const s = values.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function filtered() {
    return DATA.filter((r) => {
      if (state.gender !== "all" && r[G] !== +state.gender) return false;
      if (state.sch !== "all" && r[S] !== +state.sch) return false;
      if (state.att !== "all" && r[ATT] !== +state.att) return false;
      return true;
    });
  }

  const tooltip = $("tooltip");
  function showTip(html, x, y) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const w = tooltip.offsetWidth;
    const h = tooltip.offsetHeight;
    let left = x + 14;
    let top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 12;
    if (top + h > window.innerHeight - 8) top = y - h - 12;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }
  function hideTip() { tooltip.hidden = true; }

  function setHero(rows) {
    const n = rows.length;
    const c = [0, 0, 0];
    for (const r of rows) c[r[T]]++;
    $("hero-n").textContent = num(n);
    $("kpi-g").textContent = n ? pct(c[0], n) : "—";
    $("kpi-e").textContent = n ? pct(c[1], n) : "—";
    $("kpi-d").textContent = n ? pct(c[2], n) : "—";
    $("filter-n").textContent = `${num(n)} ${plural(n)}`;
    $("filter-sub").textContent = `из ${num(TOTAL)} в исходных данных`;
  }

  function countsTarget(rows) {
    const c = [0, 0, 0];
    for (const r of rows) c[r[T]]++;
    return c;
  }

  /* ---------- Sankey ---------- */
  function sankeyData(rows) {
    const n1 = [0, 0, 0, 0];
    const n2 = [0, 0, 0, 0];
    const nt = [0, 0, 0];
    const l12 = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const l2t = Array.from({ length: 4 }, () => [0, 0, 0]);
    const trip = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [0, 0, 0]));
    for (const r of rows) {
      const s1 = stageOf(r[A1], r[E1]);
      const s2 = stageOf(r[A2], r[E2]);
      const t = r[T];
      n1[s1]++; n2[s2]++; nt[t]++;
      l12[s1][s2]++; l2t[s2][t]++; trip[s1][s2][t]++;
    }
    return { n1, n2, nt, l12, l2t, trip, n: rows.length };
  }

  function layoutColumn(values, order, x, innerH, y0, gap) {
    const present = order.filter((i) => values[i] > 0);
    const total = values.reduce((s, v) => s + v, 0) || 1;
    const gaps = Math.max(0, present.length - 1) * gap;
    const avail = innerH - gaps;
    let y = y0;
    const nodes = [];
    const map = {};
    for (const i of present) {
      const h = Math.max(4, (values[i] / total) * avail);
      const node = { i, x, y, h, v: values[i] };
      nodes.push(node);
      map[i] = node;
      y += h + gap;
    }
    return { nodes, map };
  }

  function linkPath(x0, y0, y1, x1, y2, y3) {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0}C${mx},${y0} ${mx},${y2} ${x1},${y2}L${x1},${y3}C${mx},${y3} ${mx},${y1} ${x0},${y1}Z`;
  }

  function renderSankey(rows) {
    const svg = $("sankey-svg");
    const sd = sankeyData(rows);
    if (!sd.n) {
      svg.innerHTML = '<text class="empty-note" x="320" y="250">Нет студентов в выбранном фильтре</text>';
      $("sankey-title").textContent = "Пустой фильтр";
      $("sankey-big").textContent = "0";
      $("sankey-unit").textContent = "студентов на графике";
      $("sankey-break").textContent = "Снимите часть условий, чтобы снова увидеть потоки.";
      $("sankey-table").tBodies[0].innerHTML = "";
      return sd;
    }
    const W = 16, GAP = 16, TOP = 18, INNER = 454;
    const col = [
      layoutColumn(sd.n1, STAGE_ORDER, 118, INNER, TOP, GAP),
      layoutColumn(sd.n2, STAGE_ORDER, 312, INNER, TOP, GAP),
      layoutColumn(sd.nt, [0, 1, 2], 506, INNER, TOP, GAP)
    ];
    const links = [];
    function stackOut(map, keys, getVal) {
      const outY = {};
      for (const id of Object.keys(map)) {
        let y = map[id].y;
        outY[id] = {};
        for (const k of keys) {
          const v = getVal(+id, k);
          if (!v) continue;
          const h = (v / map[id].v) * map[id].h;
          outY[id][k] = { y, h, v };
          y += h;
        }
      }
      return outY;
    }
    const out12 = stackOut(col[0].map, STAGE_ORDER, (a, b) => sd.l12[a][b]);
    const in12Acc = {};
    for (const id of Object.keys(col[1].map)) in12Acc[id] = col[1].map[id].y;
    for (const s1 of STAGE_ORDER) {
      if (!col[0].map[s1]) continue;
      for (const s2 of STAGE_ORDER) {
        const chunk = out12[s1] && out12[s1][s2];
        if (!chunk || !col[1].map[s2]) continue;
        const ty = in12Acc[s2];
        const th = (chunk.v / col[1].map[s2].v) * col[1].map[s2].h;
        links.push({
          kind: "12", s1, s2, v: chunk.v,
          d: linkPath(118 + W, chunk.y, chunk.y + chunk.h, 312, ty, ty + th),
          fill: cssVar("--link-mid", "#8d7a5e")
        });
        in12Acc[s2] += th;
      }
    }
    const out2t = stackOut(col[1].map, [0, 1, 2], (a, b) => sd.l2t[a][b]);
    const inT = {};
    for (const id of Object.keys(col[2].map)) inT[id] = col[2].map[id].y;
    for (const s2 of STAGE_ORDER) {
      if (!col[1].map[s2]) continue;
      for (const t of [0, 1, 2]) {
        const chunk = out2t[s2] && out2t[s2][t];
        if (!chunk || !col[2].map[t]) continue;
        const ty = inT[t];
        const th = (chunk.v / col[2].map[t].v) * col[2].map[t].h;
        links.push({
          kind: "2t", s2, t, v: chunk.v,
          d: linkPath(312 + W, chunk.y, chunk.y + chunk.h, 506, ty, ty + th),
          fill: COLORS[t]
        });
        inT[t] += th;
      }
    }

    let html = '<text class="muted" x="126" y="12" font-size="11" text-anchor="middle">1 семестр</text>';
    html += '<text class="muted" x="320" y="12" font-size="11" text-anchor="middle">2 семестр</text>';
    html += '<text class="muted" x="514" y="12" font-size="11" text-anchor="middle">Итог</text>';
    links.forEach((ln, i) => {
      const sel = encodeSel(ln);
      const on = state.skSel && state.skSel === sel;
      const dim = state.skSel && !on;
      html += `<path class="sk-link" data-sel="${sel}" d="${ln.d}" fill="${ln.fill}" fill-opacity="${dim ? 0.07 : on ? 0.72 : 0.38}"></path>`;
    });
    function nodesHtml(pack, kind, labels, colors) {
      let s = "";
      for (const n of pack.nodes) {
        const fill = colors ? colors[n.i] : INK;
        const sel = kind + ":" + n.i;
        const on = state.skSel === sel;
        s += `<rect class="sk-node" data-sel="${sel}" x="${n.x}" y="${n.y}" width="${W}" height="${n.h}" rx="1.5" fill="${fill}"></rect>`;
        const labelX = kind === "s1" ? n.x - 8 : n.x + W + 8;
        const anchor = kind === "s1" ? "end" : "start";
        const ly = n.y + n.h / 2 + 4;
        s += `<text class="${on ? "" : "muted"}" x="${labelX}" y="${ly}" font-size="11" text-anchor="${anchor}" stroke="${SHEET}" stroke-width="4" paint-order="stroke">${labels[n.i]}</text>`;
      }
      return s;
    }
    html += nodesHtml(col[0], "s1", STAGE, null);
    html += nodesHtml(col[1], "s2", STAGE, null);
    html += nodesHtml(col[2], "t", TARGET, COLORS);
    svg.innerHTML = html;

    const n66 = sd.l12[3][3];
    const g66 = sd.trip[3][3][0];
    const n00 = sd.l12[1][1];
    const d00 = sd.trip[1][1][2];
    const parts = [];
    if (n66) parts.push(`из ${num(n66)} сдавших 6+ в обоих семестрах выпустились ${num(g66)} (${pct(g66, n66)})`);
    if (n00) parts.push(`из ${num(n00)} с нулём сданных в обоих семестрах отчислены ${num(d00)} (${pct(d00, n00)})`);
    $("sankey-insight").textContent = parts.length
      ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(". ") + "."
      : "Толщина ленты — число студентов в текущем фильтре.";

    if (!state.skSel) {
      $("sankey-title").textContent = "Все студенты в фильтре";
      $("sankey-big").textContent = num(sd.n);
      $("sankey-unit").textContent = plural(sd.n) + " на графике";
      $("sankey-break").textContent = "Наведите на ленту или узел, чтобы увидеть численность и долю.";
    } else {
      applySankeySel(sd, state.skSel);
    }

    const body = $("sankey-table").tBodies[0];
    const lines = [];
    for (const s1 of STAGE_ORDER) {
      for (const s2 of STAGE_ORDER) {
        for (const t of [0, 1, 2]) {
          const v = sd.trip[s1][s2][t];
          if (!v) continue;
          lines.push(`<tr><td>${STAGE[s1]}</td><td>${STAGE[s2]}</td><td>${TARGET[t]}</td><td>${num(v)}</td><td>${pct(v, sd.n)}</td></tr>`);
        }
      }
    }
    body.innerHTML = lines.join("");
    return sd;
  }

  function encodeSel(ln) {
    return ln.kind === "12" ? `l12:${ln.s1}:${ln.s2}` : `l2t:${ln.s2}:${ln.t}`;
  }

  function applySankeySel(sd, sel) {
    if (!sd || !sd.n || !sel) return;
    const p = sel.split(":");
    if (p[0] === "l12") {
      const s1 = +p[1], s2 = +p[2], v = sd.l12[s1][s2];
      $("sankey-title").textContent = `${STAGE[s1]} → ${STAGE[s2]}`;
      $("sankey-big").textContent = num(v);
      $("sankey-unit").textContent = plural(v);
      $("sankey-break").textContent = `${pct(v, sd.n)} от фильтра · дальше: ${TARGET.map((name, t) => `${name} ${num(sd.trip[s1][s2][t])}`).join(" · ")}`;
    } else if (p[0] === "l2t") {
      const s2 = +p[1], t = +p[2], v = sd.l2t[s2][t];
      $("sankey-title").textContent = `${STAGE[s2]} → ${TARGET[t]}`;
      $("sankey-big").textContent = num(v);
      $("sankey-unit").textContent = plural(v);
      $("sankey-break").textContent = `${pct(v, sd.n)} от фильтра · ${pct(v, sd.n2[s2])} из узла «${STAGE[s2]}».`;
    } else if (p[0] === "s1") {
      const i = +p[1], v = sd.n1[i];
      $("sankey-title").textContent = "1 семестр · " + STAGE[i];
      $("sankey-big").textContent = num(v);
      $("sankey-unit").textContent = plural(v);
      $("sankey-break").textContent = `${pct(v, sd.n)} от фильтра.`;
    } else if (p[0] === "s2") {
      const i = +p[1], v = sd.n2[i];
      $("sankey-title").textContent = "2 семестр · " + STAGE[i];
      $("sankey-big").textContent = num(v);
      $("sankey-unit").textContent = plural(v);
      $("sankey-break").textContent = `${pct(v, sd.n)} от фильтра.`;
    } else if (p[0] === "t") {
      const i = +p[1], v = sd.nt[i];
      $("sankey-title").textContent = TARGET[i];
      $("sankey-big").textContent = num(v);
      $("sankey-unit").textContent = plural(v);
      $("sankey-break").textContent = `${pct(v, sd.n)} от фильтра.`;
    }
  }

  let lastSankey = null;
  function sankeyTip(sel, x, y) {
    if (!lastSankey) return;
    const p = sel.split(":");
    let title = "", rest = "";
    if (p[0] === "l12") {
      const v = lastSankey.l12[+p[1]][+p[2]];
      title = `${STAGE[+p[1]]} → ${STAGE[+p[2]]}`;
      rest = `${num(v)} ${plural(v)} · ${pct(v, lastSankey.n)}`;
    } else if (p[0] === "l2t") {
      const v = lastSankey.l2t[+p[1]][+p[2]];
      title = `${STAGE[+p[1]]} → ${TARGET[+p[2]]}`;
      rest = `${num(v)} ${plural(v)} · ${pct(v, lastSankey.n)}`;
    } else if (p[0] === "s1") {
      title = "1 семестр · " + STAGE[+p[1]];
      rest = `${num(lastSankey.n1[+p[1]])} · ${pct(lastSankey.n1[+p[1]], lastSankey.n)}`;
    } else if (p[0] === "s2") {
      title = "2 семестр · " + STAGE[+p[1]];
      rest = `${num(lastSankey.n2[+p[1]])} · ${pct(lastSankey.n2[+p[1]], lastSankey.n)}`;
    } else {
      title = TARGET[+p[1]];
      rest = `${num(lastSankey.nt[+p[1]])} · ${pct(lastSankey.nt[+p[1]], lastSankey.n)}`;
    }
    showTip(`<strong>${title}</strong><span class="soft">${rest}</span>`, x, y);
  }

  /* ---------- Sunburst ---------- */
  function sunCounts(rows) {
    const g = Array.from({ length: 6 }, () => [0, 0, 0]);
    for (const r of rows) g[r[C]][r[T]]++;
    return g;
  }
  function polar(cx, cy, r, a) {
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }
  function arcPath(cx, cy, r0, r1, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = polar(cx, cy, r1, a0);
    const p1 = polar(cx, cy, r1, a1);
    const p2 = polar(cx, cy, r0, a1);
    const p3 = polar(cx, cy, r0, a0);
    return `M${p0[0]},${p0[1]}A${r1},${r1} 0 ${large} 1 ${p1[0]},${p1[1]}L${p2[0]},${p2[1]}A${r0},${r0} 0 ${large} 0 ${p3[0]},${p3[1]}Z`;
  }

  function renderSun(rows) {
    const svg = $("sun-svg");
    const g = sunCounts(rows);
    const totals = g.map((row) => row[0] + row[1] + row[2]);
    const n = rows.length;
    if (state.sunGroup != null && !totals[state.sunGroup]) state.sunGroup = null;
    if (!n) {
      svg.innerHTML = '<text class="empty-note" x="320" y="320">Нет студентов в выбранном фильтре</text>';
      $("sun-legend").innerHTML = "";
      $("sun-table").tBodies[0].innerHTML = "";
      $("sun-crumb").innerHTML = "";
      $("sun-title").textContent = "Пустой фильтр";
      $("sun-big").textContent = "0";
      return;
    }
    const cx = 320, cy = 320, r0 = 78, r1 = 178, r2 = 268;
    let html = "";
    const slices = [];
    if (state.sunGroup == null) {
      let a = 0;
      for (let i = 0; i < 6; i++) {
        if (!totals[i]) continue;
        const da = (totals[i] / n) * Math.PI * 2;
        const a1 = a + da;
        slices.push({ kind: "g", i, a0: a, a1, r0, r1, fill: GROUP_COLORS[i], v: totals[i] });
        let b = a;
        for (let t = 0; t < 3; t++) {
          if (!g[i][t]) continue;
          const db = (g[i][t] / n) * Math.PI * 2;
          slices.push({ kind: "gt", i, t, a0: b, a1: b + db, r0: r1, r1: r2, fill: COLORS[t], v: g[i][t] });
          b += db;
        }
        a = a1;
      }
    } else {
      const i = state.sunGroup;
      const tot = totals[i] || 1;
      slices.push({ kind: "g", i, a0: 0, a1: Math.PI * 2 - 1e-4, r0, r1, fill: GROUP_COLORS[i], v: totals[i] });
      let b = 0;
      for (let t = 0; t < 3; t++) {
        if (!g[i][t]) continue;
        const db = (g[i][t] / tot) * (Math.PI * 2 - 1e-4);
        slices.push({ kind: "gt", i, t, a0: b, a1: b + db, r0: r1, r1: r2, fill: COLORS[t], v: g[i][t] });
        b += db;
      }
    }
    for (const sl of slices) {
      html += `<path class="sun-arc" data-kind="${sl.kind}" data-i="${sl.i}" data-t="${sl.t ?? ""}" d="${arcPath(cx, cy, sl.r0, sl.r1, sl.a0, sl.a1)}" fill="${sl.fill}" stroke="${SHEET}" stroke-width="2"></path>`;
    }
    if (state.sunGroup == null) {
      let a = 0;
      for (let i = 0; i < 6; i++) {
        if (!totals[i]) continue;
        const da = (totals[i] / n) * Math.PI * 2;
        if (da > 0.38) {
          const mid = a + da / 2;
          const [x, y] = polar(cx, cy, (r0 + r1) / 2, mid);
          const label = GROUPS[i].replace(" и ", " и\n");
          const lines = GROUPS[i].length > 16 ? [GROUPS[i].split(" ")[0], GROUPS[i].split(" ").slice(1).join(" ")] : [GROUPS[i]];
          lines.forEach((ln, k) => {
            html += `<text fill="${INK}" stroke="${SHEET}" stroke-width="4" paint-order="stroke" font-size="11" text-anchor="middle" x="${x}" y="${y - (lines.length - 1) * 7 + k * 13}">${ln}</text>`;
          });
        }
        a += da;
      }
    }
    const centerN = state.sunGroup == null ? n : totals[state.sunGroup];
    html += `<circle cx="${cx}" cy="${cy}" r="${r0 - 4}" fill="${SHEET}"></circle>`;
    html += `<text text-anchor="middle" x="${cx}" y="${cy - 4}" font-size="22" font-weight="700">${num(centerN)}</text>`;
    html += `<text class="muted" text-anchor="middle" x="${cx}" y="${cy + 16}" font-size="11">${plural(centerN)}</text>`;
    svg.innerHTML = html;

    const dropRates = totals.map((t, i) => ({ i, t, d: t ? g[i][2] / t : 0, gr: t ? g[i][0] / t : 0 }));
    const withData = dropRates.filter((x) => x.t);
    const worst = withData.slice().sort((a, b) => b.d - a.d)[0];
    const best = withData.slice().sort((a, b) => b.gr - a.gr)[0];
    $("sun-insight").textContent = worst && best
      ? `Самая высокая доля отчислений — ${GROUPS[worst.i]} (${pct(g[worst.i][2], worst.t)}). Самая высокая доля выпускников — ${GROUPS[best.i]} (${pct(g[best.i][0], best.t)}).`
      : "Площадь сектора — число студентов в текущем фильтре.";

    const crumb = $("sun-crumb");
    if (state.sunGroup == null) {
      crumb.innerHTML = '<button type="button" data-back="all">Все группы</button>';
      $("sun-title").textContent = "Все группы";
      $("sun-big").textContent = num(n);
      $("sun-unit").textContent = plural(n);
      $("sun-break").textContent = "Нажмите внутреннее кольцо, чтобы раскрыть одну группу.";
    } else {
      const i = state.sunGroup;
      crumb.innerHTML = `<button type="button" data-back="all">Все группы</button><span class="sep">/</span><button type="button">${GROUPS[i]}</button>`;
      $("sun-title").textContent = GROUPS[i];
      $("sun-big").textContent = num(totals[i]);
      $("sun-unit").textContent = plural(totals[i]);
      $("sun-break").textContent = `Выпуск ${pct(g[i][0], totals[i])} · учёба ${pct(g[i][1], totals[i])} · отчисление ${pct(g[i][2], totals[i])}`;
    }

    $("sun-legend").innerHTML = TARGET.map((name, t) => {
      const v = state.sunGroup == null ? countsTarget(rows)[t] : g[state.sunGroup][t];
      const den = state.sunGroup == null ? n : totals[state.sunGroup];
      return `<li><i class="dot ${["grad", "enr", "drop"][t]}"></i><span class="legend-text">${name}<br><strong>${pct(v, den)}</strong></span></li>`;
    }).join("");

    $("sun-table").tBodies[0].innerHTML = GROUPS.map((name, i) => {
      if (!totals[i]) return "";
      return `<tr><td>${name}</td><td>${num(g[i][0])}</td><td>${num(g[i][1])}</td><td>${num(g[i][2])}</td><td>${num(totals[i])}</td><td>${pct(g[i][2], totals[i])}</td></tr>`;
    }).join("");
  }

  function sunTip(el, x, y) {
    const rows = currentRows;
    const g = sunCounts(rows);
    const n = rows.length;
    const i = +el.dataset.i;
    if (el.dataset.kind === "g") {
      const tot = g[i][0] + g[i][1] + g[i][2];
      showTip(`<strong>${GROUPS[i]}</strong><span class="soft">${num(tot)} ${plural(tot)} · ${pct(tot, n)} от фильтра<br>выпуск ${pct(g[i][0], tot)} · отчисление ${pct(g[i][2], tot)}</span>`, x, y);
    } else {
      const t = +el.dataset.t;
      const tot = g[i][0] + g[i][1] + g[i][2];
      showTip(`<strong>${GROUPS[i]} · ${TARGET[t]}</strong><span class="soft">${num(g[i][t])} ${plural(g[i][t])} · ${pct(g[i][t], tot)} группы · ${pct(g[i][t], n)} фильтра</span>`, x, y);
    }
  }

  /* ---------- Beeswarm ---------- */
  const bee = {
    points: [],
    cols: [0, 1, 2],
    r: 1.6,
    layout: null
  };

  function dodge(items, r) {
    const r2 = (r * 2) ** 2;
    const sorted = items.slice().sort((a, b) => a.y - b.y);
    const placed = [];
    for (const n of sorted) {
      let x = 0;
      const near = [];
      for (let i = placed.length - 1; i >= 0; i--) {
        const p = placed[i];
        if (n.y - p.y > r * 2) break;
        near.push(p);
      }
      if (near.length) {
        const cands = [0];
        for (const p of near) {
          const dy = n.y - p.y;
          const dx = Math.sqrt(Math.max(0, r2 - dy * dy)) + 0.02;
          cands.push(p.x + dx, p.x - dx);
        }
        cands.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
        let found = false;
        for (const cx of cands) {
          let ok = true;
          for (const p of near) {
            const dx = p.x - cx, dy = p.y - n.y;
            if (dx * dx + dy * dy < r2 - 0.08) { ok = false; break; }
          }
          if (ok) { x = cx; found = true; break; }
        }
        if (!found) {
          let step = r;
          for (let k = 0; k < 80; k++) {
            step += r * 0.7;
            const tryX = [step, -step];
            for (const cx of tryX) {
              let ok = true;
              for (const p of near) {
                const dx = p.x - cx, dy = p.y - n.y;
                if (dx * dx + dy * dy < r2 - 0.08) { ok = false; break; }
              }
              if (ok) { x = cx; found = true; break; }
            }
            if (found) break;
          }
        }
      }
      n.x = x;
      placed.push(n);
    }
    return sorted;
  }

  function fitDodge(items, maxHalf) {
    let r = items.length > 1600 ? 1.45 : 1.7;
    let nodes = dodge(items, r);
    for (let i = 0; i < 5; i++) {
      const maxX = nodes.reduce((m, n) => Math.max(m, Math.abs(n.x)), 0);
      if (maxX <= maxHalf || r < 1.05) return { nodes, r };
      r *= 0.86;
      items.forEach((n) => { n.x = 0; });
      nodes = dodge(items, r);
    }
    return { nodes, r };
  }

  function renderBee(rows) {
    const canvas = $("bee-canvas");
    const metric = state.beeMetric;
    const groups = [[], [], []];
    for (const r of rows) groups[r[T]].push(r);
    const values = (arr) => arr.map((r) => (metric === "age" ? r[AGE] : r[G2]));
    const allVals = values(rows);
    let vmin = metric === "age" ? 16 : 0;
    let vmax = metric === "age" ? 72 : 20;
    if (allVals.length) {
      vmin = metric === "age" ? Math.min(16, ...allVals) - 1 : 0;
      vmax = metric === "age" ? Math.max(72, ...allVals) + 1 : 20;
    }
    const W = 980, H = 500;
    const padL = 54, padR = 18, padT = 28, padB = 54;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const colW = innerW / 3;
    const yOf = (v) => padT + ((vmax - v) / (vmax - vmin)) * innerH;
    bee.points = [];
    bee.r = 1.5;
    if (rows.length) {
      for (let t = 0; t < 3; t++) {
        const cx = padL + colW * t + colW / 2;
        const items = groups[t].map((row) => ({
          r: row, t, v: metric === "age" ? row[AGE] : row[G2],
          y: yOf(metric === "age" ? row[AGE] : row[G2]),
          x: 0, cx
        }));
        const { nodes, r } = fitDodge(items, colW / 2 - 10);
        bee.r = r;
        for (const n of nodes) {
          n.px = n.cx + n.x;
          n.py = n.y;
          n.rad = r;
          bee.points.push(n);
        }
      }
    }
    bee.layout = { padL, padR, padT, padB, W, H, innerW, innerH, colW, vmin, vmax, yOf, groups, metric };
    if (state.beeIndex >= bee.points.length) state.beeIndex = bee.points.length ? 0 : -1;
    drawBee();
    const meds = groups.map((arr) => median(values(arr)));
    const zeros = groups.map((arr) => arr.filter((r) => r[G2] === 0).length);
    if (metric === "age") {
      const m0 = meds[0], m2 = meds[2];
      $("bee-insight").textContent = m0 != null && m2 != null
        ? `Выпускники поступают раньше: медиана ${nf1.format(m0)} лет против ${nf1.format(m2)} у отчисленных.`
        : "Каждая точка — один студент.";
      $("bee-note").textContent = "Возраст — полных лет на момент зачисления. Разброс вбок не несёт смысла, только разделяет точки.";
    } else {
      const z = zeros[2], d = groups[2].length;
      $("bee-insight").textContent = d
        ? `У ${num(z)} из ${num(d)} отчисленных нет оценки за 2 семестр — это отсутствие сданных предметов, не «ноль баллов».`
        : "Каждая точка — один студент.";
      $("bee-note").textContent = "Шкала баллов за предметы: 0–20. Ноль чаще значит, что семестровой оценки нет.";
    }
    $("bee-stats").innerHTML = TARGET.map((name, t) => {
      const m = meds[t];
      const unit = metric === "age" ? "лет" : "";
      const extra = metric === "g2" ? `<br>без оценки ${num(zeros[t])}` : "";
      return `<div><strong>${name}</strong>${num(groups[t].length)} · медиана ${m == null ? "—" : nf1.format(m)} ${unit}${extra}</div>`;
    }).join("");
    $("bee-table").tBodies[0].innerHTML = TARGET.map((name, t) => {
      const vals = values(groups[t]);
      const fmt = (v) => (metric === "age" ? num(v) : nf1.format(v));
      const mn = vals.length ? fmt(Math.min(...vals)) : "—";
      const mx = vals.length ? fmt(Math.max(...vals)) : "—";
      const m = meds[t];
      const z = metric === "g2" ? num(zeros[t]) : "—";
      return `<tr><td>${name}</td><td>${num(groups[t].length)}</td><td>${m == null ? "—" : nf1.format(m)}</td><td>${z}</td><td>${mn}</td><td>${mx}</td></tr>`;
    }).join("");
    updateBeeDetail();
  }

  function drawBee() {
    const canvas = $("bee-canvas");
    const ctx = canvas.getContext("2d");
    const L = bee.layout;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 980;
    const cssH = cssW * (500 / 980);
    canvas.style.height = cssH + "px";
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = cssW / 980;
    const sy = cssH / 500;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.scale(sx, sy);
    ctx.fillStyle = MUTED;
    ctx.font = "11px " + FONT_UI;
    ctx.textAlign = "right";
    const ticks = L.metric === "age" ? [20, 30, 40, 50, 60, 70] : [0, 5, 10, 15, 20];
    ticks.forEach((v) => {
      if (v < L.vmin || v > L.vmax) return;
      const y = L.yOf(v);
      ctx.fillStyle = RULE;
      ctx.fillRect(L.padL, y, L.innerW, 1);
      ctx.fillStyle = MUTED;
      ctx.fillText(String(v), L.padL - 8, y + 4);
    });
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.font = "700 13px " + FONT_UI;
    TARGET.forEach((name, t) => {
      ctx.fillText(name, L.padL + L.colW * t + L.colW / 2, 490);
    });
    ctx.font = "11px " + FONT_UI;
    ctx.fillStyle = MUTED;
    ctx.save();
    ctx.translate(16, L.padT + L.innerH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(L.metric === "age" ? "Возраст, лет" : "Балл 2 семестра", 0, 0);
    ctx.restore();
    for (const p of bee.points) {
      const rad = p.rad || bee.r;
      ctx.beginPath();
      ctx.arc(p.px, p.py, rad, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[p.t];
      ctx.fill();
      ctx.strokeStyle = SHEET;
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    if (state.beeIndex >= 0 && bee.points[state.beeIndex]) {
      const p = bee.points[state.beeIndex];
      ctx.beginPath();
      ctx.arc(p.px, p.py, (p.rad || bee.r) + 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS[2];
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    for (let t = 0; t < 3; t++) {
      const vals = L.groups[t].map((row) => (L.metric === "age" ? row[AGE] : row[G2]));
      const m = median(vals);
      if (m == null) continue;
      const y = L.yOf(m);
      const x0 = L.padL + L.colW * t + 18;
      const x1 = L.padL + L.colW * (t + 1) - 18;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
    bee.scaleX = sx;
    bee.scaleY = sy;
  }

  function hitBee(cssX, cssY) {
    const x = cssX / (bee.scaleX || 1);
    const y = cssY / (bee.scaleY || 1);
    let best = -1, bestD = 64;
    for (let i = 0; i < bee.points.length; i++) {
      const p = bee.points[i];
      const dx = p.px - x, dy = p.py - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function updateBeeDetail() {
    const p = bee.points[state.beeIndex];
    if (!p) {
      $("bee-detail").textContent = "Наведите на точку или выберите её клавиатурой. Стрелки ← → перебирают студентов; Enter закрепляет.";
      return;
    }
    const r = p.r;
    const sex = r[G] === 0 ? "женщина" : "мужчина";
    const sch = r[S] ? "стипендия" : "без стипендии";
    const val = state.beeMetric === "age" ? `${r[AGE]} лет` : (r[G2] === 0 ? "нет оценки за 2 семестр" : `балл ${nf1.format(r[G2])}`);
    $("bee-detail").innerHTML = `<strong>${TARGET[p.t]}</strong> · ${sex} · ${sch} · ${GROUPS[r[C]]} · ${val}`;
  }

  /* ---------- CSV ---------- */
  function downloadCsv() {
    const rows = filtered();
    const header = ["Пол", "Стипендия", "Форма", "Группа программы", "Возраст", "Балл 2 семестра", "Сдано 1 сем", "Записано 1 сем", "Сдано 2 сем", "Записано 2 сем", "Статус"];
    const lines = [header.join(";")];
    const sex = ["женщина", "мужчина"];
    const att = ["вечерняя", "дневная"];
    for (const r of rows) {
      lines.push([
        sex[r[G]], r[S] ? "да" : "нет", att[r[ATT]], GROUPS[r[C]], r[AGE], String(r[G2]).replace(".", ","),
        r[A1], r[E1], r[A2], r[E2], TARGET[r[T]]
      ].join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "students-filter.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- Render ---------- */
  let currentRows = DATA;
  function render() {
    refreshTheme();
    currentRows = filtered();
    setHero(currentRows);
    lastSankey = renderSankey(currentRows);
    renderSun(currentRows);
    renderBee(currentRows);
  }

  $("filter-gender").addEventListener("change", (e) => { state.gender = e.target.value; state.skSel = null; state.beeIndex = -1; render(); });
  $("filter-sch").addEventListener("change", (e) => { state.sch = e.target.value; state.skSel = null; state.beeIndex = -1; render(); });
  $("filter-att").addEventListener("change", (e) => { state.att = e.target.value; state.skSel = null; state.beeIndex = -1; render(); });
  $("filter-reset").addEventListener("click", () => {
    state.gender = "all"; state.sch = "all"; state.att = "all";
    state.sunGroup = null; state.skSel = null; state.beeIndex = -1; state.beePinned = false;
    $("filter-gender").value = "all";
    $("filter-sch").value = "all";
    $("filter-att").value = "all";
    render();
  });
  $("download-csv").addEventListener("click", downloadCsv);

  $("sankey-svg").addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-sel]");
    if (!el) return;
    sankeyTip(el.dataset.sel, e.clientX, e.clientY);
    if (!state.skSel) applySankeySel(lastSankey, el.dataset.sel);
  });
  $("sankey-svg").addEventListener("pointermove", (e) => {
    if (!tooltip.hidden) {
      const el = e.target.closest("[data-sel]");
      if (el) sankeyTip(el.dataset.sel, e.clientX, e.clientY);
    }
  });
  $("sankey-svg").addEventListener("pointerout", (e) => {
    if (!e.relatedTarget || !$("sankey-svg").contains(e.relatedTarget)) {
      hideTip();
      if (!state.skSel && lastSankey) {
        $("sankey-title").textContent = "Все студенты в фильтре";
        $("sankey-big").textContent = num(lastSankey.n);
        $("sankey-unit").textContent = plural(lastSankey.n) + " на графике";
        $("sankey-break").textContent = "Наведите на ленту или узел, чтобы увидеть численность и долю.";
      }
    }
  });
  $("sankey-svg").addEventListener("click", (e) => {
    const el = e.target.closest("[data-sel]");
    if (!el) { state.skSel = null; renderSankey(currentRows); return; }
    state.skSel = state.skSel === el.dataset.sel ? null : el.dataset.sel;
    lastSankey = renderSankey(currentRows);
  });

  $("sun-svg").addEventListener("pointerover", (e) => {
    const el = e.target.closest(".sun-arc");
    if (!el) return;
    sunTip(el, e.clientX, e.clientY);
  });
  $("sun-svg").addEventListener("pointermove", (e) => {
    const el = e.target.closest(".sun-arc");
    if (el) sunTip(el, e.clientX, e.clientY);
  });
  $("sun-svg").addEventListener("pointerout", (e) => {
    if (!e.relatedTarget || !$("sun-svg").contains(e.relatedTarget)) hideTip();
  });
  $("sun-svg").addEventListener("click", (e) => {
    const el = e.target.closest(".sun-arc");
    if (!el) return;
    if (el.dataset.kind === "g") {
      state.sunGroup = state.sunGroup === +el.dataset.i ? null : +el.dataset.i;
      renderSun(currentRows);
    }
  });
  $("sun-crumb").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-back]");
    if (!btn) return;
    state.sunGroup = null;
    renderSun(currentRows);
  });

  $("bee-age").addEventListener("click", () => {
    state.beeMetric = "age";
    $("bee-age").setAttribute("aria-pressed", "true");
    $("bee-grade").setAttribute("aria-pressed", "false");
    state.beeIndex = -1;
    renderBee(currentRows);
  });
  $("bee-grade").addEventListener("click", () => {
    state.beeMetric = "g2";
    $("bee-age").setAttribute("aria-pressed", "false");
    $("bee-grade").setAttribute("aria-pressed", "true");
    state.beeIndex = -1;
    renderBee(currentRows);
  });

  const canvas = $("bee-canvas");
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const i = hitBee(e.clientX - rect.left, e.clientY - rect.top);
    if (!state.beePinned) {
      state.beeIndex = i;
      drawBee();
      updateBeeDetail();
    }
    if (i >= 0) {
      const p = bee.points[i];
      const r = p.r;
      const val = state.beeMetric === "age" ? `${r[AGE]} лет` : (r[G2] === 0 ? "нет оценки" : nf1.format(r[G2]));
      showTip(`<strong>${TARGET[p.t]}</strong><span class="soft">${GROUPS[r[C]]} · ${val}</span>`, e.clientX, e.clientY);
    } else hideTip();
  });
  canvas.addEventListener("pointerleave", () => {
    hideTip();
    if (!state.beePinned) { state.beeIndex = -1; drawBee(); updateBeeDetail(); }
  });
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const i = hitBee(e.clientX - rect.left, e.clientY - rect.top);
    if (i < 0) { state.beePinned = false; state.beeIndex = -1; drawBee(); updateBeeDetail(); return; }
    state.beePinned = true;
    state.beeIndex = i;
    drawBee();
    updateBeeDetail();
  });
  canvas.addEventListener("keydown", (e) => {
    if (!bee.points.length) return;
    const sorted = bee.points.map((p, i) => ({ i, t: p.t, y: p.py, x: p.px }))
      .sort((a, b) => a.t - b.t || a.y - b.y || a.x - b.x);
    let pos = sorted.findIndex((s) => s.i === state.beeIndex);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      pos = pos < 0 ? 0 : Math.min(sorted.length - 1, pos + 1);
      state.beeIndex = sorted[pos].i; state.beePinned = true;
      drawBee(); updateBeeDetail(); e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      pos = pos < 0 ? 0 : Math.max(0, pos - 1);
      state.beeIndex = sorted[pos].i; state.beePinned = true;
      drawBee(); updateBeeDetail(); e.preventDefault();
    } else if (e.key === "Enter") {
      state.beePinned = !state.beePinned; e.preventDefault();
    } else if (e.key === "Escape") {
      state.beePinned = false; state.beeIndex = -1; drawBee(); updateBeeDetail();
    }
  });

  window.addEventListener("resize", () => { if (bee.layout) drawBee(); });
  refreshTheme();
  const errBox = document.getElementById("boot-error");
  fetch("data/students.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((rows) => {
      DATA = rows;
      TOTAL = rows.length;
      if (errBox) errBox.hidden = true;
      render();
    })
    .catch((err) => {
      if (errBox) {
        errBox.hidden = false;
        errBox.textContent = "Не удалось загрузить data/students.json. Откройте страницу по HTTP, не как локальный файл.";
      }
      console.error(err);
    });
})();
  