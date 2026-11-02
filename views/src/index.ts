import { requireAuth, requireCsrfHeader } from "./auth";
import { AUTO_PLATFORMS, PLATFORMS, type AccountRow, type Env, type Platform } from "./env";
import { renderPage } from "./page";
import { diagnoseInstagram, syncAccount, syncAll, todayKst, writeSnapshot } from "./sync";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const bad = (msg: string, status = 400): Response => json({ error: msg }, status);

const isAuto = (p: Platform): boolean => AUTO_PLATFORMS.includes(p);

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** 0 이상의 정수로 변환. 빈 값/이상한 값이면 null */
function cleanCount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/[,\s]/g, "") : v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** http(s) 가 아닌 URL(javascript: 등)은 저장하지 않는다 */
function cleanUrl(v: unknown): string | null {
  const s = cleanStr(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function getAccount(env: Env, id: number): Promise<AccountRow | null> {
  return env.views_db.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
}

// ------------------------------------------------------------------ 요약
async function handleSummary(env: Env): Promise<Response> {
  const db = env.views_db;
  const today = todayKst();
  const weekAgo = new Date(Date.parse(today) - 7 * 86400_000).toISOString().slice(0, 10);

  const [accRes, vidRes, snapRes] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.platform, a.label, a.handle, a.external_id, a.manual_total, a.last_synced_at, a.last_error,
                (a.token IS NOT NULL AND a.token != '') AS has_token,
                COUNT(v.id) AS video_count, COALESCE(SUM(v.views), 0) AS video_sum
         FROM accounts a LEFT JOIN videos v ON v.account_id = a.id
         GROUP BY a.id ORDER BY a.sort_order, a.id`,
      )
      .all<any>(),
    db
      .prepare(
        `SELECT id, account_id, title, url, published_at, views, likes, comments FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY views DESC) AS rn FROM videos
         ) WHERE rn <= 100 ORDER BY views DESC`,
      )
      .all<any>(),
    db
      .prepare("SELECT account_id, day, views FROM account_snapshots WHERE day >= date(?, '-30 day') ORDER BY day")
      .bind(today)
      .all<{ account_id: number; day: string; views: number }>(),
  ]);

  const snapsByAcc = new Map<number, Array<{ day: string; views: number }>>();
  for (const s of snapRes.results) {
    const list = snapsByAcc.get(s.account_id) ?? [];
    list.push(s);
    snapsByAcc.set(s.account_id, list);
  }

  const accounts = accRes.results.map((a) => {
    const auto = isAuto(a.platform);
    const views: number = auto ? a.video_sum : (a.manual_total ?? a.video_sum);
    const snaps = snapsByAcc.get(a.id) ?? [];
    // 기준점 = 해당 날짜 "이전/이하"의 가장 최근 스냅샷
    const base1 = [...snaps].reverse().find((s) => s.day < today);
    const base7 = [...snaps].reverse().find((s) => s.day <= weekAgo);
    return {
      ...a,
      has_token: !!a.has_token,
      auto,
      views,
      delta_1d: base1 ? views - base1.views : null,
      delta_7d: base7 ? views - base7.views : null,
    };
  });

  return json({ today, accounts, videos: vidRes.results });
}

// ------------------------------------------------------------------ 계정
async function createAccount(request: Request, env: Env): Promise<Response> {
  const b = await readBody(request);
  const platform = b.platform as Platform;
  if (!PLATFORMS.includes(platform)) return bad("지원하지 않는 플랫폼입니다.");
  const label = cleanStr(b.label, 50);
  if (!label) return bad("계정 이름을 입력하세요.");
  const externalId = cleanStr(b.external_id, 200);
  const token = cleanStr(b.token, 2000);
  if (platform === "youtube" && !externalId) return bad("YouTube 는 채널 ID 또는 @핸들이 필요합니다.");
  if (platform === "instagram" && !token) return bad("Instagram 은 액세스 토큰이 필요합니다.");
  if (platform === "instagram" && !token!.startsWith("IGAA") && !externalId) return bad("EAA 토큰은 IG 사용자 ID 도 필요합니다(IGAA 토큰은 비워도 됨).");

  const res = await env.views_db
    .prepare("INSERT INTO accounts (platform, label, handle, external_id, token, manual_total, sort_order) VALUES (?,?,?,?,?,?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts))")
    .bind(platform, label, cleanStr(b.handle, 100), externalId, isAuto(platform) ? token : null, cleanCount(b.manual_total))
    .run();
  const id = res.meta.last_row_id;
  await writeSnapshot(env.views_db, id);
  return json({ id }, 201);
}

async function updateAccount(request: Request, env: Env, id: number): Promise<Response> {
  const acc = await getAccount(env, id);
  if (!acc) return bad("없는 계정입니다.", 404);
  const b = await readBody(request);

  const label = "label" in b ? cleanStr(b.label, 50) : acc.label;
  if (!label) return bad("계정 이름을 입력하세요.");
  const handle = "handle" in b ? cleanStr(b.handle, 100) : acc.handle;
  const externalId = "external_id" in b ? cleanStr(b.external_id, 200) : acc.external_id;
  // 토큰은 새 값이 올 때만 교체(빈 값이면 기존 유지) — 화면에 토큰을 다시 보여주지 않기 때문
  const token = cleanStr(b.token, 2000) ?? acc.token;
  const manualTotal = "manual_total" in b ? cleanCount(b.manual_total) : acc.manual_total;
  if (acc.platform === "youtube" && !externalId) return bad("YouTube 는 채널 ID 또는 @핸들이 필요합니다.");
  if (acc.platform === "instagram" && !token) return bad("Instagram 은 액세스 토큰이 필요합니다.");
  if (acc.platform === "instagram" && !token!.startsWith("IGAA") && !externalId) return bad("EAA 토큰은 IG 사용자 ID 도 필요합니다(IGAA 토큰은 비워도 됨).");

  await env.views_db
    .prepare("UPDATE accounts SET label=?, handle=?, external_id=?, token=?, manual_total=? WHERE id=?")
    .bind(label, handle, externalId, isAuto(acc.platform) ? token : null, isAuto(acc.platform) ? null : manualTotal, id)
    .run();
  await writeSnapshot(env.views_db, id);
  return json({ ok: true });
}

/** 드래그로 바꾼 계정 순서 저장. ids = 화면에 보이는 전체 계정 id 를 새 순서대로 */
async function reorderAccounts(request: Request, env: Env): Promise<Response> {
  const b = await readBody(request);
  const ids = Array.isArray(b.ids) ? b.ids.map(Number) : [];
  if (!ids.length || ids.length > 500 || ids.some((n) => !Number.isInteger(n) || n <= 0) || new Set(ids).size !== ids.length) {
    return bad("잘못된 순서입니다.");
  }
  await env.views_db.batch(
    ids.map((id, i) => env.views_db.prepare("UPDATE accounts SET sort_order = ? WHERE id = ?").bind(i + 1, id)),
  );
  return json({ ok: true });
}

async function deleteAccount(env: Env, id: number): Promise<Response> {
  await env.views_db.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run(); // FK cascade
  return json({ ok: true });
}

async function syncOne(env: Env, id: number): Promise<Response> {
  const acc = await getAccount(env, id);
  if (!acc) return bad("없는 계정입니다.", 404);
  if (!isAuto(acc.platform)) return bad("이 플랫폼은 수동 입력입니다.");
  const r = await syncAccount(env, acc);
  return json(r, r.ok ? 200 : 502);
}

// ------------------------------------------------------------ 수동 영상
async function addManualVideo(request: Request, env: Env, accountId: number): Promise<Response> {
  const acc = await getAccount(env, accountId);
  if (!acc) return bad("없는 계정입니다.", 404);
  if (isAuto(acc.platform)) return bad("자동 수집 계정에는 영상을 직접 추가하지 않습니다.");
  const b = await readBody(request);
  const title = cleanStr(b.title, 200);
  const views = cleanCount(b.views);
  if (!title || views === null) return bad("제목과 조회수(0 이상 숫자)를 입력하세요.");

  await env.views_db
    .prepare("INSERT INTO videos (account_id, external_id, title, url, published_at, views) VALUES (?,?,?,?,?,?)")
    .bind(accountId, `m-${crypto.randomUUID()}`, title, cleanUrl(b.url), cleanStr(b.published_at, 30), views)
    .run();
  await writeSnapshot(env.views_db, accountId);
  return json({ ok: true }, 201);
}

async function updateVideoViews(request: Request, env: Env, id: number): Promise<Response> {
  const row = await env.views_db
    .prepare("SELECT v.account_id, a.platform FROM videos v JOIN accounts a ON a.id = v.account_id WHERE v.id = ?")
    .bind(id)
    .first<{ account_id: number; platform: Platform }>();
  if (!row) return bad("없는 영상입니다.", 404);
  if (isAuto(row.platform)) return bad("자동 수집 영상은 수정할 수 없습니다.");
  const views = cleanCount((await readBody(request)).views);
  if (views === null) return bad("조회수는 0 이상 숫자여야 합니다.");
  await env.views_db.prepare("UPDATE videos SET views=?, updated_at=datetime('now') WHERE id=?").bind(views, id).run();
  await writeSnapshot(env.views_db, row.account_id);
  return json({ ok: true });
}

async function deleteVideo(env: Env, id: number): Promise<Response> {
  const row = await env.views_db.prepare("SELECT account_id FROM videos WHERE id = ?").bind(id).first<{ account_id: number }>();
  if (!row) return bad("없는 영상입니다.", 404);
  await env.views_db.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
  await writeSnapshot(env.views_db, row.account_id);
  return json({ ok: true });
}

// ------------------------------------------------------------------ 라우터
export default {
  // 화면의 "전체 새로고침"은 계정별 /sync 를 순서대로 호출한다(요청 하나가 외부 호출 한도를 다 쓰지 않게).
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await requireAuth(request, env);
    if (denied) return denied;
    const csrf = requireCsrfHeader(request);
    if (csrf) return csrf;

    const { pathname } = new URL(request.url);
    const m = request.method;

    if (m === "GET" && pathname === "/") {
      return new Response(renderPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (m === "GET" && pathname === "/api/summary") return handleSummary(env);
    if (m === "POST" && pathname === "/api/accounts") return createAccount(request, env);
    if (m === "POST" && pathname === "/api/accounts/reorder") return reorderAccounts(request, env);

    let g: RegExpMatchArray | null;
    if ((g = pathname.match(/^\/api\/accounts\/(\d+)$/))) {
      if (m === "PUT") return updateAccount(request, env, Number(g[1]));
      if (m === "DELETE") return deleteAccount(env, Number(g[1]));
    }
    if ((g = pathname.match(/^\/api\/accounts\/(\d+)\/sync$/)) && m === "POST") return syncOne(env, Number(g[1]));
    if ((g = pathname.match(/^\/api\/accounts\/(\d+)\/diagnose$/)) && m === "GET") {
      const acc = await getAccount(env, Number(g[1]));
      if (!acc || acc.platform !== "instagram") return bad("Instagram 계정이 아닙니다.", 404);
      try {
        return json(await diagnoseInstagram(acc));
      } catch (e) {
        return bad(e instanceof Error ? e.message : String(e), 502);
      }
    }
    if ((g = pathname.match(/^\/api\/accounts\/(\d+)\/videos$/)) && m === "POST") return addManualVideo(request, env, Number(g[1]));
    if ((g = pathname.match(/^\/api\/videos\/(\d+)$/))) {
      if (m === "PUT") return updateVideoViews(request, env, Number(g[1]));
      if (m === "DELETE") return deleteVideo(env, Number(g[1]));
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncAll(env));
  },
} satisfies ExportedHandler<Env>;
