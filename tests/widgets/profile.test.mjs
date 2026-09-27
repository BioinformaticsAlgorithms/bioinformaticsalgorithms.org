// Tests for the profile widget core: node tests/widgets/profile.test.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
const core = require('../../assets/widgets/profile.js');

let passed = 0;

function check(name, testFunction) {
  testFunction();
  passed += 1;
  console.log('ok - ' + name);
}

function upperRows(rows) {
  const upper = [];
  for (const row of rows) {
    upper.push(row.toUpperCase());
  }
  return upper;
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, message + ': expected ' + expected + ', got ' + actual);
}

// Small deterministic generator for the brute-force cases.
function makeRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDna(length, random) {
  let text = '';
  for (let index = 0; index < length; index++) {
    text += 'ACGT'[Math.floor(random() * 4)];
  }
  return text;
}

function hammingDistance(first, second) {
  let distance = 0;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) {
      distance += 1;
    }
  }
  return distance;
}

function allKmers(k) {
  let kmers = [''];
  for (let position = 0; position < k; position++) {
    const longer = [];
    for (const prefix of kmers) {
      for (const symbol of 'ACGT') {
        longer.push(prefix + symbol);
      }
    }
    kmers = longer;
  }
  return kmers;
}

const motifs = upperRows(core.NFKB_MOTIFS);

// Values printed in lesson 2.3 (figure "motifs_score_count_profile").
const BOOK_SCORE_PER_COLUMN = [3, 4, 0, 0, 1, 1, 1, 5, 2, 3, 6, 4];
const BOOK_COUNT = [
  [2, 2, 0, 0, 0, 0, 9, 1, 1, 1, 3, 0],
  [1, 6, 0, 0, 0, 0, 0, 4, 1, 2, 4, 6],
  [0, 0, 10, 10, 9, 9, 1, 0, 0, 0, 0, 0],
  [7, 2, 0, 0, 1, 1, 0, 5, 8, 7, 3, 4]
];
const BOOK_PROFILE_TEXT = [
  ['.2', '.2', '0', '0', '0', '0', '.9', '.1', '.1', '.1', '.3', '0'],
  ['.1', '.6', '0', '0', '0', '0', '0', '.4', '.1', '.2', '.4', '.6'],
  ['0', '0', '1', '1', '.9', '.9', '.1', '0', '0', '0', '0', '0'],
  ['.7', '.2', '0', '0', '.1', '.1', '0', '.5', '.8', '.7', '.3', '.4']
];

check('NF-kB matrix is 10 x 12 and parses from the widget preload', () => {
  const parsed = core.parseMotifMatrix(core.NFKB_MOTIFS.join('\n'));
  assert.equal(parsed.error, null);
  assert.equal(parsed.motifs.length, 10);
  assert.equal(parsed.motifs[0].length, 12);
  assert.deepEqual(parsed.motifs, motifs);
});

check('preload upper case letters are exactly the popular letters (book figure)', () => {
  const consensus = core.consensusString(motifs);
  for (const row of core.NFKB_MOTIFS) {
    for (let column = 0; column < row.length; column++) {
      const isUpper = row[column] === row[column].toUpperCase();
      assert.equal(isUpper, row[column].toUpperCase() === consensus[column], 'row ' + row + ' column ' + (column + 1));
    }
  }
});

check('Score(Motifs) = 3 + 4 + 0 + 0 + 1 + 1 + 1 + 5 + 2 + 3 + 6 + 4 = 30', () => {
  assert.deepEqual(core.scorePerColumn(motifs), BOOK_SCORE_PER_COLUMN);
  assert.equal(core.scoreMotifs(motifs), 30);
});

check('Count(Motifs) matches the book', () => {
  assert.deepEqual(core.countMatrix(motifs), BOOK_COUNT);
});

check('Profile(Motifs) matches the book, printed in book style', () => {
  const profile = core.profileMatrix(motifs, 0);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 12; column++) {
      assert.equal(core.formatProfileEntry(profile[row][column]), BOOK_PROFILE_TEXT[row][column], 'row ' + row + ' column ' + column);
      assertClose(profile[row][column], BOOK_COUNT[row][column] / 10, 1e-12, 'profile value');
    }
  }
});

check('Consensus(Motifs) = TCGGGGATTTCC', () => {
  assert.equal(core.consensusString(motifs), 'TCGGGGATTTCC');
});

// Lesson 2.3 prints H(0, 0, 0.9, 0.1) as 0.467, but -(0.9 log2 0.9 + 0.1 log2 0.1) = 0.46900.
// That printed value is a book erratum; the widget shows the correct 0.469.
check('column entropies printed in lesson 2.3: 1.371, 0.971, 0 for column 3 (and 0.469, book erratum 0.467)', () => {
  const entropies = core.entropyPerColumn(core.profileMatrix(motifs, 0));
  assert.equal(core.formatEntropy(entropies[1]), '1.371');
  assert.equal(core.formatEntropy(entropies[11]), '0.971');
  assert.equal(core.formatEntropy(entropies[4]), '0.469');
  assertClose(entropies[4], -(0.9 * Math.log2(0.9) + 0.1 * Math.log2(0.1)), 1e-12, 'column 5 entropy');
  assert.equal(entropies[2], 0);
  assert.equal(core.entropy([0.25, 0.25, 0.25, 0.25]), 2);
  assert.equal(core.entropy([0, 0, 1, 0]), 0);
});

check('total entropy equals the sum of column entropies computed from scratch', () => {
  let expected = 0;
  for (let column = 0; column < 12; column++) {
    for (let row = 0; row < 4; row++) {
      const probability = BOOK_COUNT[row][column] / 10;
      if (probability > 0) {
        expected -= probability * Math.log2(probability);
      }
    }
  }
  const total = core.totalEntropy(core.profileMatrix(motifs, 0));
  assertClose(total, expected, 1e-12, 'total entropy');
  console.log('   NF-kB total entropy = ' + core.formatEntropy(total));
});

check('logo heights: each column stacks to 2 - H bits', () => {
  const profile = core.profileMatrix(motifs, 0);
  const entropies = core.entropyPerColumn(profile);
  for (let column = 0; column < 12; column++) {
    const heights = core.logoColumnHeights([profile[0][column], profile[1][column], profile[2][column], profile[3][column]]);
    let stackHeight = 0;
    for (const height of heights) {
      stackHeight += height;
    }
    assertClose(stackHeight, 2 - entropies[column], 1e-12, 'column ' + (column + 1));
  }
});

check('lesson 2.5: Pr(TCGGGGATTTCC | Profile) = 0.0205753 and Pr(ACGGGGATTACC | Profile) = 0.000839808', () => {
  const profile = core.profileMatrix(motifs, 0);
  assert.equal(core.formatProbability(core.kmerProbability('TCGGGGATTTCC', profile)), '0.0205753');
  assert.equal(core.formatProbability(core.kmerProbability('ACGGGGATTACC', profile)), '0.000839808');
  const factors = core.kmerProbabilityFactors('TCGGGGATTTCC', profile);
  const printed = [];
  for (const factor of factors) {
    printed.push(core.formatFactor(factor));
  }
  assert.equal(printed.join(' · '), '0.7 · 0.6 · 1.0 · 1.0 · 0.9 · 0.9 · 0.9 · 0.5 · 0.8 · 0.7 · 0.4 · 0.6');
});

check('lesson 2.6: without pseudocounts TCGTGGATTTCC has probability 0; with them it is positive', () => {
  assert.equal(core.kmerProbability('TCGTGGATTTCC', core.profileMatrix(motifs, 0)), 0);
  assert.ok(core.kmerProbability('TCGTGGATTTCC', core.profileMatrix(motifs, 1)) > 0);
});

check('Laplace pseudocounts: Profile = (Count + 1) / (t + 4), columns sum to 1', () => {
  const profile = core.profileMatrix(motifs, 1);
  for (let column = 0; column < 12; column++) {
    let columnSum = 0;
    for (let row = 0; row < 4; row++) {
      assertClose(profile[row][column], (BOOK_COUNT[row][column] + 1) / 14, 1e-12, 'pseudocount profile');
      columnSum += profile[row][column];
    }
    assertClose(columnSum, 1, 1e-12, 'column sum');
  }
});

check('brute force: Score(Motifs) = min over all k-mers of total Hamming distance, and equals distance to the consensus', () => {
  const random = makeRandom(20260927);
  for (let trial = 0; trial < 60; trial++) {
    const t = 1 + Math.floor(random() * 6);
    const k = 1 + Math.floor(random() * 5);
    const trialMotifs = [];
    for (let row = 0; row < t; row++) {
      trialMotifs.push(randomDna(k, random));
    }
    let bestTotal = Infinity;
    for (const pattern of allKmers(k)) {
      let total = 0;
      for (const motif of trialMotifs) {
        total += hammingDistance(pattern, motif);
      }
      if (total < bestTotal) {
        bestTotal = total;
      }
    }
    assert.equal(core.scoreMotifs(trialMotifs), bestTotal, 'trial ' + trial);
    const consensus = core.consensusString(trialMotifs);
    let consensusTotal = 0;
    for (const motif of trialMotifs) {
      consensusTotal += hammingDistance(consensus, motif);
    }
    assert.equal(consensusTotal, bestTotal, 'consensus distance, trial ' + trial);
  }
});

check('brute force: count and profile by direct tallying of each (symbol, column)', () => {
  const random = makeRandom(7);
  for (let trial = 0; trial < 40; trial++) {
    const t = 1 + Math.floor(random() * 8);
    const k = 1 + Math.floor(random() * 8);
    const trialMotifs = [];
    for (let row = 0; row < t; row++) {
      trialMotifs.push(randomDna(k, random));
    }
    const counts = core.countMatrix(trialMotifs);
    const profile = core.profileMatrix(trialMotifs, 0);
    for (let symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      for (let column = 0; column < k; column++) {
        let tally = 0;
        for (const motif of trialMotifs) {
          if (motif[column] === 'ACGT'[symbolIndex]) {
            tally += 1;
          }
        }
        assert.equal(counts[symbolIndex][column], tally);
        assertClose(profile[symbolIndex][column], tally / t, 1e-12, 'profile');
      }
    }
  }
});

check('brute force: Pr over all k-mers sums to 1 for small profiles', () => {
  const random = makeRandom(99);
  for (let trial = 0; trial < 20; trial++) {
    const k = 1 + Math.floor(random() * 5);
    const trialMotifs = [];
    for (let row = 0; row < 5; row++) {
      trialMotifs.push(randomDna(k, random));
    }
    for (const pseudocount of [0, 1]) {
      const profile = core.profileMatrix(trialMotifs, pseudocount);
      let total = 0;
      for (const kmer of allKmers(k)) {
        total += core.kmerProbability(kmer, profile);
      }
      assertClose(total, 1, 1e-9, 'sum of probabilities');
    }
  }
});

check('rolling the dice never produces a zero-probability letter and matches column frequencies', () => {
  const profile = core.profileMatrix(motifs, 0);
  const random = makeRandom(12345);
  const rolls = 20000;
  const firstColumnCounts = { A: 0, C: 0, G: 0, T: 0 };
  for (let roll = 0; roll < rolls; roll++) {
    const kmer = core.sampleKmer(profile, random);
    assert.equal(kmer.length, 12);
    assert.ok(core.kmerProbability(kmer, profile) > 0, 'sampled ' + kmer);
    firstColumnCounts[kmer[0]] += 1;
  }
  assertClose(firstColumnCounts.A / rolls, 0.2, 0.015, 'A frequency');
  assertClose(firstColumnCounts.C / rolls, 0.1, 0.015, 'C frequency');
  assert.equal(firstColumnCounts.G, 0);
  assertClose(firstColumnCounts.T / rolls, 0.7, 0.015, 'T frequency');
});

check('input validation returns plain-language errors and never throws', () => {
  assert.match(core.parseMotifMatrix('').error, /at least one/);
  assert.match(core.parseMotifMatrix('ACGT\nACG').error, /same length/);
  assert.match(core.parseMotifMatrix('ACGT\nACXT').error, /other than A, C, G, T/);
  assert.match(core.parseMotifMatrix('A'.repeat(21)).error, /at most 20/);
  const manyRows = [];
  for (let row = 0; row < 21; row++) {
    manyRows.push('ACGT');
  }
  assert.match(core.parseMotifMatrix(manyRows.join('\n')).error, /at most 20 rows/);
  assert.deepEqual(core.parseMotifMatrix(' acgt \n\nACGT\n').motifs, ['ACGT', 'ACGT']);
});

check('number formatting', () => {
  assert.equal(core.formatProfileEntry(3 / 14), '.214');
  assert.equal(core.formatProfileEntry(1), '1');
  assert.equal(core.formatProfileEntry(0), '0');
  assert.equal(core.formatFactor(1), '1.0');
  assert.equal(core.formatProbability(0), '0');
  assert.equal(core.formatProbability(1.2345678e-9), '1.23457 × 10^-9');
});

console.log(passed + ' checks passed');
