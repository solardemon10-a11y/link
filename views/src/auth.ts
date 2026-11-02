// 대시보드 인증 — Basic Auth(비밀번호만 확인, 아이디 무시). fail-closed.
// 브라우저는 한 번 입력하면 기억하고 같은 출처 요청에 자동으로 붙인다.
// 그래서 상태를 바꾸는 요청(POST/PUT/DELETE)은 커스텀 헤더를 요구해 CSRF 를 막는다
// (다른 사이트에서는 이 헤더를 붙인 요청을 CORS 없이 보낼 수 없다).

import type { Env } from "./env";

export const CSRF_HEADER = "X-Requested-With";
export const CSRF_VALUE = "views-dashboard";

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** 길이 노출 없는 상수 시간 비교 (둘 다 SHA-256 으로 고정 길이화) */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function parseBasicPassword(header: string): string | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const i = decoded.indexOf(":");
    return i >= 0 ? decoded.slice(i + 1) : decoded;
  } catch {
    return null;
  }
}

/** 통과면 null, 아니면 그대로 반환할 Response */
export async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  if (env.ALLOW_INSECURE_ADMIN === "true") return null;

  if (!env.ADMIN_PASSWORD) {
    return new Response("ADMIN_PASSWORD 가 설정되지 않았습니다.", { status: 500 });
  }

  const pw = parseBasicPassword(request.headers.get("Authorization") ?? "");
  if (pw !== null && (await safeEqual(pw, env.ADMIN_PASSWORD))) return null;

  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="views", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

/** 상태 변경 요청이면 CSRF 헤더 확인. 통과면 null */
export function requireCsrfHeader(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (request.headers.get(CSRF_HEADER) === CSRF_VALUE) return null;
  return new Response("Forbidden", { status: 403 });
}
