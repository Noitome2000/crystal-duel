const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../training-library.js');
function fixture(){const base={ruleVersion:'endgame-20-ply-v1',runId:'batch',first:'red',winner:'red',trajectory:[{action:'keep intact'}]};
  const hit={...base,id:'hit',rosters:{red:['mage','knight'],blue:['dragon','ranger']}};
  const keep={...base,id:'keep',rosters:{red:['knight','general'],blue:['dragon','ranger']}};
  return {...L.empty(),games:[hit,{...hit,id:'validation',purpose:'validation'},{...hit,id:'old',ruleVersion:'old',winner:null},keep],
    models:[{id:'trained'}],runs:[{id:'batch',learning:{candidateId:'trained'},results:[hit,keep]}],meta:[{key:'champion',id:'trained'}]};
}
test('cleanup removes entire games including validation and old rules, preserving unrelated trajectories',()=>{
  const original=fixture(),before=JSON.stringify(original),result=L.cleanHero(original,'mage');
  assert.equal(result.removed,3);assert.equal(result.retained,1);assert.equal(result.modelsCleared,1);
  assert.equal(JSON.stringify(original),before);assert.deepEqual(result.dataset.games,[original.games[3]]);
  assert.deepEqual(result.dataset.models,[]);assert.deepEqual(result.dataset.meta,[]);
  assert.equal(result.dataset.statistics.completed,1);assert.equal(result.dataset.statistics.heroes.mage.appearances,0);
  assert.equal(result.dataset.runs.length,1);assert.equal(result.dataset.runs[0].results.length,1);assert.equal(result.dataset.runs[0].learning,undefined);
});
test('cleanup handles the target on either side and leaves models alone when no games match',()=>{
  const original=fixture();assert.equal(L.preview(original,'ranger').removed,4);
  const noOp=L.cleanHero(original,'assassin');assert.equal(noOp.removed,0);assert.equal(noOp.dataset,original);assert.equal(noOp.modelsCleared,0);
  const all=L.cleanHero(original,'ranger');assert.deepEqual(all.dataset.games,[]);assert.deepEqual(all.dataset.runs,[]);assert.equal(all.dataset.statistics.completed,0);
});
test('library validation rejects malformed and duplicate ids before any mutation',()=>{
  for(const invalid of [null,{schema:2}, {...L.empty(),games:[{}]}, {...fixture(),games:[fixture().games[0],fixture().games[0]]}])assert.throws(()=>L.validate(invalid));
  assert.throws(()=>L.preview(fixture(),'unknown'));assert.deepEqual(L.empty().models,[]);
});
