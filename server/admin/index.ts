// admin — API:t bakom admin.halkvakt.se (DECISIONS #913). Sidorna ligger på GitHub Pages (Axelstar/halkvakt-admin);
// den här funktionen är det enda som lämnar ut något, och den prövar varje anrop.
// Inloggningen är Supabase Auth: sidan loggar in mot /auth/v1/token och skickar sin åtkomstnyckel som Authorization: Bearer.
// Funktionen frågar Auth vem nyckeln tillhör och läser användarens menyval ur admin_behorighet. Utan rad där: 403.
// Ett menyval som saknas ger 403 på delens data, så en dold meny är också stängd data.
//
// GET  ?del=jag                         → {epost, menyval}
// GET  ?del=statistik&fran=&till= | &dagar=   (menyval statistik) → samma svar som besok ger statistiksidan
// GET  ?del=anvandare                   (menyval anvandare) → [{id, epost, menyval, skapad}]
// POST {del:"anvandare", gor:"skapa", epost, losen, menyval}
// POST {del:"anvandare", gor:"andra", id, menyval?, losen?}
// POST {del:"anvandare", gor:"tabort", id}
// POST {del:"start", kod, epost, losen} → det första kontot, en gång, mot engångskoden i admin_start. Kräver ingen inloggning.
const SB = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { Authorization: `Bearer ${SRK}`, apikey: SRK, "Content-Type": "application/json" };
const URSPRUNG = "https://admin.halkvakt.se";
const CORS = {
  "Access-Control-Allow-Origin": URSPRUNG,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Vary": "Origin",
};
const MENYVAL = ["statistik", "social", "prioriteringar", "anvandare"];
const MINST_LOSEN = 12;

const svar = (kropp: unknown, status = 200) =>
  new Response(JSON.stringify(kropp), {
    status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const fel = (text: string, status: number) => svar({ fel: text }, status);

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const arDatum = (s: string) => DATUM.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const renaMenyval = (v: unknown) =>
  Array.isArray(v) ? MENYVAL.filter((m) => v.includes(m)) : null;

type Jag = { id: string; epost: string; menyval: string[] };

async function vemAr(req: Request): Promise<Jag | null> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const ur = await fetch(`${SB}/auth/v1/user`, { headers: { Authorization: `Bearer ${m[1]}`, apikey: SRK } });
  if (!ur.ok) return null;
  const u = await ur.json();
  if (!u?.id || !UUID.test(u.id)) return null;
  const br = await fetch(`${SB}/rest/v1/admin_behorighet?select=epost,menyval&anvandare=eq.${u.id}`, { headers: H });
  if (!br.ok) return null;
  const [rad] = await br.json();
  if (!rad) return null;
  return { id: u.id, epost: rad.epost, menyval: rad.menyval ?? [] };
}

async function skapaKonto(epost: string, losen: string): Promise<{ id?: string; fel?: string }> {
  const r = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST", headers: H, body: JSON.stringify({ email: epost, password: losen, email_confirm: true }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d?.id) return { fel: r.status === 422 ? "adressen finns redan" : "kontot kunde inte skapas" };
  return { id: d.id };
}

async function sattBehorighet(id: string, epost: string, menyval: string[]) {
  const r = await fetch(`${SB}/rest/v1/admin_behorighet`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ anvandare: id, epost, menyval }),
  });
  return r.ok;
}

async function start(d: Record<string, unknown>) {
  const kod = typeof d.kod === "string" ? d.kod : "";
  const epost = typeof d.epost === "string" ? d.epost.trim().toLowerCase() : "";
  const losen = typeof d.losen === "string" ? d.losen : "";
  if (!kod || !EPOST.test(epost)) return fel("fel uppgifter", 400);
  if (losen.length < MINST_LOSEN) return fel(`lösenordet ska vara minst ${MINST_LOSEN} tecken`, 400);
  // The code is claimed by deleting its row; only one request can get the row back.
  const hash = await sha256(kod);
  const tr = await fetch(`${SB}/rest/v1/admin_start?id=eq.1&hash=eq.${hash}`, {
    method: "DELETE", headers: { ...H, Prefer: "return=representation" },
  });
  const tagna = tr.ok ? await tr.json() : [];
  if (!tagna.length) return fel("koden gäller inte", 401);
  const k = await skapaKonto(epost, losen);
  if (!k.id || !(await sattBehorighet(k.id, epost, MENYVAL))) {
    await fetch(`${SB}/rest/v1/admin_start`, {
      method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ id: 1, hash }),
    });
    return fel(k.fel ?? "kontot kunde inte skapas", 400);
  }
  return svar({ klart: true });
}

async function statistik(u: URL) {
  const fran = u.searchParams.get("fran") ?? "";
  const till = u.searchParams.get("till") ?? "";
  let sr: Response;
  if (fran || till) {
    const spann = (Date.parse(till + "T00:00:00Z") - Date.parse(fran + "T00:00:00Z")) / 86400000;
    if (!arDatum(fran) || !arDatum(till) || spann < 0 || spann > 400) return fel("fel datum", 400);
    sr = await fetch(`${SB}/rest/v1/rpc/besok_stat_period`, { method: "POST", headers: H, body: JSON.stringify({ fran, till }) });
  } else {
    const dagar = Math.min(365, Math.max(1, Number(u.searchParams.get("dagar")) || 30));
    sr = await fetch(`${SB}/rest/v1/rpc/besok_stat`, { method: "POST", headers: H, body: JSON.stringify({ dagar }) });
  }
  return new Response(await sr.text(), {
    status: sr.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function listaAnvandare() {
  const r = await fetch(`${SB}/rest/v1/admin_behorighet?select=id:anvandare,epost,menyval,skapad&order=skapad.asc`, { headers: H });
  return new Response(await r.text(), {
    status: r.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function andraAnvandare(jag: Jag, d: Record<string, unknown>) {
  if (d.gor === "skapa") {
    const epost = typeof d.epost === "string" ? d.epost.trim().toLowerCase() : "";
    const losen = typeof d.losen === "string" ? d.losen : "";
    const menyval = renaMenyval(d.menyval);
    if (!EPOST.test(epost) || !menyval) return fel("fel uppgifter", 400);
    if (losen.length < MINST_LOSEN) return fel(`lösenordet ska vara minst ${MINST_LOSEN} tecken`, 400);
    const k = await skapaKonto(epost, losen);
    if (!k.id) return fel(k.fel ?? "kontot kunde inte skapas", 400);
    if (!(await sattBehorighet(k.id, epost, menyval))) {
      await fetch(`${SB}/auth/v1/admin/users/${k.id}`, { method: "DELETE", headers: H });
      return fel("behörigheten kunde inte sparas", 500);
    }
    return svar({ id: k.id });
  }
  const id = typeof d.id === "string" && UUID.test(d.id) ? d.id.toLowerCase() : "";
  if (!id) return fel("fel uppgifter", 400);
  const finns = await fetch(`${SB}/rest/v1/admin_behorighet?select=epost&anvandare=eq.${id}`, { headers: H });
  const [rad] = finns.ok ? await finns.json() : [];
  if (!rad) return fel("användaren finns inte", 404);
  const jagSjalv = id === jag.id.toLowerCase();

  if (d.gor === "andra") {
    if (d.menyval !== undefined) {
      const menyval = renaMenyval(d.menyval);
      if (!menyval) return fel("fel uppgifter", 400);
      // Nobody removes their own way in to this page, so there is always someone who can manage users.
      if (jagSjalv && !menyval.includes("anvandare")) return fel("du kan inte ta bort din egen rätt till Användare", 400);
      const r = await fetch(`${SB}/rest/v1/admin_behorighet?anvandare=eq.${id}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ menyval }),
      });
      if (!r.ok) return fel("behörigheten kunde inte sparas", 500);
    }
    if (d.losen !== undefined) {
      const losen = typeof d.losen === "string" ? d.losen : "";
      if (losen.length < MINST_LOSEN) return fel(`lösenordet ska vara minst ${MINST_LOSEN} tecken`, 400);
      const r = await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "PUT", headers: H, body: JSON.stringify({ password: losen }) });
      if (!r.ok) return fel("lösenordet kunde inte bytas", 500);
    }
    return svar({ klart: true });
  }
  if (d.gor === "tabort") {
    if (jagSjalv) return fel("du kan inte ta bort dig själv", 400);
    const r = await fetch(`${SB}/rest/v1/admin_behorighet?anvandare=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
    if (!r.ok) return fel("användaren kunde inte tas bort", 500);
    await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H });
    return svar({ klart: true });
  }
  return fel("okänd åtgärd", 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const u = new URL(req.url);
    let d: Record<string, unknown> = {};
    if (req.method === "POST") {
      d = JSON.parse((await req.text()).slice(0, 4000) || "{}");
      if (d.del === "start") return await start(d);
    } else if (req.method !== "GET") {
      return fel("fel metod", 405);
    }
    const jag = await vemAr(req);
    if (!jag) return fel("inte inloggad", 401);
    const del = req.method === "POST" ? String(d.del ?? "") : (u.searchParams.get("del") ?? "");
    if (del === "jag" && req.method === "GET") return svar({ epost: jag.epost, menyval: jag.menyval });
    if (!MENYVAL.includes(del)) return fel("okänd del", 400);
    if (!jag.menyval.includes(del)) return fel("saknar behörighet", 403);
    if (del === "statistik" && req.method === "GET") return await statistik(u);
    if (del === "anvandare") return req.method === "GET" ? await listaAnvandare() : await andraAnvandare(jag, d);
    return fel("delen är inte byggd än", 404);
  } catch (_e) {
    return fel("internt fel", 500);
  }
});
