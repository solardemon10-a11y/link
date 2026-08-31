// 관리자 인증 — HTTP Basic Auth (비밀번호 1개).
//
// 배포:
//   npx wrangler secret put ADMIN_PASSWORD      (원하는 비밀번호 입력)
//   npx wrangler deploy
//
// 로컬 개발: .dev.vars 에 ADMIN_PASSWORD="..." 를 넣거나
//            ALLOW_INSECURE_ADMIN="true" 로 아예 건너뛴다.
//
// ADMIN_PASSWORD 도 ALLOW_INSECURE_ADMIN 도 없으면 /admin·/api/* 는 500 으로
// 잠긴다(fail-closed). "설정 깜빡하고 배포" 했을 때 무인증으로 열리는 것을 막기 위해서.
//
// 로그인 팝업에서 아이디는 아무거나 입력해도 되고, 비밀번호만 확인한다.

import type { Env } from "./env";

type Guard = { ok: true } | { ok: false; response: Response };

/** 길이·내용 노출을 줄이는 상수 시간 비교 */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function unauthorized(): Response {
  return new Response("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="multilink admin", charset="UTF-8"' },
  });
}

/**
 * /admin, /api/* 요청 앞단에서 호출한다.
 * 통과하면 { ok: true }, 막히면 { ok: false, response }.
 */
export async function requireAdmin(request: Request, env: Env): Promise<Guard> {
  if (env.ALLOW_INSECURE_ADMIN === "true") return { ok: true };

  const password = env.ADMIN_PASSWORD?.trim();
  if (!password) {
    return {
      ok: false,
      response: Response.json(
        {
          error:
            "관리자 인증이 설정되지 않았습니다. `wrangler secret put ADMIN_PASSWORD` 로 비밀번호를 등록하거나, 로컬이면 .dev.vars 에 ADMIN_PASSWORD 를 넣으세요.",
        },
        { status: 500 },
      ),
    };
  }

  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return { ok: false, response: unauthorized() };

  let decoded = "";
  try {
    decoded = atob(m[1]);
  } catch {
    return { ok: false, response: unauthorized() };
  }

  // "id:password" — 앞의 콜론까지가 아이디, 나머지 전부가 비밀번호
  const sep = decoded.indexOf(":");
  const supplied = sep >= 0 ? decoded.slice(sep + 1) : "";

  if (!safeEqual(supplied, password)) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}
