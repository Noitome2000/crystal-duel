const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist'),port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
 try{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/crystal-duel'){res.writeHead(302,{Location:'/crystal-duel/'});return res.end();}
  if(name.startsWith('/crystal-duel/'))name=name.slice('/crystal-duel'.length);
  if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${port}/crystal-duel/`));
