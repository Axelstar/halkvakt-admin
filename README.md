# halkvakt-admin

Adminsidorna för Halkvakt, på https://admin.halkvakt.se (GitHub Pages).

Repot är publikt. Här ligger bara sidor och kod. Nycklar, lösenord och interna anteckningar får aldrig checkas in.
Nyckeln i `assets/admin.js` är Supabases publika nyckel och är avsedd att synas.

## Hur det hänger ihop

- Sidorna är statiska: `index.html` (inloggning och start), `statistik.html`, `social.html`, `social-inlagg.html`, `prioriteringar.html`, `anvandare.html`.
- Inloggningen är Supabase Auth med e-post och lösenord.
- All data hämtas genom edge-funktionen `admin` i Halkvakts Supabase-projekt. Den frågar Auth vem som är inloggad och läser
  användarens menyval ur tabellen `admin_behorighet`. Ett menyval som saknas ger 403 på delens data, så en dold meny är också
  stängd data.
- Tabellerna `admin_behorighet` och `admin_start` är låsta dubbelt (RLS utan policy och REVOKE). Bara funktionen når dem.
- Det första kontot skapas en gång med en engångslänk (`/#start=…`). Fler konton läggs till på sidan Användare.

## server/

`server/admin/index.ts` är funktionens källa och `server/128_admin.sql` är migrationen, som de kördes 20/11 2026.
De hör hemma i Axelstar/Halkvakt (`supabase/functions/admin/` och `sql/`) tillsammans med beslutet i DECISIONS, och flyttas dit.
En ändrad fil här är inte en deploy.

## Läget

- Fas 1 (klar): inloggning, användare, statistik.
- Fas 2: sociala medier. `social-inlagg.html` visar de senaste inläggen (ur postat.json och inlagg/ i Halkvakt-repot) med förhandsvisning per kanal. `social.html` visar reglerna som de står i posta.mjs (läst 20/11, Halkvakt 176bc07), utan att kunna ändra dem. Kvar: reglerna i databasen, utkast, publicering, konkurrenternas inlägg.
- Prioriteringar: tom sida tills innehållet är bestämt.
