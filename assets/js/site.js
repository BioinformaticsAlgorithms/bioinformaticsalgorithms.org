/* Site behavior: theme, menu, search, reading progress, lessons read, lecture embeds. No dependencies. */
(function () {
  "use strict";
  var root = document.documentElement;
  var base = (document.querySelector('meta[name="ba-base"]') || {}).content || "";

  function store(key, value) {
    try {
      if (value === undefined) { return localStorage.getItem(key); }
      localStorage.setItem(key, value);
    } catch (error) { return null; }
    return null;
  }

  function readList() {
    var raw = store("ba-read");
    try { return raw ? JSON.parse(raw) : []; } catch (error) { return []; }
  }

  function markRead(path) {
    var list = readList();
    if (list.indexOf(path) === -1) {
      list.push(path);
      store("ba-read", JSON.stringify(list));
    }
  }

  /* Theme */
  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set) { return set; }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-theme-toggle]");
    if (toggle) {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("ba-theme", next);
    }
    var menu = event.target.closest("[data-menu-toggle]");
    if (menu) {
      var nav = document.getElementById("site-nav");
      var open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (event.target.closest("[data-search-open]")) { openSearch(); }
    if (event.target.closest("[data-search-close]") || event.target.id === "search-panel") { closeSearch(); }
  });

  /* Search */
  var index = null;
  var panel = document.getElementById("search-panel");
  var input = document.getElementById("search-input");
  var results = document.getElementById("search-results");

  function openSearch() {
    if (!panel) { return; }
    panel.hidden = false;
    input.focus();
    if (!index) {
      fetch(base + "/search.json").then(function (response) { return response.json(); }).then(function (data) {
        index = data;
        runSearch();
      });
    }
  }

  function closeSearch() {
    if (panel) { panel.hidden = true; }
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var at = lower.indexOf(terms[0]);
    var start = Math.max(0, at - 70);
    var piece = (start > 0 ? "..." : "") + text.slice(start, start + 200) + "...";
    var html = escapeHtml(piece);
    terms.forEach(function (term) {
      if (term.length > 1) {
        html = html.replace(new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
      }
    });
    return html;
  }

  function score(entry, terms) {
    var title = entry.title.toLowerCase();
    var body = entry.text.toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var inTitle = title.indexOf(term) !== -1;
      var inBody = body.indexOf(term) !== -1;
      if (!inTitle && !inBody) { return 0; }
      total += inTitle ? 10 : 0;
      total += inBody ? 1 + Math.min(5, body.split(term).length - 1) * 0.3 : 0;
    }
    return total + (entry.kind === "Lesson" ? 1 : 0);
  }

  function runSearch() {
    if (!index || !input) { return; }
    var query = input.value.trim().toLowerCase();
    results.innerHTML = "";
    if (query.length < 2) { return; }
    var terms = query.split(/\s+/);
    var ranked = [];
    index.forEach(function (entry) {
      var s = score(entry, terms);
      if (s > 0) { ranked.push({ entry: entry, s: s }); }
    });
    ranked.sort(function (a, b) { return b.s - a.s; });
    ranked.slice(0, 20).forEach(function (hit) {
      var li = document.createElement("li");
      li.innerHTML = '<a href="' + hit.entry.url + '"><span class="sr-kind">' + hit.entry.kind + '</span><span class="sr-title">' + escapeHtml(hit.entry.title) + '</span><span class="sr-snip">' + snippet(hit.entry.text, terms) + "</span></a>";
      results.appendChild(li);
    });
    if (!ranked.length) {
      results.innerHTML = '<li><a href="' + base + '/read-the-book">No matches. Browse the free chapters instead.</a></li>';
    }
  }
  if (input) { input.addEventListener("input", runSearch); }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { closeSearch(); }
    if (event.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      event.preventDefault();
      openSearch();
    }
  });

  /* On phones the chapter contents start closed so the lesson comes first */
  if (window.matchMedia && window.matchMedia("(max-width: 960px)").matches) {
    document.querySelectorAll("details[data-toc]").forEach(function (box) { box.open = false; });
  }

  /* Open an FAQ answer when the page is reached through its #qN link */
  if (location.hash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target && target.tagName === "DETAILS") { target.open = true; }
  }

  /* Lecture videos load only when opened */
  document.querySelectorAll("details.lecture").forEach(function (box) {
    box.addEventListener("toggle", function () {
      var slot = box.querySelector(".embed");
      if (box.open && slot && !slot.querySelector("iframe")) {
        var frame = document.createElement("iframe");
        frame.src = "https://www.youtube-nocookie.com/embed/" + box.getAttribute("data-video") + "?autoplay=1&rel=0";
        frame.title = box.getAttribute("data-title") || "Lecture video";
        frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
        frame.allowFullscreen = true;
        slot.appendChild(frame);
        if (window.gtag) { window.gtag("event", "lecture_open", { video_id: box.getAttribute("data-video") }); }
      }
    });
  });

  /* Copy buttons on pseudocode, anchor links on section headings */
  document.querySelectorAll(".prose pre").forEach(function (block) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.textContent = "Copy";
    button.addEventListener("click", function () {
      var text = block.innerText.replace(/\nCopy$/, "").replace(/^Copy\n?/, "");
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1500);
      });
    });
    block.appendChild(button);
  });
  document.querySelectorAll(".prose h2[id], .prose h3[id]").forEach(function (heading) {
    var anchor = document.createElement("a");
    anchor.className = "heading-anchor";
    anchor.href = "#" + heading.id;
    anchor.setAttribute("aria-label", "Link to this section");
    anchor.textContent = "#";
    heading.appendChild(anchor);
  });

  /* Left and right arrow keys move between lessons */
  document.addEventListener("keydown", function (event) {
    var tag = document.activeElement ? document.activeElement.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.metaKey || event.ctrlKey || event.altKey) { return; }
    var link = null;
    if (event.key === "ArrowLeft") { link = document.querySelector(".pager-prev"); }
    if (event.key === "ArrowRight") { link = document.querySelector(".pager-next"); }
    if (link && link.href && link.href.indexOf(location.host) !== -1) { location.href = link.href; }
  });

  /* Reading progress, lessons read, and resume */
  var lesson = document.querySelector("article.lesson");
  var bar = document.querySelector(".read-progress span");
  var path = location.pathname;
  if (lesson) {
    store("ba-last", JSON.stringify({ url: path, title: lesson.getAttribute("data-title") || document.title }));
    var meta = document.querySelector(".lesson-meta");
    if (readList().indexOf(path) !== -1 && meta) { meta.classList.add("is-done"); }
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(function () {
        var rect = lesson.getBoundingClientRect();
        var total = rect.height - window.innerHeight;
        var done = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
        if (bar) { bar.style.width = (done * 100).toFixed(1) + "%"; }
        if (done > 0.85) {
          markRead(path);
          if (meta) { meta.classList.add("is-done"); }
        }
        ticking = false;
      });
    }, { passive: true });
  }
  var read = readList();
  document.querySelectorAll("[data-lesson-url]").forEach(function (item) {
    if (read.indexOf(item.getAttribute("data-lesson-url")) !== -1) { item.classList.add("read"); }
  });
  var resume = document.querySelector(".resume");
  var last = null;
  try { last = JSON.parse(store("ba-last") || "null"); } catch (error) { last = null; }
  if (resume && last && last.url && last.url !== path) {
    var link = resume.querySelector("a");
    link.href = last.url;
    link.textContent = last.title;
    resume.classList.add("show");
  }
})();
