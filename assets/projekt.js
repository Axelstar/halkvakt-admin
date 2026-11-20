// The overview on the Project page. Reads docs/projektkartan.json from the public Halkvakt repo, the same file Bengt's
// project map is generated from, and counts with the same rules as scripts/projektkartan.ts (andel, medel, malDelar, hinder).
var HVProjekt = (function () {
  var KALLA = "https://raw.githubusercontent.com/Axelstar/Halkvakt/main/docs/projektkartan.json";
  var LAGE = { gron: "Klar", orange: "Delvis", bla: "Väntar", rod: "Ej påbörjad", gra: "Stängd" };

  function andel(d) {
    if (d.lage === "gron") return 100;
    var s = (d.steg || []).filter(function (x) { return x.status !== "ej"; });
    if (s.length) {
      var klara = s.filter(function (x) { return x.status === "klar"; }).length, pagar = s.filter(function (x) { return x.status === "pagar"; }).length;
      return Math.round(((klara + 0.5 * pagar) / s.length) * 100);
    }
    return d.klar || 0;
  }
  function medel(ds) {
    var v = ds.reduce(function (s, d) { return s + (d.vikt || 1); }, 0);
    return v ? Math.round(ds.reduce(function (s, d) { return s + andel(d) * (d.vikt || 1); }, 0) / v) : 100;
  }
  function malDelar(m, del) {
    var s = {}, ut = [];
    function ga(id) { if (s[id] || !del[id]) return; s[id] = 1; ut.push(del[id]); (del[id].beror || []).forEach(ga); }
    m.delar.forEach(ga);
    return ut;
  }
  function hinder(m, del) {
    var ut = [], sedda = {};
    function ga(id, djup) {
      var d = del[id];
      if (!d || d.lage === "gron" || d.lage === "gra" || sedda[id]) return;
      sedda[id] = 1; ut.push({ d: d, djup: djup });
      (d.beror || []).forEach(function (b) { ga(b, djup + 1); });
    }
    m.delar.forEach(function (id) { ga(id, 0); });
    return ut;
  }
  function rakna(k) {
    var del = {}; k.delar.forEach(function (d) { del[d.id] = d; });
    return {
      del: del,
      helhet: medel(k.delar),
      antal: k.delar.reduce(function (a, d) { a[d.lage] = (a[d.lage] || 0) + 1; return a; }, {}),
      block: k.block.map(function (b) { var ds = k.delar.filter(function (d) { return d.block === b.id; }); return { b: b, delar: ds, pct: medel(ds) }; }),
      mal: k.mal.map(function (m) { return { m: m, pct: medel(malDelar(m, del)), hinder: hinder(m, del) }; }),
      vantar: k.delar.filter(function (d) { return d.lage === "bla"; })
    };
  }

  // ---- drawing ----
  function el(tag, klass, text) { var e = document.createElement(tag); if (klass) e.className = klass; if (text != null) e.textContent = text; return e; }
  function stapel(pct, klass) { var s = el("div", "stapel-rad"), i = el("i", klass || ""); i.style.width = Math.max(pct, 1) + "%"; s.appendChild(i); return s; }
  function chip(lage) { return el("span", "chip " + lage, LAGE[lage] || lage); }
  function kort(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; }
  function utanBeslut(s) { return String(s || "").replace(/\s*\((?:[^()]*?(?:DECISIONS|kort|#\d)[^()]*)\)/g, "").trim(); }
  function kvarText(d) { return d.lage === "bla" && d.nyckel ? d.nyckel : (d.saknas && d.saknas[0]) || ""; }
  function datumTid(iso) { try { return new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

  function delRad(d, blocknamn) {
    var det = el("details", "delrad"), sum = el("summary");
    sum.appendChild(chip(d.lage));
    sum.appendChild(el("span", "namn", d.namn));
    sum.appendChild(el("span", "tal", andel(d) + " %"));
    det.appendChild(sum);
    var inne = el("div", "inne");
    if (blocknamn) inne.appendChild(el("p", "meta", blocknamn));
    if (d.lage === "bla" && d.nyckel) { inne.appendChild(el("h4", null, "Väntar på")); inne.appendChild(el("p", null, d.nyckel)); }
    if (d.saknas && d.saknas.length) {
      inne.appendChild(el("h4", null, "Kvar att göra"));
      var ul = el("ul"); d.saknas.forEach(function (s) { ul.appendChild(el("li", null, s)); }); inne.appendChild(ul);
    }
    var steg = (d.steg || []).filter(function (s) { return s.status !== "ej"; });
    if (steg.length) {
      inne.appendChild(el("h4", null, "Steg: " + steg.filter(function (s) { return s.status === "klar"; }).length + " av " + steg.length + " klara"));
      var ol = el("ul", "steg");
      steg.forEach(function (s) { ol.appendChild(el("li", "s-" + s.status, s.namn)); });
      inne.appendChild(ol);
    }
    if (d.lage === "gron" && d.bevis) { inne.appendChild(el("h4", null, "Bevis")); inne.appendChild(el("p", "meta", d.bevis)); }
    det.appendChild(inne);
    return det;
  }

  function rita(rot, k) {
    var r = rakna(k), namnAv = {}; k.block.forEach(function (b) { namnAv[b.id] = b.namn; });
    rot.textContent = "";

    // 1. The whole project in one number
    var topp = el("div", "ruta helhet");
    var vanster = el("div"); vanster.appendChild(el("b", "stort", r.helhet + " %")); vanster.appendChild(el("span", "meta", "av hela bygget är klart"));
    var hoger = el("div", "helhet-text");
    hoger.appendChild(el("p", null, k.projektmal.text));
    hoger.appendChild(stapel(r.helhet));
    var a = r.antal;
    hoger.appendChild(el("p", "meta", k.delar.length + " delar: " + (a.gron || 0) + " klara, " + (a.orange || 0) + " delvis, " + (a.bla || 0) + " väntar på beslut eller nyckel" + (a.rod ? ", " + a.rod + " ej påbörjade" : "") + ", " + (a.gra || 0) + " stängda"));
    topp.appendChild(vanster); topp.appendChild(hoger); rot.appendChild(topp);

    // 2. The goals
    rot.appendChild(el("h2", "rubrik", "Målen"));
    var mal = el("div", "malen");
    r.mal.forEach(function (x) {
      var c = el("div", "ruta mal");
      var h = el("div", "rad"); h.appendChild(el("b", "malnamn", x.m.namn)); h.appendChild(el("span", "tal", x.pct + " %")); c.appendChild(h);
      c.appendChild(stapel(x.pct, x.pct === 100 ? "g" : ""));
      c.appendChild(el("p", "meta", utanBeslut(x.m.datum)));
      c.appendChild(el("p", "om", x.m.om));
      if (x.hinder.length) {
        var det = el("details", "kvar"); det.appendChild(el("summary", null, "Visa " + x.hinder.length + (x.hinder.length === 1 ? " del som står i vägen" : " delar som står i vägen")));
        x.hinder.forEach(function (hd) {
          var p = el("div", "hinder"); p.appendChild(chip(hd.d.lage)); p.appendChild(el("b", null, hd.d.namn));
          var t = kvarText(hd.d); if (t) p.appendChild(el("span", "om", kort(t, 200)));
          det.appendChild(p);
        });
        c.appendChild(det);
      } else c.appendChild(el("p", "klart", x.pct === 100 ? "Klart." : "Inga öppna delar står i vägen. Det som saknas till 100 % är stängda delar."));
      mal.appendChild(c);
    });
    rot.appendChild(mal);

    // 3. Waiting on a person
    rot.appendChild(el("h2", "rubrik", "Väntar på beslut eller nyckel (" + r.vantar.length + ")"));
    var v = el("div", "ruta");
    v.appendChild(el("p", "ingress", "Delar som inte kan byggas vidare förrän någon har bestämt något eller lagt in en nyckel."));
    r.vantar.sort(function (x, y) { return (y.vikt || 1) - (x.vikt || 1); }).forEach(function (d) { v.appendChild(delRad(d, namnAv[d.block])); });
    if (!r.vantar.length) v.appendChild(el("p", "klart", "Inget väntar."));
    rot.appendChild(v);

    var prar = (k.synk && k.synk.prar) || [];
    if (prar.length) {
      rot.appendChild(el("h2", "rubrik", "Väntar på granskning (" + prar.length + ")"));
      var pr = el("div", "ruta");
      prar.forEach(function (p) {
        var rad = el("a", "pr"); rad.href = "https://github.com/Axelstar/Halkvakt/pull/" + p.nr; rad.target = "_blank"; rad.rel = "noopener noreferrer";
        rad.appendChild(el("b", null, kort(utanBeslut(p.titel), 110)));
        rad.appendChild(el("span", "meta", "PR " + p.nr + " · " + p.av + " · öppnad " + String(p.oppnad).slice(0, 10)));
        pr.appendChild(rad);
      });
      rot.appendChild(pr);
    }

    // 4. Block by block
    rot.appendChild(el("h2", "rubrik", "Bygget, del för del"));
    r.block.forEach(function (x) {
      var det = el("details", "ruta block"), sum = el("summary");
      var h = el("div", "rad"); h.appendChild(el("b", "malnamn", x.b.namn)); h.appendChild(el("span", "tal", x.pct + " %")); sum.appendChild(h);
      sum.appendChild(stapel(x.pct, x.pct === 100 ? "g" : ""));
      var n = {}; x.delar.forEach(function (d) { n[d.lage] = (n[d.lage] || 0) + 1; });
      var bit = []; ["gron", "orange", "bla", "rod", "gra"].forEach(function (l) { if (n[l]) bit.push(n[l] + " " + LAGE[l].toLowerCase()); });
      sum.appendChild(el("p", "om", x.b.om));
      sum.appendChild(el("p", "meta", x.delar.length + " delar: " + bit.join(", ")));
      det.appendChild(sum);
      x.delar.slice().sort(function (p, q) { return andel(p) - andel(q); }).forEach(function (d) { det.appendChild(delRad(d)); });
      rot.appendChild(det);
    });

    if (k.synk && k.synk.tid) rot.appendChild(el("p", "meta fot", "Kartan stämdes senast av " + datumTid(k.synk.tid) + ". Siffrorna räknas ur samma fil som Bengts projektkarta."));
  }

  function ladda(rot) {
    rot.textContent = "Hämtar…";
    return fetch(KALLA, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("fel"); return r.json(); })
      .then(function (k) { rita(rot, k); }, function () { rot.textContent = "Kunde inte hämta projektkartans data just nu. Öppna fliken Projektkartan i stället."; });
  }
  return { ladda: ladda, rakna: rakna, andel: andel };
})();
if (typeof module !== "undefined") module.exports = HVProjekt;
