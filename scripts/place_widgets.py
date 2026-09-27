"""Place each interactive widget in its lesson, right after an anchor paragraph. Safe to rerun."""
import os
import re

REPO: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (widget id, lesson file, regex). The widget goes right after the match, or right before it
# when the regex starts with "BEFORE:".
PLACEMENTS: list[tuple[str, str, str]] = [
    ("skew", "_lessons/ch1/08-skew-diagram.html", r'<p class="callout callout-challenge">[^\n]*Minimum Skew Problem[^\n]*</p>'),
    ("clumps", "_lessons/ch1/05-clump-finding-problem.html", r'<p class="callout callout-challenge">[^\n]*Clump Finding Problem[^\n]*</p>'),
    ("change", "_lessons/ch5/05-change-problem-dynamic-programming.html", r'BEFORE:<p class="callout callout-challenge"><span class="callout-label">Code Challenge</span> Solve the Change Problem'),
    ("alignment", "_lessons/ch5/08-backtracking-alignment-graph.html", r'BEFORE:<p>The backtracking method can be generalized'),
    ("debruijn", "_lessons/ch3/05-eulerian-path-de-bruijn-graph.html", r'<p[^>]*>[^\n]*we have drawn it differently\.[^\n]*</p>'),
    ("euler", "_lessons/ch3/08-eulerian-cycle-algorithm.html", r'<p>[^\n]*nodes on the current cycle that have unused edges\.[^\n]*</p>'),
    ("profile", "_lessons/ch2/03-scoring-motifs.html", r'<p><span class="center"><img alt="Motifs score count profile consensus motiflogo"[^\n]*</p>'),
    ("gibbs", "_lessons/ch2/10-gibbs-sampling-in-action.html", r'<p>You can see that the algorithm is beginning to converge\.[^\n]*</p>'),
    ("spectrum", "_lessons/ch4/04-mass-spectrometry-theoretical-spectrum.html", r'BEFORE:<p><strong>Generating Theoretical Spectrum Problem:</strong>'),
    ("convolution", "_lessons/ch4/09-spectral-convolution.html", r'BEFORE:<p class="callout callout-challenge"><span class="callout-label">Code Challenge</span> Implement <b>ConvolutionCyclopeptideSequencing</b>'),
]


def place(widget: str, lesson: str, anchor: str) -> str:
    """Insert the widget include after the first match of anchor; return a report line."""
    path: str = os.path.join(REPO, lesson)
    with open(path, encoding="utf-8") as handle:
        text: str = handle.read()
    include: str = "{% include widgets/" + widget + ".html %}"
    if include in text:
        return widget + ": already placed"
    before: bool = anchor.startswith("BEFORE:")
    if before:
        anchor = anchor[len("BEFORE:"):]
    match = re.search(anchor, text)
    if match is None:
        return widget + ": ANCHOR NOT FOUND in " + lesson
    at: int = match.end()
    if before:
        at = match.start()
    text = text[:at] + "\n" + include + "\n" + text[at:]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return widget + ": placed in " + lesson


def main() -> None:
    """Place every widget listed above."""
    for widget, lesson, anchor in PLACEMENTS:
        print(place(widget, lesson, anchor))


main()
