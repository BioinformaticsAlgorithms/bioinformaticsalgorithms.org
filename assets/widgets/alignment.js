/* The alignment graph and dynamic programming, step by step.
   Widget for Chapter 5 (lessons 5.4 to 5.10). Vanilla ES2019, no dependencies.
   The algorithm core is a set of pure functions exported for the Node test.
   Notation follows the book: v labels the rows (index i), w labels the columns (index j),
   a vertical edge (down) is a deletion, a horizontal edge (right) is an insertion,
   and a diagonal edge is a match or mismatch. */
(function () {
  'use strict';

  var MAX_LENGTH = 14;
  var MAX_PENALTY = 20;
  var PLAY_INTERVAL_MS = 220;

  var ARROWS = { down: '↓', right: '→', diag: '↘', source: '•' };

  var AMINO_ACIDS = 'ACDEFGHIKLMNPQRSTVWY';
  // BLOSUM62, rows and columns in the order of AMINO_ACIDS.
  var BLOSUM62_ROWS = [
    '4 0 -2 -1 -2 0 -2 -1 -1 -1 -1 -2 -1 -1 -1 1 0 0 -3 -2',
    '0 9 -3 -4 -2 -3 -3 -1 -3 -1 -1 -3 -3 -3 -3 -1 -1 -1 -2 -2',
    '-2 -3 6 2 -3 -1 -1 -3 -1 -4 -3 1 -1 0 -2 0 -1 -3 -4 -3',
    '-1 -4 2 5 -3 -2 0 -3 1 -3 -2 0 -1 2 0 0 -1 -2 -3 -2',
    '-2 -2 -3 -3 6 -3 -1 0 -3 0 0 -3 -4 -3 -3 -2 -2 -1 1 3',
    '0 -3 -1 -2 -3 6 -2 -4 -2 -4 -3 0 -2 -2 -2 0 -2 -3 -2 -3',
    '-2 -3 -1 0 -1 -2 8 -3 -1 -3 -2 1 -2 0 0 -1 -2 -3 -2 2',
    '-1 -1 -3 -3 0 -4 -3 4 -3 2 1 -3 -3 -3 -3 -2 -1 3 -3 -1',
    '-1 -3 -1 1 -3 -2 -1 -3 5 -2 -1 0 -1 1 2 0 -1 -2 -3 -2',
    '-1 -1 -4 -3 0 -4 -3 2 -2 4 2 -3 -3 -2 -2 -2 -1 1 -2 -1',
    '-1 -1 -3 -2 0 -3 -2 1 -1 2 5 -2 -2 0 -1 -1 -1 1 -1 -1',
    '-2 -3 1 0 -3 0 1 -3 0 -3 -2 6 -2 0 0 1 0 -3 -4 -2',
    '-1 -3 -1 -1 -4 -2 -2 -3 -1 -3 -2 -2 7 -1 -2 -1 -1 -2 -4 -3',
    '-1 -3 0 2 -3 -2 0 -3 1 -2 0 0 -1 5 1 0 -1 -2 -2 -1',
    '-1 -3 -2 0 -3 -2 0 -3 2 -2 -1 0 -2 1 5 -1 -1 -3 -3 -2',
    '1 -1 0 0 -2 0 -1 -2 0 -2 -1 1 -1 0 -1 4 1 -2 -3 -2',
    '0 -1 -1 -1 -2 -2 -2 -1 -1 -1 -1 0 -1 -1 -1 1 5 0 -2 -2',
    '0 -1 -3 -2 -1 -3 -3 3 -2 1 1 -3 -2 -2 -3 -2 0 4 -3 -1',
    '-3 -2 -4 -3 1 -2 -2 -3 -3 -2 -1 -4 -4 -2 -3 -3 -2 -3 11 2',
    '-2 -2 -3 -2 3 -3 2 -1 -2 -1 -1 -2 -3 -1 -2 -2 -2 -1 2 7'
  ];

  function buildBlosum62() {
    var table = {};
    for (var r = 0; r < AMINO_ACIDS.length; r += 1) {
      var numbers = BLOSUM62_ROWS[r].split(' ');
      var row = {};
      for (var c = 0; c < AMINO_ACIDS.length; c += 1) {
        row[AMINO_ACIDS.charAt(c)] = parseInt(numbers[c], 10);
      }
      table[AMINO_ACIDS.charAt(r)] = row;
    }
    return table;
  }

  var BLOSUM62 = buildBlosum62();

  var PRESETS = [
    { label: 'ATGTTATA and ATCGTCC, longest common subsequence', v: 'ATGTTATA', w: 'ATCGTCC', mode: 'lcs', match: 1, mismatch: 0, indel: 0, matrix: 'simple' },
    { label: 'TGTTA and TCGT, global alignment (μ = 1, σ = 2)', v: 'TGTTA', w: 'TCGT', mode: 'global', match: 1, mismatch: 1, indel: 2, matrix: 'simple' },
    { label: 'PLEASANTLY and MEANLY, global alignment (BLOSUM62, σ = 5)', v: 'PLEASANTLY', w: 'MEANLY', mode: 'global', match: 1, mismatch: 1, indel: 5, matrix: 'blosum62' },
    { label: 'GGTTGACTA and TGTTACGG, local alignment (match 3, μ = 3, σ = 2)', v: 'GGTTGACTA', w: 'TGTTACGG', mode: 'local', match: 3, mismatch: 3, indel: 2, matrix: 'simple' }
  ];

  /* ---------- Scoring ---------- */

  // scoring = { mode: 'lcs' | 'global' | 'local', match, mismatch, indel, matrix: 'simple' | 'blosum62' }
  // mismatch and indel are penalties (subtracted), as with mu and sigma in the book.
  function pairScore(a, b, scoring) {
    if (scoring.mode === 'lcs') {
      return a === b ? 1 : 0;
    }
    if (scoring.matrix === 'blosum62') {
      return BLOSUM62[a][b];
    }
    return a === b ? scoring.match : -scoring.mismatch;
  }

  function indelScore(scoring) {
    if (scoring.mode === 'lcs') {
      return 0;
    }
    return -scoring.indel;
  }

  /* ---------- Filling the grid ---------- */

  function emptyMatrix(rows, columns, fill) {
    var matrix = [];
    for (var i = 0; i < rows; i += 1) {
      var row = [];
      for (var j = 0; j < columns; j += 1) {
        row.push(fill);
      }
      matrix.push(row);
    }
    return matrix;
  }

  // Scores and pointers for row 0 and column 0.
  function initializeBorders(v, w, scoring) {
    var scores = emptyMatrix(v.length + 1, w.length + 1, null);
    var pointers = emptyMatrix(v.length + 1, w.length + 1, null);
    scores[0][0] = 0;
    var isLocal = scoring.mode === 'local';
    for (var i = 1; i <= v.length; i += 1) {
      scores[i][0] = isLocal ? 0 : scores[i - 1][0] + indelScore(scoring);
      pointers[i][0] = isLocal ? 'source' : 'down';
    }
    for (var j = 1; j <= w.length; j += 1) {
      scores[0][j] = isLocal ? 0 : scores[0][j - 1] + indelScore(scoring);
      pointers[0][j] = isLocal ? 'source' : 'right';
    }
    return { scores: scores, pointers: pointers };
  }

  // The candidates for s(i, j) in the book's order, plus the free ride in local alignment.
  function cellCandidates(i, j, v, w, scores, scoring) {
    var candidates = [
      { direction: 'down', fromI: i - 1, fromJ: j, edge: indelScore(scoring), value: scores[i - 1][j] + indelScore(scoring) },
      { direction: 'right', fromI: i, fromJ: j - 1, edge: indelScore(scoring), value: scores[i][j - 1] + indelScore(scoring) },
      { direction: 'diag', fromI: i - 1, fromJ: j - 1, edge: pairScore(v.charAt(i - 1), w.charAt(j - 1), scoring), value: 0 }
    ];
    candidates[2].value = scores[i - 1][j - 1] + candidates[2].edge;
    if (scoring.mode === 'local') {
      candidates.push({ direction: 'source', fromI: 0, fromJ: 0, edge: 0, value: 0 });
    }
    return candidates;
  }

  // Winner: the maximum; ties go down, then right, then diagonal, as in LCSBackTrack.
  // In local alignment a cell whose best score is 0 takes the free ride, so paths start there.
  function chooseWinner(candidates, scoring) {
    var best = -Infinity;
    for (var c = 0; c < candidates.length; c += 1) {
      if (candidates[c].value > best) {
        best = candidates[c].value;
      }
    }
    if (scoring.mode === 'local' && best === 0) {
      return { value: 0, direction: 'source' };
    }
    for (var k = 0; k < candidates.length; k += 1) {
      if (candidates[k].value === best) {
        return { value: best, direction: candidates[k].direction };
      }
    }
    return { value: best, direction: null };
  }

  // The whole fill as a list of steps: step 0 sets the borders, then one step per cell, row by row.
  function fillSteps(v, w, scoring) {
    var borders = initializeBorders(v, w, scoring);
    var scores = borders.scores;
    var pointers = borders.pointers;
    var steps = [{ kind: 'borders' }];
    for (var i = 1; i <= v.length; i += 1) {
      for (var j = 1; j <= w.length; j += 1) {
        var candidates = cellCandidates(i, j, v, w, scores, scoring);
        var winner = chooseWinner(candidates, scoring);
        scores[i][j] = winner.value;
        pointers[i][j] = winner.direction;
        steps.push({ kind: 'cell', i: i, j: j, candidates: candidates, value: winner.value, direction: winner.direction });
      }
    }
    return { steps: steps, scores: scores, pointers: pointers };
  }

  // Where backtracking starts: the sink, or in local alignment the highest-scoring node
  // (the free ride to the sink leaves from there). Ties go to the first node in row order.
  function backtrackStart(scores, scoring) {
    var rows = scores.length - 1;
    var columns = scores[0].length - 1;
    if (scoring.mode !== 'local') {
      return { i: rows, j: columns };
    }
    var best = { i: 0, j: 0 };
    for (var i = 0; i <= rows; i += 1) {
      for (var j = 0; j <= columns; j += 1) {
        if (scores[i][j] > scores[best.i][best.j]) {
          best = { i: i, j: j };
        }
      }
    }
    return best;
  }

  // Nodes of the optimal path from its end back to its start.
  function backtrackPath(pointers, start) {
    var path = [{ i: start.i, j: start.j }];
    var i = start.i;
    var j = start.j;
    while ((i > 0 || j > 0) && pointers[i][j] !== 'source') {
      var direction = pointers[i][j];
      if (direction === 'down') {
        i -= 1;
      } else if (direction === 'right') {
        j -= 1;
      } else {
        i -= 1;
        j -= 1;
      }
      path.push({ i: i, j: j });
    }
    return path;
  }

  function columnKind(top, bottom) {
    if (top === '-') {
      return 'insertion';
    }
    if (bottom === '-') {
      return 'deletion';
    }
    return top === bottom ? 'match' : 'mismatch';
  }

  // Turns a path (listed end to start) into the two rows of the alignment.
  function alignmentFromPath(path, v, w) {
    var top = '';
    var bottom = '';
    var kinds = [];
    for (var k = path.length - 1; k > 0; k -= 1) {
      var from = path[k];
      var to = path[k - 1];
      var topSymbol = to.i > from.i ? v.charAt(from.i) : '-';
      var bottomSymbol = to.j > from.j ? w.charAt(from.j) : '-';
      top += topSymbol;
      bottom += bottomSymbol;
      kinds.push(columnKind(topSymbol, bottomSymbol));
    }
    return { top: top, bottom: bottom, kinds: kinds };
  }

  function scoreAlignment(top, bottom, scoring) {
    var total = 0;
    for (var k = 0; k < top.length; k += 1) {
      if (top.charAt(k) === '-' || bottom.charAt(k) === '-') {
        total += indelScore(scoring);
      } else {
        total += pairScore(top.charAt(k), bottom.charAt(k), scoring);
      }
    }
    return total;
  }

  function countKinds(kinds) {
    var counts = { match: 0, mismatch: 0, insertion: 0, deletion: 0 };
    for (var k = 0; k < kinds.length; k += 1) {
      counts[kinds[k]] += 1;
    }
    return counts;
  }

  function commonSubsequence(alignment) {
    var letters = '';
    for (var k = 0; k < alignment.kinds.length; k += 1) {
      if (alignment.kinds[k] === 'match') {
        letters += alignment.top.charAt(k);
      }
    }
    return letters;
  }

  // Everything the widget shows, in one call: the fill, the path and the alignment.
  function align(v, w, scoring) {
    var fill = fillSteps(v, w, scoring);
    var start = backtrackStart(fill.scores, scoring);
    var path = backtrackPath(fill.pointers, start);
    var alignment = alignmentFromPath(path, v, w);
    var begin = path[path.length - 1];
    return {
      steps: fill.steps,
      scores: fill.scores,
      pointers: fill.pointers,
      path: path,
      score: fill.scores[start.i][start.j],
      alignment: alignment,
      counts: countKinds(alignment.kinds),
      lcs: commonSubsequence(alignment),
      localStart: begin,
      localEnd: start
    };
  }

  /* ---------- Input validation ---------- */

  function cleanSequence(text) {
    return String(text).replace(/\s+/g, '').toUpperCase();
  }

  function validateSequence(name, sequence, matrix) {
    if (sequence.length === 0) {
      return 'Enter a string for ' + name + '.';
    }
    if (sequence.length > MAX_LENGTH) {
      return name + ' has ' + sequence.length + ' symbols; the limit is ' + MAX_LENGTH + ' so the grid fits.';
    }
    if (!/^[A-Z]+$/.test(sequence)) {
      return name + ' may contain only letters A to Z.';
    }
    if (matrix === 'blosum62') {
      for (var k = 0; k < sequence.length; k += 1) {
        if (AMINO_ACIDS.indexOf(sequence.charAt(k)) < 0) {
          return 'BLOSUM62 scores the 20 amino acids ' + AMINO_ACIDS + '; ' + name + ' contains ' + sequence.charAt(k) + '.';
        }
      }
    }
    return null;
  }

  function parsePenalty(label, text) {
    var trimmed = String(text).trim();
    if (!/^\d+$/.test(trimmed)) {
      return { error: label + ' must be a whole number from 0 to ' + MAX_PENALTY + '.' };
    }
    var value = parseInt(trimmed, 10);
    if (value > MAX_PENALTY) {
      return { error: label + ' must be at most ' + MAX_PENALTY + '.' };
    }
    return { value: value };
  }

  // Reads raw form values and returns { v, w, scoring } or { errors: [...] }.
  function parseProblem(raw) {
    var errors = [];
    var mode = raw.mode === 'global' || raw.mode === 'local' ? raw.mode : 'lcs';
    var matrix = raw.matrix === 'blosum62' && mode !== 'lcs' ? 'blosum62' : 'simple';
    var v = cleanSequence(raw.v);
    var w = cleanSequence(raw.w);
    var vError = validateSequence('v', v, matrix);
    var wError = validateSequence('w', w, matrix);
    if (vError) {
      errors.push(vError);
    }
    if (wError) {
      errors.push(wError);
    }
    var scoring = { mode: mode, match: 1, mismatch: 0, indel: 0, matrix: matrix };
    if (mode !== 'lcs') {
      var match = parsePenalty('The match reward', raw.match);
      var mismatch = parsePenalty('The mismatch penalty μ', raw.mismatch);
      var indel = parsePenalty('The indel penalty σ', raw.indel);
      var parsed = [match, mismatch, indel];
      for (var p = 0; p < parsed.length; p += 1) {
        if (parsed[p].error) {
          errors.push(parsed[p].error);
        }
      }
      if (errors.length === 0) {
        scoring.match = match.value;
        scoring.mismatch = mismatch.value;
        scoring.indel = indel.value;
      }
    }
    if (errors.length > 0) {
      return { errors: errors };
    }
    return { v: v, w: w, scoring: scoring };
  }

  var core = {
    BLOSUM62: BLOSUM62,
    AMINO_ACIDS: AMINO_ACIDS,
    pairScore: pairScore,
    indelScore: indelScore,
    fillSteps: fillSteps,
    backtrackPath: backtrackPath,
    alignmentFromPath: alignmentFromPath,
    scoreAlignment: scoreAlignment,
    align: align,
    parseProblem: parseProblem
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }
  if (typeof document === 'undefined') {
    return;
  }

  /* ================= Browser UI ================= */

  var widgetCounter = 0;

  function makeElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined && text !== null) {
      element.textContent = text;
    }
    return element;
  }

  function buildButton(text) {
    var button = makeElement('button', 'btn btn-small', text);
    button.type = 'button';
    return button;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function signed(number) {
    return number < 0 ? '−' + String(-number) : String(number);
  }

  function edgeText(number) {
    return number < 0 ? '− ' + String(-number) : '+ ' + String(number);
  }

  function buildTextField(labelText, id, size, extraClass) {
    var wrapper = makeElement('label', 'wa-field' + (extraClass ? ' ' + extraClass : ''));
    wrapper.setAttribute('for', id);
    wrapper.appendChild(makeElement('span', 'wa-label', labelText));
    var input = makeElement('input', 'wa-input');
    input.id = id;
    input.type = 'text';
    input.size = size;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('spellcheck', 'false');
    wrapper.appendChild(input);
    return { wrapper: wrapper, input: input };
  }

  function buildModeFieldset(state) {
    var fieldset = makeElement('fieldset', 'wa-modes');
    fieldset.appendChild(makeElement('legend', 'wa-label', 'Scoring'));
    var modes = [
      { value: 'lcs', text: 'LCS (match 1, else 0)' },
      { value: 'global', text: 'Global alignment' },
      { value: 'local', text: 'Local alignment (free taxi rides)' }
    ];
    state.modeInputs = [];
    for (var k = 0; k < modes.length; k += 1) {
      var label = makeElement('label', 'wa-radio');
      var radio = makeElement('input');
      radio.type = 'radio';
      radio.name = state.idPrefix + '-mode';
      radio.value = modes[k].value;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + modes[k].text));
      fieldset.appendChild(label);
      state.modeInputs.push(radio);
    }
    return fieldset;
  }

  function buildParameterRow(state) {
    var row = makeElement('div', 'wa-params');
    var matrixField = makeElement('label', 'wa-field');
    matrixField.setAttribute('for', state.idPrefix + '-matrix');
    matrixField.appendChild(makeElement('span', 'wa-label', 'Match and mismatch scores'));
    var matrixSelect = makeElement('select', 'wa-input');
    matrixSelect.id = state.idPrefix + '-matrix';
    var simple = makeElement('option', null, 'match reward and μ');
    simple.value = 'simple';
    var blosum = makeElement('option', null, 'BLOSUM62 (proteins)');
    blosum.value = 'blosum62';
    matrixSelect.appendChild(simple);
    matrixSelect.appendChild(blosum);
    matrixField.appendChild(matrixSelect);

    var match = buildTextField('match reward', state.idPrefix + '-match', 2, 'wa-num');
    var mismatch = buildTextField('mismatch μ', state.idPrefix + '-mismatch', 2, 'wa-num');
    var indel = buildTextField('indel σ', state.idPrefix + '-indel', 2, 'wa-num');
    match.input.setAttribute('inputmode', 'numeric');
    mismatch.input.setAttribute('inputmode', 'numeric');
    indel.input.setAttribute('inputmode', 'numeric');

    row.appendChild(matrixField);
    row.appendChild(match.wrapper);
    row.appendChild(mismatch.wrapper);
    row.appendChild(indel.wrapper);
    state.matrixSelect = matrixSelect;
    state.matchInput = match.input;
    state.mismatchInput = mismatch.input;
    state.indelInput = indel.input;
    state.paramRow = row;
    return row;
  }

  function buildControls(state) {
    var controls = makeElement('div', 'wa-controls');
    var presetField = makeElement('label', 'wa-field wa-wide');
    presetField.setAttribute('for', state.idPrefix + '-preset');
    presetField.appendChild(makeElement('span', 'wa-label', 'Example'));
    var presetSelect = makeElement('select', 'wa-input');
    presetSelect.id = state.idPrefix + '-preset';
    for (var p = 0; p < PRESETS.length; p += 1) {
      var option = makeElement('option', null, PRESETS[p].label);
      option.value = String(p);
      presetSelect.appendChild(option);
    }
    presetField.appendChild(presetSelect);
    controls.appendChild(presetField);

    var strings = makeElement('div', 'wa-strings');
    var vField = buildTextField('v (rows)', state.idPrefix + '-v', 16);
    var wField = buildTextField('w (columns)', state.idPrefix + '-w', 16);
    vField.input.setAttribute('maxlength', '40');
    wField.input.setAttribute('maxlength', '40');
    strings.appendChild(vField.wrapper);
    strings.appendChild(wField.wrapper);
    controls.appendChild(strings);

    controls.appendChild(buildModeFieldset(state));
    controls.appendChild(buildParameterRow(state));

    state.buildButton = buildButton('Build grid');
    var buildRow = makeElement('div', 'wa-build');
    buildRow.appendChild(state.buildButton);
    buildRow.appendChild(makeElement('span', 'wa-note', 'Strings up to ' + MAX_LENGTH + ' letters; penalties 0 to ' + MAX_PENALTY + '.'));
    controls.appendChild(buildRow);

    state.presetSelect = presetSelect;
    state.vInput = vField.input;
    state.wInput = wField.input;
    return controls;
  }

  function selectedMode(state) {
    for (var k = 0; k < state.modeInputs.length; k += 1) {
      if (state.modeInputs[k].checked) {
        return state.modeInputs[k].value;
      }
    }
    return 'lcs';
  }

  function syncParameterInputs(state) {
    var mode = selectedMode(state);
    var isLcs = mode === 'lcs';
    var usesMatrix = state.matrixSelect.value === 'blosum62';
    state.matrixSelect.disabled = isLcs;
    state.matchInput.disabled = isLcs || usesMatrix;
    state.mismatchInput.disabled = isLcs || usesMatrix;
    state.indelInput.disabled = isLcs;
    state.paramRow.classList.toggle('wa-muted', isLcs);
  }

  /* ---------- Grid ---------- */

  function buildGrid(state) {
    var table = makeElement('table', 'wa-grid');
    var caption = makeElement('caption', 'wa-sr', 'Dynamic programming grid s(i, j) for v = ' + state.v + ' (rows) and w = ' + state.w + ' (columns)');
    table.appendChild(caption);
    var head = makeElement('thead');
    var headRow = makeElement('tr');
    headRow.appendChild(makeElement('th', 'wa-corner', ''));
    headRow.appendChild(makeElement('th', 'wa-head', ''));
    for (var j = 1; j <= state.w.length; j += 1) {
      var th = makeElement('th', 'wa-head wa-symbol', state.w.charAt(j - 1));
      th.setAttribute('scope', 'col');
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    table.appendChild(head);

    var body = makeElement('tbody');
    state.cellElements = [];
    for (var i = 0; i <= state.v.length; i += 1) {
      var row = makeElement('tr');
      var rowHead = makeElement('th', 'wa-head wa-symbol', i === 0 ? '' : state.v.charAt(i - 1));
      rowHead.setAttribute('scope', 'row');
      row.appendChild(rowHead);
      var elementRow = [];
      for (var c = 0; c <= state.w.length; c += 1) {
        var td = makeElement('td', 'wa-cell');
        var arrow = makeElement('span', 'wa-arrow', '');
        arrow.setAttribute('aria-hidden', 'true');
        var value = makeElement('span', 'wa-value', '');
        td.appendChild(arrow);
        td.appendChild(value);
        row.appendChild(td);
        elementRow.push({ cell: td, arrow: arrow, value: value });
      }
      body.appendChild(row);
      state.cellElements.push(elementRow);
    }
    table.appendChild(body);
    state.gridBox.innerHTML = '';
    state.gridBox.appendChild(table);
  }

  // Which cells are filled after `stepIndex` fill steps (-1 means nothing yet).
  function isFilled(state, i, j) {
    if (state.fillIndex < 0) {
      return false;
    }
    if (i === 0 || j === 0) {
      return true;
    }
    var order = (i - 1) * state.w.length + j;
    return order <= state.fillIndex;
  }

  function currentStep(state) {
    if (state.fillIndex < 0) {
      return null;
    }
    return state.result.steps[state.fillIndex];
  }

  function pathCellsShown(state) {
    var shown = {};
    var path = state.result.path;
    for (var k = 0; k < state.backtrackCount && k < path.length; k += 1) {
      shown[path[k].i + ',' + path[k].j] = true;
    }
    return shown;
  }

  function cellLabel(state, i, j) {
    var text = 's(' + i + ', ' + j + ') = ' + signed(state.result.scores[i][j]);
    var pointer = state.result.pointers[i][j];
    if (pointer) {
      text += ', pointer ' + pointerWords(pointer);
    }
    return text;
  }

  function pointerWords(direction) {
    if (direction === 'down') {
      return 'down (from above)';
    }
    if (direction === 'right') {
      return 'right (from the left)';
    }
    if (direction === 'diag') {
      return 'diagonal';
    }
    return 'free ride from the source';
  }

  function renderGrid(state) {
    var step = currentStep(state);
    var candidateKeys = {};
    var winnerKey = null;
    var currentKey = null;
    if (step && step.kind === 'cell' && state.backtrackCount === 0) {
      currentKey = step.i + ',' + step.j;
      for (var c = 0; c < step.candidates.length; c += 1) {
        var candidate = step.candidates[c];
        if (candidate.direction !== 'source') {
          candidateKeys[candidate.fromI + ',' + candidate.fromJ] = true;
        }
        if (candidate.direction === step.direction && candidate.direction !== 'source') {
          winnerKey = candidate.fromI + ',' + candidate.fromJ;
        }
      }
    }
    var onPath = pathCellsShown(state);
    var best = state.result.localEnd;
    for (var i = 0; i <= state.v.length; i += 1) {
      for (var j = 0; j <= state.w.length; j += 1) {
        var entry = state.cellElements[i][j];
        var key = i + ',' + j;
        var classes = ['wa-cell'];
        if (isFilled(state, i, j)) {
          classes.push('wa-filled');
          entry.value.textContent = signed(state.result.scores[i][j]);
          var pointer = state.result.pointers[i][j];
          entry.arrow.textContent = pointer ? ARROWS[pointer] : '';
          entry.cell.setAttribute('aria-label', cellLabel(state, i, j));
        } else {
          entry.value.textContent = '';
          entry.arrow.textContent = '';
          entry.cell.setAttribute('aria-label', 's(' + i + ', ' + j + ') not yet computed');
        }
        if (key === currentKey) {
          classes.push('wa-current');
        }
        if (candidateKeys[key]) {
          classes.push('wa-candidate');
        }
        if (key === winnerKey) {
          classes.push('wa-winner');
        }
        if (onPath[key]) {
          classes.push('wa-path');
        }
        if (state.scoring.mode === 'local' && state.fillIndex === state.lastFillIndex && i === best.i && j === best.j) {
          classes.push('wa-best');
        }
        entry.cell.className = classes.join(' ');
      }
    }
  }

  /* ---------- Explanation panel ---------- */

  function candidateSentence(candidate, step, state) {
    var arrow = ARROWS[candidate.direction];
    if (candidate.direction === 'source') {
      return arrow + ' free taxi ride from the source: 0';
    }
    var fromText = 's(' + candidate.fromI + ', ' + candidate.fromJ + ') ';
    var edgeName;
    if (candidate.direction === 'diag') {
      var a = state.v.charAt(step.i - 1);
      var b = state.w.charAt(step.j - 1);
      edgeName = a === b ? 'match ' + a + '/' + b : 'mismatch ' + a + '/' + b;
    } else if (candidate.direction === 'down') {
      edgeName = 'deletion';
    } else {
      edgeName = 'insertion';
    }
    return arrow + ' ' + fromText + edgeText(candidate.edge) + ' (' + edgeName + ') = ' + signed(candidate.value);
  }

  function renderFillExplanation(state, step) {
    var box = state.explainBox;
    if (step.kind === 'borders') {
      var borderText;
      if (state.scoring.mode === 'local') {
        borderText = 'Row 0 and column 0 are all 0: every node can be reached by a free taxi ride from the source.';
      } else if (state.scoring.mode === 'lcs') {
        borderText = 'Row 0 and column 0 are all 0, as in LCSBackTrack: indels earn nothing.';
      } else {
        borderText = 'Row 0 and column 0 use only indels, so s(i, 0) = −' + state.scoring.indel + ' · i and s(0, j) = −' + state.scoring.indel + ' · j.';
      }
      box.appendChild(makeElement('p', 'wa-explain-head', 'Initialize the borders.'));
      box.appendChild(makeElement('p', 'wa-note', borderText));
      return 'Initialized row 0 and column 0.';
    }
    box.appendChild(makeElement('p', 'wa-explain-head', 's(' + step.i + ', ' + step.j + ') is the maximum of:'));
    var list = makeElement('ul', 'wa-candidates');
    var spoken = [];
    for (var c = 0; c < step.candidates.length; c += 1) {
      var candidate = step.candidates[c];
      var sentence = candidateSentence(candidate, step, state);
      var item = makeElement('li', 'wa-mono', sentence);
      if (candidate.direction === step.direction) {
        item.className += ' wa-win';
        item.textContent += '  ← wins';
      }
      list.appendChild(item);
      spoken.push(sentence);
    }
    box.appendChild(list);
    box.appendChild(makeElement('p', 'wa-result', 's(' + step.i + ', ' + step.j + ') = ' + signed(step.value) + ', pointer ' + ARROWS[step.direction]));
    return 's(' + step.i + ', ' + step.j + '): ' + spoken.join('; ') + '. Result ' + signed(step.value) + ', pointer ' + pointerWords(step.direction) + '.';
  }

  function renderBacktrackExplanation(state) {
    var box = state.explainBox;
    var path = state.result.path;
    var shown = Math.min(state.backtrackCount, path.length);
    var node = path[shown - 1];
    var head;
    if (shown === 1) {
      if (state.scoring.mode === 'local') {
        head = 'Backtrack from the highest score, s(' + node.i + ', ' + node.j + ') = ' + signed(state.result.score) + ' (a free ride takes it to the sink).';
      } else {
        head = 'Backtrack from the sink s(' + node.i + ', ' + node.j + ') = ' + signed(state.result.score) + '.';
      }
    } else {
      head = 'Follow the pointer back to (' + node.i + ', ' + node.j + ').';
    }
    box.appendChild(makeElement('p', 'wa-explain-head', head));
    if (shown === path.length) {
      var ending = state.scoring.mode === 'local' && (node.i > 0 || node.j > 0) ?
        'Reached (' + node.i + ', ' + node.j + '), where a free taxi ride from the source begins the path.' :
        'Reached the source (0, 0).';
      box.appendChild(makeElement('p', 'wa-note', ending));
    } else {
      box.appendChild(makeElement('p', 'wa-note', 'Backtracking goes against each pointer: ' + ARROWS.down + ' moves up, ' + ARROWS.right + ' moves left, ' + ARROWS.diag + ' moves up and left.'));
    }
    return head;
  }

  function renderExplanation(state) {
    state.explainBox.innerHTML = '';
    if (state.fillIndex < 0) {
      state.explainBox.appendChild(makeElement('p', 'wa-note', 'Press Step to initialize row 0 and column 0, then fill the grid one cell at a time, row by row.'));
      return 'Ready. The grid is empty.';
    }
    if (state.backtrackCount > 0) {
      return renderBacktrackExplanation(state);
    }
    return renderFillExplanation(state, currentStep(state));
  }

  /* ---------- Alignment output ---------- */

  function alignmentRow(label, symbols, kinds) {
    var row = makeElement('div', 'wa-aln-row');
    row.appendChild(makeElement('span', 'wa-aln-label', label));
    for (var k = 0; k < symbols.length; k += 1) {
      row.appendChild(makeElement('span', 'wa-col wa-' + kinds[k], symbols.charAt(k)));
    }
    return row;
  }

  function markerSymbols(kinds) {
    var markers = '';
    for (var k = 0; k < kinds.length; k += 1) {
      markers += kinds[k] === 'match' ? '|' : (kinds[k] === 'mismatch' ? '·' : ' ');
    }
    return markers;
  }

  function countText(counts) {
    return counts.match + (counts.match === 1 ? ' match, ' : ' matches, ') +
      counts.mismatch + (counts.mismatch === 1 ? ' mismatch, ' : ' mismatches, ') +
      counts.insertion + (counts.insertion === 1 ? ' insertion, ' : ' insertions, ') +
      counts.deletion + (counts.deletion === 1 ? ' deletion' : ' deletions');
  }

  function scoreFormula(state) {
    var counts = state.result.counts;
    var scoring = state.scoring;
    if (scoring.mode === 'lcs') {
      return 'Score = number of matches = ' + counts.match + '; a longest common subsequence is ' + (state.result.lcs || '(empty)') + '.';
    }
    var indels = counts.insertion + counts.deletion;
    if (scoring.matrix === 'blosum62') {
      return 'Score = sum of BLOSUM62 entries − ' + scoring.indel + ' · ' + indels + ' indels = ' + signed(state.result.score) + '.';
    }
    return 'Score = ' + scoring.match + ' · ' + counts.match + ' − ' + scoring.mismatch + ' · ' + counts.mismatch + ' − ' + scoring.indel + ' · ' + indels + ' = ' + signed(state.result.score) + '.';
  }

  function renderAlignment(state) {
    var box = state.alignmentBox;
    box.innerHTML = '';
    var done = state.backtrackCount >= state.result.path.length;
    if (!done) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var alignment = state.result.alignment;
    box.appendChild(makeElement('p', 'wa-explain-head', state.scoring.mode === 'local' ? 'Optimal local alignment' : 'Optimal alignment'));
    if (alignment.kinds.length === 0) {
      box.appendChild(makeElement('p', 'wa-note', 'The best local alignment is empty (score 0): no pair of substrings scores above 0.'));
      return;
    }
    var lines = makeElement('div', 'wa-aln');
    lines.setAttribute('role', 'img');
    lines.setAttribute('aria-label', 'Alignment: ' + alignment.top + ' over ' + alignment.bottom);
    lines.appendChild(alignmentRow('v', alignment.top, alignment.kinds));
    var markerKinds = [];
    for (var k = 0; k < alignment.kinds.length; k += 1) {
      markerKinds.push('marker');
    }
    lines.appendChild(alignmentRow('', markerSymbols(alignment.kinds), markerKinds));
    lines.appendChild(alignmentRow('w', alignment.bottom, alignment.kinds));
    box.appendChild(lines);
    box.appendChild(makeElement('p', 'wa-note', countText(state.result.counts) + '. ' + scoreFormula(state)));
    if (state.scoring.mode === 'local') {
      var start = state.result.localStart;
      var end = state.result.localEnd;
      box.appendChild(makeElement('p', 'wa-note', 'Aligned substrings: v[' + (start.i + 1) + '..' + end.i + '] = ' + state.v.slice(start.i, end.i) +
        ' and w[' + (start.j + 1) + '..' + end.j + '] = ' + state.w.slice(start.j, end.j) + '.'));
    }
  }

  /* ---------- Stepping ---------- */

  function isFillDone(state) {
    return state.fillIndex === state.lastFillIndex;
  }

  function isAllDone(state) {
    return isFillDone(state) && state.backtrackCount >= state.result.path.length;
  }

  function stepForward(state) {
    if (!isFillDone(state)) {
      state.fillIndex += 1;
    } else if (state.backtrackCount < state.result.path.length) {
      state.backtrackCount += 1;
    }
    if (isAllDone(state)) {
      stopPlaying(state);
    }
    render(state);
  }

  function stopPlaying(state) {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function render(state) {
    renderGrid(state);
    var spoken = renderExplanation(state);
    renderAlignment(state);
    var allDone = isAllDone(state);
    state.stepButton.disabled = allDone;
    state.playButton.disabled = allDone;
    state.fillButton.disabled = isFillDone(state);
    state.backtrackButton.disabled = allDone;
    state.playButton.textContent = state.timer ? 'Pause' : 'Play';
    if (isFillDone(state) && state.backtrackCount === 0) {
      spoken += ' The grid is full; Step now backtracks.';
    }
    if (allDone) {
      spoken = 'Done. Optimal score ' + signed(state.result.score) + '. ' + countText(state.result.counts) + '.';
    }
    state.status.textContent = spoken;
  }

  function togglePlay(state) {
    if (state.timer) {
      stopPlaying(state);
      render(state);
      return;
    }
    if (prefersReducedMotion()) {
      state.fillIndex = state.lastFillIndex;
      state.backtrackCount = state.result.path.length;
      render(state);
      return;
    }
    state.timer = window.setInterval(function () { stepForward(state); }, PLAY_INTERVAL_MS);
    render(state);
  }

  function loadProblem(state, problem) {
    stopPlaying(state);
    state.v = problem.v;
    state.w = problem.w;
    state.scoring = problem.scoring;
    state.result = align(problem.v, problem.w, problem.scoring);
    state.lastFillIndex = state.result.steps.length - 1;
    state.fillIndex = -1;
    state.backtrackCount = 0;
    buildGrid(state);
    render(state);
  }

  function readForm(state) {
    return {
      v: state.vInput.value,
      w: state.wInput.value,
      mode: selectedMode(state),
      matrix: state.matrixSelect.value,
      match: state.matchInput.value,
      mismatch: state.mismatchInput.value,
      indel: state.indelInput.value
    };
  }

  function applyForm(state) {
    var parsed = parseProblem(readForm(state));
    if (parsed.errors) {
      state.errorLine.textContent = parsed.errors.join(' ');
      state.errorLine.hidden = false;
      return;
    }
    state.errorLine.hidden = true;
    state.errorLine.textContent = '';
    state.vInput.value = parsed.v;
    state.wInput.value = parsed.w;
    loadProblem(state, parsed);
  }

  function applyPreset(state, index) {
    var preset = PRESETS[index];
    state.vInput.value = preset.v;
    state.wInput.value = preset.w;
    for (var k = 0; k < state.modeInputs.length; k += 1) {
      state.modeInputs[k].checked = state.modeInputs[k].value === preset.mode;
    }
    state.matrixSelect.value = preset.matrix;
    state.matchInput.value = String(preset.match);
    state.mismatchInput.value = String(preset.mismatch);
    state.indelInput.value = String(preset.indel);
    syncParameterInputs(state);
    applyForm(state);
  }

  function buildLegend() {
    var legend = makeElement('p', 'wa-legend');
    var items = [
      ['wa-key wa-key-current', 'current cell'],
      ['wa-key wa-key-candidate', 'predecessors'],
      ['wa-key wa-key-winner', 'winning predecessor'],
      ['wa-key wa-key-path', 'optimal path']
    ];
    for (var k = 0; k < items.length; k += 1) {
      var item = makeElement('span', 'wa-legend-item');
      item.appendChild(makeElement('span', items[k][0], ''));
      item.appendChild(document.createTextNode(items[k][1]));
      legend.appendChild(item);
    }
    var arrows = makeElement('span', 'wa-legend-item', ARROWS.down + ' deletion  ' + ARROWS.right + ' insertion  ' + ARROWS.diag + ' match/mismatch  ' + ARROWS.source + ' free ride');
    legend.appendChild(arrows);
    return legend;
  }

  function buildAlignmentLegend() {
    var legend = makeElement('p', 'wa-legend wa-aln-legend');
    var kinds = [['match', 'match'], ['mismatch', 'mismatch'], ['insertion', 'insertion (gap in v)'], ['deletion', 'deletion (gap in w)']];
    for (var k = 0; k < kinds.length; k += 1) {
      legend.appendChild(makeElement('span', 'wa-legend-item wa-' + kinds[k][0], kinds[k][1]));
    }
    return legend;
  }

  function mount(root) {
    if (root.getAttribute('data-widget-ready') === 'true') {
      return;
    }
    root.setAttribute('data-widget-ready', 'true');
    widgetCounter += 1;
    var state = { idPrefix: 'waln' + widgetCounter, timer: null, backtrackCount: 0, fillIndex: -1 };
    var app = makeElement('div', 'wa-app');
    app.appendChild(buildControls(state));
    state.errorLine = makeElement('p', 'wa-error');
    state.errorLine.setAttribute('role', 'alert');
    state.errorLine.hidden = true;
    app.appendChild(state.errorLine);

    var buttons = makeElement('div', 'wa-buttons');
    state.stepButton = buildButton('Step');
    state.playButton = buildButton('Play');
    state.fillButton = buildButton('Fill grid');
    state.backtrackButton = buildButton('Show path');
    state.resetButton = buildButton('Reset');
    buttons.appendChild(state.stepButton);
    buttons.appendChild(state.playButton);
    buttons.appendChild(state.fillButton);
    buttons.appendChild(state.backtrackButton);
    buttons.appendChild(state.resetButton);
    app.appendChild(buttons);

    state.explainBox = makeElement('div', 'wa-explain');
    app.appendChild(state.explainBox);

    state.gridBox = makeElement('div', 'wa-grid-box');
    state.gridBox.setAttribute('tabindex', '0');
    state.gridBox.setAttribute('role', 'region');
    state.gridBox.setAttribute('aria-label', 'Dynamic programming grid; scrolls if it is wider than the screen');
    app.appendChild(state.gridBox);
    app.appendChild(buildLegend());

    state.alignmentBox = makeElement('div', 'wa-alignment');
    state.alignmentBox.hidden = true;
    var alignmentWrap = makeElement('div', 'wa-alignment-wrap');
    alignmentWrap.appendChild(state.alignmentBox);
    app.appendChild(alignmentWrap);
    app.appendChild(buildAlignmentLegend());

    state.status = makeElement('p', 'wa-status');
    state.status.setAttribute('aria-live', 'polite');
    app.appendChild(state.status);

    var foot = root.querySelector('.widget-foot');
    if (foot) {
      root.insertBefore(app, foot);
    } else {
      root.appendChild(app);
    }

    state.presetSelect.addEventListener('change', function () {
      applyPreset(state, parseInt(state.presetSelect.value, 10));
    });
    state.buildButton.addEventListener('click', function () { applyForm(state); });
    for (var k = 0; k < state.modeInputs.length; k += 1) {
      state.modeInputs[k].addEventListener('change', function () { syncParameterInputs(state); });
    }
    state.matrixSelect.addEventListener('change', function () { syncParameterInputs(state); });
    var textInputs = [state.vInput, state.wInput, state.matchInput, state.mismatchInput, state.indelInput];
    for (var t = 0; t < textInputs.length; t += 1) {
      textInputs[t].addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          applyForm(state);
        }
      });
    }
    state.stepButton.addEventListener('click', function () {
      stopPlaying(state);
      stepForward(state);
    });
    state.playButton.addEventListener('click', function () { togglePlay(state); });
    state.fillButton.addEventListener('click', function () {
      stopPlaying(state);
      state.fillIndex = state.lastFillIndex;
      state.backtrackCount = 0;
      render(state);
    });
    state.backtrackButton.addEventListener('click', function () {
      stopPlaying(state);
      state.fillIndex = state.lastFillIndex;
      state.backtrackCount = state.result.path.length;
      render(state);
    });
    state.resetButton.addEventListener('click', function () {
      stopPlaying(state);
      state.fillIndex = -1;
      state.backtrackCount = 0;
      render(state);
    });

    applyPreset(state, 0);
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-widget="alignment"]');
    for (var i = 0; i < roots.length; i += 1) {
      mount(roots[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
