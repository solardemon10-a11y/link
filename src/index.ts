// index.ts - 개선된 전체 버전 (요청사항 반영)

import { homePage } from "./pages/home";
import { adminPage } from "./pages/admin";
import { requireAdmin } from "./auth";
import type { Env } from "./env";

type SiteSettings = {
  site_name: string;
  greeting: string | null; // [추가] 대표 인사말
  representative_image_url: string | null;
  link_columns: number;
  theme: "light" | "dark";
};

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
};

type AdminProduct = Product & {
  coupang_clicks: number;
  naver_clicks: number;
  total_clicks: number;
};

// ============================================================
// 캐시 관련 변수
// ============================================================
let cachedSettings: SiteSettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1분

// ============================================================
// 유틸리티 함수
// ============================================================

/**
 * 사이트 설정 조회 (캐싱 적용) - [수정] greeting 추가
 */
async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const now = Date.now();

  if (cachedSettings && now - settingsCacheTime < CACHE_TTL) {
    return cachedSettings;
  }

  let settings = await db
    .prepare(
      `SELECT site_name, greeting, representative_image_url, link_columns, theme 
       FROM site_settings WHERE id = 1`
    )
    .first<SiteSettings>();

  if (!settings) {
    await db
      .prepare(
        `INSERT INTO site_settings (id, site_name, greeting, representative_image_url, link_columns, theme)
         VALUES (1, '멀티링크', '', NULL, 2, 'light')`
      )
      .run();

    settings = {
      site_name: "멀티링크",
      greeting: "",
      representative_image_url: null,
      link_columns: 2,
      theme: "light",
    };
  }

  cachedSettings = settings;
  settingsCacheTime = now;
  return settings;
}

/**
 * 상품 목록 조회 - [수정] product_number, 검색 추가
 */
async function getProducts(db: D1Database, includeInactive = false, searchTerm = ""): Promise<Product[]> {
  const where = includeInactive ? "WHERE 1=1" : "WHERE p.is_active = 1";
  const searchWhere = searchTerm ? ` AND p.product_number LIKE ?` : "";

  const result = await db
    .prepare(
      `
      SELECT
        p.id,
        p.product_number,
        p.name,
        p.image_url,
        p.is_active,
        MAX(CASE WHEN pl.platform = 'coupang' THEN pl.url END) AS coupang_url,
        MAX(CASE WHEN pl.platform = 'coupang' THEN pl.is_active END) AS coupang_active,
        MAX(CASE WHEN pl.platform = 'naver' THEN pl.url END) AS naver_url,
        MAX(CASE WHEN pl.platform = 'naver' THEN pl.is_active END) AS naver_active
      FROM products p
      LEFT JOIN product_links pl ON p.id = pl.product_id
      ${where} ${searchWhere}
      GROUP BY p.id
      ORDER BY p.id DESC
      `
    )
    .bind(...(searchTerm ? [`%${searchTerm}%`] : []))
    .all<Product>();

  return result.results.map((product) => ({
    ...product,
    coupang_active: product.coupang_active === null ? 0 : product.coupang_active,
    naver_active: product.naver_active === null ? 0 : product.naver_active,
  }));
}

/**
 * 관리자용 상품 목록 조회 (클릭 수 포함) - [수정] product_number 추가
 */
async function getAdminProducts(db: D1Database): Promise<AdminProduct[]> {
  const result = await db
    .prepare(
      `
      SELECT
        p.id,
        p.product_number,
        p.name,
        p.image_url,
        p.is_active,
        MAX(CASE WHEN pl.platform = 'coupang' THEN pl.url END) AS coupang_url,
        MAX(CASE WHEN pl.platform = 'coupang' THEN pl.is_active END) AS coupang_active,
        MAX(CASE WHEN pl.platform = 'naver' THEN pl.url END) AS naver_url,
        MAX(CASE WHEN pl.platform = 'naver' THEN pl.is_active END) AS naver_active,
        COALESCE(cc.coupang_clicks, 0) AS coupang_clicks,
        COALESCE(cc.naver_clicks, 0) AS naver_clicks,
        COALESCE(cc.total_clicks, 0) AS total_clicks
      FROM products p
      LEFT JOIN product_links pl
        ON p.id = pl.product_id
      LEFT JOIN (
        SELECT
          product_id,
          SUM(CASE WHEN platform = 'coupang' THEN 1 ELSE 0 END) AS coupang_clicks,
          SUM(CASE WHEN platform = 'naver' THEN 1 ELSE 0 END) AS naver_clicks,
          COUNT(*) AS total_clicks
        FROM link_clicks
        GROUP BY product_id
      ) cc
        ON p.id = cc.product_id
      GROUP BY p.id
      ORDER BY p.id DESC
      `
    )
    .all<AdminProduct>();

  return result.results.map((product) => ({
    ...product,
    coupang_active: product.coupang_active === null ? 0 : product.coupang_active,
    naver_active: product.naver_active === null ? 0 : product.naver_active,
    coupang_clicks: Number(product.coupang_clicks || 0),
    naver_clicks: Number(product.naver_clicks || 0),
    total_clicks: Number(product.total_clicks || 0),
  }));
}

/**
 * 상품 ID 검증
 */
function parseProductId(pathname: string): { id: number | null; error?: Response } {
  const parts = pathname.split("/");
  const idStr = parts[3];

  if (!idStr) {
    return { id: null, error: Response.json({ error: "상품 ID가 필요합니다." }, { status: 400 }) };
  }

  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return { id: null, error: Response.json({ error: "잘못된 상품 ID입니다." }, { status: 400 }) };
  }

  return { id };
}

/**
 * 플랫폼 검증
 */
function validatePlatform(platform: string): platform is "coupang" | "naver" {
  return platform === "coupang" || platform === "naver";
}

// ============================================================
// 핸들러 함수들
// ============================================================

/**
 * 관리자 페이지 핸들러 - [수정] 방문자 수 추가
 */
async function handleAdminPage(db: D1Database): Promise<Response> {
  try {
    const [settings, products, stats] = await Promise.all([
      getSiteSettings(db),
      getAdminProducts(db),
      getVisitStats(db),
    ]);

    return new Response(adminPage(products, settings, stats), {
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  } catch (error) {
    console.error(error);
    return new Response("관리자 페이지를 불러오는 중 오류가 발생했습니다.", { status: 500 });
  }
}

/**
 * 사이트 설정 저장 핸들러 - [수정] greeting 추가
 */
async function handleSettingsUpdate(request: Request, db: D1Database): Promise<Response> {
  try {
    const body = (await request.json()) as {
      site_name?: string;
      greeting?: string;
      representative_image_url?: string;
      link_columns?: number;
      theme?: "light" | "dark";
    };

    const siteName = body.site_name?.trim() || "멀티링크";
    const greeting = body.greeting?.trim() || "";
    const representativeImage = body.representative_image_url?.trim() || ""; // [중요] URL 값 받기
    const linkColumns = [1, 2, 3, 6].includes(body.link_columns ?? 0) ? body.link_columns! : 2;
    const theme = body.theme === "dark" ? "dark" : "light";

    await db
      .prepare(
        `
        INSERT INTO site_settings (id, site_name, greeting, representative_image_url, link_columns, theme)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          site_name = excluded.site_name,
          greeting = excluded.greeting,
          representative_image_url = excluded.representative_image_url,
          link_columns = excluded.link_columns,
          theme = excluded.theme,
          updated_at = CURRENT_TIMESTAMP
        `
      )
      .bind(siteName, greeting, representativeImage, linkColumns, theme)
      .run();

    cachedSettings = null;

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "사이트 설정 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * 상품 등록 핸들러 - [수정] product_number 필수 검증 및 등록
 */
async function handleProductCreate(request: Request, db: D1Database): Promise<Response> {
  try {
    const body = (await request.json()) as {
      product_number?: string;
      name?: string;
      image?: string;
      coupang?: string;
      naver?: string;
    };

    if (!body.product_number?.trim() || !body.name?.trim()) {
      return Response.json({ error: "제품번호와 상품명을 입력해주세요." }, { status: 400 });
    }

    const product = await db
      .prepare(
        `INSERT INTO products (product_number, name, image_url, is_active) VALUES (?, ?, ?, 1) RETURNING id`
      )
      .bind(body.product_number.trim(), body.name.trim(), body.image?.trim() || null)
      .first<{ id: number }>();

    if (!product) {
      throw new Error("상품 생성에 실패했습니다.");
    }

    // 링크 등록
    const links = [
      { platform: "coupang" as const, url: body.coupang?.trim() },
      { platform: "naver" as const, url: body.naver?.trim() },
    ];

    for (const link of links) {
      if (link.url) {
        await db
          .prepare(
            `INSERT INTO product_links (product_id, platform, url, is_active) VALUES (?, ?, ?, 1)`
          )
          .bind(product.id, link.platform, link.url)
          .run();
      }
    }

    return Response.json({ success: true, id: product.id });
  } catch (error) {
    console.error(error);
    if (isUniqueViolation(error)) {
      return Response.json({ error: "이미 등록된 제품번호입니다." }, { status: 409 });
    }
    return Response.json({ error: "상품 등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** D1 의 UNIQUE 제약 위반인지 (메시지 문자열로만 판별 가능) */
function isUniqueViolation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(msg);
}

/**
 * 상품 수정 핸들러 - [수정] product_number 수정
 */
async function handleProductUpdate(request: Request, db: D1Database, productId: number): Promise<Response> {
  try {
    const body = (await request.json()) as {
      product_number?: string;
      name?: string;
      image?: string;
      coupang?: string;
      naver?: string;
    };

    if (!body.product_number?.trim() || !body.name?.trim()) {
      return Response.json({ error: "제품번호와 상품명을 입력해주세요." }, { status: 400 });
    }

    // 상품 존재 여부 확인
    const existing = await db
      .prepare(`SELECT id FROM products WHERE id = ?`)
      .bind(productId)
      .first<{ id: number }>();

    if (!existing) {
      return Response.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    // 상품 정보 업데이트
    await db
      .prepare(
        `UPDATE products SET product_number = ?, name = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .bind(body.product_number.trim(), body.name.trim(), body.image?.trim() || null, productId)
      .run();

    // 링크 업데이트
    const links = [
      { platform: "coupang" as const, url: body.coupang?.trim() },
      { platform: "naver" as const, url: body.naver?.trim() },
    ];

    for (const link of links) {
      if (link.url) {
        await db
          .prepare(
            `INSERT INTO product_links (product_id, platform, url, is_active) VALUES (?, ?, ?, 1)
             ON CONFLICT(product_id, platform) DO UPDATE SET url = excluded.url, is_active = 1, updated_at = CURRENT_TIMESTAMP`
          )
          .bind(productId, link.platform, link.url)
          .run();
      } else {
        await db
          .prepare(`DELETE FROM product_links WHERE product_id = ? AND platform = ?`)
          .bind(productId, link.platform)
          .run();
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    if (isUniqueViolation(error)) {
      return Response.json({ error: "이미 등록된 제품번호입니다." }, { status: 409 });
    }
    return Response.json({ error: "상품 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * 상품 상태 변경 핸들러 (ON/OFF)
 */
async function handleProductStatus(request: Request, db: D1Database, productId: number): Promise<Response> {
  try {
    const body = (await request.json()) as { is_active?: boolean };
    const isActive = body.is_active ? 1 : 0;

    await db
      .prepare(`UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(isActive, productId)
      .run();

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "상품 상태 변경에 실패했습니다." }, { status: 500 });
  }
}

/**
 * 링크 상태 변경 핸들러 (ON/OFF)
 */
async function handleLinkStatus(
  request: Request,
  db: D1Database,
  productId: number,
  platform: string
): Promise<Response> {
  if (!validatePlatform(platform)) {
    return Response.json({ error: "잘못된 플랫폼입니다." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { is_active?: boolean };
    const isActive = body.is_active ? 1 : 0;

    await db
      .prepare(`UPDATE product_links SET is_active = ? WHERE product_id = ? AND platform = ?`)
      .bind(isActive, productId, platform)
      .run();

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "링크 상태 변경에 실패했습니다." }, { status: 500 });
  }
}

/**
 * 상품 삭제 핸들러
 */
async function handleProductDelete(db: D1Database, productId: number): Promise<Response> {
  try {
    await db.prepare(`DELETE FROM products WHERE id = ?`).bind(productId).run();
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "상품 삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * 링크 리다이렉트 핸들러
 * - 클릭 기록은 응답을 막지 않도록 ctx.waitUntil 로 백그라운드 처리
 * - 봇/프리페치(카톡·슬랙 언펄링 등)는 클릭으로 세지 않음
 * - 저장된 URL 이 http(s) 가 아니면 리다이렉트하지 않고 404 (Response.redirect 예외 방지)
 */
async function handleRedirect(
  db: D1Database,
  pathname: string,
  ctx: ExecutionContext,
  request: Request
): Promise<Response> {
  const parts = pathname.split("/");
  const productId = Number(parts[2]);
  const platform = parts[3];

  if (!Number.isInteger(productId) || productId <= 0 || !validatePlatform(platform)) {
    return new Response("Not Found", { status: 404 });
  }

  const link = await db
    .prepare(
      `
      SELECT pl.url
      FROM product_links pl
      INNER JOIN products p ON p.id = pl.product_id
      WHERE pl.product_id = ? AND pl.platform = ? AND pl.is_active = 1 AND p.is_active = 1
      `
    )
    .bind(productId, platform)
    .first<{ url: string }>();

  if (!link || !/^https?:\/\//i.test(link.url)) {
    return new Response("Link Not Found", { status: 404 });
  }

  if (countableHit(request)) {
    ctx.waitUntil(
      db
        .prepare(`INSERT INTO link_clicks (product_id, platform) VALUES (?, ?)`)
        .bind(productId, platform)
        .run()
    );
  }

  return Response.redirect(link.url, 302);
}

/**
 * 메인 페이지 핸들러 - [수정] 검색어 추가
 */
async function handleHomePage(db: D1Database, searchTerm: string): Promise<Response> {
  try {
    const [settings, products] = await Promise.all([
      getSiteSettings(db),
      getProducts(db, false, searchTerm),
    ]);

    return new Response(homePage(products, settings), {
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  } catch (error) {
    console.error(error);
    return new Response("페이지를 불러오는 중 오류가 발생했습니다.", { status: 500 });
  }
}

/** 한국(KST, UTC+9) 기준 YYYY-MM-DD */
function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

/**
 * 링크 미리보기 크롤러(카톡·슬랙·페북 등)·검색봇·브라우저 프리페치를
 * 방문/클릭 집계에서 제외한다. 완벽하진 않지만 가장 큰 왜곡 원인들을 걸러낸다.
 */
function countableHit(request: Request): boolean {
  const purpose = (
    request.headers.get("Sec-Purpose") ||
    request.headers.get("Purpose") ||
    request.headers.get("X-Purpose") ||
    ""
  ).toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("preview")) return false;

  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (!ua) return false; // UA 없는 요청은 대부분 봇
  const BOT_RE =
    /bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|kakaostory-og|slackbot|twitterbot|telegrambot|discordbot|whatsapp|line-poker|embedly|preview|pinterest|petalbot|bytespider|headlesschrome|python-requests|axios|curl|wget|go-http/i;
  return !BOT_RE.test(ua);
}

/** 방문 집계에 셀 요청인지 (홈 GET + 봇 아님 + preview/deploy_check 아님) */
function countableVisit(request: Request, url: URL): boolean {
  if (url.searchParams.get("preview") === "1") return false;
  if (url.searchParams.get("deploy_check") === "1") return false;
  return countableHit(request);
}

/** 사이트 방문 수 조회 (총 / 오늘) */
async function getVisitStats(db: D1Database): Promise<{ total: number; today: number }> {
  const [total, todayCount] = await Promise.all([
    db.prepare(`SELECT SUM(visit_count) as total FROM site_visits`).first<{ total: number }>(),
    db
      .prepare(`SELECT visit_count as today FROM site_visits WHERE visit_date = ?`)
      .bind(kstDate())
      .first<{ today: number }>(),
  ]);

  return {
    total: total?.total || 0,
    today: todayCount?.today || 0,
  };
}

/** 오늘 날짜 행의 visit_count 를 +1 (없으면 생성). ctx.waitUntil 로만 호출한다. */
async function recordVisit(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO site_visits (visit_date, visit_count)
       VALUES (?, 1)
       ON CONFLICT(visit_date) DO UPDATE SET visit_count = visit_count + 1`
    )
    .bind(kstDate())
    .run();
}

// ============================================================
// 메인 Worker
// ============================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const db = env.multilink_db;
    const pathname = url.pathname;
    const method = request.method;

    // ========== 관리자 인증 (Cloudflare Access) ==========
    // /admin 과 모든 /api/* 는 인증을 통과해야 한다.
    if (pathname === "/admin" || pathname.startsWith("/api/")) {
      const guard = await requireAdmin(request, env);
      if (!guard.ok) return guard.response;
    }

    // ========== 방문 기록 (응답을 막지 않음) ==========
    if (pathname === "/" && method === "GET" && countableVisit(request, url)) {
      ctx.waitUntil(recordVisit(db));
    }

    // ========== 관리자 페이지 ==========
    if (pathname === "/admin" && method === "GET") {
      return handleAdminPage(db);
    }

    // ========== 사이트 설정 ==========
    if (pathname === "/api/settings" && method === "PUT") {
      return handleSettingsUpdate(request, db);
    }

    // ========== 상품 API ==========
    // POST /api/products - 상품 등록
    if (pathname === "/api/products" && method === "POST") {
      return handleProductCreate(request, db);
    }

    // DELETE /api/products/:id - 상품 삭제
    if (pathname.startsWith("/api/products/") && method === "DELETE") {
      const { id, error } = parseProductId(pathname);
      if (error) return error;
      return handleProductDelete(db, id!);
    }

    // PUT /api/products/:id - 상품 수정
    if (pathname.startsWith("/api/products/") && method === "PUT") {
      // /api/products/:id/status 패턴은 제외
      if (pathname.includes("/status") || pathname.includes("/links")) {
        // 다른 핸들러에서 처리
      } else {
        const { id, error } = parseProductId(pathname);
        if (error) return error;
        return handleProductUpdate(request, db, id!);
      }
    }

    // PUT /api/products/:id/links/:platform/status - 링크 ON/OFF
    if (pathname.match(/^\/api\/products\/\d+\/links\/(coupang|naver)\/status$/) && method === "PUT") {
      const parts = pathname.split("/");
      const productId = Number(parts[3]);
      const platform = parts[5];

      if (!Number.isInteger(productId) || productId <= 0) {
        return Response.json({ error: "잘못된 상품 ID입니다." }, { status: 400 });
      }

      return handleLinkStatus(request, db, productId, platform);
    }

    // ========== 리다이렉트 ==========
    if (pathname.startsWith("/go/")) {
      return handleRedirect(db, pathname, ctx, request);
    }

    // ========== 메인 페이지 ==========
    if (pathname === "/" && method === "GET") {
      return handleHomePage(db, url.searchParams.get("search") || "");
    }

    return new Response("Not Found", { status: 404 });
  },
};