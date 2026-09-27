"""Build _data/faq/<page>.yml from the Wix FAQ app export (scripts/wix_faq_export.json).

The Wix FAQ app stores answers as Draft.js JSON. This converts them to HTML, downloads their
images, and groups the questions by book chapter.
"""
import html
import json
import os
import re
import ssl
import urllib.request

import certifi
import yaml

REPO: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_DIR: str = os.path.join(REPO, "assets", "images", "faq")
SSL_CONTEXT: ssl.SSLContext = ssl.create_default_context(cafile=certifi.where())

# Wix FAQ category id prefix -> FAQ page. Categories were named after old course weeks.
CATEGORY_PAGE: dict[str, str] = {
    "16d76486": "faq-chapter-1", "16d37948": "faq-chapter-1",
    "16d495ff": "faq-chapter-2", "16d2d02c": "faq-chapter-2",
    "16f58635": "faq-chapter-3", "16fba427": "faq-chapter-3",
    "16fb8ad1": "faq-chapter-4", "16ef192d": "faq-chapter-4",
    "16f7815e": "faq-chapter-5", "16f68875": "faq-chapter-5", "16f9ff14": "faq-chapter-5",
    "16fea96a": "faq-chapter-6", "16fd73b1": "faq-chapter-6",
    "16fe5b82": "faq-chapter-7", "16fa8fb5": "faq-chapter-7", "16f1ea36": "faq-chapter-7",
    "16fde06b": "faq-chapter-8", "16fafe8f": "faq-chapter-8",
    "16f4f0c5": "faq-chapter-9", "f58b0a4a": "faq-chapter-9", "87d221ad": "faq-chapter-9",
    "572ce371": "faq-chapter-9", "16f41949": "faq-chapter-9",
    "11111111-1112": "faq-chapter-10",
    "11111111-1111": "faq-chapter-11",
    "1710f1a4": "faq-application-challenges", "1707fc64": "faq-application-challenges",
    "17122192": "faq-application-challenges",
}
STYLE_TAGS: dict[str, str] = {"BOLD": "strong", "ITALIC": "em", "UNDERLINE": "u", "CODE": "code"}


def page_for(category_id: str) -> str:
    """Return the FAQ page a Wix category belongs to, or an empty string to drop it."""
    for prefix in CATEGORY_PAGE:
        if category_id.startswith(prefix):
            return CATEGORY_PAGE[prefix]
    return ""


def download(url: str) -> str:
    """Save a Wix media image locally and return its site path."""
    name: str = re.sub(r"[^A-Za-z0-9.]+", "_", url.rsplit("/", 1)[-1])
    os.makedirs(IMAGE_DIR, exist_ok=True)
    path: str = os.path.join(IMAGE_DIR, name)
    if not os.path.exists(path):
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with open(path, "wb") as handle:
            handle.write(urllib.request.urlopen(request, context=SSL_CONTEXT, timeout=60).read())
    return "/assets/images/faq/" + name


def render_inline(block: dict, entity_map: dict) -> str:
    """Render one Draft.js block's text with its inline styles and links."""
    text: str = block.get("text", "")
    opens: dict[int, list[str]] = {}
    closes: dict[int, list[str]] = {}
    for style in block.get("inlineStyleRanges", []):
        tag: str = STYLE_TAGS.get(style.get("style", ""), "")
        if tag:
            start: int = style["offset"]
            end: int = style["offset"] + style["length"]
            opens.setdefault(start, []).append("<" + tag + ">")
            closes.setdefault(end, []).insert(0, "</" + tag + ">")
    for entity_range in block.get("entityRanges", []):
        entity: dict = entity_map.get(str(entity_range["key"]), {})
        url: str = entity.get("data", {}).get("url", "")
        if entity.get("type") == "LINK" and url:
            start = entity_range["offset"]
            end = entity_range["offset"] + entity_range["length"]
            anchor: str = '<a href="' + html.escape(url, quote=True) + '"'
            if url.startswith("http"):
                anchor = anchor + ' target="_blank" rel="noopener"'
            opens.setdefault(start, []).append(anchor + ">")
            closes.setdefault(end, []).insert(0, "</a>")
    pieces: list[str] = []
    for position in range(len(text) + 1):
        for tag in closes.get(position, []):
            pieces.append(tag)
        for tag in opens.get(position, []):
            pieces.append(tag)
        if position < len(text):
            pieces.append(html.escape(text[position], quote=False))
    return "".join(pieces).replace("\n", "<br>")


def draft_to_html(raw: str) -> str:
    """Convert a Draft.js document (as a JSON string) to HTML."""
    doc: dict = json.loads(raw)
    entity_map: dict = doc.get("entityMap", {})
    parts: list[str] = []
    list_tag: str = ""
    for block in doc.get("blocks", []):
        kind: str = block.get("type", "unstyled")
        wanted_list: str = ""
        if kind == "unordered-list-item":
            wanted_list = "ul"
        if kind == "ordered-list-item":
            wanted_list = "ol"
        if wanted_list != list_tag:
            if list_tag:
                parts.append("</" + list_tag + ">")
            if wanted_list:
                parts.append("<" + wanted_list + ">")
            list_tag = wanted_list
        body: str = render_inline(block, entity_map)
        if kind == "atomic":
            for entity_range in block.get("entityRanges", []):
                entity: dict = entity_map.get(str(entity_range["key"]), {})
                source: dict = entity.get("data", {}).get("src", {})
                url: str = ""
                if isinstance(source, dict):
                    url = source.get("url", "")
                    if not url and source.get("file_name"):
                        url = "https://static.wixstatic.com/media/" + source["file_name"]
                if url:
                    parts.append('<p class="figure"><img src="' + download(url) + '" alt="Figure" loading="lazy"></p>')
        elif wanted_list:
            parts.append("<li>" + body + "</li>")
        elif kind == "code-block":
            parts.append("<pre><code>" + body + "</code></pre>")
        elif kind.startswith("header-"):
            parts.append("<h3>" + body + "</h3>")
        elif body.strip():
            parts.append("<p>" + body + "</p>")
    if list_tag:
        parts.append("</" + list_tag + ">")
    return "\n".join(parts)


def sort_key(entry: dict) -> float:
    """Order FAQ entries the way the Wix widget did."""
    return entry.get("sortOrder", 0)


def main() -> None:
    """Group every FAQ entry by page and write one YAML file per page."""
    with open(os.path.join(REPO, "scripts", "wix_faq_export.json")) as handle:
        export: dict = json.load(handle)
    pages: dict[str, list[dict]] = {}
    seen: dict[str, list[str]] = {}
    ordered: list[dict] = sorted(export["entries"], key=sort_key)
    for entry in ordered:
        page: str = page_for(entry["categoryId"])
        question: str = entry["question"].strip().rstrip('"').strip()
        raw: str = entry.get("draftjs", "")
        if page and raw:
            if question not in seen.setdefault(page, []):
                seen[page].append(question)
                pages.setdefault(page, []).append({"q": question, "a": draft_to_html(raw)})
    out_dir: str = os.path.join(REPO, "_data", "faq")
    os.makedirs(out_dir, exist_ok=True)
    for page in sorted(pages):
        with open(os.path.join(out_dir, page + ".yml"), "w", encoding="utf-8") as handle:
            yaml.safe_dump(pages[page], handle, sort_keys=False, allow_unicode=True, width=1000)
        print(page, len(pages[page]))


main()
