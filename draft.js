(function(root){
  'use strict';
  const R=typeof module!=='undefined'&&module.exports?require('./rules-engine.js'):root.Rules;
  function create(){return {stage:'coin',first:null,index:0,picks:{red:[],blue:[]},history:[]};}
  function toss(s,bit){if(s.stage!=='coin'||(bit!==0&&bit!==1))throw Error('不能重复投币');s.first=bit===0?'red':'blue';s.stage='draft';return current(s);}
  function current(s){if(s.stage!=='draft')return null;return {side:s.index%2===0?s.first:s.first==='red'?'blue':'red',slot:Math.floor(s.index/2)+1};}
  function choose(s,side,hero){const turn=current(s);if(!turn||turn.side!==side)throw Error('请按顺序选将');if(!R.HEROES[hero]||s.picks[side].includes(hero))throw Error('请选择未使用的英雄');s.picks[side].push(hero);s.history.push({...turn,hero});s.index++;if(s.index===4)s.stage='ready';return current(s);}
  const api={create,toss,current,choose};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GameDraft=api;
})(typeof globalThis!=='undefined'?globalThis:this);
