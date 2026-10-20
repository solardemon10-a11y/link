#!/usr/bin/env python3
"""네이버 쇼핑 커넥트 블로그 벤치마킹 후보 수집기.

공식 네이버 검색 오픈API(블로그)만 사용한다. 블로그 페이지를 직접 긁지 않는다.
네이버는 남의 글 조회수를 공개하지 않으므로, 여러 키워드 검색에서 얼마나 자주·높게
노출되는지(검색 노출 점수)로 "잘 되는 블로그" 후보를 추린다.

준비:
  1) https://developers.naver.com/apps 에서 애플리케이션 등록 (사용 API: 검색)
  2) 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 설정

실행:
  python3 collect.py                      # 기본 키워드, 결과는 ./out/
  python3 collect.py --pages 5            # 키워드당 500건까지
  python3 collect.py --keywords-file my.txt --out result

출력:
  out/posts.csv     글 단위 (점수순)
  out/bloggers.csv  블로거 단위 (점수순) — 벤치마킹 후보 목록
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

API = "https://openapi.naver.com/v1/search/blog.json"
PAGE_SIZE = 100  # API 최대
MAX_START = 1000  # API 최대

# 대가성 문구는 보통 글 맨 위에 있어서 요약(description)에도 잡힌다.
DEFAULT_KEYWORDS = [
    '"쇼핑 커넥트 활동의 일환"',
    '"쇼핑커넥트 활동의 일환"',
    '"네이버 쇼핑 커넥트" 수수료를 제공받습니다',
    '"쇼핑 커넥트" 판매 발생 시 수수료',
    "쇼핑커넥트 추천템",
    "쇼핑커넥트 내돈내산",
    "쇼핑커넥트 가성비 추천",
    "쇼핑커넥트 쿠팡 비교",
    "쇼핑커넥트 생활용품",
    "쇼핑커넥트 주방용품",
    "쇼핑커넥트 건강식품",
    "쇼핑커넥트 뷰티",
    "쇼핑커넥트 육아용품",
    "쇼핑커넥트 반려동물",
    "쇼핑커넥트 캠핑",
    "쇼핑커넥트 패션",
]

DISCLOSURE_RE = re.compile(r"쇼핑\s*커넥트|브랜드\s*커넥트|수수료를?\s*제공")
TAG_RE = re.compile(r"<[^>]+>")


def clean(text):
    return html.unescape(TAG_RE.sub("", text or "")).strip()


def blog_id_of(item):
    m = re.search(r"blog\.naver\.com/([^/?#]+)", item.get("bloggerlink", ""))
    return m.group(1) if m else ""


def search(query, start, cid, secret, sort="sim"):
    qs = urllib.parse.urlencode(
        {"query": query, "display": PAGE_SIZE, "start": start, "sort": sort}
    )
    req = urllib.request.Request(f"{API}?{qs}")
    req.add_header("X-Naver-Client-Id", cid)
    req.add_header("X-Naver-Client-Secret", secret)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)


def collect(keywords, pages, cid, secret, delay):
    posts = {}  # link -> row
    for kw in keywords:
        for page in range(pages):
            start = page * PAGE_SIZE + 1
            if start > MAX_START:
                break
            try:
                data = search(kw, start, cid, secret)
            except Exception as e:  # 한 키워드 실패가 전체를 막지 않게
                print(f"[경고] {kw} start={start}: {e}", file=sys.stderr)
                break
            items = data.get("items", [])
            if not items:
                break
            for i, it in enumerate(items):
                rank = start + i
                link = it["link"]
                row = posts.setdefault(
                    link,
                    {
                        "title": clean(it["title"]),
                        "link": link,
                        "blogger": it.get("bloggername", ""),
                        "blog_id": blog_id_of(it),
                        "postdate": it.get("postdate", ""),
                        "snippet": clean(it["description"]),
                        "disclosure": False,
                        "score": 0.0,
                        "hits": 0,
                        "best_rank": rank,
                        "keywords": [],
                    },
                )
                row["score"] += 1.0 / rank
                row["hits"] += 1
                row["best_rank"] = min(row["best_rank"], rank)
                if kw not in row["keywords"]:
                    row["keywords"].append(kw)
                if DISCLOSURE_RE.search(row["title"] + " " + row["snippet"]):
                    row["disclosure"] = True
            time.sleep(delay)
        print(f"[완료] {kw} (누적 {len(posts)}건)")
    return list(posts.values())


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def summarize_bloggers(posts):
    agg = defaultdict(
        lambda: {"blogger": "", "blog_id": "", "posts": 0, "disclosure_posts": 0,
                 "score": 0.0, "best_rank": 10**9, "top_post": "", "top_link": "",
                 "_top": -1.0}
    )
    for p in posts:
        key = p["blog_id"] or p["blogger"]
        b = agg[key]
        b["blogger"], b["blog_id"] = p["blogger"], p["blog_id"]
        b["posts"] += 1
        b["disclosure_posts"] += 1 if p["disclosure"] else 0
        b["score"] += p["score"]
        b["best_rank"] = min(b["best_rank"], p["best_rank"])
        if p["score"] > b["_top"]:
            b["_top"], b["top_post"], b["top_link"] = p["score"], p["title"], p["link"]
    rows = list(agg.values())
    rows.sort(key=lambda r: (r["disclosure_posts"] > 0, r["score"]), reverse=True)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pages", type=int, default=3, help="키워드당 페이지 수(1페이지=100건, 최대 10)")
    ap.add_argument("--keywords-file", help="키워드 목록(한 줄에 하나). 없으면 기본 키워드")
    ap.add_argument("--out", default="out")
    ap.add_argument("--delay", type=float, default=0.2, help="요청 간 대기(초)")
    args = ap.parse_args()

    cid = os.environ.get("NAVER_CLIENT_ID")
    secret = os.environ.get("NAVER_CLIENT_SECRET")
    if not cid or not secret:
        sys.exit("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수를 설정하세요.")

    if args.keywords_file:
        with open(args.keywords_file, encoding="utf-8") as f:
            keywords = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    else:
        keywords = DEFAULT_KEYWORDS

    posts = collect(keywords, args.pages, cid, secret, args.delay)
    posts.sort(key=lambda p: (p["disclosure"], p["score"]), reverse=True)
    for p in posts:
        p["keywords"] = " | ".join(p["keywords"])
        p["score"] = round(p["score"], 4)

    os.makedirs(args.out, exist_ok=True)
    write_csv(os.path.join(args.out, "posts.csv"), posts,
              ["title", "link", "blogger", "blog_id", "postdate", "disclosure",
               "score", "hits", "best_rank", "keywords", "snippet"])
    bloggers = summarize_bloggers(posts)
    for b in bloggers:
        b["score"] = round(b["score"], 4)
    write_csv(os.path.join(args.out, "bloggers.csv"), bloggers,
              ["blogger", "blog_id", "disclosure_posts", "posts", "score",
               "best_rank", "top_post", "top_link"])
    print(f"글 {len(posts)}건, 블로거 {len(bloggers)}명 → {args.out}/")


if __name__ == "__main__":
    main()
