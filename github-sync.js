/* Optional GitHub Contents API sync. The token stays in this page's memory. */
(function(root){
  'use strict';
  let token='';
  function configure(value){token=String(value||'').trim();}
  function configured(){return !!token;}
  function encode(value){const bytes=new TextEncoder().encode(value),binary=Array.from(bytes,b=>String.fromCharCode(b)).join('');return btoa(binary);}
  async function request(url,options={}){
    const response=await fetch(url,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}
    if(!response.ok)throw Error(data?.message||`GitHub 请求失败（${response.status}）`);return data;
  }
  async function sync({owner,repo,branch='main',path='training-data/training-dataset.json',message,dataset}){
    if(!configured())throw Error('请先填写 GitHub Token');
    if(!/^[A-Za-z0-9_.-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo))throw Error('GitHub 用户名或仓库名格式不正确');
    if(!dataset||dataset.schema!==1)throw Error('训练数据格式不兼容');
    const file=path.split('/').map(encodeURIComponent).join('/'),base=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${file}`;
    let existing=null;try{existing=await request(`${base}?ref=${encodeURIComponent(branch)}`);}catch(error){if(!/404|Not Found/i.test(error.message))throw error;}
    const payload={message:message||`Update AI training data (${new Date().toISOString()})`,branch,content:encode(JSON.stringify(dataset,null,2))};if(existing?.sha)payload.sha=existing.sha;
    const result=await request(base,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    return {commit:result.commit?.sha||null,url:result.content?.html_url||null,bytes:JSON.stringify(dataset).length};
  }
  root.GitHubSync={configure,configured,sync};
})(typeof globalThis!=='undefined'?globalThis:this);
