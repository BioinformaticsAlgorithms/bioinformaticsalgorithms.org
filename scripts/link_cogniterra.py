"""Point every lesson's Cogniterra links at the matching lesson and code-challenge step of course 64.

Reads scripts/cogniterra_course64_ch1-5.json (a crawl of course 64, chapters 1 to 5) and rewrites
_lessons/ in place. Safe to run more than once.
"""
import glob
import json
import os
import re

import yaml

REPO: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UTM: str = "utm_source=bioinformaticsalgorithms.org&utm_medium=lesson&utm_campaign=%s"
MANUAL: dict[str, int] = {"gibbs-sampling-in-action": 29874, "scoring-matrices": 29937}


def normalize(title: str) -> str:
    """Reduce a lesson title to letters and digits so site and Cogniterra titles compare equal."""
    text: str = title.lower().replace("epilogue:", "").replace("königsberg", "konigsberg")
    text = text.replace(". . .", "...").replace("a thousand", "1000")
    return re.sub(r"[^a-z0-9]+", "", text)


def split_front_matter(text: str) -> tuple[dict, str]:
    """Return the YAML front matter and the body of a lesson file."""
    parts: list[str] = text.split("---\n", 2)
    return yaml.safe_load(parts[1]), parts[2]


def rewrite_lesson(path: str, cog_lesson: dict) -> str:
    """Rewrite one lesson file; return a one-line report."""
    with open(path, encoding="utf-8") as handle:
        front, body = split_front_matter(handle.read())
    slug: str = front["slug"]
    lesson_id: int = cog_lesson["lesson"]
    lesson_url: str = "https://cogniterra.org/lesson/%d/step/1?%s" % (lesson_id, UTM % slug)
    code_steps: list[int] = []
    for step in cog_lesson["steps"]:
        if step["type"] == "code":
            code_steps.append(step["pos"])
    body = re.sub(r'<span class="cc-actions">.*?</span>', "", body, flags=re.S)
    callouts: list = list(re.finditer(r'<p class="callout callout-challenge">(.*?)</p>', body, re.S))
    step_level: bool = len(callouts) == len(code_steps) and len(code_steps) > 0
    pieces: list[str] = []
    cursor: int = 0
    index: int = 0
    for match in callouts:
        target: str = lesson_url
        if step_level:
            target = "https://cogniterra.org/lesson/%d/step/%d?%s" % (lesson_id, code_steps[index], UTM % slug)
        elif code_steps:
            target = "https://cogniterra.org/lesson/%d/step/%d?%s" % (lesson_id, code_steps[0], UTM % slug)
        inner: str = re.sub(r'href="https://cogniterra\.org/[^"]*"', 'href="' + target + '"', match.group(1))
        button: str = '<span class="cc-actions"><a class="btn btn-small btn-solve" href="' + target + '" target="_blank" rel="noopener">Solve it with the autograder</a><span class="cc-note">Free to start in the interactive text</span></span>'
        pieces.append(body[cursor:match.start()])
        pieces.append('<p class="callout callout-challenge">' + inner + button + "</p>")
        cursor = match.end()
        index = index + 1
    pieces.append(body[cursor:])
    body = "".join(pieces)
    body = re.sub(r'href="https://cogniterra\.org/course/64"', 'href="' + lesson_url + '"', body)
    front["cogniterra_lesson"] = lesson_id
    front["cogniterra_url"] = lesson_url
    front["code_challenges"] = len(callouts)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("---\n" + yaml.safe_dump(front, sort_keys=False, allow_unicode=True, width=1000) + "---\n" + body)
    return "%s: lesson %d, %d challenges, %s" % (slug, lesson_id, len(callouts), "step links" if step_level else "lesson links")


def main() -> None:
    """Match every site lesson to course 64 and rewrite it."""
    with open(os.path.join(REPO, "scripts", "cogniterra_course64_ch1-5.json")) as handle:
        crawl: list[dict] = json.load(handle)
    by_title: dict[str, dict] = {}
    by_id: dict[int, dict] = {}
    for lesson in crawl:
        by_title[normalize(lesson["title"])] = lesson
        by_id[lesson["lesson"]] = lesson
    for path in sorted(glob.glob(os.path.join(REPO, "_lessons", "ch*", "*.html"))):
        with open(path, encoding="utf-8") as handle:
            front, body = split_front_matter(handle.read())
        match: dict = by_title.get(normalize(front["title"]), {})
        if front["slug"] in MANUAL:
            match = by_id[MANUAL[front["slug"]]]
        if match:
            print(rewrite_lesson(path, match))
        else:
            print("%s: no Cogniterra lesson (links go to the course)" % front["slug"])


main()
