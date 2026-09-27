/* Frequent words and clump explorer for lessons 1.2 ("Hidden Messages in the Replication Origin")
   and 1.4 ("An Explosion of Hidden Messages"). Vanilla ES2019, no dependencies. The algorithm core
   is a set of pure functions exported for tests/widgets/clumps.test.mjs; the DOM code runs only in
   a browser. */
(function () {
  'use strict';

  var WIDGET_ID = 'clumps';
  var MAX_TEXT_LENGTH = 10000;
  var MAX_K = 20;
  var TABLE_PREVIEW_ROWS = 15;
  var MAX_LISTED_POSITIONS = 60;
  var MAX_LISTED_PATTERNS = 80;
  var PLAY_DELAY_MS = 120;

  /* ---------- Sample data (the book's own examples) ---------- */

  var VIBRIO_ORI = [
    'atcaatgatcaacgtaagcttctaagcatgatcaaggtgctcacacagtttatccacaac',
    'ctgagtggatgacatcaagataggtcgttgtatctccttcctctcgtactctcatgacca',
    'cggaaagatgatcaagagaggatgatttcttggccatatcgcaatgaatacttgtgactt',
    'gtgcttccaattgacatcttcagcgccatattgcgctggccaaggtgacggagcgggatt',
    'acgaaagcatgatcatggctgttgttctgtttatcttgttttgactgagacttgttagga',
    'tagacggtttttcatcactgactagccaaagccttactctgcctgacatcgaccgtaaat',
    'tgataatgaatttacatgcttccgcgacgatttacctcttgatcatcgatccgattgaag',
    'atcttcaattgttaattctcttgcctcgactcatagccatgatgagctcttgatcatgtt',
    'tccttaaccctctattttttacggaagaatgatcaagctgctgctcttgatcatcgtttc'
  ].join('').toUpperCase();

  var THERMOTOGA_ORI = [
    'aactctatacctcctttttgtcgaatttgtgtgatttatagagaaaatcttattaactgaaactaaaatggtaggtttggtggtaggttttgtgtacattttg',
    'tagtatctgatttttaattacataccgtatattgtattaaattgacgaacaattgcatggaattgaatatatgcaaaacaaacctaccaccaaactctgtattga',
    'ccattttaggacaacttcagggtggtaggtttctgaagctctcatcaatagactattttagtctttacaaacaatattaccgttcagattcaagattctacaacg',
    'ctgttttaatgggcgttgcagaaaacttaccacctaaaatccagtatccaagccgatttcagagaaacctaccacttacctaccacttacctaccacccgggtgg',
    'taagttgcagacattattaaaaacctcatcagaagcttgttcaaaaatttcaatactcgaaacctaccacctgcgtcccctattatttactactactaataatag',
    'cagtataattgatctga'
  ].join('').toUpperCase();

  var PRESETS = [
    {
      id: 'vibrio',
      label: 'Vibrio cholerae ori (lesson 1.2)',
      text: VIBRIO_ORI,
      k: 9, L: 500, t: 3,
      note: 'The ori region of Vibrio cholerae. ATGATCAAG appears three times; it forms a (500, 3)-clump.'
    },
    {
      id: 'thermotoga',
      label: 'Thermotoga petrophila ori (lesson 1.4)',
      text: THERMOTOGA_ORI,
      k: 9, L: 500, t: 3,
      note: 'The proposed ori region of Thermotoga petrophila, where CCTACCACC forms a (500, 3)-clump.'
    },
    {
      id: 'tgca',
      label: 'TGCA forms a (25, 3)-clump (lesson 1.4)',
      text: 'GATCAGCATAAGGGTCCCTGCAATGCATGACAAGCCTGCAGTTGTTTTAC',
      k: 4, L: 25, t: 3,
      note: 'The book’s example Genome in which TGCA forms a (25, 3)-clump.'
    },
    {
      id: 'ba1b',
      label: 'Frequent Words sample dataset',
      text: 'ACGTTGCATGTCGCATGATGCATGAGAGCT',
      k: 4, L: 30, t: 3,
      note: 'The sample dataset for the Frequent Words Problem with k = 4 (expected output: CATG GCAT).'
    },
    {
      id: 'ba1e',
      label: 'Clump Finding sample dataset',
      text: 'CGGACTCGACAGATGTGAAGAACGACAATGTGAAGACTCGACACGACAGAGTGAAGAGAAGAGGAAACATTGTAA',
      k: 5, L: 50, t: 4,
      note: 'The sample dataset for the Clump Finding Problem with k = 5, L = 50, t = 4 (expected output: CGACA GAAGA).'
    },
    {
      id: 'actat',
      label: 'ACTAT is surprisingly frequent (lesson 1.2)',
      text: 'ACAACTATGCATACTATCGGGAACTATCCT',
      k: 5, L: 30, t: 3,
      note: 'Count(ACAACTATGCATACTATCGGGAACTATCCT, ACTAT) = 3.'
    }
  ];

  /* ---------- Algorithm core (pure functions) ---------- */

  // Cleans pasted text into a DNA string: drops FASTA header lines, removes whitespace, uppercases.
  function normalizeText(rawText, maxLength) {
    var lines = String(rawText).split(/\r?\n/);
    var keptLines = [];
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (lines[lineIndex].trim().charAt(0) !== '>') {
        keptLines.push(lines[lineIndex]);
      }
    }
    var text = keptLines.join('').replace(/\s+/g, '').toUpperCase();
    if (text.length === 0) {
      return { ok: false, error: 'Paste a DNA string made of the letters A, C, G and T.' };
    }
    if (text.length > maxLength) {
      return {
        ok: false,
        error: 'That string has ' + formatInteger(text.length) + ' nucleotides; this widget handles at most ' + formatInteger(maxLength) + '.'
      };
    }
    var badPosition = findFirstNonNucleotide(text);
    if (badPosition !== -1) {
      return {
        ok: false,
        error: 'Found “' + text.charAt(badPosition) + '” at position ' + formatInteger(badPosition) + ' (counting from 0, ignoring spaces); only A, C, G and T are allowed.'
      };
    }
    return { ok: true, text: text };
  }

  function findFirstNonNucleotide(text) {
    for (var position = 0; position < text.length; position++) {
      if ('ACGT'.indexOf(text.charAt(position)) === -1) {
        return position;
      }
    }
    return -1;
  }

  function parseWholeNumber(value) {
    var trimmed = String(value).trim();
    if (!/^\d+$/.test(trimmed)) {
      return NaN;
    }
    return Number(trimmed);
  }

  // Checks k, L and t against the text length. Returns { ok, k, L, t } or { ok: false, error }.
  function parseParameters(rawK, rawL, rawT, textLength) {
    var k = parseWholeNumber(rawK);
    var L = parseWholeNumber(rawL);
    var t = parseWholeNumber(rawT);
    if (isNaN(k) || k < 1 || k > Math.min(MAX_K, textLength)) {
      return { ok: false, error: 'k must be a whole number from 1 to ' + Math.min(MAX_K, textLength) + ' (and no longer than Text).' };
    }
    if (isNaN(L) || L < k || L > textLength) {
      return { ok: false, error: 'L must be a whole number from k = ' + k + ' to |Text| = ' + formatInteger(textLength) + ', so that a k-mer fits inside every window.' };
    }
    if (isNaN(t) || t < 1) {
      return { ok: false, error: 't must be a whole number of at least 1.' };
    }
    return { ok: true, k: k, L: L, t: t };
  }

  // Count(Text, Pattern): the number of (possibly overlapping) occurrences of Pattern in Text.
  function patternCount(text, pattern) {
    return patternPositions(text, pattern).length;
  }

  // All starting positions i (0-based) with Text(i, |Pattern|) = Pattern, overlaps included.
  function patternPositions(text, pattern) {
    var positions = [];
    if (pattern.length === 0) {
      return positions;
    }
    for (var i = 0; i <= text.length - pattern.length; i++) {
      if (text.substr(i, pattern.length) === pattern) {
        positions.push(i);
      }
    }
    return positions;
  }

  // FrequencyTable(Text, k): a map from each k-mer of Text to its number of occurrences.
  function frequencyTable(text, k) {
    var freqMap = new Map();
    for (var i = 0; i <= text.length - k; i++) {
      var pattern = text.substr(i, k);
      if (freqMap.has(pattern)) {
        freqMap.set(pattern, freqMap.get(pattern) + 1);
      } else {
        freqMap.set(pattern, 1);
      }
    }
    return freqMap;
  }

  // MaxMap: the largest value in a map (0 for an empty map).
  function maxMap(freqMap) {
    var largest = 0;
    var first = true;
    freqMap.forEach(function (value) {
      if (first || value > largest) {
        largest = value;
        first = false;
      }
    });
    return largest;
  }

  // BetterFrequentWords(Text, k): all most frequent k-mers, sorted alphabetically.
  function betterFrequentWords(text, k) {
    var freqMap = frequencyTable(text, k);
    var largest = maxMap(freqMap);
    var frequentPatterns = [];
    freqMap.forEach(function (count, pattern) {
      if (count === largest) {
        frequentPatterns.push(pattern);
      }
    });
    frequentPatterns.sort();
    return frequentPatterns;
  }

  function compareEntries(first, second) {
    if (first.count !== second.count) {
      return second.count - first.count;
    }
    if (first.pattern < second.pattern) {
      return -1;
    }
    if (first.pattern > second.pattern) {
      return 1;
    }
    return 0;
  }

  // The frequency table as a list of { pattern, count }, most frequent first, ties alphabetical.
  function sortedFrequencyEntries(freqMap) {
    var entries = [];
    freqMap.forEach(function (count, pattern) {
      entries.push({ pattern: pattern, count: count });
    });
    entries.sort(compareEntries);
    return entries;
  }

  // The k-mers appearing at least t times in the window Text(start, L), most frequent first.
  function windowClumps(text, start, k, L, t) {
    var window = text.substr(start, L);
    var entries = sortedFrequencyEntries(frequencyTable(window, k));
    var clumps = [];
    for (var index = 0; index < entries.length; index++) {
      if (entries[index].count >= t) {
        clumps.push(entries[index]);
      }
    }
    return clumps;
  }

  function incrementCount(counts, pattern) {
    var next = (counts.get(pattern) || 0) + 1;
    counts.set(pattern, next);
    return next;
  }

  function decrementCount(counts, pattern) {
    var next = counts.get(pattern) - 1;
    counts.set(pattern, next);
    return next;
  }

  // Slides the window Text(i, L) for i = 0 .. lastStart, updating k-mer counts by one k-mer at a
  // time instead of rebuilding each window's table. Returns the sorted distinct k-mers that reach
  // t occurrences in some window, and for each window whether it holds any clump.
  function slideWindows(text, k, L, t, lastStart) {
    var found = new Set();
    var windowHasClump = [];
    if (L > text.length || k > L) {
      return { patterns: [], windowHasClump: windowHasClump };
    }
    var counts = new Map();
    var patternsAtLeastT = 0;
    for (var first = 0; first <= L - k; first++) {
      var firstPattern = text.substr(first, k);
      if (incrementCount(counts, firstPattern) === t) {
        patternsAtLeastT += 1;
        found.add(firstPattern);
      }
    }
    windowHasClump.push(patternsAtLeastT > 0);
    for (var start = 1; start <= lastStart; start++) {
      var leaving = text.substr(start - 1, k);
      if (decrementCount(counts, leaving) === t - 1) {
        patternsAtLeastT -= 1;
      }
      var entering = text.substr(start + L - k, k);
      if (incrementCount(counts, entering) === t) {
        patternsAtLeastT += 1;
        found.add(entering);
      }
      windowHasClump.push(patternsAtLeastT > 0);
    }
    var patterns = Array.from(found);
    patterns.sort();
    return { patterns: patterns, windowHasClump: windowHasClump };
  }

  // Clump Finding Problem: all distinct k-mers forming (L, t)-clumps in Genome, sorted.
  function findClumps(text, k, L, t) {
    return slideWindows(text, k, L, t, text.length - L).patterns;
  }

  // The distinct k-mers forming clumps in the windows starting at 0 .. lastStart.
  function clumpsThroughWindow(text, k, L, t, lastStart) {
    return slideWindows(text, k, L, t, lastStart).patterns;
  }

  // For drawing: 1 where some occurrence covers the position, 2 where an occurrence starts.
  function occurrenceMarks(textLength, positions, patternLength) {
    var marks = new Array(textLength);
    for (var index = 0; index < textLength; index++) {
      marks[index] = 0;
    }
    for (var p = 0; p < positions.length; p++) {
      for (var offset = 0; offset < patternLength; offset++) {
        if (marks[positions[p] + offset] === 0) {
          marks[positions[p] + offset] = 1;
        }
      }
    }
    for (var s = 0; s < positions.length; s++) {
      marks[positions[s]] = 2;
    }
    return marks;
  }

  function formatInteger(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ---------- Browser UI ---------- */

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function createButton(label, className) {
    var button = createElement('button', 'btn btn-small ' + (className || ''), label);
    button.type = 'button';
    return button;
  }

  function createField(labelText, input, idPrefix, name) {
    var wrapper = createElement('div', 'w-clumps-field');
    input.id = idPrefix + name;
    var label = createElement('label', 'w-clumps-label', labelText);
    label.htmlFor = input.id;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createNumberInput(minimum) {
    var input = createElement('input', 'w-clumps-input w-clumps-number');
    input.type = 'number';
    input.min = String(minimum);
    input.step = '1';
    input.inputMode = 'numeric';
    return input;
  }

  function findPreset(presetId) {
    for (var index = 0; index < PRESETS.length; index++) {
      if (PRESETS[index].id === presetId) {
        return PRESETS[index];
      }
    }
    return null;
  }

  function limitedList(items, limit) {
    var text = items.slice(0, limit).join(' ');
    if (items.length > limit) {
      text += ' … (' + formatInteger(items.length) + ' in all)';
    }
    return text;
  }

  function ClumpsWidget(mount, instanceNumber) {
    this.mount = mount;
    this.idPrefix = 'w-clumps-' + instanceNumber + '-';
    this.text = '';
    this.k = 1;
    this.L = 1;
    this.t = 1;
    this.entries = [];
    this.pattern = '';
    this.windowStart = 0;
    this.windowHasClump = [];
    this.showAllRows = false;
    this.playTimer = null;
    this.build();
    this.loadPreset(PRESETS[0]);
  }

  ClumpsWidget.prototype.build = function () {
    var body = this.mount.querySelector('.w-clumps-body');
    if (!body) {
      body = createElement('div', 'w-clumps-body');
      this.mount.insertBefore(body, this.mount.querySelector('.widget-foot'));
    }
    var noscript = this.mount.querySelector('noscript');
    if (noscript) {
      noscript.parentNode.removeChild(noscript);
    }
    this.buildInputs(body);
    this.buildSequenceView(body);
    this.buildFrequencySection(body);
    this.buildWindowSection(body);
  };

  ClumpsWidget.prototype.buildInputs = function (body) {
    var self = this;
    var controls = createElement('div', 'w-clumps-controls');

    var presetSelect = createElement('select', 'w-clumps-input');
    for (var index = 0; index < PRESETS.length; index++) {
      var option = createElement('option', '', PRESETS[index].label);
      option.value = PRESETS[index].id;
      presetSelect.appendChild(option);
    }
    var customOption = createElement('option', '', 'Your own Text');
    customOption.value = 'custom';
    presetSelect.appendChild(customOption);
    presetSelect.addEventListener('change', function () {
      var preset = findPreset(presetSelect.value);
      if (preset) {
        self.loadPreset(preset);
      } else {
        self.textArea.focus();
      }
    });
    controls.appendChild(createField('Example', presetSelect, this.idPrefix, 'preset'));

    var textArea = createElement('textarea', 'w-clumps-input w-clumps-text');
    textArea.rows = 3;
    textArea.spellcheck = false;
    textArea.setAttribute('autocomplete', 'off');
    controls.appendChild(createField('Text (up to 10,000 nucleotides; spaces and line breaks are ignored)', textArea, this.idPrefix, 'text'));

    var numbers = createElement('div', 'w-clumps-numbers');
    var kInput = createNumberInput(1);
    var lInput = createNumberInput(1);
    var tInput = createNumberInput(1);
    numbers.appendChild(createField('k', kInput, this.idPrefix, 'k'));
    numbers.appendChild(createField('L (window)', lInput, this.idPrefix, 'L'));
    numbers.appendChild(createField('t (at least)', tInput, this.idPrefix, 't'));
    controls.appendChild(numbers);

    var row = createElement('div', 'w-clumps-row');
    var runButton = createButton('Count k-mers');
    runButton.addEventListener('click', function () {
      presetSelect.value = self.matchingPresetId();
      self.run(null);
    });
    row.appendChild(runButton);
    controls.appendChild(row);

    var onEnter = function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        runButton.click();
      }
    };
    kInput.addEventListener('keydown', onEnter);
    lInput.addEventListener('keydown', onEnter);
    tInput.addEventListener('keydown', onEnter);

    var message = createElement('p', 'w-clumps-message');
    message.setAttribute('role', 'alert');
    controls.appendChild(message);

    body.appendChild(controls);
    this.presetSelect = presetSelect;
    this.textArea = textArea;
    this.kInput = kInput;
    this.lInput = lInput;
    this.tInput = tInput;
    this.message = message;
  };

  ClumpsWidget.prototype.buildSequenceView = function (body) {
    var self = this;
    var section = createElement('div', 'w-clumps-section');
    var note = createElement('p', 'w-clumps-note');
    section.appendChild(note);

    var patternRow = createElement('div', 'w-clumps-numbers');
    var patternInput = createElement('input', 'w-clumps-input w-clumps-pattern');
    patternInput.type = 'text';
    patternInput.spellcheck = false;
    patternInput.setAttribute('autocomplete', 'off');
    patternRow.appendChild(createField('Pattern to highlight', patternInput, this.idPrefix, 'pattern'));
    var patternButton = createButton('Highlight');
    patternButton.addEventListener('click', function () {
      self.selectPattern(patternInput.value);
    });
    patternInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        self.selectPattern(patternInput.value);
      }
    });
    var buttonWrap = createElement('div', 'w-clumps-field w-clumps-field-button');
    buttonWrap.appendChild(patternButton);
    patternRow.appendChild(buttonWrap);
    section.appendChild(patternRow);

    var countLine = createElement('p', 'w-clumps-count');
    countLine.setAttribute('aria-live', 'polite');
    section.appendChild(countLine);

    var legend = createElement('p', 'w-clumps-legend');
    legend.innerHTML = '<span class="w-clumps-key w-clumps-key-hit">ATG</span> an occurrence of Pattern (overlaps merge; a bar marks where each one starts) &nbsp; <span class="w-clumps-key w-clumps-key-window">ACGT</span> the current window of length L';
    section.appendChild(legend);

    var sequenceBox = createElement('div', 'w-clumps-sequence');
    sequenceBox.tabIndex = 0;
    sequenceBox.setAttribute('role', 'region');
    sequenceBox.setAttribute('aria-label', 'Text with the occurrences of Pattern highlighted');
    section.appendChild(sequenceBox);

    body.appendChild(section);
    this.note = note;
    this.patternInput = patternInput;
    this.countLine = countLine;
    this.sequenceBox = sequenceBox;
  };

  ClumpsWidget.prototype.buildFrequencySection = function (body) {
    var self = this;
    var section = createElement('div', 'w-clumps-section');
    section.appendChild(createElement('h3', 'w-clumps-subhead', 'Frequency table'));
    var summary = createElement('p', 'w-clumps-summary');
    section.appendChild(summary);

    var tableBox = createElement('div', 'w-clumps-tablebox');
    var table = createElement('table', 'w-clumps-table');
    tableBox.appendChild(table);
    section.appendChild(tableBox);

    var toggle = createButton('Show all');
    toggle.addEventListener('click', function () {
      self.showAllRows = !self.showAllRows;
      self.renderTable();
    });
    var row = createElement('div', 'w-clumps-row');
    row.appendChild(toggle);
    section.appendChild(row);

    body.appendChild(section);
    this.summary = summary;
    this.table = table;
    this.tableToggle = toggle;
  };

  ClumpsWidget.prototype.buildWindowSection = function (body) {
    var self = this;
    var section = createElement('div', 'w-clumps-section');
    section.appendChild(createElement('h3', 'w-clumps-subhead', 'Slide a window of length L'));
    section.appendChild(createElement('p', 'w-clumps-note', 'FindClumps looks at every window Text(i, L) for i from 0 to |Text| − L, builds its frequency table, and keeps each k-mer that appears at least t times.'));

    var slider = createElement('input', 'w-clumps-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.step = '1';
    slider.addEventListener('input', function () {
      self.stopPlaying();
      self.setWindowStart(Number(slider.value));
    });
    section.appendChild(createField('Window start i', slider, this.idPrefix, 'window'));

    var buttons = createElement('div', 'w-clumps-row');
    var stepButton = createButton('Step');
    var playButton = createButton('Play');
    var resetButton = createButton('Reset');
    var nextButton = createButton('Next window with a clump');
    stepButton.addEventListener('click', function () {
      self.stopPlaying();
      self.advanceWindow();
    });
    playButton.addEventListener('click', function () {
      self.togglePlaying();
    });
    resetButton.addEventListener('click', function () {
      self.stopPlaying();
      self.setWindowStart(0);
    });
    nextButton.addEventListener('click', function () {
      self.stopPlaying();
      self.jumpToNextClumpWindow();
    });
    buttons.appendChild(stepButton);
    buttons.appendChild(playButton);
    buttons.appendChild(resetButton);
    buttons.appendChild(nextButton);
    section.appendChild(buttons);

    var windowStatus = createElement('p', 'w-clumps-status');
    windowStatus.setAttribute('aria-live', 'polite');
    section.appendChild(windowStatus);

    var windowList = createElement('div', 'w-clumps-chips');
    section.appendChild(windowList);

    var soFar = createElement('p', 'w-clumps-sofar');
    section.appendChild(soFar);

    var answer = createElement('p', 'w-clumps-answer');
    section.appendChild(answer);

    body.appendChild(section);
    this.slider = slider;
    this.stepButton = stepButton;
    this.playButton = playButton;
    this.nextButton = nextButton;
    this.windowStatus = windowStatus;
    this.windowList = windowList;
    this.soFar = soFar;
    this.answer = answer;
  };

  ClumpsWidget.prototype.matchingPresetId = function () {
    var preset = findPreset(this.presetSelect.value);
    if (!preset) {
      return 'custom';
    }
    var cleaned = normalizeText(this.textArea.value, MAX_TEXT_LENGTH);
    if (cleaned.ok && cleaned.text === preset.text) {
      return preset.id;
    }
    return 'custom';
  };

  ClumpsWidget.prototype.loadPreset = function (preset) {
    this.presetSelect.value = preset.id;
    this.textArea.value = preset.text;
    this.kInput.value = String(preset.k);
    this.lInput.value = String(preset.L);
    this.tInput.value = String(preset.t);
    this.run(preset.note);
  };

  ClumpsWidget.prototype.run = function (noteText) {
    var cleaned = normalizeText(this.textArea.value, MAX_TEXT_LENGTH);
    if (!cleaned.ok) {
      this.message.textContent = cleaned.error;
      return;
    }
    var parameters = parseParameters(this.kInput.value, this.lInput.value, this.tInput.value, cleaned.text.length);
    if (!parameters.ok) {
      this.message.textContent = parameters.error;
      return;
    }
    this.message.textContent = '';
    this.stopPlaying();
    this.text = cleaned.text;
    this.k = parameters.k;
    this.L = parameters.L;
    this.t = parameters.t;
    this.entries = sortedFrequencyEntries(frequencyTable(this.text, this.k));
    this.windowHasClump = slideWindows(this.text, this.k, this.L, this.t, this.text.length - this.L).windowHasClump;
    this.clumpAnswer = findClumps(this.text, this.k, this.L, this.t);
    this.showAllRows = false;
    this.note.textContent = (noteText || 'Your Text.') + ' |Text| = ' + formatInteger(this.text.length) + '.';
    this.renderSummary();
    this.slider.max = String(this.text.length - this.L);
    this.slider.value = '0';
    this.windowStart = 0;
    this.renderAnswer();
    this.selectPattern(this.entries[0].pattern);
    this.setWindowStart(0);
  };

  ClumpsWidget.prototype.renderSummary = function () {
    var kmerCount = this.text.length - this.k + 1;
    var mostFrequent = betterFrequentWords(this.text, this.k);
    var topCount = this.entries[0].count;
    this.summary.textContent = 'Text has |Text| − k + 1 = ' + formatInteger(kmerCount) + ' k-mers (k = ' + this.k + '), ' + formatInteger(this.entries.length) + ' of them distinct. Most frequent ' + this.k + '-mers (Count = ' + topCount + '): ' + limitedList(mostFrequent, MAX_LISTED_PATTERNS) + '.';
    this.renderTable();
  };

  ClumpsWidget.prototype.renderTable = function () {
    var self = this;
    var table = this.table;
    table.textContent = '';
    var caption = createElement('caption', 'w-clumps-visually-hidden', 'Frequency table of ' + this.k + '-mers, most frequent first. Choose a k-mer to highlight it.');
    table.appendChild(caption);
    var head = createElement('tr');
    var patternHeader = createElement('th', '', this.k + '-mer');
    patternHeader.scope = 'col';
    var countHeader = createElement('th', '', 'Count');
    countHeader.scope = 'col';
    head.appendChild(patternHeader);
    head.appendChild(countHeader);
    table.appendChild(head);
    var rowCount = this.showAllRows ? this.entries.length : Math.min(TABLE_PREVIEW_ROWS, this.entries.length);
    for (var index = 0; index < rowCount; index++) {
      var entry = this.entries[index];
      var row = createElement('tr');
      if (entry.pattern === this.pattern) {
        row.className = 'w-clumps-selected';
      }
      var patternCell = createElement('td');
      var button = createElement('button', 'w-clumps-kmer', entry.pattern);
      button.type = 'button';
      button.setAttribute('data-pattern', entry.pattern);
      button.addEventListener('click', function (event) {
        self.selectPattern(event.currentTarget.getAttribute('data-pattern'));
      });
      patternCell.appendChild(button);
      row.appendChild(patternCell);
      row.appendChild(createElement('td', 'w-clumps-num', String(entry.count)));
      table.appendChild(row);
    }
    var hidden = this.entries.length - TABLE_PREVIEW_ROWS;
    this.tableToggle.hidden = hidden <= 0;
    this.tableToggle.textContent = this.showAllRows ? 'Show only the top ' + TABLE_PREVIEW_ROWS : 'Show all ' + formatInteger(this.entries.length) + ' k-mers';
  };

  ClumpsWidget.prototype.selectPattern = function (rawPattern) {
    var pattern = String(rawPattern).replace(/\s+/g, '').toUpperCase();
    if (pattern.length === 0 || findFirstNonNucleotide(pattern) !== -1) {
      this.message.textContent = 'Pattern must be made of the letters A, C, G and T.';
      return;
    }
    if (pattern.length > this.text.length) {
      this.message.textContent = 'Pattern is longer than Text.';
      return;
    }
    this.message.textContent = '';
    this.pattern = pattern;
    this.patternInput.value = pattern;
    this.positions = patternPositions(this.text, pattern);
    var line = 'Count(Text, ' + pattern + ') = ' + this.positions.length;
    if (this.positions.length > 0) {
      line += ', starting at positions ' + limitedList(this.positions, MAX_LISTED_POSITIONS);
    }
    this.countLine.textContent = line + '.';
    this.renderTable();
    this.renderSequence();
  };

  ClumpsWidget.prototype.renderSequence = function () {
    var marks = occurrenceMarks(this.text.length, this.positions || [], this.pattern.length);
    var windowEnd = this.windowStart + this.L;
    var pieces = [];
    for (var position = 0; position < this.text.length; position++) {
      var nucleotide = this.text.charAt(position);
      var classes = 'w-clumps-nt-' + nucleotide;
      if (marks[position] > 0) {
        classes += ' w-clumps-hit';
      }
      if (marks[position] === 2) {
        classes += ' w-clumps-hit-start';
      }
      if (position < this.windowStart || position >= windowEnd) {
        classes += ' w-clumps-outside';
      }
      if (position === this.windowStart) {
        classes += ' w-clumps-window-start';
      }
      if (position === windowEnd - 1) {
        classes += ' w-clumps-window-end';
      }
      pieces.push('<span class="' + classes + '">' + nucleotide + '</span>');
    }
    this.sequenceBox.innerHTML = pieces.join('');
    this.scrollWindowIntoView();
  };

  ClumpsWidget.prototype.scrollWindowIntoView = function () {
    var startSpan = this.sequenceBox.children[this.windowStart];
    if (!startSpan) {
      return;
    }
    var box = this.sequenceBox;
    var top = startSpan.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 20) {
      box.scrollTop = Math.max(0, top - 8);
    }
  };

  ClumpsWidget.prototype.lastWindowStart = function () {
    return this.text.length - this.L;
  };

  ClumpsWidget.prototype.setWindowStart = function (start) {
    var self = this;
    this.windowStart = Math.min(this.lastWindowStart(), Math.max(0, start));
    this.slider.value = String(this.windowStart);
    var clumps = windowClumps(this.text, this.windowStart, this.k, this.L, this.t);
    var windowCount = this.lastWindowStart() + 1;
    var header = 'Window ' + (this.windowStart + 1) + ' of ' + formatInteger(windowCount) + ': Text(' + this.windowStart + ', ' + this.L + ') covers positions ' + this.windowStart + ' to ' + (this.windowStart + this.L - 1) + '. ';
    if (clumps.length === 0) {
      header += 'No ' + this.k + '-mer appears ' + this.t + ' or more times in this window.';
    } else {
      header += clumps.length + ' ' + this.k + '-mer' + (clumps.length === 1 ? '' : 's') + ' appear' + (clumps.length === 1 ? 's' : '') + ' at least t = ' + this.t + ' times here:';
    }
    this.windowStatus.textContent = header;

    this.windowList.textContent = '';
    for (var index = 0; index < clumps.length && index < MAX_LISTED_PATTERNS; index++) {
      var chip = createElement('button', 'w-clumps-kmer w-clumps-chip', clumps[index].pattern + ' ×' + clumps[index].count);
      chip.type = 'button';
      chip.setAttribute('data-pattern', clumps[index].pattern);
      chip.setAttribute('aria-label', 'Highlight ' + clumps[index].pattern + ', which appears ' + clumps[index].count + ' times in this window');
      chip.addEventListener('click', function (event) {
        self.selectPattern(event.currentTarget.getAttribute('data-pattern'));
      });
      this.windowList.appendChild(chip);
    }

    var soFar = clumpsThroughWindow(this.text, this.k, this.L, this.t, this.windowStart);
    this.soFar.textContent = 'Clumps found in windows 0 to ' + this.windowStart + ' so far: ' + (soFar.length === 0 ? 'none yet' : limitedList(soFar, MAX_LISTED_PATTERNS)) + '.';
    this.stepButton.disabled = this.windowStart >= this.lastWindowStart();
    this.nextButton.disabled = this.nextClumpWindow() === -1;
    this.renderSequence();
  };

  ClumpsWidget.prototype.renderAnswer = function () {
    var windowCount = this.lastWindowStart() + 1;
    var result = this.clumpAnswer.length === 0 ? 'no k-mer forms a clump' : limitedList(this.clumpAnswer, MAX_LISTED_PATTERNS);
    this.answer.textContent = 'All ' + this.k + '-mers forming (' + this.L + ', ' + this.t + ')-clumps, over all ' + formatInteger(windowCount) + ' windows: ' + result + '.';
  };

  ClumpsWidget.prototype.nextClumpWindow = function () {
    for (var start = this.windowStart + 1; start < this.windowHasClump.length; start++) {
      if (this.windowHasClump[start]) {
        return start;
      }
    }
    return -1;
  };

  ClumpsWidget.prototype.jumpToNextClumpWindow = function () {
    var next = this.nextClumpWindow();
    if (next !== -1) {
      this.setWindowStart(next);
    }
  };

  ClumpsWidget.prototype.advanceWindow = function () {
    if (this.windowStart < this.lastWindowStart()) {
      this.setWindowStart(this.windowStart + 1);
      return true;
    }
    return false;
  };

  ClumpsWidget.prototype.togglePlaying = function () {
    if (this.playTimer !== null) {
      this.stopPlaying();
      return;
    }
    if (this.windowStart >= this.lastWindowStart()) {
      this.setWindowStart(0);
    }
    var self = this;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.playButton.textContent = 'Pause';
    this.playTimer = window.setInterval(function () {
      if (!self.advanceWindow()) {
        self.stopPlaying();
      }
    }, reduceMotion ? PLAY_DELAY_MS * 4 : PLAY_DELAY_MS);
  };

  ClumpsWidget.prototype.stopPlaying = function () {
    if (this.playTimer !== null) {
      window.clearInterval(this.playTimer);
      this.playTimer = null;
    }
    if (this.playButton) {
      this.playButton.textContent = 'Play';
    }
  };

  function initAll() {
    var mounts = document.querySelectorAll('[data-widget="' + WIDGET_ID + '"]');
    for (var index = 0; index < mounts.length; index++) {
      if (!mounts[index].hasAttribute('data-widget-ready')) {
        mounts[index].setAttribute('data-widget-ready', 'true');
        new ClumpsWidget(mounts[index], index);
      }
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAll);
    } else {
      initAll();
    }
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
      PRESETS: PRESETS,
      normalizeText: normalizeText,
      parseParameters: parseParameters,
      patternCount: patternCount,
      patternPositions: patternPositions,
      frequencyTable: frequencyTable,
      maxMap: maxMap,
      betterFrequentWords: betterFrequentWords,
      sortedFrequencyEntries: sortedFrequencyEntries,
      windowClumps: windowClumps,
      slideWindows: slideWindows,
      findClumps: findClumps,
      clumpsThroughWindow: clumpsThroughWindow,
      occurrenceMarks: occurrenceMarks
    };
  }
})();
