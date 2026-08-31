// 공유 도메인 타입. index.ts / pages/home.ts / pages/admin.ts 가 같이 쓴다.

export type Platform = "coupang" | "naver";

export type SiteSettings = {
  site_name: string;
  greeting: string | null;
  representative_image_url: string | null;
  link_columns: number;
  theme: "light" | "dark";
};

export type Product = {
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

export type AdminProduct = Product & {
  coupang_clicks: number;
  naver_clicks: number;
  total_clicks: number;
  coupang_clicks_today: number;
  naver_clicks_today: number;
};

export type VisitStats = {
  total: number;
  today: number;
};
