/* Widget "profile": from a motif matrix to Count, Profile, Consensus, Score,
   entropy and a motif logo (Bioinformatics Algorithms, lessons 2.3, 2.5, 2.6).
   Vanilla ES2019, no dependencies. The algorithm core is a set of pure
   functions, exported for Node tests at the bottom of the file. */
(function () {
  'use strict';

  var NUCLEOTIDES = ['A', 'C', 'G', 'T'];
  var MAX_ROWS = 20;
  var MAX_COLUMNS = 20;

  /* The NF-kB motif matrix from lesson 2.3 (upper case = popular letter). */
  var NFKB_MOTIFS = [
    'TCGGGGgTTTtt',
    'cCGGtGAcTTaC',
    'aCGGGGATTTtC',
    'TtGGGGAcTTtt',
    'aaGGGGAcTTCC',
    'TtGGGGAcTTCC',
    'TCGGGGATTcat',
    'TCGGGGATTcCt',
    'TaGGGGAacTaC',
    'TCGGGtATaaCC'
  ];

  /* ---------- Pure algorithm core ---------- */

  function nucleotideIndex(symbol) {
    return NUCLEOTIDES.indexOf(symbol.toUpperCase());
  }

  /* Parse text with one k-mer per line. Returns {motifs, error}. */
  function parseMotifMatrix(text) {
    var lines = String(text).split(/\r?\n/);
    var motifs = [];
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      var trimmed = lines[lineIndex].replace(/\s+/g, '');
      if (trimmed.length === 0) {
        continue;
      }
      if (!/^[ACGTacgt]+$/.test(trimmed)) {
        return { motifs: null, error: 'Row ' + (motifs.length + 1) + ' ("' + trimmed.slice(0, 24) + '") contains a symbol other than A, C, G, T.' };
      }
      motifs.push(trimmed.toUpperCase());
    }
    if (motifs.length === 0) {
      return { motifs: null, error: 'Enter at least one k-mer, one per row.' };
    }
    if (motifs.length > MAX_ROWS) {
      return { motifs: null, error: 'Please use at most ' + MAX_ROWS + ' rows (you entered ' + motifs.length + ').' };
    }
    var k = motifs[0].length;
    if (k > MAX_COLUMNS) {
      return { motifs: null, error: 'Please use k-mers of length at most ' + MAX_COLUMNS + ' (row 1 has length ' + k + ').' };
    }
    for (var rowIndex = 1; rowIndex < motifs.length; rowIndex++) {
      if (motifs[rowIndex].length !== k) {
        return { motifs: null, error: 'All rows must have the same length k. Row 1 has length ' + k + ' but row ' + (rowIndex + 1) + ' has length ' + motifs[rowIndex].length + '.' };
      }
    }
    return { motifs: motifs, error: null };
  }

  /* Count(Motifs): a 4 x k matrix, rows in the order A, C, G, T. */
  function countMatrix(motifs) {
    var k = motifs[0].length;
    var counts = [];
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      var row = [];
      for (var column = 0; column < k; column++) {
        row.push(0);
      }
      counts.push(row);
    }
    for (var motifIndex = 0; motifIndex < motifs.length; motifIndex++) {
      for (var position = 0; position < k; position++) {
        counts[nucleotideIndex(motifs[motifIndex][position])][position] += 1;
      }
    }
    return counts;
  }

  /* Add the same pseudocount to every entry of a count matrix. */
  function addPseudocounts(counts, pseudocount) {
    var adjusted = [];
    for (var symbolIndex = 0; symbolIndex < counts.length; symbolIndex++) {
      var row = [];
      for (var column = 0; column < counts[symbolIndex].length; column++) {
        row.push(counts[symbolIndex][column] + pseudocount);
      }
      adjusted.push(row);
    }
    return adjusted;
  }

  /* Divide every entry of a count matrix by its column total. */
  function normalizeColumns(counts) {
    var k = counts[0].length;
    var profile = [[], [], [], []];
    for (var column = 0; column < k; column++) {
      var columnTotal = 0;
      for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
        columnTotal += counts[symbolIndex][column];
      }
      for (var rowIndex = 0; rowIndex < 4; rowIndex++) {
        profile[rowIndex].push(counts[rowIndex][column] / columnTotal);
      }
    }
    return profile;
  }

  /* Profile(Motifs), optionally with Laplace's Rule of Succession (pseudocount 1). */
  function profileMatrix(motifs, pseudocount) {
    var counts = countMatrix(motifs);
    if (pseudocount > 0) {
      counts = addPseudocounts(counts, pseudocount);
    }
    return normalizeColumns(counts);
  }

  /* Index of the most popular nucleotide in a column; ties go to the first in A, C, G, T. */
  function mostPopularIndex(counts, column) {
    var bestIndex = 0;
    for (var symbolIndex = 1; symbolIndex < 4; symbolIndex++) {
      if (counts[symbolIndex][column] > counts[bestIndex][column]) {
        bestIndex = symbolIndex;
      }
    }
    return bestIndex;
  }

  function consensusString(motifs) {
    var counts = countMatrix(motifs);
    var consensus = '';
    for (var column = 0; column < counts[0].length; column++) {
      consensus += NUCLEOTIDES[mostPopularIndex(counts, column)];
    }
    return consensus;
  }

  /* Number of unpopular letters in each column. */
  function scorePerColumn(motifs) {
    var counts = countMatrix(motifs);
    var perColumn = [];
    for (var column = 0; column < counts[0].length; column++) {
      perColumn.push(motifs.length - counts[mostPopularIndex(counts, column)][column]);
    }
    return perColumn;
  }

  function sumOf(values) {
    var total = 0;
    for (var index = 0; index < values.length; index++) {
      total += values[index];
    }
    return total;
  }

  function scoreMotifs(motifs) {
    return sumOf(scorePerColumn(motifs));
  }

  /* H(p1, ..., pN) = -sum p log2 p, with 0 log 0 = 0. */
  function entropy(probabilities) {
    var total = 0;
    for (var index = 0; index < probabilities.length; index++) {
      var probability = probabilities[index];
      if (probability > 0) {
        total -= probability * Math.log2(probability);
      }
    }
    return total;
  }

  function profileColumn(profile, column) {
    return [profile[0][column], profile[1][column], profile[2][column], profile[3][column]];
  }

  function entropyPerColumn(profile) {
    var entropies = [];
    for (var column = 0; column < profile[0].length; column++) {
      entropies.push(entropy(profileColumn(profile, column)));
    }
    return entropies;
  }

  function totalEntropy(profile) {
    return sumOf(entropyPerColumn(profile));
  }

  /* Information content of a column: 2 - H. */
  function informationContent(columnProbabilities) {
    return 2 - entropy(columnProbabilities);
  }

  /* Letter heights (in bits) for one logo column: p_i * (2 - H). */
  function logoColumnHeights(columnProbabilities) {
    var content = informationContent(columnProbabilities);
    var heights = [];
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      heights.push(columnProbabilities[symbolIndex] * content);
    }
    return heights;
  }

  /* The profile entries that Pr(kmer | Profile) multiplies together. */
  function kmerProbabilityFactors(kmer, profile) {
    var factors = [];
    for (var position = 0; position < kmer.length; position++) {
      factors.push(profile[nucleotideIndex(kmer[position])][position]);
    }
    return factors;
  }

  function kmerProbability(kmer, profile) {
    var factors = kmerProbabilityFactors(kmer, profile);
    var product = 1;
    for (var index = 0; index < factors.length; index++) {
      product *= factors[index];
    }
    return product;
  }

  /* Roll one four-sided die whose faces have the given probabilities. */
  function rollColumnDie(columnProbabilities, randomUnit) {
    var threshold = randomUnit() * sumOf(columnProbabilities);
    var cumulative = 0;
    var lastPossible = 0;
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      if (columnProbabilities[symbolIndex] > 0) {
        lastPossible = symbolIndex;
        cumulative += columnProbabilities[symbolIndex];
        if (threshold < cumulative) {
          return symbolIndex;
        }
      }
    }
    return lastPossible;
  }

  /* Roll k dice, one per profile column, to generate a random k-mer. */
  function sampleKmer(profile, randomUnit) {
    var kmer = '';
    for (var column = 0; column < profile[0].length; column++) {
      kmer += NUCLEOTIDES[rollColumnDie(profileColumn(profile, column), randomUnit)];
    }
    return kmer;
  }

  /* Book style for profile entries: 0, 1, .2, .214 */
  function formatProfileEntry(value) {
    var rounded = Math.round(value * 1000) / 1000;
    if (rounded === 0) {
      return '0';
    }
    if (rounded === 1) {
      return '1';
    }
    var text = rounded.toFixed(3).replace(/0+$/, '');
    return text.replace(/^0\./, '.');
  }

  /* Factors in a product, as the book prints them: 0.7, 1.0, 0.214 */
  function formatFactor(value) {
    var rounded = Math.round(value * 1000) / 1000;
    var text = rounded.toFixed(3).replace(/0+$/, '');
    if (text.charAt(text.length - 1) === '.') {
      text += '0';
    }
    return text;
  }

  /* Probabilities to six significant digits: 0.0205753, 0.000839808 */
  function formatProbability(value) {
    if (value === 0) {
      return '0';
    }
    var sixDigits = Number(value.toPrecision(6));
    if (sixDigits >= 1e-6) {
      return String(sixDigits);
    }
    var parts = sixDigits.toExponential(5).split('e');
    var mantissa = String(Number(parts[0]));
    return mantissa + ' × 10^' + Number(parts[1]);
  }

  function formatEntropy(value) {
    return (Math.round(value * 1000) / 1000).toFixed(3);
  }

  var core = {
    NUCLEOTIDES: NUCLEOTIDES,
    NFKB_MOTIFS: NFKB_MOTIFS,
    parseMotifMatrix: parseMotifMatrix,
    countMatrix: countMatrix,
    addPseudocounts: addPseudocounts,
    profileMatrix: profileMatrix,
    consensusString: consensusString,
    scorePerColumn: scorePerColumn,
    scoreMotifs: scoreMotifs,
    entropy: entropy,
    entropyPerColumn: entropyPerColumn,
    totalEntropy: totalEntropy,
    informationContent: informationContent,
    logoColumnHeights: logoColumnHeights,
    kmerProbabilityFactors: kmerProbabilityFactors,
    kmerProbability: kmerProbability,
    rollColumnDie: rollColumnDie,
    sampleKmer: sampleKmer,
    formatProfileEntry: formatProfileEntry,
    formatFactor: formatFactor,
    formatProbability: formatProbability,
    formatEntropy: formatEntropy
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

  function makeButton(label, className) {
    var button = makeElement('button', 'btn btn-small ' + (className || ''), label);
    button.type = 'button';
    return button;
  }

  function upperCaseRows(rows) {
    var upper = [];
    for (var index = 0; index < rows.length; index++) {
      upper.push(rows[index].toUpperCase());
    }
    return upper;
  }

  function nucleotideClass(symbol) {
    return 'wp-nt-' + symbol.toLowerCase();
  }

  function coloredKmer(kmer) {
    var wrapper = makeElement('span', 'wp-kmer');
    for (var index = 0; index < kmer.length; index++) {
      wrapper.appendChild(makeElement('span', nucleotideClass(kmer[index]), kmer[index]));
    }
    return wrapper;
  }

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /* ---------- Rendering ---------- */

  function buildMatrixTable(motifs, usePseudocounts, highlightedKmer) {
    var k = motifs[0].length;
    var counts = countMatrix(motifs);
    var shownCounts = usePseudocounts ? addPseudocounts(counts, 1) : counts;
    var profile = normalizeColumns(shownCounts);
    var perColumnScore = scorePerColumn(motifs);
    var entropies = entropyPerColumn(profile);
    var consensus = consensusString(motifs);

    var table = makeElement('table', 'wp-table');
    var caption = makeElement('caption', 'wp-sr-only', 'Motif matrix with its score, count matrix, profile matrix, entropy and consensus string, one column per position.');
    table.appendChild(caption);

    var head = makeElement('thead');
    var headRow = makeElement('tr');
    headRow.appendChild(makeElement('th', 'wp-rowlabel', 'Position'));
    for (var column = 0; column < k; column++) {
      var positionCell = makeElement('th', 'wp-pos', String(column + 1));
      positionCell.scope = 'col';
      headRow.appendChild(positionCell);
    }
    head.appendChild(headRow);
    table.appendChild(head);

    var motifBody = makeElement('tbody', 'wp-section');
    for (var motifIndex = 0; motifIndex < motifs.length; motifIndex++) {
      var motifRow = makeElement('tr');
      motifRow.appendChild(makeElement('th', 'wp-rowlabel', motifIndex === 0 ? 'Motifs' : ''));
      for (var motifColumn = 0; motifColumn < k; motifColumn++) {
        var symbol = motifs[motifIndex][motifColumn];
        var isPopular = symbol === consensus[motifColumn];
        var letterCell = makeElement('td', isPopular ? 'wp-popular ' + nucleotideClass(symbol) : 'wp-unpopular', isPopular ? symbol : symbol.toLowerCase());
        motifRow.appendChild(letterCell);
      }
      motifBody.appendChild(motifRow);
    }
    table.appendChild(motifBody);

    var scoreBody = makeElement('tbody', 'wp-section');
    var scoreRow = makeElement('tr');
    scoreRow.appendChild(makeElement('th', 'wp-rowlabel', 'Score'));
    for (var scoreColumn = 0; scoreColumn < k; scoreColumn++) {
      scoreRow.appendChild(makeElement('td', 'wp-num', String(perColumnScore[scoreColumn])));
    }
    scoreBody.appendChild(scoreRow);
    table.appendChild(scoreBody);

    var countBody = makeElement('tbody', 'wp-section');
    appendSymbolRows(countBody, usePseudocounts ? 'Count + 1' : 'Count', shownCounts, consensus, null, function (value) {
      return String(value);
    });
    table.appendChild(countBody);

    var profileBody = makeElement('tbody', 'wp-section');
    appendSymbolRows(profileBody, 'Profile', profile, consensus, highlightedKmer, formatProfileEntry);
    table.appendChild(profileBody);

    var entropyBody = makeElement('tbody', 'wp-section');
    var entropyRow = makeElement('tr');
    entropyRow.appendChild(makeElement('th', 'wp-rowlabel', 'Entropy'));
    for (var entropyColumn = 0; entropyColumn < k; entropyColumn++) {
      entropyRow.appendChild(makeElement('td', 'wp-num wp-small', formatEntropy(entropies[entropyColumn])));
    }
    entropyBody.appendChild(entropyRow);
    var consensusRow = makeElement('tr');
    consensusRow.appendChild(makeElement('th', 'wp-rowlabel', 'Consensus'));
    for (var consensusColumn = 0; consensusColumn < k; consensusColumn++) {
      var consensusSymbol = consensus[consensusColumn];
      consensusRow.appendChild(makeElement('td', 'wp-popular ' + nucleotideClass(consensusSymbol), consensusSymbol));
    }
    entropyBody.appendChild(consensusRow);
    table.appendChild(entropyBody);

    return table;
  }

  function appendSymbolRows(body, label, matrix, consensus, highlightedKmer, formatValue) {
    for (var symbolIndex = 0; symbolIndex < 4; symbolIndex++) {
      var symbol = NUCLEOTIDES[symbolIndex];
      var row = makeElement('tr');
      var labelCell = makeElement('th', 'wp-rowlabel');
      if (symbolIndex === 0) {
        labelCell.appendChild(makeElement('span', 'wp-block-label', label));
      }
      labelCell.appendChild(makeElement('span', 'wp-symbol ' + nucleotideClass(symbol), symbol + ':'));
      row.appendChild(labelCell);
      for (var column = 0; column < matrix[0].length; column++) {
        var className = 'wp-num';
        if (consensus[column] === symbol) {
          className += ' wp-strong ' + nucleotideClass(symbol);
        }
        if (highlightedKmer && highlightedKmer[column] === symbol) {
          className += ' wp-picked';
        }
        row.appendChild(makeElement('td', className, formatValue(matrix[symbolIndex][column])));
      }
      body.appendChild(row);
    }
  }

  var LOGO_COLUMN_WIDTH = 34;
  var LOGO_BIT_HEIGHT = 60;
  var LOGO_LEFT = 34;
  var LOGO_TOP = 8;
  var LOGO_BOTTOM = 22;
  var GLYPH_CAP_HEIGHT = 0.72;

  function buildLogo(profile) {
    var k = profile[0].length;
    var width = LOGO_LEFT + k * LOGO_COLUMN_WIDTH + 6;
    var height = LOGO_TOP + 2 * LOGO_BIT_HEIGHT + LOGO_BOTTOM;
    var baseline = LOGO_TOP + 2 * LOGO_BIT_HEIGHT;
    var svg = makeSvgElement('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: String(width),
      height: String(height),
      role: 'img',
      'class': 'wp-logo-svg'
    });
    var logoTitle = makeSvgElement('title', {});
    logoTitle.textContent = 'Motif logo';
    svg.appendChild(logoTitle);

    for (var bits = 0; bits <= 2; bits++) {
      var tickY = baseline - bits * LOGO_BIT_HEIGHT;
      svg.appendChild(makeSvgElement('line', { x1: String(LOGO_LEFT - 4), x2: String(LOGO_LEFT), y1: String(tickY), y2: String(tickY), 'class': 'wp-axis' }));
      var tickLabel = makeSvgElement('text', { x: String(LOGO_LEFT - 7), y: String(tickY + 4), 'text-anchor': 'end', 'class': 'wp-axis-text' });
      tickLabel.textContent = String(bits);
      svg.appendChild(tickLabel);
    }
    svg.appendChild(makeSvgElement('line', { x1: String(LOGO_LEFT), x2: String(LOGO_LEFT), y1: String(LOGO_TOP), y2: String(baseline), 'class': 'wp-axis' }));
    svg.appendChild(makeSvgElement('line', { x1: String(LOGO_LEFT), x2: String(width - 4), y1: String(baseline), y2: String(baseline), 'class': 'wp-axis' }));
    var bitsLabel = makeSvgElement('text', { x: '10', y: String(LOGO_TOP + LOGO_BIT_HEIGHT), 'text-anchor': 'middle', 'class': 'wp-axis-text', transform: 'rotate(-90 10 ' + (LOGO_TOP + LOGO_BIT_HEIGHT) + ')' });
    bitsLabel.textContent = 'bits';
    svg.appendChild(bitsLabel);

    for (var column = 0; column < k; column++) {
      appendLogoColumn(svg, profileColumn(profile, column), column, baseline);
      var positionLabel = makeSvgElement('text', { x: String(LOGO_LEFT + column * LOGO_COLUMN_WIDTH + LOGO_COLUMN_WIDTH / 2), y: String(baseline + 16), 'text-anchor': 'middle', 'class': 'wp-axis-text' });
      positionLabel.textContent = String(column + 1);
      svg.appendChild(positionLabel);
    }
    return svg;
  }

  /* Stack letters from the shortest (bottom) to the tallest (top). */
  function stackingOrder(heights) {
    var order = [0, 1, 2, 3];
    order.sort(function (first, second) {
      return heights[first] - heights[second];
    });
    return order;
  }

  function appendLogoColumn(svg, columnProbabilities, column, baseline) {
    var heights = logoColumnHeights(columnProbabilities);
    var order = stackingOrder(heights);
    var centerX = LOGO_LEFT + column * LOGO_COLUMN_WIDTH + LOGO_COLUMN_WIDTH / 2;
    var glyphWidth = LOGO_COLUMN_WIDTH - 4;
    var currentBottom = baseline;
    for (var index = 0; index < order.length; index++) {
      var symbolIndex = order[index];
      var pixelHeight = heights[symbolIndex] * LOGO_BIT_HEIGHT;
      if (pixelHeight < 0.5) {
        continue;
      }
      var scaleX = glyphWidth / 70;
      var scaleY = pixelHeight / (100 * GLYPH_CAP_HEIGHT);
      var letter = makeSvgElement('text', {
        x: '0',
        y: '0',
        'text-anchor': 'middle',
        'font-size': '100',
        textLength: '70',
        lengthAdjust: 'spacingAndGlyphs',
        'class': 'wp-logo-letter ' + nucleotideClass(NUCLEOTIDES[symbolIndex]),
        transform: 'translate(' + centerX + ' ' + currentBottom + ') scale(' + scaleX.toFixed(4) + ' ' + scaleY.toFixed(4) + ')'
      });
      letter.textContent = NUCLEOTIDES[symbolIndex];
      svg.appendChild(letter);
      currentBottom -= pixelHeight;
    }
  }

  function describeLogo(profile) {
    var parts = [];
    for (var column = 0; column < profile[0].length; column++) {
      var columnProbabilities = profileColumn(profile, column);
      parts.push('position ' + (column + 1) + ': ' + formatEntropy(informationContent(columnProbabilities)) + ' bits');
    }
    return 'Motif logo. Information content (2 minus entropy) by ' + parts.join('; ') + '.';
  }

  function buildProbabilityLine(kmer, profile) {
    var line = makeElement('p', 'wp-prob');
    line.appendChild(document.createTextNode('Pr('));
    line.appendChild(coloredKmer(kmer));
    line.appendChild(document.createTextNode(' | Profile) = '));
    var factors = kmerProbabilityFactors(kmer, profile);
    var factorTexts = [];
    for (var index = 0; index < factors.length; index++) {
      factorTexts.push(formatFactor(factors[index]));
    }
    line.appendChild(makeElement('span', 'wp-factors', factorTexts.join(' · ')));
    line.appendChild(document.createTextNode(' = '));
    line.appendChild(makeElement('strong', null, formatProbability(kmerProbability(kmer, profile))));
    return line;
  }

  /* ---------- One mounted widget ---------- */

  function mountWidget(root) {
    widgetCounter += 1;
    var idPrefix = 'wp' + widgetCounter;
    var state = { motifs: upperCaseRows(NFKB_MOTIFS), usePseudocounts: false, shownKmer: null, shownKmerSource: '' };

    var existingFoot = root.querySelector('.widget-foot');
    var body = makeElement('div', 'wp-body');

    var inputBlock = makeElement('div', 'wp-input');
    var textareaLabel = makeElement('label', 'wp-label', 'Motifs: one k-mer per row (up to ' + MAX_ROWS + ' rows, k up to ' + MAX_COLUMNS + ')');
    textareaLabel.htmlFor = idPrefix + '-motifs';
    var textarea = makeElement('textarea', 'wp-textarea');
    textarea.id = idPrefix + '-motifs';
    textarea.rows = 10;
    textarea.spellcheck = false;
    textarea.setAttribute('autocapitalize', 'characters');
    textarea.setAttribute('autocomplete', 'off');
    textarea.value = NFKB_MOTIFS.join('\n');
    var errorLine = makeElement('p', 'wp-error');
    errorLine.id = idPrefix + '-error';
    errorLine.setAttribute('role', 'alert');
    textarea.setAttribute('aria-describedby', errorLine.id);

    var inputControls = makeElement('div', 'wp-controls');
    var resetButton = makeButton('Load the NF-κB motifs');
    var pseudoLabel = makeElement('label', 'wp-check');
    var pseudoBox = makeElement('input');
    pseudoBox.type = 'checkbox';
    pseudoLabel.appendChild(pseudoBox);
    pseudoLabel.appendChild(document.createTextNode(' Add pseudocounts (Laplace: add 1 to every count)'));
    inputControls.appendChild(resetButton);
    inputControls.appendChild(pseudoLabel);

    inputBlock.appendChild(textareaLabel);
    inputBlock.appendChild(textarea);
    inputBlock.appendChild(errorLine);
    inputBlock.appendChild(inputControls);

    var summary = makeElement('div', 'wp-summary');
    var tableBox = makeElement('div', 'wp-scroll');
    tableBox.tabIndex = 0;
    tableBox.setAttribute('role', 'region');
    tableBox.setAttribute('aria-label', 'Motif, count and profile matrices (scrolls sideways)');

    var logoHeading = makeElement('p', 'wp-subhead', 'Motif logo (letter height = frequency × information content, 2 − entropy)');
    var logoBox = makeElement('div', 'wp-scroll wp-logo');
    var logoDescription = makeElement('p', 'wp-sr-only');
    logoDescription.id = idPrefix + '-logo-desc';

    var diceBlock = makeElement('div', 'wp-dice');
    diceBlock.appendChild(makeElement('p', 'wp-subhead', 'Roll the dice: each column of Profile is a four-sided die'));
    var diceControls = makeElement('div', 'wp-controls');
    var rollButton = makeButton('Roll the dice');
    var kmerLabel = makeElement('label', 'wp-label-inline', 'or type a k-mer ');
    var kmerInput = makeElement('input', 'wp-kmer-input');
    kmerInput.type = 'text';
    kmerInput.spellcheck = false;
    kmerInput.setAttribute('autocomplete', 'off');
    kmerInput.setAttribute('autocapitalize', 'characters');
    kmerInput.id = idPrefix + '-kmer';
    kmerLabel.htmlFor = kmerInput.id;
    var kmerButton = makeButton('Compute Pr');
    diceControls.appendChild(rollButton);
    diceControls.appendChild(kmerLabel);
    diceControls.appendChild(kmerInput);
    diceControls.appendChild(kmerButton);
    var probabilityBox = makeElement('div', 'wp-prob-box');
    diceBlock.appendChild(diceControls);
    diceBlock.appendChild(probabilityBox);

    var status = makeElement('p', 'wp-status');
    status.setAttribute('aria-live', 'polite');

    body.appendChild(inputBlock);
    body.appendChild(summary);
    body.appendChild(tableBox);
    body.appendChild(logoHeading);
    body.appendChild(logoBox);
    body.appendChild(logoDescription);
    body.appendChild(diceBlock);
    body.appendChild(status);

    if (existingFoot) {
      root.insertBefore(body, existingFoot);
    } else {
      root.appendChild(body);
    }

    function currentProfile() {
      return profileMatrix(state.motifs, state.usePseudocounts ? 1 : 0);
    }

    function renderSummary(profile) {
      clearElement(summary);
      var perColumn = scorePerColumn(state.motifs);
      var scoreLine = makeElement('p', 'wp-line');
      scoreLine.appendChild(makeElement('span', 'wp-key', 'Score(Motifs) = '));
      scoreLine.appendChild(document.createTextNode(perColumn.join(' + ') + ' = '));
      scoreLine.appendChild(makeElement('strong', null, String(sumOf(perColumn))));
      var consensusLine = makeElement('p', 'wp-line');
      consensusLine.appendChild(makeElement('span', 'wp-key', 'Consensus(Motifs) = '));
      consensusLine.appendChild(coloredKmer(consensusString(state.motifs)));
      var entropyLine = makeElement('p', 'wp-line');
      entropyLine.appendChild(makeElement('span', 'wp-key', 'Entropy(Motifs) = '));
      entropyLine.appendChild(document.createTextNode('sum of column entropies = '));
      entropyLine.appendChild(makeElement('strong', null, formatEntropy(totalEntropy(profile))));
      if (state.usePseudocounts) {
        entropyLine.appendChild(makeElement('span', 'wp-note', ' (computed from the pseudocount profile)'));
      }
      var shapeLine = makeElement('p', 'wp-line wp-note', 't = ' + state.motifs.length + ' rows, k = ' + state.motifs[0].length + ' columns; Profile = ' + (state.usePseudocounts ? '(Count + 1) / (t + 4)' : 'Count / t') + '.');
      summary.appendChild(scoreLine);
      summary.appendChild(consensusLine);
      summary.appendChild(entropyLine);
      summary.appendChild(shapeLine);
    }

    function renderProbability(profile) {
      clearElement(probabilityBox);
      if (!state.shownKmer) {
        probabilityBox.appendChild(makeElement('p', 'wp-note', 'Roll the dice to generate a k-mer from Profile, one column at a time. The entries it uses are outlined in the profile matrix above.'));
        return;
      }
      probabilityBox.appendChild(makeElement('p', 'wp-note', state.shownKmerSource));
      probabilityBox.appendChild(buildProbabilityLine(state.shownKmer, profile));
    }

    function renderAll() {
      var profile = currentProfile();
      renderSummary(profile);
      clearElement(tableBox);
      tableBox.appendChild(buildMatrixTable(state.motifs, state.usePseudocounts, state.shownKmer));
      clearElement(logoBox);
      var logo = buildLogo(profile);
      logo.setAttribute('aria-describedby', logoDescription.id);
      logoBox.appendChild(logo);
      logoDescription.textContent = describeLogo(profile);
      renderProbability(profile);
    }

    function announce(message) {
      status.textContent = message;
    }

    function applyTextarea() {
      var parsed = parseMotifMatrix(textarea.value);
      if (parsed.error) {
        errorLine.textContent = parsed.error + ' The matrices below still show the last valid motifs.';
        textarea.setAttribute('aria-invalid', 'true');
        return;
      }
      errorLine.textContent = '';
      textarea.removeAttribute('aria-invalid');
      var lengthChanged = parsed.motifs[0].length !== state.motifs[0].length;
      state.motifs = parsed.motifs;
      if (lengthChanged) {
        state.shownKmer = null;
      }
      renderAll();
      announce('Updated: ' + state.motifs.length + ' motifs of length ' + state.motifs[0].length + ', Score ' + scoreMotifs(state.motifs) + ', consensus ' + consensusString(state.motifs) + '.');
    }

    textarea.addEventListener('input', applyTextarea);

    resetButton.addEventListener('click', function () {
      textarea.value = NFKB_MOTIFS.join('\n');
      state.shownKmer = null;
      applyTextarea();
    });

    pseudoBox.addEventListener('change', function () {
      state.usePseudocounts = pseudoBox.checked;
      renderAll();
      announce(state.usePseudocounts ? 'Pseudocounts on: every count increased by 1, so no profile entry is zero.' : 'Pseudocounts off: Profile = Count / t.');
    });

    rollButton.addEventListener('click', function () {
      var profile = currentProfile();
      state.shownKmer = sampleKmer(profile, Math.random);
      state.shownKmerSource = 'The dice rolled this k-mer:';
      renderAll();
      announce('Rolled ' + state.shownKmer + '. Pr(' + state.shownKmer + ' | Profile) = ' + formatProbability(kmerProbability(state.shownKmer, profile)) + '.');
    });

    function computeTypedKmer() {
      var typed = kmerInput.value.replace(/\s+/g, '').toUpperCase();
      var k = state.motifs[0].length;
      if (!/^[ACGT]*$/.test(typed)) {
        announce('The k-mer may only contain A, C, G, T.');
        return;
      }
      if (typed.length !== k) {
        announce('Type a k-mer of length k = ' + k + ' (you typed ' + typed.length + ' letters).');
        return;
      }
      var profile = currentProfile();
      state.shownKmer = typed;
      state.shownKmerSource = 'You typed this k-mer:';
      renderAll();
      announce('Pr(' + typed + ' | Profile) = ' + formatProbability(kmerProbability(typed, profile)) + '.');
    }

    kmerButton.addEventListener('click', computeTypedKmer);
    kmerInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        computeTypedKmer();
      }
    });

    renderAll();
    announce('Loaded the NF-κB motif matrix: 10 motifs of length 12, Score 30, consensus TCGGGGATTTCC.');
  }

  function mountAll() {
    var mounts = document.querySelectorAll('[data-widget="profile"]');
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
