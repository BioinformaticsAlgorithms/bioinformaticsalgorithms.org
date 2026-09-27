"""Convert the lesson HTML that used to live in Wix embed iframes into Jekyll lesson pages.

Usage: python3 scripts/import_lessons.py <folder with ch{N}_{NN}.html files>
Writes _lessons/ch{N}/{NN}-{slug}.html and downloads off-site images into assets/images/lessons/.
"""
import os
import re
import ssl
import sys
import urllib.request

import certifi
import yaml
from bs4 import BeautifulSoup, NavigableString, Tag

CALLOUTS: dict[str, str] = {
    "stop and think": "think",
    "code challenge": "challenge",
    "final challenge": "challenge",
    "exercise break": "exercise",
}
REPO: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_DIR: str = os.path.join(REPO, "assets", "images", "lessons")
SSL_CONTEXT: ssl.SSLContext = ssl.create_default_context(cafile=certifi.where())


def slugify(text: str) -> str:
    """Lowercase text and join its words with hyphens for use as an anchor id."""
    cleaned: str = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return cleaned.strip("-")


def download_image(url: str) -> str:
    """Save an off-site image locally and return its site path."""
    os.makedirs(IMAGE_DIR, exist_ok=True)
    key: str = re.sub(r"[^A-Za-z0-9]+", "_", url.split("//", 1)[1]).strip("_")[-60:]
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    response = urllib.request.urlopen(request, context=SSL_CONTEXT, timeout=60)
    content_type: str = response.headers.get("Content-Type", "")
    extension: str = ".png"
    if "jpeg" in content_type or "jpg" in content_type:
        extension = ".jpg"
    filename: str = key + extension
    with open(os.path.join(IMAGE_DIR, filename), "wb") as handle:
        handle.write(response.read())
    return "/assets/images/lessons/" + filename


def alt_from_src(src: str) -> str:
    """Build readable alt text from an image file name like skew_diagram_ecoli.png."""
    base: str = os.path.splitext(os.path.basename(src.rstrip("/")))[0]
    words: str = re.sub(r"[_\-]+", " ", base).strip()
    if len(words) < 3 or re.fullmatch(r"[0-9a-f ]+", words):
        return "Figure"
    return words[0].upper() + words[1:]


def mark_callout(paragraph: Tag) -> None:
    """Give STOP and Think, Code Challenge and Exercise Break paragraphs a callout class."""
    first = paragraph.find(["strong", "b"])
    if first is None:
        return
    label_text: str = first.get_text().strip().rstrip(":").lower()
    if label_text not in CALLOUTS:
        return
    if paragraph.get_text().strip().lower().find(label_text) != 0:
        return
    kind: str = CALLOUTS[label_text]
    paragraph["class"] = ["callout", "callout-" + kind]
    label = BeautifulSoup("", "html.parser").new_tag("span")
    label["class"] = ["callout-label"]
    label.string = first.get_text().strip().rstrip(":")
    first.replace_with(label)


def clean_lesson(raw_html: str, image_cache: dict[str, str]) -> str:
    """Return the cleaned inner HTML of one lesson."""
    soup = BeautifulSoup(raw_html, "html.parser")
    body = soup.body
    if body is None:
        body = soup
    for junk in body.find_all(["style", "link", "script", "meta", "title"]):
        junk.decompose()
    for center in body.find_all("center"):
        center.name = "span"
        center["class"] = ["center"]
    for font in body.find_all("font"):
        font.unwrap()
    used_ids: dict[str, int] = {}
    for heading in body.find_all(["h2", "h3"]):
        if "style" in heading.attrs:
            del heading["style"]
        anchor: str = slugify(heading.get_text())
        if anchor in used_ids:
            used_ids[anchor] = used_ids[anchor] + 1
            anchor = anchor + "-" + str(used_ids[anchor])
        else:
            used_ids[anchor] = 1
        heading["id"] = anchor
    for paragraph in body.find_all("p"):
        mark_callout(paragraph)
    for link in body.find_all("a"):
        href: str = link.get("href", "")
        if href.startswith("http://rosalind.info"):
            href = "https://rosalind.info" + href[len("http://rosalind.info"):]
        if href.startswith("http://bioinformaticsalgorithms.com"):
            href = "https://bioinformaticsalgorithms.com" + href[len("http://bioinformaticsalgorithms.com"):]
        if re.fullmatch(r"https?://(www\.)?bioinformaticsalgorithms\.org/?", href):
            href = "/"
        if "mybookorders.com" in href:
            href = "/shop"
        link["href"] = href
        if href.startswith("http"):
            link["target"] = "_blank"
            link["rel"] = "noopener"
        elif "target" in link.attrs:
            del link["target"]
    for image in body.find_all("img"):
        src: str = image.get("src", "")
        if src.startswith("http://"):
            src = "https://" + src[len("http://"):]
        if "ucarecdn.com" in src or "wixstatic.com" in src:
            if src not in image_cache:
                image_cache[src] = download_image(src)
            src = image_cache[src]
        image["src"] = src
        if not image.get("alt"):
            image["alt"] = alt_from_src(src)
        image["loading"] = "lazy"
        image["decoding"] = "async"
    inner: str = body.decode_contents()
    inner = inner.replace('="/', '="{{ site.baseurl }}/')
    inner = re.sub(r"\n{3,}", "\n\n", inner)
    return inner.strip() + "\n"


def summary(html_fragment: str) -> str:
    """First sentences of a lesson, cut to about 155 characters, for the meta description."""
    soup = BeautifulSoup(html_fragment, "html.parser")
    text: str = ""
    for paragraph in soup.find_all("p"):
        if len(text) < 155 and "callout" not in paragraph.get("class", []):
            text = (text + " " + paragraph.get_text(" ")).strip()
    text = " ".join(text.split())
    if len(text) <= 155:
        return text
    cut: str = text[:152]
    cut = cut[: cut.rfind(" ")]
    return cut.rstrip(",;:") + "..."


def main() -> None:
    """Convert every lesson listed in _data/lessons.yml."""
    source_dir: str = sys.argv[1]
    with open(os.path.join(REPO, "_data", "lessons.yml")) as handle:
        lessons: list[dict] = yaml.safe_load(handle)
    image_cache: dict[str, str] = {}
    order_in_chapter: dict[int, int] = {}
    for lesson in lessons:
        chapter: int = lesson["ch"]
        order_in_chapter[chapter] = order_in_chapter.get(chapter, 0) + 1
        source: str = os.path.join(source_dir, "ch%d_%02d.html" % (chapter, lesson["src"]))
        with open(source, encoding="utf-8") as handle:
            content: str = clean_lesson(handle.read(), image_cache)
        front: dict = {
            "layout": "lesson",
            "title": lesson["title"],
            "seo_title": lesson["seo"],
            "description": summary(content),
            "chapter": chapter,
            "number": lesson["num"],
            "order": order_in_chapter[chapter],
            "slug": lesson["slug"],
            "permalink": "/bioinformatics-chapter-%d/%s/" % (chapter, lesson["slug"]),
        }
        out_dir: str = os.path.join(REPO, "_lessons", "ch%d" % chapter)
        os.makedirs(out_dir, exist_ok=True)
        out_path: str = os.path.join(out_dir, "%02d-%s.html" % (order_in_chapter[chapter], lesson["slug"]))
        with open(out_path, "w", encoding="utf-8") as handle:
            handle.write("---\n")
            handle.write(yaml.safe_dump(front, sort_keys=False, allow_unicode=True, width=1000))
            handle.write("---\n")
            handle.write(content)
        print(out_path, len(content))


main()
