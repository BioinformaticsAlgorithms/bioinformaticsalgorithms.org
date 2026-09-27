/* GC skew explorer for lesson 1.7, "Peculiar Statistics of the Forward and Reverse Half-Strands".
   Vanilla ES2019, no dependencies. The algorithm core is a set of pure functions exported for
   tests/widgets/skew.test.mjs; everything that touches the DOM runs only in a browser. */
(function () {
  'use strict';

  var WIDGET_ID = 'skew';
  var MAX_GENOME_LENGTH = 200000;
  var STEPPER_LENGTH = 40;
  var PLAY_DELAY_MS = 450;
  var MAX_LISTED_MINIMA = 40;

  /* ---------- Sample data ---------- */

  // 6,000 nucleotides of E. coli (0-based genome positions 3,920,620 to 3,926,619), centered on the
  // position 3,923,620 where the book reports the minimum of the E. coli skew diagram (lesson 1.9).
  var ECOLI_EXCERPT_OFFSET = 3920620;
  var ECOLI_EXCERPT = [
    'TTTTCCAGTGCATACAATTGCGACTTTTCTGCTAACCCTGTTCGATCATGAAAAACTGTAAATAACGCGTAAACACTGGTGATAAAGCGTGCTTCAGATC',
    'ACATATTGCGCATGTTCGCGCACAGCATATTTATTTACTTGGCAAATGATGCCTTTGCAAGTTTATGATATTTCAGTCTAAAAACAGATACTGTTTTAAT',
    'AAATGACATTTACACAACAAAAACCACCCATTGACATTTTTAATAATGTTTTAACAGCCAATGATGGTTCTTAGCGCCGATTTTTAGCAGACTGATATTT',
    'TCACTAATGACTTATTTTCTGCTTACCAAAAAAAGCCACGTTATCTTGTTGATGCAAAAGAGTGAACGTGGCGTTAAATGTAACCAGTTATATCAGTAGA',
    'AAACCTGGTTGTTGTTAACAGTCTAACCGGTCAATTTTTTATGATTTTTTTGATAAAAATTAAATTTTATTTGCTTTAATCACCACCAGATGACGTTCGC',
    'CATCCAGGGCTGGAACCTGAAGTTTAACCACTGATTCGACCTGATATTCTTCGGGCAACAAAGCGATTTCATCTTCCGGCATTTGCCCTTTCAGCGCGTA',
    'GAAACGGCCTTGCTCACCAGGAAGATGGTGGCACCAGCTCACCATATCGTTCAGAGAGGCAAAAGCGCGGCTAATTACGCCATCAAATGGCGGCTCTGAA',
    'GGAAACTCTTCTACCCTGCTCTGTACTGGTTCAATATTCTCCAGTTTAAGCTCATGTTGCACCTGACGAAGGAAACGCACGCGTTTACCAAGGCTATCCA',
    'ACAGAGTGAAATGGGCTTCAGGACGCACGATAGAGAGTGGAATGCCTGGCAGTCCTGGTCCGGTGCCGACATCGATAAACCGTTCACCTTGCAGATACGG',
    'TGCCACCACAATGCTATCGAGAATATGGCGTACCAGCATCTCATTAGGATCGCGGACCGAAGTCAGGTTGTACGCTTTGTTCCATTTATGCAGCATATTC',
    'ACGTAGGCAATAAGCTGGTTTTTCTGGTGATCGGTAAGCGAAATACCTGCGTCTTTCAGCAGTAAGGAGAGTTTGTTGAGCACGGTGATTACCTGTTCTT',
    'GATGCGTTGCCTGGTAAGCGGGTGCTTACCAGGCATTTTTAATGCGTTATGCGCTACGACGCAGCATACCCTGTTTTTTCAGCCACACCAGCAGAATGGA',
    'GATGGCCGCAGGCGTGACGCCAGAAATACGCGAAGCTTGGCCGATAGAGGCTGGTTTGTGATCGTTAAGTTTGGCGATCACTTCGTTAGAAAGACCGGAT',
    'ACCTGGCGGTAATCCAGTGTCGCGGGTAGCAGGGTGTTCTCGTTACGCAGCTGCTTTTCGATCTCATCTTGCTGGCGCGCGATATAACCTTCGTATTTAA',
    'CCTGAATCTCAACCTGTTCCGCCGCCTGTTCGTCTGTCAACGCAGGGGCAAACGGCGTCAGCGTGGTTAATTTTTCATAAGTCATTTCCGGACGACGCAG',
    'CAGATCTTCACCACTGGCTTCACGGGAAAGCGGCGCAGTCAGGTGAGCATTCACTTCGGCTGCAGCTTCCGCCGACGGGGTTACCCAGGTCGATTTCAGA',
    'CGCTGACGCTCACGCTCGATATTCTCAAGTTTCTCGTTAAAGCGCGCCCAACGTTCGTCATCCACCAGGCCCAGTTCACGACCGATTTCAGTCAAACGCA',
    'GATCCGCATTATCTTCGCGTAGCATCAGACGATATTCTGCGCGCGAAGTAAACATACGATACGGTTCTTTGGTTCCTAAAGTGCACAGGTCATCAACTAG',
    'TACGCCGAGATACGCCTGAGAACGTGCCGGAGCCCAACCTTCTTTGTCAGCAGACAGACGGGCAGCGTTAAGACCGGCCAGCAAACCTTGCGCAGCGGCT',
    'TCTTCGTAACCGGTAGTGCCGTTAATCTGACCAGCAAAGAACAGCCCCTGGATAAACTTGCTCTCCAGCGTCGGTTTCAGGTCGCGAGGATCGAAGAAGT',
    'CATACTCAATGGCATAACCCGGACGCACGATCTTCGCGTTTTCCATCCCCTGCATAGAGCGGACGATTTGCATCTGCACATCGAACGGCAGGCTGGTGGA',
    'GATACCGTTCGGATAAATTTCATTAGAGGTCAGTCCTTCCGGTTCAAGGAAGATCTGATGCTGATTTCTGTCGGCGAAGCGCATGACTTTGTCTTCGATC',
    'GACGGGCAGTAGCGTGGGCCGACACCTTCGATCACCCCTGCGTACATTGGGCTACGATCGAGGTTACTGCGGATCACATCATGGGTTTTCTCGTTGGTAT',
    'GAGTGATATAACACGGCACCTGCTGGGGATGCTGGGACGCATTGCCCATAAACGAGAATACCGGCATTGGGTTATCGCCATGCTGTTGCGCCAGTACGCT',
    'AAAGTCGATGGTTCGAGCATCAATACGCGGTGGTGTCCCGGTTTTCAGACGACCAACGCGCAGCGGCAGTTCACGCAAACGGCGAGAAAGCGGAATGGAC',
    'GGCGGATCACCAGCACGGCCACCGCTGTAATTATCCAGACCGATATGAATTTTACCGTCGAGGAACGTCCCAACGGTGAGCACGACGGCTTTGGCACGGA',
    'ACTTCAGTCCCATTTGGGTAACAGCACCGACCACGCGATCGTTTTCGACAATAAGATCTTCAACCGCCTGCTGGAAGATCATCAGGTTCGGTTGGTTCTC',
    'CAGCGCCGTACGTACCGCCTGACGGTAGAGCACACGATCCGCCTGAGCTCGGGTAGCGCGAACCGCCGGTCCTTTGCTTGCGTTTAGTATCCTAAACTGG',
    'ATACCCGCCTGATCGATCGCTTTCGCCATCAGACCGCCGAGTGCATCCACTTCTTTTACCAGATGTCCCTTCCCAATACCGCCGATCGCCGGGTTGCAGC',
    'TCATCTGCCCCAGAGTGTCGATATTGTGTGTCAAAAGCAGAGTCTGTTGACCCATACGCGCCGCGGCCATCGCGGCCTCGGTGCCTGCATGACCCCCGCC',
    'AATGATGATGACGTCAAAAGGATCCGGATAAAACATGGTGATTGCCTCGCATAACGCGGTATGAAAATGGATTGAAGCCCGGGCCGTGGATTCTACTCAA',
    'CTTTGTCGGCTTGAGAAAGACCTGGGATCCTGGGTATTAAAAAGAAGATCTATTTATTTAGAGATCTGTTCTATTGTGATCTCTTATTAGGATCGCACTG',
    'CCCTGTGGATAACAAGGATCCGGCTTTTAAGATCAACAACCTGGAAAGGATCATTAACTGTGAATGATCGGTGATCCTGGACCGTATAAGCTGGGATCAG',
    'AATGAGGGGTTATACACAACTCAAAAACTGAACAACAGTTGTTCTTTGGATAACTACCGGTTGATCCAAGCTTCCTGACAGAGTTATCCACAGTAGATCG',
    'CACGATCTGTATACTTATTTGAGTAAATTAACCCACGATCCCAGCCATTCTTCTGCCGGATCTTCCGGAATGTCGTGATCAAGAATGTTGATCTTCAGTG',
    'TTTCGCCTGTCTGTTTTGCACCGGAATTTTTGAGTTCTGCCTCGAGTTTATCGATAGCCCCACAAAAGGTGTCATATTCACGACTGCCAATACCGATTGC',
    'GCCAAAGCGGACTGCAGAAAGATCGGGCTTCTGTTCCTGCAATGCTTCATAGAAAGGAGAAAGGTTGTCCGGAATATCTCCGGCACCGTGGGTGGAGCTG',
    'ATAACCAGCCAGATCCCTGAGGCAGGTAAATCTTCTAACAGCGGACCGTGCAGCGTTTCGGTGGTAAAACCCGCCTCTTCCAGCTTTTCAGCCAGGTGTT',
    'CTGCTACATATTCGGCACCGCCGAGGGTGCTGCCGCTGATAAGAGTGATATCTGCCATAAACCGCCACCTTTATTAAGAGTGGCGTATTGTACGCTGTGA',
    'ACGCGTTGGGATCTACCTGTGGAAAAGTATGGGATTAAAAAAGCCGATCAGGGCTTGATGGTACGCATGATCGGGTTTTGCAGGACGATCAATGTCTCGG',
    'TGGACTGAATTTCATCAATTGTTTGGATCTTGTTGATAAGTACATGCTGGAGAGCGTCGATCGAACGGCACATCACTTTTATAAAGATGCTGTAGTGGCC',
    'GGTTGTGTAATAGGCTTCAGTGACTTCATCAAGGCTTTCCAGCTTTGCCAGCGCGGAAGGGTAGTCTTTGGCGCTCTTTAATATAATGCCGATAAAGCAG',
    'CCTACGTCATAACCGAGCTGCTTCGGGCTGACATCAATACGCGCCCCGGTAATGATCCCCGCCTGCTTCATTTTCTCTACTCGAACGTGAATCGTCCCCG',
    'GACTGACGCCAAATTGTTTCGCCAGTTCGGCGTAAGCGGTGCGCGCATTGCCCATTAATGCTTCCAGGATGCCACGGTCCAGATTGTCGATCAGATAATT',
    'TTCCATAGGATTTTCTTATGCGGATTGATGATTCATTCTATTTTAGCCTTCTTTTTTAATGAATCAAAAGTGAGTTAGGCTTTTTATTGAATGATTATTG',
    'CATGTGTGTCGGTTTTTGTTGCTTAATCATAAGCAACAGGACGCAGGAGTATAAAAAATGAAAACCGCTTACATTGCCAAACAACGTCAAATTAGCTTCG',
    'TGAAATCTCACTTTTCTCGTCAACTGGAAGAACGTCTGGGGCTGATCGAAGTCCAGGCGCCGATTCTTAGCCGTGTGGGGGATGGCACGCAGGATAACTT',
    'GTCGGGCTGTGAAAAAGCGGTGCAGGTAAAAGTGAAAGCTCTGCCTGATGCCCAGTTCGAAGTGGTTCATTCACTGGCGAAGTGGAAACGTCAGACCTTA',
    'GGGCAACACGACTTCAGCGCGGGCGAAGGGCTGTACACGCACATGAAAGCCCTTCGCCCCGATGAAGACCGTCTTTCTCCGTTGCACTCGGTCTATGTTG',
    'ACCAGTGGGACTGGGAACGCGTAATGGGCGACGGTGAGCGTCAATTCTCGACTCTGAAAAGCACGGTAGAGGCGATCTGGGCGGGAATTAAAGCAACCGA',
    'AGCTGCGGTTAGCGAAGAGTTTGGCCTGGCACCGTTCCTGCCGGATCAGATCCACTTCGTACACAGCCAGGAGTTACTGTCTCGTTATCCGGATCTTGAT',
    'GCCAAAGGGCGTGAGCGGGCGATAGCGAAAGATCTTGGCGCGGTATTCCTTGTCGGGATTGGCGGCAAGCTGAGCGATGGTCATCGCCACGACGTGCGCG',
    'CACCGGATTATGATGACTGGAGCACCCCGTCAGAGCTGGGCCATGCGGGTCTGAACGGCGATATTCTGGTGTGGAACCCGGTACTGGAAGATGCGTTTGA',
    'GCTTTCCTCCATGGGGATCCGTGTAGATGCCGACACGCTGAAGCATCAACTGGCGCTGACCGGTGACGAAGATCGCCTGGAGCTGGAGTGGCATCAGGCG',
    'CTGCTGCGCGGTGAAATGCCGCAGACCATCGGCGGCGGTATCGGCCAGTCTCGTTTGACTATGCTGCTGCTGCAACTGCCGCATATCGGCCAGGTTCAGT',
    'GTGGAGTATGGCCAGCTGCTGTTCGCGAGAGCGTCCCTTCTCTGCTGTAATAATTTATCGCCGCCAGCGTCTGAGCAGGCGGCTTCGCATCCCGGTATCA',
    'AAGCGCCAGATATGATCGAAAATGCGCATGATGCCGGGTTTGCCGTGTGCCGACATCGCCACGGCATGAAAGCGATGCTGATGTACCCGCTGCAGCTCTT',
    'TCACTTTACTCGTCACGTCGTCAGGCAACCGCTGAGCGATAAAATCAGAAATCACCACCGCATCGGCATCAAACCATTCCCTGCTTTGCAAGCGTTCCAT',
    'AATGGCGCGAAAACAACTGGCAAGATCGGTGCCGCCACGAAACTGCTGGCTTAAAAAACGGATTGCTTGTTCGATGCCTTGTGGGCCTGAAAGCTCATAA',
    'CGGACGATCTCGGTGGAAAATAGCATAATATAGCAGCGCCGGTTTTCTGCGAGAGCAATGCGCATCAAGGCCAGGCAGAACGCTTTCGCACACTGTTCAT'
  ].join('');

  var PRESETS = [
    {
      id: 'ecoli',
      label: 'E. coli, 6,000 nt around the skew minimum',
      genome: ECOLI_EXCERPT,
      offset: ECOLI_EXCERPT_OFFSET,
      note: 'This is Genome = positions 3,920,620 to 3,926,619 of the E. coli genome. Add 3,920,620 to a position below to get its position in the whole genome.'
    },
    {
      id: 'book',
      label: 'The book’s example, CATGGGCATCGGCCATACGCC',
      genome: 'CATGGGCATCGGCCATACGCC',
      offset: 0,
      note: 'The DNA string from the skew diagram figure in this lesson.'
    },
    {
      id: 'ba1f',
      label: 'Minimum Skew sample dataset',
      genome: 'CCTATCGGTGGATTAGCATGTCCCTGTACGTTTCGCCGCGAACTAGTTCACACGGCTTGATGGCAAATGGTTTTTCCGGCGACCGTAATCGTCCACCGAGATGTTAGCTTGCCATTGACGGCACATGGTTTT',
      offset: 0,
      note: 'The sample dataset for the Minimum Skew Problem code challenge (expected output: 53 97).'
    }
  ];

  /* ---------- Algorithm core (pure functions) ---------- */

  // Cleans pasted text into a DNA string: drops FASTA header lines, removes whitespace, uppercases.
  // Returns { ok: true, genome } or { ok: false, error } with a plain-language message.
  function normalizeGenome(rawText, maxLength) {
    var lines = String(rawText).split(/\r?\n/);
    var keptLines = [];
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      var line = lines[lineIndex];
      if (line.trim().charAt(0) !== '>') {
        keptLines.push(line);
      }
    }
    var genome = keptLines.join('').replace(/\s+/g, '').toUpperCase();
    if (genome.length === 0) {
      return { ok: false, error: 'Paste a DNA string made of the letters A, C, G and T.' };
    }
    if (genome.length > maxLength) {
      return {
        ok: false,
        error: 'That string has ' + formatInteger(genome.length) + ' nucleotides; this widget handles at most ' + formatInteger(maxLength) + '.'
      };
    }
    var badPosition = findFirstNonNucleotide(genome);
    if (badPosition !== -1) {
      return {
        ok: false,
        error: 'Found “' + genome.charAt(badPosition) + '” at position ' + formatInteger(badPosition) + ' (counting from 0, ignoring spaces); only A, C, G and T are allowed.'
      };
    }
    return { ok: true, genome: genome };
  }

  function findFirstNonNucleotide(genome) {
    for (var position = 0; position < genome.length; position++) {
      if ('ACGT'.indexOf(genome.charAt(position)) === -1) {
        return position;
      }
    }
    return -1;
  }

  // The change in skew contributed by one nucleotide: +1 for G, -1 for C, 0 otherwise.
  function skewIncrement(nucleotide) {
    if (nucleotide === 'G') {
      return 1;
    }
    if (nucleotide === 'C') {
      return -1;
    }
    return 0;
  }

  // Returns the array Skew_0, Skew_1, ..., Skew_|Genome|, where Skew_i is the number of G minus
  // the number of C in the first i nucleotides of Genome (so Skew_0 = 0).
  function skewArray(genome) {
    var skew = new Array(genome.length + 1);
    skew[0] = 0;
    for (var position = 0; position < genome.length; position++) {
      skew[position + 1] = skew[position] + skewIncrement(genome.charAt(position));
    }
    return skew;
  }

  function minimumValue(values) {
    var smallest = values[0];
    for (var index = 1; index < values.length; index++) {
      if (values[index] < smallest) {
        smallest = values[index];
      }
    }
    return smallest;
  }

  function maximumValue(values) {
    var largest = values[0];
    for (var index = 1; index < values.length; index++) {
      if (values[index] > largest) {
        largest = values[index];
      }
    }
    return largest;
  }

  // Minimum Skew Problem: all integers i (from 0 to |Genome|) minimizing Skew_i(Genome).
  function minimumSkewPositions(skew) {
    var smallest = minimumValue(skew);
    var positions = [];
    for (var i = 0; i < skew.length; i++) {
      if (skew[i] === smallest) {
        positions.push(i);
      }
    }
    return positions;
  }

  function minimumSkew(genome) {
    return minimumSkewPositions(skewArray(genome));
  }

  // One sentence explaining how Skew_{i+1} follows from Skew_i (the book's recurrence).
  function describeSkewStep(genome, skew, position) {
    var nucleotide = genome.charAt(position);
    var increment = skewIncrement(nucleotide);
    var current = 'Skew' + subscriptDigits(position);
    var next = 'Skew' + subscriptDigits(position + 1);
    var before = current + ' = ' + formatSigned(skew[position]);
    var head = 'Position ' + position + ' of Genome is ' + nucleotide + ', so ' + next + ' = ' + current;
    if (increment === 1) {
      return head + ' + 1 = ' + formatSigned(skew[position + 1]) + ' (' + before + ').';
    }
    if (increment === -1) {
      return head + ' − 1 = ' + formatSigned(skew[position + 1]) + ' (' + before + ').';
    }
    return head + ' = ' + formatSigned(skew[position + 1]) + ' (' + before + '; only G and C change the skew).';
  }

  // Summarizes the skew array for drawing: one bucket per pixel column, each with the minimum and
  // maximum skew among the positions i that fall into that column.
  function skewEnvelope(skew, columnCount) {
    var lastIndex = skew.length - 1;
    var buckets = [];
    for (var column = 0; column < columnCount; column++) {
      var first = Math.floor((column * lastIndex) / columnCount);
      var last = Math.floor(((column + 1) * lastIndex) / columnCount);
      var low = skew[first];
      var high = skew[first];
      for (var i = first + 1; i <= last; i++) {
        if (skew[i] < low) {
          low = skew[i];
        }
        if (skew[i] > high) {
          high = skew[i];
        }
      }
      buckets.push({ first: first, last: last, low: low, high: high });
    }
    return buckets;
  }

  // Chooses a handful of round tick values between low and high (inclusive).
  function niceTicks(low, high, targetCount) {
    var span = high - low;
    if (span <= 0) {
      return [low];
    }
    var rawStep = span / Math.max(1, targetCount);
    var magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var step = magnitude * 10;
    var multipliers = [5, 2, 1];
    for (var index = 0; index < multipliers.length; index++) {
      if (magnitude * multipliers[index] >= rawStep) {
        step = magnitude * multipliers[index];
      }
    }
    step = Math.max(1, step);
    var ticks = [];
    var tick = Math.ceil(low / step) * step;
    while (tick <= high) {
      ticks.push(tick === 0 ? 0 : tick);
      tick += step;
    }
    return ticks;
  }

  function formatSigned(value) {
    if (value < 0) {
      return '−' + Math.abs(value);
    }
    return String(value);
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

  function readToken(element, name, fallback) {
    var value = window.getComputedStyle(element).getPropertyValue(name).trim();
    if (value) {
      return value;
    }
    return fallback;
  }

  function readPalette(element) {
    return {
      paper: readToken(element, '--paper', '#ffffff'),
      ink: readToken(element, '--ink', '#1d2233'),
      muted: readToken(element, '--muted', '#5b6275'),
      line: readToken(element, '--line', '#e3e5ec'),
      teal: readToken(element, '--teal', '#3f9a8c'),
      orange: readToken(element, '--orange', '#e1a64a'),
      navy: readToken(element, '--navy', '#2c365e'),
      g: readToken(element, '--nt-g', '#ff4363'),
      c: readToken(element, '--nt-c', '#64b0f4'),
      uiFont: readToken(element, '--ui', 'system-ui, sans-serif'),
      monoFont: readToken(element, '--mono', 'ui-monospace, monospace')
    };
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function SkewWidget(mount, instanceNumber) {
    this.mount = mount;
    this.idPrefix = 'w-skew-' + instanceNumber + '-';
    this.genome = '';
    this.skew = [0];
    this.minima = [0];
    this.offset = 0;
    this.cursor = 0;
    this.stepCount = 0;
    this.playTimer = null;
    this.envelopeCache = null;
    this.build();
    this.loadPreset(PRESETS[0]);
    this.watchTheme();
  }

  SkewWidget.prototype.build = function () {
    var body = this.mount.querySelector('.w-skew-body');
    if (!body) {
      body = createElement('div', 'w-skew-body');
      var foot = this.mount.querySelector('.widget-foot');
      this.mount.insertBefore(body, foot);
    }
    var noscript = this.mount.querySelector('noscript');
    if (noscript) {
      noscript.parentNode.removeChild(noscript);
    }
    this.buildInputs(body);
    this.buildChart(body);
    this.buildStepper(body);
  };

  SkewWidget.prototype.buildInputs = function (body) {
    var self = this;
    var controls = createElement('div', 'w-skew-controls');

    var presetLabel = createElement('label', 'w-skew-label', 'Example');
    var presetSelect = createElement('select', 'w-skew-select');
    presetSelect.id = this.idPrefix + 'preset';
    presetLabel.htmlFor = presetSelect.id;
    for (var index = 0; index < PRESETS.length; index++) {
      var option = createElement('option', '', PRESETS[index].label);
      option.value = PRESETS[index].id;
      presetSelect.appendChild(option);
    }
    var customOption = createElement('option', '', 'Your own sequence');
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

    var textLabel = createElement('label', 'w-skew-label', 'Genome (paste up to 200,000 nucleotides; spaces and line breaks are ignored)');
    var textArea = createElement('textarea', 'w-skew-text');
    textArea.id = this.idPrefix + 'genome';
    textArea.rows = 3;
    textArea.spellcheck = false;
    textArea.setAttribute('autocomplete', 'off');
    textLabel.htmlFor = textArea.id;

    var drawButton = createButton('Draw skew diagram');
    drawButton.addEventListener('click', function () {
      presetSelect.value = 'custom';
      self.loadText(textArea.value, 0, 'Your sequence.');
    });

    var message = createElement('p', 'w-skew-message');
    message.setAttribute('role', 'alert');

    controls.appendChild(presetLabel);
    controls.appendChild(presetSelect);
    controls.appendChild(textLabel);
    controls.appendChild(textArea);
    var row = createElement('div', 'w-skew-row');
    row.appendChild(drawButton);
    controls.appendChild(row);
    controls.appendChild(message);
    body.appendChild(controls);

    this.presetSelect = presetSelect;
    this.textArea = textArea;
    this.message = message;
  };

  SkewWidget.prototype.buildChart = function (body) {
    var self = this;
    var section = createElement('div', 'w-skew-section');
    section.appendChild(createElement('h3', 'w-skew-subhead', 'Skew diagram'));
    var note = createElement('p', 'w-skew-note');
    section.appendChild(note);

    var chartBox = createElement('div', 'w-skew-chart');
    var canvas = createElement('canvas', 'w-skew-canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    chartBox.appendChild(canvas);
    section.appendChild(chartBox);

    var hint = createElement('p', 'w-skew-hint', 'Hover or drag across the diagram to read Skewᵢ. On the diagram, the arrow keys move one position, Page Up and Page Down move faster, Home and End jump to the ends.');
    section.appendChild(hint);

    var readout = createElement('p', 'w-skew-readout');
    section.appendChild(readout);

    var minimaLine = createElement('p', 'w-skew-minima');
    section.appendChild(minimaLine);

    var minimaButtons = createElement('div', 'w-skew-row');
    var previousMinimum = createButton('Previous minimum');
    var nextMinimum = createButton('Next minimum');
    previousMinimum.addEventListener('click', function () {
      self.jumpToMinimum(-1);
    });
    nextMinimum.addEventListener('click', function () {
      self.jumpToMinimum(1);
    });
    minimaButtons.appendChild(previousMinimum);
    minimaButtons.appendChild(nextMinimum);
    section.appendChild(minimaButtons);

    // The readout above is what sighted readers see; this hidden twin is announced to screen readers
    // after keyboard moves, button presses and new data, but not on every mouse move.
    var status = createElement('p', 'w-skew-visually-hidden');
    status.setAttribute('aria-live', 'polite');
    section.appendChild(status);

    body.appendChild(section);

    canvas.addEventListener('pointerdown', function (event) {
      self.dragging = true;
      self.setCursorFromPointer(event);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'mouse' || self.dragging) {
        self.setCursorFromPointer(event);
      }
    });
    window.addEventListener('pointerup', function () {
      self.dragging = false;
    });
    canvas.addEventListener('keydown', function (event) {
      self.handleChartKey(event);
    });

    this.chartBox = chartBox;
    this.canvas = canvas;
    this.note = note;
    this.readout = readout;
    this.minimaLine = minimaLine;
    this.status = status;
  };

  SkewWidget.prototype.buildStepper = function (body) {
    var self = this;
    var section = createElement('div', 'w-skew-section');
    section.appendChild(createElement('h3', 'w-skew-subhead', 'Walk the first 40 nucleotides'));
    section.appendChild(createElement('p', 'w-skew-note', 'Start at Skew₀ = 0 and read Genome one nucleotide at a time: G adds 1, C subtracts 1, A and T change nothing.'));

    var tableBox = createElement('div', 'w-skew-steps');
    var table = createElement('table', 'w-skew-table');
    tableBox.appendChild(table);
    section.appendChild(tableBox);

    var buttons = createElement('div', 'w-skew-row');
    var stepButton = createButton('Step');
    var playButton = createButton('Play');
    var resetButton = createButton('Reset');
    stepButton.addEventListener('click', function () {
      self.stopPlaying();
      self.advanceStep();
    });
    playButton.addEventListener('click', function () {
      self.togglePlaying();
    });
    resetButton.addEventListener('click', function () {
      self.stopPlaying();
      self.setStepCount(0);
    });
    buttons.appendChild(stepButton);
    buttons.appendChild(playButton);
    buttons.appendChild(resetButton);
    section.appendChild(buttons);

    var stepStatus = createElement('p', 'w-skew-status');
    stepStatus.setAttribute('aria-live', 'polite');
    section.appendChild(stepStatus);

    body.appendChild(section);

    this.stepTable = table;
    this.stepButton = stepButton;
    this.playButton = playButton;
    this.stepStatus = stepStatus;
  };

  function findPreset(presetId) {
    for (var index = 0; index < PRESETS.length; index++) {
      if (PRESETS[index].id === presetId) {
        return PRESETS[index];
      }
    }
    return null;
  }

  SkewWidget.prototype.loadPreset = function (preset) {
    this.presetSelect.value = preset.id;
    this.textArea.value = preset.genome;
    this.loadText(preset.genome, preset.offset, preset.note);
  };

  SkewWidget.prototype.loadText = function (rawText, offset, noteText) {
    var result = normalizeGenome(rawText, MAX_GENOME_LENGTH);
    if (!result.ok) {
      this.message.textContent = result.error;
      return;
    }
    this.message.textContent = '';
    this.stopPlaying();
    this.genome = result.genome;
    this.skew = skewArray(this.genome);
    this.minima = minimumSkewPositions(this.skew);
    this.offset = offset;
    this.envelopeCache = null;
    this.note.textContent = noteText + ' |Genome| = ' + formatInteger(this.genome.length) + ', so i ranges from 0 to ' + formatInteger(this.genome.length) + '.';
    this.renderMinima();
    this.cursor = this.minima[0];
    this.buildStepTable();
    this.setStepCount(0);
    this.updateCursor(false);
    this.status.textContent = 'Drew the skew diagram of ' + formatInteger(this.genome.length) + ' nucleotides. ' + this.minimaSentence();
  };

  SkewWidget.prototype.minimaSentence = function () {
    var smallest = this.skew[this.minima[0]];
    var count = this.minima.length;
    var listed = this.minima.slice(0, MAX_LISTED_MINIMA).join(' ');
    var more = '';
    if (count > MAX_LISTED_MINIMA) {
      more = ' … and ' + formatInteger(count - MAX_LISTED_MINIMA) + ' more';
    }
    var noun = count === 1 ? 'position' : 'positions';
    return 'The minimum skew is ' + formatSigned(smallest) + ', attained at ' + count + ' ' + noun + ' i = ' + listed + more + '.';
  };

  SkewWidget.prototype.renderMinima = function () {
    var text = 'Minimum Skew Problem output: ' + this.minima.slice(0, MAX_LISTED_MINIMA).join(' ');
    if (this.minima.length > MAX_LISTED_MINIMA) {
      text += ' … (' + formatInteger(this.minima.length) + ' positions in all)';
    }
    text += '. ' + this.minimaSentence();
    if (this.offset > 0) {
      var genomePositions = [];
      var shown = Math.min(this.minima.length, 10);
      for (var index = 0; index < shown; index++) {
        genomePositions.push(this.minima[index] + this.offset);
      }
      text += ' In the whole E. coli genome these are positions ' + genomePositions.join(' ') + ', the minimum reported in lesson 1.9.';
    }
    this.minimaLine.textContent = text;
    this.canvas.setAttribute('aria-label', 'Skew diagram of ' + formatInteger(this.genome.length) + ' nucleotides, ranging from ' + formatSigned(minimumValue(this.skew)) + ' to ' + formatSigned(maximumValue(this.skew)) + '. ' + this.minimaSentence());
  };

  SkewWidget.prototype.readoutText = function () {
    var i = this.cursor;
    var text = 'i = ' + formatInteger(i) + ', Skew' + subscriptDigits(i) + ' = ' + formatSigned(this.skew[i]);
    if (i > 0) {
      text += ' (the prefix of length ' + formatInteger(i) + ' ends with ' + this.genome.charAt(i - 1) + ' at position ' + formatInteger(i - 1) + ')';
    } else {
      text += ' (the empty prefix)';
    }
    if (this.offset > 0) {
      text += '; genome position ' + formatInteger(i + this.offset);
    }
    if (this.minima.indexOf(i) !== -1) {
      text += '. This is a minimum.';
    } else {
      text += '.';
    }
    return text;
  };

  SkewWidget.prototype.updateCursor = function (announce) {
    this.readout.textContent = this.readoutText();
    if (announce) {
      this.status.textContent = this.readout.textContent;
    }
    this.draw();
  };

  SkewWidget.prototype.setCursorFromPointer = function (event) {
    var layout = this.chartLayout();
    var rect = this.canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var fraction = (x - layout.left) / layout.plotWidth;
    fraction = Math.min(1, Math.max(0, fraction));
    this.cursor = Math.round(fraction * this.genome.length);
    this.updateCursor(false);
  };

  SkewWidget.prototype.handleChartKey = function (event) {
    var length = this.genome.length;
    var bigStep = Math.max(1, Math.round(length / 50));
    var next = this.cursor;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      next = this.cursor + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      next = this.cursor - 1;
    } else if (event.key === 'PageUp') {
      next = this.cursor + bigStep;
    } else if (event.key === 'PageDown') {
      next = this.cursor - bigStep;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = length;
    } else {
      return;
    }
    event.preventDefault();
    this.cursor = Math.min(length, Math.max(0, next));
    this.updateCursor(true);
  };

  SkewWidget.prototype.jumpToMinimum = function (direction) {
    var target = -1;
    if (direction > 0) {
      for (var index = 0; index < this.minima.length && target === -1; index++) {
        if (this.minima[index] > this.cursor) {
          target = this.minima[index];
        }
      }
      if (target === -1) {
        target = this.minima[0];
      }
    } else {
      for (var back = this.minima.length - 1; back >= 0 && target === -1; back--) {
        if (this.minima[back] < this.cursor) {
          target = this.minima[back];
        }
      }
      if (target === -1) {
        target = this.minima[this.minima.length - 1];
      }
    }
    this.cursor = target;
    this.updateCursor(true);
  };

  function subscriptDigits(value) {
    var subscripts = '₀₁₂₃₄₅₆₇₈₉';
    var digits = String(value);
    var result = '';
    for (var index = 0; index < digits.length; index++) {
      result += subscripts.charAt(Number(digits.charAt(index)));
    }
    return result;
  }

  /* ----- Stepper ----- */

  SkewWidget.prototype.stepperLength = function () {
    return Math.min(STEPPER_LENGTH, this.genome.length);
  };

  SkewWidget.prototype.buildStepTable = function () {
    var table = this.stepTable;
    table.textContent = '';
    var caption = createElement('caption', 'w-skew-visually-hidden', 'Skew after each of the first ' + this.stepperLength() + ' nucleotides');
    table.appendChild(caption);
    var rowNames = ['position', 'nucleotide', 'change', 'skew after'];
    this.stepCells = [];
    for (var rowIndex = 0; rowIndex < rowNames.length; rowIndex++) {
      var row = createElement('tr');
      var header = createElement('th', '', rowNames[rowIndex]);
      header.scope = 'row';
      row.appendChild(header);
      var startCell = createElement('td', 'w-skew-start');
      if (rowIndex === 3) {
        startCell.textContent = '0';
        startCell.title = 'Skew₀ = 0';
      }
      row.appendChild(startCell);
      var cells = [];
      for (var position = 0; position < this.stepperLength(); position++) {
        var cell = createElement('td');
        if (rowIndex === 0) {
          cell.textContent = String(position);
        }
        if (rowIndex === 1) {
          var nucleotide = this.genome.charAt(position);
          cell.textContent = nucleotide;
          cell.className = 'w-skew-nt w-skew-nt-' + nucleotide;
        }
        row.appendChild(cell);
        cells.push(cell);
      }
      table.appendChild(row);
      this.stepCells.push(cells);
    }
  };

  SkewWidget.prototype.setStepCount = function (stepCount) {
    this.stepCount = stepCount;
    var changeCells = this.stepCells[2];
    var skewCells = this.stepCells[3];
    for (var position = 0; position < this.stepperLength(); position++) {
      var revealed = position < stepCount;
      var increment = skewIncrement(this.genome.charAt(position));
      changeCells[position].textContent = revealed ? formatIncrement(increment) : '';
      skewCells[position].textContent = revealed ? formatSigned(this.skew[position + 1]) : '';
      for (var rowIndex = 0; rowIndex < this.stepCells.length; rowIndex++) {
        var cell = this.stepCells[rowIndex][position];
        toggleClass(cell, 'w-skew-current', position === stepCount - 1);
        toggleClass(cell, 'w-skew-pending', !revealed);
      }
    }
    this.stepButton.disabled = stepCount >= this.stepperLength();
    if (stepCount === 0) {
      this.stepStatus.textContent = 'Skew₀ = 0. Press Step to read the nucleotide at position 0.';
    } else {
      this.stepStatus.textContent = describeSkewStep(this.genome, this.skew, stepCount - 1);
      this.scrollCurrentIntoView();
    }
    if (stepCount > 0) {
      this.cursor = stepCount;
      this.updateCursor(false);
    }
  };

  SkewWidget.prototype.scrollCurrentIntoView = function () {
    var cell = this.stepCells[1][this.stepCount - 1];
    var box = cell.closest('.w-skew-steps');
    if (!box) {
      return;
    }
    var cellRight = cell.offsetLeft + cell.offsetWidth;
    if (cellRight > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = cellRight - box.clientWidth + 8;
    }
    if (cell.offsetLeft < box.scrollLeft) {
      box.scrollLeft = cell.offsetLeft - 8;
    }
  };

  SkewWidget.prototype.advanceStep = function () {
    if (this.stepCount < this.stepperLength()) {
      this.setStepCount(this.stepCount + 1);
      return true;
    }
    return false;
  };

  SkewWidget.prototype.togglePlaying = function () {
    if (this.playTimer !== null) {
      this.stopPlaying();
      return;
    }
    if (this.stepCount >= this.stepperLength()) {
      this.setStepCount(0);
    }
    var self = this;
    this.playButton.textContent = 'Pause';
    var delay = prefersReducedMotion() ? PLAY_DELAY_MS * 2 : PLAY_DELAY_MS;
    this.playTimer = window.setInterval(function () {
      if (!self.advanceStep()) {
        self.stopPlaying();
      }
    }, delay);
  };

  SkewWidget.prototype.stopPlaying = function () {
    if (this.playTimer !== null) {
      window.clearInterval(this.playTimer);
      this.playTimer = null;
    }
    if (this.playButton) {
      this.playButton.textContent = 'Play';
    }
  };

  function formatIncrement(increment) {
    if (increment > 0) {
      return '+1';
    }
    if (increment < 0) {
      return '−1';
    }
    return '0';
  }

  function toggleClass(element, className, on) {
    if (on) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  }

  /* ----- Chart drawing ----- */

  SkewWidget.prototype.chartLayout = function () {
    var width = Math.max(240, this.chartBox.clientWidth);
    var height = width < 480 ? 200 : 260;
    var left = 46;
    var right = 24;
    var top = 14;
    var bottom = 34;
    return {
      width: width,
      height: height,
      left: left,
      top: top,
      plotWidth: width - left - right,
      plotHeight: height - top - bottom
    };
  };

  SkewWidget.prototype.draw = function () {
    if (!this.canvas || this.genome.length === 0) {
      return;
    }
    var layout = this.chartLayout();
    var ratio = window.devicePixelRatio || 1;
    this.canvas.style.width = layout.width + 'px';
    this.canvas.style.height = layout.height + 'px';
    this.canvas.width = Math.round(layout.width * ratio);
    this.canvas.height = Math.round(layout.height * ratio);
    var context = this.canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    var palette = readPalette(this.mount);

    context.fillStyle = palette.paper;
    context.fillRect(0, 0, layout.width, layout.height);

    var low = Math.min(0, minimumValue(this.skew));
    var high = Math.max(0, maximumValue(this.skew));
    if (high === low) {
      high = low + 1;
    }
    var padding = Math.max(1, Math.round((high - low) * 0.06));
    var scale = {
      layout: layout,
      low: low - padding,
      high: high + padding,
      length: this.genome.length
    };

    this.drawAxes(context, scale, palette);
    if (this.genome.length <= layout.plotWidth / 3) {
      this.drawColoredPath(context, scale, palette);
    } else {
      this.drawEnvelope(context, scale, palette);
    }
    this.drawMinima(context, scale, palette);
    this.drawCursor(context, scale, palette);
  };

  function xForPosition(scale, i) {
    return scale.layout.left + (i / Math.max(1, scale.length)) * scale.layout.plotWidth;
  }

  function yForSkew(scale, value) {
    var fraction = (value - scale.low) / (scale.high - scale.low);
    return scale.layout.top + (1 - fraction) * scale.layout.plotHeight;
  }

  SkewWidget.prototype.drawAxes = function (context, scale, palette) {
    var layout = scale.layout;
    context.font = '12px ' + palette.uiFont;
    context.lineWidth = 1;

    var yTicks = niceTicks(Math.ceil(scale.low), Math.floor(scale.high), 6);
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (var index = 0; index < yTicks.length; index++) {
      var y = Math.round(yForSkew(scale, yTicks[index])) + 0.5;
      context.strokeStyle = palette.line;
      context.setLineDash(yTicks[index] === 0 ? [4, 3] : []);
      if (yTicks[index] === 0) {
        context.strokeStyle = palette.muted;
      }
      context.beginPath();
      context.moveTo(layout.left, y);
      context.lineTo(layout.left + layout.plotWidth, y);
      context.stroke();
      context.fillStyle = palette.muted;
      context.fillText(formatSigned(yTicks[index]), layout.left - 6, y);
    }
    context.setLineDash([]);

    var xTicks = niceTicks(0, scale.length, layout.plotWidth < 360 ? 3 : 6);
    context.textAlign = 'center';
    context.textBaseline = 'top';
    var baseline = layout.top + layout.plotHeight;
    for (var tickIndex = 0; tickIndex < xTicks.length; tickIndex++) {
      var x = Math.round(xForPosition(scale, xTicks[tickIndex])) + 0.5;
      context.strokeStyle = palette.muted;
      context.beginPath();
      context.moveTo(x, baseline);
      context.lineTo(x, baseline + 4);
      context.stroke();
      context.fillStyle = palette.muted;
      context.fillText(formatInteger(xTicks[tickIndex]), x, baseline + 6);
    }
    context.strokeStyle = palette.muted;
    context.strokeRect(layout.left + 0.5, layout.top + 0.5, layout.plotWidth, layout.plotHeight);
  };

  // For short strings, one segment per nucleotide, colored like the book's figure: rising on G,
  // falling on C, flat on A or T.
  SkewWidget.prototype.drawColoredPath = function (context, scale, palette) {
    context.lineWidth = 2.5;
    for (var position = 0; position < this.genome.length; position++) {
      var increment = skewIncrement(this.genome.charAt(position));
      context.strokeStyle = colorForIncrement(increment, palette);
      context.beginPath();
      context.moveTo(xForPosition(scale, position), yForSkew(scale, this.skew[position]));
      context.lineTo(xForPosition(scale, position + 1), yForSkew(scale, this.skew[position + 1]));
      context.stroke();
    }
    var radius = this.genome.length <= 60 ? 3 : 0;
    if (radius === 0) {
      return;
    }
    for (var i = 0; i <= this.genome.length; i++) {
      var dotIncrement = i === 0 ? 0 : skewIncrement(this.genome.charAt(i - 1));
      context.fillStyle = colorForIncrement(dotIncrement, palette);
      context.beginPath();
      context.arc(xForPosition(scale, i), yForSkew(scale, this.skew[i]), radius, 0, Math.PI * 2);
      context.fill();
    }
  };

  function colorForIncrement(increment, palette) {
    if (increment > 0) {
      return palette.g;
    }
    if (increment < 0) {
      return palette.c;
    }
    return palette.ink;
  }

  // For long strings, one vertical min-to-max stroke per pixel column so no extreme is lost.
  SkewWidget.prototype.drawEnvelope = function (context, scale, palette) {
    var columns = Math.max(1, Math.floor(scale.layout.plotWidth));
    if (!this.envelopeCache || this.envelopeCache.columns !== columns) {
      this.envelopeCache = { columns: columns, buckets: skewEnvelope(this.skew, columns) };
    }
    var buckets = this.envelopeCache.buckets;
    context.strokeStyle = palette.ink;
    context.lineWidth = 1.5;
    context.beginPath();
    for (var column = 0; column < buckets.length; column++) {
      var x = scale.layout.left + column + 0.5;
      var yLow = yForSkew(scale, buckets[column].low);
      var yHigh = yForSkew(scale, buckets[column].high);
      if (column === 0) {
        context.moveTo(x, yHigh);
      } else {
        context.lineTo(x, yHigh);
      }
      context.lineTo(x, yLow);
    }
    context.stroke();
  };

  SkewWidget.prototype.drawMinima = function (context, scale, palette) {
    var smallest = this.skew[this.minima[0]];
    var y = yForSkew(scale, smallest);
    context.strokeStyle = palette.teal;
    context.fillStyle = palette.teal;
    context.lineWidth = 1;
    for (var index = 0; index < this.minima.length; index++) {
      var x = xForPosition(scale, this.minima[index]);
      context.globalAlpha = 0.5;
      context.beginPath();
      context.moveTo(x, scale.layout.top);
      context.lineTo(x, scale.layout.top + scale.layout.plotHeight);
      context.stroke();
      context.globalAlpha = 1;
      context.beginPath();
      context.moveTo(x, y + 5);
      context.lineTo(x - 5, y + 13);
      context.lineTo(x + 5, y + 13);
      context.closePath();
      context.fill();
    }
  };

  SkewWidget.prototype.drawCursor = function (context, scale, palette) {
    var x = xForPosition(scale, this.cursor);
    var y = yForSkew(scale, this.skew[this.cursor]);
    context.strokeStyle = palette.orange;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, scale.layout.top);
    context.lineTo(x, scale.layout.top + scale.layout.plotHeight);
    context.stroke();
    context.fillStyle = palette.paper;
    context.strokeStyle = palette.ink;
    context.beginPath();
    context.arc(x, y, 4.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };

  SkewWidget.prototype.watchTheme = function () {
    var self = this;
    var redraw = function () {
      self.draw();
    };
    if (window.matchMedia) {
      var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (darkQuery.addEventListener) {
        darkQuery.addEventListener('change', redraw);
      } else if (darkQuery.addListener) {
        darkQuery.addListener(redraw);
      }
    }
    if (window.MutationObserver) {
      var observer = new MutationObserver(redraw);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    }
    if (window.ResizeObserver) {
      var lastWidth = 0;
      var resizeObserver = new ResizeObserver(function () {
        var width = self.chartBox.clientWidth;
        if (width !== lastWidth) {
          lastWidth = width;
          self.draw();
        }
      });
      resizeObserver.observe(this.chartBox);
    } else {
      window.addEventListener('resize', redraw);
    }
  };

  function initAll() {
    var mounts = document.querySelectorAll('[data-widget="' + WIDGET_ID + '"]');
    for (var index = 0; index < mounts.length; index++) {
      if (!mounts[index].hasAttribute('data-widget-ready')) {
        mounts[index].setAttribute('data-widget-ready', 'true');
        new SkewWidget(mounts[index], index);
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
      MAX_GENOME_LENGTH: MAX_GENOME_LENGTH,
      PRESETS: PRESETS,
      ECOLI_EXCERPT_OFFSET: ECOLI_EXCERPT_OFFSET,
      normalizeGenome: normalizeGenome,
      skewIncrement: skewIncrement,
      skewArray: skewArray,
      minimumSkewPositions: minimumSkewPositions,
      minimumSkew: minimumSkew,
      describeSkewStep: describeSkewStep,
      skewEnvelope: skewEnvelope,
      niceTicks: niceTicks,
      formatSigned: formatSigned
    };
  }
})();
