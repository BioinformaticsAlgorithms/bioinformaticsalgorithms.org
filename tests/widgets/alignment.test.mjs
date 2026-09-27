// Tests for the alignment widget core: node tests/widgets/alignment.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const aln = require('../../assets/widgets/alignment.js');

let passed = 0;

function check(name, testFunction) {
  testFunction();
  passed += 1;
  console.log('ok - ' + name);
}

const LCS = { mode: 'lcs', match: 1, mismatch: 0, indel: 0, matrix: 'simple' };

function globalScoring(match, mismatch, indel) {
  return { mode: 'global', match, mismatch, indel, matrix: 'simple' };
}

function localScoring(match, mismatch, indel) {
  return { mode: 'local', match, mismatch, indel, matrix: 'simple' };
}

function withoutGaps(row) {
  return row.split('-').join('');
}

function isSubsequence(small, big) {
  let position = 0;
  for (const letter of big) {
    if (position < small.length && small[position] === letter) {
      position += 1;
    }
  }
  return position === small.length;
}

// Every alignment of v and w, enumerated recursively (short strings only).
function allAlignments(v, w) {
  if (v.length === 0 && w.length === 0) {
    return [['', '']];
  }
  const results = [];
  if (v.length > 0 && w.length > 0) {
    for (const [top, bottom] of allAlignments(v.slice(1), w.slice(1))) {
      results.push([v[0] + top, w[0] + bottom]);
    }
  }
  if (v.length > 0) {
    for (const [top, bottom] of allAlignments(v.slice(1), w)) {
      results.push([v[0] + top, '-' + bottom]);
    }
  }
  if (w.length > 0) {
    for (const [top, bottom] of allAlignments(v, w.slice(1))) {
      results.push(['-' + top, w[0] + bottom]);
    }
  }
  return results;
}

function bruteForceGlobal(v, w, scoring) {
  let best = -Infinity;
  for (const [top, bottom] of allAlignments(v, w)) {
    const score = aln.scoreAlignment(top, bottom, scoring);
    if (score > best) {
      best = score;
    }
  }
  return best;
}

function substrings(text) {
  const results = [''];
  for (let start = 0; start < text.length; start += 1) {
    for (let end = start + 1; end <= text.length; end += 1) {
      results.push(text.slice(start, end));
    }
  }
  return results;
}

function bruteForceLocal(v, w, scoring) {
  const asGlobal = { ...scoring, mode: 'global' };
  let best = 0;
  for (const vPart of substrings(v)) {
    for (const wPart of substrings(w)) {
      const score = bruteForceGlobal(vPart, wPart, asGlobal);
      if (score > best) {
        best = score;
      }
    }
  }
  return best;
}

function randomString(length, alphabet, random) {
  let text = '';
  for (let k = 0; k < length; k += 1) {
    text += alphabet[Math.floor(random() * alphabet.length)];
  }
  return text;
}

// Small deterministic generator so failures are reproducible.
function makeRandom(seed) {
  let state = seed;
  return function next() {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

// The returned alignment must spell the inputs (or substrings for local) and score what the DP says.
function assertConsistent(result, v, w, scoring) {
  const top = result.alignment.top;
  const bottom = result.alignment.bottom;
  assert.equal(top.length, bottom.length);
  for (let k = 0; k < top.length; k += 1) {
    assert.ok(!(top[k] === '-' && bottom[k] === '-'), 'two gaps aligned');
  }
  if (scoring.mode === 'local') {
    assert.ok(v.includes(withoutGaps(top)), 'top row is a substring of v');
    assert.ok(w.includes(withoutGaps(bottom)), 'bottom row is a substring of w');
  } else {
    assert.equal(withoutGaps(top), v);
    assert.equal(withoutGaps(bottom), w);
  }
  assert.equal(aln.scoreAlignment(top, bottom, scoring), result.score);
}

check('BA5C sample: LCS of AACCTTGG and ACACTGTGA has length 6', () => {
  const result = aln.align('AACCTTGG', 'ACACTGTGA', LCS);
  assert.equal(result.score, 6);
  assert.equal(result.lcs.length, 6);
  assert.ok(isSubsequence(result.lcs, 'AACCTTGG'));
  assert.ok(isSubsequence(result.lcs, 'ACACTGTGA'));
  assertConsistent(result, 'AACCTTGG', 'ACACTGTGA', LCS);
});

check('lesson 5.2 pair ATGTTATA and ATCGTCC: the 4-match game in the lesson is optimal', () => {
  const result = aln.align('ATGTTATA', 'ATCGTCC', LCS);
  let brute = 0;
  for (const [top, bottom] of allAlignments('ATGTTATA', 'ATCGTCC')) {
    const score = aln.scoreAlignment(top, bottom, LCS);
    if (score > brute) {
      brute = score;
    }
  }
  assert.equal(result.score, brute);
  assert.ok(isSubsequence(result.lcs, 'ATGTTATA') && isSubsequence(result.lcs, 'ATCGTCC'));
  assert.equal(result.score, 4);
  assert.equal(result.lcs.length, 4);
  assertConsistent(result, 'ATGTTATA', 'ATCGTCC', LCS);
  assert.equal(aln.scoreAlignment('AT-GTTATA', 'ATCGT-C-C', LCS), 4);
});

check('LCS pointers follow the LCSBackTrack tie order (down, then right, then diagonal)', () => {
  const fill = aln.fillSteps('AA', 'A', LCS);
  // s(2, 1): down gives s(1, 1) = 1 and the diagonal gives s(1, 0) + 1 = 1; down is checked first.
  assert.equal(fill.pointers[1][1], 'diag');
  assert.equal(fill.scores[2][1], 1);
  assert.equal(fill.pointers[2][1], 'down');
  const other = aln.fillSteps('A', 'AA', LCS);
  // s(1, 2): right gives 1 and the diagonal gives 1; right is checked before the diagonal.
  assert.equal(other.pointers[1][2], 'right');
});

check('BA5E sample: PLEASANTLY and MEANLY with BLOSUM62 and indel 5 score 8', () => {
  const scoring = { mode: 'global', match: 0, mismatch: 0, indel: 5, matrix: 'blosum62' };
  const result = aln.align('PLEASANTLY', 'MEANLY', scoring);
  assert.equal(result.score, 8);
  assertConsistent(result, 'PLEASANTLY', 'MEANLY', scoring);
  assert.equal(aln.scoreAlignment('PLEASANTLY', '-MEA--N-LY', scoring), 8);
  assert.equal(result.alignment.top, 'PLEASANTLY');
  assert.equal(result.alignment.bottom, '-MEA--N-LY');
});

check('BLOSUM62 table is symmetric with the published diagonal', () => {
  const diagonal = { A: 4, C: 9, D: 6, E: 5, F: 6, G: 6, H: 8, I: 4, K: 5, L: 4, M: 5, N: 6, P: 7, Q: 5, R: 5, S: 4, T: 5, V: 4, W: 11, Y: 7 };
  for (const a of aln.AMINO_ACIDS) {
    assert.equal(aln.BLOSUM62[a][a], diagonal[a]);
    for (const b of aln.AMINO_ACIDS) {
      assert.equal(aln.BLOSUM62[a][b], aln.BLOSUM62[b][a], a + b);
    }
  }
  assert.equal(aln.BLOSUM62.W.C, -2);
  assert.equal(aln.BLOSUM62.E.D, 2);
  assert.equal(aln.BLOSUM62.Y.F, 3);
});

check('BLOSUM62 global alignment matches brute force on short proteins', () => {
  const random = makeRandom(11);
  const scoring = { mode: 'global', match: 0, mismatch: 0, indel: 5, matrix: 'blosum62' };
  for (let trial = 0; trial < 60; trial += 1) {
    const v = randomString(1 + Math.floor(random() * 5), aln.AMINO_ACIDS, random);
    const w = randomString(1 + Math.floor(random() * 5), aln.AMINO_ACIDS, random);
    const result = aln.align(v, w, scoring);
    assert.equal(result.score, bruteForceGlobal(v, w, scoring), v + ' ' + w);
    assertConsistent(result, v, w, scoring);
  }
});

check('an alignment scores # matches - mu # mismatches - sigma # indels (mu = 1, sigma = 2)', () => {
  const scoring = globalScoring(1, 1, 2);
  // Columns A/A, C/-, -/C, G/T, T/T: 2 matches, 1 mismatch, 2 indels, so 2 - 1 - 4 = -3.
  assert.equal(aln.scoreAlignment('AC-GT', 'A-CTT', scoring), -3);
});

check('global alignment matches brute force over all alignments (random DNA, several scorings)', () => {
  const random = makeRandom(7);
  const scorings = [globalScoring(1, 1, 1), globalScoring(1, 1, 2), globalScoring(2, 3, 1), globalScoring(1, 0, 0), globalScoring(5, 2, 4), globalScoring(0, 4, 3)];
  for (const scoring of scorings) {
    for (let trial = 0; trial < 40; trial += 1) {
      const v = randomString(1 + Math.floor(random() * 5), 'ACGT', random);
      const w = randomString(1 + Math.floor(random() * 5), 'ACGT', random);
      const result = aln.align(v, w, scoring);
      assert.equal(result.score, bruteForceGlobal(v, w, scoring), v + ' ' + w + ' ' + JSON.stringify(scoring));
      assertConsistent(result, v, w, scoring);
    }
  }
});

check('LCS matches brute force on random DNA', () => {
  const random = makeRandom(3);
  for (let trial = 0; trial < 80; trial += 1) {
    const v = randomString(1 + Math.floor(random() * 6), 'ACGT', random);
    const w = randomString(1 + Math.floor(random() * 6), 'ACGT', random);
    const result = aln.align(v, w, LCS);
    assert.equal(result.score, bruteForceGlobal(v, w, LCS), v + ' ' + w);
    assert.equal(result.lcs.length, result.score);
    assertConsistent(result, v, w, LCS);
  }
});

check('local alignment matches brute force over all substring pairs', () => {
  const random = makeRandom(5);
  const scorings = [localScoring(1, 1, 1), localScoring(3, 3, 2), localScoring(1, 2, 2), localScoring(2, 1, 3)];
  for (const scoring of scorings) {
    for (let trial = 0; trial < 30; trial += 1) {
      const v = randomString(1 + Math.floor(random() * 5), 'ACGT', random);
      const w = randomString(1 + Math.floor(random() * 5), 'ACGT', random);
      const result = aln.align(v, w, scoring);
      assert.equal(result.score, bruteForceLocal(v, w, scoring), v + ' ' + w + ' ' + JSON.stringify(scoring));
      assertConsistent(result, v, w, scoring);
    }
  }
});

check('local preset GGTTGACTA / TGTTACGG (match 3, mu 3, sigma 2) scores 13 with GTTGAC over GTT-AC', () => {
  const scoring = localScoring(3, 3, 2);
  const result = aln.align('GGTTGACTA', 'TGTTACGG', scoring);
  assert.equal(result.score, 13);
  assert.equal(result.alignment.top, 'GTTGAC');
  assert.equal(result.alignment.bottom, 'GTT-AC');
  assert.deepEqual(result.localStart, { i: 1, j: 1 });
  assert.deepEqual(result.localEnd, { i: 7, j: 6 });
});

check('local alignment with no positive pair is empty with score 0', () => {
  const result = aln.align('AAA', 'CCC', localScoring(1, 1, 1));
  assert.equal(result.score, 0);
  assert.equal(result.alignment.top, '');
});

check('every fill step candidate list agrees with the stored score', () => {
  const scoring = globalScoring(1, 1, 2);
  const fill = aln.fillSteps('TGTTA', 'TCGT', scoring);
  assert.equal(fill.steps.length, 1 + 5 * 4);
  for (const step of fill.steps.slice(1)) {
    let best = -Infinity;
    for (const candidate of step.candidates) {
      best = Math.max(best, candidate.value);
    }
    assert.equal(step.value, best);
    assert.equal(fill.scores[step.i][step.j], best);
  }
});

check('input validation reports problems in words and never throws', () => {
  const tooLong = aln.parseProblem({ v: 'A'.repeat(15), w: 'AC', mode: 'lcs' });
  assert.ok(tooLong.errors && tooLong.errors[0].includes('14'));
  const badLetters = aln.parseProblem({ v: 'AC1', w: 'AC', mode: 'lcs' });
  assert.ok(badLetters.errors);
  const empty = aln.parseProblem({ v: '', w: 'AC', mode: 'lcs' });
  assert.ok(empty.errors);
  const badPenalty = aln.parseProblem({ v: 'AC', w: 'AC', mode: 'global', match: '1', mismatch: '-1', indel: '2', matrix: 'simple' });
  assert.ok(badPenalty.errors);
  const badProtein = aln.parseProblem({ v: 'PLEASANTLYB', w: 'MEANLY', mode: 'global', match: '1', mismatch: '1', indel: '5', matrix: 'blosum62' });
  assert.ok(badProtein.errors);
  const good = aln.parseProblem({ v: ' atg tta ', w: 'atc', mode: 'local', match: '1', mismatch: '1', indel: '1', matrix: 'simple' });
  assert.equal(good.v, 'ATGTTA');
  assert.equal(good.scoring.mode, 'local');
});

console.log(passed + ' tests passed');
