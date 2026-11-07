// The Python port (host/insights_py.py, used by the MCP server) must give the numbers the dashboard shows.
// This computes the statistics with extension/insights.js on test/fixtures/library.json and compares them with the committed
// test/fixtures/expected.json; host/test_mcp.py then asserts the Python port equals that same file.
// After an intentional change to insights.js:  UPDATE_EXPECTED=1 node --test test/parity.test.mjs   (and port the change to Python).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { creatorStats, formatStats, keywordStats, creativeBrief, FORMATS } from "../extension/insights.js";

const FIX = new URL("./fixtures/", import.meta.url);
const lib = JSON.parse(readFileSync(new URL("library.json", FIX), "utf8")).items;
// The stop-word list is not exported, so read it from the source text.
const stopWords = () => new Function("return " + readFileSync(new URL("../extension/insights.js", import.meta.url), "utf8").match(/const STOP = new Set\((\(.*?\))\.split\(" "\)\);/s)[1])().split(" ");
const plain = (x) => JSON.parse(JSON.stringify(x)); // what a JSON file keeps: no undefined, NaN becomes null
const fresh = () => plain({
  creatorStats: creatorStats(lib), formatStats: formatStats(lib),
  keywordStats: keywordStats(lib), keywordStats_min3: keywordStats(lib, { min: 3 }), creativeBrief: creativeBrief(lib),
  // the fixture cannot exercise every word of every pattern, so compare the patterns and stop words themselves
  formatPatterns: FORMATS.map(([name, re]) => [name, re.source, re.flags]), stopWords: stopWords().sort(),
});

test("fixture: varied enough to mean something", () => {
  assert.ok(lib.length >= 12);
  assert.ok(lib.some((v) => v.like_count === null) && lib.some((v) => !("like_count" in v)), "null and missing like_count both present");
  assert.ok(new Set(lib.map((v) => v.platform)).size >= 4);
  const f = fresh();
  assert.ok(f.creativeBrief.ideas.length >= 3 && f.creativeBrief.hooks.length >= 2 && f.keywordStats.length >= 5 && f.formatStats.length >= 6);
});

test("parity: committed expected.json equals a fresh computation from insights.js (drift fails here)", () => {
  const now = fresh();
  if (process.env.UPDATE_EXPECTED) writeFileSync(new URL("expected.json", FIX), JSON.stringify(now, null, 1) + "\n");
  const committed = JSON.parse(readFileSync(new URL("expected.json", FIX), "utf8"));
  assert.deepEqual(committed, now);
});
