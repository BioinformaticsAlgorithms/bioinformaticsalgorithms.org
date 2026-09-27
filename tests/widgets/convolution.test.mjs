// Tests for the convolution widget core: node tests/widgets/convolution.test.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
const core = require('../../assets/widgets/convolution.js');

let passed = 0;

function check(name, testFunction) {
  const startedAt = Date.now();
  testFunction();
  passed += 1;
  console.log('ok - ' + name + ' (' + (Date.now() - startedAt) + ' ms)');
}

function parseNumbers(text) {
  return text.trim().split(/\s+/).map(Number);
}

function sortedCopy(numbers) {
  return numbers.slice().sort((first, second) => first - second);
}

const INTEGER_MASS = {
  G: 57, A: 71, S: 87, P: 97, V: 99, T: 101, C: 103, I: 113, L: 113, N: 114,
  D: 115, K: 128, Q: 128, E: 129, M: 131, H: 137, F: 147, R: 156, Y: 163, W: 186
};

function masses(letters) {
  return core.lettersToMasses(letters, INTEGER_MASS);
}

function massString(letters) {
  return masses(letters).join('-');
}

// Brute force pieces, written independently of the core.
function bruteConvolution(spectrum) {
  const differences = [];
  for (const first of spectrum) {
    for (const second of spectrum) {
      if (first > second) {
        differences.push(first - second);
      }
    }
  }
  return sortedCopy(differences);
}

function bruteSubpeptideMasses(peptide, isCyclic) {
  const result = [0];
  const length = peptide.length;
  if (length === 0) {
    return result;
  }
  result.push(peptide.reduce((sum, mass) => sum + mass, 0));
  for (let pieceLength = 1; pieceLength < length; pieceLength += 1) {
    const starts = isCyclic ? length : length - pieceLength + 1;
    for (let start = 0; start < starts; start += 1) {
      let total = 0;
      for (let offset = 0; offset < pieceLength; offset += 1) {
        total += peptide[(start + offset) % length];
      }
      result.push(total);
    }
  }
  return sortedCopy(result);
}

function bruteScore(theoretical, spectrum) {
  const remaining = spectrum.slice();
  let score = 0;
  for (const mass of theoretical) {
    const position = remaining.indexOf(mass);
    if (position !== -1) {
      score += 1;
      remaining.splice(position, 1);
    }
  }
  return score;
}

const BOOK_NQEL_SPECTRUM = parseNumbers('0 99 113 114 128 227 257 299 355 356 370 371 484');
const BOOK_NQEL_THEORETICAL = parseNumbers('0 113 114 128 129 227 242 242 257 355 356 370 371 484');
const SPECTRUM_10 = parseNumbers('0 97 99 114 128 147 147 163 186 227 241 242 244 260 261 262 283 291 333 340 357 385 389 390 390 405 430 430 447 485 487 503 504 518 543 544 552 575 577 584 632 650 651 671 672 690 691 738 745 747 770 778 779 804 818 819 820 835 837 875 892 917 932 932 933 934 965 982 989 1030 1039 1060 1061 1062 1078 1080 1081 1095 1136 1159 1175 1175 1194 1194 1208 1209 1223 1225 1322');
const SPECTRUM_25 = parseNumbers('0 97 99 113 114 115 128 128 147 147 163 186 227 241 242 244 244 256 260 261 262 283 291 309 330 333 340 347 385 388 389 390 390 405 435 447 485 487 503 504 518 544 552 575 577 584 599 608 631 632 650 651 653 672 690 691 717 738 745 770 779 804 818 819 827 835 837 875 892 892 917 932 932 933 934 965 982 989 1039 1060 1062 1078 1080 1081 1095 1136 1159 1175 1175 1194 1194 1208 1209 1223 1322');

function formatTop(groups) {
  return groups.map((group) => group.mass + ' (' + group.count + ')').join(', ');
}

// ---------------- Convolution ----------------

check('BA4H sample: convolution of 0 137 186 323', () => {
  assert.deepEqual(core.spectralConvolution([0, 137, 186, 323]), sortedCopy(parseNumbers('137 137 186 186 323 49')));
});

check('book 4.9: widget preset is the simulated NQEL spectrum', () => {
  assert.deepEqual(core.BOOK_NQEL_SPECTRUM, BOOK_NQEL_SPECTRUM);
});

check('book 4.9: top masses of the simulated NQEL convolution are 113 (4), 114 (4), 128 (4), 99 (3), 129 (3)', () => {
  const top = core.topConvolutionMasses(core.spectralConvolution(BOOK_NQEL_SPECTRUM), 5);
  assert.equal(formatTop(top), '113 (4), 114 (4), 128 (4), 99 (3), 129 (3)');
});

check('book 4.9: top masses of the theoretical NQEL convolution are 113, 114, 128, 129 (8 each)', () => {
  const top = core.topConvolutionMasses(core.spectralConvolution(BOOK_NQEL_THEORETICAL), 4);
  assert.equal(formatTop(top), '113 (8), 114 (8), 128 (8), 129 (8)');
});

check('book 4.9: ten most frequent convolution masses of Spectrum10', () => {
  const top = core.topConvolutionMasses(core.spectralConvolution(SPECTRUM_10), 10);
  const expected = [[147, 35], [128, 31], [97, 28], [113, 28], [114, 26], [186, 23], [57, 21], [163, 21], [99, 18], [145, 18]];
  assert.deepEqual(top.map((group) => [group.mass, group.count]), expected);
});

check('top M keeps ties with the M-th mass', () => {
  const convolution = core.spectralConvolution(BOOK_NQEL_SPECTRUM);
  assert.equal(core.topConvolutionMasses(convolution, 1).length, 3);
  assert.equal(core.topConvolutionMasses(convolution, 4).length, 5);
  const ranked = core.rankedConvolutionMasses(convolution);
  for (const group of ranked) {
    assert.ok(group.mass >= 57 && group.mass <= 200);
  }
});

check('brute force: convolution on random spectra', () => {
  let seed = 7;
  function nextRandom() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }
  for (let trial = 0; trial < 200; trial += 1) {
    const size = 1 + Math.floor(nextRandom() * 25);
    const spectrum = [];
    for (let index = 0; index < size; index += 1) {
      spectrum.push(Math.floor(nextRandom() * 600));
    }
    assert.deepEqual(core.spectralConvolution(spectrum), bruteConvolution(spectrum));
  }
});

// ---------------- Spectra and scoring ----------------

check('book 4.4: Cyclospectrum(NQEL) from masses', () => {
  assert.deepEqual(core.cyclicSpectrum(masses('NQEL')), BOOK_NQEL_THEORETICAL);
});

check('BA4F sample: Score(NQEL, Spectrum) = 11', () => {
  assert.equal(core.cyclicScore(masses('NQEL'), BOOK_NQEL_SPECTRUM), 11);
});

check('BA4K sample (book 4.7): LinearScore(NQEL, Spectrum) = 8', () => {
  assert.equal(core.linearScore(masses('NQEL'), BOOK_NQEL_SPECTRUM), 8);
});

check('book 4.7: multiplicity rule for 242', () => {
  const theoretical = core.cyclicSpectrum(masses('NQEL'));
  assert.equal(core.cyclicScore(masses('NQEL'), theoretical), 14);
  const onlyOne242 = theoretical.slice();
  onlyOne242.splice(onlyOne242.indexOf(242), 1);
  assert.equal(core.cyclicScore(masses('NQEL'), onlyOne242), 13);
  assert.equal(core.cyclicScore(masses('NQEL'), theoretical.concat([242])), 14);
});

check('brute force: spectra and scores on random mass peptides', () => {
  let seed = 99;
  function nextRandom() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }
  for (let trial = 0; trial < 200; trial += 1) {
    const length = Math.floor(nextRandom() * 9);
    const peptide = [];
    for (let index = 0; index < length; index += 1) {
      peptide.push(core.AMINO_ACID_MASSES[Math.floor(nextRandom() * 18)]);
    }
    assert.deepEqual(core.cyclicSpectrum(peptide), bruteSubpeptideMasses(peptide, true));
    assert.deepEqual(core.linearSpectrum(peptide), bruteSubpeptideMasses(peptide, false));
    assert.equal(core.cyclicScore(peptide, SPECTRUM_10), bruteScore(core.cyclicSpectrum(peptide), SPECTRUM_10));
    assert.equal(core.linearScore(peptide, SPECTRUM_25), bruteScore(core.linearSpectrum(peptide), SPECTRUM_25));
  }
});

// ---------------- Trim ----------------

check('BA4L sample: Trim(LAST ALST TLLT TQAS, Spectrum, 2) = LAST ALST', () => {
  const leaderboard = ['LAST', 'ALST', 'TLLT', 'TQAS'].map(masses);
  const spectrum = parseNumbers('0 71 87 101 113 158 184 188 259 271 372');
  const trimmed = core.trim(leaderboard, spectrum, 2).map(core.peptideName);
  assert.deepEqual(trimmed, [massString('LAST'), massString('ALST')]);
});

check('Trim keeps everyone tied with the N-th peptide', () => {
  const spectrum = parseNumbers('0 57 71 128');
  const leaderboard = [[57], [71], [99], [57, 71], [101]];
  const trimmed = core.trim(leaderboard, spectrum, 1).map(core.peptideName);
  assert.deepEqual(trimmed, ['57-71']);
  const trimmedTwo = core.trim(leaderboard, spectrum, 2).map(core.peptideName);
  assert.deepEqual(trimmedTwo, ['57-71', '57', '71']);
  assert.equal(core.trim(leaderboard, spectrum, 10).length, 5);
});

// ---------------- Leaderboard sequencing ----------------

check('BA4G sample: LeaderboardCyclopeptideSequencing(N = 10) finds a peptide scoring like 113-147-71-129', () => {
  const spectrum = parseNumbers('0 71 113 129 147 200 218 260 313 331 347 389 460');
  const result = core.leaderboardSequencing(spectrum, 10, core.AMINO_ACID_MASSES);
  const expectedScore = core.cyclicScore([113, 147, 71, 129], spectrum);
  assert.equal(expectedScore, 13);
  assert.equal(result.leaderScore, expectedScore);
  assert.equal(result.leader.reduce((sum, mass) => sum + mass, 0), 460);
  const leaderNames = result.tiedLeaders.map(core.peptideName);
  assert.ok(leaderNames.includes('113-147-71-129'), leaderNames.join(' '));
});

check('BA4E sample: on an ideal spectrum the leaders are exactly the six cyclic rotations/reflections', () => {
  const spectrum = parseNumbers('0 113 128 186 241 299 314 427');
  const result = core.leaderboardSequencing(spectrum, 1000, core.AMINO_ACID_MASSES);
  const expected = '186-128-113 186-113-128 128-186-113 128-113-186 113-186-128 113-128-186'.split(' ').sort();
  assert.equal(result.leaderScore, spectrum.length);
  assert.deepEqual(result.tiedLeaders.map(core.peptideName).sort(), expected);
  for (const peptide of result.tiedLeaders) {
    assert.deepEqual(core.cyclicSpectrum(peptide), spectrum);
  }
});

check('BA4I sample: ConvolutionCyclopeptideSequencing(M = 20, N = 60) matches the score of 99-71-137-57-72-57', () => {
  const spectrum = parseNumbers('57 57 71 99 129 137 170 186 194 208 228 265 285 299 307 323 356 364 394 422 493');
  const alphabet = core.massesOfGroups(core.topConvolutionMasses(core.spectralConvolution(spectrum), 20));
  const result = core.leaderboardSequencing(spectrum, 60, alphabet);
  const expectedScore = core.cyclicScore([99, 71, 137, 57, 72, 57], spectrum);
  assert.equal(result.leaderScore, expectedScore);
  assert.ok(result.tiedLeaders.map(core.peptideName).includes('99-71-137-57-72-57'));
});

check('book 4.7: leaderboard (N = 1000, 18 masses) reconstructs Tyrocidine B1 from Spectrum10 with score 86', () => {
  const result = core.leaderboardSequencing(SPECTRUM_10, 1000, core.AMINO_ACID_MASSES, { maxLeaderboardSize: 1e9 });
  assert.equal(result.leaderScore, 86);
  assert.equal(core.cyclicScore(masses('VKLFPWFNQY'), SPECTRUM_10), 86);
  const names = result.tiedLeaders.map(core.peptideName);
  assert.ok(names.some((name) => isRotationOrReflection(name, massString('VKLFPWFNQY'))), names.join(' '));
});

check('book 4.7: on Spectrum25 (N = 1000) there are 38 linear peptides of max score 83, and VKLFPWFNQY scores 82', () => {
  const result = core.leaderboardSequencing(SPECTRUM_25, 1000, core.AMINO_ACID_MASSES, { maxLeaderboardSize: 1e9 });
  assert.equal(result.leaderScore, 83);
  assert.equal(result.tiedLeaders.length, 38);
  assert.equal(core.cyclicScore(masses('VKLFPWFNQY'), SPECTRUM_25), 82);
  assert.equal(core.cyclicScore(masses('VKLFPADFNQY'), SPECTRUM_25), 83);
});

check('book 4.9: ConvolutionCyclopeptideSequencing (M = 20, N = 1000) recovers Tyrocidine B1 from Spectrum25', () => {
  const alphabet = core.massesOfGroups(core.topConvolutionMasses(core.spectralConvolution(SPECTRUM_25), 20));
  const result = core.leaderboardSequencing(SPECTRUM_25, 1000, alphabet, { maxLeaderboardSize: 1e9 });
  const names = result.tiedLeaders.map(core.peptideName);
  assert.ok(names.some((name) => isRotationOrReflection(name, massString('VKLFPWFNQY'))), result.leaderScore + ': ' + names.join(' '));
});

function isRotationOrReflection(candidate, target) {
  const parts = target.split('-');
  const reversed = parts.slice().reverse();
  for (let shift = 0; shift < parts.length; shift += 1) {
    const rotation = parts.slice(shift).concat(parts.slice(0, shift)).join('-');
    const reversedRotation = reversed.slice(shift).concat(reversed.slice(0, shift)).join('-');
    if (candidate === rotation || candidate === reversedRotation) {
      return true;
    }
  }
  return false;
}

check('every recorded round obeys the book loop', () => {
  const alphabet = core.massesOfGroups(core.topConvolutionMasses(core.spectralConvolution(BOOK_NQEL_SPECTRUM), 5));
  assert.deepEqual(alphabet, [99, 113, 114, 128, 129]);
  const result = core.leaderboardSequencing(BOOK_NQEL_SPECTRUM, 5, alphabet);
  assert.equal(result.parent, 484);
  let previousSize = 1;
  for (const round of result.rounds) {
    assert.equal(round.expandedCount, previousSize * alphabet.length);
    assert.equal(round.ranked.length, round.expandedCount - round.tooHeavyCount);
    for (const item of round.ranked) {
      assert.ok(item.peptide.reduce((sum, mass) => sum + mass, 0) <= 484);
    }
    assert.ok(round.keptCount >= Math.min(5, round.ranked.length));
    previousSize = round.keptCount;
  }
  assert.equal(result.rounds[result.rounds.length - 1].keptCount, 0);
  assert.equal(result.leaderScore, 11);
  assert.ok(result.tiedLeaders.map(core.peptideName).some((name) => isRotationOrReflection(name, massString('NQEL'))));
});

check('widget cap stops runaway leaderboards instead of hanging', () => {
  const result = core.leaderboardSequencing(SPECTRUM_25, 1000, core.AMINO_ACID_MASSES);
  assert.equal(result.stoppedEarly, true);
});

check('validation: bad tokens, caps, and sorting', () => {
  assert.equal(core.validateSpectrum('').ok, false);
  assert.equal(core.validateSpectrum('0 57 x').ok, false);
  assert.match(core.validateSpectrum('0 57 x').error, /"x"/);
  assert.equal(core.validateSpectrum('0 -57').ok, false);
  assert.equal(core.validateSpectrum('0 5.5').ok, false);
  assert.equal(core.validateSpectrum('0 20').ok, false);
  assert.equal(core.validateSpectrum('0 99999').ok, false);
  assert.equal(core.validateSpectrum(new Array(core.LIMITS.maxSpectrumSize + 1).fill('57').join(' ')).ok, false);
  assert.deepEqual(core.validateSpectrum('484, 0 113\n99').spectrum, [0, 99, 113, 484]);
  assert.equal(core.validateSpectrum(null).ok, false);
  assert.equal(core.clampInteger('abc', 1, 20), 1);
  assert.equal(core.clampInteger('500', 1, 20), 20);
});

console.log('\n' + passed + ' checks passed');
