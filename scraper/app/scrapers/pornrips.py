import requests
from bs4 import BeautifulSoup

SKIP_TITLES = ["Transfixed", ".TS", "TGirls", "Trans."]


def _scrape_pixhost(url: str) -> str:
    try:
        res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        if res.status_code != 200:
            return ""
        soup = BeautifulSoup(res.text, "html.parser")
        img = soup.select_one("img#image")
        return img["src"] if img and img.get("src") else ""
    except Exception:
        return ""


def _scrape_detail(url: str, item: dict):
    try:
        res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        if res.status_code != 200:
            return
        soup = BeautifulSoup(res.text, "html.parser")

        for a in soup.select(".entry-content a[href*='pixhost.to/show/']"):
            direct = _scrape_pixhost(a["href"])
            if direct and direct not in item["images"]:
                item["images"].append(direct)

        for img in soup.select(".entry-content img"):
            if img.find_parent("a", href=lambda h: h and "pixhost.to/show/" in h):
                continue
            src = img.get("src") or img.get("data-src", "")
            if src and "logo" not in src and "banner" not in src and src not in item["images"]:
                item["images"].append(src)

        for a in soup.select("a"):
            href = a.get("href", "")
            if href.startswith("magnet:"):
                item["magnet"] = href
            elif (".torrent" in href or "/torrents/" in href) and "feed" not in href:
                if not href.startswith("http"):
                    href = "https://pornrips.to/" + href.lstrip("/")
                item["torrent"] = href
                if not item["magnet"] or not item["magnet"].startswith("magnet:"):
                    item["magnet"] = href
    except Exception as e:
        print(f"[pornrips] detail scrape error {url}: {e}", flush=True)


def scrape(url: str) -> list[dict]:
    if not url.startswith("http"):
        url = "https://" + url

    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers, timeout=30)
    if res.status_code != 200:
        raise Exception(f"HTTP {res.status_code} from {url}")

    soup = BeautifulSoup(res.text, "html.parser")
    results = []

    for article in soup.select("article.type-post"):
        item = {"source": "pornrips", "title": "", "image": "", "images": [], "magnet": "", "torrent": "", "tags": []}

        title_a = article.select_one(".entry-title a")
        if not title_a:
            continue
        item["title"] = title_a.get_text(strip=True)
        if any(skip in item["title"] for skip in SKIP_TITLES):
            continue

        detail_url = title_a.get("href", "")

        post_id = article.get("id", "").replace("post-", "")
        if post_id:
            item["torrent"] = f"https://pornrips.to/download.php?id={post_id}&type=torrent"
            item["magnet"] = f"https://pornrips.to/download.php?id={post_id}&type=magnet"

        thumb = article.select_one(".wrapper-excerpt-thumbnail img")
        if thumb:
            item["image"] = thumb.get("data-src") or thumb.get("src", "")

        for tag_a in article.select(".entry-meta-tags a"):
            t = tag_a.get_text(strip=True)
            if t:
                item["tags"].append(t)

        if detail_url:
            _scrape_detail(detail_url, item)

        if item["title"]:
            results.append(item)

    return results


def scrape_pages(max_pages: int = 1) -> list[dict]:
    base_url = "https://pornrips.to/category/1080p/"
    all_results = []
    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f"{base_url}page/{page}/"
        try:
            items = scrape(url)
            if not items:
                break
            all_results.extend(items)
        except Exception as e:
            print(f"[pornrips] Error on page {page}: {e}", flush=True)
    return all_results
