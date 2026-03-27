import requests
from bs4 import BeautifulSoup


def scrape(url: str) -> list[dict]:
    if not url.startswith("http"):
        url = "https://" + url

    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers, timeout=30)
    if res.status_code != 200:
        raise Exception(f"HTTP {res.status_code} from {url}")

    soup = BeautifulSoup(res.text, "html.parser")
    results = []

    for card in soup.select(".card.mb-3"):
        item = {"source": "141jav", "title": "", "image": "", "magnet": "", "torrent": "", "tags": [], "images": []}

        title_el = card.select_one("h5.title a")
        if title_el:
            item["title"] = title_el.get_text(strip=True)

        img = card.select_one("img.image")
        if img:
            item["image"] = img.get("src") or img.get("data-src", "")

        for a in card.select("a[href^='magnet:']"):
            item["magnet"] = a["href"]
            break

        for a in card.select("a[href$='.torrent']"):
            href = a["href"]
            if not href.startswith("http"):
                href = "https://www.141jav.com" + href
            item["torrent"] = href
            break

        for tag in card.select(".tag"):
            t = tag.get_text(strip=True)
            if t:
                item["tags"].append(t)

        if item["title"] or item["magnet"]:
            results.append(item)

    return results


def scrape_pages(max_pages: int = 3) -> list[dict]:
    base_url = "https://www.141jav.com/tag/Big%20Tits"
    all_results = []
    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f"{base_url}?page={page}"
        try:
            items = scrape(url)
            if not items:
                break
            all_results.extend(items)
        except Exception as e:
            print(f"[141jav] Error on page {page}: {e}", flush=True)
    return all_results
