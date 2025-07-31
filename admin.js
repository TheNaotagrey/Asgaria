async function fetchJSON(url, options){
  const resp = await fetch(url, options);
  return resp.json();
}

function renderList(elem, items){
  elem.innerHTML = '';
  items.forEach(it=>{
    const li = document.createElement('li');
    li.textContent = `${it.id} - ${it.name}`;
    elem.appendChild(li);
  });
}

async function loadAll(){
  const [seigneurs, religions, cultures, kingdoms, counties, duchies] = await Promise.all([
    fetchJSON('/api/seigneurs'),
    fetchJSON('/api/religions'),
    fetchJSON('/api/cultures'),
    fetchJSON('/api/kingdoms'),
    fetchJSON('/api/counties'),
    fetchJSON('/api/duchies'),
  ]);
  renderList(document.getElementById('listSeigneurs'), seigneurs);
  renderList(document.getElementById('listReligions'), religions);
  renderList(document.getElementById('listCultures'), cultures);
  renderList(document.getElementById('listKingdoms'), kingdoms);
  renderList(document.getElementById('listCounties'), counties);
  renderList(document.getElementById('listDuchies'), duchies);
  const countyKingdom = document.getElementById('countyKingdom');
  countyKingdom.innerHTML = kingdoms.map(k=>`<option value="${k.id}">${k.name}</option>`).join('');
  const duchyCounty = document.getElementById('duchyCounty');
  duchyCounty.innerHTML = counties.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

async function addSeigneur(){
  const name = document.getElementById('newSeigneur').value.trim();
  if(!name) return;
  await fetchJSON('/api/seigneurs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  document.getElementById('newSeigneur').value='';
  loadAll();
}
async function addReligion(){
  const name = document.getElementById('newReligion').value.trim();
  if(!name) return;
  await fetchJSON('/api/religions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  document.getElementById('newReligion').value='';
  loadAll();
}
async function addCulture(){
  const name = document.getElementById('newCulture').value.trim();
  if(!name) return;
  await fetchJSON('/api/cultures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  document.getElementById('newCulture').value='';
  loadAll();
}
async function addKingdom(){
  const name = document.getElementById('newKingdom').value.trim();
  if(!name) return;
  await fetchJSON('/api/kingdoms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  document.getElementById('newKingdom').value='';
  loadAll();
}
async function addCounty(){
  const name = document.getElementById('newCounty').value.trim();
  const kingdom_id = parseInt(document.getElementById('countyKingdom').value,10);
  if(!name) return;
  await fetchJSON('/api/counties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,kingdom_id})});
  document.getElementById('newCounty').value='';
  loadAll();
}
async function addDuchy(){
  const name = document.getElementById('newDuchy').value.trim();
  const county_id = parseInt(document.getElementById('duchyCounty').value,10);
  if(!name) return;
  await fetchJSON('/api/duchies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,county_id})});
  document.getElementById('newDuchy').value='';
  loadAll();
}

loadAll();
