/* Spectral convolution + LeaderboardCyclopeptideSequencing widget
   (Chapter 4, lessons 4.7 and 4.9). Pure algorithm core first, then the
   browser UI. No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Algorithm core (pure functions, exported for tests)
     ------------------------------------------------------------------ */

  // The 18 distinct integer masses of the book's amino acid alphabet.
  var AMINO_ACID_MASSES = [57, 71, 87, 97, 99, 101, 103, 113, 114, 115, 128, 129, 131, 137, 147, 156, 163, 186];

  var CONVOLUTION_LOW = 57;
  var CONVOLUTION_HIGH = 200;

  var LIMITS = {
    maxSpectrumSize: 120,
    maxMass: 1500,
    maxM: 30,
    maxN: 100,
    maxLeaderboardSize: 12000
  };

  // Simulated experimental spectrum of NQEL from lessons 4.7 and 4.9.
  var BOOK_NQEL_SPECTRUM = [0, 99, 113, 114, 128, 227, 257, 299, 355, 356, 370, 371, 484];

  function parseIntegerList(rawText) {
    var text = String(rawText == null ? '' : rawText).trim();
    if (text.length === 0) {
      return { ok: false, values: [], error: 'Enter a spectrum: integer masses separated by spaces.' };
    }
    var tokens = text.split(/[\s,]+/);
    var values = [];
    for (var index = 0; index < tokens.length; index += 1) {
      var token = tokens[index];
      if (token.length === 0) {
        continue;
      }
      if (!/^\d+$/.test(token)) {
        return { ok: false, values: [], error: '"' + token + '" is not a whole number of daltons.' };
      }
      values.push(Number(token));
    }
    if (values.length === 0) {
      return { ok: false, values: [], error: 'Enter a spectrum: integer masses separated by spaces.' };
    }
    return { ok: true, values: values, error: '' };
  }

  function validateSpectrum(rawText) {
    var parsed = parseIntegerList(rawText);
    if (!parsed.ok) {
      return { ok: false, spectrum: [], error: parsed.error };
    }
    var values = sortedNumbers(parsed.values);
    if (values.length > LIMITS.maxSpectrumSize) {
      return { ok: false, spectrum: [], error: 'Please keep the spectrum to at most ' + LIMITS.maxSpectrumSize + ' masses (yours has ' + values.length + ').' };
    }
    if (values[values.length - 1] > LIMITS.maxMass) {
      return { ok: false, spectrum: [], error: 'Please keep every mass at most ' + LIMITS.maxMass + ' Da so the search runs instantly.' };
    }
    if (values[values.length - 1] < CONVOLUTION_LOW) {
      return { ok: false, spectrum: [], error: 'The largest mass (the parent mass) must be at least ' + CONVOLUTION_LOW + ' Da, the lightest amino acid.' };
    }
    return { ok: true, spectrum: values, error: '' };
  }

  function clampInteger(rawValue, low, high) {
    var value = Math.round(Number(rawValue));
    if (!isFinite(value)) {
      return low;
    }
    return Math.min(high, Math.max(low, value));
  }

  function sortedNumbers(numbers) {
    var copy = numbers.slice();
    copy.sort(function (first, second) { return first - second; });
    return copy;
  }

  function sumOf(numbers) {
    var total = 0;
    for (var index = 0; index < numbers.length; index += 1) {
      total += numbers[index];
    }
    return total;
  }

  function parentMass(spectrum) {
    var largest = 0;
    for (var index = 0; index < spectrum.length; index += 1) {
      largest = Math.max(largest, spectrum[index]);
    }
    return largest;
  }

  // All positive differences between pairs of masses in the spectrum,
  // with multiplicity, as a sorted multiset.
  function spectralConvolution(spectrum) {
    var differences = [];
    for (var i = 0; i < spectrum.length; i += 1) {
      for (var j = 0; j < spectrum.length; j += 1) {
        var difference = spectrum[i] - spectrum[j];
        if (difference > 0) {
          differences.push(difference);
        }
      }
    }
    return sortedNumbers(differences);
  }

  // Counts of each value, as sorted [{mass, count}] pairs.
  function countValues(values) {
    var sorted = sortedNumbers(values);
    var groups = [];
    for (var index = 0; index < sorted.length; index += 1) {
      var last = groups[groups.length - 1];
      if (last && last.mass === sorted[index]) {
        last.count += 1;
      } else {
        groups.push({ mass: sorted[index], count: 1 });
      }
    }
    return groups;
  }

  function compareByCountThenMass(first, second) {
    if (first.count !== second.count) {
      return second.count - first.count;
    }
    return first.mass - second.mass;
  }

  // Convolution masses between 57 and 200, most frequent first.
  function rankedConvolutionMasses(convolution) {
    var groups = countValues(convolution);
    var inRange = [];
    for (var index = 0; index < groups.length; index += 1) {
      if (groups[index].mass >= CONVOLUTION_LOW && groups[index].mass <= CONVOLUTION_HIGH) {
        inRange.push(groups[index]);
      }
    }
    inRange.sort(compareByCountThenMass);
    return inRange;
  }

  // The first M ranked items plus anything tied with the M-th.
  function takeTopWithTies(rankedItems, M, scoreOf) {
    if (rankedItems.length <= M) {
      return rankedItems.slice();
    }
    var cutoff = scoreOf(rankedItems[M - 1]);
    var kept = [];
    for (var index = 0; index < rankedItems.length; index += 1) {
      if (index < M || scoreOf(rankedItems[index]) === cutoff) {
        kept.push(rankedItems[index]);
      }
    }
    return kept;
  }

  function countOf(item) {
    return item.count;
  }

  function topConvolutionMasses(convolution, M) {
    return takeTopWithTies(rankedConvolutionMasses(convolution), M, countOf);
  }

  function massesOfGroups(groups) {
    var masses = [];
    for (var index = 0; index < groups.length; index += 1) {
      masses.push(groups[index].mass);
    }
    return sortedNumbers(masses);
  }

  function prefixMasses(peptide) {
    var prefix = [0];
    for (var index = 0; index < peptide.length; index += 1) {
      prefix.push(prefix[index] + peptide[index]);
    }
    return prefix;
  }

  // Linear spectrum of a peptide given as a list of masses.
  function linearSpectrum(peptide) {
    var prefix = prefixMasses(peptide);
    var masses = [0];
    for (var i = 0; i < peptide.length; i += 1) {
      for (var j = i + 1; j <= peptide.length; j += 1) {
        masses.push(prefix[j] - prefix[i]);
      }
    }
    return sortedNumbers(masses);
  }

  // Cyclic spectrum of a peptide given as a list of masses.
  function cyclicSpectrum(peptide) {
    var prefix = prefixMasses(peptide);
    var total = prefix[peptide.length];
    var masses = [0];
    for (var i = 0; i < peptide.length; i += 1) {
      for (var j = i + 1; j <= peptide.length; j += 1) {
        masses.push(prefix[j] - prefix[i]);
        if (i > 0 && j < peptide.length) {
          masses.push(total - (prefix[j] - prefix[i]));
        }
      }
    }
    return sortedNumbers(masses);
  }

  // Map from mass to multiplicity, used to score quickly.
  function countMap(values) {
    var counts = new Map();
    for (var index = 0; index < values.length; index += 1) {
      counts.set(values[index], (counts.get(values[index]) || 0) + 1);
    }
    return counts;
  }

  // Number of masses shared by two spectra, respecting multiplicities.
  function sharedMassCount(theoretical, spectrumCounts) {
    var remaining = new Map(spectrumCounts);
    var shared = 0;
    for (var index = 0; index < theoretical.length; index += 1) {
      var available = remaining.get(theoretical[index]) || 0;
      if (available > 0) {
        shared += 1;
        remaining.set(theoretical[index], available - 1);
      }
    }
    return shared;
  }

  function cyclicScore(peptide, spectrum) {
    return sharedMassCount(cyclicSpectrum(peptide), countMap(spectrum));
  }

  function linearScore(peptide, spectrum) {
    return sharedMassCount(linearSpectrum(peptide), countMap(spectrum));
  }

  function peptideName(peptide) {
    return peptide.length === 0 ? '(empty)' : peptide.join('-');
  }

  function compareScoredPeptides(first, second) {
    if (first.score !== second.score) {
      return second.score - first.score;
    }
    return 0;
  }

  function scoreOf(item) {
    return item.score;
  }

  // Scores every peptide linearly and sorts best first (stable for ties).
  function rankByLinearScore(leaderboard, spectrumCounts) {
    var scored = [];
    for (var index = 0; index < leaderboard.length; index += 1) {
      scored.push({ peptide: leaderboard[index], score: sharedMassCount(linearSpectrum(leaderboard[index]), spectrumCounts), order: index });
    }
    scored.sort(function (first, second) {
      var byScore = compareScoredPeptides(first, second);
      return byScore !== 0 ? byScore : first.order - second.order;
    });
    return scored;
  }

  // Trim(Leaderboard, Spectrum, N): the N highest-scoring linear peptides, with ties.
  function trim(leaderboard, spectrum, N) {
    var ranked = rankByLinearScore(leaderboard, countMap(spectrum));
    var kept = takeTopWithTies(ranked, N, scoreOf);
    var peptides = [];
    for (var index = 0; index < kept.length; index += 1) {
      peptides.push(kept[index].peptide);
    }
    return peptides;
  }

  function expand(leaderboard, alphabet) {
    var expanded = [];
    for (var index = 0; index < leaderboard.length; index += 1) {
      for (var letter = 0; letter < alphabet.length; letter += 1) {
        expanded.push(leaderboard[index].concat([alphabet[letter]]));
      }
    }
    return expanded;
  }

  function containsPeptide(list, peptide) {
    var name = peptideName(peptide);
    for (var index = 0; index < list.length; index += 1) {
      if (peptideName(list[index]) === name) {
        return true;
      }
    }
    return false;
  }

  // Runs one round of the book's loop and returns a full record of it.
  function runRound(leaderboard, state, context) {
    var expanded = expand(leaderboard, context.alphabet);
    var survivors = [];
    var tooHeavyCount = 0;
    var reachedParent = [];
    var leaderChanged = false;
    for (var index = 0; index < expanded.length; index += 1) {
      var peptide = expanded[index];
      var mass = sumOf(peptide);
      if (mass === context.parent) {
        var score = sharedMassCount(cyclicSpectrum(peptide), context.spectrumCounts);
        reachedParent.push({ peptide: peptide, score: score });
        if (score > state.leaderScore) {
          state.leaderScore = score;
          state.leader = peptide;
          state.tiedLeaders = [peptide];
          leaderChanged = true;
        } else if (score === state.leaderScore && state.leader.length > 0 && !containsPeptide(state.tiedLeaders, peptide)) {
          state.tiedLeaders.push(peptide);
        }
        survivors.push(peptide);
      } else if (mass > context.parent) {
        tooHeavyCount += 1;
      } else {
        survivors.push(peptide);
      }
    }
    var ranked = rankByLinearScore(survivors, context.spectrumCounts);
    var kept = takeTopWithTies(ranked, context.N, scoreOf);
    var cutoffScore = kept.length > 0 ? kept[kept.length - 1].score : null;
    var keptPeptides = [];
    for (var keptIndex = 0; keptIndex < kept.length; keptIndex += 1) {
      keptPeptides.push(kept[keptIndex].peptide);
    }
    return {
      expandedCount: expanded.length,
      tooHeavyCount: tooHeavyCount,
      reachedParent: reachedParent,
      ranked: ranked,
      keptCount: kept.length,
      cutoffScore: cutoffScore,
      nextLeaderboard: keptPeptides,
      leader: state.leader,
      leaderScore: state.leaderScore,
      tiedLeaders: state.tiedLeaders.slice(),
      leaderChanged: leaderChanged
    };
  }

  // LeaderboardCyclopeptideSequencing(Spectrum, N) over `alphabet`,
  // recording every round so the reader can step through it.
  function leaderboardSequencing(spectrum, N, alphabet, options) {
    var maxLeaderboardSize = (options && options.maxLeaderboardSize) || LIMITS.maxLeaderboardSize;
    var context = {
      alphabet: sortedNumbers(alphabet),
      parent: parentMass(spectrum),
      spectrumCounts: countMap(spectrum),
      N: N
    };
    var state = {
      leader: [],
      leaderScore: sharedMassCount(cyclicSpectrum([]), context.spectrumCounts),
      tiedLeaders: []
    };
    var rounds = [];
    var leaderboard = [[]];
    var stoppedEarly = false;
    while (leaderboard.length > 0) {
      if (leaderboard.length * context.alphabet.length > maxLeaderboardSize) {
        stoppedEarly = true;
        break;
      }
      var round = runRound(leaderboard, state, context);
      round.number = rounds.length + 1;
      rounds.push(round);
      leaderboard = round.nextLeaderboard;
    }
    return {
      parent: context.parent,
      alphabet: context.alphabet,
      rounds: rounds,
      leader: state.leader,
      leaderScore: state.leaderScore,
      tiedLeaders: state.tiedLeaders,
      stoppedEarly: stoppedEarly
    };
  }

  function lettersToMasses(peptideLetters, massTable) {
    var masses = [];
    for (var index = 0; index < peptideLetters.length; index += 1) {
      masses.push(massTable[peptideLetters[index]]);
    }
    return masses;
  }

  var core = {
    AMINO_ACID_MASSES: AMINO_ACID_MASSES,
    BOOK_NQEL_SPECTRUM: BOOK_NQEL_SPECTRUM,
    LIMITS: LIMITS,
    validateSpectrum: validateSpectrum,
    clampInteger: clampInteger,
    parentMass: parentMass,
    spectralConvolution: spectralConvolution,
    countValues: countValues,
    rankedConvolutionMasses: rankedConvolutionMasses,
    topConvolutionMasses: topConvolutionMasses,
    massesOfGroups: massesOfGroups,
    linearSpectrum: linearSpectrum,
    cyclicSpectrum: cyclicSpectrum,
    cyclicScore: cyclicScore,
    linearScore: linearScore,
    trim: trim,
    expand: expand,
    leaderboardSequencing: leaderboardSequencing,
    peptideName: peptideName,
    lettersToMasses: lettersToMasses
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }

  if (typeof document === 'undefined') {
    return;
  }

  /* ------------------------------------------------------------------
     Browser UI
     ------------------------------------------------------------------ */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PLAY_DELAY_MS = 1200;
  var MAX_ROWS_SHOWN = 40;

  var PRESETS = [
    { name: 'Simulated NQEL (book)', spectrum: BOOK_NQEL_SPECTRUM.join(' '), M: 5, N: 5 },
    { name: 'Tyrocidine B1 Spectrum25 (book)', spectrum: '0 97 99 113 114 115 128 128 147 147 163 186 227 241 242 244 244 256 260 261 262 283 291 309 330 333 340 347 385 388 389 390 390 405 435 447 485 487 503 504 518 544 552 575 577 584 599 608 631 632 650 651 653 672 690 691 717 738 745 770 779 804 818 819 827 835 837 875 892 892 917 932 932 933 934 965 982 989 1039 1060 1062 1078 1080 1081 1095 1136 1159 1175 1175 1194 1194 1208 1209 1223 1322', M: 20, N: 100 },
    { name: 'BA4I sample', spectrum: '57 57 71 99 129 137 170 186 194 208 228 265 285 299 307 323 356 364 394 422 493', M: 20, N: 60 },
    { name: 'BA4G sample', spectrum: '0 71 113 129 147 200 218 260 313 331 347 389 460', M: 20, N: 10 }
  ];

  function element(tag, attributes, children) {
    var node = document.createElement(tag);
    setAttributes(node, attributes);
    appendChildren(node, children);
    return node;
  }

  function svgElement(tag, attributes, children) {
    var node = document.createElementNS(SVG_NS, tag);
    setAttributes(node, attributes);
    appendChildren(node, children);
    return node;
  }

  function setAttributes(node, attributes) {
    if (!attributes) {
      return;
    }
    var names = Object.keys(attributes);
    for (var index = 0; index < names.length; index += 1) {
      var name = names[index];
      if (name === 'text') {
        node.textContent = attributes[name];
      } else {
        node.setAttribute(name, attributes[name]);
      }
    }
  }

  function appendChildren(node, children) {
    if (!children) {
      return;
    }
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index];
      if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else if (child) {
        node.appendChild(child);
      }
    }
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function numberField(idBase, suffix, labelText, value, low, high) {
    var input = element('input', { id: idBase + suffix, type: 'number', min: String(low), max: String(high), step: '1', value: String(value), class: 'wc-number', inputmode: 'numeric' });
    var label = element('label', { for: idBase + suffix, class: 'wc-label', text: labelText });
    return { input: input, wrapper: element('span', { class: 'wc-field' }, [label, input]) };
  }

  // Returns the body element inside the widget frame. The include ships
  // the frame (head, body, foot); build it here only if a page lacks it.
  function frameBody(root, bodyClass, title, footLink, footLead, footText) {
    var body = root.querySelector('.' + bodyClass);
    if (body) {
      clearNode(body);
      return body;
    }
    clearNode(root);
    body = element('div', { class: bodyClass });
    appendChildren(root, [
      element('div', { class: 'widget-head' }, [element('span', { class: 'widget-kicker', text: 'Try it' }), ' ' + title]),
      body,
      element('p', { class: 'widget-foot' }, [footLead, element('a', { href: footLink, text: footText }), '.'])
    ]);
    return body;
  }

  function createWidget(root) {
    var footLink = root.getAttribute('data-cogniterra') ||
      'https://cogniterra.org/lesson/29917/?utm_source=bioinformaticsalgorithms.org&utm_medium=widget&utm_campaign=convolution';
    var idBase = 'w-convolution-' + Math.random().toString(36).slice(2, 8);

    var state = {
      spectrum: [],
      convolution: [],
      ranked: [],
      selected: [],
      useConvolutionAlphabet: true,
      result: null,
      roundShown: 0,
      playTimer: null
    };

    var spectrumInput = element('textarea', { id: idBase + '-spectrum', rows: '2', class: 'wc-textarea', spellcheck: 'false' });
    spectrumInput.value = PRESETS[0].spectrum;
    var presetButtons = [];
    for (var presetIndex = 0; presetIndex < PRESETS.length; presetIndex += 1) {
      presetButtons.push(makePresetButton(PRESETS[presetIndex]));
    }
    var mField = numberField(idBase, '-m', 'M', PRESETS[0].M, 1, LIMITS.maxM);
    var nField = numberField(idBase, '-n', 'N', PRESETS[0].N, 1, LIMITS.maxN);
    var alphabetConvolution = element('button', { type: 'button', class: 'wc-toggle', 'aria-pressed': 'true', text: 'Top M of the convolution' });
    var alphabetAll = element('button', { type: 'button', class: 'wc-toggle', 'aria-pressed': 'false', text: 'All 18 amino acid masses' });
    var errorLine = element('p', { class: 'wc-error', role: 'alert' });

    var convolutionText = element('p', { class: 'wc-multiset' });
    var histogramHolder = element('div', { class: 'wc-histogram' });
    var topHolder = element('div', { class: 'wc-top' });

    var resetButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Reset' });
    var stepButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Step' });
    var playButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Play' });
    var endButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Run to end' });
    var status = element('p', { class: 'wc-status', 'aria-live': 'polite' });
    var roundHolder = element('div', { class: 'wc-round' });
    var leaderHolder = element('div', { class: 'wc-leader' });

    var body = frameBody(root, 'w-convolution-body', 'Spectral convolution and leaderboard sequencing', footLink,
      'Now make the computer do it: ', 'Implement ConvolutionCyclopeptideSequencing in the interactive text');
    appendChildren(body, [
      element('p', { class: 'wc-hint', text: 'Up to ' + LIMITS.maxSpectrumSize + ' masses, each at most ' + LIMITS.maxMass + ' Da; M up to ' + LIMITS.maxM + ', N up to ' + LIMITS.maxN + '.' }),
      element('div', { class: 'wc-presets', role: 'group', 'aria-label': 'Example spectra' }, presetButtons),
      element('label', { for: idBase + '-spectrum', class: 'wc-label', text: 'Experimental spectrum' }),
      spectrumInput,
      errorLine,
      element('h4', { class: 'wc-subhead', text: '1. The spectral convolution' }),
      convolutionText,
      histogramHolder,
      element('h4', { class: 'wc-subhead', text: '2. Choose an alphabet' }),
      element('div', { class: 'wc-row' }, [
        mField.wrapper,
        element('div', { class: 'wc-toggles', role: 'group', 'aria-label': 'Alphabet' }, [alphabetConvolution, alphabetAll])
      ]),
      topHolder,
      element('h4', { class: 'wc-subhead', text: '3. LeaderboardCyclopeptideSequencing' }),
      element('div', { class: 'wc-row' }, [nField.wrapper, resetButton, stepButton, playButton, endButton]),
      status,
      leaderHolder,
      roundHolder
    ]);

    function makePresetButton(preset) {
      var button = element('button', { type: 'button', class: 'wc-preset', text: preset.name });
      button.addEventListener('click', function () {
        spectrumInput.value = preset.spectrum;
        mField.input.value = String(preset.M);
        nField.input.value = String(preset.N);
        recomputeAll();
      });
      return button;
    }

    function stopPlaying() {
      if (state.playTimer !== null) {
        window.clearInterval(state.playTimer);
        state.playTimer = null;
      }
      playButton.textContent = 'Play';
    }

    function currentM() {
      return clampInteger(mField.input.value, 1, LIMITS.maxM);
    }

    function currentN() {
      return clampInteger(nField.input.value, 1, LIMITS.maxN);
    }

    function recomputeAll() {
      stopPlaying();
      var check = validateSpectrum(spectrumInput.value);
      if (!check.ok) {
        errorLine.textContent = check.error;
        return;
      }
      errorLine.textContent = '';
      state.spectrum = check.spectrum;
      state.convolution = spectralConvolution(state.spectrum);
      state.ranked = rankedConvolutionMasses(state.convolution);
      renderConvolution();
      recomputeAlphabet();
    }

    function recomputeAlphabet() {
      stopPlaying();
      state.selected = topConvolutionMasses(state.convolution, currentM());
      renderHistogram();
      renderTopMasses();
      recomputeSequencing();
    }

    function currentAlphabet() {
      return state.useConvolutionAlphabet ? massesOfGroups(state.selected) : AMINO_ACID_MASSES.slice();
    }

    function recomputeSequencing() {
      stopPlaying();
      var alphabet = currentAlphabet();
      if (alphabet.length === 0) {
        state.result = null;
        state.roundShown = 0;
        renderSequencing();
        return;
      }
      state.result = leaderboardSequencing(state.spectrum, currentN(), alphabet);
      state.roundShown = 0;
      renderSequencing();
    }

    function renderConvolution() {
      var shown = state.convolution;
      var text = shown.length > 400 ? shown.slice(0, 400).join(' ') + ' … (' + (shown.length - 400) + ' more)' : shown.join(' ');
      convolutionText.textContent = shown.length + ' positive differences, sorted: ' + (shown.length ? text : 'none');
    }

    function isSelectedMass(mass) {
      for (var index = 0; index < state.selected.length; index += 1) {
        if (state.selected[index].mass === mass) {
          return true;
        }
      }
      return false;
    }

    function renderHistogram() {
      clearNode(histogramHolder);
      var groups = countValues(state.convolution);
      var inWindow = [];
      var maxCount = 1;
      for (var index = 0; index < groups.length; index += 1) {
        if (groups[index].mass >= CONVOLUTION_LOW && groups[index].mass <= CONVOLUTION_HIGH) {
          inWindow.push(groups[index]);
          maxCount = Math.max(maxCount, groups[index].count);
        }
      }
      var width = 640;
      var height = 170;
      var left = 30;
      var right = 12;
      var top = 30;
      var bottom = 28;
      var plotWidth = width - left - right;
      var plotHeight = height - top - bottom;
      var span = CONVOLUTION_HIGH - CONVOLUTION_LOW;
      var barWidth = Math.max(2, plotWidth / (span + 1) - 0.6);
      var svg = svgElement('svg', {
        viewBox: '0 0 ' + width + ' ' + height, class: 'wc-histogram-svg', role: 'img',
        'aria-label': 'Histogram of convolution masses from 57 to 200. Selected alphabet: ' + describeGroups(state.selected)
      });
      svg.appendChild(svgElement('line', { x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: 'wc-axis' }));
      var lastLabeledMass = null;
      var lastLabelRaised = false;
      for (var gridIndex = 0; gridIndex < inWindow.length; gridIndex += 1) {
        var group = inWindow[gridIndex];
        var x = left + (plotWidth * (group.mass - CONVOLUTION_LOW)) / (span + 1);
        var barHeight = (plotHeight * group.count) / maxCount;
        var selected = isSelectedMass(group.mass);
        svg.appendChild(svgElement('rect', {
          x: x, y: top + plotHeight - barHeight, width: barWidth, height: barHeight,
          class: selected ? 'wc-bar wc-bar-on' : 'wc-bar'
        }, [svgElement('title', { text: group.mass + ' appears ' + group.count + (group.count === 1 ? ' time' : ' times') })]));
        if (selected) {
          var isCrowded = lastLabeledMass !== null && group.mass - lastLabeledMass < 6 && !lastLabelRaised;
          var labelY = top + plotHeight - barHeight - (isCrowded ? 14 : 4);
          svg.appendChild(svgElement('text', { x: x + barWidth / 2, y: Math.max(9, labelY), 'text-anchor': 'middle', class: 'wc-bar-label', text: String(group.mass) }));
          lastLabelRaised = isCrowded;
          lastLabeledMass = group.mass;
        }
      }
      var ticks = [57, 100, 150, 200];
      for (var tickIndex = 0; tickIndex < ticks.length; tickIndex += 1) {
        var tickX = left + (plotWidth * (ticks[tickIndex] - CONVOLUTION_LOW)) / (span + 1);
        svg.appendChild(svgElement('text', { x: tickX, y: height - 8, 'text-anchor': 'middle', class: 'wc-tick', text: String(ticks[tickIndex]) }));
      }
      svg.appendChild(svgElement('text', { x: left - 6, y: top + 4, 'text-anchor': 'end', class: 'wc-tick', text: String(maxCount) }));
      histogramHolder.appendChild(svg);
      histogramHolder.appendChild(element('p', { class: 'wc-note', text: 'Bar height = multiplicity in the convolution (masses 57 to 200 only). Highlighted bars are the top M masses with ties.' }));
    }

    function describeGroups(groups) {
      var parts = [];
      for (var index = 0; index < groups.length; index += 1) {
        parts.push(groups[index].mass + ' (' + groups[index].count + ')');
      }
      return parts.length ? parts.join(', ') : 'none';
    }

    function renderTopMasses() {
      clearNode(topHolder);
      var M = currentM();
      if (state.ranked.length === 0) {
        topHolder.appendChild(element('p', { class: 'wc-note', text: 'No convolution mass falls between 57 and 200, so the convolution suggests no amino acids.' }));
        return;
      }
      var tieNote = '';
      if (state.selected.length > M) {
        tieNote = ' The M-th mass has multiplicity ' + state.selected[M - 1].count + ', so ' + (state.selected.length - M) + ' tied ' + (state.selected.length - M === 1 ? 'mass joins' : 'masses join') + ' it.';
      } else if (state.selected.length < M) {
        tieNote = ' Only ' + state.selected.length + ' distinct masses fall between 57 and 200.';
      }
      topHolder.appendChild(element('p', { class: 'wc-top-line' }, [
        'Top ' + M + ' with ties (multiplicities in parentheses): ',
        element('span', { class: 'wc-mono', text: describeGroups(state.selected) }),
        '.' + tieNote
      ]));
      if (!state.useConvolutionAlphabet) {
        topHolder.appendChild(element('p', { class: 'wc-note', text: 'The search below ignores this and uses all 18 amino acid masses, as in lesson 4.7.' }));
      }
    }

    function renderSequencing() {
      clearNode(roundHolder);
      clearNode(leaderHolder);
      var result = state.result;
      if (!result) {
        status.textContent = 'The alphabet is empty, so there is nothing to extend.';
        return;
      }
      var totalRounds = result.rounds.length;
      stepButton.disabled = state.roundShown >= totalRounds;
      endButton.disabled = state.roundShown >= totalRounds;
      if (state.roundShown === 0) {
        status.textContent = 'Leaderboard starts with the empty peptide. ParentMass(Spectrum) = ' + result.parent +
          '. Alphabet: ' + result.alphabet.join(', ') + '. Press Step to expand.';
        renderLeader(null);
        return;
      }
      var round = result.rounds[state.roundShown - 1];
      status.textContent = describeRound(round, totalRounds, result);
      renderLeader(round);
      renderRoundTable(round);
    }

    function describeRound(round, totalRounds, result) {
      var parts = ['Round ' + round.number + ' of ' + totalRounds + ': Expand made ' + round.expandedCount + ' peptides'];
      parts.push(round.tooHeavyCount + ' heavier than ' + result.parent + ' were removed');
      parts.push(round.reachedParent.length + ' reached the parent mass and were scored as cyclic peptides');
      var trimText = 'Trim kept ' + round.keptCount + ' of ' + round.ranked.length;
      if (round.keptCount > 0) {
        trimText += ' (linear score at least ' + round.cutoffScore + ')';
      }
      parts.push(trimText);
      var text = parts.join('; ') + '.';
      if (round.number === totalRounds && !result.stoppedEarly) {
        text += ' The leaderboard is now empty, so the algorithm stops.';
      }
      if (round.number === totalRounds && result.stoppedEarly) {
        text += ' Stopped here: the next leaderboard would pass ' + LIMITS.maxLeaderboardSize + ' peptides. Try a smaller N or M.';
      }
      return text;
    }

    function renderLeader(round) {
      var leader = round ? round.leader : [];
      if (!round || leader.length === 0) {
        leaderHolder.appendChild(element('p', { class: 'wc-leader-line' }, [
          'LeaderPeptide: ', element('span', { class: 'wc-mono', text: '(empty)' }), ' (no peptide has reached mass ' + state.result.parent + ' yet)'
        ]));
        return;
      }
      var line = element('p', { class: 'wc-leader-line' }, [
        'LeaderPeptide: ', element('strong', { class: 'wc-mono', text: peptideName(leader) }),
        ' with Score = ' + round.leaderScore + (round.leaderChanged ? ' (new leader this round)' : '')
      ]);
      leaderHolder.appendChild(line);
      if (round.tiedLeaders.length > 1) {
        var names = [];
        var shownCount = Math.min(round.tiedLeaders.length, 12);
        for (var index = 0; index < shownCount; index += 1) {
          names.push(peptideName(round.tiedLeaders[index]));
        }
        var extra = round.tiedLeaders.length > shownCount ? ' and ' + (round.tiedLeaders.length - shownCount) + ' more' : '';
        leaderHolder.appendChild(element('p', { class: 'wc-note' }, [
          round.tiedLeaders.length + ' peptides so far tie for this score (the algorithm keeps the first): ',
          element('span', { class: 'wc-mono', text: names.join(', ') + extra })
        ]));
      }
    }

    function reachedScore(round, peptide) {
      var name = peptideName(peptide);
      for (var index = 0; index < round.reachedParent.length; index += 1) {
        if (peptideName(round.reachedParent[index].peptide) === name) {
          return round.reachedParent[index].score;
        }
      }
      return null;
    }

    function renderRoundTable(round) {
      if (round.ranked.length === 0) {
        roundHolder.appendChild(element('p', { class: 'wc-note', text: 'Every expanded peptide was heavier than the parent mass, so nothing is left to trim.' }));
        return;
      }
      var table = element('table', { class: 'wc-table' });
      table.appendChild(element('caption', { text: 'Leaderboard after Expand, ranked by linear score (N = ' + currentN() + '); rows below the line are cut by Trim' }));
      table.appendChild(element('thead', null, [element('tr', null, [
        element('th', { scope: 'col', text: '#' }),
        element('th', { scope: 'col', text: 'peptide' }),
        element('th', { scope: 'col', text: 'mass' }),
        element('th', { scope: 'col', text: 'linear score' }),
        element('th', { scope: 'col', text: 'cyclic score' }),
        element('th', { scope: 'col', text: 'Trim' })
      ])]));
      var body = element('tbody');
      var rowsShown = Math.min(round.ranked.length, Math.max(MAX_ROWS_SHOWN, round.keptCount + 3));
      rowsShown = Math.min(rowsShown, round.ranked.length);
      for (var index = 0; index < rowsShown; index += 1) {
        body.appendChild(makeRoundRow(round, index));
      }
      table.appendChild(body);
      roundHolder.appendChild(table);
      if (rowsShown < round.ranked.length) {
        roundHolder.appendChild(element('p', { class: 'wc-note', text: (round.ranked.length - rowsShown) + ' more peptides, all cut, are not shown.' }));
      }
    }

    function makeRoundRow(round, index) {
      var item = round.ranked[index];
      var isKept = index < round.keptCount;
      var isTie = isKept && index >= currentN();
      var cyclic = reachedScore(round, item.peptide);
      var className = isKept ? 'wc-kept' : 'wc-cut';
      if (index === round.keptCount - 1) {
        className += ' wc-cutline';
      }
      return element('tr', { class: className }, [
        element('td', { text: String(index + 1) }),
        element('td', { class: 'wc-mono', text: peptideName(item.peptide) }),
        element('td', { text: String(sumOf(item.peptide)) }),
        element('td', { text: String(item.score) }),
        element('td', { text: cyclic === null ? '' : String(cyclic) }),
        element('td', { text: isKept ? (isTie ? 'kept (tie)' : 'kept') : 'cut' })
      ]);
    }

    function showRound(roundNumber) {
      state.roundShown = roundNumber;
      renderSequencing();
    }

    function stepOnce() {
      if (!state.result || state.roundShown >= state.result.rounds.length) {
        stopPlaying();
        return;
      }
      showRound(state.roundShown + 1);
      if (state.roundShown >= state.result.rounds.length) {
        stopPlaying();
      }
    }

    function setAlphabetMode(useConvolution) {
      state.useConvolutionAlphabet = useConvolution;
      alphabetConvolution.setAttribute('aria-pressed', useConvolution ? 'true' : 'false');
      alphabetAll.setAttribute('aria-pressed', useConvolution ? 'false' : 'true');
      renderTopMasses();
      recomputeSequencing();
    }

    spectrumInput.addEventListener('input', recomputeAll);
    mField.input.addEventListener('change', recomputeAlphabet);
    mField.input.addEventListener('input', recomputeAlphabet);
    nField.input.addEventListener('change', recomputeSequencing);
    nField.input.addEventListener('input', recomputeSequencing);
    alphabetConvolution.addEventListener('click', function () { setAlphabetMode(true); });
    alphabetAll.addEventListener('click', function () { setAlphabetMode(false); });
    resetButton.addEventListener('click', function () {
      stopPlaying();
      showRound(0);
    });
    stepButton.addEventListener('click', function () {
      stopPlaying();
      stepOnce();
    });
    endButton.addEventListener('click', function () {
      stopPlaying();
      if (state.result) {
        showRound(state.result.rounds.length);
      }
    });
    playButton.addEventListener('click', function () {
      if (state.playTimer !== null) {
        stopPlaying();
        return;
      }
      if (!state.result) {
        return;
      }
      if (state.roundShown >= state.result.rounds.length) {
        showRound(0);
      }
      if (prefersReducedMotion()) {
        stepOnce();
        return;
      }
      playButton.textContent = 'Pause';
      stepOnce();
      state.playTimer = window.setInterval(stepOnce, PLAY_DELAY_MS);
    });

    recomputeAll();
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-widget="convolution"]');
    for (var index = 0; index < roots.length; index += 1) {
      createWidget(roots[index]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
