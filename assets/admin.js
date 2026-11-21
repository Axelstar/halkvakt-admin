// Sign-in and the shared menu for admin.halkvakt.se.
// The key below is Supabase's publishable key. It is meant to be public: it only lets the browser ask Supabase Auth to
// sign in. Everything else goes through the edge function `admin`, which checks the signed-in user's rights on every call.
(function () {
  var SB = "https://xmpfztykhyvhmrzsnjrc.supabase.co";
  var NYCKEL = "sb_publishable_FGhyCVl0gSpMh21o1BJGMg_bqxvCs1k";
  var API = SB + "/functions/v1/admin";
  var LAGER = "hv-admin";
  var MENY = [["statistik", "Statistik"], ["olyckor", "Olyckor"], ["social", "Sociala medier"], ["mallar", "Mallar och rutiner"], ["projekt", "Projektet"], ["prioriteringar", "Prioriteringar"], ["anvandare", "Användare"]];

  // Menu choices every signed-in user gets. They only show pages that are already public elsewhere, so the API has no data to guard.
  var OPPNA = ["projekt"];
  function far(jag, val) { return OPPNA.indexOf(val) >= 0 || jag.menyval.indexOf(val) >= 0; }

  function las() { try { return JSON.parse(localStorage.getItem(LAGER) || "null"); } catch (e) { return null; } }
  function spara(s) { try { if (s) localStorage.setItem(LAGER, JSON.stringify(s)); else localStorage.removeItem(LAGER); } catch (e) {} }
  function nu() { return Math.floor(Date.now() / 1000); }

  function auth(grant, kropp) {
    return fetch(SB + "/auth/v1/token?grant_type=" + grant, {
      method: "POST", headers: { apikey: NYCKEL, "Content-Type": "application/json" }, body: JSON.stringify(kropp)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.access_token) { var e = new Error("inloggning"); e.status = r.status; throw e; }
        var s = { at: d.access_token, rt: d.refresh_token, ut: nu() + (d.expires_in || 3600) };
        spara(s); return s;
      });
    });
  }

  // One refresh at a time: a refresh token can only be used once.
  var pagar = null;
  function nyckel() {
    var s = las();
    if (!s) return Promise.resolve("");
    if (s.ut - 60 > nu()) return Promise.resolve(s.at);
    if (!pagar) {
      pagar = auth("refresh_token", { refresh_token: s.rt })
        .then(function (n) { return n.at; }, function (e) { if (e.status && e.status < 500) spara(null); return ""; })
        .then(function (t) { pagar = null; return t; });
    }
    return pagar;
  }

  function tillInloggning() { location.replace("./"); }

  // api("statistik", {fran: …}) reads; api("anvandare", null, {gor: …}) writes.
  function api(del, fraga, kropp) {
    return nyckel().then(function (t) {
      if (!t) { tillInloggning(); throw new Error("inte inloggad"); }
      var u = API, o = { headers: { Authorization: "Bearer " + t }, cache: "no-store" };
      if (kropp) {
        kropp.del = del; o.method = "POST"; o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(kropp);
      } else {
        var q = ["del=" + encodeURIComponent(del)];
        for (var k in (fraga || {})) q.push(k + "=" + encodeURIComponent(fraga[k]));
        u += "?" + q.join("&");
      }
      return fetch(u, o);
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) { spara(null); tillInloggning(); }
        if (!r.ok) { var e = new Error(d.fel || "fel"); e.status = r.status; throw e; }
        return d;
      });
    });
  }

  function ritaMeny(jag, sida) {
    var n = document.getElementById("hv-meny");
    if (!n) return;
    n.textContent = "";
    var hem = document.createElement("a"); hem.href = "./"; hem.textContent = "Start";
    if (!sida) hem.setAttribute("aria-current", "page");
    n.appendChild(hem);
    MENY.forEach(function (m) {
      if (!far(jag, m[0])) return;
      var a = document.createElement("a"); a.href = m[0]; a.textContent = m[1];
      if (m[0] === sida) a.setAttribute("aria-current", "page");
      n.appendChild(a);
    });
    var v = document.createElement("span"); v.className = "vem";
    var e = document.createElement("span"); e.className = "meta"; e.textContent = jag.epost;
    var b = document.createElement("button"); b.type = "button"; b.textContent = "Logga ut";
    b.addEventListener("click", function () { spara(null); tillInloggning(); });
    v.appendChild(e); v.appendChild(b); n.appendChild(v);
  }

  // Every page except the start page calls HV.sida("its menu choice", fn). fn runs only if the user has that choice.
  function sida(namn, fn) {
    api("jag").then(function (jag) {
      ritaMeny(jag, namn);
      var inne = document.getElementById("hv-innehall"), nej = document.getElementById("hv-nej");
      if (namn && !far(jag, namn)) { if (nej) nej.hidden = false; return; }
      if (inne) inne.hidden = false;
      if (fn) fn(jag);
    }).catch(function () {});
  }

  window.HV = {
    MENY: MENY, API: API, far: far,
    inloggad: function () { return !!las(); },
    loggaIn: function (epost, losen) { return auth("password", { email: epost, password: losen }); },
    start: function (kod, epost, losen) {
      return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ del: "start", kod: kod, epost: epost, losen: losen }) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.fel || "fel"); return d; }); });
    },
    api: api, sida: sida
  };
})();
