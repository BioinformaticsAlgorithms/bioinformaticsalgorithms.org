// Tests for the spectrum widget core: node tests/widgets/spectrum.test.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';

const require = createRequire(import.meta.url);
const core = require('../../assets/widgets/spectrum.js');

let passed = 0;

function check(name, testFunction) {
  testFunction();
  passed += 1;
  console.log('ok - ' + name);
}

function parseNumbers(text) {
  return text.trim().split(/\s+/).map(Number);
}

function sortedCopy(numbers) {
  return numbers.slice().sort((first, second) => first - second);
}

// Brute force: build every subpeptide as a string and add up its letters.
function massOfString(peptide) {
  let total = 0;
  for (const letter of peptide) {
    total += core.INTEGER_MASS[letter];
  }
  return total;
}

function bruteLinearSpectrum(peptide) {
  const masses = [0];
  for (let start = 0; start < peptide.length; start += 1) {
    for (let end = start + 1; end <= peptide.length; end += 1) {
      masses.push(massOfString(peptide.slice(start, end)));
    }
  }
  return sortedCopy(masses);
}

function bruteCyclicSpectrum(peptide) {
  const masses = [0, massOfString(peptide)];
  const doubled = peptide + peptide;
  for (let length = 1; length < peptide.length; length += 1) {
    for (let start = 0; start < peptide.length; start += 1) {
      masses.push(massOfString(doubled.slice(start, start + length)));
    }
  }
  return sortedCopy(masses);
}

// The book's printed figure in lesson 4.4 (duplicate_elements.png).
const BOOK_NQEL_CYCLOSPECTRUM = parseNumbers('0 113 114 128 129 227 242 242 257 355 356 370 371 484');
const BOOK_NQEL_LABELS = ['', 'L', 'N', 'Q', 'E', 'LN', 'NQ', 'EL', 'QE', 'LNQ', 'ELN', 'QEL', 'NQE', 'NQEL'];

check('integer mass table matches the book (18 distinct masses, I=L, K=Q)', () => {
  assert.equal(Object.keys(core.INTEGER_MASS).length, 20);
  assert.equal(core.INTEGER_MASS.I, 113);
  assert.equal(core.INTEGER_MASS.L, 113);
  assert.equal(core.INTEGER_MASS.K, 128);
  assert.equal(core.INTEGER_MASS.Q, 128);
  const distinct = new Set(Object.values(core.INTEGER_MASS));
  assert.equal(distinct.size, 18);
  assert.deepEqual(sortedCopy([...distinct]), parseNumbers('57 71 87 97 99 101 103 113 114 115 128 129 131 137 147 156 163 186'));
});

check('book: Cyclospectrum(NQEL) exactly as printed in lesson 4.4', () => {
  assert.deepEqual(core.cyclicSpectrum('NQEL'), BOOK_NQEL_CYCLOSPECTRUM);
});

check('book: subpeptide labels of NQEL sorted by mass match the figure', () => {
  const entries = core.sortedEntries(core.subpeptidesInGenerationOrder('NQEL', true));
  assert.deepEqual(entries.map((entry) => entry.label), BOOK_NQEL_LABELS);
});

check('book: NQEL is 114-128-129-113 and Tyrocidine B1 weighs 1322', () => {
  assert.deepEqual(core.residueMasses('NQEL'), [114, 128, 129, 113]);
  assert.deepEqual(core.residueMasses('VKLFPWFNQY'), parseNumbers('99 128 113 147 97 186 147 114 128 163'));
  assert.equal(core.sumOf(core.residueMasses('VKLFPWFNQY')), 1322);
});

check('book: fragments LFP and WFNQYVK weigh 357 and 965', () => {
  assert.equal(massOfString('LFP'), 357);
  assert.equal(massOfString('WFNQYVK'), 965);
});

check('BA4C sample: Cyclospectrum(LEQN)', () => {
  assert.deepEqual(core.cyclicSpectrum('LEQN'), parseNumbers('0 113 114 128 129 227 242 242 257 355 356 370 371 484'));
});

check('BA4J sample: LinearSpectrum(NQEL)', () => {
  assert.deepEqual(core.linearSpectrum('NQEL'), parseNumbers('0 113 114 128 129 242 242 257 370 371 484'));
});

check('book: a cyclic peptide of length n has n(n - 1) subpeptides', () => {
  for (let length = 2; length <= 12; length += 1) {
    const peptide = 'G'.repeat(length);
    const properSubpeptideCount = core.cyclicSpectrum(peptide).length - 2;
    assert.equal(properSubpeptideCount, length * (length - 1));
  }
});

check('book: ELEL has 12 subpeptides with repeats', () => {
  const entries = core.subpeptidesInGenerationOrder('ELEL', true);
  const proper = entries.filter((entry) => entry.length > 0 && entry.length < 4).map((entry) => entry.label).sort();
  assert.deepEqual(proper, ['E', 'L', 'E', 'L', 'EL', 'LE', 'EL', 'LE', 'ELE', 'LEL', 'ELE', 'LEL'].sort());
});

check('brute force: cyclic and linear spectra agree on random peptides', () => {
  const letters = Object.keys(core.INTEGER_MASS);
  let seed = 12345;
  function nextRandom() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }
  for (let trial = 0; trial < 400; trial += 1) {
    const length = 1 + Math.floor(nextRandom() * core.MAX_PEPTIDE_LENGTH);
    let peptide = '';
    for (let index = 0; index < length; index += 1) {
      peptide += letters[Math.floor(nextRandom() * letters.length)];
    }
    assert.deepEqual(core.cyclicSpectrum(peptide), bruteCyclicSpectrum(peptide), 'cyclic ' + peptide);
    assert.deepEqual(core.linearSpectrum(peptide), bruteLinearSpectrum(peptide), 'linear ' + peptide);
  }
});

check('every subpeptide label weighs what its formula says', () => {
  for (const peptide of ['NQEL', 'VKLFPWFNQY', 'ELEL', 'G', 'GA']) {
    for (const isCyclic of [true, false]) {
      for (const entry of core.subpeptidesInGenerationOrder(peptide, isCyclic)) {
        assert.equal(massOfString(entry.label), entry.mass, peptide + ' ' + entry.label);
        const formulaResult = Number(entry.formula.split('=').pop().trim());
        assert.equal(formulaResult, entry.mass, entry.formula);
      }
    }
  }
});

check('prefix masses of NQEL', () => {
  assert.deepEqual(core.prefixMasses(core.residueMasses('NQEL')), [0, 114, 242, 371, 484]);
});

check('multiplicities group repeated masses', () => {
  const groups = core.multiplicities(BOOK_NQEL_CYCLOSPECTRUM);
  assert.deepEqual(groups.find((group) => group.mass === 242), { mass: 242, count: 2 });
  assert.equal(groups.length, 13);
});

check('validation: lowercase, spaces, bad letters, length cap', () => {
  assert.deepEqual(core.validatePeptide(' nq el '), { ok: true, peptide: 'NQEL', error: '' });
  assert.equal(core.validatePeptide('').ok, false);
  assert.equal(core.validatePeptide('NQXEL').ok, false);
  assert.match(core.validatePeptide('NQXEL').error, /"X"/);
  assert.equal(core.validatePeptide('123').ok, false);
  assert.equal(core.validatePeptide('G'.repeat(core.MAX_PEPTIDE_LENGTH)).ok, true);
  assert.equal(core.validatePeptide('G'.repeat(core.MAX_PEPTIDE_LENGTH + 1)).ok, false);
  assert.equal(core.validatePeptide(null).ok, false);
});

check('covered positions wrap around the ring', () => {
  const entries = core.subpeptidesInGenerationOrder('NQEL', true);
  const lnq = entries.find((entry) => entry.label === 'LNQ');
  assert.deepEqual(core.coveredPositions(lnq, 4), [3, 0, 1]);
});

console.log('\n' + passed + ' checks passed');
