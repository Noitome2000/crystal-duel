// Publish only game assets, never local tools, screenshots, credentials or design documents.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
const files=['index.html','styles.css','draft.css','mobile.css','game.js','rules-engine.js','ai.js','draft.js','self-play.js','training.html','training.css','training.js','training-library.js','training-store.js','learning.js','github-sync.js','assets/icon.svg','assets/icon.ico','vendor/three.min.js','vendor/THREE-LICENSE.txt'];
fs.rmSync(out,{recursive:true,force:true});
for(const file of files){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log(`Built ${files.length} game files in dist/`);
