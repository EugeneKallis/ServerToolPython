import requests
from bs4 import BeautifulSoup

SKIP_TAGS = {"vr", "vr exclusive", "high-quality vr", "8kvr", "high quality vr"}


def scrape(url: str) -> list[dict]:
    if not url.startswith("http"):
        url = "https://" + url

    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers, timeout=30)
    if res.status_code != 200:
        raise Exception(f"HTTP {res.status_code} from {url}")

    soup = BeautifulSoup(res.text, "html.parser")
    results = []

    for video in soup.select(".video-item"):
        item = {"source": "projectjav", "title": "", "image": "", "page_url": "", "tags": [], "files": []}

        name_a = video.select_one(".name a")
        if not name_a:
            continue
        item["title"] = " ".join(name_a.get_text().split())
        href = name_a.get("href", "")
        item["page_url"] = "https://projectjav.com" + href if href else ""
        if not item["page_url"]:
            continue

        # Image — prefer data-srcset (highest res)
        img = video.select_one(".img-area img")
        if img:
            srcset = img.get("data-srcset", "")
            if srcset:
                last_http = srcset.rfind("http")
                if last_http != -1:
                    candidate = srcset[last_http:]
                    space_idx = candidate.find(" ")
                    item["image"] = candidate[:space_idx].strip() if space_idx > 0 else candidate.strip()
            if not item["image"]:
                item["image"] = img.get("data-src") or img.get("src", "")
        if "/images/nocover.jpeg" in item["image"]:
            continue

        # Tags
        for badge in video.select(".badge-secondary a"):
            t = badge.get_text(strip=True)
            if t:
                item["tags"].append(t)

        # Skip VR
        if any(t.lower() in SKIP_TAGS for t in item["tags"]):
            continue

        # Files table
        for tr in video.select("table tr"):
            magnet_a = tr.select_one("a[href^='magnet:']")
            if not magnet_a:
                continue
            tds = tr.select("td")
            file = {
                "magnet": magnet_a["href"],
                "file_size": tds[1].get_text(strip=True) if len(tds) > 1 else "",
                "seeds": 0,
                "leechers": 0,
            }
            if len(tds) > 2:
                try:
                    file["seeds"] = int(tds[2].get_text().lower().replace("s:", "").strip())
                except ValueError:
                    pass
            if len(tds) > 3:
                try:
                    file["leechers"] = int(tds[3].get_text().lower().replace("l:", "").strip())
                except ValueError:
                    pass
            item["files"].append(file)

        if item["title"] and item["files"]:
            results.append(item)

    return results


def scrape_pages(max_pages: int = 3) -> list[dict]:
    base_url = "https://projectjav.com/tag/big-tits-7/"
    all_results = []
    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f"{base_url}?page={page}"
        try:
            items = scrape(url)
            if not items:
                break
            all_results.extend(items)
        except Exception as e:
            print(f"[projectjav] Error on page {page}: {e}", flush=True)
    return all_results
