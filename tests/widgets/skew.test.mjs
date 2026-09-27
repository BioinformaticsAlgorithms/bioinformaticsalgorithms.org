// Tests for the algorithm core of assets/widgets/skew.js.
// Run with: node tests/widgets/skew.test.mjs   (exit code 0 = pass)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const skew = require('../../assets/widgets/skew.js');

let passed = 0;
let failed = 0;

function check(name, testFunction) {
  try {
    testFunction();
    passed += 1;
    console.log('ok   ' + name);
  } catch (error) {
    failed += 1;
    console.log('FAIL ' + name);
    console.log('     ' + error.message);
  }
}

// Brute force straight from the definition: Skew_i = #G - #C in the first i nucleotides.
function bruteForceSkewAt(genome, i) {
  let guanineCount = 0;
  let cytosineCount = 0;
  for (let position = 0; position < i; position++) {
    if (genome[position] === 'G') {
      guanineCount += 1;
    }
    if (genome[position] === 'C') {
      cytosineCount += 1;
    }
  }
  return guanineCount - cytosineCount;
}

function bruteForceMinimumSkew(genome) {
  let smallest = Infinity;
  for (let i = 0; i <= genome.length; i++) {
    smallest = Math.min(smallest, bruteForceSkewAt(genome, i));
  }
  const positions = [];
  for (let i = 0; i <= genome.length; i++) {
    if (bruteForceSkewAt(genome, i) === smallest) {
      positions.push(i);
    }
  }
  return positions;
}

function randomDna(length, random) {
  const alphabet = 'ACGT';
  let text = '';
  for (let index = 0; index < length; index++) {
    text += alphabet[Math.floor(random() * 4)];
  }
  return text;
}

// Small deterministic generator so failures are reproducible.
function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

check('lesson 1.7 figure: skew values of CATGGGCATCGGCCATACGCC', () => {
  // Read off the skew diagram figure in _lessons/ch1/08-skew-diagram.html (positions 0 to 21).
  const expected = [0, -1, -1, -1, 0, 1, 2, 1, 1, 1, 0, 1, 2, 1, 0, 0, 0, 0, -1, 0, -1, -2];
  assert.deepEqual(skew.skewArray('CATGGGCATCGGCCATACGCC'), expected);
});

check('lesson 1.7 figure: the minimum of CATGGGCATCGGCCATACGCC is at i = 21', () => {
  assert.deepEqual(skew.minimumSkew('CATGGGCATCGGCCATACGCC'), [21]);
});

check('Skew_0 is 0 and the array has |Genome| + 1 entries', () => {
  const values = skew.skewArray('GAGCCACCGCGATA');
  assert.equal(values.length, 15);
  assert.equal(values[0], 0);
});

check('Minimum Skew sample dataset (BA1F) gives 53 97', () => {
  const sample = 'CCTATCGGTGGATTAGCATGTCCCTGTACGTTTCGCCGCGAACTAGTTCACACGGCTTGATGGCAAATGGTTTTTCCGGCGACCGTAATCGTCCACCGAGATGTTAGCTTGCCATTGACGGCACATGGTTTT';
  assert.deepEqual(skew.minimumSkew(sample), [53, 97]);
});

check('E. coli excerpt: minima land on genome positions 3923620 to 3923623 (lesson 1.9)', () => {
  const preset = skew.PRESETS[0];
  assert.equal(preset.genome.length, 6000);
  assert.match(preset.genome, /^[ACGT]+$/);
  const genomePositions = skew.minimumSkew(preset.genome).map((i) => i + preset.offset);
  assert.deepEqual(genomePositions, [3923620, 3923621, 3923622, 3923623]);
});

check('every preset passes validation unchanged', () => {
  for (const preset of skew.PRESETS) {
    const result = skew.normalizeGenome(preset.genome, skew.MAX_GENOME_LENGTH);
    assert.equal(result.ok, true, preset.id);
    assert.equal(result.genome, preset.genome, preset.id);
  }
});

check('skewIncrement: +1 for G, -1 for C, 0 for A and T', () => {
  assert.equal(skew.skewIncrement('G'), 1);
  assert.equal(skew.skewIncrement('C'), -1);
  assert.equal(skew.skewIncrement('A'), 0);
  assert.equal(skew.skewIncrement('T'), 0);
});

check('brute force: skew arrays and minima on 2,000 random strings', () => {
  const random = seededRandom(20260927);
  for (let trial = 0; trial < 2000; trial++) {
    const genome = randomDna(Math.floor(random() * 30), random);
    const values = skew.skewArray(genome);
    for (let i = 0; i <= genome.length; i++) {
      assert.equal(values[i], bruteForceSkewAt(genome, i), genome + ' at ' + i);
    }
    assert.deepEqual(skew.minimumSkew(genome), bruteForceMinimumSkew(genome), genome);
  }
});

check('the empty genome has the single minimum i = 0 (but the widget rejects it as input)', () => {
  assert.deepEqual(skew.minimumSkew(''), [0]);
  assert.equal(skew.normalizeGenome('', 100).ok, false);
});

check('normalizeGenome ignores whitespace and newlines and uppercases', () => {
  const result = skew.normalizeGenome('  cat ggg\n catcg\r\n\tGCC ', 100);
  assert.deepEqual(result, { ok: true, genome: 'CATGGGCATCGGCC' });
});

check('normalizeGenome drops FASTA header lines', () => {
  const result = skew.normalizeGenome('>chromosome 1\nACGT\nGGCC\n', 100);
  assert.deepEqual(result, { ok: true, genome: 'ACGTGGCC' });
});

check('normalizeGenome rejects non-ACGT letters and names the position', () => {
  const result = skew.normalizeGenome('ACGTNACGT', 100);
  assert.equal(result.ok, false);
  assert.match(result.error, /N/);
  assert.match(result.error, /position 4/);
});

check('normalizeGenome enforces the length cap without throwing', () => {
  const tooLong = 'A'.repeat(skew.MAX_GENOME_LENGTH + 1);
  const result = skew.normalizeGenome(tooLong, skew.MAX_GENOME_LENGTH);
  assert.equal(result.ok, false);
  assert.match(result.error, /200,000/);
  const atCap = skew.normalizeGenome('A'.repeat(skew.MAX_GENOME_LENGTH), skew.MAX_GENOME_LENGTH);
  assert.equal(atCap.ok, true);
});

check('describeSkewStep follows the book recurrence', () => {
  const genome = 'CATG';
  const values = skew.skewArray(genome);
  assert.match(skew.describeSkewStep(genome, values, 0), /is C, so Skew₁ = Skew₀ − 1 = −1/);
  assert.match(skew.describeSkewStep(genome, values, 1), /is A, so Skew₂ = Skew₁ = −1/);
  assert.match(skew.describeSkewStep(genome, values, 3), /is G, so Skew₄ = Skew₃ \+ 1 = 0/);
});

check('skewEnvelope keeps every extreme of the skew array', () => {
  const random = seededRandom(7);
  const genome = randomDna(5000, random);
  const values = skew.skewArray(genome);
  const buckets = skew.skewEnvelope(values, 317);
  let lowest = Infinity;
  let highest = -Infinity;
  for (const bucket of buckets) {
    lowest = Math.min(lowest, bucket.low);
    highest = Math.max(highest, bucket.high);
  }
  assert.equal(lowest, Math.min(...values));
  assert.equal(highest, Math.max(...values));
  assert.equal(buckets[0].first, 0);
  assert.equal(buckets[buckets.length - 1].last, genome.length);
});

check('200,000 nucleotides compute quickly', () => {
  const random = seededRandom(99);
  const genome = randomDna(200000, random);
  const start = Date.now();
  const positions = skew.minimumSkew(genome);
  assert.ok(positions.length >= 1);
  assert.ok(Date.now() - start < 1000);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
