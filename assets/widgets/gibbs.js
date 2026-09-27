/* Widget "gibbs": watch RandomizedMotifSearch and GibbsSampler work
   (Bioinformatics Algorithms, lessons 2.7 to 2.10).
   Vanilla ES2019, no dependencies. The algorithm core is a set of pure
   functions plus a small seeded stepper, exported for Node tests. */
(function () {
  'use strict';

  var NUCLEOTIDES = ['A', 'C', 'G', 'T'];
  var MAX_STRINGS = 10;
  var MIN_STRINGS = 2;
  var MAX_STRING_LENGTH = 60;
  var MAX_K = 12;
  var MAX_ITERATIONS_PER_RUN = 1000;
  var MAX_TOTAL_STEPS = 5000;
  var CHART_WINDOW = 120;

  /* Lessons 2.7 to 2.10: five strings with the implanted (4, 1)-motif ACGT. */
  var BOOK_DNA = ['ttACCTtaac', 'gATGTctgtc', 'ccgGCGTtag', 'cactaACGAg', 'cgtcagAGGT'];
  var BOOK_K = 4;

  /* Sample dataset of the RandomizedMotifSearch and GibbsSampler code challenges (BA2F, BA2G). */
  var SAMPLE_DNA = [
    'CGCCCCTCTCGGGGGTGTTCAGTAAACGGCCA',
    'GGGCGAGGTATGTGTAAGTGCCAAGGTGCCAG',
    'TAGTACCGAGACCGAAAGAAGTATACAGGCGT',
    'TAGATCAAGTTTCAGGTGCACGTCGGTGAACC',
    'AATCCACCAGCTCCACGTGCAATGTTGGCCTA'
  ];
  var SAMPLE_K = 8;

  /* ---------- Seeded randomness ---------- */

  /* mulberry32: a small, fast, seedable generator of numbers in [0, 1). */
  function createRandom(seed) {
    var state = seed >>> 0;
    return function nextRandom() {
      state = (state + 0x6d2b79f5) >>> 0;
      var mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* RandomNumber(N) from the book, but 0-based: each of 0, ..., n - 1 equally likely. */
  function randomInteger(random, n) {
    return Math.floor(random() * n);
  }

  /* Random(p1, ..., pn): index i with probability p_i / (p1 + ... + pn). */
  function biasedDieRoll(weights, random) {
    var total = 0;
    for (var index = 0; index < weights.length; index++) {
      total += weights[index];
    }
    var threshold = random() * total;
    var cumulative = 0;
    var lastPositive = 0;
    for (var faceIndex = 0; faceIndex < weights.length; faceIndex++) {
      if (weights[faceIndex] > 0) {
        lastPositive = faceIndex;
        cumulative += weights[faceIndex];
        if (threshold < cumulative) {
          return faceIndex;
        }
      }
    }
    return lastPositive;
  }

  /* ---------- Motif scoring core ---------- */

  function nucleotideIndex(symbol) {
    return NUCLEOTIDES.indexOf(symbol.toUpperCase());
  }

  function kmerAt(text, position, k) {
    return text.substr(position, k);
  }

  function motifsAt(dna, positions, k) {
    var motifs = [];
    for (var index = 0; index < dna.length; index++) {
      motifs.push(kmerAt(dna[index], positions[index], k).toUpperCase());
    }
    return motifs;
  }

  function emptyMatrix(k, fillValue) {
    var matrix = [];
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      var row = [];
      for (var column = 0; column < k; column++) {
        row.push(fillValue);
      }
      matrix.push(row);
    }
    return matrix;
  }

  /* Count(Motifs), each entry increased by pseudocount. */
  function countMatrix(motifs, k, pseudocount) {
    var counts = emptyMatrix(k, pseudocount);
    for (var motifIndex = 0; motifIndex < motifs.length; motifIndex++) {
      for (var position = 0; position < k; position++) {
        counts[nucleotideIndex(motifs[motifIndex][position])][position] += 1;
      }
    }
    return counts;
  }

  /* Profile(Motifs); pseudocount 1 is Laplace's Rule of Succession. */
  function profileMatrix(motifs, k, pseudocount) {
    var counts = countMatrix(motifs, k, pseudocount);
    var columnTotal = motifs.length + 4 * pseudocount;
    var profile = emptyMatrix(k, 0);
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      for (var column = 0; column < k; column++) {
        profile[symbolIndex][column] = counts[symbolIndex][column] / columnTotal;
      }
    }
    return profile;
  }

  function mostPopularIndex(counts, column) {
    var bestIndex = 0;
    for (var symbolIndex = 1; symbolIndex < 4; symbolIndex++) {
      if (counts[symbolIndex][column] > counts[bestIndex][column]) {
        bestIndex = symbolIndex;
      }
    }
    return bestIndex;
  }

  /* Score(Motifs): the number of unpopular letters in the motif matrix. */
  function scoreMotifs(motifs) {
    var k = motifs[0].length;
    var counts = countMatrix(motifs, k, 0);
    var score = 0;
    for (var column = 0; column < k; column++) {
      score += motifs.length - counts[mostPopularIndex(counts, column)][column];
    }
    return score;
  }

  function consensusString(motifs) {
    var k = motifs[0].length;
    var counts = countMatrix(motifs, k, 0);
    var consensus = '';
    for (var column = 0; column < k; column++) {
      consensus += NUCLEOTIDES[mostPopularIndex(counts, column)];
    }
    return consensus;
  }

  function kmerProbability(kmer, profile) {
    var product = 1;
    for (var position = 0; position < kmer.length; position++) {
      product *= profile[nucleotideIndex(kmer[position])][position];
    }
    return product;
  }

  /* Pr(Pattern | Profile) for every k-mer Pattern in text, left to right. */
  function kmerProbabilities(text, k, profile) {
    var probabilities = [];
    for (var position = 0; position + k <= text.length; position++) {
      probabilities.push(kmerProbability(kmerAt(text, position, k), profile));
    }
    return probabilities;
  }

  /* Position of a Profile-most probable k-mer in text (the first one if tied). */
  function profileMostProbablePosition(text, k, profile) {
    var probabilities = kmerProbabilities(text, k, profile);
    var bestPosition = 0;
    for (var position = 1; position < probabilities.length; position++) {
      if (probabilities[position] > probabilities[bestPosition]) {
        bestPosition = position;
      }
    }
    return bestPosition;
  }

  function profileMostProbableKmer(text, k, profile) {
    return kmerAt(text, profileMostProbablePosition(text, k, profile), k);
  }

  /* Motifs(Profile, Dna), as start positions. */
  function motifPositionsFromProfile(profile, dna, k) {
    var positions = [];
    for (var index = 0; index < dna.length; index++) {
      positions.push(profileMostProbablePosition(dna[index], k, profile));
    }
    return positions;
  }

  function motifsExcept(motifs, skippedIndex) {
    var remaining = [];
    for (var index = 0; index < motifs.length; index++) {
      if (index !== skippedIndex) {
        remaining.push(motifs[index]);
      }
    }
    return remaining;
  }

  /* ---------- Input validation ---------- */

  function parseDna(text, kText) {
    var lines = String(text).split(/\r?\n/);
    var dna = [];
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      var trimmed = lines[lineIndex].replace(/\s+/g, '');
      if (trimmed.length === 0) {
        continue;
      }
      if (!/^[ACGTacgt]+$/.test(trimmed)) {
        return { error: 'String ' + (dna.length + 1) + ' contains a symbol other than A, C, G, T.' };
      }
      if (trimmed.length > MAX_STRING_LENGTH) {
        return { error: 'String ' + (dna.length + 1) + ' has length ' + trimmed.length + '; please keep each string to at most ' + MAX_STRING_LENGTH + ' letters.' };
      }
      dna.push(trimmed);
    }
    if (dna.length < MIN_STRINGS) {
      return { error: 'Enter at least ' + MIN_STRINGS + ' strings, one per line.' };
    }
    if (dna.length > MAX_STRINGS) {
      return { error: 'Please use at most ' + MAX_STRINGS + ' strings (you entered ' + dna.length + ').' };
    }
    var k = Number(kText);
    if (!Number.isInteger(k) || k < 1 || k > MAX_K) {
      return { error: 'k must be a whole number from 1 to ' + MAX_K + '.' };
    }
    for (var index = 0; index < dna.length; index++) {
      if (dna[index].length < k) {
        return { error: 'String ' + (index + 1) + ' is shorter than k = ' + k + '.' };
      }
    }
    return { dna: dna, k: k, error: null };
  }

  /* ---------- The stepper: one search, one iteration at a time ---------- */

  function copyPositions(positions) {
    return positions.slice(0);
  }

  function createSearch(options) {
    var search = {
      dna: options.dna,
      k: options.k,
      t: options.dna.length,
      algorithm: options.algorithm,
      iterationsPerRun: options.iterationsPerRun || 50,
      seed: options.seed >>> 0,
      random: createRandom(options.seed),
      run: 0,
      iteration: 0,
      totalSteps: 0,
      positions: [],
      score: Infinity,
      runBest: null,
      best: null,
      runFinished: true,
      history: [],
      lastEvent: null
    };
    advanceSearch(search);
    return search;
  }

  function currentMotifs(search) {
    return motifsAt(search.dna, search.positions, search.k);
  }

  function recordBest(search) {
    if (search.score < search.runBest.score) {
      search.runBest = { positions: copyPositions(search.positions), score: search.score };
    }
    if (search.best === null || search.score < search.best.score) {
      search.best = { positions: copyPositions(search.positions), score: search.score, run: search.run, step: search.totalSteps };
    }
  }

  /* "randomly select k-mers Motifs = (Motif1, ..., Motift) in each string from Dna" */
  function startRun(search) {
    var positions = [];
    for (var index = 0; index < search.t; index++) {
      positions.push(randomInteger(search.random, search.dna[index].length - search.k + 1));
    }
    search.run += 1;
    search.iteration = 0;
    search.positions = positions;
    search.score = scoreMotifs(currentMotifs(search));
    search.runBest = { positions: copyPositions(positions), score: search.score };
    search.runFinished = false;
    recordBest(search);
    return { type: 'start' };
  }

  /* One pass of the RandomizedMotifSearch loop body. */
  function randomizedIteration(search) {
    var previousPositions = copyPositions(search.positions);
    var profile = profileMatrix(currentMotifs(search), search.k, 1);
    var newPositions = motifPositionsFromProfile(profile, search.dna, search.k);
    var newScore = scoreMotifs(motifsAt(search.dna, newPositions, search.k));
    var runBestBefore = search.runBest.score;
    search.iteration += 1;
    search.positions = newPositions;
    search.score = newScore;
    var improved = newScore < runBestBefore;
    recordBest(search);
    if (!improved) {
      search.runFinished = true;
    }
    return { type: 'randomized', profile: profile, previousPositions: previousPositions, improved: improved, runBestBefore: runBestBefore };
  }

  /* One pass of the GibbsSampler loop body. */
  function gibbsIteration(search) {
    var removedIndex = randomInteger(search.random, search.t);
    var otherMotifs = motifsExcept(currentMotifs(search), removedIndex);
    var profile = profileMatrix(otherMotifs, search.k, 1);
    var probabilities = kmerProbabilities(search.dna[removedIndex], search.k, profile);
    var chosenPosition = biasedDieRoll(probabilities, search.random);
    var previousPosition = search.positions[removedIndex];
    search.iteration += 1;
    search.positions[removedIndex] = chosenPosition;
    search.score = scoreMotifs(currentMotifs(search));
    recordBest(search);
    if (search.iteration >= search.iterationsPerRun) {
      search.runFinished = true;
    }
    return { type: 'gibbs', profile: profile, removedIndex: removedIndex, probabilities: probabilities, chosenPosition: chosenPosition, previousPosition: previousPosition };
  }

  /* Advance one step: start a new random run if the last one finished, else iterate. */
  function advanceSearch(search) {
    var event;
    if (search.runFinished) {
      event = startRun(search);
    } else if (search.algorithm === 'gibbs') {
      event = gibbsIteration(search);
    } else {
      event = randomizedIteration(search);
    }
    search.totalSteps += 1;
    search.lastEvent = event;
    search.history.push({ score: search.score, best: search.best.score, runStart: event.type === 'start', run: search.run });
    return event;
  }

  /* Run until the given number of runs (random starts) have finished. */
  function runStarts(search, starts) {
    while (search.run < starts || !search.runFinished) {
      advanceSearch(search);
    }
    return search.best;
  }

  var core = {
    NUCLEOTIDES: NUCLEOTIDES,
    BOOK_DNA: BOOK_DNA,
    BOOK_K: BOOK_K,
    SAMPLE_DNA: SAMPLE_DNA,
    SAMPLE_K: SAMPLE_K,
    createRandom: createRandom,
    randomInteger: randomInteger,
    biasedDieRoll: biasedDieRoll,
    motifsAt: motifsAt,
    countMatrix: countMatrix,
    profileMatrix: profileMatrix,
    scoreMotifs: scoreMotifs,
    consensusString: consensusString,
    kmerProbability: kmerProbability,
    kmerProbabilities: kmerProbabilities,
    profileMostProbablePosition: profileMostProbablePosition,
    profileMostProbableKmer: profileMostProbableKmer,
    motifPositionsFromProfile: motifPositionsFromProfile,
    motifsExcept: motifsExcept,
    parseDna: parseDna,
    createSearch: createSearch,
    advanceSearch: advanceSearch,
    currentMotifs: currentMotifs,
    runStarts: runStarts
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }
  if (typeof document === 'undefined') {
    return;
  }

  /* ---------- DOM helpers ---------- */

  var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  var widgetCounter = 0;

  function makeElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined && text !== null) {
      element.textContent = text;
    }
    return element;
  }

  function makeSvgElement(tagName, attributes) {
    var element = document.createElementNS(SVG_NAMESPACE, tagName);
    var names = Object.keys(attributes);
    for (var index = 0; index < names.length; index++) {
      element.setAttribute(names[index], attributes[names[index]]);
    }
    return element;
  }

  function makeButton(label) {
    var button = makeElement('button', 'btn btn-small', label);
    button.type = 'button';
    return button;
  }

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function nucleotideClass(symbol) {
    return 'wg-nt-' + symbol.toLowerCase();
  }

  function coloredKmer(kmer) {
    var wrapper = makeElement('span', 'wg-kmer');
    for (var index = 0; index < kmer.length; index++) {
      wrapper.appendChild(makeElement('span', nucleotideClass(kmer[index]), kmer[index].toUpperCase()));
    }
    return wrapper;
  }

  function formatProfileEntry(value) {
    var rounded = Math.round(value * 1000) / 1000;
    if (rounded === 0) {
      return '0';
    }
    if (rounded === 1) {
      return '1';
    }
    return rounded.toFixed(3).replace(/0+$/, '').replace(/^0\./, '.');
  }

  function formatShare(value) {
    return (Math.round(value * 1000) / 1000).toFixed(3);
  }

  function algorithmName(algorithm) {
    return algorithm === 'gibbs' ? 'GibbsSampler' : 'RandomizedMotifSearch';
  }

  function randomSeed() {
    return 1 + Math.floor(Math.random() * 999999);
  }

  /* ---------- Rendering pieces ---------- */

  /* One Dna string with its current motif highlighted (and the removed row marked). */
  function buildDnaRow(text, index, position, k, options) {
    var row = makeElement('div', 'wg-dna-row');
    if (options.removed) {
      row.className += ' wg-removed';
    }
    row.appendChild(makeElement('span', 'wg-dna-label', String(index + 1)));
    var strand = makeElement('span', 'wg-strand');
    for (var letterIndex = 0; letterIndex < text.length; letterIndex++) {
      var symbol = text[letterIndex];
      var inMotif = letterIndex >= position && letterIndex < position + k;
      var letter = makeElement('span', inMotif ? 'wg-in-motif ' + nucleotideClass(symbol) : 'wg-out', inMotif ? symbol.toUpperCase() : symbol.toLowerCase());
      if (inMotif && letterIndex === position) {
        letter.className += ' wg-motif-start';
      }
      if (inMotif && letterIndex === position + k - 1) {
        letter.className += ' wg-motif-end';
      }
      strand.appendChild(letter);
    }
    row.appendChild(strand);
    if (options.note) {
      row.appendChild(makeElement('span', 'wg-row-note', options.note));
    }
    return row;
  }

  function buildProfileTable(profile, captionText) {
    var k = profile[0].length;
    var container = makeElement('div', 'wg-profile');
    container.appendChild(makeElement('p', 'wg-caption', captionText));
    var table = makeElement('table', 'wg-table');
    table.setAttribute('aria-label', captionText);
    container.appendChild(table);
    var head = makeElement('thead');
    var headRow = makeElement('tr');
    headRow.appendChild(makeElement('th', 'wg-rowlabel', ''));
    for (var column = 0; column < k; column++) {
      var positionCell = makeElement('th', 'wg-pos', String(column + 1));
      positionCell.scope = 'col';
      headRow.appendChild(positionCell);
    }
    head.appendChild(headRow);
    table.appendChild(head);
    var body = makeElement('tbody');
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      var row = makeElement('tr');
      var label = makeElement('th', 'wg-rowlabel ' + nucleotideClass(NUCLEOTIDES[symbolIndex]), NUCLEOTIDES[symbolIndex] + ':');
      label.scope = 'row';
      row.appendChild(label);
      for (var entryColumn = 0; entryColumn < k; entryColumn++) {
        row.appendChild(makeElement('td', null, formatProfileEntry(profile[symbolIndex][entryColumn])));
      }
      body.appendChild(row);
    }
    table.appendChild(body);
    return container;
  }

  /* The biased die GibbsSampler rolls: one face per k-mer of the removed string. */
  function buildDie(text, k, probabilities, chosenPosition) {
    var total = 0;
    for (var index = 0; index < probabilities.length; index++) {
      total += probabilities[index];
    }
    var largest = 0;
    for (var faceIndex = 0; faceIndex < probabilities.length; faceIndex++) {
      if (probabilities[faceIndex] > largest) {
        largest = probabilities[faceIndex];
      }
    }
    var list = makeElement('ol', 'wg-die');
    for (var position = 0; position < probabilities.length; position++) {
      var share = probabilities[position] / total;
      var item = makeElement('li', position === chosenPosition ? 'wg-face wg-chosen' : 'wg-face');
      item.appendChild(coloredKmer(kmerAt(text, position, k)));
      var track = makeElement('span', 'wg-bar-track');
      var bar = makeElement('span', 'wg-bar');
      bar.style.width = (largest > 0 ? (100 * probabilities[position] / largest) : 0).toFixed(1) + '%';
      track.appendChild(bar);
      item.appendChild(track);
      item.appendChild(makeElement('span', 'wg-share', formatShare(share) + (position === chosenPosition ? ' rolled' : '')));
      list.appendChild(item);
    }
    return list;
  }

  var CHART_WIDTH = 640;
  var CHART_HEIGHT = 170;
  var CHART_LEFT = 34;
  var CHART_RIGHT = 10;
  var CHART_TOP = 10;
  var CHART_BOTTOM = 26;

  function chartX(stepIndex, firstStep, lastStep) {
    var span = Math.max(1, lastStep - firstStep);
    return CHART_LEFT + (stepIndex - firstStep) / span * (CHART_WIDTH - CHART_LEFT - CHART_RIGHT);
  }

  function chartY(value, maxValue) {
    var plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
    return CHART_TOP + plotHeight - value / Math.max(1, maxValue) * plotHeight;
  }

  function niceMaximum(value) {
    if (value <= 5) {
      return 5;
    }
    return Math.ceil(value / 5) * 5;
  }

  function buildChart(history) {
    var firstStep = Math.max(0, history.length - CHART_WINDOW);
    var lastStep = history.length - 1;
    var maxScore = 0;
    for (var index = firstStep; index <= lastStep; index++) {
      if (history[index].score > maxScore) {
        maxScore = history[index].score;
      }
    }
    var yMax = niceMaximum(maxScore);
    var svg = makeSvgElement('svg', { viewBox: '0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT, 'class': 'wg-chart-svg', role: 'img' });
    var title = makeSvgElement('title', {});
    title.textContent = 'Score of Motifs at each step, with the best score so far';
    svg.appendChild(title);

    var tickCount = 5;
    for (var tick = 0; tick <= tickCount; tick++) {
      var value = yMax * tick / tickCount;
      var tickY = chartY(value, yMax);
      svg.appendChild(makeSvgElement('line', { x1: String(CHART_LEFT), x2: String(CHART_WIDTH - CHART_RIGHT), y1: tickY.toFixed(1), y2: tickY.toFixed(1), 'class': 'wg-grid' }));
      var tickLabel = makeSvgElement('text', { x: String(CHART_LEFT - 6), y: (tickY + 4).toFixed(1), 'text-anchor': 'end', 'class': 'wg-axis-text' });
      tickLabel.textContent = String(Math.round(value));
      svg.appendChild(tickLabel);
    }

    for (var restartIndex = firstStep; restartIndex <= lastStep; restartIndex++) {
      if (history[restartIndex].runStart && restartIndex > 0) {
        var restartX = chartX(restartIndex, firstStep, lastStep).toFixed(1);
        svg.appendChild(makeSvgElement('line', { x1: restartX, x2: restartX, y1: String(CHART_TOP), y2: String(CHART_HEIGHT - CHART_BOTTOM), 'class': 'wg-restart' }));
      }
    }

    var scorePoints = [];
    var bestPoints = [];
    for (var pointIndex = firstStep; pointIndex <= lastStep; pointIndex++) {
      var x = chartX(pointIndex, firstStep, lastStep).toFixed(1);
      scorePoints.push(x + ',' + chartY(history[pointIndex].score, yMax).toFixed(1));
      bestPoints.push(x + ',' + chartY(history[pointIndex].best, yMax).toFixed(1));
    }
    svg.appendChild(makeSvgElement('polyline', { points: bestPoints.join(' '), 'class': 'wg-best-line' }));
    svg.appendChild(makeSvgElement('polyline', { points: scorePoints.join(' '), 'class': 'wg-score-line' }));
    var lastX = chartX(lastStep, firstStep, lastStep).toFixed(1);
    svg.appendChild(makeSvgElement('circle', { cx: lastX, cy: chartY(history[lastStep].score, yMax).toFixed(1), r: '3.5', 'class': 'wg-score-dot' }));

    var firstLabel = makeSvgElement('text', { x: String(CHART_LEFT), y: String(CHART_HEIGHT - 8), 'class': 'wg-axis-text' });
    firstLabel.textContent = 'step ' + firstStep;
    svg.appendChild(firstLabel);
    var lastLabel = makeSvgElement('text', { x: String(CHART_WIDTH - CHART_RIGHT), y: String(CHART_HEIGHT - 8), 'text-anchor': 'end', 'class': 'wg-axis-text' });
    lastLabel.textContent = 'step ' + lastStep;
    svg.appendChild(lastLabel);
    return svg;
  }

  function buildLegend() {
    var legend = makeElement('p', 'wg-legend');
    legend.appendChild(makeElement('span', 'wg-swatch wg-swatch-score'));
    legend.appendChild(document.createTextNode(' Score(Motifs) '));
    legend.appendChild(makeElement('span', 'wg-swatch wg-swatch-best'));
    legend.appendChild(document.createTextNode(' best so far '));
    legend.appendChild(makeElement('span', 'wg-swatch wg-swatch-restart'));
    legend.appendChild(document.createTextNode(' new random start'));
    return legend;
  }

  /* Plain-words description of the step that just happened. */
  function describeEvent(search) {
    var event = search.lastEvent;
    var prefix = 'Run ' + search.run + ', iteration ' + search.iteration + ': ';
    if (event.type === 'start') {
      return 'Run ' + search.run + ' begins from randomly chosen k-mers (one per string). Score(Motifs) = ' + search.score + '.';
    }
    if (event.type === 'randomized') {
      if (event.improved) {
        return prefix + 'Motifs ← Motifs(Profile(Motifs), Dna). Score dropped to ' + search.score + ', better than ' + event.runBestBefore + ', so keep going.';
      }
      return prefix + 'Motifs ← Motifs(Profile(Motifs), Dna) has Score ' + search.score + ', not better than this run\'s best ' + event.runBestBefore + ', so the run stops and returns its BestMotifs. The next step starts a new random run.';
    }
    var text = prefix + 'i = ' + (event.removedIndex + 1) + '. Profile from the other ' + (search.t - 1) + ' motifs (with pseudocounts); the die rolled k-mer ' + (event.chosenPosition + 1) + ' of string ' + (event.removedIndex + 1) + ', ' + kmerAt(search.dna[event.removedIndex], event.chosenPosition, search.k).toUpperCase() + '. Score(Motifs) = ' + search.score + '.';
    if (search.runFinished) {
      text += ' That was iteration N = ' + search.iterationsPerRun + ', so the next step starts a new random run.';
    }
    return text;
  }

  /* ---------- One mounted widget ---------- */

  function mountWidget(root) {
    widgetCounter += 1;
    var idPrefix = 'wg' + widgetCounter;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var state = {
      algorithm: 'randomized',
      datasetName: 'book',
      dna: BOOK_DNA.slice(0),
      k: BOOK_K,
      iterationsPerRun: 20,
      seed: 19,
      search: null,
      timer: null
    };

    var existingFoot = root.querySelector('.widget-foot');
    var body = makeElement('div', 'wg-body');

    /* Settings */
    var settings = makeElement('div', 'wg-settings');
    var algorithmLabel = makeElement('label', 'wg-field');
    algorithmLabel.appendChild(makeElement('span', 'wg-field-name', 'Algorithm'));
    var algorithmSelect = makeElement('select', 'wg-select');
    var randomizedOption = makeElement('option', null, 'RandomizedMotifSearch');
    randomizedOption.value = 'randomized';
    var gibbsOption = makeElement('option', null, 'GibbsSampler');
    gibbsOption.value = 'gibbs';
    algorithmSelect.appendChild(randomizedOption);
    algorithmSelect.appendChild(gibbsOption);
    algorithmLabel.appendChild(algorithmSelect);

    var datasetLabel = makeElement('label', 'wg-field');
    datasetLabel.appendChild(makeElement('span', 'wg-field-name', 'Dna'));
    var datasetSelect = makeElement('select', 'wg-select');
    var datasetChoices = [
      ['book', 'Book example (t = 5, k = 4)'],
      ['sample', 'Code challenge sample (t = 5, k = 8)'],
      ['custom', 'Your own strings']
    ];
    for (var choiceIndex = 0; choiceIndex < datasetChoices.length; choiceIndex++) {
      var option = makeElement('option', null, datasetChoices[choiceIndex][1]);
      option.value = datasetChoices[choiceIndex][0];
      datasetSelect.appendChild(option);
    }
    datasetLabel.appendChild(datasetSelect);

    var iterationsLabel = makeElement('label', 'wg-field');
    iterationsLabel.appendChild(makeElement('span', 'wg-field-name', 'N (Gibbs iterations per run)'));
    var iterationsInput = makeElement('input', 'wg-number');
    iterationsInput.type = 'number';
    iterationsInput.min = '1';
    iterationsInput.max = String(MAX_ITERATIONS_PER_RUN);
    iterationsInput.value = String(state.iterationsPerRun);
    iterationsLabel.appendChild(iterationsInput);

    settings.appendChild(algorithmLabel);
    settings.appendChild(datasetLabel);
    settings.appendChild(iterationsLabel);

    var customBlock = makeElement('div', 'wg-custom');
    customBlock.hidden = true;
    var customLabel = makeElement('label', 'wg-field-name', 'Strings (one per line, ' + MIN_STRINGS + ' to ' + MAX_STRINGS + ' strings, each at most ' + MAX_STRING_LENGTH + ' letters)');
    var customText = makeElement('textarea', 'wg-textarea');
    customText.id = idPrefix + '-dna';
    customLabel.htmlFor = customText.id;
    customText.rows = 5;
    customText.spellcheck = false;
    customText.setAttribute('autocomplete', 'off');
    customText.value = BOOK_DNA.join('\n');
    var customKLabel = makeElement('label', 'wg-field');
    customKLabel.appendChild(makeElement('span', 'wg-field-name', 'k (1 to ' + MAX_K + ')'));
    var customK = makeElement('input', 'wg-number');
    customK.type = 'number';
    customK.min = '1';
    customK.max = String(MAX_K);
    customK.value = String(BOOK_K);
    customKLabel.appendChild(customK);
    var customApply = makeButton('Use these strings');
    var customError = makeElement('p', 'wg-error');
    customError.setAttribute('role', 'alert');
    customBlock.appendChild(customLabel);
    customBlock.appendChild(customText);
    var customRow = makeElement('div', 'wg-controls');
    customRow.appendChild(customKLabel);
    customRow.appendChild(customApply);
    customBlock.appendChild(customRow);
    customBlock.appendChild(customError);

    /* Transport */
    var controls = makeElement('div', 'wg-controls');
    var stepButton = makeButton('Step');
    var playButton = makeButton('Play');
    playButton.setAttribute('aria-pressed', 'false');
    var fastButton = makeButton('+100 steps');
    var resetButton = makeButton('Reset');
    var seedButton = makeButton('New seed');
    var seedLabel = makeElement('span', 'wg-seed');
    controls.appendChild(stepButton);
    controls.appendChild(playButton);
    controls.appendChild(fastButton);
    controls.appendChild(resetButton);
    controls.appendChild(seedButton);
    controls.appendChild(seedLabel);

    var status = makeElement('p', 'wg-status');
    status.setAttribute('aria-live', 'polite');

    var scoreboard = makeElement('div', 'wg-scoreboard');
    var dnaBox = makeElement('div', 'wg-scroll wg-dna');
    dnaBox.tabIndex = 0;
    dnaBox.setAttribute('role', 'region');
    dnaBox.setAttribute('aria-label', 'Dna strings with the current Motifs highlighted');
    var detailBox = makeElement('div', 'wg-detail');
    var chartHeading = makeElement('p', 'wg-subhead', 'Score(Motifs) over the steps');
    var chartBox = makeElement('div', 'wg-chart');
    var chartDescription = makeElement('p', 'wg-sr-only');
    chartDescription.id = idPrefix + '-chart-desc';
    var bestBox = makeElement('div', 'wg-best');

    body.appendChild(settings);
    body.appendChild(customBlock);
    body.appendChild(controls);
    body.appendChild(status);
    body.appendChild(scoreboard);
    body.appendChild(dnaBox);
    body.appendChild(detailBox);
    body.appendChild(chartHeading);
    body.appendChild(chartBox);
    body.appendChild(buildLegend());
    body.appendChild(chartDescription);
    body.appendChild(bestBox);

    if (existingFoot) {
      root.insertBefore(body, existingFoot);
    } else {
      root.appendChild(body);
    }

    function rebuildSearch() {
      state.search = createSearch({ dna: state.dna, k: state.k, algorithm: state.algorithm, iterationsPerRun: state.iterationsPerRun, seed: state.seed });
    }

    function renderScoreboard() {
      var search = state.search;
      clearElement(scoreboard);
      var items = [
        ['Algorithm', algorithmName(search.algorithm)],
        ['Run', String(search.run)],
        ['Iteration', String(search.iteration)],
        ['Score(Motifs)', String(search.score)],
        ['Best so far', String(search.best.score)]
      ];
      for (var index = 0; index < items.length; index++) {
        var item = makeElement('div', 'wg-stat');
        item.appendChild(makeElement('span', 'wg-stat-name', items[index][0]));
        item.appendChild(makeElement('strong', 'wg-stat-value', items[index][1]));
        scoreboard.appendChild(item);
      }
    }

    function renderDna() {
      var search = state.search;
      var event = search.lastEvent;
      clearElement(dnaBox);
      dnaBox.appendChild(makeElement('p', 'wg-box-title', 'Dna, with the current Motifs in color'));
      for (var index = 0; index < search.t; index++) {
        var options = { removed: false, note: '' };
        if (event.type === 'gibbs' && event.removedIndex === index) {
          options.removed = true;
          options.note = event.chosenPosition === event.previousPosition ? '← i: kept its k-mer' : '← i: new k-mer';
        }
        if (event.type === 'randomized' && event.previousPositions[index] !== search.positions[index]) {
          options.note = '← changed';
        }
        dnaBox.appendChild(buildDnaRow(search.dna[index], index, search.positions[index], search.k, options));
      }
      var motifs = currentMotifs(search);
      var consensusLine = makeElement('p', 'wg-consensus');
      consensusLine.appendChild(document.createTextNode('Consensus(Motifs) = '));
      consensusLine.appendChild(coloredKmer(consensusString(motifs)));
      dnaBox.appendChild(consensusLine);
    }

    function renderDetail() {
      var search = state.search;
      var event = search.lastEvent;
      clearElement(detailBox);
      if (event.type === 'start') {
        var nextProfile = profileMatrix(currentMotifs(search), search.k, 1);
        var startCaption = search.algorithm === 'gibbs' ? 'Profile(Motifs) with pseudocounts. At each step GibbsSampler leaves out one Motif_i and rebuilds the profile from the others.' : 'Profile(Motifs) with pseudocounts, which the next step uses to pick the Profile-most probable k-mer in every string.';
        detailBox.appendChild(wrapScroll(buildProfileTable(nextProfile, startCaption)));
        return;
      }
      if (event.type === 'randomized') {
        detailBox.appendChild(wrapScroll(buildProfileTable(event.profile, 'Profile (with pseudocounts) of the previous Motifs. Each new motif is the Profile-most probable k-mer in its string.')));
        return;
      }
      detailBox.appendChild(wrapScroll(buildProfileTable(event.profile, 'Profile (with pseudocounts) of all Motifs except Motif_' + (event.removedIndex + 1) + '.')));
      var dieTitle = makeElement('p', 'wg-subhead', 'The die for string ' + (event.removedIndex + 1) + ': Pr(k-mer | Profile), rescaled to sum to 1');
      detailBox.appendChild(dieTitle);
      var dieBox = makeElement('div', 'wg-die-box');
      dieBox.tabIndex = 0;
      dieBox.setAttribute('role', 'region');
      dieBox.setAttribute('aria-label', 'Probabilities of each k-mer in the removed string');
      dieBox.appendChild(buildDie(search.dna[event.removedIndex], search.k, event.probabilities, event.chosenPosition));
      detailBox.appendChild(dieBox);
    }

    function wrapScroll(content) {
      var box = makeElement('div', 'wg-scroll');
      box.appendChild(content);
      return box;
    }

    function renderChart() {
      var search = state.search;
      clearElement(chartBox);
      var chart = buildChart(search.history);
      chart.setAttribute('aria-describedby', chartDescription.id);
      chartBox.appendChild(chart);
      var recent = [];
      var firstStep = Math.max(0, search.history.length - 10);
      for (var index = firstStep; index < search.history.length; index++) {
        recent.push(search.history[index].score);
      }
      chartDescription.textContent = 'Scores of the last ' + recent.length + ' steps: ' + recent.join(', ') + '. Best so far: ' + search.best.score + '.';
    }

    function renderBest() {
      var search = state.search;
      clearElement(bestBox);
      var motifs = motifsAt(search.dna, search.best.positions, search.k);
      var heading = makeElement('p', 'wg-subhead', 'BestMotifs so far: Score ' + search.best.score + ' (found in run ' + search.best.run + ', step ' + search.best.step + ')');
      bestBox.appendChild(heading);
      var list = makeElement('p', 'wg-best-list');
      for (var index = 0; index < motifs.length; index++) {
        list.appendChild(coloredKmer(motifs[index]));
        list.appendChild(document.createTextNode(' '));
      }
      bestBox.appendChild(list);
      var consensusLine = makeElement('p', 'wg-consensus');
      consensusLine.appendChild(document.createTextNode('Consensus = '));
      consensusLine.appendChild(coloredKmer(consensusString(motifs)));
      bestBox.appendChild(consensusLine);
    }

    function renderAll(announceText) {
      renderScoreboard();
      renderDna();
      renderDetail();
      renderChart();
      renderBest();
      seedLabel.textContent = 'Seed ' + state.seed;
      iterationsLabel.hidden = state.algorithm !== 'gibbs';
      status.textContent = announceText || describeEvent(state.search);
    }

    function stopPlaying() {
      if (state.timer !== null) {
        window.clearInterval(state.timer);
        state.timer = null;
      }
      playButton.textContent = 'Play';
      playButton.setAttribute('aria-pressed', 'false');
    }

    function reachedStepCap() {
      return state.search.totalSteps >= MAX_TOTAL_STEPS;
    }

    function stepOnce() {
      if (reachedStepCap()) {
        stopPlaying();
        renderAll('Stopped after ' + MAX_TOTAL_STEPS + ' steps. Press Reset or New seed to start over.');
        return;
      }
      advanceSearch(state.search);
      renderAll();
    }

    function stepMany(count) {
      var steps = 0;
      while (steps < count && !reachedStepCap()) {
        advanceSearch(state.search);
        steps += 1;
      }
      renderAll('Ran ' + steps + ' more steps (' + state.search.run + ' runs so far). Best score so far: ' + state.search.best.score + '. ' + describeEvent(state.search));
    }

    /* Rebuild the search, then describe its first step after the given lead-in. */
    function restart(leadIn) {
      stopPlaying();
      rebuildSearch();
      renderAll(leadIn + ' ' + describeEvent(state.search));
    }

    stepButton.addEventListener('click', function () {
      stopPlaying();
      stepOnce();
    });

    playButton.addEventListener('click', function () {
      if (state.timer !== null) {
        stopPlaying();
        renderAll('Paused. ' + describeEvent(state.search));
        return;
      }
      playButton.textContent = 'Pause';
      playButton.setAttribute('aria-pressed', 'true');
      state.timer = window.setInterval(stepOnce, reduceMotion ? 900 : 450);
    });

    fastButton.addEventListener('click', function () {
      stopPlaying();
      stepMany(100);
    });

    resetButton.addEventListener('click', function () {
      restart('Reset: replaying seed ' + state.seed + ' from the same random start.');
    });

    seedButton.addEventListener('click', function () {
      state.seed = randomSeed();
      restart('New seed ' + state.seed + ': a different random start.');
    });

    algorithmSelect.addEventListener('change', function () {
      state.algorithm = algorithmSelect.value;
      restart('Switched to ' + algorithmName(state.algorithm) + ' with seed ' + state.seed + '.');
    });

    iterationsInput.addEventListener('change', function () {
      var value = Number(iterationsInput.value);
      if (!Number.isInteger(value) || value < 1 || value > MAX_ITERATIONS_PER_RUN) {
        status.textContent = 'N must be a whole number from 1 to ' + MAX_ITERATIONS_PER_RUN + '; keeping N = ' + state.iterationsPerRun + '.';
        iterationsInput.value = String(state.iterationsPerRun);
        return;
      }
      state.iterationsPerRun = value;
      restart('GibbsSampler now runs N = ' + value + ' iterations per random start.');
    });

    datasetSelect.addEventListener('change', function () {
      state.datasetName = datasetSelect.value;
      customBlock.hidden = state.datasetName !== 'custom';
      if (state.datasetName === 'book') {
        state.dna = BOOK_DNA.slice(0);
        state.k = BOOK_K;
      } else if (state.datasetName === 'sample') {
        state.dna = SAMPLE_DNA.slice(0);
        state.k = SAMPLE_K;
      } else {
        status.textContent = 'Type your strings and k, then press "Use these strings".';
        return;
      }
      restart('Loaded ' + datasetSelect.options[datasetSelect.selectedIndex].text + '.');
    });

    customApply.addEventListener('click', function () {
      var parsed = parseDna(customText.value, customK.value);
      if (parsed.error) {
        customError.textContent = parsed.error;
        customText.setAttribute('aria-invalid', 'true');
        return;
      }
      customError.textContent = '';
      customText.removeAttribute('aria-invalid');
      state.dna = parsed.dna;
      state.k = parsed.k;
      restart('Using your ' + parsed.dna.length + ' strings with k = ' + parsed.k + '.');
    });

    rebuildSearch();
    renderAll('Loaded the book\'s five strings with k = 4. ' + describeEvent(state.search) + ' Press Step to run one iteration.');
  }

  function mountAll() {
    var mounts = document.querySelectorAll('[data-widget="gibbs"]');
    for (var index = 0; index < mounts.length; index++) {
      if (mounts[index].getAttribute('data-mounted') === 'true') {
        continue;
      }
      mounts[index].setAttribute('data-mounted', 'true');
      mountWidget(mounts[index]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
