const {test}=require('node:test'),assert=require('node:assert/strict');
require('../github-sync.js');
const G=globalThis.GitHubSync;
test('requires an in-memory token and validates repository details',async()=>{
  G.configure('');await assert.rejects(G.sync({owner:'me',repo:'game',dataset:{schema:1}}),/Token/);
  G.configure('test-token');await assert.rejects(G.sync({owner:'bad owner',repo:'game',dataset:{schema:1}}),/格式不正确/);
  await assert.rejects(G.sync({owner:'me',repo:'game',dataset:{schema:2}}),/格式不兼容/);
});
test('creates and updates an UTF-8 dataset without placing its token in the URL or body',async()=>{
  const original=global.fetch,calls=[];G.configure('secret-token');global.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==='PUT')return new Response(JSON.stringify({commit:{sha:'commit-sha'},content:{html_url:'https://github.com/user/repo/blob/main/training-data/training-dataset.json'}}),{status:200});
    if(calls.length===1)return new Response(JSON.stringify({sha:'old-file-sha'}),{status:200});
    return new Response('{}',{status:200});
  };
  try{
    const dataset={schema:1,hero:'魔术师',games:[{winner:'red'}]};
    const result=await G.sync({owner:'Noitome2000',repo:'crystal-duel',dataset});
    assert.equal(result.commit,'commit-sha');assert.match(result.url,/training-data/);
    const get=calls[0],put=calls[1],payload=JSON.parse(put.options.body);
    assert.match(get.url,/\/contents\/training-data\/training-dataset\.json\?ref=main$/);
    assert.equal(get.options.headers.Authorization,'Bearer secret-token');
    assert.ok(!get.url.includes('secret-token'));assert.ok(!put.options.body.includes('secret-token'));
    assert.equal(payload.sha,'old-file-sha');assert.equal(payload.branch,'main');
    const bytes=Buffer.from(payload.content,'base64').toString('utf8');assert.deepEqual(JSON.parse(bytes),dataset);
    assert.ok(!JSON.stringify(dataset).includes('secret-token'));
  }finally{global.fetch=original;G.configure('');}
});
test('creates the dataset when the repository file does not exist',async()=>{
  const original=global.fetch,calls=[];G.configure('temporary');global.fetch=async(url,options)=>{calls.push({url:String(url),options});return calls.length===1?new Response('{"message":"Not Found"}',{status:404}):new Response('{"content":{}}',{status:201});};
  try{await G.sync({owner:'Noitome2000',repo:'crystal-duel',dataset:{schema:1}});assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].options.body).sha,undefined);}
  finally{global.fetch=original;G.configure('');}
});
