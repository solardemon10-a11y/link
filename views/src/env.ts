export interface Env {
  views_db: D1Database;
  /** 대시보드 접속 비밀번호 (Basic Auth, 아이디는 아무거나) */
  ADMIN_PASSWORD?: string;
  /** YouTube Data API v3 키 (공개 조회수 읽기용, OAuth 불필요) */
  YOUTUBE_API_KEY?: string;
  /** 로컬 개발 전용: "true" 면 인증 우회 */
  ALLOW_INSECURE_ADMIN?: string;
}

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "threads" | "x" | "other";

export const PLATFORMS: Platform[] = ["youtube", "instagram", "tiktok", "facebook", "threads", "x", "other"];

/** API 로 자동 수집하는 플랫폼. 나머지는 수동 입력. */
export const AUTO_PLATFORMS: Platform[] = ["youtube", "instagram", "facebook"];

export interface AccountRow {
  id: number;
  platform: Platform;
  label: string;
  handle: string | null;
  external_id: string | null;
  token: string | null;
  manual_total: number | null;
  created_at: string;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface FetchedVideo {
  external_id: string;
  title: string;
  url: string | null;
  published_at: string | null;
  /** null 이면 조회수를 못 읽은 것 — 기존 값 유지 */
  views: number | null;
  likes: number | null;
  comments: number | null;
}
