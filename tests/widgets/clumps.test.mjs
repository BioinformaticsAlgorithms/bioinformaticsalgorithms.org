// Tests for the algorithm core of assets/widgets/clumps.js.
// Run with: node tests/widgets/clumps.test.mjs   (exit code 0 = pass)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const clumps = require('../../assets/widgets/clumps.js');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

function presetById(presetId) {
  return clumps.PRESETS.find((preset) => preset.id === presetId);
}

// The longest run of a/c/g/t (lowercase or uppercase) in a lesson file after stripping tags.
function longestDnaInLesson(fileName) {
  const html = readFileSync(path.join(repoRoot, '_lessons', 'ch1', fileName), 'utf8');
  const plain = html.replace(/<[^>]*>/g, '');
  const runs = plain.match(/[acgtACGT]{200,}/g) || [];
  let longest = '';
  for (const run of runs) {
    if (run.length > longest.length) {
      longest = run;
    }
  }
  return longest.toUpperCase();
}

/* ----- Brute force, straight from the book's pseudocode ----- */

function bruteForcePatternCount(text, pattern) {
  let count = 0;
  for (let i = 0; i <= text.length - pattern.length; i++) {
    let matches = true;
    for (let j = 0; j < pattern.length; j++) {
      if (text[i + j] !== pattern[j]) {
        matches = false;
      }
    }
    if (matches) {
      count += 1;
    }
  }
  return count;
}

// FrequentWords(Text, k): the slow version that calls PatternCount for every k-mer.
function bruteForceFrequentWords(text, k) {
  const countArray = [];
  for (let i = 0; i <= text.length - k; i++) {
    countArray.push(bruteForcePatternCount(text, text.substr(i, k)));
  }
  const maxCount = Math.max(...countArray);
  const frequentPatterns = new Set();
  for (let i = 0; i <= text.length - k; i++) {
    if (countArray[i] === maxCount) {
      frequentPatterns.add(text.substr(i, k));
    }
  }
  return Array.from(frequentPatterns).sort();
}

// FindClumps(Text, k, L, t): rebuild every window from scratch, as the lesson's pseudocode does.
function bruteForceFindClumps(text, k, L, t) {
  const patterns = new Set();
  for (let i = 0; i <= text.length - L; i++) {
    const window = text.substr(i, L);
    for (let j = 0; j <= window.length - k; j++) {
      const pattern = window.substr(j, k);
      if (bruteForcePatternCount(window, pattern) >= t) {
        patterns.add(pattern);
      }
    }
  }
  return Array.from(patterns).sort();
}

function randomDna(length, random, alphabet) {
  let text = '';
  for (let index = 0; index < length; index++) {
    text += alphabet[Math.floor(random() * alphabet.length)];
  }
  return text;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/* ----- The book's own examples and the sample datasets ----- */

check('Vibrio cholerae preset is exactly the ori printed in lesson 1.2', () => {
  const fromLesson = longestDnaInLesson('03-frequent-words-problem.html');
  assert.equal(fromLesson.length, 540);
  assert.equal(presetById('vibrio').text, fromLesson);
});

check('Thermotoga petrophila preset is exactly the ori printed in lesson 1.4', () => {
  const fromLesson = longestDnaInLesson('05-clump-finding-problem.html');
  assert.equal(presetById('thermotoga').text, fromLesson);
});

check('Frequent Words sample dataset (BA1B): k = 4 gives CATG GCAT', () => {
  assert.deepEqual(clumps.betterFrequentWords('ACGTTGCATGTCGCATGATGCATGAGAGCT', 4), ['CATG', 'GCAT']);
});

check('Clump Finding sample dataset (BA1E): k = 5, L = 50, t = 4 gives CGACA GAAGA', () => {
  const text = 'CGGACTCGACAGATGTGAAGAACGACAATGTGAAGACTCGACACGACAGAGTGAAGAGAAGAGGAAACATTGTAA';
  assert.deepEqual(clumps.findClumps(text, 5, 50, 4), ['CGACA', 'GAAGA']);
});

check('Pattern Count sample dataset (BA1A): Count(GCGCG, GCG) = 2', () => {
  assert.equal(clumps.patternCount('GCGCG', 'GCG'), 2);
});

check('lesson 1.2: Count(ACAACTATGCATACTATCGGGAACTATCCT, ACTAT) = 3 and ACTAT is a most frequent 5-mer', () => {
  const text = 'ACAACTATGCATACTATCGGGAACTATCCT';
  assert.equal(clumps.patternCount(text, 'ACTAT'), 3);
  assert.ok(clumps.betterFrequentWords(text, 5).includes('ACTAT'));
});

check('lesson 1.2: overlapping occurrences count, Count(CGATATATCCATAG, ATA) = 3', () => {
  assert.equal(clumps.patternCount('CGATATATCCATAG', 'ATA'), 3);
  assert.deepEqual(clumps.patternPositions('CGATATATCCATAG', 'ATA'), [2, 4, 10]);
  assert.ok(clumps.betterFrequentWords('CGATATATCCATAG', 3).includes('ATA'));
});

check('lesson 1.2: Text(4, 3) of GACCATACTG is ATA', () => {
  assert.deepEqual(clumps.patternPositions('GACCATACTG', 'ATA'), [4]);
});

check('lesson 1.2 figure: Count(0) = Count(4) = 2 for ACT in ACTGACTCCCACCCC', () => {
  const table = clumps.frequencyTable('ACTGACTCCCACCCC', 3);
  assert.equal(table.get('ACT'), 2);
});

check('lesson 1.2 figure: frequency table of ACGTTTCACGTTTTACGG with k = 3', () => {
  const table = clumps.frequencyTable('ACGTTTCACGTTTTACGG', 3);
  const expected = { ACG: 3, CGT: 2, GTT: 2, TTT: 3, TTC: 1, TCA: 1, CAC: 1, TTA: 1, TAC: 1, CGG: 1 };
  assert.deepEqual(Object.fromEntries(table), expected);
});

check('lesson 1.2: ATGATCAAG appears three times in the Vibrio cholerae ori', () => {
  assert.equal(clumps.patternCount(presetById('vibrio').text, 'ATGATCAAG'), 3);
});

check('lesson 1.2: exactly four 9-mers appear 3 or more times in the Vibrio cholerae ori', () => {
  const entries = clumps.sortedFrequencyEntries(clumps.frequencyTable(presetById('vibrio').text, 9));
  const frequent = entries.filter((entry) => entry.count >= 3).map((entry) => entry.pattern).sort();
  assert.deepEqual(frequent, ['ATGATCAAG', 'CTCTTGATC', 'CTTGATCAT', 'TCTTGATCA']);
});

check('lesson 1.4: ATGATCAAG forms a (500, 3)-clump in the Vibrio cholerae ori', () => {
  assert.ok(clumps.findClumps(presetById('vibrio').text, 9, 500, 3).includes('ATGATCAAG'));
});

check('lesson 1.4: Thermotoga ori has no ATGATCAAG or CTTGATCAT', () => {
  const text = presetById('thermotoga').text;
  assert.equal(clumps.patternCount(text, 'ATGATCAAG'), 0);
  assert.equal(clumps.patternCount(text, 'CTTGATCAT'), 0);
});

check('lesson 1.4: the six 9-mers appearing 3 or more times in the Thermotoga ori', () => {
  const entries = clumps.sortedFrequencyEntries(clumps.frequencyTable(presetById('thermotoga').text, 9));
  const frequent = entries.filter((entry) => entry.count >= 3).map((entry) => entry.pattern).sort();
  assert.deepEqual(frequent, ['AAACCTACC', 'AACCTACCA', 'ACCTACCAC', 'CCTACCACC', 'GGTAGGTTT', 'TGGTAGGTT']);
});

check('lesson 1.4: CCTACCACC and GGTGGTAGG together appear five times; CCTACCACC forms a (500, 3)-clump', () => {
  const text = presetById('thermotoga').text;
  assert.equal(clumps.patternCount(text, 'CCTACCACC') + clumps.patternCount(text, 'GGTGGTAGG'), 5);
  assert.ok(clumps.findClumps(text, 9, 500, 3).includes('CCTACCACC'));
});

check('lesson 1.4: TGCA forms a (25, 3)-clump in the example Genome', () => {
  const text = presetById('tgca').text;
  assert.ok(clumps.findClumps(text, 4, 25, 3).includes('TGCA'));
});

check('every preset validates and has legal parameters', () => {
  for (const preset of clumps.PRESETS) {
    const cleaned = clumps.normalizeText(preset.text, clumps.MAX_TEXT_LENGTH);
    assert.equal(cleaned.ok, true, preset.id);
    assert.equal(cleaned.text, preset.text, preset.id);
    const parameters = clumps.parseParameters(preset.k, preset.L, preset.t, preset.text.length);
    assert.equal(parameters.ok, true, preset.id + ': ' + parameters.error);
  }
});

/* ----- Brute force on random small strings ----- */

check('brute force: PatternCount and positions on 3,000 random cases', () => {
  const random = seededRandom(1);
  for (let trial = 0; trial < 3000; trial++) {
    const alphabet = trial % 2 === 0 ? 'ACGT' : 'AC';
    const text = randomDna(1 + Math.floor(random() * 25), random, alphabet);
    const pattern = randomDna(1 + Math.floor(random() * 4), random, alphabet);
    assert.equal(clumps.patternCount(text, pattern), bruteForcePatternCount(text, pattern), text + ' / ' + pattern);
    for (const position of clumps.patternPositions(text, pattern)) {
      assert.equal(text.substr(position, pattern.length), pattern);
    }
  }
});

check('brute force: BetterFrequentWords equals FrequentWords on 3,000 random strings', () => {
  const random = seededRandom(2);
  for (let trial = 0; trial < 3000; trial++) {
    const alphabet = trial % 3 === 0 ? 'AT' : 'ACGT';
    const text = randomDna(1 + Math.floor(random() * 30), random, alphabet);
    const k = 1 + Math.floor(random() * Math.min(5, text.length));
    assert.deepEqual(clumps.betterFrequentWords(text, k), bruteForceFrequentWords(text, k), text + ' k=' + k);
  }
});

check('brute force: the sorted frequency table lists every k-mer with its PatternCount', () => {
  const random = seededRandom(3);
  for (let trial = 0; trial < 1000; trial++) {
    const text = randomDna(1 + Math.floor(random() * 30), random, 'ACGT');
    const k = 1 + Math.floor(random() * Math.min(4, text.length));
    const entries = clumps.sortedFrequencyEntries(clumps.frequencyTable(text, k));
    let total = 0;
    for (let index = 0; index < entries.length; index++) {
      total += entries[index].count;
      assert.equal(entries[index].count, bruteForcePatternCount(text, entries[index].pattern));
      if (index > 0) {
        assert.ok(entries[index - 1].count >= entries[index].count);
      }
    }
    assert.equal(total, text.length - k + 1);
  }
});

check('brute force: sliding FindClumps equals rebuilding every window, on 3,000 random cases', () => {
  const random = seededRandom(4);
  for (let trial = 0; trial < 3000; trial++) {
    const alphabet = trial % 2 === 0 ? 'ACGT' : 'AG';
    const text = randomDna(1 + Math.floor(random() * 40), random, alphabet);
    const k = 1 + Math.floor(random() * Math.min(4, text.length));
    const L = k + Math.floor(random() * (text.length - k + 1));
    const t = 1 + Math.floor(random() * 4);
    const label = text + ' k=' + k + ' L=' + L + ' t=' + t;
    assert.deepEqual(clumps.findClumps(text, k, L, t), bruteForceFindClumps(text, k, L, t), label);
  }
});

check('brute force: per-window clumps and the running union agree with rebuilding windows', () => {
  const random = seededRandom(5);
  for (let trial = 0; trial < 500; trial++) {
    const text = randomDna(5 + Math.floor(random() * 30), random, 'ACG');
    const k = 1 + Math.floor(random() * 3);
    const L = k + Math.floor(random() * (text.length - k + 1));
    const t = 2 + Math.floor(random() * 2);
    const slid = clumps.slideWindows(text, k, L, t, text.length - L);
    const union = new Set();
    for (let start = 0; start <= text.length - L; start++) {
      const inWindow = clumps.windowClumps(text, start, k, L, t);
      for (const entry of inWindow) {
        assert.equal(entry.count, bruteForcePatternCount(text.substr(start, L), entry.pattern));
        assert.ok(entry.count >= t);
        union.add(entry.pattern);
      }
      assert.equal(slid.windowHasClump[start], inWindow.length > 0);
      assert.deepEqual(clumps.clumpsThroughWindow(text, k, L, t, start), Array.from(union).sort());
    }
  }
});

check('occurrenceMarks covers overlapping occurrences and marks each start', () => {
  const text = 'CGATATATCCATAG';
  const positions = clumps.patternPositions(text, 'ATA');
  const marks = clumps.occurrenceMarks(text.length, positions, 3);
  assert.deepEqual(marks, [0, 0, 2, 1, 2, 1, 1, 0, 0, 0, 2, 1, 1, 0]);
});

/* ----- Input validation never throws ----- */

check('normalizeText ignores whitespace and newlines, uppercases, drops FASTA headers', () => {
  assert.deepEqual(clumps.normalizeText('>seq\n acg t\r\n\tgca ', 100), { ok: true, text: 'ACGTGCA' });
});

check('normalizeText rejects bad letters, empty input and over-long input in plain words', () => {
  const bad = clumps.normalizeText('ACGU', 100);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /U/);
  assert.equal(clumps.normalizeText('   ', 100).ok, false);
  const long = clumps.normalizeText('A'.repeat(clumps.MAX_TEXT_LENGTH + 1), clumps.MAX_TEXT_LENGTH);
  assert.equal(long.ok, false);
  assert.match(long.error, /10,000/);
});

check('parseParameters rejects impossible k, L and t', () => {
  assert.equal(clumps.parseParameters('0', '10', '2', 20).ok, false);
  assert.equal(clumps.parseParameters('5', '4', '2', 20).ok, false);
  assert.equal(clumps.parseParameters('5', '21', '2', 20).ok, false);
  assert.equal(clumps.parseParameters('5', '10', '0', 20).ok, false);
  assert.equal(clumps.parseParameters('2.5', '10', '2', 20).ok, false);
  assert.equal(clumps.parseParameters('abc', '10', '2', 20).ok, false);
  assert.equal(clumps.parseParameters('30', '30', '2', 20).ok, false);
  assert.deepEqual(clumps.parseParameters(' 5 ', '10', '2', 20), { ok: true, k: 5, L: 10, t: 2 });
});

check('10,000 nucleotides with k = 9 and L = 500 compute quickly', () => {
  const random = seededRandom(6);
  const text = randomDna(clumps.MAX_TEXT_LENGTH, random, 'ACGT');
  const start = Date.now();
  clumps.findClumps(text, 9, 500, 3);
  clumps.betterFrequentWords(text, 9);
  clumps.clumpsThroughWindow(text, 9, 500, 3, text.length - 500);
  assert.ok(Date.now() - start < 1000);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
