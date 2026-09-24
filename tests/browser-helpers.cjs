// Control randomness only in the test browser. Production uses crypto.getRandomValues.
async function draftGame(page,{mode='local',first='red',confirmBySecondTap=false,picks={red:['general','knight'],blue:['vanguard','assassin']}}={}){
  await page.selectOption('#opponent',mode);
  await page.evaluate(bit=>{const original=crypto.getRandomValues;crypto.getRandomValues=function(array){crypto.getRandomValues=original;original.call(crypto,array);array[0]=bit;return array;};},first==='red'?0:1);
  await page.click('#tossBtn');
  for(let i=0;i<4;i++){
    const side=i%2===0?first:first==='red'?'blue':'red';
    if(mode==='local'||side==='red'){await page.locator(`[data-hero="${picks[side][Math.floor(i/2)]}"]`).click();if(await page.locator('#confirmHero').isVisible()){if(confirmBySecondTap){const done=await page.locator('#draftOrder .done').count();if(done!==i)throw Error('First tap must only preview a hero');await page.locator(`[data-hero="${picks[side][Math.floor(i/2)]}"]`).click();}else await page.locator('#confirmHero').click();}}
    await page.waitForFunction(i=>!document.querySelector('#setupDialog').open||document.querySelectorAll('#draftOrder .done').length>i,i);
  }
  await page.locator('#setupDialog').waitFor({state:'hidden'});
}
module.exports={draftGame};
