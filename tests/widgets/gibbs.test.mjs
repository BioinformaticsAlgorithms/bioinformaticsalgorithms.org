// Tests for the gibbs widget core: node tests/widgets/gibbs.test.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
const core = require('../../assets/widgets/gibbs.js');

let passed = 0;

function check(name, testFunction) {
  testFunction();
  passed += 1;
  console.log('ok - ' + name);
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, message + ': expected ' + expected + ', got ' + actual);
}

function upperAll(strings) {
  const upper = [];
  for (const text of strings) {
    upper.push(text.toUpperCase());
  }
  return upper;
}

function randomDna(length, random) {
  let text = '';
  for (let index = 0; index < length; index++) {
    text += 'ACGT'[Math.floor(random() * 4)];
  }
  return text;
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

// Brute-force score: min over all k-mers Pattern of the total Hamming distance to Motifs.
function bruteForceScore(motifs) {
  let best = Infinity;
  for (const pattern of allKmers(motifs[0].length)) {
    let total = 0;
    for (const motif of motifs) {
      for (let index = 0; index < pattern.length; index++) {
        if (pattern[index] !== motif[index]) {
          total += 1;
        }
      }
    }
    if (total < best) {
      best = total;
    }
  }
  return best;
}

// Brute-force profile: (occurrences + pseudocount) / (t + 4 pseudocount), tallied cell by cell.
function bruteForceProfileEntry(motifs, symbol, column, pseudocount) {
  let tally = 0;
  for (const motif of motifs) {
    if (motif[column] === symbol) {
      tally += 1;
    }
  }
  return (tally + pseudocount) / (motifs.length + 4 * pseudocount);
}

// Global optimum of Score over every choice of one k-mer per string (small inputs only).
function bruteForceBestScore(dna, k) {
  const choices = [];
  for (const text of dna) {
    const kmers = [];
    for (let position = 0; position + k <= text.length; position++) {
      kmers.push(text.substr(position, k).toUpperCase());
    }
    choices.push(kmers);
  }
  const t = dna.length;
  const counts = [];
  for (let column = 0; column < k; column++) {
    counts.push({ A: 0, C: 0, G: 0, T: 0 });
  }
  let best = Infinity;
  function scoreFromCounts() {
    let score = 0;
    for (const column of counts) {
      score += t - Math.max(column.A, column.C, column.G, column.T);
    }
    return score;
  }
  function choose(rowIndex) {
    if (rowIndex === t) {
      const score = scoreFromCounts();
      if (score < best) {
        best = score;
      }
      return;
    }
    for (const kmer of choices[rowIndex]) {
      for (let column = 0; column < k; column++) {
        counts[column][kmer[column]] += 1;
      }
      choose(rowIndex + 1);
      for (let column = 0; column < k; column++) {
        counts[column][kmer[column]] -= 1;
      }
    }
  }
  choose(0);
  return best;
}

check('Score(Motifs) and Profile(Motifs) agree with brute force on small random inputs', () => {
  const random = core.createRandom(424242);
  for (let trial = 0; trial < 80; trial++) {
    const t = 1 + Math.floor(random() * 6);
    const k = 1 + Math.floor(random() * 5);
    const motifs = [];
    for (let row = 0; row < t; row++) {
      motifs.push(randomDna(k, random));
    }
    assert.equal(core.scoreMotifs(motifs), bruteForceScore(motifs), 'score, trial ' + trial);
    for (const pseudocount of [0, 1]) {
      const profile = core.profileMatrix(motifs, k, pseudocount);
      for (let symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
        for (let column = 0; column < k; column++) {
          assertClose(profile[symbolIndex][column], bruteForceProfileEntry(motifs, 'ACGT'[symbolIndex], column, pseudocount), 1e-12, 'profile');
        }
      }
    }
  }
});

check('Profile-most probable k-mer agrees with brute force (first occurrence wins ties)', () => {
  const random = core.createRandom(8);
  for (let trial = 0; trial < 60; trial++) {
    const k = 1 + Math.floor(random() * 4);
    const text = randomDna(k + Math.floor(random() * 12), random);
    const motifs = [];
    for (let row = 0; row < 3; row++) {
      motifs.push(randomDna(k, random));
    }
    const profile = core.profileMatrix(motifs, k, trial % 2);
    let bestKmer = null;
    let bestProbability = -1;
    for (let position = 0; position + k <= text.length; position++) {
      const kmer = text.substr(position, k);
      let probability = 1;
      for (let index = 0; index < k; index++) {
        probability *= profile['ACGT'.indexOf(kmer[index])][index];
      }
      if (probability > bestProbability) {
        bestProbability = probability;
        bestKmer = kmer;
      }
    }
    assert.equal(core.profileMostProbableKmer(text, k, profile), bestKmer, 'trial ' + trial);
  }
});

check('BA2C sample (Rosalind textbook track): Profile-most probable 5-mer is CCGAG', () => {
  const text = 'ACCTGTTTATTGCCTAAGTTCCGAACAAACCCAATATAGCCCGAGGGCCT';
  const profile = [
    [0.2, 0.2, 0.3, 0.2, 0.3],
    [0.4, 0.3, 0.1, 0.5, 0.1],
    [0.3, 0.3, 0.5, 0.2, 0.4],
    [0.1, 0.2, 0.1, 0.1, 0.2]
  ];
  assert.equal(core.profileMostProbableKmer(text, 5, profile), 'CCGAG');
});

check('lesson 2.7: Profile of taac, GTct, ccgG, acta, AGGT and Pr(ttAC | Profile) = 0.0016', () => {
  const motifs = upperAll(['taac', 'GTct', 'ccgG', 'acta', 'AGGT']);
  const profile = core.profileMatrix(motifs, 4, 0);
  const expected = [
    [0.4, 0.2, 0.2, 0.2],
    [0.2, 0.4, 0.2, 0.2],
    [0.2, 0.2, 0.4, 0.2],
    [0.2, 0.2, 0.2, 0.4]
  ];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      assertClose(profile[row][column], expected[row][column], 1e-12, 'profile entry');
    }
  }
  assertClose(core.kmerProbability('TTAC', profile), 0.0016, 1e-12, 'Pr(ttAC)');
});

check('lesson 2.8: Motifs(Profile, Dna) from that profile captures all five implanted motifs', () => {
  const profile = core.profileMatrix(upperAll(['taac', 'GTct', 'ccgG', 'acta', 'AGGT']), 4, 0);
  const positions = core.motifPositionsFromProfile(profile, upperAll(core.BOOK_DNA), 4);
  assert.deepEqual(core.motifsAt(core.BOOK_DNA, positions, 4), ['ACCT', 'ATGT', 'GCGT', 'ACGA', 'AGGT']);
});

check('lesson 2.10: pseudocount probabilities in ccgGCGTtag are 4, 8, 8, 24, 12, 16, 8 over 8^4', () => {
  const others = upperAll(['taac', 'GTct', 'acta', 'AGGT']);
  const profile = core.profileMatrix(others, 4, 1);
  const probabilities = core.kmerProbabilities('ccgGCGTtag'.toUpperCase(), 4, profile);
  const expectedNumerators = [4, 8, 8, 24, 12, 16, 8];
  assert.equal(probabilities.length, 7);
  let total = 0;
  for (let index = 0; index < 7; index++) {
    assertClose(probabilities[index], expectedNumerators[index] / 4096, 1e-15, 'k-mer ' + (index + 1));
    total += probabilities[index];
  }
  assertClose(total, 80 / 4096, 1e-15, 'C = 80/8^4');
  assert.deepEqual(core.motifsExcept(['a', 'b', 'c'], 1), ['a', 'c']);
});

check('Random(p1, ..., pn) rolls each face in proportion to its weight and never a zero face', () => {
  const random = core.createRandom(31337);
  const weights = [4, 8, 8, 24, 12, 16, 8, 0];
  const tallies = [0, 0, 0, 0, 0, 0, 0, 0];
  const rolls = 80000;
  for (let roll = 0; roll < rolls; roll++) {
    tallies[core.biasedDieRoll(weights, random)] += 1;
  }
  assert.equal(tallies[7], 0);
  for (let face = 0; face < 7; face++) {
    assertClose(tallies[face] / rolls, weights[face] / 80, 0.01, 'face ' + (face + 1));
  }
});

check('seeded runs replay exactly (Reset) and different seeds differ (New seed)', () => {
  for (const algorithm of ['randomized', 'gibbs']) {
    const first = core.createSearch({ dna: core.BOOK_DNA, k: 4, algorithm: algorithm, iterationsPerRun: 20, seed: 1 });
    const second = core.createSearch({ dna: core.BOOK_DNA, k: 4, algorithm: algorithm, iterationsPerRun: 20, seed: 1 });
    const other = core.createSearch({ dna: core.BOOK_DNA, k: 4, algorithm: algorithm, iterationsPerRun: 20, seed: 2 });
    const firstTrace = [];
    const secondTrace = [];
    const otherTrace = [];
    for (let step = 0; step < 60; step++) {
      core.advanceSearch(first);
      core.advanceSearch(second);
      core.advanceSearch(other);
      firstTrace.push(first.positions.join(','));
      secondTrace.push(second.positions.join(','));
      otherTrace.push(other.positions.join(','));
    }
    assert.deepEqual(firstTrace, secondTrace, algorithm + ' replay');
    assert.notDeepEqual(firstTrace, otherTrace, algorithm + ' new seed');
  }
});

check('RandomizedMotifSearch run: Score strictly drops until the single non-improving step that ends it', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const search = core.createSearch({ dna: core.SAMPLE_DNA, k: 8, algorithm: 'randomized', seed: seed });
    let previousBest = search.runBest.score;
    while (!search.runFinished) {
      const event = core.advanceSearch(search);
      if (event.improved) {
        assert.ok(search.score < previousBest);
        previousBest = search.score;
      } else {
        assert.ok(search.score >= previousBest);
        assert.ok(search.runFinished);
      }
    }
    assert.ok(search.best.score <= search.history[0].score);
  }
});

check('GibbsSampler run: exactly N iterations per random start, best-so-far never increases', () => {
  const search = core.createSearch({ dna: core.SAMPLE_DNA, k: 8, algorithm: 'gibbs', iterationsPerRun: 30, seed: 5 });
  core.runStarts(search, 3);
  let starts = 0;
  let iterationsInRun = 0;
  const iterationCounts = [];
  for (let index = 0; index < search.history.length; index++) {
    const point = search.history[index];
    if (point.runStart) {
      if (starts > 0) {
        iterationCounts.push(iterationsInRun);
      }
      starts += 1;
      iterationsInRun = 0;
    } else {
      iterationsInRun += 1;
    }
    if (index > 0) {
      assert.ok(point.best <= search.history[index - 1].best);
    }
    assert.ok(point.best <= point.score);
  }
  iterationCounts.push(iterationsInRun);
  assert.deepEqual(iterationCounts, [30, 30, 30]);
});

// Score of the published sample output of BA2F and BA2G (the same five 8-mers).
const SAMPLE_OUTPUT = ['TCTCGGGG', 'CCAAGGTG', 'TACAGGCG', 'TTCAGGTG', 'TCCACGTG'];

check('BA2F/BA2G sample output has Score 9, and brute force over all 25^5 choices confirms 9 is optimal', () => {
  assert.equal(core.scoreMotifs(SAMPLE_OUTPUT), 9);
  assert.equal(bruteForceBestScore(core.SAMPLE_DNA, 8), 9);
});

check('book example: the implanted ACGT motifs score 5, which brute force confirms is optimal', () => {
  assert.equal(core.scoreMotifs(['ACCT', 'ATGT', 'GCGT', 'ACGA', 'AGGT']), 5);
  const optimum = bruteForceBestScore(core.BOOK_DNA, 4);
  assert.equal(optimum, 5);
});

// A single RandomizedMotifSearch start reaches Score 9 on the BA2F sample only about 0.25% of the
// time (an independent Python implementation measures the same rate), so 1,000 starts find it in
// roughly 9 of 10 seeds. Over many seeds the best found must equal 9, and never go below it.
check('RandomizedMotifSearch with 1,000 starts (as in BA2F) reaches the optimum 9 over many seeds', () => {
  let seedsAtOptimum = 0;
  let exactSampleMatches = 0;
  let lowest = Infinity;
  const seeds = 20;
  for (let seed = 1; seed <= seeds; seed++) {
    const search = core.createSearch({ dna: core.SAMPLE_DNA, k: 8, algorithm: 'randomized', seed: seed });
    const best = core.runStarts(search, 1000);
    assert.ok(best.score >= 9, 'cannot beat the brute-force optimum');
    if (best.score < lowest) {
      lowest = best.score;
    }
    if (best.score === 9) {
      seedsAtOptimum += 1;
    }
    if (core.motifsAt(core.SAMPLE_DNA, best.positions, 8).join(' ') === SAMPLE_OUTPUT.join(' ')) {
      exactSampleMatches += 1;
    }
  }
  console.log('   RandomizedMotifSearch reached Score 9 on ' + seedsAtOptimum + ' of ' + seeds + ' seeds; ' + exactSampleMatches + ' returned exactly the sample output motifs');
  assert.equal(lowest, 9);
  assert.ok(seedsAtOptimum >= seeds / 2, 'most seeds should reach the optimum');
});

check('GibbsSampler (N = 100, 20 starts, as in BA2G) reaches the optimum 9 over many seeds', () => {
  let seedsAtOptimum = 0;
  let lowest = Infinity;
  const seeds = 40;
  for (let seed = 1; seed <= seeds; seed++) {
    const search = core.createSearch({ dna: core.SAMPLE_DNA, k: 8, algorithm: 'gibbs', iterationsPerRun: 100, seed: seed });
    const best = core.runStarts(search, 20);
    assert.ok(best.score >= 9, 'cannot beat the brute-force optimum');
    if (best.score < lowest) {
      lowest = best.score;
    }
    if (best.score === 9) {
      seedsAtOptimum += 1;
    }
  }
  console.log('   GibbsSampler reached Score 9 on ' + seedsAtOptimum + ' of ' + seeds + ' seeds');
  assert.equal(lowest, 9);
  assert.ok(seedsAtOptimum >= seeds / 2, 'most seeds should reach the optimum');
});

// On the tiny book example the pseudocounts (4 real counts vs 4 pseudocounts per column) make
// GibbsSampler wander: it sits at the optimum only about 0.5% of the time, so a few seeds miss it.
check('both algorithms reach the brute-force optimum 5 on the book example over many seeds', () => {
  const optimum = bruteForceBestScore(core.BOOK_DNA, 4);
  for (const algorithm of ['randomized', 'gibbs']) {
    let seedsAtOptimum = 0;
    const seeds = 20;
    for (let seed = 1; seed <= seeds; seed++) {
      const search = core.createSearch({ dna: core.BOOK_DNA, k: 4, algorithm: algorithm, iterationsPerRun: 50, seed: seed });
      const best = core.runStarts(search, algorithm === 'gibbs' ? 20 : 200);
      assert.ok(best.score >= optimum, 'cannot beat the brute-force optimum');
      if (best.score === optimum) {
        seedsAtOptimum += 1;
      }
    }
    console.log('   ' + algorithm + ' reached Score ' + optimum + ' on ' + seedsAtOptimum + ' of ' + seeds + ' seeds');
    assert.ok(seedsAtOptimum >= seeds / 2, algorithm + ': most seeds should reach the optimum');
  }
});

check('input validation gives plain-language errors', () => {
  assert.match(core.parseDna('ACGT', '2').error, /at least 2/);
  assert.match(core.parseDna('ACGT\nACXT', '2').error, /other than A, C, G, T/);
  assert.match(core.parseDna('ACGT\nACGT', '13').error, /k must be/);
  assert.match(core.parseDna('ACGT\nACG', '4').error, /shorter than k/);
  assert.match(core.parseDna('A'.repeat(61) + '\nACGT', '2').error, /at most 60/);
  const parsed = core.parseDna(' acgt \n\nGGTT\n', '3');
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.dna, ['acgt', 'GGTT']);
});

console.log(passed + ' checks passed');
