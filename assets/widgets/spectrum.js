/* Theoretical spectrum widget (Chapter 4, lesson 4.4).
   Pure algorithm core first, then the browser UI. No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Algorithm core (pure functions, exported for tests)
     ------------------------------------------------------------------ */

  // The book's integer mass table (I/L both 113, K/Q both 128).
  var INTEGER_MASS = {
    G: 57, A: 71, S: 87, P: 97, V: 99, T: 101, C: 103, I: 113, L: 113, N: 114,
    D: 115, K: 128, Q: 128, E: 129, M: 131, H: 137, F: 147, R: 156, Y: 163, W: 186
  };

  var MAX_PEPTIDE_LENGTH = 20;

  function validatePeptide(rawText) {
    var text = String(rawText == null ? '' : rawText).replace(/\s+/g, '').toUpperCase();
    if (text.length === 0) {
      return { ok: false, peptide: '', error: 'Type a peptide using one-letter amino acid codes, such as NQEL.' };
    }
    if (text.length > MAX_PEPTIDE_LENGTH) {
      return { ok: false, peptide: '', error: 'Please keep the peptide to at most ' + MAX_PEPTIDE_LENGTH + ' amino acids (yours has ' + text.length + ').' };
    }
    var badLetters = [];
    for (var index = 0; index < text.length; index += 1) {
      var letter = text[index];
      if (!Object.prototype.hasOwnProperty.call(INTEGER_MASS, letter) && badLetters.indexOf(letter) === -1) {
        badLetters.push(letter);
      }
    }
    if (badLetters.length > 0) {
      return { ok: false, peptide: '', error: '"' + badLetters.join('", "') + '" is not one of the 20 amino acid letters (G A S P V T C I L N D K Q E M H F R Y W).' };
    }
    return { ok: true, peptide: text, error: '' };
  }

  function residueMasses(peptide) {
    var masses = [];
    for (var index = 0; index < peptide.length; index += 1) {
      masses.push(INTEGER_MASS[peptide[index]]);
    }
    return masses;
  }

  function sumOf(numbers) {
    var total = 0;
    for (var index = 0; index < numbers.length; index += 1) {
      total += numbers[index];
    }
    return total;
  }

  // PrefixMass(0) = 0 and PrefixMass(i) = PrefixMass(i - 1) + mass of residue i.
  function prefixMasses(masses) {
    var prefix = [0];
    for (var index = 0; index < masses.length; index += 1) {
      prefix.push(prefix[index] + masses[index]);
    }
    return prefix;
  }

  // Letters of the subpeptide that starts at `start` and has `length`
  // residues, reading around the ring if it wraps past the end.
  function cyclicSlice(peptide, start, length) {
    var letters = '';
    for (var offset = 0; offset < length; offset += 1) {
      letters += peptide[(start + offset) % peptide.length];
    }
    return letters;
  }

  function makeEntry(peptide, start, length, mass, formula, prefixIndices) {
    return {
      start: start,
      length: length,
      label: cyclicSlice(peptide, start, length),
      mass: mass,
      formula: formula,
      prefixIndices: prefixIndices
    };
  }

  // Every subpeptide in the order that the PrefixMass algorithm generates
  // it (the empty peptide first). Cyclic mode adds the wrap-around pieces
  // as the complement Mass(Peptide) - (PrefixMass(j) - PrefixMass(i)).
  function subpeptidesInGenerationOrder(peptide, isCyclic) {
    var prefix = prefixMasses(residueMasses(peptide));
    var length = peptide.length;
    var peptideMass = prefix[length];
    var entries = [makeEntry(peptide, 0, 0, 0, 'the empty peptide "" has Mass = 0', [])];
    for (var i = 0; i < length; i += 1) {
      for (var j = i + 1; j <= length; j += 1) {
        var inside = prefix[j] - prefix[i];
        var linearFormula = 'PrefixMass(' + j + ') − PrefixMass(' + i + ') = ' + prefix[j] + ' − ' + prefix[i] + ' = ' + inside;
        entries.push(makeEntry(peptide, i, j - i, inside, linearFormula, [i, j]));
        if (isCyclic && i > 0 && j < length) {
          var wrapped = peptideMass - inside;
          var wrapFormula = 'Mass(Peptide) − (PrefixMass(' + j + ') − PrefixMass(' + i + ')) = ' + peptideMass + ' − ' + inside + ' = ' + wrapped;
          entries.push(makeEntry(peptide, j, length - (j - i), wrapped, wrapFormula, [i, j]));
        }
      }
    }
    return entries;
  }

  function compareEntries(first, second) {
    if (first.mass !== second.mass) {
      return first.mass - second.mass;
    }
    if (first.length !== second.length) {
      return first.length - second.length;
    }
    return first.start - second.start;
  }

  function sortedEntries(entries) {
    var copy = entries.slice();
    copy.sort(compareEntries);
    return copy;
  }

  function massesOf(entries) {
    var masses = [];
    for (var index = 0; index < entries.length; index += 1) {
      masses.push(entries[index].mass);
    }
    return masses;
  }

  function sortedNumbers(numbers) {
    var copy = numbers.slice();
    copy.sort(function (first, second) { return first - second; });
    return copy;
  }

  function linearSpectrum(peptide) {
    return sortedNumbers(massesOf(subpeptidesInGenerationOrder(peptide, false)));
  }

  function cyclicSpectrum(peptide) {
    return sortedNumbers(massesOf(subpeptidesInGenerationOrder(peptide, true)));
  }

  // Groups a sorted spectrum into {mass, count} pairs for the stick plot.
  function multiplicities(sortedMasses) {
    var groups = [];
    for (var index = 0; index < sortedMasses.length; index += 1) {
      var mass = sortedMasses[index];
      var last = groups[groups.length - 1];
      if (last && last.mass === mass) {
        last.count += 1;
      } else {
        groups.push({ mass: mass, count: 1 });
      }
    }
    return groups;
  }

  // Residue positions covered by a subpeptide (indices into the peptide).
  function coveredPositions(entry, peptideLength) {
    var positions = [];
    for (var offset = 0; offset < entry.length; offset += 1) {
      positions.push((entry.start + offset) % peptideLength);
    }
    return positions;
  }

  var core = {
    INTEGER_MASS: INTEGER_MASS,
    MAX_PEPTIDE_LENGTH: MAX_PEPTIDE_LENGTH,
    validatePeptide: validatePeptide,
    residueMasses: residueMasses,
    prefixMasses: prefixMasses,
    cyclicSlice: cyclicSlice,
    subpeptidesInGenerationOrder: subpeptidesInGenerationOrder,
    sortedEntries: sortedEntries,
    linearSpectrum: linearSpectrum,
    cyclicSpectrum: cyclicSpectrum,
    multiplicities: multiplicities,
    coveredPositions: coveredPositions,
    sumOf: sumOf
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
  var PLAY_DELAY_MS = 700;

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

  function subpeptideName(entry) {
    return entry.length === 0 ? '"" (empty)' : entry.label;
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
      'https://cogniterra.org/lesson/29912/?utm_source=bioinformaticsalgorithms.org&utm_medium=widget&utm_campaign=spectrum';

    var state = {
      peptide: 'NQEL',
      isCyclic: true,
      generated: [],
      revealedCount: 0,
      highlighted: null,
      playTimer: null
    };

    var idBase = 'w-spectrum-' + Math.random().toString(36).slice(2, 8);

    var input = element('input', {
      id: idBase + '-peptide', type: 'text', value: state.peptide, maxlength: String(MAX_PEPTIDE_LENGTH),
      autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', class: 'ws-input'
    });
    var cyclicButton = element('button', { type: 'button', class: 'ws-toggle', 'aria-pressed': 'true', text: 'Cyclic' });
    var linearButton = element('button', { type: 'button', class: 'ws-toggle', 'aria-pressed': 'false', text: 'Linear' });
    var errorLine = element('p', { class: 'ws-error', role: 'alert' });

    var resetButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Reset' });
    var stepButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Step' });
    var playButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Play' });
    var allButton = element('button', { type: 'button', class: 'btn btn-small', text: 'Show all' });

    var status = element('p', { class: 'ws-status', 'aria-live': 'polite' });
    var formulaLine = element('p', { class: 'ws-formula' });

    var ringHolder = element('div', { class: 'ws-ring' });
    var prefixHolder = element('div', { class: 'ws-prefix' });
    var spectrumLine = element('p', { class: 'ws-spectrum' });
    var plotHolder = element('div', { class: 'ws-plot' });
    var listHolder = element('div', { class: 'ws-list' });

    var controls = element('div', { class: 'ws-controls' }, [
      element('label', { for: idBase + '-peptide', class: 'ws-label', text: 'Peptide' }),
      input,
      element('div', { class: 'ws-toggles', role: 'group', 'aria-label': 'Spectrum type' }, [cyclicButton, linearButton])
    ]);

    var stepper = element('div', { class: 'ws-stepper' }, [resetButton, stepButton, playButton, allButton]);

    var body = frameBody(root, 'w-spectrum-body', 'The theoretical spectrum of a peptide', footLink,
      'Now write the code that generates Cyclospectrum(Peptide): ', 'Implement the theoretical spectrum in the interactive text');
    appendChildren(body, [
      element('p', { class: 'ws-hint', text: 'Up to ' + MAX_PEPTIDE_LENGTH + ' amino acids, one-letter codes. Hover over or focus a mass to see its subpeptide on the ring.' }),
      controls,
      errorLine,
      element('div', { class: 'ws-top' }, [ringHolder, prefixHolder]),
      stepper,
      status,
      formulaLine,
      element('h4', { class: 'ws-subhead', text: 'Sorted spectrum' }),
      spectrumLine,
      plotHolder,
      element('h4', { class: 'ws-subhead', text: 'Subpeptides and their masses' }),
      listHolder
    ]);

    function stopPlaying() {
      if (state.playTimer !== null) {
        window.clearInterval(state.playTimer);
        state.playTimer = null;
      }
      playButton.textContent = 'Play';
    }

    function recompute() {
      stopPlaying();
      var check = validatePeptide(input.value);
      if (!check.ok) {
        errorLine.textContent = check.error;
        return;
      }
      errorLine.textContent = '';
      state.peptide = check.peptide;
      state.generated = subpeptidesInGenerationOrder(state.peptide, state.isCyclic);
      state.revealedCount = state.generated.length;
      state.highlighted = null;
      render();
    }

    function revealedEntries() {
      return state.generated.slice(0, state.revealedCount);
    }

    function spectrumName() {
      return (state.isCyclic ? 'Cyclospectrum(' : 'LinearSpectrum(') + state.peptide + ')';
    }

    function render() {
      renderRing();
      renderPrefixTable();
      renderSpectrum();
      renderPlot();
      renderList();
      renderStatus();
    }

    function renderStatus() {
      var total = state.generated.length;
      var entry = state.highlighted;
      if (entry) {
        status.textContent = subpeptideName(entry) + ' has mass ' + entry.mass + '.';
        formulaLine.textContent = entry.formula;
        return;
      }
      if (state.revealedCount === total) {
        status.textContent = spectrumName() + ' has ' + total + ' masses (the empty peptide, ' +
          (total - 2) + ' proper subpeptides, and the whole peptide).';
        formulaLine.textContent = 'Mass(Peptide) = PrefixMass(' + state.peptide.length + ') = ' +
          prefixMasses(residueMasses(state.peptide))[state.peptide.length] + '.';
        return;
      }
      if (state.revealedCount <= 1) {
        status.textContent = 'Step 1 of ' + total + ': start with mass 0 for the empty peptide.';
        formulaLine.textContent = '';
        return;
      }
      var latest = state.generated[state.revealedCount - 1];
      status.textContent = 'Step ' + state.revealedCount + ' of ' + total + ': ' + subpeptideName(latest) + ' has mass ' + latest.mass + '.';
      formulaLine.textContent = latest.formula;
    }

    function activeEntry() {
      if (state.highlighted) {
        return state.highlighted;
      }
      if (state.revealedCount > 1 && state.revealedCount < state.generated.length) {
        return state.generated[state.revealedCount - 1];
      }
      return null;
    }

    function renderRing() {
      clearNode(ringHolder);
      var masses = residueMasses(state.peptide);
      var count = masses.length;
      var size = 310;
      var center = size / 2;
      var radius = count > 12 ? 100 : 88;
      var nodeRadius = count > 12 ? 13 : 17;
      var entry = activeEntry();
      var covered = entry ? coveredPositions(entry, count) : [];
      var svg = svgElement('svg', {
        viewBox: '0 0 ' + size + ' ' + size, class: 'ws-ring-svg', role: 'img',
        'aria-label': (state.isCyclic ? 'Cyclic' : 'Linear') + ' peptide ' + state.peptide + ' with residue masses ' + masses.join('-')
      });
      var points = [];
      for (var index = 0; index < count; index += 1) {
        var angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
        points.push({ x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle), angle: angle });
      }
      drawBonds(svg, points, covered, entry);
      drawResidues(svg, points, masses, covered, nodeRadius, center);
      svg.appendChild(svgElement('text', { x: center, y: center - 4, class: 'ws-ring-center', 'text-anchor': 'middle', text: state.isCyclic ? 'cyclic' : 'linear' }));
      svg.appendChild(svgElement('text', { x: center, y: center + 14, class: 'ws-ring-center-mass', 'text-anchor': 'middle', text: sumOf(masses) + ' Da' }));
      ringHolder.appendChild(svg);
    }

    function bondIsInside(fromIndex, entry, count) {
      if (!entry || entry.length < 2) {
        return false;
      }
      for (var offset = 0; offset < entry.length - 1; offset += 1) {
        if ((entry.start + offset) % count === fromIndex) {
          return true;
        }
      }
      return false;
    }

    function drawBonds(svg, points, covered, entry) {
      var count = points.length;
      if (count < 2) {
        return;
      }
      for (var index = 0; index < count; index += 1) {
        var next = (index + 1) % count;
        var isClosingBond = next === 0;
        var className = 'ws-bond';
        if (isClosingBond && !state.isCyclic) {
          className += ' ws-bond-cut';
        } else if (bondIsInside(index, entry, count)) {
          className += ' ws-bond-on';
        }
        if (count === 2 && isClosingBond) {
          continue;
        }
        svg.appendChild(svgElement('line', {
          x1: points[index].x, y1: points[index].y, x2: points[next].x, y2: points[next].y, class: className
        }));
      }
    }

    function drawResidues(svg, points, masses, covered, nodeRadius, center) {
      for (var index = 0; index < points.length; index += 1) {
        var point = points[index];
        var isOn = covered.indexOf(index) !== -1;
        svg.appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: nodeRadius, class: isOn ? 'ws-residue ws-residue-on' : 'ws-residue' }));
        svg.appendChild(svgElement('text', { x: point.x, y: point.y + 5, 'text-anchor': 'middle', class: isOn ? 'ws-residue-letter ws-residue-letter-on' : 'ws-residue-letter', text: state.peptide[index] }));
        var labelDistance = nodeRadius + 11;
        var labelX = point.x + labelDistance * Math.cos(point.angle);
        var labelY = point.y + labelDistance * Math.sin(point.angle) + 4;
        var anchor = 'middle';
        if (Math.cos(point.angle) > 0.3) {
          anchor = 'start';
        } else if (Math.cos(point.angle) < -0.3) {
          anchor = 'end';
        }
        svg.appendChild(svgElement('text', { x: labelX, y: labelY, 'text-anchor': anchor, class: 'ws-residue-mass', text: String(masses[index]) }));
      }
    }

    function renderPrefixTable() {
      clearNode(prefixHolder);
      var masses = residueMasses(state.peptide);
      var prefix = prefixMasses(masses);
      var entry = activeEntry();
      var used = entry ? entry.prefixIndices : [];
      var table = element('table', { class: 'ws-prefix-table' });
      table.appendChild(element('caption', { text: 'PrefixMass: the mass of the first i amino acids' }));
      var headRow = element('tr', null, [
        element('th', { scope: 'col', text: 'i' }),
        element('th', { scope: 'col', text: 'amino acid' }),
        element('th', { scope: 'col', text: 'PrefixMass(i)' })
      ]);
      table.appendChild(element('thead', null, [headRow]));
      var body = element('tbody');
      for (var index = 0; index < prefix.length; index += 1) {
        var residueText = index === 0 ? '–' : state.peptide[index - 1] + ' (' + masses[index - 1] + ')';
        var row = element('tr', { class: used.indexOf(index) !== -1 ? 'ws-prefix-on' : '' }, [
          element('td', { text: String(index) }),
          element('td', { text: residueText }),
          element('td', { text: String(prefix[index]) })
        ]);
        body.appendChild(row);
      }
      table.appendChild(body);
      prefixHolder.appendChild(table);
      prefixHolder.appendChild(element('p', {
        class: 'ws-note',
        text: state.isCyclic
          ? 'Each linear piece weighs PrefixMass(j) − PrefixMass(i); a piece that wraps around is the whole mass minus the piece left over.'
          : 'Each subpeptide from position i + 1 to j weighs PrefixMass(j) − PrefixMass(i).'
      }));
    }

    function renderSpectrum() {
      var masses = sortedNumbers(massesOf(revealedEntries()));
      spectrumLine.textContent = spectrumName() + ' = ' + masses.join(' ');
    }

    function renderPlot() {
      clearNode(plotHolder);
      var groups = multiplicities(sortedNumbers(massesOf(revealedEntries())));
      var fullMass = sumOf(residueMasses(state.peptide));
      var width = 640;
      var height = 150;
      var left = 30;
      var right = 16;
      var bottom = 26;
      var top = 12;
      var maxCount = 1;
      var index;
      var allGroups = multiplicities(sortedNumbers(massesOf(state.generated)));
      for (index = 0; index < allGroups.length; index += 1) {
        maxCount = Math.max(maxCount, allGroups[index].count);
      }
      var entry = activeEntry();
      var svg = svgElement('svg', {
        viewBox: '0 0 ' + width + ' ' + height, class: 'ws-plot-svg', role: 'img',
        'aria-label': 'Stick plot of ' + spectrumName() + ': ' + describeGroups(groups)
      });
      var plotWidth = width - left - right;
      var plotHeight = height - top - bottom;
      svg.appendChild(svgElement('line', { x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: 'ws-axis' }));
      for (var level = 1; level <= maxCount; level += 1) {
        var levelY = top + plotHeight - (plotHeight * level) / maxCount;
        svg.appendChild(svgElement('text', { x: left - 6, y: levelY + 4, 'text-anchor': 'end', class: 'ws-tick', text: String(level) }));
      }
      for (index = 0; index < groups.length; index += 1) {
        var group = groups[index];
        var x = left + (fullMass === 0 ? 0 : (plotWidth * group.mass) / fullMass);
        var barTop = top + plotHeight - (plotHeight * group.count) / maxCount;
        var isOn = entry !== null && entry.mass === group.mass;
        var stick = svgElement('line', { x1: x, y1: top + plotHeight, x2: x, y2: barTop, class: isOn ? 'ws-stick ws-stick-on' : 'ws-stick' }, [
          svgElement('title', { text: 'mass ' + group.mass + (group.count > 1 ? ' (appears ' + group.count + ' times)' : '') })
        ]);
        svg.appendChild(stick);
      }
      svg.appendChild(svgElement('text', { x: left, y: height - 6, 'text-anchor': 'start', class: 'ws-tick', text: '0' }));
      svg.appendChild(svgElement('text', { x: width - right, y: height - 6, 'text-anchor': 'end', class: 'ws-tick', text: fullMass + ' Da' }));
      svg.appendChild(svgElement('text', { x: left + plotWidth / 2, y: height - 6, 'text-anchor': 'middle', class: 'ws-tick', text: 'mass (Da); stick height = multiplicity' }));
      plotHolder.appendChild(svg);
    }

    function describeGroups(groups) {
      var parts = [];
      for (var index = 0; index < groups.length; index += 1) {
        parts.push(groups[index].count > 1 ? groups[index].mass + ' (' + groups[index].count + ' times)' : String(groups[index].mass));
      }
      return parts.join(', ');
    }

    function renderList() {
      clearNode(listHolder);
      var entries = sortedEntries(revealedEntries());
      var list = element('ul', { class: 'ws-chips' });
      for (var index = 0; index < entries.length; index += 1) {
        list.appendChild(makeChip(entries[index]));
      }
      listHolder.appendChild(list);
    }

    function makeChip(entry) {
      var isOn = state.highlighted === entry;
      var button = element('button', {
        type: 'button', class: isOn ? 'ws-chip ws-chip-on' : 'ws-chip',
        'aria-label': subpeptideName(entry) + ', mass ' + entry.mass
      }, [
        element('span', { class: 'ws-chip-label', text: entry.length === 0 ? '""' : entry.label }),
        element('span', { class: 'ws-chip-mass', text: String(entry.mass) })
      ]);
      button.addEventListener('mouseenter', function () { highlight(entry); });
      button.addEventListener('focus', function () { highlight(entry); });
      button.addEventListener('mouseleave', function () { highlight(null); });
      button.addEventListener('blur', function () { highlight(null); });
      return element('li', null, [button]);
    }

    function highlight(entry) {
      if (state.highlighted === entry) {
        return;
      }
      state.highlighted = entry;
      renderRing();
      renderPrefixTable();
      renderPlot();
      renderStatus();
      markChips();
    }

    function markChips() {
      var chips = listHolder.querySelectorAll('.ws-chip');
      var entries = sortedEntries(revealedEntries());
      for (var index = 0; index < chips.length; index += 1) {
        if (entries[index] === state.highlighted) {
          chips[index].classList.add('ws-chip-on');
        } else {
          chips[index].classList.remove('ws-chip-on');
        }
      }
    }

    function stepOnce() {
      if (state.revealedCount >= state.generated.length) {
        state.revealedCount = 1;
      } else {
        state.revealedCount += 1;
      }
      state.highlighted = null;
      render();
      if (state.revealedCount >= state.generated.length) {
        stopPlaying();
      }
    }

    function setCyclic(isCyclic) {
      state.isCyclic = isCyclic;
      cyclicButton.setAttribute('aria-pressed', isCyclic ? 'true' : 'false');
      linearButton.setAttribute('aria-pressed', isCyclic ? 'false' : 'true');
      recompute();
    }

    input.addEventListener('input', recompute);
    cyclicButton.addEventListener('click', function () { setCyclic(true); });
    linearButton.addEventListener('click', function () { setCyclic(false); });
    resetButton.addEventListener('click', function () {
      stopPlaying();
      state.revealedCount = 1;
      state.highlighted = null;
      render();
    });
    stepButton.addEventListener('click', function () {
      stopPlaying();
      stepOnce();
    });
    allButton.addEventListener('click', function () {
      stopPlaying();
      state.revealedCount = state.generated.length;
      state.highlighted = null;
      render();
    });
    playButton.addEventListener('click', function () {
      if (state.playTimer !== null) {
        stopPlaying();
        return;
      }
      if (state.revealedCount >= state.generated.length) {
        state.revealedCount = 1;
        render();
      }
      if (prefersReducedMotion()) {
        stepOnce();
        return;
      }
      playButton.textContent = 'Pause';
      state.playTimer = window.setInterval(stepOnce, PLAY_DELAY_MS);
    });

    recompute();
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-widget="spectrum"]');
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
