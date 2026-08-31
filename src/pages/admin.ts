// admin.ts - 관리자 페이지

import { escapeHtml, jsonForScript } from "../lib/html";

type Product = {
  id: number;
  product_number: string;
  name: string;
  image_url: string | null;
  is_active: number;
  coupang_url: string | null;
  coupang_active: number;
  naver_url: string | null;
  naver_active: number;
  coupang_clicks: number;
  naver_clicks: number;
  total_clicks: number;
};

type SiteSettings = {
  site_name: string;
  greeting: string | null;
  representative_image_url: string | null;
  link_columns: number;
  theme: "light" | "dark";
};

type VisitStats = {
  total: number;
  today: number;
};

export function adminPage(products: Product[], settings: SiteSettings, stats: VisitStats): string {
  const productList = products.length === 0
    ? `<div class="empty">등록된 상품이 없습니다.</div>`
    : products.map((product) => `
        <article class="product" data-id="${product.id}">
          <div class="product-top">
            <div class="product-main">
              ${product.image_url
                ? `<img class="product-thumb" src="${escapeHtml(product.image_url)}" alt="">`
                : `<div class="product-thumb no-image">없음</div>`
              }
              <div class="product-title-area">
                <div>
                  <span class="product-number">${escapeHtml(product.product_number)}</span>
                  <span class="total-clicks">총 클릭 <strong>${product.total_clicks}</strong></span>
                </div>
                <strong>${escapeHtml(product.name)}</strong>
              </div>
            </div>

            <!-- 수정, 삭제만 오른쪽에 배치 -->
            <div class="product-toolbar">
              <div class="actions">
                <button class="edit-btn" onclick="editProduct(${product.id})">수정</button>
                <button class="delete-btn" onclick="deleteProduct(${product.id})">삭제</button>
              </div>
            </div>
          </div>



          <div class="links-row">
            <div class="link-item">
              <div class="link-info">
                <strong>쿠팡</strong>
                <span class="${product.coupang_url ? "registered" : "not-registered"}">
                  ${product.coupang_url ? "등록됨" : "미등록"}
                </span>
                <span class="click-count">총 ${product.coupang_clicks} | 오늘 0</span>
                ${product.coupang_url
                  ? `<a href="/go/${product.id}/coupang?preview=1" target="_blank" class="preview-btn" style="font-size: 10px; padding: 3px 6px; border-radius: 4px; color: white; background: #1E293B; text-decoration: none;">미리보기</a>`
                  : ""
                }
                ${product.coupang_url
                  ? `<button class="mini-switch ${product.coupang_active === 1 ? "on" : ""}"
                             onclick="toggleLink(${product.id}, 'coupang', ${product.coupang_active === 1})">
                       <span class="knob"></span>
                     </button>`
                  : ""
                }
              </div>
            </div>
            <div class="link-item">
              <div class="link-info">
                <strong>네이버</strong>
                <span class="${product.naver_url ? "registered" : "not-registered"}">
                  ${product.naver_url ? "등록됨" : "미등록"}
                </span>
                <span class="click-count">총 ${product.naver_clicks} | 오늘 0</span>
                ${product.naver_url
                  ? `<a href="/go/${product.id}/naver?preview=1" target="_blank" class="preview-btn" style="font-size: 10px; padding: 3px 6px; border-radius: 4px; color: white; background: #1E293B; text-decoration: none;">미리보기</a>`
                  : ""
                }
                ${product.naver_url
                  ? `<button class="mini-switch ${product.naver_active === 1 ? "on" : ""}"
                             onclick="toggleLink(${product.id}, 'naver', ${product.naver_active === 1})">
                       <span class="knob"></span>
                     </button>`
                  : ""
                }
              </div>
            </div>
            <!-- 토글을 오른쪽 아래로 이동 -->
            <div class="product-toggle-bottom">
              <button class="switch ${product.is_active === 1 ? "on" : ""}"
                      onclick="toggleProduct(${product.id}, ${product.is_active === 1})">
                <span class="knob"></span>
              </button>
            </div>
          </div>
        </article>
      `).join("");

  return `
<!DOCTYPE html>
<html lang="ko" data-theme="${settings.theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(settings.site_name)} 관리자</title>

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
      --bg: #f5f5f5;
      --card: #ffffff;
      --text: #222222;
      --muted: #777777;
      --border: #e8e8e8;
      --input: #ffffff;
      --button: #222222;
      --button-text: #ffffff;
      --danger: #d93636;
      --off: #999999;
      --success: #20b35b;
      --primary: #2E64FF;
      --primary-hover: #1a4fcc;
      --shadow: rgba(0, 0, 0, 0.08);
    }

    html[data-theme="dark"] {
      --bg: #121212;
      --card: #1e1e1e;
      --text: #f5f5f5;
      --muted: #aaaaaa;
      --border: #333333;
      --input: #2a2a2a;
      --button: #f5f5f5;
      --button-text: #121212;
      --danger: #ff6b6b;
      --off: #777777;
      --success: #20b35b;
      --primary: #4a7aff;
      --primary-hover: #6b8fff;
      --shadow: rgba(0, 0, 0, 0.3);
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: Arial, "Noto Sans KR", sans-serif;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .theme-toggle {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 44px;
      height: 44px;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--card);
      color: var(--text);
      cursor: pointer;
      font-size: 20px;
      z-index: 1000;
    }

    .container {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      padding: 48px 24px;
    }

    h1 { margin: 0 0 24px; font-size: 28px; }
    h2 { margin: 0 0 18px; font-size: 18px; }

    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin: 16px 0 7px;
      font-size: 14px;
      font-weight: 700;
    }
    label:first-of-type { margin-top: 0; }

    input, select {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--input);
      color: var(--text);
      font-size: 14px;
    }

    /* [수정] 상품 등록/수정 폼을 2열로 */
    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr)); /* [핵심] 2열 */
      gap: 16px;
    }
    .settings-grid .full { grid-column: span 1; } /* [핵심] 전체 폭이 아닌 1칸 차지 */

    .submit-btn {
      width: 100%; /* [수정] 기본(평소) 상태에서는 전체 길이 */
      height: 46px;
      margin-top: 20px;
      border: 0;
      border-radius: 9px;
      background: var(--button);
      color: var(--button-text);
      font-weight: 700;
      cursor: pointer;
    }
    /* [최종] 취소 버튼 포함 폼 액션 */
    .form-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-start; /* [핵심] 항상 왼쪽 정렬 */
    }


    /* [핵심] 수정 모드일 때만 버튼이 50:50으로 나란히 */
    .form-actions.editing {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-start;
    }
    
    /* [핵심] 1개 버튼(등록)일 때는 전체 길이 */
    .form-actions .submit-btn {
      width: 100%;
      height: 46px;
      margin-top: 20px;
      border: 0;
      border-radius: 9px;
      background: var(--button);
      color: var(--button-text);
      font-weight: 700;
      cursor: pointer;
    }
    
    /* [핵심] 2개 버튼(수정)일 때는 50% */
    .form-actions.editing .submit-btn {
      width: 50%;
      height: 46px;
      margin-top: 0;
    }

    
    .cancel-btn {
      width: 50%; /* [최종] 반드시 50% */
      height: 46px;
      border: 0;
      border-radius: 9px;
      background: #d93636; /* [최종] 빨간색 */
      color: white;
      font-weight: 700;
      cursor: pointer;
    }


    .result {
      margin-top: 10px;
      text-align: center;
      font-size: 13px;
      color: var(--muted);
    }

    .accordion-content { display: none; }
    .accordion-content.open { display: block; }

    /* [전체 토글] - 크고 큰 흰색 원 */
    .switch {
      position: relative;
      width: 56px;
      height: 32px;
      background-color: #e0e0e0;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      transition: background-color 0.3s;
      display: inline-block;
      flex-shrink: 0;
    }
    .switch.on {
      background-color: #22c55e;
    }
    .switch .knob {
      position: absolute;
      top: 50%;
      left: 4px;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      background-color: white;
      border-radius: 50%;
      transition: transform 0.3s;
    }
    .switch.on .knob {
      transform: translateX(24px) translateY(-50%);
    }

    /* [쿠팡/네이버 토글] - 작고 작은 흰색 원 */
    .mini-switch {
      position: relative;
      width: 50px;
      height: 28px;
      background-color: #e0e0e0;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      transition: background-color 0.3s;
      display: inline-block;
      flex-shrink: 0;
    }
    .mini-switch.on {
      background-color: #22c55e;
    }
    .mini-switch .knob {
      position: absolute;
      top: 50%;
      left: 3px;
      transform: translateY(-50%);
      width: 15px;
      height: 15px;
      background-color: white;
      border-radius: 50%;
      transition: transform 0.3s;
    }
    .mini-switch.on .knob {
      transform: translateX(16px) translateY(-50%);
    }

    .product-number {
      background-color: #3b82f6;
      color: white;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 16px;
      font-weight: bold;
      margin-right: 5px;
    }

    .search-box { margin-bottom: 16px; }


    .product {
      background: var(--card); /* [수정] 모드에 따라 자동으로 바뀌는 색 */
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }


    html[data-theme="dark"] .product {
      background: #333333; /* [수정] 조금 덜 어두운 회색 */
      border: 1px solid #444444;
    }

    .product-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .product-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .product-thumb {
      width: 58px;
      height: 58px;
      flex: 0 0 58px;
      border-radius: 10px;
      object-fit: cover;
      background: var(--border);
    }

    .no-image {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-size: 11px;
    }

    .product-title-area {
      min-width: 0;
      display: flex;
      flex-direction: column; /* [핵심] 위(번호/총클릭) 아래(제목)로 세로 배치 */
      align-items: flex-start; /* [핵심] 왼쪽 정렬 */
      gap: 4px;
    }
    .product-title-area strong {
      font-size: 13px;
      line-height: 1.4;
      word-break: keep-all;
    }

    .status-label {
      flex: 0 0 auto;
      padding: 4px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
    }
    .status-label.active { background: #dff8e8; color: #168347; }
    .status-label.inactive { background: #eeeeee; color: #888888; }

    .actions { display: flex; gap: 6px; } /* 옆으로 배치 유지 */
    .actions button {
      border: 0;
      border-radius: 7px;
      padding: 12px 30px; /* [수정] 더 크고 넓게 */
      cursor: pointer;
      font-size: 14px; /* [수정] 글자 더 크게 */
      font-weight: 700;
      white-space: nowrap;
    }
    .edit-btn { background: #2E64FF; color: #ffffff; } /* 파란 배경 */
    .delete-btn { background: #d93636; color: #ffffff; } /* 빨간 배경 */

    
    .product-toolbar {
      display: flex;
      align-items: center; /* [핵심] 가로로 묶기 */
      gap: 6px;
    }


    /* [변경] 토글 행 배치 (수정/삭제 버튼 위에) */
    .product-toggle-row {
      display: flex;
      justify-content: flex-start; /* [변경] 왼쪽 정렬 (오른쪽에 안 붙게) */
      align-items: center;
      margin-top: 0; /* [변경] 위에 딱 붙임 */
      margin-bottom: 6px; /* [변경] 수정/삭제 버튼과의 간격 */
    }


    /* [수정] '상품' 열 제거로 인한 CSS 정리 */
    .status-row, .status-control {
      display: none;
    }

    .links-row {
      display: flex;
      justify-content: flex-start; /* [핵심] 왼쪽 정렬 */
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }

    .link-item {
      min-width: 300px; /* [핵심] 최소 너비 (원하는 만큼) */
      max-width: 500px; /* [핵심] 최대 너비 (원하는 만큼) */
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background-color: var(--input);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .link-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 0;
      min-width: 0;
    }
    
    /* [변경] 쿠팡/네이버 이름: 더 크고, 굵고, 진하게 */
    .link-info strong {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.5px;
    }

    /* [변경] 등록 여부, 조회수: 작고, 회색 */
    .registered, .not-registered, .click-count {
      font-size: 12px;
      color: var(--muted);
    }
    .registered { color: #20a65a; } /* 등록된 경우만 초록색 */
    .not-registered { color: var(--muted); }
    .click-count { color: var(--muted); }

    .mini-switch {
      width: 36px;
      height: 20px;
      margin-left: auto;
      flex-shrink: 0;
      align-items: center; /* [수정] 추가 */
      display: inline-flex; /* [수정] 추가 */
    }

    .total-clicks {
      font-size: 12px;
      color: var(--muted);
    }
    .total-clicks strong {
      margin-left: 3px;
      color: var(--text);
      font-size: 14px;
    }

    .empty {
      padding: 40px 10px;
      text-align: center;
      color: var(--muted);
    }

    @media (max-width: 650px) {
      .container { padding: 42px 14px; }
      .settings-grid { grid-template-columns: 1fr; }
      .settings-grid .full { grid-column: auto; }
      .links-row { grid-template-columns: 1fr; }
      .product-top { align-items: flex-start; }
      .product-title-area {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
    }

    @media (max-width: 430px) {
      .product-top { flex-direction: column; }
      .product-main { width: 100%; }
      .actions { width: 100%; }
      .actions button { flex: 1; }
    }

    .product-toggle-bottom {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-left: auto;
      margin-right: 10px; /* [수정] 오른쪽 여백 */
    }

    /* [미리보기 팝업] */
    .preview-active .container {
      margin-right: 380px; /* [변경] 팝업 너비에 맞게 조절 */
      transition: margin-right 0.3s ease;
    }

    .preview-panel {
      position: fixed;
      top: 60px !important;
      right: 10px !important;
      width: 380px !important;
      height: calc(100vh - 80px) !important;
      border-radius: 12px !important;
      background: var(--card);
      border-left: 3px solid #8B5E3C;
      box-shadow: -4px 0 10px rgba(0, 0, 0, 0.1);
      z-index: 999;
    }    


  </style>
</head>

<body>
    <div id="preview-panel" style="display: none; position: fixed; top: 0; right: 0; width: 400px; height: 100vh; background: white; border-left: 3px solid #8B5E3C; box-shadow: -4px 0 10px rgba(0, 0, 0, 0.1); z-index: 999;">
      <div style="padding: 12px; background: #8B5E3C; color: white; font-weight: 700; display: flex; justify-content: space-between;">
        <span>사용자 페이지 미리보기</span>
        <button onclick="togglePreview()" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer;">&times;</button>
      </div>
      <iframe id="preview-frame" src="/?preview=1" style="width: 100%; height: 100%; border: none;"></iframe>
    </div>


    <!-- [미리보기 버튼 - 아이콘] -->
    <button onclick="togglePreview()" style="position: fixed; top: 16px; right: 130px; width: 44px; height: 44px; border-radius: 50%; background: var(--card); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-size: 20px; z-index: 1001;">
      👁️
    </button>


  <button class="theme-toggle" id="theme-toggle" type="button">🌙</button>

  <main class="container">
    <h1>${escapeHtml(settings.site_name)} 관리자</h1>

    <div style="font-size: 14px; margin-bottom: 20px;">
      총 방문: <strong>${stats.total}</strong> | 
      오늘 방문: <strong>${stats.today}</strong>
    </div>

    <!-- 사이트 설정 - 아코디언 (기본 닫힘) -->
    <section class="section">
      <h2 onclick="toggleAccordion('site-settings')" style="cursor:pointer; display:flex; justify-content:space-between;">
        사이트 설정 <span>▼</span>
      </h2>
      <div id="site-settings" class="accordion-content">
        <form id="settings-form">
          <div class="settings-grid">
            <div class="full">
              <label for="site-name">사이트 이름</label>
              <input id="site-name" type="text" value="${escapeHtml(settings.site_name)}">
            </div>
            <div class="full">
              <label for="greeting">대표 인사말</label>
              <input id="greeting" type="text" value="${escapeHtml(settings.greeting || '')}">
            </div>
            <div class="full">
              <label for="rep-image-url">대표 이미지 URL</label>
              <input id="rep-image-url" type="url" value="${escapeHtml(settings.representative_image_url || "")}" placeholder="https://...">
              <!-- 파일 업로드는 R2 연동 후 추가 예정. 지금은 이미지 URL 만 지원한다. -->
            </div>
            
            <div class="full">
              <!-- [추가] 상품 배치 설정 -->
              <label for="link_columns">상품 배치 (열 수)</label>
              <select id="link_columns">
                <option value="2" ${settings.link_columns === 2 ? "selected" : ""}>2열</option>
                <option value="3" ${settings.link_columns === 3 ? "selected" : ""}>3열</option>
                <option value="6" ${settings.link_columns === 6 ? "selected" : ""}>6열</option>
              </select>
            </div>
          </div>
          
          <button class="submit-btn" type="submit">사이트 설정 저장</button>
          <div class="result" id="settings-result"></div>
        </form>
      </div>
    </section>

    <!-- 상품 등록/수정 -->
    <section class="section">
      <h2>상품 등록 / 수정</h2>
      <form id="product-form">
        <input type="hidden" id="product-id">
        
        <!-- [수정] 1행 2열 구조 -->
        <div class="settings-grid">
          <div>
            <label for="product-number">제품 번호 (예: 001)</label>
            <input id="product-number" type="text" required placeholder="001">
          </div>
          <div>
            <label for="name">상품명</label>
            <input id="name" type="text" required placeholder="상품명을 입력하세요">
          </div>
        </div>
        
        <!-- [수정] 이미지 URL을 1행 2열로 -->
        <div class="settings-grid">
          <div class="full">
            <label for="image-url">이미지 URL</label>
            <input id="image-url" type="url" placeholder="https://...">
            <input type="hidden" id="image" value="">
          </div>
        </div>
        
        <!-- [수정] 쿠팡/네이버 링크를 1행 2열로 -->
        <div class="settings-grid">
          <div>
            <label for="coupang">쿠팡 링크</label>
            <input id="coupang" type="url" placeholder="https://...">
          </div>
          <div>
            <label for="naver">네이버 링크</label>
            <input id="naver" type="url" placeholder="https://...">
          </div>
        </div>
        
        <!-- [수정] 상품 수정 시 취소 버튼 -->
        <div class="form-actions">
          <button class="submit-btn" type="submit" id="product-submit">상품 등록</button>
          <button class="cancel-btn" type="button" onclick="resetProductForm()" style="display:none;" id="cancel-btn">취소</button>
        </div>
        <div class="result" id="product-result"></div>
      </form>
    </section>

    <!-- 상품 목록 -->
    <section class="section">
      <h2>등록된 상품</h2>
      <input class="search-box" id="search" type="search" placeholder="제품번호 검색">
      <div id="product-list">${productList}</div>
    </section>
  </main>

  <script>
    const products = ${jsonForScript(products)};
    const productForm = document.getElementById("product-form");
    const productResult = document.getElementById("product-result");
    const settingsForm = document.getElementById("settings-form");
    const settingsResult = document.getElementById("settings-result");
    const themeToggle = document.getElementById("theme-toggle");


    // [미리보기 팝업 열기/닫기]
    function togglePreview() {
      const panel = document.getElementById("preview-panel");
      const container = document.querySelector(".container");

      if (panel.style.display === "none") {
        // [핵심] 미리보기 iframe은 항상 ?preview=1을 사용 (조회수 안 올라감)
        document.getElementById("preview-frame").src = "/?preview=1";
        panel.style.display = "block";
        container.classList.add("preview-active");
      } else {
        panel.style.display = "none";
        container.classList.remove("preview-active");
      }
    }


    // [추가] 상품 등록 폼 초기화 (취소 버튼)
    function resetProductForm() {
      document.getElementById("product-id").value = "";
      document.getElementById("product-number").value = "";
      document.getElementById("name").value = "";
      document.getElementById("image-url").value = "";
      document.getElementById("image").value = "";
      document.getElementById("coupang").value = "";
      document.getElementById("naver").value = "";
      
      // [핵심] 수정 모드 클래스 제거
      document.querySelector(".form-actions").classList.remove("editing");
      
      // [핵심] 버튼의 인라인 스타일 초기화 (이게 빠져 있었습니다!)
      const submitBtn = document.getElementById("product-submit");
      submitBtn.style.width = "";
      submitBtn.style.marginTop = "";
      
      document.getElementById("cancel-btn").style.display = "none";
      
      document.getElementById("product-submit").textContent = "상품 등록";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }


    function toggleAccordion(id) {
      document.getElementById(id).classList.toggle('open');
    }

    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      if (themeToggle) {
        themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
      }
    }

    const initialTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(initialTheme);

    themeToggle?.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("multilink-theme", next);
      applyTheme(next);
    });

    // ===== 사이트 설정 저장 (URL + 파일 업로드) =====
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      settingsResult.textContent = "저장 중...";

      const representativeImage = document.getElementById("rep-image-url").value;

      try {
        const response = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_name: document.getElementById("site-name").value,
            greeting: document.getElementById("greeting").value,
            representative_image_url: representativeImage,
            link_columns: Number(document.getElementById("link_columns").value), // [수정] 설정값 사용
            theme: document.documentElement.dataset.theme
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "저장에 실패했습니다.");

        settingsResult.textContent = "저장되었습니다.";
        setTimeout(() => location.reload(), 400);
      } catch (error) {
        settingsResult.textContent = error instanceof Error ? error.message : "저장에 실패했습니다.";
      }
    });

    // ===== 상품 수정 =====
    function editProduct(id) {
      const product = products.find(item => item.id === id);
      if (!product) return;

      document.getElementById("product-id").value = product.id;
      document.getElementById("product-number").value = product.product_number || "";
      document.getElementById("name").value = product.name || "";
      document.getElementById("image-url").value = product.image_url || "";
      document.getElementById("image").value = product.image_url || "";
      
      document.getElementById("coupang").value = product.coupang_url || "";
      document.getElementById("naver").value = product.naver_url || "";
      
      // [핵심] 수정 모드: form-actions에 editing 클래스 추가
      document.querySelector(".form-actions").classList.add("editing");
      
      document.getElementById("cancel-btn").style.display = "block";
      
      document.getElementById("product-submit").textContent = "상품 수정";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ===== 상품 등록/수정 =====
    productForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const id = document.getElementById("product-id").value;
      const data = {
        product_number: document.getElementById("product-number").value,
        name: document.getElementById("name").value,
        image: document.getElementById("image-url").value || document.getElementById("image").value, // URL 또는 업로드 파일
        coupang: document.getElementById("coupang").value,
        naver: document.getElementById("naver").value
      };

      productResult.textContent = id ? "수정 중..." : "등록 중...";

      try {
        const response = await fetch(id ? "/api/products/" + id : "/api/products", {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });

        const responseData = await response.json();
        if (!response.ok) throw new Error(responseData.error || "처리에 실패했습니다.");
        location.reload();
      } catch (error) {
        productResult.textContent = error instanceof Error ? error.message : "처리에 실패했습니다.";
      }
    });

    // ===== 상품 ON/OFF =====
    async function toggleProduct(id, current) {
      try {
        const response = await fetch("/api/products/" + id + "/status", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !current })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "상태 변경에 실패했습니다.");
        location.reload();
      } catch (error) {
        alert(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
      }
    }

    // ===== 링크 ON/OFF =====
    async function toggleLink(id, platform, current) {
      try {
        const response = await fetch("/api/products/" + id + "/links/" + platform + "/status", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !current })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "링크 상태 변경에 실패했습니다.");
        location.reload();
      } catch (error) {
        alert(error instanceof Error ? error.message : "링크 상태 변경에 실패했습니다.");
      }
    }

    // ===== 상품 삭제 =====
    async function deleteProduct(id) {
      if (!confirm("이 상품을 삭제하시겠습니까?")) return;

      try {
        const response = await fetch("/api/products/" + id, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "삭제에 실패했습니다.");
        location.reload();
      } catch (error) {
        alert(error instanceof Error ? error.message : "삭제에 실패했습니다.");
      }
    }

    // ===== 상품 검색 =====
    const search = document.getElementById("search");
    search.addEventListener("input", () => {
      const keyword = search.value.trim().toLowerCase();
      document.querySelectorAll(".product").forEach((element) => {
        const product = products.find(item => String(item.id) === element.dataset.id);
        if (!product) return;
        element.style.display = product.product_number.toLowerCase().includes(keyword) ? "" : "none";
      });
    });
  </script>
</body>
</html>
`;
}