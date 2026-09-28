const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { TrialBudget } = require('../adapters/trial-budget.cjs');
const { ResearchBudget } = require('../adapters/trial-budget.cjs');
test('trial budget persists charges and reserves concurrent or unknown in-flight costs', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-budget-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'budget.json'); const budget = new TrialBudget(file);
  const first = budget.reserve('google/gemini-2.5-flash-lite');
  const second = budget.reserve('google/gemini-2.5-flash-lite');
  assert.throws(() => budget.reserve('google/gemini-2.5-flash-lite'), /plafond/);
  budget.settle(first, 0.001); budget.settle(second, undefined);
  const reloaded = new TrialBudget(file, 100);
  assert.equal(reloaded.snapshot().limitUsd, 1);
  assert.equal(reloaded.snapshot().spentUsd, 0.001);
  assert.equal(reloaded.snapshot().heldUsd, 0.45);
  assert.throws(() => budget.reserve('another/paid-model'), /plafond/);
});
test('research limit upgrades preserve spent costs and never silently raise an existing ledger', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tvlens-authorized-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'research.json'),old=new TrialBudget(file);const id=old.reserve('google/gemini-2.5-flash');old.settle(id,0.2);
  const research=new ResearchBudget(file);assert.equal(research.snapshot().limitUsd,1);
  research.transaction(d=>{d.limitUsd=5;});
  assert.deepEqual(research.snapshot(),{limitUsd:5,spentUsd:0.2,heldUsd:0,calls:1});
  assert.equal(new TrialBudget(path.join(dir,'original.json')).snapshot().limitUsd,1);
});
