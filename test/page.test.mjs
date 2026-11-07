import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseCount, outlierFlags } from "../extension/urls.js";

const COUNTS = [["451.3K", 451300], ["6.2M", 6200000], ["1.1B", 1100000000], ["1,234", 1234], ["1.2万", 12000], ["640k", 640000], [" 872K ", 872000], ["12", 12],
  ["1.2M views", 1200000], ["", null], ["abc", null], [null, null], ["K", null], ["12 likes", null]];
const FLAG_CASES = {
  median: [10, 10, 10, 10, 50],
  ties: [100, 100, 50, 10, 10],
  few: [10, 10, 500],
  missing: [null, 1000, 0, 10, 10, 10],
};

test("parseCount: table", () => { for (const [t, n] of COUNTS) assert.equal(parseCount(t), n, JSON.stringify(t)); });

test("outlierFlags: median, multiple, outlier threshold", () => {
  const f = outlierFlags(FLAG_CASES.median);
  assert.deepEqual(f.map((x) => x.rank), [2, 2, 2, 2, 1]);
  assert.equal(f[4].multiple, 5); assert.equal(f[0].multiple, 1);
  assert.deepEqual(f.map((x) => x.outlier), [false, false, false, false, true]);
  assert.equal(outlierFlags([10, 10, 10, 20])[3].outlier, true); // exactly 2x the median counts
  assert.equal(outlierFlags([10, 10, 10, 19])[3].outlier, false);
});

test("outlierFlags: ties share a rank; all equal -> no outliers", () => {
  assert.deepEqual(outlierFlags(FLAG_CASES.ties).map((x) => x.rank), [1, 1, 3, 4, 4]);
  assert.ok(outlierFlags([7, 7, 7, 7, 7]).every((x) => !x.outlier && x.multiple === 1));
});

test("outlierFlags: fewer than 4 items with views -> never an outlier", () => {
  assert.ok(outlierFlags(FLAG_CASES.few).every((x) => !x.outlier));
  assert.equal(outlierFlags(FLAG_CASES.few)[2].rank, 1);
});

test("outlierFlags: items without views get rank null and do not count", () => {
  const f = outlierFlags(FLAG_CASES.missing);
  assert.deepEqual(f.map((x) => x.rank), [null, 1, null, 2, 2, 2]);
  assert.equal(f[0].outlier, false); assert.equal(f[0].multiple, null);
  assert.equal(f[1].outlier, true); // 4 items with views, median 10, 1000 is 100x
});

test("detect.js carries identical parseCount / outlierFlags", () => {
  const win = {}; vm.runInNewContext(readFileSync(new URL("../extension/detect.js", import.meta.url), "utf8"), { window: win });
  const D = win.__oneclickDetect;
  for (const [t] of COUNTS) assert.equal(D.parseCount(t), parseCount(t), JSON.stringify(t));
  for (const v of Object.values(FLAG_CASES)) assert.deepEqual(JSON.parse(JSON.stringify(D.outlierFlags(v))), outlierFlags(v));
});
