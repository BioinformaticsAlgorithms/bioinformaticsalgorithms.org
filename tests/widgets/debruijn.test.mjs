// Tests for the de Bruijn widget core: node tests/widgets/debruijn.test.mjs
// Samples are the Rosalind textbook-track datasets BA3D, BA3E, BA3G, BA3H.
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
const core = require('../../assets/widgets/debruijn.js');

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

function sortedLines(lines) {
  return lines.slice().sort();
}

// Rosalind output uses "AAG -> AGA,AGA" (older) or "AAG: AGA AGA" (newer); normalize both.
function normalizeAdjacencyText(text) {
  const lines = [];
  for (const rawLine of text.trim().split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const parts = line.includes('->') ? line.split('->') : line.split(':');
    const source = parts[0].trim();
    const targets = parts[1].trim().split(/[\s,]+/).sort();
    lines.push(source + ' -> ' + targets.join(','));
  }
  return sortedLines(lines);
}

// Parse "3 -> 0,4" adjacency lists into node ids and {from, to} edges.
function parseAdjacencyList(text) {
  const nodeIds = [];
  const seen = new Set();
  const edges = [];
  function addNode(id) {
    if (!seen.has(id)) {
      seen.add(id);
      nodeIds.push(id);
    }
  }
  for (const rawLine of text.trim().split('\n')) {
    const parts = rawLine.split('->');
    const source = parts[0].trim();
    addNode(source);
    for (const target of parts[1].split(',')) {
      addNode(target.trim());
      edges.push({ from: source, to: target.trim() });
    }
  }
  return { nodeIds, edges };
}

function multisetKey(items) {
  return items.slice().sort().join(' ');
}

// ---- BA3D: De Bruijn Graph from a String ----
const BA3D_K = 4;
const BA3D_TEXT = 'AAGATTCTCTAAGA';
const BA3D_OUTPUT = `AAG -> AGA,AGA
AGA -> GAT
ATT -> TTC
CTA -> TAA
CTC -> TCT
GAT -> ATT
TAA -> AAG
TCT -> CTA,CTC
TTC -> TCT`;

check('BA3D sample: DeBruijn_4(AAGATTCTCTAAGA)', () => {
  const lines = core.formatAdjacency(core.deBruijnFromText(BA3D_TEXT, BA3D_K));
  assert.deepEqual(sortedLines(lines), normalizeAdjacencyText(BA3D_OUTPUT));
});

check('BA3D sample: gluing PathGraph_4 gives the same graph', () => {
  const model = core.buildModel({ mode: 'text', text: BA3D_TEXT, k: BA3D_K });
  const stage = core.ensureStage(model, model.glueOrder.length);
  const labelById = new Map(stage.graph.nodes.map((node) => [node.id, node.label]));
  const adjacency = new Map();
  for (const edge of stage.graph.edges) {
    const from = labelById.get(edge.from);
    if (!adjacency.has(from)) {
      adjacency.set(from, []);
    }
    adjacency.get(from).push(labelById.get(edge.to));
  }
  assert.deepEqual(sortedLines(core.formatAdjacency(adjacency)), normalizeAdjacencyText(BA3D_OUTPUT));
});

// ---- BA3E: De Bruijn Graph from k-mers ----
const BA3E_PATTERNS = ['GAGG', 'CAGG', 'GGGG', 'GGGA', 'CAGG', 'AGGG', 'GGAG'];
const BA3E_OUTPUT = `AGG -> GGG
CAG -> AGG,AGG
GAG -> AGG
GGA -> GAG
GGG -> GGA,GGG`;

check('BA3E sample: DeBruijn(Patterns)', () => {
  const lines = core.formatAdjacency(core.deBruijnFromKmers(BA3E_PATTERNS));
  assert.deepEqual(sortedLines(lines), normalizeAdjacencyText(BA3E_OUTPUT));
});

check('BA3E sample: gluing CompositionGraph(Patterns) gives the same graph', () => {
  const model = core.buildModel({ mode: 'kmers', patterns: BA3E_PATTERNS, k: 4 });
  const stage = core.ensureStage(model, model.glueOrder.length);
  assert.equal(stage.graph.nodes.length, 5);
  assert.equal(stage.graph.edges.length, 7);
  const loops = stage.graph.edges.filter((edge) => edge.from === edge.to).map((edge) => edge.label);
  assert.deepEqual(loops, ['GGGG']);
});

// ---- The book's running example (lessons 3.4 and 3.5) ----
const BOOK_TEXT = 'TAATGCCATGGGATGTT';

check('Book example: glue AT, TG, GG and go 16 -> 14 -> 12 -> 11 nodes', () => {
  const model = core.buildModel({ mode: 'text', text: BOOK_TEXT, k: 3 });
  assert.deepEqual(model.glueOrder, ['AT', 'TG', 'GG']);
  const nodeCounts = [0, 1, 2, 3].map((stage) => core.ensureStage(model, stage).graph.nodes.length);
  assert.deepEqual(nodeCounts, [16, 14, 12, 11]);
  const finalGraph = core.ensureStage(model, 3).graph;
  assert.equal(finalGraph.edges.length, 15);
  const atToTg = finalGraph.edges.filter((edge) => edge.from === 'g:AT' && edge.to === 'g:TG');
  assert.equal(atToTg.length, 3, 'three parallel ATG edges');
  const loops = finalGraph.edges.filter((edge) => edge.from === edge.to);
  assert.deepEqual(loops.map((edge) => edge.label), ['GGG']);
});

check('Book example: the eleven 2-mers of lesson 3.5', () => {
  const graph = core.deBruijnGraphFromKmers(core.kmerComposition(BOOK_TEXT, 3));
  assert.equal(multisetKey(graph.nodeIds), 'AA AT CA CC GA GC GG GT TA TG TT');
});

check('Book example: default Eulerian walk spells Text; other seeds spell a string with the same composition', () => {
  const model = core.buildModel({ mode: 'text', text: BOOK_TEXT, k: 3 });
  const firstWalk = core.eulerianWalk(model, 0);
  assert.ok(firstWalk.ok);
  assert.equal(firstWalk.spelled, BOOK_TEXT);
  const spelledStrings = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const walk = core.eulerianWalk(model, seed);
    assert.ok(walk.ok);
    assert.equal(multisetKey(core.kmerComposition(walk.spelled, 3)), multisetKey(core.kmerComposition(BOOK_TEXT, 3)));
    spelledStrings.add(walk.spelled);
  }
  assert.deepEqual([...spelledStrings].sort(), ['TAATGCCATGGGATGTT', 'TAATGGGATGCCATGTT']);
});

check('Book example: overlap graph edges', () => {
  const patterns = core.kmerComposition(BOOK_TEXT, 3);
  const edges = core.overlapGraph(patterns);
  for (let i = 0; i + 1 < patterns.length; i++) {
    assert.ok(edges.some((edge) => edge.from === i && edge.to === i + 1), 'genome path edge ' + i);
  }
  let bruteCount = 0;
  for (let i = 0; i < patterns.length; i++) {
    for (let j = 0; j < patterns.length; j++) {
      if (i !== j && patterns[i].slice(1) === patterns[j].slice(0, 2)) {
        bruteCount += 1;
      }
    }
  }
  assert.equal(edges.length, bruteCount);
});

// ---- BA3G: Eulerian Path ----
const BA3G_INPUT = `0 -> 2
1 -> 3
2 -> 1
3 -> 0,4
6 -> 3,7
7 -> 8
8 -> 9
9 -> 6`;
const BA3G_OUTPUT = '6->7->8->9->6->3->0->2->1->3->4';

check('BA3G sample: Eulerian path is valid and runs from 6 to 4', () => {
  const graph = parseAdjacencyList(BA3G_INPUT);
  const result = core.findEulerianPath(graph.nodeIds, graph.edges, null);
  assert.ok(result.ok);
  assert.ok(core.isEulerianPath(graph.edges, result.edgeOrder));
  assert.equal(result.nodeOrder[0], '6');
  assert.equal(result.nodeOrder[result.nodeOrder.length - 1], '4');
  assert.equal(result.nodeOrder.length, BA3G_OUTPUT.split('->').length);
});

check('BA3G sample: every seed gives a valid Eulerian path; the sample answer is among them', () => {
  const graph = parseAdjacencyList(BA3G_INPUT);
  const found = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const result = core.findEulerianPath(graph.nodeIds, graph.edges, core.makeRng(seed));
    assert.ok(result.ok && core.isEulerianPath(graph.edges, result.edgeOrder));
    found.add(result.nodeOrder.join('->'));
  }
  assert.ok(found.has(BA3G_OUTPUT));
});

// ---- BA3H: String Reconstruction ----
const BA3H_PATTERNS = ['CTTA', 'ACCA', 'TACC', 'GGCT', 'GCTT', 'TTAC'];
const BA3H_OUTPUT = 'GGCTTACCA';

check('BA3H sample: StringReconstruction(Patterns)', () => {
  assert.equal(core.stringReconstruction(BA3H_PATTERNS, null), BA3H_OUTPUT);
  assert.equal(core.stringReconstruction(BA3H_PATTERNS, core.makeRng(7)), BA3H_OUTPUT);
});

// ---- Brute force on small random cases ----
function randomDna(rng, length) {
  let text = '';
  for (let i = 0; i < length; i++) {
    text += 'ACGT'.charAt(Math.floor(rng() * 4));
  }
  return text;
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

// Does any ordering of the edges form an Eulerian path? (tiny graphs only)
function bruteForceHasEulerianPath(edges) {
  const indices = edges.map((edge, i) => i);
  for (const order of permutations(indices)) {
    if (core.isEulerianPath(edges, order)) {
      return true;
    }
  }
  return false;
}

check('Random strings: DeBruijn from Text equals DeBruijn from its composition, and the walk spells a string with that composition', () => {
  const rng = core.makeRng(2026);
  for (let trial = 0; trial < 300; trial++) {
    const k = 2 + Math.floor(rng() * 4);
    const text = randomDna(rng, k + Math.floor(rng() * 25));
    const patterns = core.kmerComposition(text, k);
    assert.deepEqual(core.formatAdjacency(core.deBruijnFromText(text, k)), core.formatAdjacency(core.deBruijnFromKmers(patterns)));
    const textModel = core.buildModel({ mode: 'text', text, k });
    const kmerModel = core.buildModel({ mode: 'kmers', patterns: patterns.slice().sort(), k });
    const textFinal = core.ensureStage(textModel, textModel.glueOrder.length).graph;
    const kmerFinal = core.ensureStage(kmerModel, kmerModel.glueOrder.length).graph;
    assert.equal(textFinal.nodes.length, kmerFinal.nodes.length);
    assert.equal(textFinal.nodes.length, new Set(textModel.base.nodeLabels).size);
    const walk = core.eulerianWalk(textModel, trial);
    assert.ok(walk.ok, 'a genome always has an Eulerian path in its de Bruijn graph');
    assert.equal(walk.spelled.length, text.length);
    assert.equal(multisetKey(core.kmerComposition(walk.spelled, k)), multisetKey(patterns));
  }
});

check('Random small k-mer sets: Eulerian path found exactly when brute force finds one', () => {
  const rng = core.makeRng(99);
  let withPath = 0;
  let withoutPath = 0;
  for (let trial = 0; trial < 400; trial++) {
    const count = 1 + Math.floor(rng() * 6);
    const patterns = [];
    for (let i = 0; i < count; i++) {
      patterns.push(randomDna(rng, 3).replace(/[CT]/g, 'A'));
    }
    const graph = core.deBruijnGraphFromKmers(patterns);
    const result = core.findEulerianPath(graph.nodeIds, graph.edges, core.makeRng(trial + 1));
    const expected = bruteForceHasEulerianPath(graph.edges);
    assert.equal(result.ok, expected, 'patterns ' + patterns.join(' '));
    if (result.ok) {
      assert.ok(core.isEulerianPath(graph.edges, result.edgeOrder));
      withPath += 1;
    } else {
      withoutPath += 1;
    }
  }
  assert.ok(withPath > 20 && withoutPath > 20, 'both outcomes exercised');
});

check('Edge geometry: every edge, loop and parallel edge gets a finite path', () => {
  const model = core.buildModel({ mode: 'text', text: BOOK_TEXT, k: 3 });
  const stage = core.ensureStage(model, model.glueOrder.length);
  const geometries = core.edgeGeometries(stage.graph.edges, stage.positions, stage.halfWidths);
  assert.equal(geometries.size, stage.graph.edges.length);
  for (const geometry of geometries.values()) {
    assert.ok(!/NaN|Infinity/.test(geometry.d + geometry.arrow), geometry.d);
  }
  const atToTg = stage.graph.edges.filter((edge) => edge.from === 'g:AT' && edge.to === 'g:TG');
  const paths = new Set(atToTg.map((edge) => geometries.get(edge.id).d));
  assert.equal(paths.size, 3, 'parallel edges are drawn apart');
});

check('Layout stays inside the drawing for the largest allowed input', () => {
  const rng = core.makeRng(5);
  const text = randomDna(rng, core.MAX_KMERS + 2);
  const model = core.buildModel({ mode: 'text', text, k: 3 });
  const stage = core.ensureStage(model, model.glueOrder.length);
  for (const point of stage.positions.values()) {
    assert.ok(point.x >= 0 && point.x <= 680 && point.y >= 0 && point.y <= 440);
  }
});

// ---- Input validation ----
check('Validation: helpful messages, never throws', () => {
  assert.equal(core.validateGenomeInput('taatgccatgggatgtt', '3').ok, true);
  assert.match(core.validateGenomeInput('', '3').message, /Type a genome/);
  assert.match(core.validateGenomeInput('TAAXG', '3').message, /"X" is not allowed/);
  assert.match(core.validateGenomeInput('TAATG', 'three').message, /whole number/);
  assert.match(core.validateGenomeInput('TAATG', '1').message, /between 2 and 10/);
  assert.match(core.validateGenomeInput('TAA', '4').message, /longer than the genome/);
  assert.match(core.validateGenomeInput('A'.repeat(50), '3').message, /at most 40/);
  assert.equal(core.validateGenomeInput('A'.repeat(42), '3').ok, true);
  assert.equal(core.validateKmerInput('GAGG, CAGG\nGGGG').ok, true);
  assert.match(core.validateKmerInput('   ').message, /at least one/);
  assert.match(core.validateKmerInput('TAA TGCA').message, /same length/);
  assert.match(core.validateKmerInput('A').message, /length 2 to 10/);
  assert.match(core.validateKmerInput(Array(41).fill('ACG').join(' ')).message, /at most 40/);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
