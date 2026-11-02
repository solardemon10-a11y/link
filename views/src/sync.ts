// 플랫폼별 조회수 수집 어댑터. 새 플랫폼은 여기에 함수 하나 추가 + syncAccount 분기.
// 토큰/키는 요청 URL 에 들어가므로, 에러 메시지에서 반드시 지운다(redact).

import type { AccountRow, Env, FetchedVideo } from "./env";

const GRAPH_VERSION = "v23.0"; // Meta Graph API. 폐기되면 올릴 것.
const YT_MAX_PAGES = 4; // 페이지당 50개 → 최신 영상 최대 200개

function redact(msg: string, secrets: Array<string | null | undefined>): string {
  let out = msg;
  for (const s of secrets) if (s) out = out.split(s).join("***");
  return out.slice(0, 300);
}

async function getJson(url: string, secrets: Array<string | null | undefined>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error(redact(`네트워크 오류: ${e instanceof Error ? e.message : String(e)}`, secrets));
  }
  const body: any = await res.json().catch(() => null);
  if (!res.ok) {
    const apiMsg = body?.error?.message ?? res.statusText;
    throw new Error(redact(`HTTP ${res.status}: ${apiMsg}`, secrets));
  }
  return body;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// ---------------------------------------------------------------- YouTube
// 공개 데이터라 API 키만 있으면 된다(채널 주인 OAuth 불필요). 쿼터: 호출당 1유닛 안팎.
export async function fetchYoutube(acc: AccountRow, apiKey: string): Promise<FetchedVideo[]> {
  const ref = (acc.external_id ?? "").trim();
  if (!ref) throw new Error("채널 ID 또는 @핸들이 비어 있습니다.");
  const secrets = [apiKey];

  const ch = new URL("https://www.googleapis.com/youtube/v3/channels");
  ch.searchParams.set("part", "contentDetails");
  ch.searchParams.set(ref.startsWith("@") ? "forHandle" : "id", ref);
  ch.searchParams.set("key", apiKey);
  const chBody = await getJson(ch.toString(), secrets);
  const uploads: string | undefined = chBody?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("채널을 찾지 못했습니다. 채널 ID/핸들을 확인하세요.");

  const out: FetchedVideo[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < YT_MAX_PAGES; page++) {
    const pl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    pl.searchParams.set("part", "contentDetails");
    pl.searchParams.set("maxResults", "50");
    pl.searchParams.set("playlistId", uploads);
    pl.searchParams.set("key", apiKey);
    if (pageToken) pl.searchParams.set("pageToken", pageToken);
    const plBody = await getJson(pl.toString(), secrets);
    const ids: string[] = (plBody.items ?? []).map((i: any) => i?.contentDetails?.videoId).filter(Boolean);

    if (ids.length) {
      const vd = new URL("https://www.googleapis.com/youtube/v3/videos");
      vd.searchParams.set("part", "snippet,statistics");
      vd.searchParams.set("id", ids.join(","));
      vd.searchParams.set("key", apiKey);
      const vdBody = await getJson(vd.toString(), secrets);
      for (const v of vdBody.items ?? []) {
        out.push({
          external_id: v.id,
          title: v.snippet?.title ?? "",
          url: `https://www.youtube.com/watch?v=${v.id}`,
          published_at: v.snippet?.publishedAt ?? null,
          views: num(v.statistics?.viewCount),
          likes: num(v.statistics?.likeCount),
          comments: num(v.statistics?.commentCount),
        });
      }
    }
    pageToken = plBody.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// -------------------------------------------------------------- Instagram
// 비즈니스/크리에이터 계정 + 장기 액세스 토큰 필요. 토큰 종류가 두 가지다:
//  - "Instagram 로그인" 토큰(IGAA...) → graph.instagram.com, 사용자 ID 불필요(`me`)
//  - 페이스북 로그인 토큰(EAA...)     → graph.facebook.com, external_id = IG 사용자 ID 필요
// 영상별 조회수는 media insights 의 `views` 지표(릴스/영상). 읽지 못한 건 views=null(기존값 유지).
export async function fetchInstagram(acc: AccountRow): Promise<FetchedVideo[]> {
  const igId = (acc.external_id ?? "").trim();
  const token = (acc.token ?? "").trim();
  if (!token) throw new Error("액세스 토큰이 필요합니다.");
  const igLogin = token.startsWith("IGAA");
  if (!igLogin && !igId) throw new Error("IG 사용자 ID 가 필요합니다(IGAA 로 시작하는 토큰이면 비워도 됩니다).");
  const secrets = [token];
  const host = igLogin ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const owner = igLogin ? "me" : encodeURIComponent(igId);

  const list = new URL(`${host}/${GRAPH_VERSION}/${owner}/media`);
  list.searchParams.set("fields", "id,caption,permalink,timestamp,like_count,comments_count");
  list.searchParams.set("limit", "25");
  list.searchParams.set("access_token", token);
  const body = await getJson(list.toString(), secrets);

  const media: any[] = body.data ?? [];
  const results = await Promise.all(
    media.map(async (m): Promise<FetchedVideo> => {
      let views: number | null = null;
      try {
        const ins = new URL(`${host}/${GRAPH_VERSION}/${encodeURIComponent(m.id)}/insights`);
        ins.searchParams.set("metric", "views");
        ins.searchParams.set("access_token", token);
        const insBody = await getJson(ins.toString(), secrets);
        views = num(insBody?.data?.[0]?.values?.[0]?.value);
      } catch {
        // 사진 등 views 미지원 미디어는 건너뜀
      }
      return {
        external_id: String(m.id),
        title: String(m.caption ?? "").split("\n")[0].slice(0, 120),
        url: m.permalink ?? null,
        published_at: m.timestamp ?? null,
        views,
        likes: num(m.like_count),
        comments: num(m.comments_count),
      };
    }),
  );
  return results;
}

// ---------------------------------------------------------- Instagram 진단
// 조회수가 앱과 다를 때 원인을 찾기 위한 도구: 최근 영상 몇 개에 대해 여러 지표를 하나씩 호출해
// 각각의 값(또는 오류)을 그대로 돌려준다. 토큰은 응답/오류 어디에도 포함하지 않는다.
export async function diagnoseInstagram(acc: AccountRow): Promise<unknown> {
  const igId = (acc.external_id ?? "").trim();
  const token = (acc.token ?? "").trim();
  if (!token) throw new Error("액세스 토큰이 필요합니다.");
  const igLogin = token.startsWith("IGAA");
  if (!igLogin && !igId) throw new Error("IG 사용자 ID 가 필요합니다.");
  const secrets = [token];
  const host = igLogin ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const owner = igLogin ? "me" : encodeURIComponent(igId);

  const list = new URL(`${host}/${GRAPH_VERSION}/${owner}/media`);
  list.searchParams.set("fields", "id,permalink,timestamp,media_type,media_product_type,like_count,comments_count");
  list.searchParams.set("limit", "4");
  list.searchParams.set("access_token", token);
  const body = await getJson(list.toString(), secrets);

  const metrics = ["views", "plays", "reach", "ig_reels_aggregated_all_plays_count", "total_interactions"];
  const items = await Promise.all(
    (body.data ?? []).map(async (m: any) => {
      const result: Record<string, unknown> = {};
      for (const metric of metrics) {
        try {
          const u = new URL(`${host}/${GRAPH_VERSION}/${encodeURIComponent(m.id)}/insights`);
          u.searchParams.set("metric", metric);
          u.searchParams.set("access_token", token);
          const r = await getJson(u.toString(), secrets);
          const d = r?.data?.[0];
          result[metric] = d?.values?.[0]?.value ?? d?.total_value?.value ?? d ?? null;
        } catch (e) {
          result[metric] = "오류: " + (e instanceof Error ? e.message : String(e));
        }
      }
      return {
        올린날: m.timestamp, 종류: m.media_product_type + "/" + m.media_type, 링크: m.permalink,
        좋아요: m.like_count, 댓글: m.comments_count, 지표별_값: result,
      };
    }),
  );
  return { token종류: igLogin ? "IGAA(Instagram 로그인)" : "EAA(페이스북 로그인)", api버전: GRAPH_VERSION, 영상: items };
}

// --------------------------------------------------------------- Facebook
// 페이스북 "페이지"의 영상·릴스 조회수. 페이지 액세스 토큰(EAA)이 필요하고,
// external_id = 페이지 ID(페이지 토큰이면 비워도 `me` 로 조회). 개인 프로필 영상은 읽을 수 없다.
export async function fetchFacebook(acc: AccountRow): Promise<FetchedVideo[]> {
  const pageId = (acc.external_id ?? "").trim();
  const token = (acc.token ?? "").trim();
  if (!token) throw new Error("페이지 액세스 토큰이 필요합니다.");
  const secrets = [token];
  const owner = pageId ? encodeURIComponent(pageId) : "me";
  const build = (edge: string, fields: string): string => {
    const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${owner}/${edge}`);
    u.searchParams.set("fields", fields);
    u.searchParams.set("limit", "25");
    u.searchParams.set("access_token", token);
    return u.toString();
  };
  const toVideo = (v: any): FetchedVideo => {
    const link = v.permalink_url ? String(v.permalink_url) : null;
    return {
      external_id: String(v.id),
      title: String(v.title ?? v.description ?? "").split("\n")[0].slice(0, 120),
      url: link ? (link.startsWith("http") ? link : "https://www.facebook.com" + link) : null,
      published_at: v.created_time ?? null,
      views: num(v.views),
      likes: null,
      comments: null,
    };
  };

  const out = new Map<string, FetchedVideo>();
  const videos = await getJson(build("videos", "id,title,description,created_time,permalink_url,views"), secrets);
  for (const v of videos.data ?? []) out.set(String(v.id), toVideo(v));
  try {
    const reels = await getJson(build("video_reels", "id,description,created_time,permalink_url,views"), secrets);
    for (const v of reels.data ?? []) out.set(String(v.id), toVideo(v));
  } catch {
    // 릴스 목록을 못 읽어도 일반 영상은 보여준다
  }
  const list = [...out.values()];
  if (list.length > 0 && list.every((v) => v.views === null)) {
    throw new Error("영상은 찾았지만 조회수(views)를 읽지 못했습니다. '진단' 버튼 결과를 확인하세요.");
  }
  return list;
}

/** 조회수가 이상할 때: 영상 몇 개에 대해 여러 지표를 하나씩 호출해 값/오류를 그대로 돌려준다(토큰 제외). */
export async function diagnoseFacebook(acc: AccountRow): Promise<unknown> {
  const pageId = (acc.external_id ?? "").trim();
  const token = (acc.token ?? "").trim();
  if (!token) throw new Error("페이지 액세스 토큰이 필요합니다.");
  const secrets = [token];
  const owner = pageId ? encodeURIComponent(pageId) : "me";
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;
  const tryGet = async (url: URL): Promise<unknown> => {
    try {
      return await getJson(url.toString(), secrets);
    } catch (e) {
      return "오류: " + (e instanceof Error ? e.message : String(e));
    }
  };
  const listUrl = (edge: string): URL => {
    const u = new URL(`${base}/${owner}/${edge}`);
    u.searchParams.set("fields", "id,created_time,permalink_url,views");
    u.searchParams.set("limit", "3");
    u.searchParams.set("access_token", token);
    return u;
  };
  const metrics = ["total_video_views", "post_video_views", "blue_reels_play_count", "fb_reels_total_plays"];
  const describe = async (edge: string) => {
    const res: any = await tryGet(listUrl(edge));
    if (typeof res === "string") return res;
    return Promise.all(
      (res.data ?? []).map(async (v: any) => {
        const m: Record<string, unknown> = {};
        for (const metric of metrics) {
          const u = new URL(`${base}/${encodeURIComponent(v.id)}/video_insights`);
          u.searchParams.set("metric", metric);
          u.searchParams.set("access_token", token);
          const r: any = await tryGet(u);
          m[metric] = typeof r === "string" ? r : (r?.data?.[0]?.values?.[0]?.value ?? r?.data?.[0] ?? null);
        }
        return { 올린날: v.created_time, 링크: v.permalink_url, views필드: v.views ?? null, 지표별_값: m };
      }),
    );
  };
  return { api버전: GRAPH_VERSION, 일반영상: await describe("videos"), 릴스: await describe("video_reels") };
}

// --------------------------------------------------------------- 공통 진입점
/** 한 계정을 수집해 DB 에 반영. 실패해도 throw 하지 않고 last_error 에 기록. */
export async function syncAccount(env: Env, acc: AccountRow): Promise<{ ok: boolean; count: number; error?: string }> {
  const db = env.views_db;
  await db.prepare("UPDATE accounts SET last_attempt_at = datetime('now') WHERE id = ?").bind(acc.id).run();
  try {
    let fetched: FetchedVideo[];
    if (acc.platform === "youtube") {
      if (!env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY secret 이 등록되지 않았습니다.");
      fetched = await fetchYoutube(acc, env.YOUTUBE_API_KEY);
    } else if (acc.platform === "instagram") {
      fetched = await fetchInstagram(acc);
    } else if (acc.platform === "facebook") {
      fetched = await fetchFacebook(acc);
    } else {
      throw new Error("이 플랫폼은 자동 수집을 지원하지 않습니다(수동 입력).");
    }

    const stmts = fetched.map((v) =>
      db
        .prepare(
          `INSERT INTO videos (account_id, external_id, title, url, published_at, views, likes, comments, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6, 0), ?7, ?8, datetime('now'))
           ON CONFLICT(account_id, external_id) DO UPDATE SET
             title = excluded.title, url = excluded.url, published_at = excluded.published_at,
             views = COALESCE(?6, videos.views), likes = excluded.likes, comments = excluded.comments,
             updated_at = datetime('now')`,
        )
        .bind(acc.id, v.external_id, v.title, v.url, v.published_at, v.views, v.likes, v.comments),
    );
    stmts.push(
      db.prepare("UPDATE accounts SET last_synced_at = datetime('now'), last_error = NULL WHERE id = ?").bind(acc.id),
    );
    for (let i = 0; i < stmts.length; i += 90) await db.batch(stmts.slice(i, i + 90));

    await writeSnapshot(db, acc.id);
    return { ok: true, count: fetched.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.prepare("UPDATE accounts SET last_error = ? WHERE id = ?").bind(error.slice(0, 300), acc.id).run();
    return { ok: false, count: 0, error };
  }
}

// 워커 한 번 실행당 외부 호출 한도(무료 50)를 넘지 않도록 계정별 예상 호출 수로 예산을 잡는다.
const SYNC_COST: Record<string, number> = { youtube: 10, instagram: 27, facebook: 4 };
const SYNC_BUDGET = 45;

/** 자동 수집: 가장 오래 시도하지 않은 계정부터, 예산이 허용하는 만큼만. 나머지는 다음 시간에 처리된다. */
export async function syncAll(env: Env): Promise<void> {
  const { results } = await env.views_db
    .prepare(
      `SELECT * FROM accounts WHERE platform IN ('youtube','instagram','facebook')
       ORDER BY (last_attempt_at IS NOT NULL), last_attempt_at ASC, id ASC`,
    )
    .all<AccountRow>();
  let budget = SYNC_BUDGET;
  for (const acc of results) {
    const cost = SYNC_COST[acc.platform] ?? 5;
    if (cost > budget) continue;
    budget -= cost;
    await syncAccount(env, acc); // 순차 실행
  }
}

// ----------------------------------------------------------------- 스냅샷
export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 계정의 현재 총 조회수(자동: 영상 합 / 수동: 직접 입력값 우선)를 오늘자로 기록 */
export async function writeSnapshot(db: D1Database, accountId: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO account_snapshots (account_id, day, views)
       SELECT a.id, ?2,
         CASE WHEN a.platform IN ('youtube','instagram','facebook') THEN COALESCE((SELECT SUM(views) FROM videos WHERE account_id = a.id), 0)
              ELSE COALESCE(a.manual_total, (SELECT SUM(views) FROM videos WHERE account_id = a.id), 0) END
       FROM accounts a WHERE a.id = ?1
       ON CONFLICT(account_id, day) DO UPDATE SET views = excluded.views`,
    )
    .bind(accountId, todayKst())
    .run();
}
