/* The Change Problem three ways: GreedyChange, RecursiveChange, DPChange.
   Widget for lesson 5.5. Vanilla ES2019, no dependencies.
   The algorithm core is a set of pure functions exported for the Node test. */
(function () {
  'use strict';

  var MAX_MONEY = 200;
  var MAX_COIN_VALUE = 500;
  var MAX_COIN_COUNT = 10;
  var MAX_TREE_NODES_PER_LEVEL = 64;
  var MAX_TREE_DEPTH = 4;
  var PLAY_INTERVAL_MS = 350;

  var PRESETS = [
    { label: 'Roman denarii, money = 48', money: 48, coins: [120, 40, 30, 24, 20, 10, 5, 4, 1], highlight: null },
    { label: 'Coins (5, 4, 1), money = 76', money: 76, coins: [5, 4, 1], highlight: 70 },
    { label: 'US cents, money = 76', money: 76, coins: [100, 50, 25, 10, 5, 1], highlight: null },
    { label: 'Code Challenge sample: 40 with (50, 25, 20, 10, 5, 1)', money: 40, coins: [50, 25, 20, 10, 5, 1], highlight: null }
  ];

  /* ---------- Exact big integers as decimal strings (no BigInt in ES2019) ---------- */

  function addDecimalStrings(first, second) {
    var result = '';
    var carry = 0;
    var i = first.length - 1;
    var j = second.length - 1;
    while (i >= 0 || j >= 0 || carry > 0) {
      var digitSum = carry;
      if (i >= 0) {
        digitSum += first.charCodeAt(i) - 48;
      }
      if (j >= 0) {
        digitSum += second.charCodeAt(j) - 48;
      }
      result = String(digitSum % 10) + result;
      carry = Math.floor(digitSum / 10);
      i -= 1;
      j -= 1;
    }
    return result;
  }

  function formatWithCommas(decimalString) {
    var groups = [];
    var end = decimalString.length;
    while (end > 0) {
      var start = Math.max(0, end - 3);
      groups.unshift(decimalString.slice(start, end));
      end = start;
    }
    return groups.join(',');
  }

  function scientificApproximation(decimalString) {
    var exponent = decimalString.length - 1;
    var mantissa = decimalString.charAt(0) + '.' + decimalString.slice(1, 3);
    return mantissa + ' × 10^' + exponent;
  }

  /* ---------- Input parsing ---------- */

  function parseMoney(text) {
    var trimmed = String(text).trim();
    if (!/^\d+$/.test(trimmed)) {
      return { error: 'Money must be a whole number, such as 48.' };
    }
    var money = parseInt(trimmed, 10);
    if (money < 1 || money > MAX_MONEY) {
      return { error: 'Money must be between 1 and ' + MAX_MONEY + ' so that the array fits on screen.' };
    }
    return { money: money };
  }

  function sortDescending(numbers) {
    return numbers.slice().sort(function (a, b) { return b - a; });
  }

  function removeDuplicates(sortedNumbers) {
    var unique = [];
    for (var i = 0; i < sortedNumbers.length; i += 1) {
      if (unique.length === 0 || unique[unique.length - 1] !== sortedNumbers[i]) {
        unique.push(sortedNumbers[i]);
      }
    }
    return unique;
  }

  function parseCoins(text) {
    var pieces = String(text).replace(/[()]/g, ' ').split(/[\s,]+/);
    var values = [];
    for (var i = 0; i < pieces.length; i += 1) {
      var piece = pieces[i];
      if (piece === '') {
        continue;
      }
      if (!/^\d+$/.test(piece)) {
        return { error: 'Coins must be positive whole numbers separated by commas; "' + piece + '" is not one.' };
      }
      var value = parseInt(piece, 10);
      if (value < 1 || value > MAX_COIN_VALUE) {
        return { error: 'Each coin must be between 1 and ' + MAX_COIN_VALUE + '.' };
      }
      values.push(value);
    }
    if (values.length === 0) {
      return { error: 'Enter at least one coin denomination.' };
    }
    var coins = removeDuplicates(sortDescending(values));
    if (coins.length > MAX_COIN_COUNT) {
      return { error: 'Use at most ' + MAX_COIN_COUNT + ' different denominations.' };
    }
    return { coins: coins };
  }

  /* ---------- GreedyChange ---------- */

  function largestCoinAtMost(money, coinsDescending) {
    for (var i = 0; i < coinsDescending.length; i += 1) {
      if (coinsDescending[i] <= money) {
        return coinsDescending[i];
      }
    }
    return null;
  }

  // Returns the coins GreedyChange picks; stuckAt > 0 means no coin fits the money left.
  function greedyChange(money, coinsDescending) {
    var change = [];
    var remaining = money;
    while (remaining > 0) {
      var coin = largestCoinAtMost(remaining, coinsDescending);
      if (coin === null) {
        return { change: change, stuckAt: remaining };
      }
      change.push(coin);
      remaining -= coin;
    }
    return { change: change, stuckAt: 0 };
  }

  /* ---------- DPChange, recorded one cell at a time ---------- */

  // One entry per m: which coins were tried, what they looked up, and which coin won.
  // Ties keep the earlier coin, as the strict "<" in the DPChange pseudocode does.
  function computeDpCell(m, coinsDescending, minNumCoins) {
    var attempts = [];
    var best = Infinity;
    var winningCoin = null;
    for (var i = 0; i < coinsDescending.length; i += 1) {
      var coin = coinsDescending[i];
      if (m >= coin) {
        var candidate = minNumCoins[m - coin] + 1;
        attempts.push({ coin: coin, lookup: m - coin, lookupValue: minNumCoins[m - coin], tried: true });
        if (candidate < best) {
          best = candidate;
          winningCoin = coin;
        }
      } else {
        attempts.push({ coin: coin, lookup: null, lookupValue: null, tried: false });
      }
    }
    return { m: m, value: best, winningCoin: winningCoin, attempts: attempts };
  }

  function dpChangeSteps(money, coinsDescending) {
    var minNumCoins = [0];
    var steps = [{ m: 0, value: 0, winningCoin: null, attempts: [] }];
    for (var m = 1; m <= money; m += 1) {
      var cell = computeDpCell(m, coinsDescending, minNumCoins);
      minNumCoins.push(cell.value);
      steps.push(cell);
    }
    return steps;
  }

  function dpChange(money, coinsDescending) {
    var steps = dpChangeSteps(money, coinsDescending);
    return steps[money].value;
  }

  // Follows the winning coins back from money to 0 to list an optimal collection.
  function optimalCoinsFromSteps(steps, money) {
    if (steps[money].value === Infinity) {
      return null;
    }
    var coins = [];
    var m = money;
    while (m > 0) {
      var coin = steps[m].winningCoin;
      coins.push(coin);
      m -= coin;
    }
    return coins;
  }

  /* ---------- RecursiveChange, counted without running it ---------- */

  // calls[m] = 1 + sum of calls[m - coin] over coins with coin <= m, as decimal strings.
  function recursiveCallCounts(money, coinsDescending) {
    var calls = ['1'];
    for (var m = 1; m <= money; m += 1) {
      var total = '1';
      for (var i = 0; i < coinsDescending.length; i += 1) {
        if (coinsDescending[i] <= m) {
          total = addDecimalStrings(total, calls[m - coinsDescending[i]]);
        }
      }
      calls.push(total);
    }
    return calls;
  }

  function recursiveCallCount(money, coinsDescending) {
    return recursiveCallCounts(money, coinsDescending)[money];
  }

  // How many times RecursiveChange(money) calls RecursiveChange(target), counting all depths.
  // times[v] = sum of times[v + coin] over coins with v + coin <= money, and times[money] = 1.
  function timesComputed(money, target, coinsDescending) {
    var times = [];
    for (var v = 0; v <= money; v += 1) {
      times.push('0');
    }
    times[money] = '1';
    for (var value = money - 1; value >= target; value -= 1) {
      var total = '0';
      for (var i = 0; i < coinsDescending.length; i += 1) {
        var parent = value + coinsDescending[i];
        if (parent <= money) {
          total = addDecimalStrings(total, times[parent]);
        }
      }
      times[value] = total;
    }
    return times[target];
  }

  function childrenOf(value, coinsDescending) {
    var children = [];
    for (var i = 0; i < coinsDescending.length; i += 1) {
      if (value >= coinsDescending[i]) {
        children.push({ value: value - coinsDescending[i], coin: coinsDescending[i] });
      }
    }
    return children;
  }

  // Top levels of the RecursiveChange call tree; a level is included only if it stays small.
  function recursionTreeLevels(money, coinsDescending) {
    var levels = [[{ value: money, parent: -1, coin: null }]];
    while (levels.length <= MAX_TREE_DEPTH) {
      var previous = levels[levels.length - 1];
      var next = [];
      for (var p = 0; p < previous.length; p += 1) {
        var kids = childrenOf(previous[p].value, coinsDescending);
        for (var k = 0; k < kids.length; k += 1) {
          next.push({ value: kids[k].value, parent: p, coin: kids[k].coin });
        }
      }
      if (next.length === 0 || next.length > MAX_TREE_NODES_PER_LEVEL) {
        break;
      }
      levels.push(next);
    }
    return levels;
  }

  function countValuesInLevels(levels) {
    var counts = {};
    for (var d = 1; d < levels.length; d += 1) {
      for (var n = 0; n < levels[d].length; n += 1) {
        var value = levels[d][n].value;
        counts[value] = (counts[value] || 0) + 1;
      }
    }
    return counts;
  }

  // The value repeated most often in the drawn tree (ties go to the larger value).
  function mostRepeatedValue(levels) {
    var counts = countValuesInLevels(levels);
    var bestValue = null;
    var bestCount = 0;
    var keys = Object.keys(counts);
    for (var i = 0; i < keys.length; i += 1) {
      var value = parseInt(keys[i], 10);
      var count = counts[keys[i]];
      if (count > bestCount || (count === bestCount && value > bestValue)) {
        bestValue = value;
        bestCount = count;
      }
    }
    return bestValue;
  }

  var core = {
    addDecimalStrings: addDecimalStrings,
    parseMoney: parseMoney,
    parseCoins: parseCoins,
    greedyChange: greedyChange,
    dpChangeSteps: dpChangeSteps,
    dpChange: dpChange,
    optimalCoinsFromSteps: optimalCoinsFromSteps,
    recursiveCallCount: recursiveCallCount,
    timesComputed: timesComputed,
    recursionTreeLevels: recursionTreeLevels,
    mostRepeatedValue: mostRepeatedValue
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }
  if (typeof document === 'undefined') {
    return;
  }

  /* ================= Browser UI ================= */

  var SVG_NS = 'http://www.w3.org/2000/svg';
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

  function makeSvgElement(tag, attributes) {
    var element = document.createElementNS(SVG_NS, tag);
    var names = Object.keys(attributes);
    for (var i = 0; i < names.length; i += 1) {
      element.setAttribute(names[i], attributes[names[i]]);
    }
    return element;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function showNumber(value) {
    return value === Infinity ? '∞' : String(value);
  }

  function coinListText(coins) {
    return '(' + coins.join(', ') + ')';
  }

  function sumText(coins) {
    return coins.join(' + ');
  }

  function buildLabeledInput(labelText, id, value, size) {
    var wrapper = makeElement('label', 'wc-field');
    wrapper.setAttribute('for', id);
    wrapper.appendChild(makeElement('span', 'wc-label', labelText));
    var input = makeElement('input', 'wc-input');
    input.id = id;
    input.type = 'text';
    input.value = value;
    input.size = size;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    wrapper.appendChild(input);
    return { wrapper: wrapper, input: input };
  }

  function buildButton(text, extraClass) {
    var button = makeElement('button', 'btn btn-small' + (extraClass ? ' ' + extraClass : ''), text);
    button.type = 'button';
    return button;
  }

  function buildControls(state, idPrefix) {
    var controls = makeElement('div', 'wc-controls');

    var presetField = makeElement('label', 'wc-field wc-preset');
    presetField.setAttribute('for', idPrefix + '-preset');
    presetField.appendChild(makeElement('span', 'wc-label', 'Example'));
    var presetSelect = makeElement('select', 'wc-input');
    presetSelect.id = idPrefix + '-preset';
    for (var i = 0; i < PRESETS.length; i += 1) {
      var option = makeElement('option', null, PRESETS[i].label);
      option.value = String(i);
      presetSelect.appendChild(option);
    }
    presetField.appendChild(presetSelect);

    var moneyField = buildLabeledInput('money', idPrefix + '-money', '', 4);
    var coinsField = buildLabeledInput('Coins', idPrefix + '-coins', '', 22);
    coinsField.wrapper.className += ' wc-coins-field';
    moneyField.input.setAttribute('inputmode', 'numeric');
    var applyButton = buildButton('Make change');

    controls.appendChild(presetField);
    controls.appendChild(moneyField.wrapper);
    controls.appendChild(coinsField.wrapper);
    controls.appendChild(applyButton);

    state.presetSelect = presetSelect;
    state.moneyInput = moneyField.input;
    state.coinsInput = coinsField.input;
    state.applyButton = applyButton;
    return controls;
  }

  function buildPanel(title, className) {
    var panel = makeElement('section', 'wc-panel ' + className);
    panel.appendChild(makeElement('h4', 'wc-panel-title', title));
    var body = makeElement('div', 'wc-panel-body');
    panel.appendChild(body);
    return { panel: panel, body: body };
  }

  /* ---------- Greedy panel ---------- */

  function renderGreedy(state) {
    var body = state.greedyBody;
    body.innerHTML = '';
    var result = greedyChange(state.money, state.coins);
    var optimal = state.steps[state.money].value;
    var line = makeElement('p', 'wc-mono');
    if (result.stuckAt > 0) {
      line.textContent = state.money + ' = ' + (result.change.length ? sumText(result.change) + ' + ' : '') + '? (stuck: no coin fits ' + result.stuckAt + ')';
      body.appendChild(line);
      body.appendChild(makeElement('p', 'wc-verdict wc-bad', 'GreedyChange fails to make change at all.'));
    } else {
      line.textContent = state.money + ' = ' + sumText(result.change);
      body.appendChild(line);
      body.appendChild(makeElement('p', 'wc-big', result.change.length + (result.change.length === 1 ? ' coin' : ' coins')));
      var verdict;
      if (result.change.length === optimal) {
        verdict = makeElement('p', 'wc-verdict wc-good', 'Optimal here: DPChange also needs ' + optimal + '.');
      } else {
        verdict = makeElement('p', 'wc-verdict wc-bad', 'Suboptimal: the minimum is ' + optimal + (optimal === 1 ? ' coin.' : ' coins.'));
      }
      body.appendChild(verdict);
    }
    if (optimal === Infinity) {
      body.appendChild(makeElement('p', 'wc-note', 'No combination of these coins changes ' + state.money + '.'));
    }
  }

  /* ---------- Recursion panel ---------- */

  function layoutTree(levels) {
    // Leaves (nodes at the last drawn level, or nodes with no drawn children) each get one slot;
    // a parent sits centered over its children.
    var childLists = [];
    for (var d = 0; d < levels.length; d += 1) {
      var lists = [];
      for (var n = 0; n < levels[d].length; n += 1) {
        lists.push([]);
      }
      childLists.push(lists);
    }
    for (var depth = 1; depth < levels.length; depth += 1) {
      for (var c = 0; c < levels[depth].length; c += 1) {
        childLists[depth - 1][levels[depth][c].parent].push(c);
      }
    }
    var positions = [];
    for (var e = 0; e < levels.length; e += 1) {
      positions.push([]);
    }
    var nextSlot = { value: 0 };
    placeNode(0, 0, levels, childLists, positions, nextSlot);
    return { positions: positions, slotCount: nextSlot.value };
  }

  function placeNode(depth, index, levels, childLists, positions, nextSlot) {
    var kids = depth < levels.length - 1 ? childLists[depth][index] : [];
    if (kids.length === 0) {
      positions[depth][index] = nextSlot.value;
      nextSlot.value += 1;
      return positions[depth][index];
    }
    var first = null;
    var last = null;
    for (var k = 0; k < kids.length; k += 1) {
      var x = placeNode(depth + 1, kids[k], levels, childLists, positions, nextSlot);
      if (first === null) {
        first = x;
      }
      last = x;
    }
    positions[depth][index] = (first + last) / 2;
    return positions[depth][index];
  }

  function treeX(geometry, depth, index) {
    return geometry.margin + geometry.layout.positions[depth][index] * geometry.slotWidth + geometry.slotWidth / 2;
  }

  function treeY(geometry, depth) {
    return geometry.margin + depth * geometry.levelHeight;
  }

  function drawTree(state) {
    var levels = state.treeLevels;
    var layout = layoutTree(levels);
    var slotWidth = 30;
    var levelHeight = 58;
    var radius = 13;
    var margin = 18;
    var width = Math.max(layout.slotCount * slotWidth + 2 * margin, 120);
    var height = (levels.length - 1) * levelHeight + 2 * margin + 4;
    var svg = makeSvgElement('svg', {
      width: String(width), height: String(height), viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': 'Top ' + levels.length + ' levels of the RecursiveChange call tree for money ' + state.money
    });
    var edgeGroup = makeSvgElement('g', { 'class': 'wc-tree-edges' });
    var nodeGroup = makeSvgElement('g', { 'class': 'wc-tree-nodes' });
    svg.appendChild(edgeGroup);
    svg.appendChild(nodeGroup);

    var geometry = { layout: layout, slotWidth: slotWidth, levelHeight: levelHeight, margin: margin };
    for (var d = 0; d < levels.length; d += 1) {
      for (var n = 0; n < levels[d].length; n += 1) {
        var node = levels[d][n];
        var isSelected = state.selectedValue !== null && node.value === state.selectedValue && d > 0;
        if (d > 0) {
          var line = makeSvgElement('line', {
            x1: String(treeX(geometry, d - 1, node.parent)), y1: String(treeY(geometry, d - 1) + radius),
            x2: String(treeX(geometry, d, n)), y2: String(treeY(geometry, d) - radius),
            'class': isSelected ? 'wc-edge wc-edge-hot' : 'wc-edge'
          });
          edgeGroup.appendChild(line);
        }
        var group = makeSvgElement('g', { 'class': 'wc-node' + (isSelected ? ' wc-node-hot' : '') + (d === 0 ? ' wc-node-root' : '') });
        group.setAttribute('data-value', String(node.value));
        var circle = makeSvgElement('circle', { cx: String(treeX(geometry, d, n)), cy: String(treeY(geometry, d)), r: String(radius) });
        var label = makeSvgElement('text', { x: String(treeX(geometry, d, n)), y: String(treeY(geometry, d) + 4), 'text-anchor': 'middle' });
        label.textContent = String(node.value);
        var title = makeSvgElement('title', {});
        title.textContent = d === 0 ? 'MinNumCoins(' + node.value + ')' : 'MinNumCoins(' + node.value + '), after a ' + node.coin + ' coin';
        group.appendChild(title);
        group.appendChild(circle);
        group.appendChild(label);
        nodeGroup.appendChild(group);
      }
    }
    return svg;
  }

  function renderRecursion(state) {
    var body = state.recursionBody;
    body.innerHTML = '';
    var calls = recursiveCallCount(state.money, state.coins);
    var callsLine = makeElement('p', 'wc-big', formatWithCommas(calls) + ' calls');
    body.appendChild(callsLine);
    var explain = 'RecursiveChange(' + state.money + ', Coins) calls itself this many times in total';
    if (calls.length > 12) {
      explain += ' (about ' + scientificApproximation(calls) + ')';
    }
    explain += ', while DPChange computes each of the ' + (state.money + 1) + ' values MinNumCoins(0), ..., MinNumCoins(' + state.money + ') once.';
    body.appendChild(makeElement('p', 'wc-note', explain));

    var treeHint = makeElement('p', 'wc-note', 'Top ' + state.treeLevels.length + ' levels of the call tree. Choose a node to highlight every drawn copy of the same computation.');
    body.appendChild(treeHint);
    var scroller = makeElement('div', 'wc-tree-box');
    scroller.setAttribute('tabindex', '0');
    scroller.setAttribute('aria-label', 'Recursion tree, scrolls sideways');
    scroller.appendChild(drawTree(state));
    body.appendChild(scroller);
    centerTreeOnRoot(scroller);

    var pickerRow = makeElement('div', 'wc-picker');
    var pickerLabel = makeElement('label', 'wc-label', 'Highlight MinNumCoins(');
    pickerLabel.setAttribute('for', state.idPrefix + '-pick');
    var picker = makeElement('select', 'wc-input');
    picker.id = state.idPrefix + '-pick';
    var values = drawnValues(state.treeLevels);
    for (var i = 0; i < values.length; i += 1) {
      var option = makeElement('option', null, String(values[i]));
      option.value = String(values[i]);
      if (values[i] === state.selectedValue) {
        option.selected = true;
      }
      picker.appendChild(option);
    }
    pickerRow.appendChild(pickerLabel);
    pickerRow.appendChild(picker);
    pickerRow.appendChild(makeElement('span', 'wc-label', ')'));
    body.appendChild(pickerRow);

    if (state.selectedValue !== null) {
      var drawnCount = countValuesInLevels(state.treeLevels)[state.selectedValue] || 0;
      var fullCount = timesComputed(state.money, state.selectedValue, state.coins);
      var repeatText = 'MinNumCoins(' + state.selectedValue + ') appears ' + drawnCount + (drawnCount === 1 ? ' time' : ' times') +
        ' in the drawn levels and is computed ' + formatWithCommas(fullCount) + (fullCount === '1' ? ' time' : ' times') + ' in the full tree.';
      body.appendChild(makeElement('p', 'wc-repeat', repeatText));
    }

    picker.addEventListener('change', function () {
      state.selectedValue = parseInt(picker.value, 10);
      renderRecursion(state);
      var again = document.getElementById(state.idPrefix + '-pick');
      if (again) {
        again.focus();
      }
    });
    scroller.addEventListener('click', function (event) {
      var target = event.target;
      while (target && target !== scroller && !(target.getAttribute && target.getAttribute('data-value'))) {
        target = target.parentNode;
      }
      if (target && target !== scroller && target.getAttribute('data-value')) {
        var value = parseInt(target.getAttribute('data-value'), 10);
        if (value !== state.money) {
          state.selectedValue = value;
          renderRecursion(state);
        }
      }
    });
  }

  function centerTreeOnRoot(scroller) {
    var extra = scroller.scrollWidth - scroller.clientWidth;
    if (extra > 0) {
      scroller.scrollLeft = extra / 2;
    }
  }

  function drawnValues(levels) {
    var seen = {};
    var values = [];
    for (var d = 1; d < levels.length; d += 1) {
      for (var n = 0; n < levels[d].length; n += 1) {
        var value = levels[d][n].value;
        if (!seen[value]) {
          seen[value] = true;
          values.push(value);
        }
      }
    }
    values.sort(function (a, b) { return b - a; });
    return values;
  }

  /* ---------- DP panel ---------- */

  function buildDpPanel(state, body) {
    var buttons = makeElement('div', 'wc-buttons');
    state.stepButton = buildButton('Step');
    state.playButton = buildButton('Play');
    state.finishButton = buildButton('Fill all');
    state.resetButton = buildButton('Reset');
    buttons.appendChild(state.stepButton);
    buttons.appendChild(state.playButton);
    buttons.appendChild(state.finishButton);
    buttons.appendChild(state.resetButton);
    body.appendChild(buttons);

    state.recurrenceBox = makeElement('div', 'wc-recurrence');
    body.appendChild(state.recurrenceBox);

    state.arrayBox = makeElement('div', 'wc-array');
    state.arrayBox.setAttribute('role', 'list');
    state.arrayBox.setAttribute('aria-label', 'The MinNumCoins array');
    body.appendChild(state.arrayBox);

    state.dpSummary = makeElement('p', 'wc-dp-summary');
    body.appendChild(state.dpSummary);
  }

  function buildArrayCells(state) {
    state.arrayBox.innerHTML = '';
    state.cells = [];
    for (var m = 0; m <= state.money; m += 1) {
      var cell = makeElement('div', 'wc-cell');
      cell.setAttribute('role', 'listitem');
      cell.appendChild(makeElement('span', 'wc-cell-index', String(m)));
      var value = makeElement('span', 'wc-cell-value', '');
      cell.appendChild(value);
      state.arrayBox.appendChild(cell);
      state.cells.push({ cell: cell, value: value });
    }
  }

  function renderArray(state) {
    var current = state.filledThrough >= 0 ? state.steps[state.filledThrough] : null;
    var lookups = {};
    var winnerLookup = null;
    if (current) {
      for (var a = 0; a < current.attempts.length; a += 1) {
        if (current.attempts[a].tried) {
          lookups[current.attempts[a].lookup] = true;
        }
      }
      if (current.winningCoin !== null) {
        winnerLookup = current.m - current.winningCoin;
      }
    }
    var isDone = state.filledThrough === state.money;
    for (var m = 0; m <= state.money; m += 1) {
      var entry = state.cells[m];
      var classes = ['wc-cell'];
      if (m <= state.filledThrough) {
        classes.push('wc-filled');
        entry.value.textContent = showNumber(state.steps[m].value);
        entry.cell.setAttribute('aria-label', 'MinNumCoins(' + m + ') = ' + showNumber(state.steps[m].value));
      } else {
        entry.value.textContent = '';
        entry.cell.setAttribute('aria-label', 'MinNumCoins(' + m + ') not yet computed');
      }
      if (!isDone && current && m === current.m) {
        classes.push('wc-current');
      }
      if (!isDone && lookups[m]) {
        classes.push('wc-lookup');
      }
      if (!isDone && m === winnerLookup) {
        classes.push('wc-winner');
      }
      if (isDone && m === state.money) {
        classes.push('wc-current');
      }
      entry.cell.className = classes.join(' ');
    }
  }

  function describeAttempt(attempt, m) {
    if (!attempt.tried) {
      return null;
    }
    return 'MinNumCoins(' + m + ' − ' + attempt.coin + ') + 1 = ' + showNumber(attempt.lookupValue) + ' + 1';
  }

  function renderRecurrence(state) {
    var box = state.recurrenceBox;
    box.innerHTML = '';
    if (state.filledThrough < 0) {
      box.appendChild(makeElement('p', 'wc-note', 'Press Step to set MinNumCoins(0) = 0 and then fill the array from m = 1 upward.'));
      return 'Ready. MinNumCoins is empty.';
    }
    var step = state.steps[state.filledThrough];
    if (step.m === 0) {
      box.appendChild(makeElement('p', 'wc-mono', 'MinNumCoins(0) = 0'));
      box.appendChild(makeElement('p', 'wc-note', 'No coins are needed to change 0.'));
      return 'MinNumCoins(0) = 0.';
    }
    box.appendChild(makeElement('p', 'wc-rec-head', 'MinNumCoins(' + step.m + ') = 1 + the minimum over coins ≤ ' + step.m + ':'));
    var list = makeElement('ul', 'wc-attempts');
    var spoken = [];
    var skipped = [];
    for (var a = 0; a < step.attempts.length; a += 1) {
      var attempt = step.attempts[a];
      var item = makeElement('li', 'wc-mono');
      if (attempt.tried) {
        var total = attempt.lookupValue + 1;
        item.textContent = 'coin ' + attempt.coin + ': ' + describeAttempt(attempt, step.m) + ' = ' + showNumber(total);
        if (attempt.coin === step.winningCoin) {
          item.className += ' wc-attempt-win';
          item.textContent += '  ← smallest';
        }
        spoken.push('coin ' + attempt.coin + ' gives ' + showNumber(total));
        list.appendChild(item);
      } else {
        skipped.push(attempt.coin);
      }
    }
    if (skipped.length > 0) {
      var skipItem = makeElement('li', 'wc-mono wc-attempt-skip', 'skipped, larger than ' + step.m + ': ' + skipped.join(', '));
      list.insertBefore(skipItem, list.firstChild);
    }
    box.appendChild(list);
    var resultLine;
    if (step.value === Infinity) {
      resultLine = 'MinNumCoins(' + step.m + ') = ∞ (these coins cannot change ' + step.m + ')';
    } else {
      resultLine = 'MinNumCoins(' + step.m + ') = ' + step.value + ', using a ' + step.winningCoin + ' coin last';
    }
    box.appendChild(makeElement('p', 'wc-rec-result', resultLine));
    return 'm = ' + step.m + ': ' + spoken.join(', ') + '. ' + resultLine + '.';
  }

  function renderDpSummary(state) {
    if (state.filledThrough < state.money) {
      state.dpSummary.textContent = 'Filled ' + (state.filledThrough + 1) + ' of ' + (state.money + 1) + ' cells.';
      return;
    }
    var value = state.steps[state.money].value;
    if (value === Infinity) {
      state.dpSummary.textContent = 'Done: no combination of ' + coinListText(state.coins) + ' changes ' + state.money + '.';
      return;
    }
    var coins = optimalCoinsFromSteps(state.steps, state.money);
    state.dpSummary.textContent = 'Done: MinNumCoins(' + state.money + ') = ' + value + ', for example ' + state.money + ' = ' + sumText(coins) + '.';
  }

  function renderDp(state) {
    renderArray(state);
    var spoken = renderRecurrence(state);
    renderDpSummary(state);
    var done = state.filledThrough === state.money;
    state.stepButton.disabled = done;
    state.finishButton.disabled = done;
    state.playButton.disabled = done;
    state.playButton.textContent = state.timer ? 'Pause' : 'Play';
    state.status.textContent = spoken;
    scrollCurrentIntoView(state);
  }

  function scrollCurrentIntoView(state) {
    if (state.filledThrough < 0) {
      return;
    }
    var entry = state.cells[state.filledThrough];
    var box = state.arrayBox;
    if (!entry || box.scrollHeight <= box.clientHeight) {
      return;
    }
    var top = entry.cell.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - entry.cell.offsetHeight) {
      box.scrollTop = Math.max(0, top - box.clientHeight / 2);
    }
  }

  function stopPlaying(state) {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function stepForward(state) {
    if (state.filledThrough < state.money) {
      state.filledThrough += 1;
    }
    if (state.filledThrough === state.money) {
      stopPlaying(state);
    }
    renderDp(state);
  }

  function togglePlay(state) {
    if (state.timer) {
      stopPlaying(state);
      renderDp(state);
      return;
    }
    if (prefersReducedMotion()) {
      // No animation: jump straight to the finished array.
      state.filledThrough = state.money;
      renderDp(state);
      return;
    }
    state.timer = window.setInterval(function () { stepForward(state); }, PLAY_INTERVAL_MS);
    renderDp(state);
  }

  /* ---------- Wiring ---------- */

  function loadProblem(state, money, coins, highlight) {
    stopPlaying(state);
    state.money = money;
    state.coins = coins;
    state.steps = dpChangeSteps(money, coins);
    state.filledThrough = -1;
    state.treeLevels = recursionTreeLevels(money, coins);
    if (highlight !== null && highlight !== undefined && countValuesInLevels(state.treeLevels)[highlight]) {
      state.selectedValue = highlight;
    } else {
      state.selectedValue = mostRepeatedValue(state.treeLevels);
    }
    state.problemLine.textContent = 'money = ' + money + ', Coins = ' + coinListText(coins);
    buildArrayCells(state);
    renderGreedy(state);
    renderRecursion(state);
    renderDp(state);
  }

  function applyInputs(state) {
    var moneyResult = parseMoney(state.moneyInput.value);
    var coinsResult = parseCoins(state.coinsInput.value);
    var problems = [];
    if (moneyResult.error) {
      problems.push(moneyResult.error);
    }
    if (coinsResult.error) {
      problems.push(coinsResult.error);
    }
    if (problems.length > 0) {
      state.errorLine.textContent = problems.join(' ');
      state.errorLine.hidden = false;
      return;
    }
    state.errorLine.hidden = true;
    state.errorLine.textContent = '';
    state.coinsInput.value = coinsResult.coins.join(', ');
    loadProblem(state, moneyResult.money, coinsResult.coins, null);
  }

  function applyPreset(state, index) {
    var preset = PRESETS[index];
    state.moneyInput.value = String(preset.money);
    state.coinsInput.value = preset.coins.join(', ');
    state.errorLine.hidden = true;
    loadProblem(state, preset.money, preset.coins, preset.highlight);
  }

  function mount(root) {
    if (root.getAttribute('data-widget-ready') === 'true') {
      return;
    }
    root.setAttribute('data-widget-ready', 'true');
    widgetCounter += 1;
    var state = { idPrefix: 'wchange' + widgetCounter, timer: null, selectedValue: null };

    var app = makeElement('div', 'wc-app');
    app.appendChild(buildControls(state, state.idPrefix));
    app.appendChild(makeElement('p', 'wc-note wc-caps', 'Money up to ' + MAX_MONEY + '; up to ' + MAX_COIN_COUNT + ' denominations, listed in decreasing order.'));
    state.errorLine = makeElement('p', 'wc-error');
    state.errorLine.setAttribute('role', 'alert');
    state.errorLine.hidden = true;
    app.appendChild(state.errorLine);
    state.problemLine = makeElement('p', 'wc-problem wc-mono');
    app.appendChild(state.problemLine);

    var grid = makeElement('div', 'wc-grid');
    var greedy = buildPanel('GreedyChange', 'wc-greedy');
    var recursion = buildPanel('RecursiveChange', 'wc-recursion');
    var dp = buildPanel('DPChange', 'wc-dp');
    state.greedyBody = greedy.body;
    state.recursionBody = recursion.body;
    buildDpPanel(state, dp.body);
    grid.appendChild(greedy.panel);
    grid.appendChild(recursion.panel);
    grid.appendChild(dp.panel);
    app.appendChild(grid);

    state.status = makeElement('p', 'wc-status');
    state.status.setAttribute('aria-live', 'polite');
    app.appendChild(state.status);

    var foot = root.querySelector('.widget-foot');
    if (foot) {
      root.insertBefore(app, foot);
    } else {
      root.appendChild(app);
    }
    var noscript = root.querySelector('.widget-noscript');
    if (noscript) {
      noscript.hidden = true;
    }

    state.presetSelect.addEventListener('change', function () {
      applyPreset(state, parseInt(state.presetSelect.value, 10));
    });
    state.applyButton.addEventListener('click', function () { applyInputs(state); });
    state.moneyInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        applyInputs(state);
      }
    });
    state.coinsInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        applyInputs(state);
      }
    });
    state.stepButton.addEventListener('click', function () {
      stopPlaying(state);
      stepForward(state);
    });
    state.playButton.addEventListener('click', function () { togglePlay(state); });
    state.finishButton.addEventListener('click', function () {
      stopPlaying(state);
      state.filledThrough = state.money;
      renderDp(state);
    });
    state.resetButton.addEventListener('click', function () {
      stopPlaying(state);
      state.filledThrough = -1;
      renderDp(state);
    });

    applyPreset(state, 0);
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-widget="change"]');
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
