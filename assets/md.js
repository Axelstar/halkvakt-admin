// A small Markdown reader shared by the admin pages. Everything is escaped first, so a document can never inject markup.
var HVmd = (function () {
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function rad(s) {
    var kod = [];
    s = esc(s).replace(/`([^`]+)`/g, function (_, k) { kod.push(k); return "\u0000" + (kod.length - 1) + "\u0000"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + kod[+i] + "</code>"; });
  }
  function celler(l) { return l.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); }
  function md(src) {
    var L = src.replace(/\r/g, "").split("\n"), ut = [], i = 0, m;
    while (i < L.length) {
      var l = L[i];
      if (/^```/.test(l)) { var k = []; i++; while (i < L.length && !/^```/.test(L[i])) k.push(L[i++]); i++; ut.push("<pre><code>" + esc(k.join("\n")) + "</code></pre>"); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { var n = m[1].length <= 2 ? 2 : 3; ut.push("<h" + n + ">" + rad(m[2]) + "</h" + n + ">"); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < L.length && /^\s*\|[\s:|-]+\|\s*$/.test(L[i + 1])) {
        var h = celler(l), t = '<div class="tabell"><table><tr>' + h.map(function (c) { return "<th>" + rad(c) + "</th>"; }).join("") + "</tr>";
        i += 2;
        while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) { t += "<tr>" + celler(L[i]).map(function (c) { return "<td>" + rad(c) + "</td>"; }).join("") + "</tr>"; i++; }
        ut.push(t + "</table></div>"); continue;
      }
      if (/^>\s?/.test(l)) { var q = []; while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, "")); ut.push("<blockquote><p>" + rad(q.join(" ")) + "</p></blockquote>"); continue; }
      if ((m = /^(\s*)([-*]|\d+\.)\s+/.exec(l))) {
        var ord = /\d/.test(m[2]), tag = ord ? "ol" : "ul", p = [];
        while (i < L.length && /^\s*([-*]|\d+\.)\s+/.test(L[i])) {
          var txt = L[i].replace(/^\s*([-*]|\d+\.)\s+/, ""); i++;
          while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*]|\d+\.)\s+/.test(L[i])) txt += " " + L[i++].trim();
          p.push("<li>" + rad(txt) + "</li>");
        }
        ut.push("<" + tag + ">" + p.join("") + "</" + tag + ">"); continue;
      }
      if (!l.trim()) { i++; continue; }
      var st = [];
      while (i < L.length && L[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*([-*]|\d+\.)\s+)/.test(L[i]) && !(/^\s*\|.*\|\s*$/.test(L[i]) && i + 1 < L.length && /^\s*\|[\s:|-]+\|\s*$/.test(L[i + 1]))) st.push(L[i++]);
      ut.push("<p>" + st.map(rad).join("<br>") + "</p>");
    }
    return ut.join("\n");
  }

  return md;
})();
if (typeof module !== "undefined") module.exports = HVmd;
