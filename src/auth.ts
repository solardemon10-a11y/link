// 관리자 인증 — 로그인 화면 + 세션 쿠키.
//
// 예전에는 브라우저 기본 Basic Auth 팝업 하나였다. 그 방식은 "로그아웃"도
// "비밀번호를 직접 바꾸기"도 만들 수가 없어서(브라우저가 자격증명을
// 쥐고 있고, 서버는 비교만 함) 로그인 화면 + 쿠키 방식으로 바꿨다.
//
// 비밀번호는 D1(site_settings.admin_password_hash)에 해시로 저장한다.
// 이 값이 비어 있으면(아직 한 번도 안 바꿨으면) ADMIN_PASSWORD 시크릿과
// 비교한다 - 그래서 배포 직후에도 `wrangler secret put ADMIN_PASSWORD`로
// 정해둔 비밀번호로 로그인할 수 있다. 관리자 화면에서 "비밀번호 변경"을
// 하면 그 순간부터 DB 해시만 쓴다.
//
// 세션: 로그인 성공 시 "만료시각.서명" 형태의 쿠키를 심는다. 서명은
// SESSION_SECRET으로 만든 HMAC-SHA256이라 서버만 검증할 수 있고, 별도
// 세션 저장소(DB/KV)가 필요 없다(무상태). 로그아웃은 쿠키를 지우면 끝.
//
// 배포:
//   npx wrangler secret put ADMIN_PASSWORD    (최초 비밀번호)
//   npx wrangler secret put SESSION_SECRET    (세션 서명 키, 충분히 긴 무작위 문자열)
//
// 로컬 개발: .dev.vars 에 두 값을 넣거나, ALLOW_INSECURE_ADMIN="true" 로 건너뛴다.

import type { Env } from "./env";

type Guard = { ok: true } | { ok: false; response: Response };

const SESSION_COOKIE = "ml_admin_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일
const PBKDF2_ITERATIONS = 20000; // Workers CPU 시간 제한 안에서 적당히 튼튼하게

// ============================================================
// 상수 시간 비교 / 인코딩 유틸
// ============================================================

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// ============================================================
// 비밀번호 해시 (PBKDF2-SHA256) — 형식: "pbkdf2$반복수$salt(hex)$hash(hex)"
// ============================================================

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufToHex(salt.buffer as ArrayBuffer)}$${bufToHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = hexToBuf(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return safeEqual(bufToHex(bits), parts[3]);
}

// ============================================================
// 세션 쿠키
// ============================================================

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bufToHex(sig);
}

async function createSessionToken(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const sig = await hmac(secret, String(expires));
  return `${expires}.${sig}`;
}

async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const [expiresStr, sig] = token.split(".");
  if (!expiresStr || !sig) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = await hmac(secret, expiresStr);
  return safeEqual(sig, expected);
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function issueSession(env: Env): Promise<string> {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET이 설정되지 않았습니다.");
  return createSessionToken(secret);
}

async function hasValidSession(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  return verifySessionToken(token, env.SESSION_SECRET);
}

// ============================================================
// 비밀번호 검증 (로그인 / 비밀번호 변경 모두 이걸 씀)
// ============================================================

/** DB에 해시가 있으면 그걸로, 없으면 ADMIN_PASSWORD 시크릿으로 검증한다. */
export async function verifyAdminPassword(
  password: string,
  db: D1Database,
  env: Env
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT admin_password_hash FROM site_settings WHERE id = 1`)
    .first<{ admin_password_hash: string | null }>();
  const hash = row?.admin_password_hash;

  if (hash) return verifyPassword(password, hash);

  const fallback = env.ADMIN_PASSWORD?.trim();
  if (!fallback) return false;
  return safeEqual(password, fallback);
}

export async function setAdminPassword(newPassword: string, db: D1Database): Promise<void> {
  const hash = await hashPassword(newPassword);
  await db.prepare(`UPDATE site_settings SET admin_password_hash = ? WHERE id = 1`).bind(hash).run();
}

// ============================================================
// 가드
// ============================================================

function redirectToLogin(): Response {
  return new Response(null, { status: 302, headers: { Location: "/admin/login" } });
}

function jsonUnauthorized(): Response {
  return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
}

/**
 * Basic Auth 헤더("Authorization: Basic base64(id:비밀번호)")도 계속
 * 받아준다 - 관리자 화면(사람)은 이제 세션 쿠키를 쓰지만, 다른 프로그램이
 * 서버-투-서버로 이 API를 호출할 때는 로그인 화면/쿠키가 없으니 예전처럼
 * 비밀번호만 보내는 방식이 필요하다(예: 쇼츠 제작 대시보드가 상품을
 * 자동 등록할 때). 비밀번호는 verifyAdminPassword로 확인하므로, DB에서
 * 비밀번호를 바꿔도(화면의 "비밀번호 변경") 그 즉시 이 방식도 새
 * 비밀번호로 맞춰 동작한다 - 둘이 따로 노는 비밀번호가 아니다.
 */
async function checkBasicAuth(request: Request, db: D1Database, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;

  let decoded = "";
  try {
    decoded = atob(m[1]);
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  const supplied = sep >= 0 ? decoded.slice(sep + 1) : "";
  if (!supplied) return false;
  return verifyAdminPassword(supplied, db, env);
}

/**
 * /admin, /api/* 요청 앞단에서 호출한다.
 * 통과하면 { ok: true }, 막히면 { ok: false, response }.
 * page=true면(HTML 페이지 요청) 로그인 화면으로 리다이렉트, 아니면
 * (fetch로 오는 /api/* 요청) 401 JSON을 준다 - 관리자 화면 JS가 이걸
 * 보고 로그인 화면으로 보낸다.
 */
export async function requireAdmin(request: Request, db: D1Database, env: Env, page: boolean): Promise<Guard> {
  if (env.ALLOW_INSECURE_ADMIN === "true") return { ok: true };

  if (await hasValidSession(request, env)) return { ok: true };
  if (await checkBasicAuth(request, db, env)) return { ok: true };

  return { ok: false, response: page ? redirectToLogin() : jsonUnauthorized() };
}
