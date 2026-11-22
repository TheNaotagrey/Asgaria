// Isolated fixtures: verifies the real pages without changing the game's database.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const output = path.resolve(process.env.UI_SCREENSHOT_DIR || 'output/bugs-focused-ui');
const app=express(); app.use(express.json());
let admin=false, seigneurs=[];
const createdAt=new Date().toISOString().replace('T',' ').replace(/\.\d+Z$/,'');
const state={seigneurie:{id:1,seigneur_id:1,population:150,type:'seigneur'},
  seigneur:{name:'Aëlor',player_name:'Propriétaire elfe'},barony:{id:1,name:'Lunepierre'},
  inventaire:{or_:100,fer:5},buildings:{},infrastructures:{6:{built:1,effect_0_remaining:10}},
  employment:{employed:5,slaves:0},production:{},capacities:{},
  baronyProps:{sea_access:1,high_sea_boat_limit:4},landTxMax:0,navalTxMax:0,
  landTransactions:0,navalTransactions:0};
app.use('/api',(req,res)=>{
  if(req.path==='/me') return res.json({id:99,first_name:'Administrateur',is_admin:admin,act_as_admin:admin});
  if(req.path==='/test_mode') return res.json({enabled:false});
  if(req.path==='/my_seigneurie') return res.json(state);
  if(req.path==='/notifications') return res.json([{id:1,message:'Transaction reçue',created_at:createdAt}]);
  if(req.path==='/trade_transactions') return res.json([{id:1,resources:{or_:1},state:'En Attente',created_at:createdAt,origin_name:'Zephyr'}]);
  if(req.path==='/building_properties') return res.json([{id:4,label:'Bateau en Haute-Mer',max:'high_sea_boat_limit',infra_restrictions:'{}',player_type: 'seigneur',costs:'{}'}]);
  if(req.path==='/infrastructure_properties') return res.json([
    {id:7,label:'Port',type:'civil',player_type: 'seigneur',effects:'[]',costs:'{}'},
    {id:6,label:'Forge',type:'civil',player_type: 'seigneur',effects:'[{"type":"instant_production","uses_per_month":10,"amount":1,"resource":"armureries","costs":{"fer":2}}]',costs:'{}'}]);
  if(req.path==='/seigneurs' && req.method==='POST') {
    const item={...req.body,id:2};seigneurs.push(item);return res.json(item);
  }
  if(req.path==='/seigneurs') return res.json(seigneurs);
  if(req.path==='/seigneuries') return res.json([{id:1,seigneur_id:1,baronnie_id:1}]);
  if(req.path==='/baronies') return res.json([{id:1,name:'Lunepierre',seigneur_id:1},{id:2,name:'Kief'}]);
  if(req.path==='/trade_routes') return res.json([{id:1,barony_id_1:1,barony_id_2:2,path:[1,2]}]);
  if(req.path==='/admin/update_policy') return res.json({blocked:false,limitEnabled:false,limit:{year:1026,number:1}});
  res.json([]);
});
app.use(express.static(root));
(async()=>{
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.UI_BROWSER_PATH?{executablePath:process.env.UI_BROWSER_PATH}:{})});
  const errors=[];
  try {
    fs.mkdirSync(output,{recursive:true});
    for(const mode of [false,true]) for(const width of [1440,390]) {
      admin=mode;seigneurs=[{id:1,name:'Aëlor',player:1}];
      const page=await browser.newPage({viewport:{width,height:1000},timezoneId:'America/Toronto'});
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**',route=>route.abort());
      await page.addInitScript(()=>localStorage.setItem('gestionActiveTab','sommaire'));
      const base=`http://127.0.0.1:${server.address().port}`;
      await page.goto(base+'/gestion.html');await page.waitForSelector('#generalInfoTable');
      assert.match(await page.locator('#generalInfoTable').innerText(),/Propriétaire elfe/);
      await page.waitForSelector('#pendingTxTable .timeago');
      assert.equal(await page.locator('#pendingTxTable .timeago').getAttribute('datetime'),createdAt.replace(' ','T')+'Z');
      await page.locator('.bell-btn').click();
      await page.waitForSelector('#notificationPanel time');
      assert.equal(await page.locator('#notificationPanel time').getAttribute('datetime'),createdAt.replace(' ','T')+'Z');
      await page.locator('.bell-btn').click();
      await page.locator('.tab-btn[data-tab="infra"]').click();
      const boat=page.locator('#buildingsTable tr').filter({hasText:'Bateau en Haute-Mer'});
      assert.match(await boat.innerText(),/Port/);
      assert.equal(await boat.locator('.build-btn').isDisabled(),true);
      const forge=page.locator('#civilInfraTable tr').filter({hasText:'Forge'}).first();
      assert.match(await forge.innerText(),/10/);
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-port-forge.png`),fullPage:true});
      await page.locator('.tab-btn[data-tab="commerce"]').click();
      assert.doesNotMatch(await page.locator('#tradeLimitsTable').innerText(),/Illimitée/);
      assert.equal(await page.locator('.trade-btn').isDisabled(),true);
      await page.screenshot({path:path.join(output,`${mode?'admin':'joueur'}-${width}-quota-zero.png`),fullPage:true});
      if(mode) {
        await page.goto(base+'/admin.html');
        await page.locator('.tab-btn[data-tab="baronies"]').click();
        await page.waitForSelector('#tableBaronies select');
        await page.locator('.tab-btn[data-tab="seigneurs"]').click();
        await page.waitForSelector('#tableSeigneurs tbody tr');
        const add=page.locator('#tableSeigneurs tbody tr').last();
        await add.locator('input').first().fill('Naïriel nouvellement créée');
        await add.getByRole('button',{name:'Ajouter',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('#tableSeigneurs tbody tr').length === 3);
        assert.ok(await page.locator('#tableSeigneurs input').evaluateAll(inputs=>inputs.some(input=>input.value==='Naïriel nouvellement créée')));
        await page.locator('.tab-btn[data-tab="baronies"]').click();
        await page.waitForFunction(()=>[...document.querySelectorAll('#tableBaronies select')].some(select=>select.textContent.includes('Naïriel nouvellement créée')));
        await page.screenshot({path:path.join(output,`admin-${width}-nouveau-seigneur.png`),fullPage:true});
      }
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log('Corrections UI validées : propriétaire, dates UTC, port requis, forge renouvelée, quota zéro, nouveau seigneur sans rechargement ; ordinateur/mobile, joueur/admin.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
