/* Eulerian cycle widget (Chapter 3, lessons 3.6 to 3.8).
 * Steps EulerianCycle(Graph), the algorithm from the constructive proof of
 * Euler's Theorem, with seeded random choices; plus a Seven Bridges of
 * Königsberg panel that checks the degree condition.
 * Vanilla ES2019, no dependencies. The algorithm core is pure and exported
 * for tests/widgets/euler.test.mjs. */
(function () {
  'use strict';

  var MAX_EDGES = 40;
  var MAX_NODES = 20;
  var MAX_LABEL_LENGTH = 4;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VIEW_WIDTH = 680;
  var VIEW_HEIGHT = 400;
  var VIEW_MARGIN = 40;
  var NODE_HALF_HEIGHT = 15;
  var STEP_INTERVAL_MS = 850;
  var ITERATION_COLORS = 6;
  var BA3F_SAMPLE = '0 -> 3\n1 -> 0\n2 -> 1,6\n3 -> 2\n4 -> 2\n5 -> 4\n6 -> 5,8\n7 -> 9\n8 -> 7\n9 -> 6';

  /* ------------------------------------------------------------------ */
  /* Algorithm core (pure functions)                                     */
  /* ------------------------------------------------------------------ */

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

  function randomIndex(rng, length) {
    return Math.min(length - 1, Math.floor(rng() * length));
  }

  function addNodeOnce(nodeIds, seen, id) {
    if (!seen.has(id)) {
      seen.add(id);
      nodeIds.push(id);
    }
  }

  function splitTargets(text) {
    var targets = [];
    var parts = text.split(/[\s,]+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].length > 0) {
        targets.push(parts[i]);
      }
    }
    return targets;
  }

  /* Accepts "2 -> 1,6" (Rosalind) or "2: 1 6"; one source node per line. */
  function parseAdjacencyList(text) {
    var nodeIds = [];
    var seen = new Set();
    var edges = [];
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.length === 0) {
        continue;
      }
      var arrowAt = line.indexOf('->');
      var colonAt = line.indexOf(':');
      var splitAt = arrowAt >= 0 ? arrowAt : colonAt;
      var separatorLength = arrowAt >= 0 ? 2 : 1;
      if (splitAt < 0) {
        return { ok: false, message: 'Line ' + (i + 1) + ' ("' + line + '") needs an arrow, as in 2 -> 1,6.' };
      }
      var source = line.slice(0, splitAt).trim();
      var targets = splitTargets(line.slice(splitAt + separatorLength));
      var labels = [source].concat(targets);
      for (var j = 0; j < labels.length; j++) {
        if (!/^[A-Za-z0-9_]+$/.test(labels[j])) {
          return { ok: false, message: 'Line ' + (i + 1) + ': node names may use only letters, digits and _ ("' + labels[j] + '" is not allowed).' };
        }
        if (labels[j].length > MAX_LABEL_LENGTH) {
          return { ok: false, message: 'Keep node names to ' + MAX_LABEL_LENGTH + ' characters ("' + labels[j] + '" is longer).' };
        }
      }
      if (targets.length === 0) {
        return { ok: false, message: 'Line ' + (i + 1) + ': node ' + source + ' has an arrow but no targets.' };
      }
      addNodeOnce(nodeIds, seen, source);
      for (var t = 0; t < targets.length; t++) {
        addNodeOnce(nodeIds, seen, targets[t]);
        edges.push({ from: source, to: targets[t] });
      }
    }
    if (edges.length === 0) {
      return { ok: false, message: 'Type an adjacency list with at least one edge, such as 0 -> 1.' };
    }
    if (edges.length > MAX_EDGES) {
      return { ok: false, message: 'That graph has ' + edges.length + ' edges; the widget draws at most ' + MAX_EDGES + '.' };
    }
    if (nodeIds.length > MAX_NODES) {
      return { ok: false, message: 'That graph has ' + nodeIds.length + ' nodes; the widget draws at most ' + MAX_NODES + '.' };
    }
    return { ok: true, graph: { nodeIds: nodeIds, edges: edges } };
  }

  function formatAdjacencyList(graph) {
    var targetsBySource = new Map();
    for (var i = 0; i < graph.edges.length; i++) {
      var edge = graph.edges[i];
      if (!targetsBySource.has(edge.from)) {
        targetsBySource.set(edge.from, []);
      }
      targetsBySource.get(edge.from).push(edge.to);
    }
    var lines = [];
    targetsBySource.forEach(function formatLine(targets, source) {
      lines.push(source + ' -> ' + targets.join(','));
    });
    return lines.join('\n');
  }

  function degreeTable(graph) {
    var table = new Map();
    for (var i = 0; i < graph.nodeIds.length; i++) {
      table.set(graph.nodeIds[i], { indegree: 0, outdegree: 0 });
    }
    for (var j = 0; j < graph.edges.length; j++) {
      table.get(graph.edges[j].from).outdegree += 1;
      table.get(graph.edges[j].to).indegree += 1;
    }
    return table;
  }

  function unbalancedNodes(graph) {
    var table = degreeTable(graph);
    var result = [];
    table.forEach(function checkNode(degrees, id) {
      if (degrees.indegree !== degrees.outdegree) {
        result.push({ id: id, indegree: degrees.indegree, outdegree: degrees.outdegree });
      }
    });
    return result;
  }

  function reachableFrom(start, graph, reverse) {
    var neighbors = new Map();
    for (var i = 0; i < graph.nodeIds.length; i++) {
      neighbors.set(graph.nodeIds[i], []);
    }
    for (var j = 0; j < graph.edges.length; j++) {
      var edge = graph.edges[j];
      if (reverse) {
        neighbors.get(edge.to).push(edge.from);
      } else {
        neighbors.get(edge.from).push(edge.to);
      }
    }
    var reached = new Set([start]);
    var queue = [start];
    while (queue.length > 0) {
      var current = queue.shift();
      var next = neighbors.get(current);
      for (var n = 0; n < next.length; n++) {
        if (!reached.has(next[n])) {
          reached.add(next[n]);
          queue.push(next[n]);
        }
      }
    }
    return reached;
  }

  /* Every node reaches every other node (forward and backward search). */
  function isStronglyConnected(graph) {
    if (graph.nodeIds.length === 0) {
      return false;
    }
    var start = graph.nodeIds[0];
    var forward = reachableFrom(start, graph, false);
    var backward = reachableFrom(start, graph, true);
    return forward.size === graph.nodeIds.length && backward.size === graph.nodeIds.length;
  }

  /* Euler's Theorem: balanced and strongly connected means Eulerian. */
  function eulerianCheck(graph) {
    var unbalanced = unbalancedNodes(graph);
    if (unbalanced.length > 0) {
      var details = unbalanced.map(function describe(node) {
        return node.id + ' (in ' + node.indegree + ', out ' + node.outdegree + ')';
      });
      return {
        ok: false,
        reason: 'unbalanced',
        unbalanced: unbalanced,
        message: 'This graph is not balanced, so it has no Eulerian cycle: every time Leo enters a node he must be able to leave by an unused edge. Unbalanced: ' +
          details.join(', ') + '.'
      };
    }
    if (!isStronglyConnected(graph)) {
      return {
        ok: false,
        reason: 'disconnected',
        message: 'This graph is balanced but not strongly connected: some node cannot be reached from another, so no single cycle can use every edge.'
      };
    }
    return { ok: true };
  }

  function outgoingEdgeLists(graph) {
    var lists = new Map();
    for (var i = 0; i < graph.nodeIds.length; i++) {
      lists.set(graph.nodeIds[i], []);
    }
    for (var j = 0; j < graph.edges.length; j++) {
      lists.get(graph.edges[j].from).push(j);
    }
    return lists;
  }

  function unusedOutEdges(node, lists, edgeIteration) {
    var unused = [];
    var list = lists.get(node);
    for (var i = 0; i < list.length; i++) {
      if (edgeIteration[list[i]] < 0) {
        unused.push(list[i]);
      }
    }
    return unused;
  }

  function cycleNodes(graph, cycleStart, cycleEdges) {
    var nodes = [cycleStart];
    for (var i = 0; i < cycleEdges.length; i++) {
      nodes.push(graph.edges[cycleEdges[i]].to);
    }
    return nodes;
  }

  function snapshot(trace, type, details) {
    var event = {
      type: type,
      cycleStart: trace.cycleStart,
      cycleEdges: trace.cycleEdges.slice(),
      edgeIteration: trace.edgeIteration.slice(),
      iteration: trace.iteration,
      usedCount: trace.cycleEdges.length
    };
    var keys = Object.keys(details || {});
    for (var i = 0; i < keys.length; i++) {
      event[keys[i]] = details[keys[i]];
    }
    trace.events.push(event);
  }

  /* Leo walks random unused edges from the end of Cycle until he is stuck. */
  function walkUntilStuck(graph, trace, lists, rng) {
    var current = cycleNodes(graph, trace.cycleStart, trace.cycleEdges).pop();
    var unused = unusedOutEdges(current, lists, trace.edgeIteration);
    while (unused.length > 0) {
      var edgeIndex = unused[randomIndex(rng, unused.length)];
      trace.edgeIteration[edgeIndex] = trace.iteration;
      trace.cycleEdges.push(edgeIndex);
      current = graph.edges[edgeIndex].to;
      snapshot(trace, 'walk', { edge: edgeIndex, node: current });
      unused = unusedOutEdges(current, lists, trace.edgeIteration);
    }
    snapshot(trace, 'stuck', { node: current });
  }

  /* Nodes of Cycle (in cycle order, no repeats) that still have unused edges. */
  function newStartCandidates(graph, trace, lists) {
    var nodes = cycleNodes(graph, trace.cycleStart, trace.cycleEdges);
    var seen = new Set();
    var candidates = [];
    for (var i = 0; i < nodes.length; i++) {
      if (!seen.has(nodes[i]) && unusedOutEdges(nodes[i], lists, trace.edgeIteration).length > 0) {
        candidates.push(nodes[i]);
      }
      seen.add(nodes[i]);
    }
    return candidates;
  }

  /* Cycle' = Cycle traversed starting (and ending) at newStart. */
  function rotateCycle(graph, cycleStart, cycleEdges, newStart) {
    var nodes = cycleNodes(graph, cycleStart, cycleEdges);
    var position = nodes.indexOf(newStart);
    return cycleEdges.slice(position).concat(cycleEdges.slice(0, position));
  }

  /* EulerianCycle(Graph), recorded step by step. Assumes an Eulerian graph. */
  function eulerianCycleTrace(graph, seed) {
    var rng = makeRng(seed);
    var lists = outgoingEdgeLists(graph);
    var edgeIteration = [];
    for (var i = 0; i < graph.edges.length; i++) {
      edgeIteration.push(-1);
    }
    var trace = {
      events: [],
      cycleStart: graph.edges[randomIndex(rng, graph.edges.length)].from,
      cycleEdges: [],
      edgeIteration: edgeIteration,
      iteration: 0
    };
    snapshot(trace, 'start', { node: trace.cycleStart });
    walkUntilStuck(graph, trace, lists, rng);
    while (trace.cycleEdges.length < graph.edges.length) {
      var candidates = newStartCandidates(graph, trace, lists);
      if (candidates.length === 0) {
        snapshot(trace, 'failed', {});
        return trace;
      }
      var newStart = candidates[randomIndex(rng, candidates.length)];
      snapshot(trace, 'select', { node: newStart, candidates: candidates });
      trace.cycleEdges = rotateCycle(graph, trace.cycleStart, trace.cycleEdges, newStart);
      trace.cycleStart = newStart;
      trace.iteration += 1;
      snapshot(trace, 'rotate', { node: newStart });
      walkUntilStuck(graph, trace, lists, rng);
    }
    snapshot(trace, 'done', { node: trace.cycleStart });
    trace.cycle = cycleNodes(graph, trace.cycleStart, trace.cycleEdges);
    return trace;
  }

  function eulerianCycle(graph, seed) {
    return eulerianCycleTrace(graph, seed).cycle;
  }

  function edgeKey(from, to) {
    return from + '\u0000' + to;
  }

  /* A closed walk that uses every edge (as a multiset) exactly once. */
  function isEulerianCycle(graph, nodes) {
    if (!nodes || nodes.length !== graph.edges.length + 1 || nodes[0] !== nodes[nodes.length - 1]) {
      return false;
    }
    var remaining = new Map();
    for (var i = 0; i < graph.edges.length; i++) {
      var key = edgeKey(graph.edges[i].from, graph.edges[i].to);
      remaining.set(key, (remaining.get(key) || 0) + 1);
    }
    for (var j = 0; j + 1 < nodes.length; j++) {
      var stepKey = edgeKey(nodes[j], nodes[j + 1]);
      var left = remaining.get(stepKey) || 0;
      if (left === 0) {
        return false;
      }
      remaining.set(stepKey, left - 1);
    }
    return true;
  }

  function shuffledRange(count, rng) {
    var items = [];
    for (var i = 0; i < count; i++) {
      items.push(i);
    }
    for (var j = items.length - 1; j > 0; j--) {
      var k = randomIndex(rng, j + 1);
      var swap = items[j];
      items[j] = items[k];
      items[k] = swap;
    }
    return items;
  }

  function addCycleEdges(edges, cycle) {
    for (var i = 0; i < cycle.length; i++) {
      edges.push({ from: String(cycle[i]), to: String(cycle[(i + 1) % cycle.length]) });
    }
  }

  /* Balanced and strongly connected by construction: one cycle through every
   * node, plus extra random cycles (every cycle keeps in = out everywhere). */
  function randomEulerianGraph(rng, nodeCount, extraCycles) {
    var nodeIds = [];
    for (var i = 0; i < nodeCount; i++) {
      nodeIds.push(String(i));
    }
    var edges = [];
    addCycleEdges(edges, shuffledRange(nodeCount, rng));
    for (var c = 0; c < extraCycles; c++) {
      var length = 2 + randomIndex(rng, Math.min(3, nodeCount - 1));
      addCycleEdges(edges, shuffledRange(nodeCount, rng).slice(0, length));
    }
    var order = shuffledRange(edges.length, rng);
    var shuffledEdges = order.map(function pick(index) { return edges[index]; });
    return { nodeIds: nodeIds, edges: shuffledEdges };
  }

  /* ---- Königsberg (undirected) ---- */

  function konigsbergGraph() {
    return {
      nodeIds: ['North', 'Kneiphof', 'Lomse', 'South'],
      names: {
        North: 'North bank',
        South: 'South bank',
        Kneiphof: 'Kneiphof (island)',
        Lomse: 'Lomse (island)'
      },
      edges: [
        { from: 'Kneiphof', to: 'North' },
        { from: 'Kneiphof', to: 'North' },
        { from: 'Kneiphof', to: 'South' },
        { from: 'Kneiphof', to: 'South' },
        { from: 'Kneiphof', to: 'Lomse' },
        { from: 'North', to: 'Lomse' },
        { from: 'South', to: 'Lomse' }
      ]
    };
  }

  function undirectedDegrees(graph) {
    var degrees = new Map();
    for (var i = 0; i < graph.nodeIds.length; i++) {
      degrees.set(graph.nodeIds[i], 0);
    }
    for (var j = 0; j < graph.edges.length; j++) {
      degrees.set(graph.edges[j].from, degrees.get(graph.edges[j].from) + 1);
      degrees.set(graph.edges[j].to, degrees.get(graph.edges[j].to) + 1);
    }
    return degrees;
  }

  /* Undirected analogue: a connected graph has an Eulerian cycle iff every degree
   * is even, and an Eulerian path iff zero or two degrees are odd. */
  function undirectedEulerVerdict(graph) {
    var degrees = undirectedDegrees(graph);
    var oddNodes = [];
    degrees.forEach(function collectOdd(degree, id) {
      if (degree % 2 === 1) {
        oddNodes.push(id);
      }
    });
    return {
      degrees: degrees,
      oddNodes: oddNodes,
      hasEulerianCycle: oddNodes.length === 0,
      hasEulerianPath: oddNodes.length === 0 || oddNodes.length === 2
    };
  }

  function bridgesAvailable(graph, current, usedBridges) {
    var available = [];
    for (var i = 0; i < graph.edges.length; i++) {
      var touches = graph.edges[i].from === current || graph.edges[i].to === current;
      if (touches && !usedBridges.has(i)) {
        available.push(i);
      }
    }
    return available;
  }

  function otherEnd(edge, node) {
    return edge.from === node ? edge.to : edge.from;
  }

  /* ------------------------------------------------------------------ */
  /* Layout and edge geometry (pure, deterministic)                      */
  /* ------------------------------------------------------------------ */

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function nodeHalfWidth(label) {
    return Math.max(NODE_HALF_HEIGHT + 2, label.length * 4.8 + 10);
  }

  function circleLayout(ids, reverse) {
    var radius = Math.min(VIEW_WIDTH, VIEW_HEIGHT) / 2 - VIEW_MARGIN - 10;
    var positions = new Map();
    for (var i = 0; i < ids.length; i++) {
      var angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
      var id = reverse ? ids[ids.length - 1 - i] : ids[i];
      positions.set(id, { x: VIEW_WIDTH / 2 + radius * 1.25 * Math.cos(angle), y: VIEW_HEIGHT / 2 + radius * Math.sin(angle) });
    }
    return positions;
  }

  function springPairsFromEdges(edges) {
    var seen = new Set();
    var pairs = [];
    for (var i = 0; i < edges.length; i++) {
      var a = edges[i].from;
      var b = edges[i].to;
      var key = a < b ? a + '|' + b : b + '|' + a;
      if (a !== b && !seen.has(key)) {
        seen.add(key);
        pairs.push([a, b]);
      }
    }
    return pairs;
  }

  function clampToView(point) {
    point.x = clamp(point.x, VIEW_MARGIN + 20, VIEW_WIDTH - VIEW_MARGIN - 20);
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
        displacement.get(ids[i]).x += (dx / distance) * force;
        displacement.get(ids[i]).y += (dy / distance) * force;
        displacement.get(ids[j]).x -= (dx / distance) * force;
        displacement.get(ids[j]).y -= (dy / distance) * force;
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
      displacement.get(pairs[i][0]).x -= (dx / distance) * force;
      displacement.get(pairs[i][0]).y -= (dy / distance) * force;
      displacement.get(pairs[i][1]).x += (dx / distance) * force;
      displacement.get(pairs[i][1]).y += (dy / distance) * force;
    }
  }

  /* Fruchterman-Reingold with linear cooling; deterministic. */
  function forceLayout(ids, edges, initialPositions) {
    var positions = new Map();
    for (var i = 0; i < ids.length; i++) {
      var start = initialPositions.get(ids[i]);
      positions.set(ids[i], { x: start.x, y: start.y });
    }
    var pairs = springPairsFromEdges(edges);
    var area = (VIEW_WIDTH - 2 * VIEW_MARGIN) * (VIEW_HEIGHT - 2 * VIEW_MARGIN);
    var ideal = clamp(0.8 * Math.sqrt(area / Math.max(1, ids.length)), 70, 140);
    var iterations = 320;
    for (var iteration = 0; iteration < iterations; iteration++) {
      var temperature = 60 * (1 - iteration / iterations);
      var displacement = new Map();
      for (var d = 0; d < ids.length; d++) {
        displacement.set(ids[d], { x: 0, y: 0 });
      }
      addRepulsion(ids, positions, displacement, ideal);
      addSprings(pairs, positions, displacement, ideal);
      for (var n = 0; n < ids.length; n++) {
        var point = positions.get(ids[n]);
        var move = displacement.get(ids[n]);
        move.x += (VIEW_WIDTH / 2 - point.x) * 0.02;
        move.y += (VIEW_HEIGHT / 2 - point.y) * 0.035;
        var length = Math.sqrt(move.x * move.x + move.y * move.y);
        if (length > 0) {
          var step = Math.min(length, temperature);
          point.x += (move.x / length) * step;
          point.y += (move.y / length) * step;
        }
        clampToView(point);
      }
    }
    return positions;
  }

  function orientation(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }

  function segmentsCross(a, b, c, d) {
    return orientation(c, d, a) * orientation(c, d, b) < 0 && orientation(a, b, c) * orientation(a, b, d) < 0;
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

  function pairsShareNode(first, second) {
    return first[0] === second[0] || first[0] === second[1] || first[1] === second[0] || first[1] === second[1];
  }

  /* Lower is better: crossings plus nodes lying on edges they do not touch. */
  function layoutPenalty(ids, edges, positions) {
    var pairs = springPairsFromEdges(edges);
    var penalty = 0;
    for (var i = 0; i < pairs.length; i++) {
      for (var j = i + 1; j < pairs.length; j++) {
        if (!pairsShareNode(pairs[i], pairs[j]) && segmentsCross(positions.get(pairs[i][0]), positions.get(pairs[i][1]),
          positions.get(pairs[j][0]), positions.get(pairs[j][1]))) {
          penalty += 1;
        }
      }
      for (var n = 0; n < ids.length; n++) {
        var isEndpoint = ids[n] === pairs[i][0] || ids[n] === pairs[i][1];
        if (!isEndpoint && distanceToSegment(positions.get(ids[n]), positions.get(pairs[i][0]), positions.get(pairs[i][1])) < 26) {
          penalty += 3;
        }
      }
    }
    return penalty;
  }

  function jitteredCircle(ids, rng) {
    var order = shuffledRange(ids.length, rng).map(function pick(index) { return ids[index]; });
    return circleLayout(order, false);
  }

  /* Several deterministic starts; keep the layout with the lowest penalty. */
  function bestLayout(ids, edges) {
    var rng = makeRng(11);
    var starts = [circleLayout(ids, false), circleLayout(ids, true)];
    for (var attempt = 0; attempt < 6; attempt++) {
      starts.push(jitteredCircle(ids, rng));
    }
    var best = null;
    var bestPenalty = Infinity;
    for (var i = 0; i < starts.length; i++) {
      var candidate = forceLayout(ids, edges, starts[i]);
      var penalty = layoutPenalty(ids, edges, candidate);
      if (penalty < bestPenalty) {
        best = candidate;
        bestPenalty = penalty;
      }
    }
    return best;
  }

  function quadraticPoint(p0, p1, p2, t) {
    var u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
  }

  function quadraticTangent(p0, p1, p2, t) {
    return { x: 2 * ((1 - t) * (p1.x - p0.x) + t * (p2.x - p1.x)), y: 2 * ((1 - t) * (p1.y - p0.y) + t * (p2.y - p1.y)) };
  }

  function insideNode(point, center, halfWidth) {
    var dx = (point.x - center.x) / (halfWidth + 2);
    var dy = (point.y - center.y) / (NODE_HALF_HEIGHT + 2);
    return dx * dx + dy * dy < 1;
  }

  function boundaryParameter(curve, center, halfWidth, insideAt, outsideAt) {
    var inside = insideAt;
    var outside = outsideAt;
    if (insideNode(quadraticPoint(curve[0], curve[1], curve[2], outside), center, halfWidth)) {
      return outside;
    }
    for (var i = 0; i < 24; i++) {
      var middle = (inside + outside) / 2;
      if (insideNode(quadraticPoint(curve[0], curve[1], curve[2], middle), center, halfWidth)) {
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

  function roundCoordinate(value) {
    return value.toFixed(1);
  }

  function arrowheadPoints(tip, direction) {
    var unit = normalize(direction);
    var back = { x: tip.x - unit.x * 10, y: tip.y - unit.y * 10 };
    var side = { x: -unit.y * 5, y: unit.x * 5 };
    return [tip.x, tip.y, back.x + side.x, back.y + side.y, back.x - side.x, back.y - side.y].map(roundCoordinate).join(' ');
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
    return {
      d: 'M' + roundCoordinate(start.x) + ',' + roundCoordinate(start.y) + ' Q' + roundCoordinate(subControl.x) + ',' +
        roundCoordinate(subControl.y) + ' ' + roundCoordinate(end.x) + ',' + roundCoordinate(end.y),
      arrow: arrowheadPoints(end, quadraticTangent(from, control, to, t1)),
      labelX: label.x,
      labelY: label.y
    };
  }

  function loopGeometry(center, halfWidth, angle, loopIndex) {
    var spread = 0.45;
    var reach = 36 + 16 * loopIndex;
    var start = { x: center.x + halfWidth * Math.cos(angle - spread), y: center.y + NODE_HALF_HEIGHT * Math.sin(angle - spread) };
    var end = { x: center.x + halfWidth * Math.cos(angle + spread), y: center.y + NODE_HALF_HEIGHT * Math.sin(angle + spread) };
    var radius = halfWidth + reach;
    var control1 = { x: center.x + radius * Math.cos(angle - spread - 0.35), y: center.y + radius * Math.sin(angle - spread - 0.35) };
    var control2 = { x: center.x + radius * Math.cos(angle + spread + 0.35), y: center.y + radius * Math.sin(angle + spread + 0.35) };
    return {
      d: 'M' + roundCoordinate(start.x) + ',' + roundCoordinate(start.y) + ' C' + roundCoordinate(control1.x) + ',' +
        roundCoordinate(control1.y) + ' ' + roundCoordinate(control2.x) + ',' + roundCoordinate(control2.y) + ' ' +
        roundCoordinate(end.x) + ',' + roundCoordinate(end.y),
      arrow: arrowheadPoints(end, { x: end.x - control2.x, y: end.y - control2.y }),
      labelX: (control1.x + control2.x) / 2,
      labelY: (control1.y + control2.y) / 2
    };
  }

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

  /* Geometry per edge index; parallel and antiparallel edges fan out. */
  function edgeGeometries(edges, positions, halfWidths) {
    var pairGroups = new Map();
    var loopGroups = new Map();
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      var isLoop = edge.from === edge.to;
      var key = isLoop ? edge.from : (edge.from < edge.to ? edge.from + '|' + edge.to : edge.to + '|' + edge.from);
      var groups = isLoop ? loopGroups : pairGroups;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(i);
    }
    var geometries = [];
    pairGroups.forEach(function layOutPair(group) {
      var first = edges[group[0]];
      var low = first.from < first.to ? first.from : first.to;
      var high = first.from < first.to ? first.to : first.from;
      var direction = normalize({ x: positions.get(high).x - positions.get(low).x, y: positions.get(high).y - positions.get(low).y });
      var canonicalNormal = { x: -direction.y, y: direction.x };
      for (var g = 0; g < group.length; g++) {
        var current = edges[group[g]];
        var offset = (g - (group.length - 1) / 2) * 26;
        geometries[group[g]] = curvedEdgeGeometry(positions.get(current.from), positions.get(current.to),
          halfWidths.get(current.from), halfWidths.get(current.to), offset, canonicalNormal);
      }
    });
    loopGroups.forEach(function layOutLoops(group, nodeId) {
      var angle = loopAngle(nodeId, edges, positions);
      for (var g = 0; g < group.length; g++) {
        geometries[group[g]] = loopGeometry(positions.get(nodeId), halfWidths.get(nodeId), angle, g);
      }
    });
    return geometries;
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

  function button(text) {
    var element = htmlElement('button', 'btn btn-small', text);
    element.type = 'button';
    return element;
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function plural(count, singular, pluralForm) {
    return count + ' ' + (count === 1 ? singular : pluralForm);
  }

  function iterationClass(iteration) {
    return 'eul-it-' + (iteration % ITERATION_COLORS);
  }

  function cycleName(iteration) {
    return 'Cycle<sub>' + iteration + '</sub>';
  }

  function buildHierholzerSection(ui) {
    var section = htmlElement('div', 'eul-section');
    var inputLabel = htmlElement('label', 'eul-field');
    inputLabel.appendChild(htmlElement('span', 'eul-field-name', 'Graph (adjacency list, one node per line)'));
    ui.graphInput = htmlElement('textarea', 'eul-input');
    ui.graphInput.rows = 4;
    ui.graphInput.spellcheck = false;
    ui.graphInput.value = BA3F_SAMPLE;
    inputLabel.appendChild(ui.graphInput);
    section.appendChild(inputLabel);

    var loadRow = htmlElement('div', 'eul-row');
    ui.loadButton = button('Load graph');
    ui.sampleButton = button('Sample graph');
    ui.randomButton = button('Random graph');
    loadRow.appendChild(ui.loadButton);
    loadRow.appendChild(ui.sampleButton);
    loadRow.appendChild(ui.randomButton);
    loadRow.appendChild(htmlElement('span', 'eul-note', 'Up to ' + MAX_EDGES + ' edges and ' + MAX_NODES + ' nodes.'));
    section.appendChild(loadRow);
    ui.error = htmlElement('p', 'eul-error');
    ui.error.setAttribute('role', 'alert');
    section.appendChild(ui.error);

    ui.pseudocode = buildPseudocode(ui);
    section.appendChild(ui.pseudocode);

    ui.scroll = htmlElement('div', 'eul-scroll');
    ui.svg = svgElement('svg', { viewBox: '0 0 ' + VIEW_WIDTH + ' ' + VIEW_HEIGHT, role: 'img', 'class': 'eul-svg' });
    ui.scroll.appendChild(ui.svg);
    section.appendChild(ui.scroll);

    var stepRow = htmlElement('div', 'eul-row eul-steps');
    ui.backButton = button('Back');
    ui.stepButton = button('Step');
    ui.playButton = button('Play');
    ui.resetButton = button('Reset');
    ui.seedButton = button('New seed');
    stepRow.appendChild(ui.backButton);
    stepRow.appendChild(ui.stepButton);
    stepRow.appendChild(ui.playButton);
    stepRow.appendChild(ui.resetButton);
    stepRow.appendChild(ui.seedButton);
    ui.meter = htmlElement('span', 'eul-note');
    stepRow.appendChild(ui.meter);
    section.appendChild(stepRow);

    ui.status = htmlElement('p', 'eul-status');
    ui.status.setAttribute('aria-live', 'polite');
    section.appendChild(ui.status);
    ui.cycleLine = htmlElement('p', 'eul-cycle');
    section.appendChild(ui.cycleLine);
    return section;
  }

  var PSEUDOCODE_LINES = [
    { key: 'walk', text: 'form a cycle Cycle by randomly walking in Graph (don\'t visit the same edge twice!)' },
    { key: 'loop', text: 'while there are unexplored edges in Graph' },
    { key: 'select', text: '    select a node newStart in Cycle with still unexplored edges' },
    { key: 'rotate', text: '    form Cycle’ by traversing Cycle (starting at newStart) and then randomly walking' },
    { key: 'assign', text: '    Cycle ← Cycle’' },
    { key: 'done', text: 'return Cycle' }
  ];

  function buildPseudocode(ui) {
    var pre = htmlElement('pre', 'eul-code');
    pre.setAttribute('aria-hidden', 'true');
    pre.appendChild(htmlElement('span', 'eul-code-line', 'EulerianCycle(Graph)'));
    ui.codeLines = new Map();
    for (var i = 0; i < PSEUDOCODE_LINES.length; i++) {
      var line = htmlElement('span', 'eul-code-line', '    ' + PSEUDOCODE_LINES[i].text);
      ui.codeLines.set(PSEUDOCODE_LINES[i].key, line);
      pre.appendChild(document.createTextNode('\n'));
      pre.appendChild(line);
    }
    return pre;
  }

  function buildKonigsbergSection(ui) {
    var section = htmlElement('div', 'eul-section eul-konigsberg');
    section.appendChild(htmlElement('p', 'eul-subhead', 'The Seven Bridges of Königsberg'));
    ui.kScroll = htmlElement('div', 'eul-scroll');
    ui.kSvg = svgElement('svg', { viewBox: '0 0 ' + VIEW_WIDTH + ' 300', role: 'img', 'class': 'eul-svg eul-ksvg' });
    ui.kScroll.appendChild(ui.kSvg);
    section.appendChild(ui.kScroll);
    ui.kTable = htmlElement('table', 'eul-table');
    section.appendChild(ui.kTable);
    ui.kVerdict = htmlElement('p', 'eul-verdict');
    section.appendChild(ui.kVerdict);
    section.appendChild(htmlElement('p', 'eul-field-name', 'Try it yourself: pick a sector to start from, then cross bridges.'));
    ui.kChoices = htmlElement('div', 'eul-row eul-kchoices');
    section.appendChild(ui.kChoices);
    ui.kStatus = htmlElement('p', 'eul-status');
    ui.kStatus.setAttribute('aria-live', 'polite');
    section.appendChild(ui.kStatus);
    return section;
  }

  function buildInterface(root, uid) {
    var ui = { root: root, uid: uid };
    var body = htmlElement('div', 'eul-body');
    body.appendChild(buildHierholzerSection(ui));
    body.appendChild(buildKonigsbergSection(ui));
    var foot = root.querySelector('.widget-foot');
    if (foot) {
      root.insertBefore(body, foot);
    } else {
      root.appendChild(body);
    }
    return ui;
  }

  /* ---- drawing ---- */

  function drawGraph(svg, scene) {
    clearChildren(svg);
    svg.appendChild(svgElement('rect', { x: -200, y: -200, width: VIEW_WIDTH + 400, height: scene.height + 400, 'class': 'eul-backdrop' }));
    var geometries = edgeGeometries(scene.edges, scene.positions, scene.halfWidths);
    var edgeLayer = svgElement('g', {});
    var labelLayer = svgElement('g', {});
    for (var i = 0; i < scene.edges.length; i++) {
      var geometry = geometries[i];
      var group = svgElement('g', { 'class': 'eul-edge ' + (scene.edgeClasses[i] || '') });
      group.appendChild(svgElement('path', { d: geometry.d, 'class': 'eul-edge-line' }));
      if (scene.directed) {
        group.appendChild(svgElement('polygon', { points: geometry.arrow, 'class': 'eul-edge-arrow' }));
      }
      edgeLayer.appendChild(group);
      if (scene.edgeLabels && scene.edgeLabels[i]) {
        var label = svgElement('text', { x: roundCoordinate(geometry.labelX), y: roundCoordinate(geometry.labelY + 4), 'text-anchor': 'middle', 'class': 'eul-edge-label' });
        label.textContent = scene.edgeLabels[i];
        labelLayer.appendChild(label);
      }
    }
    svg.appendChild(edgeLayer);
    svg.appendChild(labelLayer);
    var nodeLayer = svgElement('g', {});
    for (var n = 0; n < scene.nodeIds.length; n++) {
      var id = scene.nodeIds[n];
      var point = scene.positions.get(id);
      var nodeGroup = svgElement('g', { 'class': 'eul-node ' + (scene.nodeClasses.get(id) || '') });
      nodeGroup.appendChild(svgElement('ellipse', { cx: roundCoordinate(point.x), cy: roundCoordinate(point.y), rx: roundCoordinate(scene.halfWidths.get(id)), ry: NODE_HALF_HEIGHT }));
      var text = svgElement('text', { x: roundCoordinate(point.x), y: roundCoordinate(point.y + 4.5), 'text-anchor': 'middle', 'class': 'eul-node-label' });
      text.textContent = scene.nodeLabels ? scene.nodeLabels.get(id) : id;
      nodeGroup.appendChild(text);
      nodeLayer.appendChild(nodeGroup);
    }
    svg.appendChild(nodeLayer);
  }

  /* ---- Hierholzer state ---- */

  function currentEvent(state) {
    return state.trace.events[state.step];
  }

  function edgeClassesFor(state, event) {
    var classes = [];
    for (var i = 0; i < state.graph.edges.length; i++) {
      var iteration = event.edgeIteration[i];
      var name = iteration < 0 ? 'is-unused' : 'is-used ' + iterationClass(iteration);
      if (event.type === 'walk' && event.edge === i) {
        name += ' is-current';
      }
      classes.push(name);
    }
    return classes;
  }

  function nodeClassesFor(event) {
    var classes = new Map();
    if (event.type === 'select') {
      for (var i = 0; i < event.candidates.length; i++) {
        classes.set(event.candidates[i], 'is-candidate');
      }
    }
    if (event.type === 'select' || event.type === 'rotate') {
      classes.set(event.node, 'is-newstart');
    } else if (event.node !== undefined) {
      classes.set(event.node, 'is-here');
    }
    return classes;
  }

  function cycleText(state, event) {
    var nodes = cycleNodes(state.graph, event.cycleStart, event.cycleEdges);
    return nodes.join(' → ');
  }

  function describeEvent(state, event) {
    var total = state.graph.edges.length;
    var name = cycleName(event.iteration);
    if (event.type === 'start') {
      return 'Place Leo at node ' + event.node + ' (chosen at random) and let him walk, never reusing an edge.';
    }
    if (event.type === 'walk') {
      var edge = state.graph.edges[event.edge];
      return 'Leo takes a random unused edge ' + edge.from + ' → ' + edge.to + '. ' + name + ' now has ' +
        plural(event.usedCount, 'edge', 'edges') + ' of ' + total + '.';
    }
    if (event.type === 'stuck') {
      var sentence = 'Leo is stuck at ' + event.node + ': no unused edge leaves it. Because the graph is balanced, this is the node where he started, so ' +
        name + ' is a cycle with ' + plural(event.usedCount, 'edge', 'edges') + '.';
      if (event.usedCount < total) {
        sentence += ' ' + plural(total - event.usedCount, 'edge is', 'edges are') + ' still unexplored.';
      }
      return sentence;
    }
    if (event.type === 'select') {
      return 'Select newStart = ' + event.node + ', a node in Cycle with still unexplored edges (candidates, chosen at random: ' +
        event.candidates.join(', ') + ').';
    }
    if (event.type === 'rotate') {
      return 'Form Cycle’ by traversing Cycle starting at newStart = ' + event.node + ', so Leo is back at ' + event.node +
        ' with every old edge used. Now he keeps walking randomly to grow ' + name + '.';
    }
    if (event.type === 'failed') {
      return 'No node of Cycle has unexplored edges, yet some edges are unused: the graph is not strongly connected.';
    }
    return 'No unexplored edges remain, so Cycle = ' + name + ' is an Eulerian cycle: it uses all ' + total + ' edges exactly once.';
  }

  function activeCodeLine(event) {
    if (event.type === 'start' || (event.iteration === 0 && (event.type === 'walk' || event.type === 'stuck'))) {
      return 'walk';
    }
    if (event.type === 'select') {
      return 'select';
    }
    if (event.type === 'rotate' || event.type === 'walk') {
      return 'rotate';
    }
    if (event.type === 'stuck') {
      return 'loop';
    }
    return 'done';
  }

  function renderCycleLine(state, event) {
    var line = state.ui.cycleLine;
    clearChildren(line);
    line.appendChild(htmlElement('span', 'eul-field-name', 'Cycle '));
    var sequence = htmlElement('span', 'eul-sequence');
    sequence.appendChild(htmlElement('span', 'eul-seq-node', event.cycleStart));
    for (var i = 0; i < event.cycleEdges.length; i++) {
      var edgeIndex = event.cycleEdges[i];
      var piece = htmlElement('span', 'eul-seq-step ' + iterationClass(event.edgeIteration[edgeIndex]), ' → ' + state.graph.edges[edgeIndex].to);
      sequence.appendChild(piece);
    }
    line.appendChild(sequence);
  }

  function renderHierholzer(state) {
    var event = currentEvent(state);
    var ui = state.ui;
    drawGraph(ui.svg, {
      nodeIds: state.graph.nodeIds,
      edges: state.graph.edges,
      positions: state.positions,
      halfWidths: state.halfWidths,
      edgeClasses: edgeClassesFor(state, event),
      nodeClasses: nodeClassesFor(event),
      directed: true,
      height: VIEW_HEIGHT
    });
    ui.svg.setAttribute('aria-label', 'Directed graph with ' + plural(state.graph.nodeIds.length, 'node', 'nodes') + ' and ' +
      plural(state.graph.edges.length, 'edge', 'edges') + '; ' + event.usedCount + ' used. Cycle: ' + cycleText(state, event) + '.');
    ui.status.innerHTML = describeEvent(state, event);
    renderCycleLine(state, event);
    var active = activeCodeLine(event);
    ui.codeLines.forEach(function highlight(line, key) {
      line.classList.toggle('is-active', key === active);
    });
    ui.meter.textContent = 'Step ' + state.step + ' of ' + (state.trace.events.length - 1) + ' · ' + event.usedCount + '/' +
      state.graph.edges.length + ' edges · seed ' + state.seed;
    ui.backButton.disabled = state.step === 0;
    ui.stepButton.disabled = state.step >= state.trace.events.length - 1;
    ui.playButton.textContent = state.playing ? 'Pause' : 'Play';
  }

  function renderUnavailable(state, message) {
    var ui = state.ui;
    var noClasses = [];
    for (var i = 0; i < state.graph.edges.length; i++) {
      noClasses.push('is-unused');
    }
    drawGraph(ui.svg, {
      nodeIds: state.graph.nodeIds, edges: state.graph.edges, positions: state.positions, halfWidths: state.halfWidths,
      edgeClasses: noClasses, nodeClasses: new Map(), directed: true, height: VIEW_HEIGHT
    });
    ui.svg.setAttribute('aria-label', 'Directed graph with ' + plural(state.graph.nodeIds.length, 'node', 'nodes') + ' and ' +
      plural(state.graph.edges.length, 'edge', 'edges') + '.');
    ui.status.textContent = message;
    clearChildren(ui.cycleLine);
    ui.codeLines.forEach(function clearLine(line) { line.classList.remove('is-active'); });
    ui.meter.textContent = '';
    ui.backButton.disabled = true;
    ui.stepButton.disabled = true;
    ui.playButton.disabled = true;
    ui.resetButton.disabled = true;
    ui.seedButton.disabled = true;
  }

  function halfWidthMap(nodeIds) {
    var widths = new Map();
    for (var i = 0; i < nodeIds.length; i++) {
      widths.set(nodeIds[i], nodeHalfWidth(nodeIds[i]));
    }
    return widths;
  }

  function enableStepButtons(ui) {
    ui.playButton.disabled = false;
    ui.resetButton.disabled = false;
    ui.seedButton.disabled = false;
  }

  function loadGraph(state, graph) {
    stopPlaying(state);
    state.graph = graph;
    state.positions = bestLayout(graph.nodeIds, graph.edges);
    state.halfWidths = halfWidthMap(graph.nodeIds);
    var check = eulerianCheck(graph);
    if (!check.ok) {
      state.trace = null;
      renderUnavailable(state, check.message);
      return;
    }
    enableStepButtons(state.ui);
    state.trace = eulerianCycleTrace(graph, state.seed);
    state.step = 0;
    renderHierholzer(state);
  }

  function loadFromInput(state) {
    var parsed = parseAdjacencyList(state.ui.graphInput.value);
    if (!parsed.ok) {
      state.ui.error.textContent = parsed.message;
      return;
    }
    state.ui.error.textContent = '';
    loadGraph(state, parsed.graph);
  }

  function stopPlaying(state) {
    if (state.playTimer) {
      window.clearInterval(state.playTimer);
      state.playTimer = 0;
    }
    state.playing = false;
  }

  function stepForward(state) {
    if (!state.trace || state.step >= state.trace.events.length - 1) {
      stopPlaying(state);
      if (state.trace) {
        renderHierholzer(state);
      }
      return;
    }
    state.step += 1;
    if (state.step >= state.trace.events.length - 1) {
      stopPlaying(state);
    }
    renderHierholzer(state);
  }

  function togglePlay(state) {
    if (!state.trace) {
      return;
    }
    if (state.playing) {
      stopPlaying(state);
      renderHierholzer(state);
      return;
    }
    if (state.step >= state.trace.events.length - 1) {
      state.step = 0;
    }
    state.playing = true;
    var interval = prefersReducedMotion() ? STEP_INTERVAL_MS * 1.5 : STEP_INTERVAL_MS;
    state.playTimer = window.setInterval(function playTick() { stepForward(state); }, interval);
    stepForward(state);
  }

  function resetTrace(state) {
    stopPlaying(state);
    if (state.trace) {
      state.step = 0;
      renderHierholzer(state);
    }
  }

  function newSeed(state) {
    stopPlaying(state);
    state.seed += 1;
    if (state.trace) {
      state.trace = eulerianCycleTrace(state.graph, state.seed);
      state.step = 0;
      renderHierholzer(state);
    }
  }

  function loadRandomGraph(state) {
    state.randomCount += 1;
    var rng = makeRng(1000 + state.randomCount);
    var nodeCount = 6 + randomIndex(rng, 4);
    var graph = randomEulerianGraph(rng, nodeCount, 3 + randomIndex(rng, 2));
    state.ui.graphInput.value = formatAdjacencyList(graph);
    state.ui.error.textContent = '';
    loadGraph(state, parseAdjacencyList(state.ui.graphInput.value).graph);
  }

  /* ---- Königsberg panel ---- */

  var KONIGSBERG_POSITIONS = {
    North: { x: 300, y: 48 },
    South: { x: 300, y: 252 },
    Kneiphof: { x: 200, y: 150 },
    Lomse: { x: 480, y: 150 }
  };

  function konigsbergScene(kState) {
    var graph = kState.graph;
    var positions = new Map();
    var halfWidths = new Map();
    var labels = new Map();
    for (var i = 0; i < graph.nodeIds.length; i++) {
      var id = graph.nodeIds[i];
      positions.set(id, KONIGSBERG_POSITIONS[id]);
      labels.set(id, id + ' (' + kState.verdict.degrees.get(id) + ')');
      halfWidths.set(id, nodeHalfWidth(labels.get(id)));
    }
    var edgeClasses = [];
    var edgeLabels = [];
    for (var e = 0; e < graph.edges.length; e++) {
      edgeClasses.push(kState.used.has(e) ? 'is-used eul-it-0' : 'is-bridge');
      edgeLabels.push(String(e + 1));
    }
    var nodeClasses = new Map();
    if (kState.current) {
      nodeClasses.set(kState.current, 'is-here');
    }
    return {
      nodeIds: graph.nodeIds, edges: graph.edges, positions: positions, halfWidths: halfWidths, nodeLabels: labels,
      edgeClasses: edgeClasses, edgeLabels: edgeLabels, nodeClasses: nodeClasses, directed: false, height: 300
    };
  }

  function renderKonigsbergTable(ui, kState) {
    clearChildren(ui.kTable);
    var caption = htmlElement('caption', '', 'Degree of each sector (number of bridges touching it)');
    ui.kTable.appendChild(caption);
    var head = htmlElement('tr');
    head.appendChild(htmlElement('th', '', 'Sector'));
    head.appendChild(htmlElement('th', '', 'Bridges'));
    head.appendChild(htmlElement('th', '', 'Even?'));
    ui.kTable.appendChild(head);
    for (var i = 0; i < kState.graph.nodeIds.length; i++) {
      var id = kState.graph.nodeIds[i];
      var degree = kState.verdict.degrees.get(id);
      var row = htmlElement('tr');
      row.appendChild(htmlElement('td', '', kState.graph.names[id]));
      row.appendChild(htmlElement('td', 'eul-num', String(degree)));
      row.appendChild(htmlElement('td', degree % 2 === 0 ? 'eul-even' : 'eul-odd', degree % 2 === 0 ? 'even' : 'odd'));
      ui.kTable.appendChild(row);
    }
  }

  function konigsbergVerdictText(kState) {
    var odd = kState.verdict.oddNodes.length;
    return 'Every time a walker enters a sector by one bridge, she must leave it by another, so a walk that returns home uses the bridges at each sector in pairs: ' +
      'every sector needs an even number of bridges. In Königsberg ' + (odd === 4 ? 'all four' : String(odd)) +
      ' sectors have an odd number (5, 3, 3 and 3), so there is no Eulerian cycle. A walk that ends somewhere else can excuse only its two endpoints, and with ' +
      odd + ' odd sectors there is not even an Eulerian path.';
  }

  function addChoiceButton(ui, text, handler) {
    var choice = button(text);
    choice.addEventListener('click', handler);
    ui.kChoices.appendChild(choice);
  }

  function renderKonigsbergChoices(state) {
    var ui = state.ui;
    var kState = state.konigsberg;
    clearChildren(ui.kChoices);
    if (!kState.current) {
      kState.graph.nodeIds.forEach(function offerStart(id) {
        addChoiceButton(ui, 'Start on ' + kState.graph.names[id], function onStart() { startKonigsbergWalk(state, id); });
      });
      return;
    }
    var available = bridgesAvailable(kState.graph, kState.current, kState.used);
    available.forEach(function offerBridge(edgeIndex) {
      var destination = otherEnd(kState.graph.edges[edgeIndex], kState.current);
      addChoiceButton(ui, 'Cross bridge ' + (edgeIndex + 1) + ' to ' + destination, function onCross() {
        crossBridge(state, edgeIndex);
      });
    });
    addChoiceButton(ui, 'Start over', function onRestart() { resetKonigsberg(state); });
  }

  function konigsbergStatus(kState) {
    if (!kState.current) {
      return 'Choose where to start.';
    }
    var total = kState.graph.edges.length;
    var available = bridgesAvailable(kState.graph, kState.current, kState.used);
    var crossed = kState.used.size;
    var here = kState.graph.names[kState.current];
    if (crossed === 0) {
      return 'You are on ' + here + '. Cross a bridge.';
    }
    if (available.length > 0) {
      return 'You crossed to ' + here + '. ' + crossed + ' of ' + total + ' bridges crossed.';
    }
    return 'Stuck on ' + here + ': every bridge touching it is used, but ' + plural(total - crossed, 'bridge remains', 'bridges remain') +
      ' uncrossed (' + crossed + ' of ' + total + ' crossed). With four odd sectors, every walk gets stuck like this.';
  }

  function renderKonigsberg(state) {
    var ui = state.ui;
    var kState = state.konigsberg;
    drawGraph(ui.kSvg, konigsbergScene(kState));
    ui.kSvg.setAttribute('aria-label', 'The graph Königsberg: four sectors joined by seven bridges. Kneiphof has 5 bridges; North bank, South bank and Lomse have 3 each.');
    ui.kStatus.textContent = konigsbergStatus(kState);
    renderKonigsbergChoices(state);
  }

  function startKonigsbergWalk(state, node) {
    state.konigsberg.current = node;
    state.konigsberg.used = new Set();
    renderKonigsberg(state);
  }

  function crossBridge(state, edgeIndex) {
    var kState = state.konigsberg;
    kState.used.add(edgeIndex);
    kState.current = otherEnd(kState.graph.edges[edgeIndex], kState.current);
    renderKonigsberg(state);
    var first = state.ui.kChoices.querySelector('button');
    if (first) {
      first.focus();
    }
  }

  function resetKonigsberg(state) {
    state.konigsberg.current = null;
    state.konigsberg.used = new Set();
    renderKonigsberg(state);
  }

  function setUpKonigsberg(state) {
    var graph = konigsbergGraph();
    state.konigsberg = { graph: graph, verdict: undirectedEulerVerdict(graph), current: null, used: new Set() };
    renderKonigsbergTable(state.ui, state.konigsberg);
    state.ui.kVerdict.textContent = konigsbergVerdictText(state.konigsberg);
    renderKonigsberg(state);
  }

  function wireEvents(state) {
    var ui = state.ui;
    ui.loadButton.addEventListener('click', function onLoad() { loadFromInput(state); });
    ui.sampleButton.addEventListener('click', function onSample() {
      ui.graphInput.value = BA3F_SAMPLE;
      loadFromInput(state);
    });
    ui.randomButton.addEventListener('click', function onRandom() { loadRandomGraph(state); });
    ui.stepButton.addEventListener('click', function onStep() { stopPlaying(state); stepForward(state); });
    ui.backButton.addEventListener('click', function onBack() {
      stopPlaying(state);
      if (state.trace && state.step > 0) {
        state.step -= 1;
        renderHierholzer(state);
      }
    });
    ui.playButton.addEventListener('click', function onPlay() { togglePlay(state); });
    ui.resetButton.addEventListener('click', function onReset() { resetTrace(state); });
    ui.seedButton.addEventListener('click', function onSeed() { newSeed(state); });
  }

  var instanceCounter = 0;

  function mountWidget(root) {
    if (root.getAttribute('data-widget-ready') === 'true') {
      return;
    }
    root.setAttribute('data-widget-ready', 'true');
    instanceCounter += 1;
    var state = {
      ui: buildInterface(root, 'eul' + instanceCounter),
      graph: null, positions: null, halfWidths: null, trace: null,
      seed: 1, step: 0, playing: false, playTimer: 0, randomCount: 0, konigsberg: null
    };
    wireEvents(state);
    loadFromInput(state);
    setUpKonigsberg(state);
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-widget="euler"]');
    for (var i = 0; i < roots.length; i++) {
      try {
        mountWidget(roots[i]);
      } catch (error) {
        roots[i].appendChild(htmlElement('p', 'eul-error', 'This interactive could not start in your browser.'));
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
      BA3F_SAMPLE: BA3F_SAMPLE,
      makeRng: makeRng,
      parseAdjacencyList: parseAdjacencyList,
      formatAdjacencyList: formatAdjacencyList,
      degreeTable: degreeTable,
      unbalancedNodes: unbalancedNodes,
      isStronglyConnected: isStronglyConnected,
      eulerianCheck: eulerianCheck,
      eulerianCycleTrace: eulerianCycleTrace,
      eulerianCycle: eulerianCycle,
      isEulerianCycle: isEulerianCycle,
      randomEulerianGraph: randomEulerianGraph,
      konigsbergGraph: konigsbergGraph,
      undirectedDegrees: undirectedDegrees,
      undirectedEulerVerdict: undirectedEulerVerdict,
      bridgesAvailable: bridgesAvailable,
      bestLayout: bestLayout,
      edgeGeometries: edgeGeometries
    };
  }
})();
