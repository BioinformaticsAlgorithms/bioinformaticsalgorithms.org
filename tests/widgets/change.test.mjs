// Tests for the Change Problem widget core: node tests/widgets/change.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const change = require('../../assets/widgets/change.js');

let passed = 0;

function check(name, testFunction) {
  testFunction();
  passed += 1;
  console.log('ok - ' + name);
}

// Brute force: try every count of every coin (small money only).
function bruteForceMinCoins(money, coins, index = 0) {
  if (money === 0) {
    return 0;
  }
  if (index === coins.length) {
    return Infinity;
  }
  let best = Infinity;
  for (let count = 0; count * coins[index] <= money; count += 1) {
    const rest = bruteForceMinCoins(money - count * coins[index], coins, index + 1);
    if (rest + count < best) {
      best = rest + count;
    }
  }
  return best;
}

// Literal RecursiveChange with a call counter and a tally of each value computed.
function runRecursiveChange(money, coins, tally) {
  tally.calls += 1;
  tally.byValue[money] = (tally.byValue[money] || 0) + 1;
  if (money === 0) {
    return 0;
  }
  let minNumCoins = Infinity;
  for (const coin of coins) {
    if (money >= coin) {
      const numCoins = runRecursiveChange(money - coin, coins, tally);
      if (numCoins + 1 < minNumCoins) {
        minNumCoins = numCoins + 1;
      }
    }
  }
  return minNumCoins;
}

function sum(numbers) {
  let total = 0;
  for (const value of numbers) {
    total += value;
  }
  return total;
}

check('BA5A sample: money 40, coins (50, 25, 20, 10, 5, 1) gives 2', () => {
  assert.equal(change.dpChange(40, [50, 25, 20, 10, 5, 1]), 2);
});

check('lesson example: Roman denarii change 48 with 2 coins', () => {
  assert.equal(change.dpChange(48, [120, 40, 30, 24, 20, 10, 5, 4, 1]), 2);
});

check('lesson table: MinNumCoins(0..12) for (5, 4, 1)', () => {
  const steps = change.dpChangeSteps(12, [5, 4, 1]);
  const values = steps.map((step) => step.value);
  assert.deepEqual(values, [0, 1, 2, 3, 1, 1, 2, 3, 2, 2, 2, 3, 3]);
});

check('lesson walkthrough: MinNumCoins(7) tries 2, 3, 2 and the 5 coin wins', () => {
  const steps = change.dpChangeSteps(7, [5, 4, 1]);
  const lookups = steps[7].attempts.map((attempt) => attempt.lookupValue);
  assert.deepEqual(lookups, [2, 3, 2]);
  assert.equal(steps[7].value, 3);
  assert.equal(steps[7].winningCoin, 5);
});

check('greedy counterexample from the lesson: 48 = 40 + 5 + 1 + 1 + 1', () => {
  const result = change.greedyChange(48, [120, 40, 30, 24, 20, 10, 5, 4, 1]);
  assert.deepEqual(result.change, [40, 5, 1, 1, 1]);
  assert.equal(result.stuckAt, 0);
});

check('greedy counterexample with 20s present: 40 greedily is 25 + 10 + 5', () => {
  const result = change.greedyChange(40, [50, 25, 20, 10, 5, 1]);
  assert.deepEqual(result.change, [25, 10, 5]);
  assert.ok(result.change.length > change.dpChange(40, [50, 25, 20, 10, 5, 1]));
});

check('greedy is optimal for US coins at 76 cents: 50 + 25 + 1', () => {
  const result = change.greedyChange(76, [100, 50, 25, 10, 5, 1]);
  assert.deepEqual(result.change, [50, 25, 1]);
  assert.equal(change.dpChange(76, [100, 50, 25, 10, 5, 1]), 3);
});

check('greedy reports being stuck when no coin fits', () => {
  const result = change.greedyChange(3, [5, 2]);
  assert.deepEqual(result.change, [2]);
  assert.equal(result.stuckAt, 1);
  assert.equal(change.dpChange(3, [5, 2]), Infinity);
});

check('DPChange matches brute force on all money <= 40 for several coin sets', () => {
  const coinSets = [[5, 4, 1], [120, 40, 30, 24, 20, 10, 5, 4, 1], [50, 25, 20, 10, 5, 1], [7, 3], [9, 6, 4], [11, 5, 2], [1]];
  for (const coins of coinSets) {
    for (let money = 1; money <= 40; money += 1) {
      assert.equal(change.dpChange(money, coins), bruteForceMinCoins(money, coins), 'money ' + money + ' coins ' + coins);
    }
  }
});

check('reconstructed optimal coins sum to money and have the minimum count', () => {
  const coinSets = [[5, 4, 1], [120, 40, 30, 24, 20, 10, 5, 4, 1], [9, 6, 4]];
  for (const coins of coinSets) {
    for (let money = 1; money <= 40; money += 1) {
      const steps = change.dpChangeSteps(money, coins);
      const chosen = change.optimalCoinsFromSteps(steps, money);
      if (steps[money].value === Infinity) {
        assert.equal(chosen, null);
      } else {
        assert.equal(sum(chosen), money);
        assert.equal(chosen.length, steps[money].value);
      }
    }
  }
});

check('recursive call count matches a literal RecursiveChange on small cases', () => {
  const cases = [[12, [5, 4, 1]], [20, [5, 4, 1]], [15, [7, 3]], [18, [9, 6, 4]], [25, [10, 5, 1]]];
  for (const [money, coins] of cases) {
    const tally = { calls: 0, byValue: {} };
    runRecursiveChange(money, coins, tally);
    assert.equal(change.recursiveCallCount(money, coins), String(tally.calls));
    for (const value of Object.keys(tally.byValue)) {
      assert.equal(change.timesComputed(money, Number(value), coins), String(tally.byValue[value]), 'value ' + value);
    }
  }
});

check('lesson claim: MinNumCoins(70) is computed six times for 76 with (5, 4, 1)', () => {
  assert.equal(change.timesComputed(76, 70, [5, 4, 1]), '6');
});

check('MinNumCoins(30) for 76 with (5, 4, 1): tens of millions of recomputations', () => {
  // Independent count: ordered ways to write 46 as a sum of 5s, 4s and 1s.
  const ways = [1];
  for (let n = 1; n <= 46; n += 1) {
    let total = 0;
    for (const coin of [5, 4, 1]) {
      if (n >= coin) {
        total += ways[n - coin];
      }
    }
    ways.push(total);
  }
  assert.equal(change.timesComputed(76, 30, [5, 4, 1]), String(ways[46]));
  assert.equal(ways[46], 54108332);
});

check('drawn tree for 76 with (5, 4, 1) has 1, 3, 9, 27 nodes and shows 70 five times', () => {
  const levels = change.recursionTreeLevels(76, [5, 4, 1]);
  assert.deepEqual(levels.map((level) => level.length), [1, 3, 9, 27]);
  let seventy = 0;
  for (const level of levels.slice(1)) {
    for (const node of level) {
      if (node.value === 70) {
        seventy += 1;
      }
    }
  }
  assert.equal(seventy, 5);
});

check('big decimal addition is exact past 2^53', () => {
  assert.equal(change.addDecimalStrings('9007199254740993', '9007199254740993'), '18014398509481986');
  assert.equal(change.addDecimalStrings('0', '0'), '0');
  assert.equal(change.addDecimalStrings('999', '1'), '1000');
});

check('input validation returns messages instead of throwing', () => {
  assert.ok(change.parseMoney('abc').error);
  assert.ok(change.parseMoney('0').error);
  assert.ok(change.parseMoney('100000').error);
  assert.equal(change.parseMoney(' 48 ').money, 48);
  assert.ok(change.parseCoins('').error);
  assert.ok(change.parseCoins('5, x').error);
  assert.ok(change.parseCoins('0, 1').error);
  assert.deepEqual(change.parseCoins('(1, 5, 4, 5)').coins, [5, 4, 1]);
});

console.log(passed + ' tests passed');
