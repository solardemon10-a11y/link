// home.ts - 공개 페이지 (방문자용). 에디토리얼 레이아웃.
//
// 디자인 토큰은 아래 :root 에 하드코딩. 관리자에서 색을 조정하는 기능은 v1 범위 밖
// (필요해지면 site_settings 에 appearance JSON 컬럼을 추가하고 여기 :root 값을 그걸로 주입).

import { escapeHtml } from "../lib/html";
import type { Product, SiteSettings } from "../types";

const VALID_COLUMNS = [1, 2, 3, 6];

export function homePage(products: Product[], settings: SiteSettings): string {
  const columns = VALID_COLUMNS.includes(settings.link_columns) ? settings.link_columns : 1;
  const initialTheme = settings.theme === "dark" ? "dark" : "light";
  const siteName = settings.site_name || "멀티링크";

  const mono = settings.representative_image_url
    ? `<img class="mono-img" src="${escapeHtml(settings.representative_image_url)}" alt="">`
    : `<span class="mono-mark">${escapeHtml([...siteName][0] || "M")}</span>`;

  const itemsHtml =
    products.length === 0
      ? ""
      : products
          .map((p) => {
            const coupang = !!p.coupang_url && p.coupang_active === 1;
            const naver = !!p.naver_url && p.naver_active === 1;
            const num = escapeHtml(p.product_number);
            const name = escapeHtml(p.name);

            const shot = p.image_url
              ? `<img class="shot" src="${escapeHtml(p.image_url)}" alt="${name}" loading="lazy">`
              : `<div class="shot noimg" aria-hidden="true">이미지 없음</div>`;

            const buys =
              coupang || naver
                ? `<div class="buys">
                     ${coupang ? `<a class="buy c" href="/go/${p.id}/coupang" target="_blank" rel="noopener noreferrer">쿠팡</a>` : ""}
                     ${naver ? `<a class="buy n" href="/go/${p.id}/naver" target="_blank" rel="noopener noreferrer">네이버</a>` : ""}
                   </div>`
                : "";

            return `
              <article class="item" data-number="${num}" data-name="${name}">
                <div class="frame">
                  ${shot}
                  <span class="no">${num}</span>
                </div>
                <h2>${name}</h2>
                ${buys}
              </article>`;
          })
          .join("");

  const disclosureHtml = settings.disclosure?.trim()
    ? `<footer class="disclosure">${escapeHtml(settings.disclosure.trim())}</footer>`
    : "";

  const bodyHtml =
    products.length === 0
      ? `<div class="empty">등록된 상품이 없습니다.</div>`
      : `<section class="list" id="list">${itemsHtml}${disclosureHtml}</section>`;

  return `<!DOCTYPE html>
<html lang="ko" data-theme="${initialTheme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(siteName)}</title>
<script>
  (function () {
    try {
      var t = localStorage.getItem("multilink-theme");
      if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    } catch (e) {}
  })();
</script>
<style>
  :root {
    --bg: #f2ece0;
    --fg: #2b2621;
    --heading: #2b2621;
    --muted: #948a79;
    --divider: #d7c9ad;
    --divider-w: 2px;
    --photo-border: #e2d8c4;
    --photo-border-w: 1px;
    --photo-radius: 4px;
    --accent: #6e4a34;
    --accent-fg: #fbf8f1;
    --chip-bg: #faf6ec;
    --field: #fbf8f1;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #161108; --fg: #ede6d8; --heading: #ede6d8; --muted: #9a8d79;
      --divider: #3d3220; --photo-border: #3a3121; --accent: #d8ac86;
      --accent-fg: #201810; --chip-bg: #211b12; --field: #211b12;
    }
  }
  :root[data-theme="dark"] {
    --bg: #161108; --fg: #ede6d8; --heading: #ede6d8; --muted: #9a8d79;
    --divider: #3d3220; --photo-border: #3a3121; --accent: #d8ac86;
    --accent-fg: #201810; --chip-bg: #211b12; --field: #211b12;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }

  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  a:focus-visible, button:focus-visible, input:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px;
  }

  /* ── 우상단 컨트롤 ── */
  .controls { position: fixed; top: 14px; right: 14px; display: flex; gap: 8px; z-index: 50; }
  .controls button {
    width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
    border: 1px solid var(--divider); background: var(--field); color: var(--fg);
    font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center;
  }
  .controls button:hover { border-color: var(--accent); }

  .popup {
    position: fixed; top: 62px; right: 14px; z-index: 60;
    background: var(--field); border: 1px solid var(--divider); border-radius: 12px;
    padding: 6px; display: flex; flex-direction: column; gap: 2px; min-width: 108px;
    box-shadow: 0 12px 30px -12px rgba(40,30,20,.4);
  }
  .popup[hidden] { display: none; }
  .popup button {
    border: 0; background: transparent; color: var(--fg); cursor: pointer;
    text-align: left; padding: 9px 12px; border-radius: 8px; font-size: 13px;
  }
  .popup button:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .popup button[aria-checked="true"] { color: var(--accent); font-weight: 700; }

  /* ── 페이지 ── */
  .page { margin: 0 auto; padding: 54px 20px 90px; }
  .page.cols-1 { max-width: 448px; }
  .page.cols-2 { max-width: 600px; }
  .page.cols-3 { max-width: 840px; }
  .page.cols-6 { max-width: 1120px; }

  .brand { text-align: center; margin-bottom: 26px; }
  .mono {
    width: 58px; height: 58px; margin: 0 auto 14px; border-radius: 50%;
    border: 1px solid var(--accent); overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .mono-img { width: 100%; height: 100%; object-fit: cover; }
  .mono-mark { font-family: Georgia, "Noto Serif KR", serif; font-size: 24px; color: var(--accent); }
  .brand h1 {
    font-family: Georgia, "Noto Serif KR", serif; font-weight: 500;
    font-size: 23px; letter-spacing: -0.01em; margin: 0 0 6px; color: var(--heading);
  }
  .greeting { font-size: 13px; color: var(--muted); margin: 0; }

  .search {
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid var(--fg); padding: 10px 2px; margin: 22px 2px 8px;
  }
  .search svg { flex: none; opacity: .45; }
  .search input {
    border: 0; background: transparent; outline: none; width: 100%;
    font-family: inherit; font-size: 15px; color: var(--fg);
  }
  .found { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 8px 2px 18px; }
  .found[hidden] { display: none; }

  .list { display: grid; gap: 0; }
  .cols-2 .list { grid-template-columns: 1fr 1fr; gap: 0 14px; }
  .cols-3 .list { grid-template-columns: repeat(3, 1fr); gap: 0 14px; }
  .cols-6 .list { grid-template-columns: repeat(6, 1fr); gap: 0 10px; }

  .item { padding: 24px 0; }
  .item[hidden] { display: none; }
  .cols-1 .item + .item { border-top: var(--divider-w) solid var(--divider); }
  .cols-2 .item, .cols-3 .item, .cols-6 .item {
    border-bottom: var(--divider-w) solid var(--divider); padding: 18px 0;
  }

  .frame { position: relative; }
  .shot {
    width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block;
    border: var(--photo-border-w) solid var(--photo-border);
    border-radius: var(--photo-radius);
    background: #fff;
  }
  .cols-2 .shot, .cols-3 .shot, .cols-6 .shot { aspect-ratio: 1 / 1; }
  .shot.noimg {
    display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 12px; background: var(--field);
  }
  :root[data-theme="dark"] .shot:not(.noimg) { background: #f2ece0; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .shot:not(.noimg) { background: #f2ece0; }
  }
  .item.match .shot { border-color: var(--accent); }

  .no {
    position: absolute; top: 10px; left: 10px;
    font-family: Georgia, serif; font-size: 14px; line-height: 1; letter-spacing: .03em;
    background: var(--chip-bg); color: var(--accent);
    border: 1px solid var(--photo-border); padding: 5px 10px; border-radius: 999px;
  }
  .item.match .no { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

  .item h2 {
    font-family: "Noto Serif KR", Georgia, serif; font-weight: 500;
    font-size: 15px; line-height: 1.5; color: var(--heading); margin: 13px 2px 13px;
  }
  .cols-3 .item h2, .cols-6 .item h2 { font-size: 13px; margin: 10px 1px 10px; }

  .buys { display: flex; gap: 8px; }
  .buy {
    flex: 1; text-align: center; text-decoration: none;
    font-size: 12.5px; font-weight: 600; letter-spacing: .02em;
    padding: 11px 8px; border-radius: 999px;
  }
  .cols-3 .buy, .cols-6 .buy { font-size: 11px; padding: 8px 4px; }
  .buy.c { background: var(--accent); color: var(--accent-fg); }
  .buy.n { color: var(--accent); border: 1px solid var(--accent); }

  .disclosure {
    grid-column: 1 / -1; margin-top: 8px; padding-top: 20px;
    border-top: var(--divider-w) solid var(--divider);
    font-size: 10.5px; line-height: 1.7; color: var(--muted); text-align: center;
  }

  .empty { padding: 80px 20px; text-align: center; color: var(--muted); }

  @media (max-width: 620px) {
    .page.cols-3, .page.cols-6 { max-width: 460px; }
    .cols-3 .list, .cols-6 .list { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 380px) {
    .page.cols-2, .page.cols-3, .page.cols-6 { max-width: 100%; }
    .cols-2 .list, .cols-3 .list, .cols-6 .list { grid-template-columns: 1fr; }
    .cols-2 .item, .cols-3 .item, .cols-6 .item { border-bottom: 0; }
    .cols-2 .item + .item, .cols-3 .item + .item, .cols-6 .item + .item {
      border-top: var(--divider-w) solid var(--divider);
    }
    .cols-2 .shot, .cols-3 .shot, .cols-6 .shot { aspect-ratio: 4 / 3; }
  }

  @media (prefers-reduced-motion: no-preference) {
    .controls button, .buy, .popup button { transition: border-color .15s ease, background .15s ease; }
  }
</style>
</head>
<body>
  <div class="controls">
    <button id="layout-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="layout-popup" aria-label="배치 바꾸기" title="배치">▦</button>
    <button id="theme-toggle" type="button" aria-label="테마 바꾸기" title="테마">◐</button>
  </div>
  <div id="layout-popup" class="popup" role="menu" aria-label="열 개수" hidden>
    <button type="button" role="menuitemradio" data-cols="1">1열</button>
    <button type="button" role="menuitemradio" data-cols="2">2열</button>
    <button type="button" role="menuitemradio" data-cols="3">3열</button>
    <button type="button" role="menuitemradio" data-cols="6">6열</button>
  </div>

  <main class="page cols-${columns}" id="page">
    <header class="brand">
      <div class="mono">${mono}</div>
      <h1>${escapeHtml(siteName)}</h1>
      ${settings.greeting ? `<p class="greeting">${escapeHtml(settings.greeting)}</p>` : ""}
    </header>

    <div class="search">
      <label class="sr-only" for="q">번호 또는 상품 이름으로 검색</label>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
      <input id="q" type="search" inputmode="search" autocomplete="off" placeholder="번호 · 상품 이름" aria-describedby="found">
    </div>
    <p class="found" id="found" role="status" hidden></p>

    ${bodyHtml}
  </main>

<script>
(function () {
  var VALID = [1, 2, 3, 6];
  var page = document.getElementById("page");
  var serverCols = ${columns};

  // ── 열 개수 ──
  function readSaved() {
    try {
      var n = Number(localStorage.getItem("multilink-layout"));
      return VALID.indexOf(n) >= 0 ? n : null;
    } catch (e) { return null; }
  }
  function setLayout(n, persist) {
    if (VALID.indexOf(n) < 0) return;
    VALID.forEach(function (v) { page.classList.remove("cols-" + v); });
    page.classList.add("cols-" + n);
    if (persist) { try { localStorage.setItem("multilink-layout", String(n)); } catch (e) {} }
    document.querySelectorAll("#layout-popup button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.cols === String(n) ? "true" : "false");
    });
  }
  setLayout(readSaved() || serverCols, false);

  var toggle = document.getElementById("layout-toggle");
  var popup = document.getElementById("layout-popup");
  function openPopup() { popup.hidden = false; toggle.setAttribute("aria-expanded", "true"); }
  function closePopup(focusBack) {
    popup.hidden = true; toggle.setAttribute("aria-expanded", "false");
    if (focusBack) toggle.focus();
  }
  toggle.addEventListener("click", function () { popup.hidden ? openPopup() : closePopup(false); });
  popup.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { setLayout(Number(b.dataset.cols), true); closePopup(true); });
  });
  document.addEventListener("click", function (e) {
    if (!popup.hidden && !popup.contains(e.target) && !toggle.contains(e.target)) closePopup(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !popup.hidden) closePopup(true);
  });

  // ── 테마 ──
  var themeBtn = document.getElementById("theme-toggle");
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("multilink-theme", t); } catch (e) {}
    themeBtn.textContent = t === "dark" ? "☀" : "☾";
  }
  applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  themeBtn.addEventListener("click", function () {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  // ── 검색: 번호 또는 이름 ──
  var input = document.getElementById("q");
  var found = document.getElementById("found");
  var items = [].slice.call(document.querySelectorAll(".item"));

  function filter(raw) {
    var kw = raw.trim().toLowerCase();
    if (!kw) {
      items.forEach(function (el) { el.hidden = false; el.classList.remove("match"); });
      found.hidden = true;
      return;
    }
    var hits = 0;
    var numeric = /^[0-9]+$/.test(kw);
    items.forEach(function (el) {
      var num = (el.dataset.number || "").toLowerCase();
      var name = (el.dataset.name || "").toLowerCase();
      var hit = num.indexOf(kw) >= 0 || name.indexOf(kw) >= 0;
      el.hidden = !hit;
      // 번호로 검색했고 정확히 일치하면 강조
      el.classList.toggle("match", hit && numeric && num === kw);
      if (hit) hits++;
    });
    found.textContent = items.length + "개 중 " + hits + "개";
    found.hidden = false;
  }
  input.addEventListener("input", function () { filter(input.value); });
})();
</script>
</body>
</html>`;
}
