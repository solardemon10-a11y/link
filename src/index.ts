// index.ts - Worker 엔트리 · 라우팅 · D1 접근 · 핸들러

import { homePage } from "./pages/home";
import { adminPage } from "./pages/admin";
import { requireAdmin } from "./auth";
import type { Env } from "./env";
import type { Platform, Product, AdminProduct, SiteSettings, VisitStats } from "./types";

// ============================================================
// 설정 캐시 (isolate 로컬. 저장 시 무효화, 최대 CACHE_TTL 만큼 stale 가능)
// ============================================================
let cachedSettings: SiteSettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60 * 1000;

const HTML = "text/html; charset=UTF-8";

// ============================================================
// 공통 유틸
// ============================================================

/** 한국(KST, UTC+9) 기준 YYYY-MM-DD */
function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function html(body: string, cacheControl: string): Response {
  return new Response(body, {
    headers: {
      "content-type": HTML,
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

function validatePlatform(platform: string): platform is Platform {
  return platform === "coupang" || platform === "naver";
}

/** D1 UNIQUE 제약 위반 여부 (메시지 문자열로만 판별 가능) */
function isUniqueViolation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(msg);
}

// ── 봇/프리페치 필터 ─────────────────────────────────────────
/**
 * 링크 미리보기 크롤러(카톡·슬랙·페북 등)·검색봇·브라우저 프리페치를
 * 방문/클릭 집계에서 제외한다. 완벽하진 않지만 가장 큰 왜곡 원인들을 거른다.
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

/** 방문 집계 대상 요청인지 (봇 아님 + preview/deploy_check 아님) */
function countableVisit(request: Request, url: URL): boolean {
  if (url.searchParams.get("preview") === "1") return false;
  if (url.searchParams.get("deploy_check") === "1") return false;
  return countableHit(request);
}

/** 오늘(KST) 이미 방문 카운트된 브라우저인지 — 쿠키로 하루 1회 중복 제거 */
function hasFreshVisitCookie(request: Request): boolean {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)mlv=([^;]+)/);
  return m?.[1] === kstDate();
}

function visitCookie(url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `mlv=${kstDate()}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly${secure}`;
}

// ============================================================
// D1 조회
// ============================================================

async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const now = Date.now();
  if (cachedSettings && now - settingsCacheTime < CACHE_TTL) {
    return cachedSettings;
  }

  let settings = await db
    .prepare(
      `SELECT site_name, greeting, representative_image_url, link_columns, theme, disclosure
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
      disclosure: null,
    };
  }

  cachedSettings = settings;
  settingsCacheTime = now;
  return settings;
}

/** 공개 페이지용 상품 목록 (검색은 클라이언트에서 처리하므로 여기선 안 받는다) */
async function getProducts(db: D1Database, includeInactive = false): Promise<Product[]> {
  const where = includeInactive ? "" : "WHERE p.is_active = 1";

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
      ${where}
      GROUP BY p.id
      ORDER BY p.id DESC
      `
    )
    .all<Product>();

  return result.results.map((product) => ({
    ...product,
    coupang_active: product.coupang_active === null ? 0 : product.coupang_active,
    naver_active: product.naver_active === null ? 0 : product.naver_active,
  }));
}

/** 관리자용 상품 목록 (전체/오늘 클릭 수 포함) */
async function getAdminProducts(db: D1Database): Promise<AdminProduct[]> {
  const today = kstDate();

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
        COALESCE(cc.coupang_clicks, 0)        AS coupang_clicks,
        COALESCE(cc.naver_clicks, 0)          AS naver_clicks,
        COALESCE(cc.total_clicks, 0)          AS total_clicks,
        COALESCE(cc.coupang_clicks_today, 0)  AS coupang_clicks_today,
        COALESCE(cc.naver_clicks_today, 0)    AS naver_clicks_today
      FROM products p
      LEFT JOIN product_links pl ON p.id = pl.product_id
      LEFT JOIN (
        SELECT
          product_id,
          SUM(CASE WHEN platform = 'coupang' THEN 1 ELSE 0 END) AS coupang_clicks,
          SUM(CASE WHEN platform = 'naver'   THEN 1 ELSE 0 END) AS naver_clicks,
          COUNT(*)                                              AS total_clicks,
          SUM(CASE WHEN platform = 'coupang' AND date(created_at, '+9 hours') = ? THEN 1 ELSE 0 END) AS coupang_clicks_today,
          SUM(CASE WHEN platform = 'naver'   AND date(created_at, '+9 hours') = ? THEN 1 ELSE 0 END) AS naver_clicks_today
        FROM link_clicks
        GROUP BY product_id
      ) cc ON p.id = cc.product_id
      GROUP BY p.id
      ORDER BY p.id DESC
      `
    )
    .bind(today, today)
    .all<AdminProduct>();

  return result.results.map((product) => ({
    ...product,
    coupang_active: product.coupang_active === null ? 0 : product.coupang_active,
    naver_active: product.naver_active === null ? 0 : product.naver_active,
    coupang_clicks: Number(product.coupang_clicks || 0),
    naver_clicks: Number(product.naver_clicks || 0),
    total_clicks: Number(product.total_clicks || 0),
    coupang_clicks_today: Number(product.coupang_clicks_today || 0),
    naver_clicks_today: Number(product.naver_clicks_today || 0),
  }));
}

async function getVisitStats(db: D1Database): Promise<VisitStats> {
  const [total, todayRow] = await Promise.all([
    db.prepare(`SELECT SUM(visit_count) as total FROM site_visits`).first<{ total: number }>(),
    db
      .prepare(`SELECT visit_count as today FROM site_visits WHERE visit_date = ?`)
      .bind(kstDate())
      .first<{ today: number }>(),
  ]);
  return { total: total?.total || 0, today: todayRow?.today || 0 };
}

/** 오늘 날짜 행의 visit_count 를 +1. ctx.waitUntil 로만 호출한다. */
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
// 핸들러
// ============================================================

async function handleHomePage(db: D1Database, preview = false): Promise<Response> {
  try {
    const [settings, products] = await Promise.all([getSiteSettings(db), getProducts(db, false)]);
    // 일반 방문: 인스타 등 반복 요청을 줄이려 짧게 캐시 (편집 후 최대 30초 stale).
    // 관리자 미리보기(?preview=1): 편집 결과가 즉시 보여야 하므로 캐시 안 함.
    const cache = preview ? "no-store" : "public, max-age=30";
    return html(homePage(products, settings), cache);
  } catch (error) {
    console.error(error);
    return new Response("페이지를 불러오는 중 오류가 발생했습니다.", { status: 500 });
  }
}

async function handleAdminPage(db: D1Database): Promise<Response> {
  try {
    const [settings, products, stats] = await Promise.all([
      getSiteSettings(db),
      getAdminProducts(db),
      getVisitStats(db),
    ]);
    return html(adminPage(products, settings, stats), "private, no-store");
  } catch (error) {
    console.error(error);
    return new Response("관리자 페이지를 불러오는 중 오류가 발생했습니다.", { status: 500 });
  }
}

async function handleSettingsUpdate(request: Request, db: D1Database): Promise<Response> {
  try {
    const body = (await request.json()) as {
      site_name?: string;
      greeting?: string;
      representative_image_url?: string;
      link_columns?: number;
      theme?: "light" | "dark";
      disclosure?: string;
    };

    const siteName = body.site_name?.trim() || "멀티링크";
    const greeting = body.greeting?.trim() || "";
    const representativeImage = body.representative_image_url?.trim() || "";
    const linkColumns = [1, 2, 3, 6].includes(body.link_columns ?? 0) ? body.link_columns! : 2;
    const theme = body.theme === "dark" ? "dark" : "light";
    const disclosure = body.disclosure?.trim() || "";

    await db
      .prepare(
        `
        INSERT INTO site_settings (id, site_name, greeting, representative_image_url, link_columns, theme, disclosure)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          site_name = excluded.site_name,
          greeting = excluded.greeting,
          representative_image_url = excluded.representative_image_url,
          link_columns = excluded.link_columns,
          theme = excluded.theme,
          disclosure = excluded.disclosure,
          updated_at = CURRENT_TIMESTAMP
        `
      )
      .bind(siteName, greeting, representativeImage, linkColumns, theme, disclosure)
      .run();

    cachedSettings = null;
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "사이트 설정 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

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

    if (!product) throw new Error("상품 생성에 실패했습니다.");

    await upsertLinks(db, product.id, body, /* deleteEmpty */ false);

    return Response.json({ success: true, id: product.id });
  } catch (error) {
    console.error(error);
    if (isUniqueViolation(error)) {
      return Response.json({ error: "이미 등록된 제품번호입니다." }, { status: 409 });
    }
    return Response.json({ error: "상품 등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}

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

    const existing = await db
      .prepare(`SELECT id FROM products WHERE id = ?`)
      .bind(productId)
      .first<{ id: number }>();
    if (!existing) {
      return Response.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    await db
      .prepare(
        `UPDATE products SET product_number = ?, name = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .bind(body.product_number.trim(), body.name.trim(), body.image?.trim() || null, productId)
      .run();

    await upsertLinks(db, productId, body, /* deleteEmpty */ true);

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    if (isUniqueViolation(error)) {
      return Response.json({ error: "이미 등록된 제품번호입니다." }, { status: 409 });
    }
    return Response.json({ error: "상품 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 쿠팡/네이버 링크를 upsert. deleteEmpty=true 면 빈 값은 링크를 삭제한다(수정 흐름). */
async function upsertLinks(
  db: D1Database,
  productId: number,
  body: { coupang?: string; naver?: string },
  deleteEmpty: boolean
): Promise<void> {
  const links: { platform: Platform; url: string | undefined }[] = [
    { platform: "coupang", url: body.coupang?.trim() },
    { platform: "naver", url: body.naver?.trim() },
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
    } else if (deleteEmpty) {
      await db
        .prepare(`DELETE FROM product_links WHERE product_id = ? AND platform = ?`)
        .bind(productId, link.platform)
        .run();
    }
  }
}

async function handleProductStatus(request: Request, db: D1Database, productId: number): Promise<Response> {
  try {
    const body = (await request.json()) as { is_active?: boolean };
    await db
      .prepare(`UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, productId)
      .run();
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "상품 상태 변경에 실패했습니다." }, { status: 500 });
  }
}

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
    await db
      .prepare(`UPDATE product_links SET is_active = ? WHERE product_id = ? AND platform = ?`)
      .bind(body.is_active ? 1 : 0, productId, platform)
      .run();
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "링크 상태 변경에 실패했습니다." }, { status: 500 });
  }
}

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
 * 링크 리다이렉트.
 * - 클릭 기록은 ctx.waitUntil 로 백그라운드 처리 (응답을 막지 않음)
 * - 봇/프리페치는 클릭으로 세지 않음
 * - 저장된 URL 이 http(s) 가 아니면 404 (Response.redirect 예외 방지)
 */
async function handleRedirect(
  db: D1Database,
  productId: number,
  platform: Platform,
  ctx: ExecutionContext,
  request: Request
): Promise<Response> {
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

  return new Response(null, {
    status: 302,
    headers: { location: link.url, "cache-control": "private, no-store" },
  });
}

// ============================================================
// 라우터
// ============================================================

type RouteCtx = {
  request: Request;
  ctx: ExecutionContext;
  db: D1Database;
  params: string[]; // 정규식 캡처 그룹
};

type Route = {
  method: string;
  pattern: RegExp;
  handler: (c: RouteCtx) => Response | Promise<Response>;
};

// 구체적인 패턴을 먼저. 첫 매치가 이긴다.
const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/admin$/, handler: (c) => handleAdminPage(c.db) },

  { method: "PUT", pattern: /^\/api\/settings$/, handler: (c) => handleSettingsUpdate(c.request, c.db) },

  { method: "POST", pattern: /^\/api\/products$/, handler: (c) => handleProductCreate(c.request, c.db) },

  {
    method: "PUT",
    pattern: /^\/api\/products\/(\d+)\/links\/(coupang|naver)\/status$/,
    handler: (c) => handleLinkStatus(c.request, c.db, Number(c.params[0]), c.params[1]),
  },
  {
    method: "PUT",
    pattern: /^\/api\/products\/(\d+)\/status$/,
    handler: (c) => handleProductStatus(c.request, c.db, Number(c.params[0])),
  },
  {
    method: "PUT",
    pattern: /^\/api\/products\/(\d+)$/,
    handler: (c) => handleProductUpdate(c.request, c.db, Number(c.params[0])),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/products\/(\d+)$/,
    handler: (c) => handleProductDelete(c.db, Number(c.params[0])),
  },

  {
    method: "GET",
    pattern: /^\/go\/(\d+)\/(coupang|naver)$/,
    handler: (c) =>
      handleRedirect(c.db, Number(c.params[0]), c.params[1] as Platform, c.ctx, c.request),
  },
];

// ============================================================
// 엔트리
// ============================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const db = env.multilink_db;
    const { pathname } = url;
    const method = request.method;

    // ── 관리자 인증 (Cloudflare Access): /admin, /api/* ──
    if (pathname === "/admin" || pathname.startsWith("/api/")) {
      const guard = await requireAdmin(request, env);
      if (!guard.ok) return guard.response;
    }

    // ── 공개 홈 ──
    if (pathname === "/" && method === "GET") {
      const res = await handleHomePage(db, url.searchParams.get("preview") === "1");
      // 방문 카운트: 봇 아님 + 오늘 첫 방문(쿠키 없음)일 때만
      if (countableVisit(request, url) && !hasFreshVisitCookie(request)) {
        ctx.waitUntil(recordVisit(db));
        res.headers.append("Set-Cookie", visitCookie(url));
      }
      return res;
    }

    // ── 라우트 테이블 ──
    for (const route of ROUTES) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      return route.handler({ request, ctx, db, params: m.slice(1) });
    }

    return new Response("Not Found", { status: 404 });
  },
};
