// Tests for the Eulerian cycle widget core: node tests/widgets/euler.test.mjs
// Sample is the Rosalind textbook-track dataset BA3F.
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
const core = require('../../assets/widgets/euler.js');

let passed = 0;
let failed = 0;

function check(name, testFunction) {
  try {
    testFunction();
    passed += 1;
    console.log('ok   ' + name);
  } catch (error) {
    failed += 1;
    console.log('FAIL ' + name + '\n     ' + error.message);
  }
}

const BA3F_OUTPUT = '6->8->7->9->6->5->4->2->1->0->3->2->6';

function sampleGraph() {
  const parsed = core.parseAdjacencyList(core.BA3F_SAMPLE);
  assert.ok(parsed.ok);
  return parsed.graph;
}

function permutations(items) {
  if (items.length <= 1) {
    return [items.slice()];
  }
  const result = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of permutations(rest)) {
      result.push([items[i]].concat(tail));
    }
  }
  return result;
}

// Brute force: does some ordering of the edges form an Eulerian cycle? (tiny graphs)
function bruteForceIsEulerian(graph) {
  const indices = graph.edges.map((edge, i) => i);
  for (const order of permutations(indices)) {
    const nodes = [graph.edges[order[0]].from];
    let valid = true;
    for (const index of order) {
      if (graph.edges[index].from !== nodes[nodes.length - 1]) {
        valid = false;
        break;
      }
      nodes.push(graph.edges[index].to);
    }
    if (valid && nodes[0] === nodes[nodes.length - 1]) {
      return true;
    }
  }
  return false;
}

check('BA3F sample parses into 10 nodes and 12 edges', () => {
  const graph = sampleGraph();
  assert.equal(graph.nodeIds.length, 10);
  assert.equal(graph.edges.length, 12);
  assert.ok(core.eulerianCheck(graph).ok);
});

check('BA3F sample output is accepted by the validator', () => {
  assert.ok(core.isEulerianCycle(sampleGraph(), BA3F_OUTPUT.split('->')));
});

check('BA3F sample: every seed from 1 to 200 produces a valid Eulerian cycle', () => {
  const graph = sampleGraph();
  const distinct = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const cycle = core.eulerianCycle(graph, seed);
    assert.ok(core.isEulerianCycle(graph, cycle), 'seed ' + seed + ': ' + (cycle || []).join('->'));
    distinct.add(cycle.join('->'));
  }
  assert.ok(distinct.size > 5, 'seeds give different cycles');
});

check('BA3F trace follows the pseudocode: stuck only at the start, rotate keeps the cycle', () => {
  const graph = sampleGraph();
  for (let seed = 1; seed <= 50; seed++) {
    const trace = core.eulerianCycleTrace(graph, seed);
    let cycleStart = trace.events[0].node;
    for (let i = 1; i < trace.events.length; i++) {
      const event = trace.events[i];
      const previous = trace.events[i - 1];
      if (event.type === 'stuck') {
        assert.equal(event.node, event.cycleStart, 'Leo gets stuck where the current cycle started');
      }
      if (event.type === 'select') {
        const onCycle = [previous.cycleStart].concat(previous.cycleEdges.map((index) => graph.edges[index].to));
        assert.ok(onCycle.includes(event.node), 'newStart lies on Cycle');
        assert.ok(event.candidates.includes(event.node));
      }
      if (event.type === 'rotate') {
        assert.equal(event.cycleStart, event.node);
        assert.deepEqual(event.cycleEdges.slice().sort(), previous.cycleEdges.slice().sort(), 'same edges, new start');
        cycleStart = event.node;
      }
      if (event.type === 'walk') {
        assert.equal(event.usedCount, previous.usedCount + 1);
      }
    }
    assert.equal(trace.events[trace.events.length - 1].type, 'done');
    assert.equal(trace.cycle[0], cycleStart);
  }
});

check('Random balanced, strongly connected graphs: produced cycle is always Eulerian', () => {
  const rng = core.makeRng(4242);
  for (let trial = 0; trial < 500; trial++) {
    const nodeCount = 2 + Math.floor(rng() * 12);
    const graph = core.randomEulerianGraph(rng, nodeCount, Math.floor(rng() * 6));
    assert.ok(core.eulerianCheck(graph).ok, 'generator makes Eulerian graphs');
    const reparsed = core.parseAdjacencyList(core.formatAdjacencyList(graph));
    assert.ok(reparsed.ok, 'round-trips through the adjacency list format');
    const cycle = core.eulerianCycle(reparsed.graph, trial + 1);
    assert.ok(core.isEulerianCycle(reparsed.graph, cycle), 'trial ' + trial);
  }
});

check('Tiny random graphs: Euler\'s Theorem check agrees with brute force', () => {
  const rng = core.makeRng(7);
  let eulerian = 0;
  let notEulerian = 0;
  for (let trial = 0; trial < 400; trial++) {
    const nodeCount = 2 + Math.floor(rng() * 3);
    const edgeCount = 1 + Math.floor(rng() * 6);
    const lines = new Map();
    for (let e = 0; e < edgeCount; e++) {
      const from = String(Math.floor(rng() * nodeCount));
      const to = String(Math.floor(rng() * nodeCount));
      if (!lines.has(from)) {
        lines.set(from, []);
      }
      lines.get(from).push(to);
    }
    const text = [...lines].map(([from, targets]) => from + ' -> ' + targets.join(',')).join('\n');
    const graph = core.parseAdjacencyList(text).graph;
    const expected = bruteForceIsEulerian(graph);
    assert.equal(core.eulerianCheck(graph).ok, expected, text);
    if (expected) {
      eulerian += 1;
      assert.ok(core.isEulerianCycle(graph, core.eulerianCycle(graph, trial + 1)));
    } else {
      notEulerian += 1;
    }
  }
  assert.ok(eulerian > 20 && notEulerian > 20, 'both outcomes exercised');
});

check('Validator rejects broken cycles', () => {
  const graph = sampleGraph();
  const nodes = BA3F_OUTPUT.split('->');
  assert.equal(core.isEulerianCycle(graph, nodes.slice(0, -1)), false, 'not closed');
  const swapped = nodes.slice();
  swapped[1] = '5';
  swapped[5] = '8';
  assert.equal(core.isEulerianCycle(graph, swapped), false, 'uses a missing edge');
  assert.equal(core.isEulerianCycle(graph, null), false);
});

check('Unbalanced and disconnected graphs are explained, not stepped', () => {
  const unbalanced = core.parseAdjacencyList('0 -> 1\n1 -> 2').graph;
  const verdict = core.eulerianCheck(unbalanced);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'unbalanced');
  assert.match(verdict.message, /0 \(in 0, out 1\)/);
  const disconnected = core.parseAdjacencyList('0 -> 1\n1 -> 0\n2 -> 3\n3 -> 2').graph;
  assert.equal(core.eulerianCheck(disconnected).reason, 'disconnected');
});

check('Königsberg: degrees 5, 3, 3, 3, no Eulerian cycle or path', () => {
  const graph = core.konigsbergGraph();
  assert.equal(graph.edges.length, 7);
  const verdict = core.undirectedEulerVerdict(graph);
  assert.equal(verdict.degrees.get('Kneiphof'), 5);
  assert.equal(verdict.degrees.get('North'), 3);
  assert.equal(verdict.degrees.get('South'), 3);
  assert.equal(verdict.degrees.get('Lomse'), 3);
  assert.equal(verdict.oddNodes.length, 4);
  assert.equal(verdict.hasEulerianCycle, false);
  assert.equal(verdict.hasEulerianPath, false);
});

check('Königsberg: brute force over every walk confirms no route crosses all seven bridges', () => {
  const graph = core.konigsbergGraph();
  let longest = 0;
  function explore(node, used) {
    longest = Math.max(longest, used.size);
    for (const edgeIndex of core.bridgesAvailable(graph, node, used)) {
      const edge = graph.edges[edgeIndex];
      const next = edge.from === node ? edge.to : edge.from;
      used.add(edgeIndex);
      explore(next, used);
      used.delete(edgeIndex);
    }
  }
  for (const start of graph.nodeIds) {
    explore(start, new Set());
  }
  assert.equal(longest, 6);
});

check('Parser: both adjacency formats, helpful errors', () => {
  const arrow = core.parseAdjacencyList('0 -> 3\n2 -> 1,6');
  const colon = core.parseAdjacencyList('0: 3\n2: 1 6');
  assert.deepEqual(arrow.graph, colon.graph);
  assert.match(core.parseAdjacencyList('0 3').message, /needs an arrow/);
  assert.match(core.parseAdjacencyList('').message, /at least one edge/);
  assert.match(core.parseAdjacencyList('a! -> b').message, /only letters/);
  assert.match(core.parseAdjacencyList('0 ->').message, /no targets/);
  assert.match(core.parseAdjacencyList('LONGNAME -> 1').message, /4 characters/);
  const many = [];
  for (let i = 0; i < 41; i++) {
    many.push(i % 5 + ' -> ' + ((i + 1) % 5));
  }
  assert.match(core.parseAdjacencyList(many.join('\n')).message, /at most 40/);
});

check('Layout and geometry are finite for the sample and for loops', () => {
  const graph = core.parseAdjacencyList('0 -> 0,1\n1 -> 0').graph;
  const positions = core.bestLayout(graph.nodeIds, graph.edges);
  const halfWidths = new Map(graph.nodeIds.map((id) => [id, 18]));
  for (const geometry of core.edgeGeometries(graph.edges, positions, halfWidths)) {
    assert.ok(!/NaN|Infinity/.test(geometry.d + geometry.arrow));
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
