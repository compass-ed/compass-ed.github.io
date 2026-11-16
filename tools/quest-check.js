/* Self-check for the Compass Quest retry rules: node tools/quest-check.js */
const assert = require("assert"), Q = require("../assets/quest.js");
const key = [1, 0, 3, 2];   // the correct option of each question
const mark = ans => ans.map((a, i) => ({ i, ans: a, c: key[i], why: "w" + i }));
let answers = [1, 2, -1, 2], res = mark(Q.payload(answers));
assert.deepStrictEqual(Q.wrong(res), [1, 2]);                       // only the wrong ones (unanswered counts as wrong)
let r = Q.retry(answers, res);
assert.deepStrictEqual(r.ask, [1, 2]);                              // re-asked: exactly those
assert.deepStrictEqual(r.answers, [1, null, null, 2]);              // right answers kept, wrong ones cleared
assert.deepStrictEqual(answers, [1, 2, -1, 2]);                     // the input is not changed
r.answers[1] = 0;                                                   // fixes one, runs out of time on the other
assert.deepStrictEqual(Q.payload(r.answers), [1, 0, -1, 2]);        // the full set is sent again, same length
res = mark(Q.payload(r.answers));
assert.deepStrictEqual(Q.retry(r.answers, res).ask, [2]);           // next round asks only what is still wrong
assert.deepStrictEqual(Q.wrong(mark(key)), []);                     // all right: nothing left to retry
assert.deepStrictEqual(Q.retry(key, mark(key)).answers, key);
console.log("quest retry rules: ok");
