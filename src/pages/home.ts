// home.ts - 공개 페이지 (방문자용)

import { escapeHtml } from "../lib/html";
import type { Product, SiteSettings } from "../types";

export function homePage(products: Product[], settings: SiteSettings): string {
  const productHtml = products.length === 0
    ? `<div class="empty">등록된 상품이 없습니다.</div>`
    : products
        .map((product) => {
          const coupangVisible = !!product.coupang_url && product.coupang_active === 1;
          const naverVisible = !!product.naver_url && product.naver_active === 1;
          const isSingleLink = (coupangVisible && !naverVisible) || (!coupangVisible && naverVisible);

          return `
            <article class="product" data-id="${product.id}">
              <span class="product-number">${escapeHtml(product.product_number)}</span>
              ${product.image_url
                ? `<img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">`
                : `<div class="product-image no-image">이미지 없음</div>`
              }
              <h2>${escapeHtml(product.name)}</h2>
              ${(coupangVisible || naverVisible) ? `
                <div class="links ${isSingleLink ? "single" : ""}">
                  ${coupangVisible
                    ? `<a class="link coupang" href="/go/${product.id}/coupang" target="_blank" rel="noopener noreferrer">쿠팡</a>`
                    : ""
                  }
                  ${naverVisible
                    ? `<a class="link naver" href="/go/${product.id}/naver" target="_blank" rel="noopener noreferrer">네이버</a>`
                    : ""
                  }
                </div>
              ` : ""}
            </article>
          `;
        })
        .join("");

  const representativeImage = settings.representative_image_url
    ? `<img class="profile-image" src="${escapeHtml(settings.representative_image_url)}" alt="">`
    : `<div class="profile-image">🔗</div>`;

  // 관리자 설정값을 기본 배치로 사용
  const columns = settings.link_columns || 2;
  const initialTheme = settings.theme === "dark" ? "dark" : "light";

  return `
<!DOCTYPE html>
<html lang="ko" data-theme="${initialTheme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(settings.site_name)}</title>

  <script>
    (() => {
      const saved = localStorage.getItem("multilink-theme");
      if (saved === "dark" || saved === "light") {
        document.documentElement.dataset.theme = saved;
      }
    })();
  </script>

  <style>
    :root {
      --bg: #F5F2EB; /* [변경] 은은한 라이트 베이지 */
      --card: #FFFDF9; /* [변경] 부드러운 크림 화이트 */
      --text: #4A3F35; /* [변경] 진한 브라운 */
      --muted: #8A7B6C;
      --border: #E8E0D8;
      --empty: #999999;
      --toggle-bg: #FFFDF9;
      --primary: #4A89FF; /* [변경] 소프트 블루 (카드 라벨/팝업 포인트) */
    }

    html[data-theme="dark"] {
      --bg: #1A1614;
      --card: #2A211B;
      --text: #F5F0E8;
      --muted: #A99A8B;
      --border: #40332A;
      --empty: #888888;
      --toggle-bg: #2A211B;
      --primary: #4A89FF;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: Arial, "Noto Sans KR", sans-serif;
      transition: background 0.2s ease, color 0.2s ease;
    }

    /* 배치 선택 팝업 (이미지 버튼) */
    .layout-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--toggle-bg);
      color: var(--text);
      cursor: pointer;
      transition: all 0.2s;
    }

    .layout-toggle-btn:hover {
      border-color: var(--primary);
    }

    .layout-btn-preview {
      display: grid;
      gap: 2px;
      width: 18px;
      height: 18px;
    }

    .layout-btn-preview.cols-2 { grid-template-columns: repeat(2, 1fr); }
    .layout-btn-preview.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .layout-btn-preview.cols-6 { grid-template-columns: repeat(6, 1fr); }

    .layout-btn-preview .card {
      background: transparent;
      border: 1.5px solid var(--primary);
      border-radius: 3px;
      opacity: 1;
    }

    .top-controls {
      position: fixed;
      top: 16px;
      right: 70px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }

    .layout-popup {
      position: fixed;
      top: 60px;
      right: 70px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      z-index: 200;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      display: none;
      width: 160px;
    }

    .layout-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px;
      margin-bottom: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--toggle-bg);
      cursor: pointer;
      transition: all 0.2s;
    }

    .layout-option:hover {
      border-color: var(--primary);
      background: var(--card);
    }

    .layout-preview {
      display: grid;
      gap: 2px;
      width: 100px;
      height: 30px;
      margin-bottom: 6px;
    }

    .layout-preview.cols-2 { grid-template-columns: repeat(2, 1fr); }
    .layout-preview.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .layout-preview.cols-6 { grid-template-columns: repeat(6, 1fr); }

    .layout-preview .card {
      background: transparent;
      border: 1.5px solid var(--primary);
      border-radius: 3px;
      opacity: 1;
    }

    .layout-option span {
      font-size: 12px;
      font-weight: bold;
      color: var(--text);
    }

    .theme-toggle {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 44px;
      height: 44px;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--toggle-bg);
      color: var(--text);
      cursor: pointer;
      font-size: 20px;
      z-index: 100;
    }

    .container {
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 24px;
    }

    .profile { text-align: center; margin-bottom: 36px; }

    .profile-image {
      width: 96px;
      height: 96px;
      margin: 0 auto 16px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
    }

    .profile h1 { margin: 0 0 8px; font-size: 26px; }
    .greeting { margin: 0 0 24px; color: var(--muted); font-size: 16px; }

    .search-box {
      width: 100%;
      max-width: 400px;
      display: block;
      margin: 0 auto 24px;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
    }

    .products {
      display: grid;
      gap: 18px;
    }
    .products.columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .products.columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .products.columns-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }

    .product {
      position: relative;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      transition: background 0.2s ease, border-color 0.2s ease;

      /* 카드 내부를 세로 방향으로 배치 */
      display: flex;
      flex-direction: column;
    }
    .product-image-wrap {
      position: relative;
      width: 100%;
      margin-bottom: 14px;
    }

    .product-number {
      display: block;
      margin: 0 0 8px;
      color: var(--text);
      font-weight: bold;
      font-size: 20px;
      line-height: 1.2;
      text-align: center;
    }

    .products.columns-3 .product-number {
      font-size: 18px;
      text-align: center;
    }

    .products.columns-6 .product-number {
      font-size: 15px;
      text-align: center;
    }

    .product-image {
      width: 100%;
      max-height: 400px;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      display: block;
      margin-bottom: 14px;
      border-radius: 12px;
    }

    .product h2 {
      margin: 0 0 14px;
      font-size: clamp(11px, 1.5vw, 17px);
      line-height: 1.4;
      word-break: keep-all;
      overflow-wrap: break-word;

      /* 상품명 영역 높이를 일정하게 */
      min-height: calc(1.4em * 2);

      /* 버튼을 카드 아래쪽으로 밀기 위한 영역 */
      flex-grow: 0;
    }

    .links {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;

      /* 링크 영역을 카드 하단으로 정렬 */
      margin-top: auto;
    }

    .link {
      min-height: clamp(32px, 4vw, 46px);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-size: clamp(10px, 1.25vw, 16px);
      font-weight: 700;
      padding: 0 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .coupang {
      background: #2563EB; /* [변경] 차콜 네이비 */
      color: #FFFFFF;
      min-height: 46px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 0 14px;
    }
    .naver {
      background: #03C75A; /* [변경] 딥 포레스트 그린 */
      color: #FFFFFF;
      min-height: 46px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 0 14px;
    }

    .empty {
      padding: 60px 20px;
      text-align: center;
      color: var(--empty);
    }

    @media (max-width: 800px) {
      .container { padding: 42px 16px; }
      .products.columns-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }

    @media (max-width: 600px) {
      .container { padding: 40px 14px; }
      .products.columns-2,
      .products.columns-3,
      .products.columns-6 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .product { padding: 12px; border-radius: 14px; }
      .product h2 { font-size: 15px; }
      .link { min-height: 42px; font-size: 13px; }
    }

    @media (max-width: 400px) {
      .products.columns-2,
      .products.columns-3,
      .products.columns-6 {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>
  <!-- 우상단 배치 설정(아이콘) + 테마 버튼 -->
  <div class="top-controls">
    <button class="layout-toggle-btn" onclick="document.getElementById('layout-popup').style.display='block'" aria-label="배치 설정">
      <!-- [핵심] 클래스가 동적으로 바뀌도록 설정 -->
      <div class="layout-btn-preview cols-2" id="layout-btn-preview">
        <div class="card"></div>
        <div class="card"></div>
      </div>
    </button>

    <!-- 테마 변경 버튼 -->
    <button class="theme-toggle" id="theme-toggle" type="button" aria-label="테마 변경">🌙</button>
  </div>

  <!-- 배치 선택 팝업 -->
  <div id="layout-popup" class="layout-popup">

    <div class="layout-option" onclick="changeLayout(2)">
      <div class="layout-preview cols-2">
        <div class="card"></div>
        <div class="card"></div>
      </div>
      <span>2개</span>
    </div>

    <div class="layout-option" onclick="changeLayout(3)">
      <div class="layout-preview cols-3">
        <div class="card"></div>
        <div class="card"></div>
        <div class="card"></div>
      </div>
      <span>3개</span>
    </div>

    <div class="layout-option" onclick="changeLayout(6)">
      <div class="layout-preview cols-6">
        <div class="card"></div>
        <div class="card"></div>
        <div class="card"></div>
        <div class="card"></div>
        <div class="card"></div>
        <div class="card"></div>
      </div>
      <span>6개</span>
    </div>

  </div>

  <main class="container">
    <section class="profile">
      ${representativeImage}
      <h1>${escapeHtml(settings.site_name)}</h1>
      
      <p class="greeting">${escapeHtml(settings.greeting || '')}</p>
      
      <input class="search-box" type="search" placeholder="제품번호·상품명 검색" oninput="searchProduct(this.value)">
    </section>

    <section class="products columns-${columns}">
      ${productHtml}
    </section>
  </main>

  <script>
    const themeToggle = document.getElementById("theme-toggle");

    // 관리자에서 설정한 배치값을 기본값으로 사용
    const defaultLayout = ${columns};

    // 사용자가 직접 선택한 배치가 있으면 사용
    // 선택한 값이 없으면 관리자 설정값 사용
    const savedLayout = localStorage.getItem('multilink-layout');

    const currentLayout =
      savedLayout && [2, 3, 6].includes(Number(savedLayout))
        ? Number(savedLayout)
        : defaultLayout;

    // 현재 배치 적용
    const productsGrid = document.querySelector('.products');

    if (productsGrid && [2, 3, 6].includes(currentLayout)) {
      productsGrid.className = 'products columns-' + currentLayout;
    }

    // 상단 배치 아이콘 적용
    const preview = document.getElementById('layout-btn-preview');

    if (preview && [2, 3, 6].includes(currentLayout)) {
      preview.className = 'layout-btn-preview cols-' + currentLayout;
      preview.innerHTML = '';

      for (let i = 0; i < currentLayout; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        preview.appendChild(card);
      }
    }

    function changeLayout(cols) {
      localStorage.setItem('multilink-layout', cols);
      document.getElementById('layout-popup').style.display = 'none';

      // 상품 그리드 변경
      const productsGrid = document.querySelector('.products');
      productsGrid.className = 'products columns-' + cols;

      // 배치 아이콘 변경
      const preview = document.getElementById('layout-btn-preview');
      preview.className = 'layout-btn-preview cols-' + cols;
      preview.innerHTML = '';

      for (let i = 0; i < cols; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        preview.appendChild(card);
      }
    }

    function searchProduct(input) {
      const keyword = input.trim().toLowerCase();
      document.querySelectorAll('.product').forEach((product) => {
        if (!keyword) {
          product.style.display = '';
          return;
        }
        const number = (product.querySelector('.product-number')?.textContent || '').toLowerCase();
        const name = (product.querySelector('h2')?.textContent || '').toLowerCase();
        // display:'' 로 되돌려야 카드의 flex 레이아웃(버튼 하단 정렬)이 유지된다
        product.style.display = number.includes(keyword) || name.includes(keyword) ? '' : 'none';
      });
    }

    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('multilink-theme', theme);
      if (themeToggle) {
        themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
      }
    }

    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(currentTheme);

    themeToggle?.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
    });

    // [필수] 팝업 밖(바깥)을 클릭하면 팝업 닫기
    window.addEventListener('click', function(event) {
      const popup = document.getElementById('layout-popup');
      const btn = document.querySelector('.layout-toggle-btn');
      
      if (popup.style.display === 'block' && !popup.contains(event.target) && !btn.contains(event.target)) {
        popup.style.display = 'none';
      }
    });


  </script>
</body>
</html>
`;
}