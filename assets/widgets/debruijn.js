/* De Bruijn graph widget (Chapter 3, lessons 3.4 and 3.5).
 * PathGraph_k(Text) or CompositionGraph(Patterns) -> glue identically labeled
 * nodes -> DeBruijn graph -> step an Eulerian path that spells a string.
 * Vanilla ES2019, no dependencies. The algorithm core is pure and exported
 * for tests/widgets/debruijn.test.mjs. */
(function () {
  'use strict';

  var MAX_KMERS = 40;
  var MIN_K = 2;
  var MAX_K = 10;
  var ALLOWED_SYMBOLS = /^[ACGT01]+$/;
  var BOOK_GENOME = 'TAATGCCATGGGATGTT';
  var BOOK_K = 3;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VIEW_WIDTH = 680;
  var VIEW_HEIGHT = 440;
  var VIEW_MARGIN = 44;
  var NODE_HALF_HEIGHT = 14;
  var STEP_INTERVAL_MS = 1000;

  /* ------------------------------------------------------------------ */
  /* Algorithm core (pure functions)                                     */
  /* ------------------------------------------------------------------ */

  function kmerComposition(text, k) {
    var kmers = [];
    for (var i = 0; i + k <= text.length; i++) {
      kmers.push(text.slice(i, i + k));
    }
    return kmers;
  }

  function prefixOf(pattern) {
    return pattern.slice(0, pattern.length - 1);
  }

  function suffixOf(pattern) {
    return pattern.slice(1);
  }

  /* PathGraph_k(Text): node i is the i-th (k-1)-mer, edge i is the i-th k-mer. */
  function pathGraph(text, k) {
    var kmers = kmerComposition(text, k);
    var nodeLabels = [];
    var edges = [];
    for (var i = 0; i < kmers.length; i++) {
      nodeLabels.push(prefixOf(kmers[i]));
      edges.push({ id: i, from: i, to: i + 1, label: kmers[i] });
    }
    if (kmers.length > 0) {
      nodeLabels.push(suffixOf(kmers[kmers.length - 1]));
    }
    return { nodeLabels: nodeLabels, edges: edges };
  }

  /* CompositionGraph(Patterns): one isolated edge per k-mer, prefix -> suffix. */
  function compositionGraph(patterns) {
    var nodeLabels = [];
    var edges = [];
    for (var i = 0; i < patterns.length; i++) {
      nodeLabels.push(prefixOf(patterns[i]));
      nodeLabels.push(suffixOf(patterns[i]));
      edges.push({ id: i, from: 2 * i, to: 2 * i + 1, label: patterns[i] });
    }
    return { nodeLabels: nodeLabels, edges: edges };
  }

  function countLabels(labels) {
    var counts = new Map();
    for (var i = 0; i < labels.length; i++) {
      counts.set(labels[i], (counts.get(labels[i]) || 0) + 1);
    }
    return counts;
  }

  /* Labels carried by two or more nodes, in order of first appearance. */
  function gluingOrder(nodeLabels) {
    var counts = countLabels(nodeLabels);
    var order = [];
    var seen = new Set();
    for (var i = 0; i < nodeLabels.length; i++) {
      var label = nodeLabels[i];
      if (counts.get(label) >= 2 && !seen.has(label)) {
        seen.add(label);
        order.push(label);
      }
    }
    return order;
  }

  function nodeIdForCopy(label, copyIndex, gluedLabels) {
    if (gluedLabels.has(label)) {
      return 'g:' + label;
    }
    return 'c:' + copyIndex;
  }

  /* Glue every node whose label is in gluedLabels; other copies stay apart. */
  function glueGraph(baseGraph, gluedLabels) {
    var nodes = [];
    var nodeById = new Map();
    var copyToNode = [];
    for (var i = 0; i < baseGraph.nodeLabels.length; i++) {
      var label = baseGraph.nodeLabels[i];
      var id = nodeIdForCopy(label, i, gluedLabels);
      copyToNode.push(id);
      if (!nodeById.has(id)) {
        var node = { id: id, label: label, copies: [] };
        nodeById.set(id, node);
        nodes.push(node);
      }
      nodeById.get(id).copies.push(i);
    }
    var edges = [];
    for (var j = 0; j < baseGraph.edges.length; j++) {
      var edge = baseGraph.edges[j];
      edges.push({ id: edge.id, from: copyToNode[edge.from], to: copyToNode[edge.to], label: edge.label });
    }
    return { nodes: nodes, edges: edges };
  }

  /* DeBruijn(Patterns) as an adjacency list: prefix -> [suffixes] in input order. */
  function deBruijnFromKmers(patterns) {
    var adjacency = new Map();
    for (var i = 0; i < patterns.length; i++) {
      var from = prefixOf(patterns[i]);
      if (!adjacency.has(from)) {
        adjacency.set(from, []);
      }
      adjacency.get(from).push(suffixOf(patterns[i]));
    }
    return adjacency;
  }

  function deBruijnFromText(text, k) {
    return deBruijnFromKmers(kmerComposition(text, k));
  }

  function compareStrings(a, b) {
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  }

  /* One line per node, "AT -> TG,TG,TG", nodes and targets sorted. */
  function formatAdjacency(adjacency) {
    var keys = Array.from(adjacency.keys()).sort(compareStrings);
    var lines = [];
    for (var i = 0; i < keys.length; i++) {
      var targets = adjacency.get(keys[i]).slice().sort(compareStrings);
      lines.push(keys[i] + ' -> ' + targets.join(','));
    }
    return lines;
  }

  function degreeTable(nodeIds, edges) {
    var table = new Map();
    for (var i = 0; i < nodeIds.length; i++) {
      table.set(nodeIds[i], { indegree: 0, outdegree: 0 });
    }
    for (var j = 0; j < edges.length; j++) {
      table.get(edges[j].from).outdegree += 1;
      table.get(edges[j].to).indegree += 1;
    }
    return table;
  }

  /* Which nodes break the (nearly) balanced condition for an Eulerian path. */
  function eulerianPathEndpoints(nodeIds, edges) {
    var table = degreeTable(nodeIds, edges);
    var starts = [];
    var ends = [];
    var badNodes = [];
    for (var i = 0; i < nodeIds.length; i++) {
      var degrees = table.get(nodeIds[i]);
      var surplus = degrees.outdegree - degrees.indegree;
      if (surplus === 1) {
        starts.push(nodeIds[i]);
      } else if (surplus === -1) {
        ends.push(nodeIds[i]);
      } else if (surplus !== 0) {
        badNodes.push(nodeIds[i]);
      }
    }
    var ok = badNodes.length === 0 && starts.length === ends.length && starts.length <= 1;
    return { ok: ok, starts: starts, ends: ends, badNodes: badNodes, degrees: table };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) || 1;
    return function nextRandom() {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(items, rng) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var swap = items[i];
      items[i] = items[j];
      items[j] = swap;
    }
    return items;
  }

  function outgoingEdgeLists(nodeIds, edges, rng) {
    var lists = new Map();
    for (var i = 0; i < nodeIds.length; i++) {
      lists.set(nodeIds[i], []);
    }
    for (var j = 0; j < edges.length; j++) {
      lists.get(edges[j].from).push(j);
    }
    if (rng) {
      lists.forEach(function shuffleList(list) {
        shuffleInPlace(list, rng);
      });
    }
    return lists;
  }

  /* Hierholzer's walk from start; returns edge indices in path order. */
  function walkAllEdgesFrom(start, nodeIds, edges, rng) {
    var lists = outgoingEdgeLists(nodeIds, edges, rng);
    var nextIndex = new Map();
    lists.forEach(function resetIndex(list, id) {
      nextIndex.set(id, 0);
    });
    var nodeStack = [start];
    var edgeStack = [];
    var pathEdges = [];
    while (nodeStack.length > 0) {
      var current = nodeStack[nodeStack.length - 1];
      var list = lists.get(current);
      var index = nextIndex.get(current);
      if (index < list.length) {
        nextIndex.set(current, index + 1);
        var edgeIndex = list[index];
        nodeStack.push(edges[edgeIndex].to);
        edgeStack.push(edgeIndex);
      } else {
        nodeStack.pop();
        if (edgeStack.length > 0) {
          pathEdges.push(edgeStack.pop());
        }
      }
    }
    pathEdges.reverse();
    return pathEdges;
  }

  /* Eulerian path in a directed multigraph {from, to} edges.
   * rng is optional: without it, out-edges are tried in input order. */
  function findEulerianPath(nodeIds, edges, rng) {
    if (edges.length === 0) {
      return { ok: false, reason: 'The graph has no edges.' };
    }
    var endpoints = eulerianPathEndpoints(nodeIds, edges);
    if (!endpoints.ok) {
      return { ok: false, reason: 'unbalanced', endpoints: endpoints };
    }
    var start = endpoints.starts.length === 1 ? endpoints.starts[0] : edges[0].from;
    var edgeOrder = walkAllEdgesFrom(start, nodeIds, edges, rng);
    if (edgeOrder.length !== edges.length) {
      return { ok: false, reason: 'disconnected', endpoints: endpoints };
    }
    var nodeOrder = [start];
    for (var i = 0; i < edgeOrder.length; i++) {
      nodeOrder.push(edges[edgeOrder[i]].to);
    }
    return { ok: true, edgeOrder: edgeOrder, nodeOrder: nodeOrder, isCycle: endpoints.starts.length === 0 };
  }

  function isEulerianPath(edges, edgeOrder) {
    if (edgeOrder.length !== edges.length) {
      return false;
    }
    var used = new Set();
    for (var i = 0; i < edgeOrder.length; i++) {
      var index = edgeOrder[i];
      if (used.has(index) || index < 0 || index >= edges.length) {
        return false;
      }
      used.add(index);
      if (i > 0 && edges[edgeOrder[i - 1]].to !== edges[index].from) {
        return false;
      }
    }
    return true;
  }

  /* PathToGenome: first (k-1)-mer, then the last symbol of each next one. */
  function spellPath(nodeLabels) {
    if (nodeLabels.length === 0) {
      return '';
    }
    var text = nodeLabels[0];
    for (var i = 1; i < nodeLabels.length; i++) {
      var label = nodeLabels[i];
      text += label.charAt(label.length - 1);
    }
    return text;
  }

  function uniqueInOrder(items) {
    var seen = new Set();
    var unique = [];
    for (var i = 0; i < items.length; i++) {
      if (!seen.has(items[i])) {
        seen.add(items[i]);
        unique.push(items[i]);
      }
    }
    return unique;
  }

  /* DeBruijn(Patterns) as node ids (the (k-1)-mers) and labeled edges. */
  function deBruijnGraphFromKmers(patterns) {
    var labels = [];
    var edges = [];
    for (var i = 0; i < patterns.length; i++) {
      labels.push(prefixOf(patterns[i]));
      labels.push(suffixOf(patterns[i]));
      edges.push({ id: i, from: prefixOf(patterns[i]), to: suffixOf(patterns[i]), label: patterns[i] });
    }
    return { nodeIds: uniqueInOrder(labels), edges: edges };
  }

  /* StringReconstruction(Patterns) = PathToGenome(EulerianPath(DeBruijn(Patterns))). */
  function stringReconstruction(patterns, rng) {
    var graph = deBruijnGraphFromKmers(patterns);
    var path = findEulerianPath(graph.nodeIds, graph.edges, rng);
    if (!path.ok) {
      return null;
    }
    return spellPath(path.nodeOrder);
  }

  /* Overlap(Patterns): one node per k-mer occurrence, i -> j when Suffix(i) = Prefix(j). */
  function overlapGraph(patterns) {
    var edges = [];
    for (var i = 0; i < patterns.length; i++) {
      for (var j = 0; j < patterns.length; j++) {
        if (i !== j && suffixOf(patterns[i]) === prefixOf(patterns[j])) {
          edges.push({ from: i, to: j });
        }
      }
    }
    return edges;
  }

  function firstBadSymbol(text) {
    for (var i = 0; i < text.length; i++) {
      if (!ALLOWED_SYMBOLS.test(text.charAt(i))) {
        return text.charAt(i);
      }
    }
    return '';
  }

  function badSymbolMessage(symbol) {
    return '"' + symbol + '" is not allowed. Use only A, C, G and T (or 0 and 1 for binary strings).';
  }

  function validateGenomeInput(rawText, rawK) {
    var text = String(rawText).toUpperCase().replace(/\s+/g, '');
    if (text.length === 0) {
      return { ok: false, message: 'Type a genome string.' };
    }
    var badSymbol = firstBadSymbol(text);
    if (badSymbol) {
      return { ok: false, message: badSymbolMessage(badSymbol) };
    }
    var kText = String(rawK).trim();
    if (!/^\d+$/.test(kText)) {
      return { ok: false, message: 'k must be a whole number.' };
    }
    var k = parseInt(kText, 10);
    if (k < MIN_K || k > MAX_K) {
      return { ok: false, message: 'Choose k between ' + MIN_K + ' and ' + MAX_K + '.' };
    }
    if (k > text.length) {
      return { ok: false, message: 'k = ' + k + ' is longer than the genome, which has ' + text.length + ' letters.' };
    }
    var kmerCount = text.length - k + 1;
    if (kmerCount > MAX_KMERS) {
      return {
        ok: false,
        message: 'That gives ' + kmerCount + ' k-mers, but the widget draws at most ' + MAX_KMERS +
          '. Shorten the genome to at most ' + (MAX_KMERS + k - 1) + ' letters.'
      };
    }
    return { ok: true, text: text, k: k };
  }

  function validateKmerInput(rawPatterns) {
    var tokens = String(rawPatterns).toUpperCase().split(/[\s,]+/);
    var patterns = [];
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].length > 0) {
        patterns.push(tokens[i]);
      }
    }
    if (patterns.length === 0) {
      return { ok: false, message: 'Type at least one k-mer.' };
    }
    if (patterns.length > MAX_KMERS) {
      return { ok: false, message: 'You typed ' + patterns.length + ' k-mers; the widget draws at most ' + MAX_KMERS + '.' };
    }
    for (var j = 0; j < patterns.length; j++) {
      var badSymbol = firstBadSymbol(patterns[j]);
      if (badSymbol) {
        return { ok: false, message: badSymbolMessage(badSymbol) };
      }
      if (patterns[j].length !== patterns[0].length) {
        return {
          ok: false,
          message: 'All k-mers must have the same length: ' + patterns[0] + ' has ' + patterns[0].length +
            ' letters but ' + patterns[j] + ' has ' + patterns[j].length + '.'
        };
      }
    }
    var k = patterns[0].length;
    if (k < MIN_K || k > MAX_K) {
      return { ok: false, message: 'Use k-mers of length ' + MIN_K + ' to ' + MAX_K + '.' };
    }
    return { ok: true, patterns: patterns, k: k };
  }

  /* ------------------------------------------------------------------ */
  /* Layout (pure, deterministic)                                        */
  /* ------------------------------------------------------------------ */

  function nodeHalfWidth(label) {
    return Math.max(17, label.length * 4.6 + 9);
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  /* Path graph drawn left-to-right, then right-to-left on the next row. */
  function serpentineLayout(count, halfWidth) {
    var spacing = Math.max(92, 2 * halfWidth + 48);
    var perRow = Math.max(2, Math.floor((VIEW_WIDTH - 2 * VIEW_MARGIN - 2 * halfWidth) / spacing) + 1);
    var rows = Math.ceil(count / perRow);
    var rowGap = rows > 1 ? Math.min(110, (VIEW_HEIGHT - 2 * VIEW_MARGIN) / (rows - 1)) : 0;
    var usedWidth = (Math.min(count, perRow) - 1) * spacing;
    var left = (VIEW_WIDTH - usedWidth) / 2;
    var top = (VIEW_HEIGHT - (rows - 1) * rowGap) / 2;
    var positions = [];
    for (var i = 0; i < count; i++) {
      var row = Math.floor(i / perRow);
      var column = i % perRow;
      if (row % 2 === 1) {
        column = perRow - 1 - column;
      }
      positions.push({ x: left + column * spacing, y: top + row * rowGap });
    }
    return positions;
  }

  /* CompositionGraph: isolated edges on a grid, prefix left, suffix right. */
  function pairGridLayout(pairCount, halfWidth) {
    var pairWidth = 2 * (2 * halfWidth) + 58;
    var perRow = Math.max(1, Math.floor((VIEW_WIDTH - VIEW_MARGIN) / (pairWidth + 16)));
    var rows = Math.ceil(pairCount / perRow);
    var rowGap = rows > 1 ? Math.min(70, (VIEW_HEIGHT - 2 * VIEW_MARGIN) / (rows - 1)) : 0;
    var cellWidth = (VIEW_WIDTH - VIEW_MARGIN) / perRow;
    var top = (VIEW_HEIGHT - (rows - 1) * rowGap) / 2;
    var positions = [];
    for (var i = 0; i < pairCount; i++) {
      var row = Math.floor(i / perRow);
      var column = i % perRow;
      var centerX = VIEW_MARGIN / 2 + cellWidth * (column + 0.5);
      var y = top + row * rowGap;
      var gap = pairWidth / 2 - halfWidth;
      positions.push({ x: centerX - gap, y: y });
      positions.push({ x: centerX + gap, y: y });
    }
    return positions;
  }

  function circleLayout(count) {
    var radius = Math.min(VIEW_WIDTH, VIEW_HEIGHT) / 2 - VIEW_MARGIN;
    var positions = [];
    for (var i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
      positions.push({ x: VIEW_WIDTH / 2 + radius * Math.cos(angle), y: VIEW_HEIGHT / 2 + radius * Math.sin(angle) });
    }
    return positions;
  }

  function springPairsFromEdges(edges) {
    var seen = new Set();
    var pairs = [];
    for (var i = 0; i < edges.length; i++) {
      var a = edges[i].from;
      var b = edges[i].to;
      if (a === b) {
        continue;
      }
      var key = a < b ? a + '|' + b : b + '|' + a;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([a, b]);
      }
    }
    return pairs;
  }

  function clampToView(point, halfWidth) {
    point.x = clamp(point.x, VIEW_MARGIN + halfWidth, VIEW_WIDTH - VIEW_MARGIN - halfWidth);
    point.y = clamp(point.y, VIEW_MARGIN, VIEW_HEIGHT - VIEW_MARGIN);
  }

  function addRepulsion(ids, positions, displacement, ideal) {
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        var a = positions.get(ids[i]);
        var b = positions.get(ids[j]);
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.5) {
          dx = (j - i) * 0.7;
          dy = (i % 2 === 0 ? 1 : -1) * 0.7;
          distance = Math.sqrt(dx * dx + dy * dy);
        }
        var force = (ideal * ideal) / distance;
        var push = displacement.get(ids[i]);
        var pull = displacement.get(ids[j]);
        push.x += (dx / distance) * force;
        push.y += (dy / distance) * force;
        pull.x -= (dx / distance) * force;
        pull.y -= (dy / distance) * force;
      }
    }
  }

  function addSprings(pairs, positions, displacement, ideal) {
    for (var i = 0; i < pairs.length; i++) {
      var a = positions.get(pairs[i][0]);
      var b = positions.get(pairs[i][1]);
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      var distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
      var force = (distance * distance) / ideal;
      var first = displacement.get(pairs[i][0]);
      var second = displacement.get(pairs[i][1]);
      first.x -= (dx / distance) * force;
      first.y -= (dy / distance) * force;
      second.x += (dx / distance) * force;
      second.y += (dy / distance) * force;
    }
  }

  /* Push apart any two node boxes that still overlap. */
  function separateOverlaps(ids, positions, halfWidths) {
    for (var round = 0; round < 40; round++) {
      var moved = false;
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var a = positions.get(ids[i]);
          var b = positions.get(ids[j]);
          var needX = halfWidths.get(ids[i]) + halfWidths.get(ids[j]) + 10;
          var needY = 2 * NODE_HALF_HEIGHT + 12;
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          if (Math.abs(dx) < needX && Math.abs(dy) < needY) {
            var overlapX = needX - Math.abs(dx);
            var overlapY = needY - Math.abs(dy);
            if (overlapY < overlapX) {
              var signY = dy >= 0 ? 1 : -1;
              a.y -= (signY * overlapY) / 2;
              b.y += (signY * overlapY) / 2;
            } else {
              var signX = dx >= 0 ? 1 : -1;
              a.x -= (signX * overlapX) / 2;
              b.x += (signX * overlapX) / 2;
            }
            clampToView(a, halfWidths.get(ids[i]));
            clampToView(b, halfWidths.get(ids[j]));
            moved = true;
          }
        }
      }
      if (!moved) {
        return;
      }
    }
  }

  /* Fruchterman-Reingold with a linear cooling schedule and no randomness. */
  function forceLayout(ids, edges, initialPositions, halfWidths, options) {
    var positions = new Map();
    for (var i = 0; i < ids.length; i++) {
      var start = initialPositions.get(ids[i]);
      positions.set(ids[i], { x: start.x, y: start.y });
    }
    var pairs = springPairsFromEdges(edges);
    var ideal = options.idealLength;
    var centerX = VIEW_WIDTH / 2;
    var centerY = VIEW_HEIGHT / 2;
    for (var iteration = 0; iteration < options.iterations; iteration++) {
      var temperature = options.temperature * (1 - iteration / options.iterations);
      var displacement = new Map();
      for (var d = 0; d < ids.length; d++) {
        displacement.set(ids[d], { x: 0, y: 0 });
      }
      addRepulsion(ids, positions, displacement, ideal);
      addSprings(pairs, positions, displacement, ideal);
      for (var n = 0; n < ids.length; n++) {
        var point = positions.get(ids[n]);
        var move = displacement.get(ids[n]);
        move.x += (centerX - point.x) * options.gravity;
        move.y += (centerY - point.y) * options.gravity * 1.6;
        var length = Math.sqrt(move.x * move.x + move.y * move.y);
        if (length > 0) {
          var step = Math.min(length, temperature);
          point.x += (move.x / length) * step;
          point.y += (move.y / length) * step;
        }
        clampToView(point, halfWidths.get(ids[n]));
      }
    }
    separateOverlaps(ids, positions, halfWidths);
    return positions;
  }

  /* ------------------------------------------------------------------ */
  /* Edge geometry                                                       */
  /* ------------------------------------------------------------------ */

  function quadraticPoint(p0, p1, p2, t) {
    var u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    };
  }

  function quadraticTangent(p0, p1, p2, t) {
    return {
      x: 2 * ((1 - t) * (p1.x - p0.x) + t * (p2.x - p1.x)),
      y: 2 * ((1 - t) * (p1.y - p0.y) + t * (p2.y - p1.y))
    };
  }

  function insideNode(point, center, halfWidth, padding) {
    var dx = (point.x - center.x) / (halfWidth + padding);
    var dy = (point.y - center.y) / (NODE_HALF_HEIGHT + padding);
    return dx * dx + dy * dy < 1;
  }

  /* Parameter t where the curve crosses the boundary of a node, by bisection. */
  function boundaryParameter(curve, center, halfWidth, insideAt, outsideAt) {
    var inside = insideAt;
    var outside = outsideAt;
    if (insideNode(quadraticPoint(curve[0], curve[1], curve[2], outside), center, halfWidth, 2)) {
      return outside;
    }
    for (var i = 0; i < 24; i++) {
      var middle = (inside + outside) / 2;
      if (insideNode(quadraticPoint(curve[0], curve[1], curve[2], middle), center, halfWidth, 2)) {
        inside = middle;
      } else {
        outside = middle;
      }
    }
    return outside;
  }

  function normalize(vector) {
    var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
    return { x: vector.x / length, y: vector.y / length };
  }

  function arrowheadPoints(tip, direction) {
    var unit = normalize(direction);
    var back = { x: tip.x - unit.x * 9, y: tip.y - unit.y * 9 };
    var side = { x: -unit.y * 4.5, y: unit.x * 4.5 };
    return [tip.x, tip.y, back.x + side.x, back.y + side.y, back.x - side.x, back.y - side.y]
      .map(function roundCoordinate(value) { return value.toFixed(1); }).join(' ');
  }

  function curvedEdgeGeometry(from, to, fromHalf, toHalf, offset, canonicalNormal) {
    var middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    var control = { x: middle.x + canonicalNormal.x * offset * 2, y: middle.y + canonicalNormal.y * offset * 2 };
    var curve = [from, control, to];
    var t0 = boundaryParameter(curve, from, fromHalf, 0, 0.5);
    var t1 = boundaryParameter(curve, to, toHalf, 1, 0.5);
    var start = quadraticPoint(from, control, to, t0);
    var end = quadraticPoint(from, control, to, t1);
    var startTangent = quadraticTangent(from, control, to, t0);
    var subControl = { x: start.x + ((t1 - t0) / 2) * startTangent.x, y: start.y + ((t1 - t0) / 2) * startTangent.y };
    var label = quadraticPoint(from, control, to, 0.5);
    var badge = quadraticPoint(from, control, to, t0 + (t1 - t0) * 0.22);
    var d = 'M' + start.x.toFixed(1) + ',' + start.y.toFixed(1) + ' Q' + subControl.x.toFixed(1) + ',' +
      subControl.y.toFixed(1) + ' ' + end.x.toFixed(1) + ',' + end.y.toFixed(1);
    return {
      d: d,
      arrow: arrowheadPoints(end, quadraticTangent(from, control, to, t1)),
      labelX: label.x,
      labelY: label.y,
      badgeX: badge.x,
      badgeY: badge.y
    };
  }

  function loopGeometry(center, halfWidth, angle, loopIndex) {
    var spread = 0.42;
    var reach = 40 + 18 * loopIndex;
    var startAngle = angle - spread;
    var endAngle = angle + spread;
    var start = { x: center.x + halfWidth * Math.cos(startAngle), y: center.y + NODE_HALF_HEIGHT * Math.sin(startAngle) };
    var end = { x: center.x + halfWidth * Math.cos(endAngle), y: center.y + NODE_HALF_HEIGHT * Math.sin(endAngle) };
    var radiusAtAngle = Math.abs(halfWidth * Math.cos(angle)) + Math.abs(NODE_HALF_HEIGHT * Math.sin(angle));
    var control1 = {
      x: center.x + (radiusAtAngle + reach) * Math.cos(angle - spread - 0.35),
      y: center.y + (radiusAtAngle + reach) * Math.sin(angle - spread - 0.35)
    };
    var control2 = {
      x: center.x + (radiusAtAngle + reach) * Math.cos(angle + spread + 0.35),
      y: center.y + (radiusAtAngle + reach) * Math.sin(angle + spread + 0.35)
    };
    var labelPoint = {
      x: 0.125 * start.x + 0.375 * control1.x + 0.375 * control2.x + 0.125 * end.x,
      y: 0.125 * start.y + 0.375 * control1.y + 0.375 * control2.y + 0.125 * end.y
    };
    var d = 'M' + start.x.toFixed(1) + ',' + start.y.toFixed(1) + ' C' + control1.x.toFixed(1) + ',' +
      control1.y.toFixed(1) + ' ' + control2.x.toFixed(1) + ',' + control2.y.toFixed(1) + ' ' +
      end.x.toFixed(1) + ',' + end.y.toFixed(1);
    return {
      d: d,
      arrow: arrowheadPoints(end, { x: end.x - control2.x, y: end.y - control2.y }),
      labelX: labelPoint.x + 8 * Math.cos(angle),
      labelY: labelPoint.y + 8 * Math.sin(angle),
      badgeX: control1.x * 0.6 + start.x * 0.4,
      badgeY: control1.y * 0.6 + start.y * 0.4,
      extent: [start, control1, control2, end]
    };
  }

  /* Direction pointing away from a node's neighbors (for placing loops). */
  function loopAngle(nodeId, edges, positions) {
    var center = positions.get(nodeId);
    var sumX = 0;
    var sumY = 0;
    for (var i = 0; i < edges.length; i++) {
      var other = null;
      if (edges[i].from === nodeId && edges[i].to !== nodeId) {
        other = edges[i].to;
      } else if (edges[i].to === nodeId && edges[i].from !== nodeId) {
        other = edges[i].from;
      }
      if (other !== null) {
        var unit = normalize({ x: positions.get(other).x - center.x, y: positions.get(other).y - center.y });
        sumX += unit.x;
        sumY += unit.y;
      }
    }
    if (Math.abs(sumX) < 0.01 && Math.abs(sumY) < 0.01) {
      return -Math.PI / 2;
    }
    return Math.atan2(-sumY, -sumX);
  }

  function groupEdges(edges) {
    var pairGroups = new Map();
    var loopGroups = new Map();
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if (edge.from === edge.to) {
        if (!loopGroups.has(edge.from)) {
          loopGroups.set(edge.from, []);
        }
        loopGroups.get(edge.from).push(edge);
      } else {
        var key = edge.from < edge.to ? edge.from + '|' + edge.to : edge.to + '|' + edge.from;
        if (!pairGroups.has(key)) {
          pairGroups.set(key, []);
        }
        pairGroups.get(key).push(edge);
      }
    }
    return { pairGroups: pairGroups, loopGroups: loopGroups };
  }

  /* Geometry for every edge; parallel edges fan out, loops stack outward. */
  function edgeGeometries(edges, positions, halfWidths) {
    var groups = groupEdges(edges);
    var geometries = new Map();
    groups.pairGroups.forEach(function layOutPair(group) {
      var first = group[0];
      var low = first.from < first.to ? first.from : first.to;
      var high = first.from < first.to ? first.to : first.from;
      var direction = normalize({ x: positions.get(high).x - positions.get(low).x, y: positions.get(high).y - positions.get(low).y });
      var canonicalNormal = { x: -direction.y, y: direction.x };
      for (var i = 0; i < group.length; i++) {
        var edge = group[i];
        var offset = (i - (group.length - 1) / 2) * 30;
        geometries.set(edge.id, curvedEdgeGeometry(
          positions.get(edge.from), positions.get(edge.to),
          halfWidths.get(edge.from), halfWidths.get(edge.to), offset, canonicalNormal));
      }
    });
    groups.loopGroups.forEach(function layOutLoops(group, nodeId) {
      var angle = loopAngle(nodeId, edges, positions);
      for (var i = 0; i < group.length; i++) {
        geometries.set(group[i].id, loopGeometry(positions.get(nodeId), halfWidths.get(nodeId), angle, i));
      }
    });
    return geometries;
  }

  /* ------------------------------------------------------------------ */
  /* Stages: base graph -> glue one label per step -> de Bruijn graph    */
  /* ------------------------------------------------------------------ */

  function buildModel(input) {
    var base = input.mode === 'text' ? pathGraph(input.text, input.k) : compositionGraph(input.patterns);
    var patterns = input.mode === 'text' ? kmerComposition(input.text, input.k) : input.patterns;
    return {
      mode: input.mode,
      text: input.mode === 'text' ? input.text : '',
      k: input.k,
      patterns: patterns,
      base: base,
      glueOrder: gluingOrder(base.nodeLabels),
      stages: []
    };
  }

  function stageGraph(model, stageIndex) {
    var glued = new Set(model.glueOrder.slice(0, stageIndex));
    return glueGraph(model.base, glued);
  }

  function halfWidthsFor(graph) {
    var widths = new Map();
    for (var i = 0; i < graph.nodes.length; i++) {
      widths.set(graph.nodes[i].id, nodeHalfWidth(graph.nodes[i].label));
    }
    return widths;
  }

  function initialPositions(model, graph) {
    var halfWidth = nodeHalfWidth(model.base.nodeLabels[0] || 'A');
    var list = model.mode === 'text' ?
      serpentineLayout(model.base.nodeLabels.length, halfWidth) :
      pairGridLayout(model.base.edges.length, halfWidth);
    var positions = new Map();
    for (var i = 0; i < graph.nodes.length; i++) {
      positions.set(graph.nodes[i].id, list[graph.nodes[i].copies[0]]);
    }
    return positions;
  }

  function centroidOfCopies(copies, previousGraph, previousPositions) {
    var copySet = new Set(copies);
    var sumX = 0;
    var sumY = 0;
    var count = 0;
    for (var i = 0; i < previousGraph.nodes.length; i++) {
      var node = previousGraph.nodes[i];
      if (copySet.has(node.copies[0])) {
        var point = previousPositions.get(node.id);
        sumX += point.x * node.copies.length;
        sumY += point.y * node.copies.length;
        count += node.copies.length;
      }
    }
    return { x: sumX / count, y: sumY / count };
  }

  /* Where each node of the new stage starts: glued node at the centroid. */
  function carriedPositions(graph, previousGraph, previousPositions) {
    var positions = new Map();
    for (var i = 0; i < graph.nodes.length; i++) {
      var node = graph.nodes[i];
      if (previousPositions.has(node.id)) {
        var kept = previousPositions.get(node.id);
        positions.set(node.id, { x: kept.x, y: kept.y });
      } else {
        positions.set(node.id, centroidOfCopies(node.copies, previousGraph, previousPositions));
      }
    }
    return positions;
  }

  function layoutOptions(isFinal, nodeCount) {
    var area = (VIEW_WIDTH - 2 * VIEW_MARGIN) * (VIEW_HEIGHT - 2 * VIEW_MARGIN);
    var ideal = clamp(0.75 * Math.sqrt(area / Math.max(1, nodeCount)), 70, 130);
    if (isFinal) {
      return { idealLength: ideal, iterations: 320, temperature: 60, gravity: 0.06 };
    }
    return { idealLength: ideal, iterations: 50, temperature: 6, gravity: 0.01 };
  }

  function orientation(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }

  function segmentsCross(a, b, c, d) {
    var d1 = orientation(c, d, a);
    var d2 = orientation(c, d, b);
    var d3 = orientation(a, b, c);
    var d4 = orientation(a, b, d);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }

  function distanceToSegment(point, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = dx * dx + dy * dy || 1;
    var t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
    var nearX = a.x + t * dx - point.x;
    var nearY = a.y + t * dy - point.y;
    return Math.sqrt(nearX * nearX + nearY * nearY);
  }

  /* Lower is better: edge crossings plus nodes sitting on edges they do not touch. */
  function layoutPenalty(ids, edges, positions, halfWidths) {
    var pairs = springPairsFromEdges(edges);
    var penalty = 0;
    for (var i = 0; i < pairs.length; i++) {
      for (var j = i + 1; j < pairs.length; j++) {
        var shared = pairs[i][0] === pairs[j][0] || pairs[i][0] === pairs[j][1] ||
          pairs[i][1] === pairs[j][0] || pairs[i][1] === pairs[j][1];
        if (!shared && segmentsCross(positions.get(pairs[i][0]), positions.get(pairs[i][1]),
          positions.get(pairs[j][0]), positions.get(pairs[j][1]))) {
          penalty += 1;
        }
      }
      for (var n = 0; n < ids.length; n++) {
        if (ids[n] === pairs[i][0] || ids[n] === pairs[i][1]) {
          continue;
        }
        var gap = distanceToSegment(positions.get(ids[n]), positions.get(pairs[i][0]), positions.get(pairs[i][1]));
        if (gap < halfWidths.get(ids[n]) + 8) {
          penalty += 3;
        }
      }
    }
    return penalty;
  }

  function jitteredPositions(ids, base, rng, amount) {
    var positions = new Map();
    for (var i = 0; i < ids.length; i++) {
      var point = base.get(ids[i]);
      positions.set(ids[i], { x: point.x + (rng() - 0.5) * amount, y: point.y + (rng() - 0.5) * amount });
    }
    return positions;
  }

  function circlePositions(ids, reverse) {
    var circle = circleLayout(ids.length);
    var positions = new Map();
    for (var i = 0; i < ids.length; i++) {
      var index = reverse ? ids.length - 1 - i : i;
      positions.set(ids[index], circle[i]);
    }
    return positions;
  }

  /* Run the force layout from several deterministic starts; keep the tidiest. */
  function bestFinalLayout(ids, edges, start, halfWidths) {
    var options = layoutOptions(true, ids.length);
    var rng = makeRng(17);
    var starts = [start, circlePositions(ids, false), circlePositions(ids, true)];
    for (var attempt = 0; attempt < 5; attempt++) {
      starts.push(jitteredPositions(ids, start, rng, 260));
    }
    var best = null;
    var bestPenalty = Infinity;
    for (var i = 0; i < starts.length; i++) {
      var candidate = forceLayout(ids, edges, starts[i], halfWidths, options);
      var penalty = layoutPenalty(ids, edges, candidate, halfWidths);
      if (penalty < bestPenalty) {
        best = candidate;
        bestPenalty = penalty;
      }
    }
    return best;
  }

  /* Stage s = s labels glued. Computed on demand and cached. */
  function ensureStage(model, stageIndex) {
    for (var s = model.stages.length; s <= stageIndex; s++) {
      var graph = stageGraph(model, s);
      var widths = halfWidthsFor(graph);
      var start;
      if (s === 0) {
        start = initialPositions(model, graph);
      } else {
        var previous = model.stages[s - 1];
        start = carriedPositions(graph, previous.graph, previous.positions);
      }
      var ids = graph.nodes.map(function nodeId(node) { return node.id; });
      var isFinal = s === model.glueOrder.length;
      var needsLayout = s > 0 || (isFinal && model.mode === 'kmers');
      var positions = start;
      if (needsLayout && isFinal) {
        positions = bestFinalLayout(ids, graph.edges, start, widths);
      } else if (needsLayout) {
        positions = forceLayout(ids, graph.edges, start, widths, layoutOptions(false, ids.length));
      }
      model.stages.push({ graph: graph, start: start, positions: positions, halfWidths: widths });
    }
    return model.stages[stageIndex];
  }

  function eulerianWalk(model, seed) {
    var finalStage = ensureStage(model, model.glueOrder.length);
    var graph = finalStage.graph;
    var ids = graph.nodes.map(function nodeId(node) { return node.id; });
    var rng = seed === 0 ? null : makeRng(seed);
    var result = findEulerianPath(ids, graph.edges, rng);
    if (!result.ok) {
      return result;
    }
    var labelById = new Map();
    for (var i = 0; i < graph.nodes.length; i++) {
      labelById.set(graph.nodes[i].id, graph.nodes[i].label);
    }
    var labels = result.nodeOrder.map(function toLabel(id) { return labelById.get(id); });
    result.labels = labels;
    result.spelled = spellPath(labels);
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Browser UI                                                          */
  /* ------------------------------------------------------------------ */

  function svgElement(name, attributes) {
    var element = document.createElementNS(SVG_NS, name);
    var keys = Object.keys(attributes || {});
    for (var i = 0; i < keys.length; i++) {
      element.setAttribute(keys[i], attributes[keys[i]]);
    }
    return element;
  }

  function htmlElement(name, className, text) {
    var element = document.createElement(name);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function nucleotideClass(symbol) {
    if ('ACGT'.indexOf(symbol) >= 0) {
      return 'nt nt-' + symbol.toLowerCase();
    }
    return 'nt';
  }

  function appendColoredSvgText(textElement, label) {
    for (var i = 0; i < label.length; i++) {
      var span = svgElement('tspan', { 'class': nucleotideClass(label.charAt(i)) });
      span.textContent = label.charAt(i);
      textElement.appendChild(span);
    }
  }

  function coloredHtml(label) {
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < label.length; i++) {
      var span = htmlElement('span', nucleotideClass(label.charAt(i)), label.charAt(i));
      fragment.appendChild(span);
    }
    return fragment;
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function subscript(name, k) {
    return name + '<sub>' + k + '</sub>';
  }

  /* Title of the de Bruijn graph for the current mode, as HTML. */
  function graphNames(model) {
    if (model.mode === 'text') {
      return {
        base: '<em>' + subscript('PathGraph', model.k) + '</em>(<em>Text</em>)',
        final: '<em>' + subscript('DeBruijn', model.k) + '</em>(<em>Text</em>)'
      };
    }
    return {
      base: '<em>CompositionGraph</em>(<em>Patterns</em>)',
      final: '<em>DeBruijn</em>(<em>Patterns</em>)'
    };
  }

  function numberWord(count) {
    var words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    return count < words.length ? words[count] : String(count);
  }

  function plural(count, singular, pluralForm) {
    return count + ' ' + (count === 1 ? singular : pluralForm);
  }

  function buildControls(ui) {
    var controls = htmlElement('div', 'dbg-controls');

    var modeGroup = htmlElement('div', 'dbg-mode');
    modeGroup.setAttribute('role', 'radiogroup');
    modeGroup.setAttribute('aria-label', 'Build the graph from');
    ui.modeText = radioOption(modeGroup, ui.uid + '-mode', 'text', 'From a genome', true);
    ui.modeKmers = radioOption(modeGroup, ui.uid + '-mode', 'kmers', 'From k-mers alone', false);
    controls.appendChild(modeGroup);

    var textRow = htmlElement('div', 'dbg-row dbg-text-row');
    var textLabel = htmlElement('label', 'dbg-field dbg-field-wide');
    textLabel.appendChild(htmlElement('span', 'dbg-field-name', 'Text'));
    ui.textInput = htmlElement('input', 'dbg-input');
    ui.textInput.type = 'text';
    ui.textInput.spellcheck = false;
    ui.textInput.autocomplete = 'off';
    ui.textInput.value = BOOK_GENOME;
    textLabel.appendChild(ui.textInput);
    textRow.appendChild(textLabel);
    var kLabel = htmlElement('label', 'dbg-field');
    kLabel.appendChild(htmlElement('span', 'dbg-field-name', 'k'));
    ui.kInput = htmlElement('input', 'dbg-input dbg-k');
    ui.kInput.type = 'number';
    ui.kInput.min = String(MIN_K);
    ui.kInput.max = String(MAX_K);
    ui.kInput.value = String(BOOK_K);
    kLabel.appendChild(ui.kInput);
    textRow.appendChild(kLabel);
    controls.appendChild(textRow);

    var kmerRow = htmlElement('div', 'dbg-row dbg-kmer-row');
    kmerRow.hidden = true;
    var kmerLabel = htmlElement('label', 'dbg-field dbg-field-wide');
    kmerLabel.appendChild(htmlElement('span', 'dbg-field-name', 'Patterns (k-mers, separated by spaces)'));
    ui.kmerInput = htmlElement('textarea', 'dbg-input dbg-kmers');
    ui.kmerInput.rows = 2;
    ui.kmerInput.spellcheck = false;
    kmerLabel.appendChild(ui.kmerInput);
    kmerRow.appendChild(kmerLabel);
    controls.appendChild(kmerRow);
    ui.textRow = textRow;
    ui.kmerRow = kmerRow;

    var buildRow = htmlElement('div', 'dbg-row');
    ui.buildButton = button('Build graph');
    ui.bookButton = button('Book example');
    buildRow.appendChild(ui.buildButton);
    buildRow.appendChild(ui.bookButton);
    buildRow.appendChild(htmlElement('span', 'dbg-note', 'Up to ' + MAX_KMERS + ' k-mers, k from ' + MIN_K + ' to ' + MAX_K + '.'));
    controls.appendChild(buildRow);

    ui.error = htmlElement('p', 'dbg-error');
    ui.error.setAttribute('role', 'alert');
    controls.appendChild(ui.error);
    return controls;
  }

  function radioOption(group, name, value, text, checked) {
    var label = htmlElement('label', 'dbg-radio');
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + text));
    group.appendChild(label);
    return input;
  }

  function button(text) {
    var element = htmlElement('button', 'btn btn-small', text);
    element.type = 'button';
    return element;
  }

  function buildStageList(ui) {
    var list = htmlElement('ol', 'dbg-stages');
    list.setAttribute('aria-label', 'Stages');
    ui.stageItems = [];
    for (var i = 0; i < 4; i++) {
      var item = htmlElement('li', 'dbg-stage');
      list.appendChild(item);
      ui.stageItems.push(item);
    }
    return list;
  }

  function buildStepButtons(ui) {
    var row = htmlElement('div', 'dbg-row dbg-steps');
    ui.backButton = button('Back');
    ui.stepButton = button('Step');
    ui.playButton = button('Play');
    ui.resetButton = button('Reset');
    ui.skipButton = button('Skip to de Bruijn graph');
    ui.anotherButton = button('Another Eulerian path');
    row.appendChild(ui.backButton);
    row.appendChild(ui.stepButton);
    row.appendChild(ui.playButton);
    row.appendChild(ui.resetButton);
    row.appendChild(ui.skipButton);
    row.appendChild(ui.anotherButton);
    return row;
  }

  function buildOverlapPanel(ui) {
    var panel = htmlElement('div', 'dbg-overlap');
    ui.overlapToggle = htmlElement('button', 'btn btn-small dbg-overlap-toggle', 'Compare with the overlap graph');
    ui.overlapToggle.type = 'button';
    ui.overlapToggle.setAttribute('aria-expanded', 'false');
    ui.overlapBody = htmlElement('div', 'dbg-overlap-body');
    ui.overlapBody.hidden = true;
    ui.overlapCaption = htmlElement('p', 'dbg-caption');
    ui.overlapScroll = htmlElement('div', 'dbg-scroll');
    ui.overlapSvg = svgElement('svg', { viewBox: '0 0 ' + VIEW_WIDTH + ' ' + VIEW_HEIGHT, role: 'img', 'class': 'dbg-svg' });
    ui.overlapScroll.appendChild(ui.overlapSvg);
    ui.overlapBody.appendChild(ui.overlapCaption);
    ui.overlapBody.appendChild(ui.overlapScroll);
    ui.overlapToggle.setAttribute('aria-controls', ui.uid + '-overlap');
    ui.overlapBody.id = ui.uid + '-overlap';
    panel.appendChild(ui.overlapToggle);
    panel.appendChild(ui.overlapBody);
    return panel;
  }

  function buildInterface(root, uid) {
    var ui = { root: root, uid: uid };
    var body = htmlElement('div', 'dbg-body');
    body.appendChild(buildControls(ui));
    body.appendChild(buildStageList(ui));
    ui.scroll = htmlElement('div', 'dbg-scroll');
    ui.svg = svgElement('svg', { viewBox: '0 0 ' + VIEW_WIDTH + ' ' + VIEW_HEIGHT, role: 'img', 'class': 'dbg-svg' });
    ui.scroll.appendChild(ui.svg);
    body.appendChild(ui.scroll);
    body.appendChild(buildStepButtons(ui));
    ui.status = htmlElement('p', 'dbg-status');
    ui.status.setAttribute('aria-live', 'polite');
    body.appendChild(ui.status);
    ui.spelled = htmlElement('p', 'dbg-spelled');
    body.appendChild(ui.spelled);
    var adjacencyBox = htmlElement('div', 'dbg-adjacency');
    ui.adjacencyTitle = htmlElement('p', 'dbg-caption');
    ui.adjacency = htmlElement('pre', 'dbg-pre');
    adjacencyBox.appendChild(ui.adjacencyTitle);
    adjacencyBox.appendChild(ui.adjacency);
    body.appendChild(adjacencyBox);
    body.appendChild(buildOverlapPanel(ui));
    var foot = root.querySelector('.widget-foot');
    if (foot) {
      root.insertBefore(body, foot);
    } else {
      root.appendChild(body);
    }
    return ui;
  }

  /* ---- rendering ---- */

  function drawEdges(layer, edges, positions, halfWidths, edgeClasses, badges) {
    var geometries = edgeGeometries(edges, positions, halfWidths);
    var labelLayer = svgElement('g', { 'class': 'dbg-edge-labels' });
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      var geometry = geometries.get(edge.id);
      var extra = edgeClasses ? (edgeClasses.get(edge.id) || '') : '';
      var group = svgElement('g', { 'class': 'dbg-edge ' + extra });
      group.appendChild(svgElement('path', { d: geometry.d, 'class': 'dbg-edge-line' }));
      group.appendChild(svgElement('polygon', { points: geometry.arrow, 'class': 'dbg-edge-arrow' }));
      layer.appendChild(group);
      if (edge.label) {
        var text = svgElement('text', {
          x: geometry.labelX.toFixed(1), y: (geometry.labelY + 4).toFixed(1),
          'class': 'dbg-edge-label ' + extra, 'text-anchor': 'middle'
        });
        appendColoredSvgText(text, edge.label);
        labelLayer.appendChild(text);
      }
      if (badges && badges.has(edge.id)) {
        var badgeX = geometry.badgeX;
        var badgeY = geometry.badgeY;
        labelLayer.appendChild(svgElement('circle', { cx: badgeX.toFixed(1), cy: badgeY.toFixed(1), r: 8, 'class': 'dbg-badge' }));
        var badgeText = svgElement('text', { x: badgeX.toFixed(1), y: (badgeY + 3.5).toFixed(1), 'class': 'dbg-badge-text', 'text-anchor': 'middle' });
        badgeText.textContent = String(badges.get(edge.id));
        labelLayer.appendChild(badgeText);
      }
    }
    layer.appendChild(labelLayer);
  }

  function drawNodes(layer, nodes, positions, halfWidths, nodeClasses) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var point = positions.get(node.id);
      var extra = nodeClasses ? (nodeClasses.get(node.id) || '') : '';
      var group = svgElement('g', { 'class': 'dbg-node ' + extra });
      group.appendChild(svgElement('ellipse', {
        cx: point.x.toFixed(1), cy: point.y.toFixed(1), rx: halfWidths.get(node.id).toFixed(1), ry: NODE_HALF_HEIGHT
      }));
      var text = svgElement('text', { x: point.x.toFixed(1), y: (point.y + 4.5).toFixed(1), 'text-anchor': 'middle', 'class': 'dbg-node-label' });
      appendColoredSvgText(text, node.label);
      group.appendChild(text);
      layer.appendChild(group);
    }
  }

  /* The drawing is VIEW_WIDTH x VIEW_HEIGHT, grown if a loop sticks out. */
  function sceneViewBox(scene) {
    var box = { left: 0, top: 0, right: VIEW_WIDTH, bottom: VIEW_HEIGHT };
    var geometries = edgeGeometries(scene.edges, scene.positions, scene.halfWidths);
    geometries.forEach(function includeLoop(geometry) {
      if (!geometry.extent) {
        return;
      }
      for (var i = 0; i < geometry.extent.length; i++) {
        box.left = Math.min(box.left, geometry.extent[i].x - 16);
        box.right = Math.max(box.right, geometry.extent[i].x + 16);
        box.top = Math.min(box.top, geometry.extent[i].y - 16);
        box.bottom = Math.max(box.bottom, geometry.extent[i].y + 16);
      }
    });
    return box;
  }

  function renderScene(svg, scene) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    var box = sceneViewBox(scene);
    var boxWidth = box.right - box.left;
    var boxHeight = box.bottom - box.top;
    svg.setAttribute('viewBox', box.left.toFixed(0) + ' ' + box.top.toFixed(0) + ' ' + boxWidth.toFixed(0) + ' ' + boxHeight.toFixed(0));
    svg.appendChild(svgElement('rect', { x: box.left, y: box.top, width: boxWidth, height: boxHeight, 'class': 'dbg-backdrop' }));
    var edgeLayer = svgElement('g', {});
    var nodeLayer = svgElement('g', {});
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    drawEdges(edgeLayer, scene.edges, scene.positions, scene.halfWidths, scene.edgeClasses, scene.badges);
    drawNodes(nodeLayer, scene.nodes, scene.positions, scene.halfWidths, scene.nodeClasses);
  }

  function interpolatePositions(from, to, fraction) {
    var result = new Map();
    to.forEach(function blend(target, id) {
      var origin = from.get(id) || target;
      result.set(id, { x: origin.x + (target.x - origin.x) * fraction, y: origin.y + (target.y - origin.y) * fraction });
    });
    return result;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /* ---- widget state machine ---- */

  function totalSteps(state) {
    var glueSteps = state.model.glueOrder.length;
    var walkSteps = state.walk && state.walk.ok ? state.walk.edgeOrder.length : 0;
    return glueSteps + walkSteps;
  }

  function currentStageIndex(state) {
    return Math.min(state.step, state.model.glueOrder.length);
  }

  function walkProgress(state) {
    return Math.max(0, state.step - state.model.glueOrder.length);
  }

  function walkDecorations(state, progress) {
    var edgeClasses = new Map();
    var badges = new Map();
    var nodeClasses = new Map();
    if (!state.walk || !state.walk.ok || progress === 0) {
      return { edgeClasses: edgeClasses, badges: badges, nodeClasses: nodeClasses };
    }
    var graph = ensureStage(state.model, state.model.glueOrder.length).graph;
    state.walk.edgeOrder.forEach(function markEdge(edgeIndex, position) {
      var edgeId = graph.edges[edgeIndex].id;
      if (position < progress) {
        edgeClasses.set(edgeId, position === progress - 1 ? 'is-current' : 'is-used');
        badges.set(edgeId, position + 1);
      }
    });
    nodeClasses.set(state.walk.nodeOrder[0], 'is-start');
    nodeClasses.set(state.walk.nodeOrder[progress], 'is-here');
    return { edgeClasses: edgeClasses, badges: badges, nodeClasses: nodeClasses };
  }

  function sceneForStage(state, stageIndex, positions) {
    var stage = ensureStage(state.model, stageIndex);
    var decorations = stageIndex === state.model.glueOrder.length ?
      walkDecorations(state, walkProgress(state)) :
      { edgeClasses: null, badges: null, nodeClasses: null };
    return {
      nodes: stage.graph.nodes,
      edges: stage.graph.edges,
      positions: positions || stage.positions,
      halfWidths: stage.halfWidths,
      edgeClasses: decorations.edgeClasses,
      badges: decorations.badges,
      nodeClasses: decorations.nodeClasses
    };
  }

  function stopAnimation(state) {
    if (state.animationFrame) {
      window.cancelAnimationFrame(state.animationFrame);
      state.animationFrame = 0;
    }
  }

  function runTween(state, duration, drawFrame, onDone) {
    stopAnimation(state);
    var startTime = null;
    function frame(timestamp) {
      if (startTime === null) {
        startTime = timestamp;
      }
      var fraction = Math.min(1, (timestamp - startTime) / duration);
      drawFrame(easeInOut(fraction));
      if (fraction < 1) {
        state.animationFrame = window.requestAnimationFrame(frame);
      } else {
        state.animationFrame = 0;
        onDone();
      }
    }
    state.animationFrame = window.requestAnimationFrame(frame);
  }

  /* Glue animation: copies slide together, then the glued graph relaxes. */
  function animateGlue(state, stageIndex) {
    var previous = ensureStage(state.model, stageIndex - 1);
    var next = ensureStage(state.model, stageIndex);
    var label = state.model.glueOrder[stageIndex - 1];
    var meeting = new Map();
    previous.positions.forEach(function copyPosition(point, id) {
      meeting.set(id, point);
    });
    var gluedId = 'g:' + label;
    var target = next.start.get(gluedId);
    for (var i = 0; i < previous.graph.nodes.length; i++) {
      var node = previous.graph.nodes[i];
      if (node.label === label) {
        meeting.set(node.id, target);
      }
    }
    runTween(state, 650, function drawSlide(fraction) {
      renderScene(state.ui.svg, sceneForStage(state, stageIndex - 1, interpolatePositions(previous.positions, meeting, fraction)));
    }, function afterSlide() {
      runTween(state, 450, function drawRelax(fraction) {
        renderScene(state.ui.svg, sceneForStage(state, stageIndex, interpolatePositions(next.start, next.positions, fraction)));
      }, function afterRelax() {
        renderScene(state.ui.svg, sceneForStage(state, stageIndex));
      });
    });
  }

  function describeGlue(state, stageIndex) {
    var label = state.model.glueOrder[stageIndex - 1];
    var copies = 0;
    var labels = state.model.base.nodeLabels;
    for (var i = 0; i < labels.length; i++) {
      if (labels[i] === label) {
        copies += 1;
      }
    }
    var graph = ensureStage(state.model, stageIndex).graph;
    var loops = [];
    for (var j = 0; j < graph.edges.length; j++) {
      var edge = graph.edges[j];
      if (edge.from === 'g:' + label && edge.to === 'g:' + label) {
        loops.push(edge.label);
      }
    }
    var sentence = 'Glue ' + label + ' (' + stageIndex + ' of ' + state.model.glueOrder.length + '): the ' +
      numberWord(copies) + ' nodes labeled ' + label + ' become one node. The graph now has ' +
      plural(graph.nodes.length, 'node', 'nodes') + ' and ' + plural(graph.edges.length, 'edge', 'edges') + '.';
    if (loops.length > 0) {
      sentence += ' Edge ' + loops.join(', ') + ' now starts and ends at ' + label + ', so it becomes a loop.';
    }
    return sentence;
  }

  function parallelEdgeSummary(graph) {
    var counts = new Map();
    var labels = new Map();
    for (var i = 0; i < graph.nodes.length; i++) {
      labels.set(graph.nodes[i].id, graph.nodes[i].label);
    }
    for (var j = 0; j < graph.edges.length; j++) {
      var key = labels.get(graph.edges[j].from) + ' to ' + labels.get(graph.edges[j].to);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    var notes = [];
    counts.forEach(function noteParallel(count, key) {
      if (count > 1) {
        notes.push(numberWord(count) + ' edges from ' + key);
      }
    });
    return notes;
  }

  function describeWalkFailure(walk, graph) {
    if (walk.reason === 'disconnected') {
      return 'No Eulerian path: the degrees are fine, but the graph falls into pieces that no single walk can reach.';
    }
    if (walk.reason !== 'unbalanced') {
      return walk.reason;
    }
    var labels = new Map();
    for (var i = 0; i < graph.nodes.length; i++) {
      labels.set(graph.nodes[i].id, graph.nodes[i].label);
    }
    var details = [];
    walk.endpoints.degrees.forEach(function describeNode(degrees, id) {
      if (degrees.indegree !== degrees.outdegree) {
        details.push(labels.get(id) + ' (in ' + degrees.indegree + ', out ' + degrees.outdegree + ')');
      }
    });
    return 'No Eulerian path: a path can have at most one node with one extra outgoing edge and one with one extra incoming edge, ' +
      'and every other node must be balanced. Unbalanced here: ' + details.join(', ') + '.';
  }

  function describeFinal(state) {
    var names = graphNames(state.model);
    var graph = ensureStage(state.model, state.model.glueOrder.length).graph;
    var sentence = 'This is ' + names.final + ': ' + plural(graph.nodes.length, 'node', 'nodes') + ' and ' +
      plural(graph.edges.length, 'edge', 'edges') + ', the same edges as before gluing.';
    var parallel = parallelEdgeSummary(graph);
    if (parallel.length > 0) {
      sentence += ' Repeats show up as parallel edges: ' + parallel.join('; ') + '.';
    }
    if (state.walk.ok) {
      sentence += ' Step to walk an Eulerian path, which visits every edge exactly once.';
    } else {
      sentence += ' ' + describeWalkFailure(state.walk, graph);
    }
    return sentence;
  }

  function describeWalkStep(state, progress) {
    var walk = state.walk;
    var edge = ensureStage(state.model, state.model.glueOrder.length).graph.edges[walk.edgeOrder[progress - 1]];
    var sentence = 'Edge ' + progress + ' of ' + walk.edgeOrder.length + ': ' + edge.label + ', from ' +
      walk.labels[progress - 1] + ' to ' + walk.labels[progress] + '.';
    if (progress === walk.edgeOrder.length) {
      sentence += ' Every edge is used once, so this is an Eulerian ' + (walk.isCycle ? 'cycle' : 'path') + '. ';
      if (state.model.mode === 'text' && walk.spelled === state.model.text) {
        sentence += 'It spells Text.';
      } else if (state.model.mode === 'text') {
        sentence += 'It spells a different string than Text, with exactly the same ' + state.model.k + '-mer composition.';
      } else {
        sentence += 'It spells a string whose ' + state.model.k + '-mer composition is Patterns.';
      }
    }
    return sentence;
  }

  function describeStep(state) {
    var names = graphNames(state.model);
    var glueCount = state.model.glueOrder.length;
    if (state.step === 0 && glueCount > 0) {
      var graph = ensureStage(state.model, 0).graph;
      if (state.model.mode === 'text') {
        return names.base + ': ' + plural(graph.nodes.length, 'node', 'nodes') + ' and ' + plural(graph.edges.length, 'edge', 'edges') +
          '. The i-th edge is the i-th ' + state.model.k + '-mer of Text; each node is labeled by the (k - 1)-mer that the edges on either side share. Step to glue identically labeled nodes.';
      }
      return names.base + ': ' + plural(graph.edges.length, 'isolated edge', 'isolated edges') + ', one per k-mer, from its prefix to its suffix (' +
        plural(graph.nodes.length, 'node', 'nodes') + '). Step to glue identically labeled nodes.';
    }
    if (state.step > 0 && state.step < glueCount) {
      return describeGlue(state, state.step);
    }
    if (state.step === glueCount) {
      var prefix = glueCount > 0 ? describeGlue(state, glueCount) + ' ' : 'No two nodes share a label, so there is nothing to glue. ';
      return prefix + describeFinal(state);
    }
    return describeWalkStep(state, walkProgress(state));
  }

  function renderStageList(state) {
    var names = graphNames(state.model);
    var glueCount = state.model.glueOrder.length;
    var texts = [names.base, 'Glue nodes', names.final, 'Eulerian path'];
    var active;
    if (state.step === 0 && glueCount > 0) {
      active = 0;
    } else if (state.step < glueCount) {
      active = 1;
    } else if (state.step === glueCount) {
      active = 2;
    } else {
      active = 3;
    }
    for (var i = 0; i < 4; i++) {
      state.ui.stageItems[i].innerHTML = texts[i];
      state.ui.stageItems[i].classList.toggle('is-active', i === active);
      if (i === active) {
        state.ui.stageItems[i].setAttribute('aria-current', 'step');
      } else {
        state.ui.stageItems[i].removeAttribute('aria-current');
      }
    }
  }

  function renderSpelled(state) {
    var ui = state.ui;
    while (ui.spelled.firstChild) {
      ui.spelled.removeChild(ui.spelled.firstChild);
    }
    var progress = walkProgress(state);
    if (!state.walk || !state.walk.ok || progress === 0) {
      ui.spelled.hidden = true;
      return;
    }
    ui.spelled.hidden = false;
    ui.spelled.appendChild(htmlElement('span', 'dbg-field-name', 'Spelled so far '));
    var samp = htmlElement('samp', 'dbg-dna');
    samp.appendChild(coloredHtml(spellPath(state.walk.labels.slice(0, progress + 1))));
    ui.spelled.appendChild(samp);
  }

  function renderAdjacency(state) {
    var names = graphNames(state.model);
    state.ui.adjacencyTitle.innerHTML = 'Adjacency list of ' + names.final;
    state.ui.adjacency.textContent = formatAdjacency(deBruijnFromKmers(state.model.patterns)).join('\n');
  }

  function renderButtons(state) {
    var total = totalSteps(state);
    var ui = state.ui;
    ui.backButton.disabled = state.step === 0;
    ui.stepButton.disabled = state.step >= total;
    ui.playButton.disabled = state.step >= total && !state.playing;
    ui.playButton.textContent = state.playing ? 'Pause' : 'Play';
    ui.skipButton.disabled = state.step === state.model.glueOrder.length;
    ui.anotherButton.disabled = !state.walk.ok;
  }

  function svgSummary(state) {
    var graph = ensureStage(state.model, currentStageIndex(state)).graph;
    return 'Graph with ' + plural(graph.nodes.length, 'node', 'nodes') + ' and ' + plural(graph.edges.length, 'edge', 'edges') +
      '. Nodes: ' + graph.nodes.map(function nodeLabel(node) { return node.label; }).join(', ') + '.';
  }

  function render(state, animate) {
    var stageIndex = currentStageIndex(state);
    var gluedJustNow = animate && state.step >= 1 && state.step <= state.model.glueOrder.length;
    if (gluedJustNow && !prefersReducedMotion()) {
      animateGlue(state, stageIndex);
    } else {
      stopAnimation(state);
      renderScene(state.ui.svg, sceneForStage(state, stageIndex));
    }
    state.ui.svg.setAttribute('aria-label', svgSummary(state));
    state.ui.status.innerHTML = describeStep(state);
    renderStageList(state);
    renderSpelled(state);
    renderButtons(state);
  }

  function renderOverlap(state) {
    var ui = state.ui;
    if (ui.overlapBody.hidden) {
      return;
    }
    var patterns = state.model.patterns;
    var edges = overlapGraph(patterns);
    var order = patterns.map(function index(pattern, i) { return i; });
    order.sort(function byPattern(a, b) { return compareStrings(patterns[a], patterns[b]) || a - b; });
    var circle = circleLayout(patterns.length);
    var positions = new Map();
    var halfWidths = new Map();
    var nodes = [];
    for (var i = 0; i < order.length; i++) {
      var id = 'o' + order[i];
      positions.set(id, circle[i]);
      halfWidths.set(id, nodeHalfWidth(patterns[order[i]]));
      nodes.push({ id: id, label: patterns[order[i]] });
    }
    var sceneEdges = [];
    var edgeClasses = new Map();
    for (var j = 0; j < edges.length; j++) {
      var edgeId = 'e' + j;
      sceneEdges.push({ id: edgeId, from: 'o' + edges[j].from, to: 'o' + edges[j].to, label: '' });
      if (state.model.mode === 'text' && edges[j].to === edges[j].from + 1) {
        edgeClasses.set(edgeId, 'is-genome');
      }
    }
    renderScene(ui.overlapSvg, {
      nodes: nodes, edges: sceneEdges, positions: positions, halfWidths: halfWidths,
      edgeClasses: edgeClasses, badges: null, nodeClasses: null
    });
    var deBruijn = ensureStage(state.model, state.model.glueOrder.length).graph;
    var caption = '<em>Overlap</em>(<em>Patterns</em>) puts each k-mer on a node, in lexicographic order around the circle: ' +
      plural(nodes.length, 'node', 'nodes') + ' and ' + plural(edges.length, 'edge', 'edges') +
      ', and reconstructing the string means finding a Hamiltonian path (every node once). The de Bruijn graph above has ' +
      plural(deBruijn.nodes.length, 'node', 'nodes') + ' and ' + plural(deBruijn.edges.length, 'edge', 'edges') +
      ', and needs an Eulerian path (every edge once).';
    if (state.model.mode === 'text') {
      caption += ' The highlighted edges are the path that spells Text.';
    }
    ui.overlapCaption.innerHTML = caption;
    ui.overlapSvg.setAttribute('aria-label', 'Overlap graph with ' + plural(nodes.length, 'node', 'nodes') + ' and ' + plural(edges.length, 'edge', 'edges') + '.');
  }

  function stopPlaying(state) {
    if (state.playTimer) {
      window.clearInterval(state.playTimer);
      state.playTimer = 0;
    }
    state.playing = false;
  }

  function stepForward(state) {
    if (state.step >= totalSteps(state)) {
      stopPlaying(state);
      render(state, false);
      return;
    }
    state.step += 1;
    render(state, true);
    if (state.step >= totalSteps(state)) {
      stopPlaying(state);
      renderButtons(state);
    }
  }

  function stepBack(state) {
    stopPlaying(state);
    if (state.step > 0) {
      state.step -= 1;
    }
    render(state, false);
  }

  function togglePlay(state) {
    if (state.playing) {
      stopPlaying(state);
      renderButtons(state);
      return;
    }
    if (state.step >= totalSteps(state)) {
      state.step = 0;
      render(state, false);
    }
    state.playing = true;
    stepForward(state);
    if (state.playing) {
      state.playTimer = window.setInterval(function playTick() { stepForward(state); }, STEP_INTERVAL_MS);
    }
    renderButtons(state);
  }

  function loadModel(state, input) {
    stopPlaying(state);
    stopAnimation(state);
    state.model = buildModel(input);
    state.seed = 0;
    state.walk = eulerianWalk(state.model, state.seed);
    state.step = 0;
    renderAdjacency(state);
    render(state, false);
    renderOverlap(state);
  }

  function readInput(state) {
    var ui = state.ui;
    if (ui.modeText.checked) {
      var genome = validateGenomeInput(ui.textInput.value, ui.kInput.value);
      if (!genome.ok) {
        return genome;
      }
      return { ok: true, mode: 'text', text: genome.text, k: genome.k };
    }
    var kmers = validateKmerInput(ui.kmerInput.value);
    if (!kmers.ok) {
      return kmers;
    }
    return { ok: true, mode: 'kmers', patterns: kmers.patterns, k: kmers.k };
  }

  function buildFromInput(state) {
    var input = readInput(state);
    if (!input.ok) {
      state.ui.error.textContent = input.message;
      return;
    }
    state.ui.error.textContent = '';
    loadModel(state, input);
  }

  function sortedComposition(text, k) {
    return kmerComposition(text, k).sort(compareStrings).join(' ');
  }

  /* Switching to k-mers fills in the (sorted) composition of the current Text. */
  function switchMode(state) {
    var ui = state.ui;
    var toKmers = ui.modeKmers.checked;
    ui.textRow.hidden = toKmers;
    ui.kmerRow.hidden = !toKmers;
    if (toKmers && ui.kmerInput.value.trim() === '') {
      var genome = validateGenomeInput(ui.textInput.value, ui.kInput.value);
      var source = genome.ok ? genome : { text: BOOK_GENOME, k: BOOK_K };
      ui.kmerInput.value = sortedComposition(source.text, source.k);
    }
    buildFromInput(state);
  }

  function loadBookExample(state) {
    var ui = state.ui;
    ui.textInput.value = BOOK_GENOME;
    ui.kInput.value = String(BOOK_K);
    ui.kmerInput.value = sortedComposition(BOOK_GENOME, BOOK_K);
    buildFromInput(state);
  }

  function anotherPath(state) {
    stopPlaying(state);
    state.seed += 1;
    state.walk = eulerianWalk(state.model, state.seed);
    state.step = state.model.glueOrder.length + state.walk.edgeOrder.length;
    render(state, false);
    state.ui.status.innerHTML = 'Eulerian path found with random choices (seed ' + state.seed + '). ' +
      describeWalkStep(state, state.walk.edgeOrder.length) + ' Press Back or Reset to replay it edge by edge.';
  }

  function resetSteps(state) {
    stopPlaying(state);
    state.step = 0;
    render(state, false);
  }

  function skipToGraph(state) {
    stopPlaying(state);
    state.step = state.model.glueOrder.length;
    render(state, false);
  }

  function toggleOverlap(state) {
    var ui = state.ui;
    ui.overlapBody.hidden = !ui.overlapBody.hidden;
    ui.overlapToggle.setAttribute('aria-expanded', String(!ui.overlapBody.hidden));
    ui.overlapToggle.textContent = ui.overlapBody.hidden ? 'Compare with the overlap graph' : 'Hide the overlap graph';
    renderOverlap(state);
  }

  function wireEvents(state) {
    var ui = state.ui;
    ui.buildButton.addEventListener('click', function onBuild() { buildFromInput(state); });
    ui.bookButton.addEventListener('click', function onBook() { loadBookExample(state); });
    ui.modeText.addEventListener('change', function onModeText() { switchMode(state); });
    ui.modeKmers.addEventListener('change', function onModeKmers() { switchMode(state); });
    ui.textInput.addEventListener('keydown', function onTextKey(event) {
      if (event.key === 'Enter') {
        buildFromInput(state);
      }
    });
    ui.kInput.addEventListener('keydown', function onKKey(event) {
      if (event.key === 'Enter') {
        buildFromInput(state);
      }
    });
    ui.stepButton.addEventListener('click', function onStep() { stopPlaying(state); stepForward(state); });
    ui.backButton.addEventListener('click', function onBack() { stepBack(state); });
    ui.playButton.addEventListener('click', function onPlay() { togglePlay(state); });
    ui.resetButton.addEventListener('click', function onReset() { resetSteps(state); });
    ui.skipButton.addEventListener('click', function onSkip() { skipToGraph(state); });
    ui.anotherButton.addEventListener('click', function onAnother() { anotherPath(state); });
    ui.overlapToggle.addEventListener('click', function onOverlap() { toggleOverlap(state); });
  }

  var instanceCounter = 0;

  function mountWidget(root) {
    if (root.getAttribute('data-widget-ready') === 'true') {
      return;
    }
    root.setAttribute('data-widget-ready', 'true');
    instanceCounter += 1;
    var state = {
      ui: buildInterface(root, 'dbg' + instanceCounter),
      model: null,
      walk: null,
      seed: 0,
      step: 0,
      playing: false,
      playTimer: 0,
      animationFrame: 0
    };
    state.ui.kmerInput.value = sortedComposition(BOOK_GENOME, BOOK_K);
    wireEvents(state);
    loadModel(state, { mode: 'text', text: BOOK_GENOME, k: BOOK_K });
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-widget="debruijn"]');
    for (var i = 0; i < roots.length; i++) {
      try {
        mountWidget(roots[i]);
      } catch (error) {
        roots[i].appendChild(htmlElement('p', 'dbg-error', 'This interactive could not start in your browser.'));
      }
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountAll);
    } else {
      mountAll();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      kmerComposition: kmerComposition,
      prefixOf: prefixOf,
      suffixOf: suffixOf,
      pathGraph: pathGraph,
      compositionGraph: compositionGraph,
      gluingOrder: gluingOrder,
      glueGraph: glueGraph,
      deBruijnFromKmers: deBruijnFromKmers,
      deBruijnFromText: deBruijnFromText,
      deBruijnGraphFromKmers: deBruijnGraphFromKmers,
      formatAdjacency: formatAdjacency,
      degreeTable: degreeTable,
      eulerianPathEndpoints: eulerianPathEndpoints,
      findEulerianPath: findEulerianPath,
      isEulerianPath: isEulerianPath,
      spellPath: spellPath,
      stringReconstruction: stringReconstruction,
      overlapGraph: overlapGraph,
      validateGenomeInput: validateGenomeInput,
      validateKmerInput: validateKmerInput,
      makeRng: makeRng,
      buildModel: buildModel,
      ensureStage: ensureStage,
      eulerianWalk: eulerianWalk,
      edgeGeometries: edgeGeometries,
      MAX_KMERS: MAX_KMERS
    };
  }
})();
