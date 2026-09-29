'use strict';

const PRICES = {
  plan: 60,
  cadPerStep: 70,
  pdfPerStep: 210,
  surveyPerStep: 350,
  kmRate: 0.70,
  travelHourRate: 75,
  frameMarkup: 1.20
};

const AREA_OPTIONS = [
  {steps:1,label:'bis ca. 200 m²'},
  {steps:2,label:'bis ca. 400 m²'},
  {steps:3,label:'bis ca. 600 m²'},
  {steps:4,label:'bis ca. 800 m²'},
  {steps:5,label:'bis ca. 1.000 m²'},
  {steps:6,label:'über 1.000 m²'}
];

// Prototype origin: Osnabrück city centre. Replace with the desired public business origin later.
const ORIGIN = { lon: 8.0472, lat: 52.2799 };
let route = null;
let verifiedGeo = null;
let verifiedAddressInput = '';

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(value);
const source = () => document.querySelector('input[name="source"]:checked')?.value || 'none';
const inventoryMode = () => document.querySelector('input[name="inventory"]:checked')?.value || 'customer';
const planKnowledge = () => document.querySelector('input[name="planKnowledge"]:checked')?.value || 'unknown';
const framesWanted = () => document.querySelector('input[name="frames"]:checked')?.value === 'yes';
const deliveryMode = () => document.querySelector('input[name="delivery"]:checked')?.value || 'print';

function renderFloorAreas() {
  const raw=$('floorCount').value, count=raw==='more'?0:Number(raw||0), wrap=$('floorAreas');
  wrap.replaceChildren();
  $('highriseNote')?.classList.toggle('hidden', raw!=='more');
  const types=['Kellergeschoss','Untergeschoss','Erdgeschoss','Obergeschoss','ausgebautes Dachgeschoss','Staffelgeschoss','Zwischengeschoss / Mezzanin','Galerieebene','Technikgeschoss','Parkebene','Weiß ich nicht / sonstiges Geschoss'];
  for(let i=1;i<=count;i++){
    const row=document.createElement('div'); row.className='floor-row';
    row.innerHTML=`<div><label class="field-label">Geschoss ${i} – Art</label><select id="floorType${i}" class="floor-type">${types.map(t=>`<option ${t===(i===1?'Kellergeschoss':i===2?'Erdgeschoss':'Obergeschoss')?'selected':''}>${t}</option>`).join('')}</select></div>
    <div><label class="field-label">ungefähre Grundfläche</label><select id="area${i}" class="area-select">${AREA_OPTIONS.map(o=>`<option value="${o.steps}">${o.label}</option>`).join('')}</select></div>`;
    wrap.appendChild(row);
  }
  wrap.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>{renderConstructionChoices();calculate();}));
  renderConstructionChoices(); calculate();
}
function floorLabel(i){return $(`floorType${i}`)?.value||`Geschoss ${i}`;}
function renderConstructionChoices(){
  const box=$('constructionFloorChoices'); if(!box)return;
  const old=new Set([...box.querySelectorAll('input:checked')].map(x=>x.value));
  box.innerHTML='';
  for(let i=1;i<=Number($('floorCount').value||0);i++){
    const l=document.createElement('label'); l.className='check-option';
    l.innerHTML=`<input type="checkbox" name="constructionFloor" value="${i}" ${old.has(String(i))?'checked':''}><span>${floorLabel(i)}</span>`;
    box.appendChild(l);
  }
  box.querySelectorAll('input').forEach(x=>x.addEventListener('change',()=>{
    const all=$('constructionAll');
    if(all) all.checked=[...box.querySelectorAll('input')].length>0 && [...box.querySelectorAll('input')].every(i=>i.checked);
    calculate();
  }));
  const all=$('constructionAll');
  if(all){
    all.checked=box.querySelectorAll('input').length>0 && [...box.querySelectorAll('input')].every(i=>i.checked);
  }
}

function framePurchasePrice(count) {
  if (count >= 50) return 20.30;
  if (count >= 25) return 21.60;
  if (count >= 10) return 22.90;
  if (count >= 5) return 24.10;
  if (count >= 2) return 25.40;
  return 27.90;
}

function preparationCost(steps, kind) {
  if (kind === 'cad') return steps * PRICES.cadPerStep;
  if (kind === 'pdf') return steps * PRICES.pdfPerStep;
  return steps * PRICES.surveyPerStep;
}

function calculate() {
  const kind = source();
  const onsite = inventoryMode() === 'us' || kind === 'none';
  const selectedConstruction=[...document.querySelectorAll('input[name="constructionFloor"]:checked')].map(x=>Number(x.value));
  const constructionPrepPdf=selectedConstruction.reduce((sum,i)=>{
    const s=$(`area${i}`); return sum+(s?preparationCost(Number(s.value),kind):0);
  },0);
  const constructionKnownPdf=Number.parseInt($('constructionPlans').value,10)>0;
  const constructionCountPdf=constructionKnownPdf
    ? Math.max(1,Number.parseInt($('constructionPlans').value,10)||1)
    : automaticPlanCountForSelects(selectedConstruction.map(i=>$(`area${i}`)).filter(Boolean));
  const constructionFloorsPdf=selectedConstruction.map(i=>floorLabel(i)).join(', ');

  $('routeControls').classList.add('hidden');
  $('planQualityNote').classList.toggle('hidden', kind === 'none');
  const constructionYes=document.querySelector('input[name="constructionVariant"]:checked')?.value==='yes';
  $('constructionFloors').classList.toggle('hidden',!constructionYes);
  $('customerInventory').classList.toggle('hidden', onsite);
  $('onsiteInventory').classList.toggle('hidden', kind !== 'none');
  const floorCount = Number($('floorCount').value || 0);
  if (!floorCount) {
    $('netTotal').textContent = '–';
    $('total').textContent = '';
    $('breakdown').textContent = 'Bitte zuerst die Anzahl der Geschosse auswählen.';
    return;
  }

  const knowledge = planKnowledge();
  let plans = 0;
  let planCost = 0;
  let planLine = '';
  if (knowledge === 'known') {
    plans = Math.max(1, Number.parseInt($('plans').value,10) || 1);
    planCost = plans * PRICES.plan;
    planLine = `<strong>Planerstellung:</strong> ${plans} × ${money(PRICES.plan)} = ${money(planCost)}`;
  } else {
    plans = automaticMainPlanCount();
    planCost = plans * PRICES.plan;
    planLine = `<strong>Planerstellung:</strong> ${plans} ${planWord(plans)} automatisch angesetzt × ${money(PRICES.plan)} = ${money(planCost)}<br><span class="calc-note">Kalkulationsannahme: 2 Pläne je angefangenen 200 m² relevanter Geschossfläche. Die endgültige Anzahl wird nach Prüfung der Unterlagen festgelegt.</span>`;
  }
  if ($('resultTitle')) $('resultTitle').textContent = `${plans} ${plans===1 ? 'Flucht- und Rettungsplan' : 'Flucht- und Rettungspläne'}`;
  let frameCost = 0;
  let frameLine = '';
  const printed = deliveryMode() === 'print';
  const wantsFrames = printed && framesWanted();
  $('frameCard').classList.toggle('muted-card', !printed);
  document.querySelectorAll('#frameCard input[name="frames"]').forEach(r => r.disabled = !printed);
  $('frameSkippedNote')?.classList.toggle('hidden', printed);
  const planCountKnownForFrames = plans > 0;
  $('frameUnknownNote').classList.toggle('hidden', !(wantsFrames && !planCountKnownForFrames));
  if (wantsFrames && planCountKnownForFrames) {
    const purchaseEach = framePurchasePrice(plans);
    const customerEach = purchaseEach * PRICES.frameMarkup;
    frameCost = plans * customerEach;
    const regularEach = framePurchasePrice(1) * PRICES.frameMarkup;
    const quantityDiscount = Math.max(0, plans * (regularEach - customerEach));
    frameLine = `<strong>DIN-A3-Klapprahmen silbermatt, schwerentflammbar nach DIN 4102-B1:</strong> ${plans} × ${money(customerEach)} = ${money(frameCost)}<br><span class="calc-note">inkl. Aufschlag für Bestellung, Abwicklung und Versandkosten; ${quantityDiscount > 0 ? `Mengenrabatt von ${money(quantityDiscount)} berücksichtigt.` : 'Preis für Einzelabnahme.'}</span>`;
  } else if (wantsFrames) {
    frameLine = `<strong>DIN-A3-Klapprahmen silbermatt, schwerentflammbar nach DIN 4102-B1:</strong> noch nicht berücksichtigt<br><span class="calc-note">Rahmenanzahl und Preis werden zusammen mit der endgültigen Plananzahl ermittelt.</span>`;
  } else if (!printed) {
    frameLine = `<strong>Ausgabe:</strong> nur PDF – keine Ausdrucke oder Rahmen kalkuliert`;
  } else {
    frameLine = `<strong>DIN-A3-Klapprahmen silbermatt, schwerentflammbar nach DIN 4102-B1:</strong> nicht benötigt / kundenseitig vorhanden`;
  }

  const selects = [...document.querySelectorAll('.area-select')];
  let prep = 0;
  const floorLines = selects.map((select,index) => {
    const steps = Number(select.value);
    const cost = preparationCost(steps,kind);
    prep += cost;
    return `${floorLabel(index+1)} (${select.options[select.selectedIndex].text}): ${money(cost)}`;
  });

  const constructionFloorIds=constructionYes?[...document.querySelectorAll('input[name="constructionFloor"]:checked')].map(x=>Number(x.value)):[];
  let constructionPrep=0;
  constructionFloorIds.forEach(i=>{const s=$(`area${i}`); if(s) constructionPrep+=preparationCost(Number(s.value),kind);});
  const constructionPlanKnown=Number.parseInt($('constructionPlans').value,10)>0;
  const constructionSelectedAreaSelects=constructionFloorIds.map(i=>$(`area${i}`)).filter(Boolean);
  const constructionPlans=constructionYes
    ? (constructionPlanKnown ? Math.max(1,Number.parseInt($('constructionPlans').value,10)||1) : automaticPlanCountForSelects(constructionSelectedAreaSelects))
    : 0;
  const constructionPlanCost=constructionPlans*PRICES.plan;

  let distanceCost = 0, timeCost = 0;
  if (onsite && route) {
    const roundKm = route.km * 2;
    const roundHours = route.hours * 2;
    distanceCost = roundKm * PRICES.kmRate;
    timeCost = roundHours * PRICES.travelHourRate;
  }

  const netTotal=planCost+frameCost+prep+constructionPrep+constructionPlanCost+distanceCost+timeCost;
  const total=netTotal*1.19;
  $('netTotal').textContent=money(netTotal)+' netto*';
  $('total').textContent=`${money(total)} brutto · inkl. 19 % USt.`;
  const prepName = kind === 'cad' ? 'CAD-Aufbereitung' : kind === 'pdf' ? 'Vollständige Digitalisierung' : 'Vor-Ort-Aufmaß und Aufbereitung / Neuzeichnen der Pläne';
  const lines = [
    planLine,
    frameLine,
    `<strong>${prepName}:</strong>`,
    ...floorLines
  ];
  if(constructionYes) {
    const ptxt=constructionPlanKnown
      ? `${constructionPlans} zusätzliche ${planWord(constructionPlans)}`
      : `${constructionPlans} zusätzliche ${planWord(constructionPlans)} automatisch angesetzt (2 je angefangenen 200 m²); endgültige Anzahl wird geprüft`;
    const flabels=constructionFloorIds.map(i=>floorLabel(i)).join(', ');
    lines.push(`<strong>Bauphasen-Variante:</strong> ${flabels || 'noch kein Geschoss ausgewählt'}; zusätzliche Grundrissaufbereitung ${money(constructionPrep)} netto auf Basis der oben angegebenen Geschossfläche${constructionPlanKnown ? ` + ${money(constructionPlanCost)} für ${ptxt}` : `; ${ptxt}`}.`);
  }
  if (onsite) {
    if (route) {
      lines.push(`<strong>Fahrtstrecke:</strong> ${(route.km*2).toFixed(1)} km × ${money(PRICES.kmRate)} = ${money(distanceCost)}`);
      lines.push(`<strong>Fahrzeit:</strong> ${(route.hours*2).toFixed(2)} Std. × ${money(PRICES.travelHourRate)} = ${money(timeCost)}`);
    } else {
      lines.push('<strong>Anfahrt:</strong> noch nicht berechnet');
    }
  }
  $('breakdown').innerHTML = lines.join('<br>');
}

async function verifyAddress() {
  const address = $('address').value.trim();
  const status = $('addressCheckStatus');
  if (!address) return false;
  if (verifiedGeo && verifiedAddressInput === address) return true;
  if (status) { status.className='route-status'; status.textContent='Ort / Adresse wird geprüft …'; }
  try {
    const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(address)}`, {headers:{'Accept-Language':'de'}});
    if (!geoResponse.ok) throw new Error('Adressprüfung derzeit nicht erreichbar');
    const geo = await geoResponse.json();
    if (!geo.length) throw new Error('Ort / Adresse nicht gefunden');
    verifiedGeo = geo[0];
    verifiedAddressInput = address;
    if (status) { status.className='route-status ok'; status.textContent=`Gefunden: ${geo[0].display_name}`; }
    return true;
  } catch(err) {
    verifiedGeo = null; verifiedAddressInput=''; route=null;
    if (status) { status.className='route-status error'; status.textContent=`${err.message}. Bitte Schreibweise prüfen oder mindestens PLZ und Ort angeben.`; }
    return false;
  }
}

async function calculateRoute() {
  const status = $('routeStatus');
  const address = $('address').value.trim();
  if (!address) return false;
  const ok = await verifyAddress();
  if (!ok) return false;
  status.className = 'route-status';
  status.textContent = 'Fahrtstrecke und Fahrzeit werden im Hintergrund ermittelt …';
  try {
    const routeResponse = await fetch(`https://router.project-osrm.org/route/v1/driving/${ORIGIN.lon},${ORIGIN.lat};${verifiedGeo.lon},${verifiedGeo.lat}?overview=false`);
    if (!routeResponse.ok) throw new Error('Routing fehlgeschlagen');
    const data = await routeResponse.json();
    if (!data.routes?.length) throw new Error('Keine Route gefunden');
    route = {km:data.routes[0].distance/1000, hours:data.routes[0].duration/3600};
    status.className = 'route-status ok';
    status.textContent = 'Fahrtstrecke und Fahrzeit wurden für die Kalkulation ermittelt.';
    calculate();
    return true;
  } catch (err) {
    route = null;
    status.className = 'route-status error';
    status.textContent = `Fahrtstrecke konnte nicht ermittelt werden: ${err.message}.`;
    calculate();
    return false;
  }
}

function updateUsage() {
  const value = $('usage').value;
  const show = value === 'mixed' || value === 'other';
  $('usageOtherWrap').classList.toggle('hidden', !show);
  $('usageOther').required = show;
  $('usageOtherLabel').innerHTML = (value === 'mixed'
    ? 'Welche Nutzungen gibt es im Objekt?'
    : 'Bitte beschreiben Sie die Nutzung kurz.') + ' <span class="required-mark">*</span>';
  $('usageOther').placeholder = value === 'mixed'
    ? 'z. B. Büro, Werkstatt und Lager'
    : 'Nutzung kurz beschreiben';
}

function updateInventory() {
  const kind = source();
  const radios = [...document.querySelectorAll('input[name="inventory"]')];
  const forced = kind === 'none';
  if (forced) {
    const us = document.querySelector('input[name="inventory"][value="us"]');
    us.checked = true;
    radios.forEach(r => r.disabled = true);
  } else {
    radios.forEach(r => r.disabled = false);
  }
  $('customerInventoryOption')?.classList.toggle('is-disabled', forced);
  $('usInventoryOption')?.classList.toggle('is-disabled', forced);
  if ($('inventoryHeading')) $('inventoryHeading').textContent = forced ? 'Vor-Ort-Aufnahme' : 'Wer soll die Angaben vor Ort aufnehmen?';
  if ($('inventoryHint')) $('inventoryHint').textContent = forced
    ? 'Da keine aktuellen bzw. ausreichenden Grundrissunterlagen angegeben wurden, ist eine Aufnahme der relevanten Gegebenheiten vor Ort erforderlich.'
    : 'Kein Fachwissen nötig: Entscheiden Sie nur, ob wir den Vor-Ort-Abgleich übernehmen oder ob Sie die Angaben selbst erfassen möchten.';
  route = null;
  calculate();
}

function updatePlanChoice() {
  const knowledge = planKnowledge();
  $('knownPlans').classList.toggle('hidden', knowledge !== 'known');
  $('unknownPlans').classList.toggle('hidden', knowledge !== 'unknown');
  calculate();
}


function getUsageLabel() {
  const value = $('usage').value;
  if (!value) return 'nicht angegeben';
  if (value === 'mixed' || value === 'other') return $('usageOther').value.trim() || 'nicht näher beschrieben';
  return $('usage').options[$('usage').selectedIndex].text;
}

function planWord(n){ return n===1 ? 'Plan' : 'Pläne'; }
function automaticPlanCountForSelects(selects){
  return selects.reduce((sum,s)=>sum+(Number(s.value)||0)*2,0);
}
function automaticMainPlanCount(){
  return automaticPlanCountForSelects([...document.querySelectorAll('.area-select')]);
}

function getPlanCountText() {
  const knowledge = planKnowledge();
  if (knowledge === 'known') {
    const n=Math.max(1, Number.parseInt($('plans').value,10) || 1);
    return `${n} ${planWord(n)}`;
  }
  const n=automaticMainPlanCount();
  return n ? `automatisch kalkuliert: ${n} ${planWord(n)} (2 je angefangenen 200 m²); endgültige Anzahl wird geprüft` : 'wird nach Prüfung ermittelt';
}

function getCalculationData() {
  calculate();
  const floorCount = Number($('floorCount').value || 0);
  const areas = [...document.querySelectorAll('.area-select')].map((s,i) => `${floorLabel(i+1)}: ${s.options[s.selectedIndex].text}`);
  const netText = $('netTotal').textContent.replace('*','').trim();
  const grossText = $('total').textContent.trim();
  const kind = source();
  const sourceText = kind === 'cad' ? 'CAD-Datei vorhanden' : kind === 'pdf' ? 'PDF / Papier' : 'keine verwertbaren Pläne';
  const onsite = inventoryMode() === 'us' || kind === 'none';
  const selectedConstruction=[...document.querySelectorAll('input[name="constructionFloor"]:checked')].map(x=>Number(x.value));
  const constructionPrepPdf=selectedConstruction.reduce((sum,i)=>{
    const s=$(`area${i}`); return sum+(s?preparationCost(Number(s.value),kind):0);
  },0);
  const constructionKnownPdf=Number.parseInt($('constructionPlans').value,10)>0;
  const constructionCountPdf=constructionKnownPdf
    ? Math.max(1,Number.parseInt($('constructionPlans').value,10)||1)
    : automaticPlanCountForSelects(selectedConstruction.map(i=>$(`area${i}`)).filter(Boolean));
  const constructionFloorsPdf=selectedConstruction.map(i=>floorLabel(i)).join(', ');

  // Strukturierte Positionen für die angebotähnliche PDF-Darstellung.
  const pdfPlans = planKnowledge() === 'known' ? Math.max(1, Number.parseInt($('plans').value,10) || 1) : automaticMainPlanCount();
  const pdfRows = [];
  pdfRows.push({desc:'Erstellung / Aktualisierung Flucht- und Rettungspläne', qty:pdfPlans, unit:'Stück', each:PRICES.plan, total:pdfPlans*PRICES.plan});
  if(deliveryMode()==='print' && framesWanted()){
    const eachFrame=framePurchasePrice(pdfPlans)*PRICES.frameMarkup;
    const regularEach=framePurchasePrice(1)*PRICES.frameMarkup;
    const discount=Math.max(0,pdfPlans*(regularEach-eachFrame));
    pdfRows.push({desc:'DIN-A3-Klapprahmen silbermatt, schwerentflammbar nach DIN 4102-B1', qty:pdfPlans, unit:'Stück', each:eachFrame, total:pdfPlans*eachFrame, note:`inkl. Bestellung, Abwicklung und Versandkosten${discount>0?`; Mengenrabatt ${money(discount)} berücksichtigt`:''}`});
  }
  const prepRows=[...document.querySelectorAll('.area-select')];
  if(prepRows.length){
    const prepTotal=prepRows.reduce((sum,sel)=>sum+preparationCost(Number(sel.value),kind),0);
    const labels=prepRows.map((_,i)=>floorLabel(i+1));
    const counts={}; labels.forEach(l=>counts[l]=(counts[l]||0)+1);
    const floorSummary=Object.entries(counts).map(([label,count])=>count>1?`${count} × ${label}`:label).join(', ');
    const desc=kind==='cad'?'CAD-Aufbereitung Grundrisse':kind==='pdf'?'Digitalisierung Grundrisse':'Vor-Ort-Aufmaß und Aufbereitung / Neuzeichnen der Grundrisse';
    pdfRows.push({desc,qty:prepRows.length,unit:'Geschosse',each:null,total:prepTotal,note:floorSummary});
  }
  if(document.querySelector('input[name="constructionVariant"]:checked')?.value==='yes'){
    if(constructionPrepPdf>0) pdfRows.push({desc:'Zusätzliche Aufbereitung für Bauphasen-Variante',qty:1,unit:'pauschal',each:constructionPrepPdf,total:constructionPrepPdf});
    if(constructionCountPdf>0) pdfRows.push({desc:'Zusätzliche Flucht- und Rettungspläne für Bauphase',qty:constructionCountPdf,unit:'Stück',each:PRICES.plan,total:constructionCountPdf*PRICES.plan});
  }
  if(onsite && route){
    const km=route.km*2, hrs=route.hours*2;
    pdfRows.push({desc:'Fahrtstrecke Hin- und Rückfahrt',qty:km,unit:'km',each:PRICES.kmRate,total:km*PRICES.kmRate});
    pdfRows.push({desc:'Fahrzeit Hin- und Rückfahrt',qty:hrs,unit:'Std.',each:PRICES.travelHourRate,total:hrs*PRICES.travelHourRate});
  }

  return {
    costRows: pdfRows,
    customer: $('customerName').value.trim() || 'nicht angegeben',
    contact: $('contactName').value.trim() || 'nicht angegeben',
    email: $('customerEmail').value.trim() || 'nicht angegeben',
    phone: $('customerPhone').value.trim() || 'nicht angegeben',
    mobile: $('customerMobile').value.trim() || 'nicht angegeben',
    address: $('address').value.trim() || 'nicht angegeben',
    usage: getUsageLabel(),
    source: kind==='cad'
      ? 'Der Kunde hat CAD-Dateien (z. B. DWG, DXF oder PLN / Archicad) angegeben. Die Eignung wird fachlich geprüft.'
      : kind==='pdf'
        ? 'Der Kunde hat PDF- oder Papierpläne angegeben. Für die Vorkalkulation wird eine vollständige Digitalisierung angesetzt; die Eignung der Unterlagen wird geprüft.'
        : 'Es wurden keine bzw. nur sehr alte oder unvollständige Grundrisspläne angegeben. Vorsorglich wird ein Vor-Ort-Aufmaß kalkuliert.',
    inventory: onsite
      ? 'Die Angaben vor Ort werden durch Mein Brandschutzportal aufgenommen und mit den vorhandenen Unterlagen abgeglichen.'
      : 'Der Auftraggeber möchte die Angaben vor Ort mit dem Erfassungstool von Mein Brandschutzportal selbst erfassen. Die übermittelten Angaben werden anschließend fachlich geprüft.',
    delivery: deliveryMode() === 'print'
      ? 'Die Flucht- und Rettungspläne werden als Ausdruck und zusätzlich als PDF benötigt.'
      : 'Die Flucht- und Rettungspläne werden nur digital als PDF benötigt.',
    frames: deliveryMode() === 'print'
      ? (framesWanted()
          ? 'Zu den gedruckten Plänen werden Klapprahmen silbermatt, schwerentflammbar nach DIN 4102-B1, mitgeliefert.'
          : 'Für die gedruckten Pläne werden keine Rahmen mitgeliefert; diese sind vorhanden oder werden kundenseitig beschafft.')
      : 'Da ausschließlich PDF-Dateien benötigt werden, werden keine Rahmen kalkuliert.',
    floors: floorCount,
    areas,
    plans: getPlanCountText(),
    planCount: planKnowledge() === 'known' ? Math.max(1, Number.parseInt($('plans').value,10) || 1) : automaticMainPlanCount(),
    construction: document.querySelector('input[name="constructionVariant"]:checked')?.value === 'yes'
      ? (constructionKnownPdf
          ? `Für ${constructionFloorsPdf || 'die ausgewählten Geschosse'} wird eine zusätzliche Bauphasen-Variante benötigt. Die zusätzliche Grundrissaufbereitung beträgt ${money(constructionPrepPdf)} netto; zusätzlich werden ${constructionCountPdf} ${planWord(constructionCountPdf)} zu je ${money(PRICES.plan)} kalkuliert.`
          : `Für ${constructionFloorsPdf || 'die ausgewählten Geschosse'} wird eine zusätzliche Bauphasen-Variante benötigt. Die zusätzliche Grundrissaufbereitung von ${money(constructionPrepPdf)} netto ist anhand der angegebenen Geschossfläche berücksichtigt. Für die Vorkalkulation werden ${constructionCountPdf} zusätzliche ${planWord(constructionCountPdf)} angesetzt (2 je angefangenen 200 m²); die endgültige Anzahl wird geprüft.`)
      : 'Es wird keine zusätzliche Planvariante für eine Bauphase benötigt.',
    net: netText,
    gross: grossText,
    breakdownText: $('breakdown').innerText.trim(),
    notes: $('customerNotes').value.trim() || 'keine',
    route: onsite && route ? `Hin und zurück ca. ${(route.km*2).toFixed(1)} km / ${Math.round(route.hours*120)} Min.` : (onsite ? 'noch nicht berechnet' : 'entfällt')
  };
}

function validateForPdf() {
  const missing = [];
  if (!$('address').value.trim()) missing.push('Objektadresse');
  if (!$('usage').value) missing.push('Nutzung');
  if (['other','mixed'].includes($('usage').value) && !$('usageOther').value.trim()) missing.push('Beschreibung der Nutzung');
  if (!$('floorCount').value) missing.push('relevante Geschosse');
  if ((inventoryMode() === 'us' || source() === 'none') && !route) missing.push('Entfernung und Fahrzeit');
  if (missing.length) {
    $('actionStatus').textContent = `PDF noch nicht möglich – bitte zuerst ergänzen: ${missing.join(', ')}.`;
    $('actionStatus').className = 'action-status error';
    $('actionStatus').scrollIntoView({behavior:'smooth',block:'center'});
    return false;
  }
  return true;
}

function pdfEscape(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[–—]/g,'-');
}
function wrapText(text,max=82){
  const words=String(text).split(/\s+/), lines=[]; let line='';
  for(const w of words){const n=line?line+' '+w:w;if(n.length>max&&line){lines.push(line);line=w}else line=n}
  if(line)lines.push(line); return lines;
}
function winAnsiBytes(str){
  const map={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
  const out=[]; for(const ch of str){const c=ch.charCodeAt(0);out.push(map[ch]??(c<=255?c:63));} return out;
}
const PORTAL_LOGO_JPEG_HEX='FFD8FFE000104A46494600010100000100010000FFDB0043000201010101010201010102020202020403020202020504040304060506060605060606070908060709070606080B08090A0A0A0A0A06080B0C0B0A0C090A0A0AFFDB004301020202020202050303050A0706070A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0AFFC0001108017A010803012200021101031101FFC4001F0000010501010101010100000000000000000102030405060708090A0BFFC400B5100002010303020403050504040000017D01020300041105122131410613516107227114328191A1082342B1C11552D1F02433627282090A161718191A25262728292A3435363738393A434445464748494A535455565758595A636465666768696A737475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFC4001F0100030101010101010101010000000000000102030405060708090A0BFFC400B51100020102040403040705040400010277000102031104052131061241510761711322328108144291A1B1C109233352F0156272D10A162434E125F11718191A262728292A35363738393A434445464748494A535455565758595A636465666768696A737475767778797A82838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE2E3E4E5E6E7E8E9EAF2F3F4F5F6F7F8F9FAFFDA000C03010002110311003F00FDFCA28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A28A2800A2B8EF8B5FB44FECFDF00BFB3FFE17AFC74F06F82BFB5BCDFECAFF0084B7C4F69A6FDB3CAD9E6F95F68913CCD9E647BB6E76F98B9C6E15F107C75FF83993FE09E9F0D3ED3A77C25B2F197C47BC3A33DCE9F75A3E8674FD3DAEFF007823B49E5BF30CF172A85E48EDE55549415F318320B8D3A93F8519CEAD2A7F13B1FA21457E087C7FFF00839FBF6DDF887FDADA47C0AF879E0DF875A6DE791FD957DF657D5F57D3F6796D2FEFEE08B497CC65907CD67F2C72ED1F3A896BE2DFDA4BF6E6FDAF7F6BEBD96E7F68FF00DA13C4BE28B696F21BB5D1AEAFBC9D2E0B88A13024D0D84212D60904658168E3524C9212497727A6182A8FE276392798528FC2AE7F5834579AFEC63E00F177C27FD8F7E147C2CF881A4FD835EF0D7C35D0B4AD6EC3CF8E5FB35DDBE9F043347BE36647DB2232EE562A719048C1AF4AAE46ACEC77277570A28A290C28A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A2B9AF8A7F19FE0F7C0CF0FC3E2DF8D9F15FC35E0ED2AE2F16D2DF53F14EBB6FA7DBCB70C8EEB0AC93BA2B4852391828392118E300D093626D25A9D2D15F9F7F1F3FE0E50FF8273FC2FF000F8B9F845AB7897E266AB716774D6965A1E813E9F6F05C468A618EEA6D412168E395DB1E6431DC1408E4A6762BFC41FB497FC1D0BFB5EFC49B29744FD9C3E14F86BE195B4F670AB6A7752FF6EEA905C2CC5DE48649A38ED446F18588C725AC840323070593CBE8861AB4FA5BD4E79E330F0EB7F43F78EBE77F8F9FF0565FF8273FECCDE201E12F8BBFB58786ADF555BCBAB4BBD334313EB17163716CEA9343751E9F1CED6922BB6DDB30424AB800947DBFCE37ED25FB737ED7BFB5F5ECB73FB47FED09E25F145B4B790DDAE8D757DE4E9705C4509812686C21096B048232C0B471A926490924BB93E515D30C0AFB4FEE38E798BFB11FBCFDA5F8EBFF0007597C3EB2FB4E9BFB337ECA3ACEA7E768CFF64D67C77AD4563F64D40F98177D95A09FED102FEE9CE2E6177CBA0F2F0243F107C7FF00F82F47FC14E3E3EFF6B69BFF000BEFFE10AD1B56F23FE24DE00D363D37EC7E57967F717B87BF8F7BC7BDFF00D24EEF31D388DBCBAF8E68AE9861E8C364724F155EA6F22E788BC45E20F187882FFC5BE2DD76F354D5754BC96EF53D4F51BA79EE2EEE2572F24D2C8E4B4923BB1666624B1249249AA74515B1CE145145007F6314571DFB3B7C5AFF0085FBFB3F7817E3AFFC23FF00D93FF09AF8374CD7BFB2BED7E7FD8FED96915C793E6EC4F336799B77ED5DD8CED19C57635E0356763E9D34D5D05145148614514500145145001451450014514500145145001451450014571DF16BF689FD9FBE017F67FF00C2F5F8E9E0DF057F6B79BFD95FF096F89ED34DFB6795B3CDF2BED122799B3CC8F76DCEDF31738DC2BE2CF8F9FF0007287FC139FE17F87C5CFC22D5BC4BF13355B8B3BA6B4B2D0F409F4FB782E234530C77536A090B471CAED8F3218EE0A0472533B15EE34EA4FE14673AB4A9FC4EC7E82515F839FB497FC1D0BFB5EFC49B29744FD9C3E14F86BE195B4F670AB6A7752FF6EEA905C2CC5DE48649A38ED446F18588C725AC840323070593CBF887F692FDB9BF6BDFDAFAF65B9FDA3FF684F12F8A2DA5BC86ED746BABEF274B82E2284C0934361084B5824119605A38D4932484925DC9E9860AA3F89D8E49E614A3F0ABFE07F473F1F3FE0ACBFF0004E7FD99BC403C25F177F6B0F0D5BEAAB79756977A668627D62E2C6E2D9D52686EA3D3E39DAD24576DBB6608495700128FB7E14F8EBFF07597C3EB2FB4E9BFB337ECA3ACEA7E768CFF0064D67C77AD4563F64D40F98177D95A09FED102FEE9CE2E6177CBA0F2F0243F8B54574C3074A3BEA724F1F5E5F0E87D8DF1FF00FE0BD1FF000538F8FBFDADA6FF00C2FBFF00842B46D5BC8FF89378034D8F4DFB1F95E59FDC5EE1EFE3DEF1EF7FF493BBCC74E236F2EBE45F11788BC41E30F105FF008B7C5BAEDE6A9AAEA9792DDEA7A9EA374F3DC5DDC4AE5E49A591C969247762CCCC496249249354E8AE98C2105EEAB1C93A93A8EF2770A28A2A880A28A2800A28A2800A28A2800A28A2803FAFFF00875E00F08FC27F87DA17C2CF87FA4FD8341F0D68D6BA568961E7C92FD9AD2DE258618F7C8CCEFB63455DCCC58E32493935B358DF0EBC7FE11F8B1F0FB42F8A7F0FF56FB7E83E25D1AD755D12FF00C8922FB4DA5C44B34326C9155D3746EADB59430CE080722B66BC077BEA7D3AB5B40A28A290C28A28A0028A28A0028A28A0028A2BF1FF00FE0B21FF0005D1FDAF7F662FDAABC65FB1F7ECE1A4786BC376DE1EB3D295BC6175A7FDBF546B89EDADEFDE4856626D628CC73ADB98E482638591C3A97411694E94AACB962655AB428C39A47EC057CEFF001F3FE0ACBFF04E7FD99BC403C25F177F6B0F0D5BEAAB79756977A668627D62E2C6E2D9D52686EA3D3E39DAD24576DBB6608495700128FB7F9C6FDA4BF6E6FDAF7F6BEBD96E7F68FF00DA13C4BE28B696F21BB5D1AEAFBC9D2E0B88A13024D0D84212D60904658168E3524C9212497727CA2BB61815F69FDC79F3CC5FD88FDE7ED2FC75FF0083ACBE1F597DA74DFD99BF651D6753F3B467FB26B3E3BD6A2B1FB26A07CC0BBECAD04FF68817F74E71730BBE5D07978121F883E3FF00FC17A3FE0A71F1F7FB5B4DFF0085F7FF0008568DAB791FF126F0069B1E9BF63F2BCB3FB8BDC3DFC7BDE3DEFF00E9277798E9C46DE5D7C734574C30F461B239278AAF5379173C45E22F1078C3C417FE2DF16EBB79AA6ABAA5E4B77A9EA7A8DD3CF7177712B97926964725A491DD8B3331258924924D53AF4AF007EC63FB617C58F08DA78FFE167ECA1F12BC4BA0DFF99F60D6FC3FE05D42F2D2E7648D1BF973430B23ED911D0E09C32B03C822BBEF859FF0495FF8295FC62F104DE19F097EC57E3EB4B982CDAE9E4F14E8ADA15B9457442167D48C113C997188D5CB901982908C468E705BB3250A92D933E77A2BEC6FF8701FFC15BBFE8D37FF002FCD07FF0093ABD8FF00E2168FF8281FFD160F839FF8506ABFFCACA875E8AFB48B587AEFECB3F35A8AFD73F007FC1A7FF10752F08DA5EFC53FDB5746D1B5E7F33EDFA6F87FC112EA7690E24609E5DCCD776AF266308C730A6D66651B82876EFBE167FC1A8DF07B48F104D73F1B3F6C2F12F8874A6B365B7B2F0B785ADF47B84B8DE856469A79AF55A3082406311A92594EF014AB43C5505D4D160B12FECFE47E27515FBF7E1DFF00835EFF00E09DFA27882C359D4FC7DF15F58B6B4BC8A7B8D2751F12582DBDEA23866825305847288DC02AC63911C063B5D4E187ABFF00C380FF00E0923FF469BFF97E6BDFFC9D50F1B457734597D77D8FE6B68AFEAA7C3BFF0004CFFF008277F85FC3F61E19D33F61DF8512DB69D6715ADBC9A8F80AC2F2E1D23408A659E789E59E4200DD248ECEE72CCCC4927D2BE167C18F83DF033C3F3784BE09FC28F0D783B4AB8BC6BBB8D33C2DA15BE9F6F2DC322234CD1C088AD2148E352C46484519C0150F1D1E9134596CBAC8FE4C7E167C18F8C3F1CFC413784BE09FC28F12F8C755B7B36BBB8D33C2DA15C6A17115BABA234CD1C08ECB18792352C46017519C915E95E1DFF8267FFC1443C51E20B0F0CE99FB0EFC578AE751BC8AD6DE4D47C057F676E8F2384532CF3C4914118246E92475441966650091FD54D150F1D2E9134596C7AC8FE403E22F803C5DF09FE20EBBF0B3E20693F60D7BC35ACDD695ADD879F1CBF66BBB795A19A3DF1B323ED9119772B1538C82460D6357B1FF00C144FF00E5207F1D3FECB1F89FFF004EB735E395E845DE299E5C95A4D0514514C90A28A2803FAB5FF82767FCA3F3E05FFD91CF0C7FE9AADABD8EBCD7F631F0078BBE13FEC7BF0A3E167C40D27EC1AF786BE1AE85A56B761E7C72FD9AEEDF4F8219A3DF1B323ED9119772B1538C82460D7A557832D64CFA68690414514549414514500145145001451450015FCD6FFC17F3FE52DDF167FEE03FFA61D3ABFA52AFE6B7FE0BF9FF00296EF8B3FF00701FFD30E9D5D982FE2BF4FF00238331FE02F5FD19F1CD14515EA1E3057D8DFF000403FF0094B77C26FF00B8F7FE98751AF8E6BEC6FF008201FF00CA5BBE137FDC7BFF004C3A8D675BF852F466B43F8F1F55F99FD29514515E19F4614514500145145001451450014514500145145007F295FF000513FF009481FC74FF00B2C7E27FFD3ADCD78E57B1FF00C144FF00E5207F1D3FECB1F89FFF004EB735E395EF43E047CCD4F8DFA8574BF077E0EFC4EFDA03E2768BF067E0CF832F3C43E27F10DE0B5D2749B0505E67C16249621638D1159DE472A91A233BB2AAB30E97F64AFD92BE377EDB3F1BB4BF807F00FC31FDA1ACEA1996EAEA7664B4D2ED15944B7B772853E5411EE5CB60B3332468AF24888DFD297FC13C7FE09E3F047FE09CDF0463F859F0B2DFFB4359D43CB9FC63E31BBB654BBD76ED5480EC013E5411EE7586DC3158959892F2492CB2635F111A2BCCE8C361655DDF647E6B7EC95FF06B3F8BBC41A6697E2FFDB4BE3C7F6079F992FF00C15E07B78EE2EE389ED95911F519B30C53C73B15912382E222B17C931F30327D75E02FF83727FE0973E0FBDBCBBF10FC34F12F8AA3BAB3B1820B6D7BC63771A5A3C10F972CF19B26B76325CBFEFA51233A2BF10A411FEEEBEEBA2BCE9622B49EE7AD0C261E0BE1FBC28A28AC0E80A28A2800A28A2800A28A2800A28A2800AFE6B7FE0BF9FF00296EF8B3FF00701FFD30E9D5FD2957F35BFF0005FCFF0094B77C59FF00B80FFE9874EAECC17F15FA7F91C198FF00017AFE8CF8E68A28AF50F182BEC6FF008201FF00CA5BBE137FDC7BFF004C3A8D7C735F637FC100FF00E52DDF09BFEE3DFF00A61D46B3ADFC297A335A1FC78FAAFCCFE94A8A28AF0CFA30A28A2800A28A2800A28A2800A28A2800A28A2803F94AFF008289FF00CA40FE3A7FD963F13FFE9D6E6BC72BD8FF00E0A27FF2903F8E9FF658FC4FFF00A75B9AE97FE0935F00FC3FFB4CFF00C1463E13FC22F16B59B69571E25FED2D4ED351D2D2F6DEFADF4F825D424B3961760AF1CE96A606DD9004A58AB81B1BDD5251A777D11F36E2E75B957567EDF7FC10D7FE09EF65FB0DFEC8563E26F16E897969F117E2559DA6AFE378EF26994D9A2F9AF6361E44B1C66DE4821B83E7232171712CEA647448827DA545715FB45FC59FF851BF04FC45F14A3B2FB44FA5D90FB14263DE8D7323AC30EF1BD098FCD910BE181DA1B193815E0622BC610956A8F449B7E88FABCBB015B1989A583C3ABCE728C22BBCA4D25F7B673DFB4DFED7BF0CFF00661D3A087C48B3EA7ADDFC0F269DA1583A8919406DB2CACC7F730970137E1989DDB51F63EDF8CBE2AFFC14B7F68FF881E7E9FE17BFB2F0A69F2FDA2311E8F6FBAE5A193850F3CBB98488BD24844472C5B03E5DBE1DE34F1A78ABE22F8AAFBC6DE36D727D4755D46732DE5E5C11B9DB000000C05500055550155542800002B2EBF29CCF89B30C6D46A949C21D12D1FCDAD7EED3A1FD9DC23E11F0CF0FE1613C6528E2311BCA52578A7DA317A59746D733B5F4D97A8783FF006D1FDA9FC0DF68FEC5F8DDADCFF6AD9E6FF6C4ABA8EDDBBB1B3ED4B2797F78E76E37719CE063EACFD9BBFE0A79E0EF1E5D2F85BE3CD8D97863507DAB6DAC5AB486C2E64694A84656DCD6B8564F9DDD90ED9199A3C2A9F80E8AE3C0E7D99E02A271A8E4BF964DB5FF0003E563DCE23F0DF8478930F2856C3469CDED529A509A7A2D5A56968AD6926ADB59D99FB51457CB3FF04C0FDA0751F883F0F6F3E0D789EE206BBF094111D2A792F8B5C5D5948EFF00294724ED80848C32FCA1248536AED05FEA6AFD632FC6D2CC3070C453DA5F83EABE4CFE2BE26C8317C2F9E56CB313ACA9BD1F4945ABC64B7DE2D3B5F47A3D530A28A2BB0F0828A28A0028A28A002BF9ADFF0082FE7FCA5BBE2CFF00DC07FF004C3A757F4A55FCD6FF00C17F3FE52DDF167FEE03FF00A61D3ABB305FC57E9FE470663FC05EBFA33E39A28A2BD43C60AFB1BFE0807FF296EF84DFF71EFF00D30EA35F1CD7D8DFF0403FF94B77C26FFB8F7FE98751ACEB7F0A5E8CD687F1E3EABF33FA52A28A2BC33E8C28A28A0028A28A0028A28A0028A28A0028A28A00FE52BFE0A27FF2903F8E9FF658FC4FFF00A75B9AFA53FE0DB6F84BFF000B1FFE0A71A5F8C7FE120FB1FF00C203E0DD5F5EFB37D93CCFB7F991A697E4EEDEBE563FB4BCDDF86CF93B36FCFB97F603E317FC1183FE0999F1EBE276B5F18FE27FECB96777E22F10DE1BBD66F6C3C47AA5825CDC3001E630DA5D471091C8DEEC10191D99DCB3BB31D9FD9B7FE093FF00F04FAFD917E2745F19BF67FF00D9CACF45F13DBD9CD6B69AB5D6B9A86A0F6A9280B21845E5C4AB0C8C994322057D8F226EDB23AB7A12C5C254B95277B1E643055235D4DB56BDCFA22BE38FF82BCF88B59B6F0E781BC2705E6DD3EF6F6FEEEEADFCB53BE68120489B76370DAB7130C0201DFC83818FB1EBE4CFF82B3FC3DD475CF867E1AF8936267922F0FEA935ADE4115A17548EE95313BB83FBB557B748F918669D4641C06F93E248D4964959437B2FB9495FF0B9FAB7853530D4BC41C0CABDB979A495F5F79D39A8FCF99AB767667C15451457E3E7F74851451401EEFF00F04DAF116B3A27ED6DA169BA65E79506B1657D69A8A796ADE742B6D24E172412BFBD8226CAE0FCB8CE0907F4C6BF3A7FE0971E00FF0084A3F68F7F185CDB5EF91E19D127B98AE204FDC8B99B16E91CAC548F9A2927655CA9262C8C85607F45ABF51E0E8CE394B72D9C9DBD2C97E699FC75E3B55C3D4E368C69FC51A3052FF1734DEBDFDD71F9590514515F567E30145145001451450015FCD6FF00C17F3FE52DDF167FEE03FF00A61D3ABFA52AFE6B7FE0BF9FF296EF8B3FF701FF00D30E9D5D982FE2BF4FF238331FE02F5FD19F1CD14515EA1E3057D8DFF0403FF94B77C26FFB8F7FE98751AF8E6BEC6FF8201FFCA5BBE137FDC7BFF4C3A8D675BF852F466B43F8F1F55F99FD29514515E19F461451450014514500145145001457847EDB7FB647FC33068DA768BE13D2ACB52F13EB1BA5B782F64DD0D9DB2300D2CB1A3AC8779CA4601504AC8777EEF637C71FF0F10FDB13FE8AFF00FE5BFA7FFF0023D7CFE63C4B9765B88F633E69496FCA969EB76BF03F4DE17F09B8A78AF2C58FC3BA74E9CAFCAEA4A49CACDA6D28C65A5D5B5B5FA5D6A7E9F515F983FF000F10FDB13FE8AFFF00E5BFA7FF00F23D1FF0F10FDB13FE8AFF00FE5BFA7FFF0023D707FAE995FF0024FEE8FF00F247D27FC401E31FF9FF0087FF00C0AA7FF2A3F4FA8AFCC1FF0087887ED89FF457FF00F2DFD3FF00F91E8FF87887ED89FF00457FFF002DFD3FFF0091E8FF005D32BFE49FDD1FFE483FE200F18FFCFF00C3FF00E0553FF951FA7D58BF11FC01E1CF8A7E04D5BE1DF8B2DBCDD3F58B27B6B8C2233C7B87CB226F565122361D1883B5954F6AFCDBFF0087887ED89FF457FF00F2DFD3FF00F91EBA8F85BFF0541FDA17C21ACBCFF118D978BF4F971BED67B68ACA68B0AF8F2A58230AB96652DBD24C84C2EDC934D717E4F5DFB39C6493D1DD2B5BCECDBFB9113F0378EB2F5F59C3D5A32A90B4A2A139295D3BAE57284629DF5D649799E5FF00B48FECDDE3BFD9A3C76DE13F1647F69B2B9DD268BAD431158750841192064EC917203C6492A48E59591DBCF6BF5B3E1EFC4EF821FB547C3D371A24DA5EBFA6DD4113EA9A0EA70C53496AC5C948EE6DDB76C60F1315C82AC63DC858618F87FC52FF0082517C2BF146B2BA9FC2EF1CDEF85606CFDA34E9ED4EA108C2A05F28BCA922721D9B7BC992FC6C0307C3C770A559FEFB2F929C25AA57D7E4DE8D7CD3F53F45E1CF1A70745FD4389E94B0F88A7A4A5CADC5B5FCD04B9A127D94651EB78AB23E03AD4F05F82FC55F117C5563E09F04E873EA3AAEA3388ACECEDC0DCED824924E02A800B33310AAAA58900135F6A784FF00E0915E0BB3D45E5F1D7C68D5351B430111C1A4E931D948B264618BC8F382B8DC36ED04920EE18C1FA2FE087ECF9F0AFF0067AF0E49E1DF865E1EFB37DA7CB6D46FA794CB737B2226D0F239FF00811D8A1514BB9555DC739E0784330AD517D66D08F5D537F2B5D7E3A767B1D7C43E39F0BE07092FECABE22AFD9BC650827DE4E494B4EC96BB5D6EB17F64CFD9BB46FD9A7E15DBF857CBB2B8D76EFF007DE22D5AD2261F6B9B2C550173B8C71AB6C5E141C33EC5691857A7D1457E9187A14B0B4234A92B462AC8FE4FCCF32C6E719855C6E2E7CD52A372937DDFE496C92D12492D10514515B1C2145145001451450015FCD6FF00C17F3FE52DDF167FEE03FF00A61D3ABFA52AFE6B7FE0BF9FF296EF8B3FF701FF00D30E9D5D982FE2BF4FF238331FE02F5FD19F1CD14515EA1E3057D8DFF0403FF94B77C26FFB8F7FE98751AF8E6BEC6FF8201FFCA5BBE137FDC7BFF4C3A8D675BF852F466B43F8F1F55F99FD29514515E19F461451450014514500158BF11FC7FE1CF859E04D5BE2278B2E7CAD3F47B27B9B8C3A2BC9B47CB1A6F655323B6111491B999477ADAAF80FFE0A79FB48DAF8F3C6307C06F0B49BF4FF000C5E99B58B94962923B9BF31ED5452A0B2F92AF2A37CC32EEEAC83CB563E5E7199432BC0CAB3F8B68AEEFF00E06EFD0FB1E04E13AFC63C454F031D29AF7AA4BF960B7F9B768AF377D933E7BF8D3F14B59F8D7F1535CF8A3AEC5E54FAC5E9952DF72B7D9E1501218772AA87D912A26EDA0B6DDC7926B97A2A7D374DD475AD46DF47D1F4F9EEEEEEE7486D6D6DA23249348C42AA22A82598920003924E2BF1A9CEA56A8E7277949DDF9B67F79E1F0F86C06121429251A74E2A2974518AB25E89220A2BDABFE1DDFF00B627FD120FFCB834FF00FE48A3FE1DDFFB627FD120FF00CB834FFF00E48AECFEC9CD3FE7C4FF00F0197F91E17FAE9C1DFF00432C3FFE0EA7FF00C91E2B45779F173F668F8D3F0234EB3D53E2BF84E0D262D42768AC95B59B39A49994658AC714ACE554632D8DA0B28241650783AE4AB46B509F2558B8BECD59FDCCF6B058FC0E658755F09563529BBDA5092945DB47669B5A3DC28A28ACCEB2EF877C4BE23F086B30F88BC27AFDEE97A85BEEFB3DF69D74F04D16E52ADB5D0865CAB15383C82477AFA9BF65CFF8298F8ABC233DAF827F683967D6B4A79E28A2F1271F6AD3E209B332AAA66E972118B13E6F32313292A83E4CA2BBB03996332EAAA74276F2E8FD57F4FB1F3BC45C2990F14E11D0CC68A95D594B69C7B38CB7567ADB67B34D368FDA1D3752D3B5AD3ADF58D1F5082EED2EE049AD6EADA51247346C032BA3292194820823820E6A7AF933FE094DF1927F11FC3DD5FE0B6B177079BE1C9C5DE8EAD3A2C8F6B3BB9951630A199639B2C6425B9BA55F940507EB3AFD832DC6C331C143111D3996ABB3D9AFBCFE16E2AE1FAFC2DC415F2CAAEFECDE8FF9A2D5E2FE716AEB5B3BAE8145145771F3C14514500145145001451450015FCD6FFC17F3FE52DDF167FEE03FFA61D3ABFA52AFE6B7FE0BF9FF00296EF8B3FF00701FFD30E9D5D982FE2BF4FF00238331FE02F5FD19F1CD14515EA1E3057D8DFF000403FF0094B77C26FF00B8F7FE98751AF8E6BEC6FF008201FF00CA5BBE137FDC7BFF004C3A8D675BF852F466B43F8F1F55F99FD29514515E19F46145145001451506A5A969DA2E9D71AC6B1A84169696903CD757573288E386350599DD9880AA002493C003349B495D8E3194A492576CF30FDB17F686D3BF678F835A86B96BABC11788B5181ED7C336ACE3CC7B838533AA9470CB086F30EE5D848542419173F969A96A5A8EB5A8DC6B1AC6A13DDDDDDCEF35D5D5CCA64926918966776624B3124924F249CD7AB7EDA1FB48DD7ED21F17A7D5B4F936F87F46F32CBC3D124B2EC96112126E8A4806D925F9491B548558D1B25371F22AFC9388B35FED3C73507FBB8691F3EEFE7F9247F6F7859C18B84B8754ABC2D89AD6954BEF1FE587FDBAB57FDE72E96B15F63FFC12E3F66EBABDD65FF695F1347B2DACFCFB2F0DDBBC52A3C9315092DD06C8568C2349081F382CD2676B4433F36FECF9F043C47FB42FC54D3BE197876E3ECDF69DD2DF6A2F6CF2C7656C832F2B05FC15412A19DD14B2EEC8FD66F0D787746F0878734FF09F876CFECFA7E976515A58DBF98CFE5431A0445DCC4B361540C9249C724D7A1C2794FD6B11F5BA8BDD83D3CE5FF037F5B799F2FE3671AFF64656B25C2CBF7B5D3E7B7D9A7B35FF0071355FE152BEE8BB4515F2CFFC14E3F68D83C09F0F57E05F86EFE78F5BF12C092EA2D1A3A8874CDEE18091597E695E33195C3831898305DC84FE818FC6D2CBF092AF5365D3BBE8BE67F32F0D70FE3389F3BA396E1B79BD5DAEA31FB527E496BBABEDBB3E4DFDB0BE3A7FC3417C76D57C69613EFD22D71A7E81F2E33671336D7E511BF78ED24D871B97CDD992145797D1457E2B88AF53155E556A3BCA4EEFE67FA039665D85CA32EA582C32B53A71518AF24ADAF76F76FABBB0A28A2B13B828A28A00ED7F674F8B3FF0A37E367877E294965F68834BBD3F6D8447BDDADA446866D837A0327952394CB01B82E72322BF5B34DD4B4ED6B4EB7D6347D420BBB4BB8126B5BAB694491CD1B00CAE8CA4865208208E0839AFC5EAFBD7FE0973FB436A3E34F0AEA1F02FC5DABCF757DE1F816EB4292E1CBB1D3B2B1B400ECE161729B773925670AA02C5C7DA707E66A8577839ED3D57ADB5FBD2FBD799F8078E9C253CC32E867987579505CB35D5D36F46BFC326EFE526F647D67451457E907F29051451400514514005145140057F35BFF05FCFF94B77C59FFB80FF00E9874EAFE94ABF9ADFF82FE7FCA5BBE2CFFDC07FF4C3A757660BF8AFD3FC8E0CC7F80BD7F467C73451457A878C15F637FC100FFE52DDF09BFEE3DFFA61D46BE39AFB1BFE0807FF00296EF84DFF0071EFFD30EA359D6FE14BD19AD0FE3C7D57E67F4A5451457867D1851451400565F8DFC27A778FBC17ABF817589E78AD35AD2EE2C2EA4B660B2247346D1B142C080C031C1208CF635A9452946338B8BD99A52AB528558D483B4A2D34FB35AA3F217E327C0CF899F01BC552F857E23F86A7B4613BA59DFAC6C6D6FD54293241290048B87427F897700E15B2A391AFD8EF1FFC38F027C53F0E4BE13F889E14B2D634F9771FB3DEC21BCB728C9E646DF7A3902BB012210CBB8E08AE0FC17FB10FECB7F0FBC5563E35F0AFC28821D4B4D9C4D653DC6A77770B14801DAE1269590B29E54904AB00C304023F3DC4F0557FAC7EE2A2E4F3BDD7DCACFF0003FA7B2AFA4065EB2CFF00852C2CFEB097FCBBE5E493E8FDE9270BBDF49DB757D8E5FF00603FD9720F80FF000CD3C5DE2AD2E0FF0084AFC47024F772BDABA4F616AEA8C9647CCC156046F90055F9C853B8448D5EFD4515F7583C251C0E1A34292B28FF0057F99FCE79EE758EE21CDAAE618B95E751DFD1748AF28AB25E48CBF1A78D3C2BF0EBC2B7DE36F1B6B9069DA569D0196F2F2E09DA8B90000064B31242AAA82CCCC14024815F927F1A7E296B3F1AFE2A6B9F1475D8BCA9F58BD32A5BEE56FB3C2A02430EE5550FB22544DDB416DBB8F24D7D3FFF000548FDA46EAF7594FD9ABC3326CB6B3F22F7C497092CA8F24C54BC56A57015A308D1CC4FCE0B3478DAD11CFC715F9DF16E69F5AC52C2D37EEC37F397FC0DBD6E7F527825C1AF26C9DE71898DAB6212E5BF4A5A35FF0081BB49F9286DA8514515F207EE41451450075DF033E0DF8ABE3CFC4CD37E1C7856D272D773A9BFBC8A0122D85A86512DCB82CA36A039C161B98AA03B9941BDFB4AFC14D47F67FF008CBAC7C37BA49DAD209FCED1AEA7049B9B293E689F71440EC07C8E546D1247228FBB5F66FF00C130FE00FF00C2BFF8573FC60F1169BE5EAFE2CC7D87CE871241A721F931BA30CBE6BE6438664745B761C8AD4FF828F7ECF3A77C52F83573F13344D220FF00848BC2701BA374A804971A726E69E0662EA36A02D38C8620C6CA80195B3F611E1A94B20FAC25FBDF8ADFDDEDEB6D7F03F0BABE2C52A7E25FF6536BEA8BF737FF00A7ADAF79BFE552F73B25791F9C55DAFECE9F167FE146FC6CF0EFC5292CBED106977A7EDB088F7BB5B488D0CDB06F4064F2A47299603705CE4645715457C9D2AB3A1563521BC5A6BD56A7ED78DC1D0CC307530B5D5E1522E325DD4934D7DCCFD6CD37F6A3FD9B756D3ADF54B5F8F3E1148AE6049635B9F105BC320560080F1C8EAF1B60F2AC0303C1008C54FF00F0D27FB3A7FD17DF057FE15569FF00C72BF2328AFB25C6D8BB6B4A3F7B3F0697D1F725E676C6D4B7F8627EB9FF00C349FECE9FF45F7C15FF008555A7FF001CABBE1DF8DDF05FC5FACC3E1DF09FC5EF0BEA9A85C6EFB3D8E9DAFDB4F34BB54B36D4472CD8552C7038009ED5F8FF004535C6D89BEB455BD599CFE8F99538350C74D3E97845ABF9ABABFA5D7AA3F6A28AF30FD8FBE3A7FC3417C09D2BC697F3EFD5ED73A7EBFF002E337912AEE7E1117F788D1CD841B57CDD99254D15F7F87AF4F15423569BBC64935F33F99F33CBB17946635705898DAA53938C979A76D3BA7BA7D5599E9F451456C70857F35BFF0005FCFF0094B77C59FF00B80FFE9874EAFE94ABF9ADFF0082FE7FCA5BBE2CFF00DC07FF004C3A757660BF8AFD3FC8E0CC7F80BD7F467C73451457A878C15F637FC100FF00E52DDF09BFEE3DFF00A61D46BE39AFB1BFE0807FF296EF84DFF71EFF00D30EA359D6FE14BD19AD0FE3C7D57E67F4A5451457867D185145140051451400514514005715FB41FC6FF0E7ECF5F0AF51F89BE22B7FB4FD9B6C563A725CA4525EDCB9C244A5BF1662031544760ADB707B5AF82BFE0AC1F14751D5BE26689F08EC75981F4DD234B5BFBCB5B6B82585ECCCEA04EA1B6EE5855190150C16E1CE489057939DE60F2DCBA75A3F16CBD5FF0096FF0023ED7C3EE19871671550C0D5FE1EB29FF823AB575AAE6D237E97B9F2CF897C45ACF8BFC47A878B3C4579F68D4354BD96EEFAE3CB54F36691CBBB6D501572CC4E000067802A951457E34DB93BBDCFEF584214A0A10564B44968925D105145148A0AF50FD8FBE05FFC3417C76D2BC177F06FD22D73A86BFF00363367132EE4E1D1BF78ED1C3943B97CDDF8214D797D7E98FF00C13FFF0066EBAF805F085B56F1347B7C41E2AF22F75188C52C6F69088F305ABA4846244DF2173B54869590EE08AC7DCE1FCB1E659845497B91D65E9D17CDE9E973F3BF13B8BA3C25C3152A5395ABD5BC29F7BBDE5FF6E2774F6E6E54F73DDE8A28AFD80FE173F2B7F6C5FD9E751FD9E3E32EA1A1DAE913C5E1DD4677BAF0CDD321F2DEDCE18C0AC5DCB3425BCB3B9B79015C80245CF94D7EC778FF00E1C7813E29F8725F09FC44F0A596B1A7CBB8FD9EF610DE5B9464F3236FBD1C815D80910865DC7045797FFC3BBFF63BFF00A241FF009706A1FF00C915F9F63F837113C4CA7859C541EB67756F2D13D3B1FD3DC37E3CE5987CA6951CE28D49568249CA0A3253B69CCF9A716A4FAEEAF76ACB45F983457E9F7FC3BBFF0063BFFA241FF9706A1FFC9147FC3BBFF63BFF00A241FF009706A1FF00C915C5FEA5E69FCF0FBE5FFC89EF7FC47EE0EFF9F188FF00C069FF00F2D3F3068AFD3EFF008777FEC77FF4483FF2E0D43FF922A7D37FE09FFF00B21693A8DBEA96BF0720796DA749635B9D5EF668CB2904078E4999245C8E5581523820838A6B82F34BEB387DF2FF00E449978FDC21CAED87AF7FF0D3FF00E5A51FF8277FC319FE1A7ECBFA3CD7F0CF15DF88E7935AB98A5991D55660AB094D9D15ADE381F6925833B671F754AF71A2BF45C261A183C2C284768A4BEEEBF33F9673BCD6BE799BD7CC2B2B4AACE526BB5DDD25E4968BC90514515D079615FCD6FF00C17F3FE52DDF167FEE03FF00A61D3ABFA52AFE6B7FE0BF9FF296EF8B3FF701FF00D30E9D5D982FE2BF4FF238331FE02F5FD19F1CD14515EA1E3057D8DFF0403FF94B77C26FFB8F7FE98751AF8E6BEC6FF8201FFCA5BBE137FDC7BFF4C3A8D675BF852F466B43F8F1F55F99FD29514515E19F4614514500145145001451450015F95BFB70F8B34EF1A7ED5DE35D634B8278E287545B065B85018C96B0C76B211827E52F0B153D4A904807207EA957E35F8DFC59A8F8FBC69ABF8EB588208AEF5AD52E2FEEA3B652B1A49348D23040C490A0B1C0249C7735F13C6D5B970B4A977937F72B7FEDC7F41FD1F303ED339C6E33F929C61FF81CB9B6FF00B87F2F999745153E9BA6EA3AD6A36FA3E8FA7CF7777773A436B6B6D119249A462155115412CC490001C92715F9CA4DBB23FAA2528C62DB7648828A9F52D3751D1751B8D1F58D3E7B4BBB49DE1BAB5B988C72432292AC8EAC0156041041E4118A82869A76611946514D3BA66A78235ED3BC2DE34D23C4FAC787A0D5ED34ED52DEEAEB4AB9C7977B1C722BB40FB9586D700A9CAB0C3743D2BF5EBE1C78FF00C39F14FC09A4FC44F09DCF9BA7EB1649736F974678F70F9A37D8CCA2446CA3A8276B2B0ED5F8E35F567FC130FF00691B5F01F8C67F80DE2993669FE27BD1368F72F2C51C76D7E23DAC8C58066F3952245F98E1D11550F98CC3EAF853348E0B18E854F86A75ECFA7DFB7AFCCFC63C68E0FAB9FE44B32C35DD5C326DC7F9A9BB73595ED78DB9BBB49AD5D91F7E514515FA89FC76145145001451450014514500145145001451450015FCD6FF00C17F3FE52DDF167FEE03FF00A61D3ABFA52AFE6B7FE0BF9FF296EF8B3FF701FF00D30E9D5D982FE2BF4FF238331FE02F5FD19F1CD14515EA1E3057D8DFF0403FF94B77C26FFB8F7FE98751AF8E6BEC6FF8201FFCA5BBE137FDC7BFF4C3A8D675BF852F466B43F8F1F55F99FD29514515E19F46145145001451450014514500715FB487897FE110FD9FFC6BE228F5FF00ECB9EDFC2F7DF62BE175E43C572D03AC3B1F20AC8656454C1C962A072457E4657E957FC14BFC59A77873F651D5347BE8277975FD52CAC2CDA25055245985D12F9230BB2D9C6464EE2A318248FCD5AFCD38D2B73E610A6BECC7F16DFE891FD6DE01605D1E18C4629AD6A55B2F3508C6CFEF9497C82BD27F63DF09EA3E34FDA83C0DA3E973C11CB0F8860BF66B86214C76A7ED5201807E6290B051D0B1009032479B57D17FF04BBF09E9DE23FDA81758BE9E749740F0F5DDFD9AC4C02BC8C63B521F20E5765CB9C0C1DC14E70083F3B9551F6F995187792FBAFAFE07EA3C678EFECDE13C76256F1A53B75F79C5A8FE2D5CF50FF828F7EC75A71D3AE7F68AF857E1F9C5D89CC9E2ED3AC6106378C8666D402E4156040F3768218379A42ED95DFE24AFDA8AFCCEFDBABF64CFF8672F1DC7AD782F4FBD7F07EB5F3584F30DE963724B16B2326E2CD8550E8CE01652465CC6EE7EA78AB245465F5DA0BDD7F12ECFBFCFAF9EBD74FC77C18F10A58EA4B20CC677A915FB9937F1456F06FBC56B1EF1BAD3955FC228A28AF873FA1CFD4BFD8BFF00691B5FDA43E10C1AB6A126DF1068DE5D9788627962DF2CC23045D048C0DB1CBF31036A80CB222E426E3EBB5F94FF00B267ED23ACFECD3F152DFC55E65EDC68577FB9F11693692A8FB5C3860AE038DA648D9B7AF2A4E1937AAC8C6BF5474DD4B4ED6B4EB7D6347D420BBB4BB8126B5BAB694491CD1B00CAE8CA4865208208E0839AFD6F87336599E0AD37FBC8692F3ECFE7D7CEFE47F1178A9C152E11E2073A11B61AB5E54EDB45FDA87FDBADDD7F75AD6E9DA7A28A2BE84FCC028A28A0028A28A0028A28A0028A28A002BF9ADFF82FE7FCA5BBE2CFFDC07FF4C3A757F4A55FCD6FFC17F3FE52DDF167FEE03FFA61D3ABB305FC57E9FE470663FC05EBFA33E39A28A2BD43C60AFB1BFE0807FF00296EF84DFF0071EFFD30EA35F1CD7D8DFF000403FF0094B77C26FF00B8F7FE98751ACEB7F0A5E8CD687F1E3EABF33FA52A28A2BC33E8C28AF8AFFE0A75FB437C5EF027C45D0FE18F80FC697BA169FF00D891EA93CFA3DD496F733CCF34F16D795183796AB1E420C025C96DD84DBF307FC349FED17FF45F7C6BFF008555DFFF001CAF94C7F15E17038B95074DB71D2FA1FB3F0DF82D9C71164B47328E26105555D26A4DDAF657B69AEF63F5CE8AFC8CFF008693FDA2FF00E8BEF8D7FF000AABBFFE3947FC349FED17FF0045F7C6BFF8555DFF00F1CAE4FF005DB0BFF3EA5F7A3DCFF897CCE7FE8369FF00E0323F5CE8AFC8CFF8693FDA2FFE8BEF8D7FF0AABBFF00E3947FC349FED17FF45F7C6BFF008555DFFF001CA3FD76C2FF00CFA97DE83FE25F339FFA0DA7FF0080C8FACFFE0AEBE2CD46CFC17E0BF02C50406D352D52EEFE79194F98B25B471C6814E70148BA9320824955C11839F85EB6FC61F12BE22FC43FB3FF00C27FE3ED6F5CFB1EFF00B27F6C6AB35CF91BF6EED9E631DB9DAB9C75DA33D056257C66718F599E3E5884AC9DAC9F4B24BF3D4FDEF81B86A5C23C35472D9C94A717272924D26E526D6FD934BE415F6A7FC121BC35FF0023CF8C2EB40FF9F0B3B1D524B5FF00AEEF3C29291FF5EECE80FF00CF2247DDAF8AEBF477FE0977E13D47C39FB2FAEB17D3C0F16BFE21BBBFB358989648D4476A43E40C36FB6738191B4A9CE4903D1E13A3ED7398CBF9537F85BF53E57C6AC72C1F0156A77B3AB38417FE05CEEDF283F95CFA2EB9EF8ADF0C7C2BF19BE1EEA9F0CFC6B0CEFA6EAB0049CDB4C63923657574911BFBCAEAAC320A92B860C0907A1A2BF569C21560E13574F46BBA67F18E1F115F0988857A32719C1A945AD1A69DD34FBA7AA3F217E39FC1BF157C06F899A97C38F155A4E1AD276361792C0235BFB52CC22B9401986D703380C76B0642772B01C8D7EA2FEDBFFB394FFB45FC1A974BF0DD84127897479C5E680D23A46646E92DB99194ED5913381945322425982A935F9755F9067D94BCA719CB1D612D62FF004F55FE4CFEE4F0DF8DA1C6B917B6A9655E9DA3512EF6D2697453B3B766A495EC15F7E7FC12D7E3BEB3E39F026ABF083C59AD7DA6E7C33E4CBA2B5D5E2B4CD60E0A18553018C70BA01B896DA2E234F955501F80EBBCFD9ABE35EA3FB3FF00C65D1FE245ABCED6904FE4EB36B0124DCD949F2CA9B43A07603E740C7689238D8FDDACF23CC1E5B98C2AB7EEBD25E8FF00CB7F91D7E21F0C478AF856BE12114EAA5CD4DF5538EB65DB995E1FF6F1FAD94541A6EA5A76B5A75BEB1A3EA105DDA5DC0935ADD5B4A248E68D8065746524329041047041CD4F5FB2269ABA3F82E519464D3566828A28A620A28A2800A28A2800A28A2800AFE6B7FE0BF9FF00296EF8B3FF00701FFD30E9D5FD2957F35BFF0005FCFF0094B77C59FF00B80FFE9874EAECC17F15FA7F91C198FF00017AFE8CF8E68A28AF50F182BEC6FF008201FF00CA5BBE137FDC7BFF004C3A8D7C735F637FC100FF00E52DDF09BFEE3DFF00A61D46B3ADFC297A335A1FC78FAAFCCFE94A8A28AF0CFA33F3DBFE0AC7FF002717A2FF00D8956DFF00A57795F3057DA9FF00053AFD9E7E2F78EFE22E87F13BC07E0BBDD774FF00EC48F4B9E0D1ED64B8B982649A79773C48A5BCB659301C64028436DCA6EF983FE19B3F68BFFA205E35FF00C256EFFF008DD7E459F61314F37ACD41D9BECCFEE1F0DB3AC9E3C0F8184B1104E30B34E514D34DDD34DDD1C5515DAFFC3367ED17FF00440BC6BFF84ADDFF00F1BA3FE19B3F68BFFA205E35FF00C256EFFF008DD791F54C57FCFB97DCCFB8FEDAC9BFE8269FFE071FF338AA2BB5FF00866CFDA2FF00E88178D7FF00095BBFFE3747FC3367ED17FF00440BC6BFF84ADDFF00F1BA3EA98AFF009F72FB987F6D64DFF4134FFF00038FF99C5515DAFF00C3367ED17FF440BC6BFF0084ADDFFF001BA3FE19B3F68BFF00A205E35FFC256EFF00F8DD1F54C57FCFB97DCC3FB6B26FFA09A7FF0081C7FCCE2ABF61FE11F84F51F00FC28F0C7817589E096EF45F0F59585D496CC5A379218123628580254953824038EC2BE0AFD8EFF627F8EDAF7C5ED03C7FE2CF085EF86346F0F6B70DF5C5C6B768D0CD3C96F2472AC31C0FB643BCE07984040039DCCCBB1BF45ABEFB83B2FAD87A752BD58B5CD64AEADA2D5B3F9A3C76E25C066789C2E5D84AB1A8A9F34A6E2D4AD276495D689A49B6AF7D55D2D2E579AFECA1FB5AFC11FDB53E11AFC6DF801E27FED4D05B59BED377CAAB1CF1CB6D70F16658771783CD8C47711A4A125F26E2176442FB45CFDAB3E29F883E067ECBBF127E36784ACECEE355F07780758D734CB7D46377B796E2D2CA69E359551919A32F180C1594904E181E6BF13BFE0DB2FDBABFE1447ED397BFB2678FFC45E47857E28EDFEC4FB65DED82C7C41129F276F993A4717DAA20D6EDB637966992C231800D7DE42939D2949743F9D6A5754EB460FAFF0048FDEFAFCDCFF82917C0BFF8551F1DA4F1A69306DD23C67E6EA10FCD9F2EF030FB527CCECC72EEB364855FF48D8A3086BF48EBCC3F6C2F817FF0D05F02755F05D841BF57B5C6A1A07CD8CDE44ADB539745FDE23490E5CED5F377E09515F3DC4196FF006965D28457BF1D63EABA7CD69EB6EC7E95E19715FF00AA7C554AB5595A8D4FDDD4ECA326AD2FFB7256937BF2F325B9F94D451457E3C7F751FA13FF0004C3F8FDFF000B03E15CFF0007FC45A9799ABF84F1F61F3A6CC93E9CE7E4C6E90B3794F98CE155111ADD4726BE9FAFC93FD9ABE35EA3FB3FFC65D1FE245ABCED6904FE4EB36B0124DCD949F2CA9B43A07603E740C7689238D8FDDAFD65D3752D3B5AD3ADF58D1F5082EED2EE049AD6EADA51247346C032BA3292194820823820E6BF55E15CCBEBB97FB29BF7A9E9F2E8FF004F91FC63E3270A7F60713BC6518DA8E26F35D94FEDAFBDA97FDBD65B13D14515F4E7E4214514500145145001451450015FCD6FFC17F3FE52DDF167FEE03FFA61D3ABFA52AFE6B7FE0BF9FF00296EF8B3FF00701FFD30E9D5D982FE2BF4FF00238331FE02F5FD19F1CD14515EA1E3057D8DFF000403FF0094B77C26FF00B8F7FE98751AF8E6BEC6FF008201FF00CA5BBE137FDC7BFF004C3A8D675BF852F466B43F8F1F55F99FD29514515E19F4614514500145145001451450014514500145145007E58FFC1CA1FF000508F863E13F80777FB0078235BB3D57C67E29BCD3EEBC656890994687A5C32A5E421E45914457734D15AB2465643F67F319D63F36DDDFF107C3BE22F10783FC4161E2DF096BB79A5EABA5DE4577A66A7A75D3C171697113878E68A4421A3911D432B2905480410457D75FF05FCFF94B77C59FFB80FF00E9874EAF8E6BD9C3C1428AB75D4F9FC55494EBB6FA69F71FD54FFC13A7F6C8F0FF00EDDFFB21784BF687D325B38F55BEB3FB278BB4CB364034ED620C25D43E589A5686367C4D0AC8E6436F3C0EC017AF6FAFC10FF836CBF6EAFF008511FB4E5EFEC99E3FF11791E15F8A3B7FB13ED977B60B1F1044A7C9DBE64E91C5F6A8835BB6D8DE59A64B08C60035FBDF5E657A7ECAA35D0F630D57DB524FAF53F373FE0A45F02FFE1547C7693C69A4C1B748F19F9BA843F367CBBC0C3ED49F33B31CBBACD92157FD23628C21AF9EABF567F6C2F817FF000D05F02755F05D841BF57B5C6A1A07CD8CDE44ADB539745FDE23490E5CED5F377E09515F94D5F90713E5BF50CC5CE2BDCA9AAF5EABEFD7D1A3FB83C21E2BFF00593856346B4AF5B0D6A72EEE36F725F38AE56DEAE5193EA15FA13FF04C3F8FDFF0B03E15CFF07FC45A9799ABF84F1F61F3A6CC93E9CE7E4C6E90B3794F98CE155111ADD4726BF3DABBCFD9ABE35EA3FB3FFC65D1FE245ABCED6904FE4EB36B0124DCD949F2CA9B43A07603E740C7689238D8FDDAE4C8F317966631A8DFBAF497A3FF002DCF6FC45E168F16F0BD6C2C15EAC7DFA7FE38F4FF00B795E3F3BF43F5B28A834DD4B4ED6B4EB7D6347D420BBB4BB8126B5BAB694491CD1B00CAE8CA4865208208E0839A9EBF634D35747F06CA328C9A6ACD0514514C4145145001451450015FCD6FFC17F3FE52DDF167FEE03FFA61D3ABFA52AFE6B7FE0BF9FF00296EF8B3FF00701FFD30E9D5D982FE2BF4FF00238331FE02F5FD19F1CD14515EA1E3057D8DFF000403FF0094B77C26FF00B8F7FE98751AF8E6BEC6FF008201FF00CA5BBE137FDC7BFF004C3A8D675BF852F466B43F8F1F55F99FD29514515E19F4614514500145145001451450014514500145145007F35BFF0005FCFF0094B77C59FF00B80FFE9874EAF8E6BEC6FF0082FE7FCA5BBE2CFF00DC07FF004C3A757C735EE51FE147D11F395FF8F2F57F9973C3BE22F10783FC4161E2DF096BB79A5EABA5DE4577A66A7A75D3C171697113878E68A4421A3911D432B2905480410457F53BFF0004E9FDB23C3FFB77FEC85E12FDA1F4C96CE3D56FACFEC9E2ED32CD900D3B588309750F962695A18D9F1342B23990DBCF03B005EBF956AFD5BFF83607F6D9FF00841BE2E7887F615F18DEE34DF1B79BAF7837F77FEAF57B7B71F6B87E484B1F3ACE15937CB2AC71FF00676D552F3F38E2E9F3D3E65BA3A30357D9D6E57B33F6F6BF373FE0A45F02FF00E1547C7693C69A4C1B748F19F9BA843F367CBBC0C3ED49F33B31CBBACD92157FD23628C21AFD23AF22FDB8FE0F5D7C68FD9C35BD0746D2BED9ABE99B354D1A20652E668725D512304C923C2D346884105A45E870C3E378872F5986592497BD1F797AADD7CD69EB63F5FF000BF8A25C2FC5B46A4DDA955B53A9DAD26AD2ECB96566DEFCBCC96E7E5A514515F8F9FDD07E84FF00C130FE3F7FC2C0F8573FC1FF00116A5E66AFE13C7D87CE9B324FA739F931BA42CDE53E6338554446B751C9AFA7EBF2EBF604F10F8AB40FDABBC2ABE15B29EEDAFE79AD2FECE2BF16EB2DAB42E657727875882F9FE59FBCD0281F36D23F516BF59E16C6CF1995A53DE0F96FDD24ADF83B7FC39FC53E31F0FE1F21E319CE85942BC555B69A36DA969BD9C939276B6AD2D9D8A28A2BE8CFCA428A28A0028A28A002BF2C7FE0AA3FF06FCFC61FDB3FF697F13FED5FF04FF683F0D5BEABE2ABCD396E3C2BE29D2EE2D2DECADEDB4D86D1A45BD80DC34D217B78D8466DD06256F9F2803FEA751574EA4E94AF133AB4A15A3CB23F994F8EBFF0447FF829C7C02FB4DEEB5FB2DEB3E23D363D65F4FB4D4BC092C7AD7DB31E615B84B6B467BB8E0758CB079A18F6EE45708EC10FCD7F103E1D7C41F84FE2EBBF007C53F02EB3E1AD7AC3CBFB7E89E20D325B3BBB6DF1AC89E64332ABA6E8DD1C640CAB291C106BFAFF00AC6F881F0EBE1F7C58F08DDF803E29F81746F12E837FE5FDBF44F1069915E5A5CEC91644F32199591F6C888E320E19548E4035D71C7497C48E19E5D07F0C8FE402BD2BF641FDA9BE20FEC57FB44F87BF699F859A3E8D7FAF786BED7F60B4F105BCB2DA49F68B49AD1FCC586589CE239DC8C38F9829391907FA08F8FF00FF000417FF008263FC7DFED6D4BFE1427FC215ACEADE47FC4E7C01A949A6FD8FCAF2C7EE2CB2F611EF48F63FFA31DDE63BF1237995F22FC62FF8351BC3F717BAD6ADFB3FFED8579696C2CCB787740F18F8592E5DAE161188EE6FEDA68C08DE604F989684C68E06C94A65F758BA135696873BC0E229CAF1D4F1CF0EFF00C1D3DFB715AF882C2E7C5BF02FE145F6951DE44DA9D969DA6EA76B71716E1C19238A67BE95619193216468E40A48251C0DA7D5FF00E22CEFFAB03FFCCA9FFDEBAF94BE3AFF00C1BCDFF0538F82BF69BDD17E16E8DE3ED36CF467D42EF52F02788239B66CF30B5BA5B5D8B7BB9E70B186090C326FF31150B39283E45F8A7F063E30FC0CF1043E12F8D9F0A3C4BE0ED56E2CD6EEDF4CF14E8571A7DC4B6ECEE8B32C73A233465E3914301825186720D35470B536489957C6D2F89B5F23F6C7C01FF0752FEC7BA97846D2F7E29FECF1F12B46D79FCCFB7E9BE1F4D3F53B48712304F2EE66B9B579331846398536B3328DC143B765E00FF839C3FE09C3E32F175A786FC45A1FC4AF09D9DCF99E77883C41E18B692D2D76C6CC3CC5B1BBB89CEE2A106C89FE675DDB57730FE7DE8A1E0E8B058FC42EC7F4A5FF000FFCFF008248FF00D1D97FE587AF7FF20D7A57803FE0A9BFF04E1F897E11B4F1B7877F6DBF86B6D677BE67930F883C576DA4DDAEC91A33E65A5F3433C5CA9237C6BB94AB2E55949FE58E8A8781A7D1B34598D5EA91FD677803F6CEFD8F7E2C78BAD3C01F0B3F6AFF0086BE25D7AFFCCFB0689E1FF1D69F797773B23691FCB861999DF6C68EE700E15589E0135E955FC73D152F02BA4BF02D664FAC7F13FB18A2BF931F007ED9DFB617C27F08DA7803E167ED5FF12BC35A0D8799F60D13C3FE3AD42CED2DB7C8D23F970C332A26E91DDCE00CB3313C926BB2F007FC1537FE0A3DF0D3C5D69E36F0EFEDB7F12AE6F2CBCCF261F1078AEE756B46DF1B467CCB4BE69A09786246F8DB6B0565C32A910F033E8CB598C3AC59FD4E515FCD6FFC3FF3FE0ADDFF004765FF00961E83FF00C835EAFE1DFF0083A13FE0A21A2787EC346D4FC03F0A358B9B4B38A0B8D5B51F0DDFADC5EBA20569E5105FC71091C82CC238D10163B51461443C1565D8D166141F73CA3FE0BF9FF296EF8B3FF701FF00D30E9D5F1CD7A57ED7DFB537C41FDB53F689F10FED33F14F47D1AC35EF12FD93EDF69E1FB7962B48FECF690DA2796B34B2B8CC70213973F31623030079AD7A54E2E34D27D11E455929D5949756C2B67E1D78FF00C5DF09FE20E85F14FE1FEADF60D7BC35ACDAEABA25FF00911CBF66BBB79566864D922B23ED9115B6B29538C104645635157B91B1FD677EC77FB4CF847F6C7FD98FC19FB4C7826DBECD67E2CD196E66B0DF23FD86ED19A1BBB4DF2471997C9B98E687CC08AB2797BD7E5604FA557F3EFF00F0431FF82BF7C3EFF827EFFC247F02BF68CB4D664F01F8AB59B6D474DD5747B38A7FEC1D41B65BDCCF3C4009A582481616728D23C7F6202381DA6723F6FBF666FDB13F663FDB1FC232F8DBF667F8CFA378B2CEDB6FDBE1B295A3BBB1DD24B1A7DA6D26549EDB7982529E6C69E62A164DCB827C6AD4654A6F4D0FA0C3E2215A0B5D7B1B9A97ECFDF01B5AD46E358D63E097846EEEEEE779AEAEAE7C376B249348C4B33BB3464B3124924F249CD721E1DFD83BF649F0BEB30EBBA6FC18B29678376C4D46FAE6F213B94A9DD0CF2BC6FC138DCA70704608047AED15E74F0382A92529528B6BBC57F91F434388B8830B4A54E8E32AC6325669549A4D6D6693D559BD0E7BC27F08FE147807517D63C0BF0C7C3DA2DDC901864BAD274582DA478C90C50B4680952554E3A6541ED5D0D145744210A71B4159791E657C462315539EB4DCA5DDB6DFDEC28A28AA310A28A2800A28A2800A28A2800A28A2800A28A2800AA7E22F0EF87FC61E1FBFF0978B742B3D534AD52CE5B4D4F4CD46D527B7BBB7950A490CB1B82B246E8C5595810C0904106AE51401F35FC5AFF823C7FC131FE357F67FFC263FB18F836CFF00B33CDFB37FC2256D2681BFCCD9BBCDFECB7B7F3F1E5AEDF3776CCB6DDBBDB3F1CFC5AFF83537F67ED67FB3FF00E1457ED5DE32F0E797E6FF006AFF00C25BA2DA6B5F68CECF2BCAFB39B1F276E24DDBBCCDDB971B369DDFAB5456B1AF561B3319E1E84F78A3F9DEF8B5FF0006DB7FC14E3E1C7F67FF00C21DE16F06F8FBED9E6FDA7FE112F17470FD8366CDBE6FF6A2D9E77EE6DBE57998F2DB76DCAEEF8E7E2D7ECEDFB40FC02FECFF00F85EBF02FC65E0AFED6F37FB2BFE12DF0C5DE9BF6CF2B679BE57DA234F3367991EEDB9DBE62E71B857F5CF4574471B517C4AE72CF2EA6FE16D7E27F1CF457F539F1D7FE096FF00F04F4FDA47ED33FC5AFD923C1B73797BACBEABA86B1A3E9C749D42F6EDFCCF3249EF2C1A19E7DE65767591D95DC876059548F91BE317FC1ADDFB1878B6CB5ABDF833F197C7DE0ED56FEF0CFA4C57F3DAEABA5E988D30730081A28AE268D62DD1A17BADE0ED67790860FBC71B49EFA1CB3CBEB47E1B33F0728AFD29F8FF00FF0006C0FEDBBF0F3FB5B57F815F10FC1BF1174DB3F23FB2AC7ED4FA46AFA86FF2D65FDC5C03691796CD21F9AF3E68E2DC3E761157CA5F1D7FE096FF00F050BFD9BBED33FC5AFD923C656D6765A33EABA86B1A3E9C356D3ECAD13CCF3249EF2C1A6820D822767591D5910076015949E88D6A53D99CD3A15A1BC59E074514568641451450014514500145145007F56BFF0004ECFF00947E7C0BFF00B239E18FFD355B57B1D78E7FC13B3FE51F9F02FF00EC8E7863FF004D56D5EC75E0CFE367D2D3F817A05145152585145140051451400514514005145140051451400514514005145140051451400514514005145140051451401C0FC53FD94FF65DF8E7E2087C5BF1B3F66DF00F8C755B7B35B4B7D4FC53E0EB2D42E22B75777585649E27658C3C923050700BB1C649AF91BE2D7FC1B6DFF04C7F88FF00D9FF00F087785BC65E01FB1F9BF69FF844BC5D24DF6FDFB36F9BFDA8B798D9B5B6F95E5E7CC6DDBB0BB7EF7A2AE352A4366673A54A7F124CFC42F8B5FF0006A6FED03A37F67FFC28AFDABBC1BE23F33CDFED5FF84B745BBD17ECF8D9E5795F6737DE76ECC9BB7797B76AE37EE3B7E51F8EBFF0447FF829C7C02FB4DEEB5FB2DEB3E23D363D65F4FB4D4BC092C7AD7DB31E615B84B6B467BB8E0758CB079A18F6EE45708EC10FF4D745744719596FA9CB3C05096D747F1E7E22F0EF883C1FE20BFF000978B742BCD2F55D2EF25B4D4F4CD46D5E0B8B4B889CA490CB1B80D1C88EA5595802A4104022A9D7F5E7F14FE0C7C1EF8E7E1F87C25F1B3E14786BC63A55BDE2DDDBE99E29D0ADF50B78AE151D16658E7475590249228603203B0CE09AF97BE3FF00FC105FFE098FF1F7FB5B52FF008509FF000856B3AB791FF139F006A5269BF63F2BCB1FB8B2CBD847BD23D8FF00E8C77798EFC48DE656F1C741FC48E69E5D517C32B9FCD6D15FB19F1FFF00E0D4DFF90B6B3FB2CFED5DFF003C3FB0BC37E3FD17FEB9ACDE7EA5687FEBB489B2CBFB919EF2D7CA5F1D7FE0DE6FF829C7C15FB4DEE8BF0B746F1F69B67A33EA177A97813C411CDB367985ADD2DAEC5BDDCF3858C304861937F988A859C941D11C45196CCE69E17110DE27EEB7FC13B3FE51F9F02FFEC8E7863FF4D56D5EC75E6BFB18F803C5DF09FF0063DF851F0B3E20693F60D7BC35F0D742D2B5BB0F3E397ECD776FA7C10CD1EF8D991F6C88CBB958A9C6412306BD2ABC796B267BD0D20828A28A92828A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A00FFFD9>';
const PORTAL_TAGLINE_JPEG_HEX='FFD8FFE000104A46494600010100000100010000FFDB0043000201010101010201010102020202020403020202020504040304060506060605060606070908060709070606080B08090A0A0A0A0A06080B0C0B0A0C090A0A0AFFDB004301020202020202050303050A0706070A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0AFFC0001108002503DA03012200021101031101FFC4001F0000010501010101010100000000000000000102030405060708090A0BFFC400B5100002010303020403050504040000017D01020300041105122131410613516107227114328191A1082342B1C11552D1F02433627282090A161718191A25262728292A3435363738393A434445464748494A535455565758595A636465666768696A737475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFC4001F0100030101010101010101010000000000000102030405060708090A0BFFC400B51100020102040403040705040400010277000102031104052131061241510761711322328108144291A1B1C109233352F0156272D10A162434E125F11718191A262728292A35363738393A434445464748494A535455565758595A636465666768696A737475767778797A82838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE2E3E4E5E6E7E8E9EAF2F3F4F5F6F7F8F9FAFFDA000C03010002110311003F00FDFCA28AFCC6F0F7FC13CFF63EFDBCFF00E0B05FB617FC357FC21FF84AFF00E114FF00857DFD81FF0013FD42C7ECBF6AF0F9F3FF00E3CEE22DFBBECF0FDFDD8D9C63273AD2A719F3393B24AFB5FAA5DD7731AD5274F95455DB76D5DBA37D9F63F4E68AFCABFF0082847EC07F0CBFE0935E0FF07FEDC5FF0004A7D13FE106F88FA478D2CB42B8F06CFE26D4B538BE21D9EA322C47454B1B892696FA732A4322C10BC4C228EE26526682078FF5529D4A718C54A2EE9DFC9E9F7FE62A556539CA13566ADD6EB5F92FC828AF17FF0082917FCA3BBE3DFF00D916F14FFE9A2EABE48FD897FE0855FF0004ADF8BBFB197C23F8B1F10FF65AFED0F10789FE18E81AB6B97FFF0009BEB917DA6F2E74E8269A5D915EAA26E91D9B6A2AA8CE0003029C29D374F9E6DAD6DA2BFEA8552AD555792114F4BEAEDFA33F47E8AF81FF00604D73C45FB297FC14F3E2C7FC130744F8A97BE2EF86F69F0FB4EF1B7C38D3B54F193EAB77E01B646B6B2974193CE88CD14644F049040D33086D62B67C3BDD4AF5F7C5455A7ECE56EE93FBCBA553DAC6F6B34DA7EA828AA5E24F127877C1BE1DBFF17F8BF5FB2D2B49D2ACA5BCD5354D4AE920B6B3B6890BC934B2390B1C688ACCCEC40500924015F8D5FB3EFC53D73E1AFED4BE04FF0082F2FC43F8B7F62F007ED19F1A7C45E01D66CF5216304F61E16914DA78785DA344905A7D967D19A4BCB84BA7220B6B660D2B3DC06BA341D64DDED6FC5F6FC1915F10A8CA2AD7BEFE4B6BFE28FDA2A28A2B03A028AFC9EFF829D4FF00B63F85BFE0B79E16F8D1FB146957BADEBDF0E7F66FB1F12F8A7C13A6DFF9373E2DF0F45E25BA86FF004A894C52ACD24893ABAA146706112421AE23811BF4B7F673F8F9F0EFF6A4F815E14FDA1BE13EA5F69F0FF8BB458751B0DF342F2DBEF5F9EDA6F264911278640F0CB1876F2E589D09CA9ADEA5074E9C677BA7F81CF4B10AA54942D66BF13B4A2BE2EFF8232FFCDD77FD9E8F8EBFF6C6BED1A8AB0F6737134A553DAD352B0515F98DE1EFF8279FEC7DFB79FF00C160BF6C2FF86AFF00843FF095FF00C229FF000AFBFB03FE27FA858FD97ED5E1F3E7FF00C79DC45BF77D9E1FBFBB1B38C64E7A7F8EBFF045CF117ECB7E1DD4FE397FC114BE2B789FE12FC43B2B2899FC06DE267BEF0F78B442974A63B88B533329BBD974C2092767B78DD17E485A46BA8F67468A6A2E766D27AAD3549EF7F3EC60ABD769C942E936B47AE8DADAD6E9B5CFD12A2BCC7F631FDA8BC1FF00B697ECB5E09FDA83C0D6BF66B2F1768AB733D86F91FEC1788CD0DDDA6F92288CBE45CC7343E6845593CADEA36B293E9D5CD28B8C9C5EE8E98CA338A92D98515F93DFB07FEC87FB3E7FC15DBE297C7EF8F1FF000533F055EF88FE28785BE2DDE78561F87975F10E5F2FC07A2DA0FF0045B1846972DB878FCE7BD84DC1063B87B292540246B8793EC4FD9B3FE0969F07BF631F8EBA7FC43FD927E24F8D3C0FE051A2DF41E23F8410788AE351D0B5AD46668045A9BADFC93BC13A4716C6688ABB88ADC078D1278EEBA2A51A749B8B97BCBCB4FBEFFA1CF4ABD5AA94947DD7E7AFDD6FD4FA768A2BE62FF82A5FED7FE30FD99BE0F786BE1AFC09F1568BA77C5FF8C7E34D3BC15F0BA4D6D63960B2BCBCB88E297529E12C5DA0B68E41991629D5279AD449148921538C212A93515D4DEA548D28393E87D3B457C29E06FF00837AFF0060EBED2DF5FF00DAD9FC69F1CBC7FA8F9127883E20F8EFC73AA4779772A5AC306C45B5B98F6C0BE4E63495A69515B6199D5131E9DFB157FC136FFE182BE2C6B737C10FDA67C6973F08354D1668B4DF831E289FFB42CFC3FA8BDFC9742E34EBA76DF6D02C72CD11B7D8CF2B48659A799D536E9285049F2CF5F4D3F37F8A46519E21C9734125EB76BD745F8367D3B4515F177EDBDFF2982FD873FEEA67FEA3F0545387B495BC9BFB937FA1A55A9ECE37B754BEF697EA7DA34515F10FFC117B40B1B6F117ED71E288E7BD37379FB6278CAD668A4D4A77B658E17B774296ECE618A42677DF2A22BC81625766586208461CD094AFB58255396A4636DEFF0081F6F51457C5DFF3B117FDD977FEEDB4421CF7F2570A953D9DB4DDD8FB468A2BE2EFF8232FFCDD77FD9E8F8EBFF6C688C39A12976B04AA72D48C6DBDFF0003ED1A28AFCFAFF82917FC11B7FE09BBFF000CEDF1EFF6AFFF008672FF008AFF00FE10BF14F8B7FB7FFE12FD63FE431F64BABCFB4F91F6BF23FD7FCFE5ECF2FF00876EDE28A5184E56936BE57FD50AB4EA421CD149DBBBB7E8CFD05A2BF383F625FF0082157FC12B7E2EFEC65F08FE2C7C43FD96BFB43C41E27F863A06ADAE5FFF00C26FAE45F69BCB9D3A09A6976457AA89BA4766DA8AAA338000C0AFD1FA75634E12B45B7EAADFAB1519D59C6F3497A3BFE8828AE2FF00686FD9E7E0F7ED59F07B58F807F1F3C21FDBDE12D7BECFFDADA4FF00685C5AF9FE45C477317EF6DA48E55DB2C31B7CAC33B70720907E21FDAABFE0905FF042AFD8DFF67CF13FED2FF1A3F64EBD8BC39E15B249EF574DF19F886E2E6792495208208906A0019259A58A252CCA8A6405DD1033ABA50A73D1B77F257FD50559D586B14ACBAB6D7E8CFD12A2BF3B7FE0849FF04C2B1FD96AC7C5DFB657C44F8257BF0FBC61F126F6F13C27E03BCF10CF792783FC2534F15CDB69B70244466BB2F1C664698BCA120803082537319FD12A55A10A751C62EF6FEBBB1D0A93AB4D4A51B5FA7F490515F9F5FF000564FD9E7E0F7ED59FF0522FD8CFE01FC7CF087F6F784B5EFF008589FDADA4FF00685C5AF9FE468F677317EF6DA48E55DB2C31B7CAC33B707209076BE21FFC1BB7FF0004DDBCF07DE7FC33E7C3FD6BE16F8EADFCBBAF087C43F0EF8CF58B8BCD0351864596DEEA38EE2F591F6C88B91F2BED2DE5C913EC952D52A2A31739357F2BF56BBF9763275ABB9C94229A8BB6F67B27DBCFB9F75D15F37FFC1233F69BF8A5FB627FC13AFE1AFED0FF001AEEECAE7C53ADD95FC1AC5E58598B78EEA4B4D46EAC96731A9DA924896EB23840A9BDDF6222ED45FA42B19C1D39B8BDD686F4E6AA53535B357FBC28AF8BBFE08CBFF375DFF67A3E3AFF00DB1AFB46AAAC3D9CDC454AA7B5A6A560AE63E36EABF14B42F833E2ED6FE06F86ECB59F1B59F862FE7F07E8FA94812DAFB554B791AD20958C91011BCC23562648C00C7E75FBC3A7AC5F893F10FC1FF08BE1DEBFF163E21EB1FD9FE1FF000C68B75AB6B97FF67925FB359DB42D34D2EC8959DF6C68CDB51598E3001381511BF322E56E57AD8F16BEF88BFF0005194F815F04F5F83F67EF05AF8FF5CF1A6876DF1C342B7D685C59F87F429565FED2BBB491EE20DD3C78848895AE8233BA21BB541337D075F8EFFB2DF8CFE30FC2BFDAE7E0C7FC1627E2BF84F5A78BF6C6F1A6ADE06F1468B7D616F1B784F4EBD9ED22F095B5B2E6D9EEB747A624AF7E6329259A861179AC924FFB115D188A7ECDA5A7CBBDF55F239B0B57DAA6F5E9BF6B68F6EBD7CC28A2BF27BFE0A753FED8FE16FF0082DE785BE347EC51A55EEB7AF7C39FD9BEC7C4BE29F04E9B7FE4DCF8B7C3D17896EA1BFD2A25314AB349224EAEA8519C18449086B88E0468A147DB4DC6F6D0BC456F61052B5F53F5868AE2FF00673F8F9F0EFF006A4F815E14FDA1BE13EA5F69F0FF008BB458751B0DF342F2DBEF5F9EDA6F264911278640F0CB1876F2E589D09CA9AF98BFE0DE7FF943EFC21FFB8FFF00EA41A954FB36A9B93E8D2FBEFF00E457B54EA462BAA6EFE96FF33ED1A28AFCC6F0F7FC13CFF63EFDBCFF00E0B05FB617FC357FC21FF84AFF00E114FF00857DFD81FF0013FD42C7ECBF6AF0F9F3FF00E3CEE22DFBBECF0FDFDD8D9C63272E9538CF99C9D9257DAFD52EEBB8AB549D3E551576DDB576E8DF67D8FD39A2BE48F86DFF00042AFF008256FC22F889A07C58F879FB2D7F67F883C31AD5AEADA1DFFF00C26FAE4BF66BCB69966865D92DEB23ED9115B6BAB29C6082322BEB7A99AA69FB8DBF556FD5954DD56BDF497A3BFE8828A28A8340A2BC5FFE0A45FF0028EEF8F7FF00645BC53FFA68BAAF8EFF00607FF820B7FC12EFE22FEC49F09BE267C54FD9FEF7C4DE23F157C3ED275DD6B59BFF0019EAB6F24D737D6B1DDBA08ED2E6185238CCDE5A054076469BD9DF73B6F0A74DD3E79C9AD6DA2BFEA8E7A956AAABC908A7A5F576FD19FA59457CF9FB287FC12C3F60EFD87FE225EFC58FD977E04FFC231E20D43459349BCBFF00F849F54BDF32CE49A199E2D977752A0CC9044DB82861B300E0907E83ACA6A09FBAEEBCD5BF566B07371F7D24FC9DFF00441457C5DFB6F7FCA60BF61CFF00BA99FF00A8FC15F68D54E1C918BEEAFF008B5FA0A1539E5256D9DBF04FF50A2BE2EFF83863FE50FBF17BFEE01FFA9069B47FC124FF006A7F8C3A97FC25DFF04E7FDB435CFB5FC73F817E441ADEB53F882DEF3FE12CD1EE3F7B65A9C0C024F26C824B58E66963320F3AD9E67F3EE248E3B541BC3FB54FAEDF76BF899BC446389F64D6EAF7F3D74FC2E7DA3457C0FE3EF02788BC5DFF000726F827C41A27C40BDD1ADBC2DFB2ACBAA6B1A75A87F2F5EB67D66FEC96CA6DB228F2D66BB82E86E120DF651FCA1B6BA7DF151529A872EBBAB974AA3A9CDA5ACEC1457C29FF0005E3F879E0FF008BBF0EFF00670F84FF0010F47FED0F0FF89FF6B7F07E93AE587DA248BED367730EA10CD16F8995D3746ECBB91958672083835B5FF10F3FFC11F7FE8D0FFF002FFF00107FF27D5AA74953529C9ABF657FD519BAB59D4718453B5B776DFE4CFB468AE2FF00679FD9E7E0F7ECA7F07B47F807F00FC21FD83E12D07ED1FD93A4FF00685C5D791E7DC49732FEF6E649256DD2CD237CCC71BB0300003B4AC5DAFA6C742BDB5DC28AFCEDFF0082A72DF7FC147FF6B3F0AFFC11B3E1CF8EEF74AD253C31A878DBE33F88342BD81A4D2238AD9E3D12DA687ED2BF688FEDF359DC5C593C41D925B196292301A54F75FF0082417ED45AA7ED49FB0B7856FF00C736BAD5AF8EBC07BBC13F12AC3C48F74FA8DBEBBA62470CED74F73146EF3CD1986E6407718DEE5A267678DCD6D2A0E3454EFF002EC9EDF7DBF2EE610C429D774EDF3EED5AEBE575F8F63E9DA28AF9BFFE0AB3FB7CD8FF00C138BF638D6BF681B6D22CB53F11DC5EC1A3782747D484E2DAF7559F7B2895A15244714315C5C32968C482DCC4258DE446ACA109549A8C7766B5271A507396C8FA428AF853E1E7FC10BBE017C57F07D9F8E7FE0A79AD6B5F1DFE2FDFF993F883C5BA978C756B5B3D3FCD91A6FECCD36DED678120B086492531AF96B969247090A3A4117A0FECAFFF00049FF85BFB10FED06DF13BF654F8DBF107C2BE01BDB2BC1ACFC16935E37FE1EB9BE962B38A3BC4176249A29145B3BBBEF699DDA2559A28237B79B5942824ED3D7D34FBEF7FC0CA35310DA6E1A3F3D57AAB5BF13EAAA28AF8BBFE0B35FF0036A3FF0067A3E05FFDBEA8A50F6935134AB53D95372B1F68D1457C5DFF003B117FDD977FEEDB4421CF7F2570A953D9DB4DDD8FB468A28ACCD028A2BE48FF0082E07C09D53E34FF00C139BC6BE24F06EA9FD97E2DF85FE4FC40F076BC9AB5D594BA4DE6925AE26B8864B6F9BCFF00B17DB238B702A25951B2855644BA7153A8A2DDAE67566E9D3724AF647D6F4579F7EC9FFB41F877F6AEFD9A3C0BFB47F85D2CA2B6F19F862D35496CAC3554BE8F4FB992306E2C8CE8AA1E4B79BCC81FE5521E170CAAC0A8F923F68A9E6FDB8BFE0B39F0B7F66AD134ABDBEF04FECCB64FE3DF89B33DFEA16F62DE21BA8636D0ED8A4712C2F776E7C8BC899A5292433DEC7FF2CA68A4A852729B4F4B5EFF002FF83A133ACA308CA3ADDAB7CFFE06A7DF14515F9F5FF07357C5FF00F856BFF04B5D5BC19FF08F7DB7FE16178D347F0FFDA7ED7E5FD83CB95F55F3F6EC6F373FD99E56CCA63CFDFB8ECDACA8D375AAC60BAB1D7AAA8519547D11FA0B457C5DFF0010F3FF00C11F7FE8D0FF00F2FF00F107FF0027D7D07FB287EC6DFB377EC3FF000EEF7E13FECBBF0E3FE118F0FEA1AD49AB5E587F6C5E5EF99792430C2F2EFBB9A57198E08976860A36640C924B9AA297BB26DF9A4BF56284ABB97BF1497936FF00F6D47A751457E3BDDFEC6DFB377EDC1FF0727FED09F09FF6A2F871FF00093F87F4FF00863A66AD6761FDB17965E5DE4761E1C8525DF69344E711CF2AED2C54EFC919008AA14A3579B99D9257DAFDBCD1388AD2A2A3CAAEE4EDBDBA3F27D8FD88A2BF3B7F6B0FF8242FECC1FB17FECD1E3AFDAAFF00E09E57BE27F823F123E1E7862EFC4B67E24F0DF8B753BD8F55B6D3E337D26957B6B7B752C3716939B74DC8CB8DF1C4CC25457865FB47F64AF8B1E22F8F3FB2A7C32F8E5E2FB2B2B6D5BC67F0FB45D7754B7D36374B68AE6EEC61B891225767658C3C8C143331000CB13CD29D382873C1DD6DB5BF57F98E9D59B9B84D59DAFA3BAFC97E47A0D15CC7C6DF84FE1DF8F3F067C5DF037C5F7B7B6DA4F8CFC317FA16A971A6C8897315B5DDBC96F23C4CEAEAB204918A9656008195238AF957FE0823E39F186A7FF04FAB2F819F1421D693C65F05BC69ADFC3FF17C7AD5F4775E4DE595D1952DE09A3965124105B5CDB5B260855FB39440635466954EF49CEFB35A7AF529D4B56506B74F5F4B687DA3457E2EFF00C1487F6A7F8C327FC157AF3F6DEF84FAE7DB3E19FEC5FAD7857C3FF1060D17C416FA84B241ADCB731EAB3DA5A4E16DD276577D26741279E92C303165F2D9ADBF553F6D4F8F9FF0CB7FB237C49FDA1A0D4B45B6BDF08F82F51D4746FF00848A6D96771A8A40FF0063B69312465FCEB930C223575791A55443B996B4A986941435BF37E0FB7DCD3F99953C542A39E96E5FC577FBD35F23D3A8AF8EFF00E0835FB3258FECC7FF0004C3F87568D6964BAB78EEC8F8D35DBAB0BC9E68EEA4D45524B5622503CB912C16C61748D420785C8DE4991FEC4ACAA4542A38A77B1B529BA94949AB5D5EC1457C0FFF000571D2AC7F6E1FDA0FE0EFFC121B4BF12789F4AB6F18DECBE38F8ADAC786239C9D3BC33A7C572B6F0CEBE5F90D1DDDF288D2591D96DEE2DAD9DA195A4854F69FF0447FDA42FBE2CFEC716BFB3C7C47D36CB46F891F006F4FC3AF1EF872DAEA0736B269B9B6B59C08EE262F1C90C22333E5525B8B6BBF286C415A3A0D50F697F979747F87E5DCCA3884F10E9DBE7E6AD75F73FCFB1F62514578BFFC148BFE51DDF1EFFEC8B78A7FF4D17559463CD24BB9BCE5C9072EC7B4515F177FC1BCFF00F287DF843FF71FFF00D48352AFB46AAAC3D9D5943B36BEE268D4F6B4A33B5AE93FBC28AE2FF686FD9E7E0F7ED59F07B58F807F1F3C21FDBDE12D7BECFF00DADA4FF685C5AF9FE45C477317EF6DA48E55DB2C31B7CAC33B70720907F317FE0A69FF00046DFF00826EFECF9FF0CFBFF0A83F672FEC8FF84E3F69DF09F84BC51FF157EB171F6DD1EF3ED5F69B6FDFDDBF97BFCB4FDE47B645DBF2B0C9CDD1A74AABE5949A7E97FD519D7AB5692E68C535EB6FD19FADD457CC5FB3CFFC11B7FE09BBFB29FC61D1FE3E7C03FD9CBFB07C5BA0FDA3FB2756FF0084BF58BAF23CFB792DA5FDD5CDDC9136E8A6917E6538DD9182011F4ED673504FDC6DAF356FD59AC1D46BDF493F277FD10515F957FF00070E7C3CF07FC5DFDB37F61EF84FF10F47FED0F0FF0089FE275F693AE587DA248BED36773A8F87E19A2DF132BA6E8DD977232B0CE410706BE83FF8879FFE08FBFF004687FF0097FF00883FF93EB6F634A34A339C9FBD7D95F676EE8E7F6F5A556708457BB6DDDB757ECCFB468AE2FF00679FD9E7E0F7ECA7F07B47F807F00FC21FD83E12D07ED1FD93A4FF00685C5D791E7DC49732FEF6E649256DD2CD237CCC71BB0300003B4AE776BE9B1D4AF6D770A2BF03FF0065EFDA8BE2C7EC33FF000555FDA7FF006B286D7EDDF082D3F683B9F0A7C67B5DF7EFFD9567AAEB9AA1B5D77CAB58A443F6392CA54DF22B337DB7ECF100F77E647FBC7E1BF127877C65E1DB0F17F8435FB2D5749D56CA2BCD2F54D36E927B6BCB69503C73452212B246E8CACAEA48604104835BE230F2C3B5ADD3FEAC7361B151C4A7A59AE9F3B5CBB457C5DFF06F3FFCA1F7E10FFDC7FF00F520D4ABED1ACEAC3D9D5943B36BEE36A353DAD28CED6BA4FEF0AFCC6F0F7EC65FF0D75FF0582FDB0BFE32BBE34FC30FF847BFE15F7FC920F1D7F62FF6979FE1F3FF001F7FB993CEF2FC9FDDF4DBE6CBD7771FA735F0A78CFF00650FF82AAFC22FDBC7E36FED45FB166B3FB3E4FE1FF8BFFF0008DF9D67F146E75C6BCB6FECAD2D6D06D4B089513748F39397932BE59F90EE15AE1A5CBCF6766D697F54618A873725D3693D6DE8FF0053C27FE0A1FF00B07788BFE09C963E04FF0082A1E89FB47FC41F8ED6DF037C4F15E6B1E04FDA23C60FADC72DB5FCF6F64B369732C0A2CAEE39A48255764701E3867CEEB55867FD47F86DF10FC1FF00177E1DE81F163E1E6B1FDA1E1FF13E8B6BAB6877FF0067922FB4D9DCC2B3432EC9555D3746EADB5D558670403915F10F8B3FE09F5FF051FF00DBD3C4569E17FF00829F7ED25F0FB4CF849A7DED85D6A3F097E055A6A10DB78B6481EE25C5FDF5EECBA823121B6CC51BC892088322DBCD1A5C57DD7E1BF0DF877C1BE1DB0F08784340B2D2B49D2ACA2B3D2F4BD36D520B6B3B68902470C51A00B1C688AAAA8A005000000155889A94229BBC95F6DADDBF3161A9B8D494A31E58BB68F7BF7F4B58F98BFE0B79AFFC52F0DFFC129FE34EA3F07A0BD935693C311DADDAD869A2EE41A54F79041A992851F6C62C24BB2F2E018903C8190A6F5F957E18FECFDFF0596F067FC12FBC1BF1D7F664FF00829CFF0068FF00677C16D1F5AF09FC2B4F815A4C929B35D3209934B86EC25C4F733A4198A22612D3CAA8ADB3CC2EBFA27FB5AFC27F117C79FD953E26FC0DF085ED95B6ADE33F87DAD685A5DC6A523A5B4573776335BC6F2B22BB2C61E452C5558800E149E2B6BE097C35B1F831F067C23F07B4B4B25B6F09F862C346B75D36DE78AD8476B6F1C0A224B89EE2648F0836AC934CE06034B2365CAA75D53A0A2926EF7D527A59770A98775710E4DB4B96DA36B5BBEC7CABFF00044AF0DFC0AF1AFECED7FF00B69F81BE376B5F11BE227C63FECEBCF8CBE25D7F555967B4D76D6D1525D256DD22852CE0B59269841108C1F2268B6BC907D9F6FDA35F317ECC3FB157C58FD963F6E9F8C9F14BC0DE35D165F833F17FCBF12CFE139EEEFDB51D1BC5C5D45DCF0248EF6E60BA569A69A405642FF66856348AD94BFD3B59E2251955728BBA7FD5BE5B1AE1A328515192B35F8F9FCF73E14FF82FC7ED39F113E187EC8C9FB2AFECF9E0FD6BC47F133E3B7DB7C3FA1E87E1ED1A6BEBC6D1E183CDD6278E14B6984BFE8CEB6E532922ADE34F1B7FA3B11E47FB557ED7BE01F8D7FF0004F4F13FEC23E05FF8240FED8969A4BFC3E4D0BC1165A97C1FBB5B6D3EE6CA143A4BCB3A5EBCED1C1716F6AEC4F985C4443AC81995BEAAFF00862AF8B1F107FE0A95FF000DC7F1BFC6BA2DDF837E1FF82FFB17E09F84F4ABBBFF003EC6F2F22C6A7AA5E233ADBA4ECAF3DB011AC8B340D6ECFE5C96A85BE9DAD956A54A10495DAD77B6BFF015BE7730742AD69CE4DD93D2D6BE9FF05DFE563E62FF0082417ED45AA7ED49FB0B7856FF00C736BAD5AF8EBC07BBC13F12AC3C48F74FA8DBEBBA62470CED74F73146EF3CD1986E6407718DEE5A267678DCD7D3B5F37FC00FD927E337ECF9FB7BFC61F8C7E17F177860FC1DF8B76563ADCBE11B782E2DEFB47F15C31C56F71710C29FE8AD1DDC6B25C5CDCFCB3CD3181597109924FA42B0ADC8EA371D9EBE97E9F23A2873AA494F75A7ADBAFCF73E2EFF009D88BFEECBBFF76DAF31FF00891FFC1133FE0A0BFF00305F0FFECBFF00B49EB5FF004FD6BA77C36F14C16BFF006D2D2082FD8FFD310A91FF00CB1B7D33F7BF4E7FC3287C44FF0087AAFF00C372FF006CE8BFF0897FC33E7FC20BFD9DF699BFB47FB47FB73FB43CDF2FCAF2BC8F2BE5DDE6EFDFC6CC7CD5E85FB557ECC9F0B7F6C8FD9F3C4FFB347C68B4BD97C39E2AB2482F5B4DBC36F730491CA93C13C4E010248A68A295432B2318C074742C8DBAAD05249EB16927FD77460E8CDC6525A4949B5FD767B7E27CDFFF000465FF009BAEFF00B3D1F1D7FED8D7DA35F2AFFC120BFE09D5E22FF82657ECD1AEFC07F147C4FB2F165CEADF10752D762D42C34D7B58E3B678EDED6DD0ABBB1F31A1B48E6719C46F33C4AD22C62693EAAAC71128CAB3717746D868CE3422A4ACCF8BBF621FF94C17EDC7FF0074CFFF0051F9EBEB7F893F10FC1FF08BE1DEBFF163E21EB1FD9FE1FF000C68B75AB6B97FF67925FB359DB42D34D2EC8959DF6C68CDB51598E30013815F177C4FFD8D3FE0A83F08BFE0A0BF143F6C0FD837E297C16BAF0FFC5CD17448FC49E16F8B169A9A7D9AF34EB54B485E36B08D9DF6C69232BF9B1A9FB6488F0B18A296A96BFF00F04DEFF8285FEDC57D1E97FF000540FDB2FC30BF0DCF89EDAFF55F81DF063419ADB4AD5EDAD60430C52EAD71E55F88DEE4196581FCE194568A489FCA6B7DA70A5524A4E692B2F5D124F4FE918427569C5C141B7797A6ADB4EF7DBF1F23B4FF008203786FC45E14FF008245FC1DD2FC51A05EE9B732D96AD7915BDFDABC323DB5C6B37D716F30570098E58658E547E8E9223292AC09FB12A9786FC37E1DF06F876C3C21E10D02CB4AD274AB28ACF4BD2F4DB5482DACEDA24091C3146802C71A22AAAA2801400000055DAE6AB3F695653EEDB3AA8D3F654A30EC92FB8F957F6B6FF82417ECD1FB58FED07A47ED5D1F8EBE20FC31F891A5593DACDE34F849E238F47D43518CC5E4A1B895A094991212F0895363B452794ECE8912C7E2FA3FC4CFDB1FFE0931FB55FC32FD9FFE3D7C6FF13FC7AF81FF0019FC4E7C31E0FF0014F8874EDDE21F056B53DF31B4B7BEBF3F2EA11CA97280B4B22C8C96D33C10C2969E45C769A57EC85FF0564FD91AFB52D13F630FDB43C31F167C2DAE5EADD1B1FDAB2E755D4355D02448228C8B6D474F6DD751CCE24668A48E2484471F96ACD24D23DDF825FB04FED73F18BF6A5D07F6BCFF0082A5FC48F863E2DBDF87FF006CFF008557F0E3C03E1B9FFB1FC35793AE9F9D592EAEF65C4D3EEB490886E12758A4649A192365448FB2324A369CD4A36DBAF95BAAD7E4714A0DCEF0838CEFABE9E77D6CEEBCAFE87DA35F0A7FC1543C73A5FECF1FB78FEC6BFB5B7C4A87EC9E00F0DF8D3C4DE18F117881EFAD618B4CBCD774B8ED6CA49BCF963DB02F937134B372B1456CE4FCC511FEEBAF31FDAFFF00640F815FB72FC0AD57F67CFDA0FC2BFDA3A2EA3896D6EADD963BCD2AF1558457B692956F2678F7361B055959E3915E39248DB9684E30A89CB6D53F46AC75E2212A949A8EFA35EA9DFF0043D3A8AF853C0DF053FE0BF5FB3EE96FF0BFC07FB4EFECF9F173C3FA7F909A278BFE2FE91AD596BAF02DAC3198674D3B723ED91243E6CB2CF3CA5CC924B96089E9DFB157ECC3FB74F83FE2C6B7FB49FEDDFF00B647FC25DE20D67459B4AD37E19F822D9ECFC23E1C81AFE4B80F0A3857BD9C46218D2E668D278E36962792E46C916A546314DF3A7F7EBF87E64C6B4A524B91AF5B69F8EBF23E9DAFCFAFF82B27C18FF8683FF82917EC67F083FE16BF8D3C0FFDAFFF000B13FE2A8F879AEFF666B165E568F673FF00A3DCEC7F2F7F97E5BFCA774723AF1BB23F416BE7CFDA2FF650F889F177F6F1FD9C7F6A2F0DEB3A2C1E1FF841FF00097FFC24B677D7332DE5CFF6AE9715A5BFD99122647DB2212FBDE3C2E0AEF3C51879AA7539AFD1FE4EC18983A94B96D7D63F7732BFE0798FFC3997FEB2B9FB68FF00E1F4FF00EE3AC5FF00820E7833FE15C7C3BFDA3FE1E7FC259AD6BDFD83FB5BF8C34EFEDCF125FF00DAB51D47C8874F8BED3753617CE9E4DBBE4930373B31C0CE2BEEBAF9F3F616FD90BE227EC93E30F8E737893E21E8BADF87FE26FC69D53C75E1AB7B1D26682F2C7FB42385AE22B991E5647DB2208915107CB01959C9B8F22DAFDBCA7465193ED623EAF1A75E1282EF7FB8FA0EBE21D57C49E1DD0BFE0E30D374BD6F5FB2B3B9D67F63B6B3D1EDEEAE92392FAE57C4D2DC3430AB1065904304F2945C9090C8D8DA8C47DBD5F37FFC1457F616F117ED73E1DF0BFC4CF81BF166F7E1F7C68F8597B73AA7C29F1ADBDC3FD9ADAE66445B8B2BC870CB2DA5CA451C72E51CA81F7658CCD6F3E74251536A5A269A34C4467282715769A76EE7D215F10FFC10C75FB1F881F0B7E3EFC6BF0BC17B2785BE20FED55E32F11782F58BAD367B68F57D2A7368B15DC2B32233465E39109C02AF1488C032328A5E39F829FF0005FAFDA0B4B4F85FE3CFDA77F67CF847E1FD43CF4D6FC5FF0008348D6AF75D481AD668C43026A3B513748F19F3629609E228248E5CA947FAABF655FD993E16FEC6FF00B3E7863F668F82F697B17873C2B64F05936A5786E2E6792495E79E795C800C92CD2CB2B055545321088881516DA852A2E374DBB6DD911173AB594B95A4AFBF56CF41AF17FF0082917FCA3BBE3DFF00D916F14FFE9A2EABDA2B8BFDA47E107FC341FECEDE3DF807FF00090FF647FC271E0BD57C3FFDADF64FB47D8BED9692DB79FE56F4F336799BB66E5DDB71B867231A6D46A26FB9BD44E54DA5D8E2FF00E09BBFF28EEF809FF645BC2DFF00A68B5AF68AF3EFD92BE13F88BE037ECA9F0CBE06F8BEF6CAE756F067C3ED1742D52E34D91DEDA5B9B4B186DE47899D519A32F1B152CAA48232A0F15E8345469D46D770A69AA714FB20AFCEDF09A7877FE0B7BFB63DE78BFC5FE0DB2D53F663FD9EBC4F7FA5E816CDE254B8B6F883E328FECF9BDB8B585A482E74CB7B766683711E60BB525A58EE6E6D61F75FF82B77ECC1FB5CFED8DFB235C7ECF9FB1FFC5CD17C1DA96BDAD45178BEEB5CBF9ED62D4342305C0B8B212DBDBCF2AF9929B6DEAA104912CB1B314778DFC5FF00673F807FF05DEFD96FE057853F679F84FA6FEC5D6DE1FF0008E8B0E9D61BE1F1424B71B17E7B99BC98E3479E690BCD2C8117CC96577232C6BA28C631A6E6A494B6F4F3396BCA52AAA0E2DC56AF4BDDF6F4EA7E82D15E13FB24C1FF0005336F116AF73FB776ABF0253494B245D06CBE12586B2D732DC97CBC9713EA12858E3445C08D227321977178C45B65F76AE69479656BDCEB84B9E37B5BD4FCFAFF0082B27FC344FF00C3C8BF633FF8650FF842FF00E13FFF008B89FD81FF000B0FED7FD8FF00F207B3F3FED1F63FDFFF00A8F3B66CFF00969B33F2E6B6BC73F053FE0BF5FB416969F0BFC79FB4EFECF9F08FC3FA879E9ADF8BFE10691AD5EEBA9035ACD188604D476A26E91E33E6C52C13C450491CB9528FED1FB45FECA1F113E2EFEDE3FB38FED45E1BD674583C3FF083FE12FF00F8496CEFAE665BCB9FED5D2E2B4B7FB32244C8FB64425F7BC785C15DE78AFA0EBA5D750A705149B4BAABDB5672AC3B9D4A8E4DA4DF476BFBA8F3EFD957F664F85BFB1BFECF9E18FD9A3E0BDA5EC5E1CF0AD93C164DA95E1B8B99E492579E79E57200324B34B2CAC155514C8422220545F41A28AE593726DBDCEB8C546292D91F177FC1197FE6EBBFECF47C75FF00B635F68D7E7D7C2EFD943FE0B35FB29FC44F8C1FF0CBBACFECC57BE12F893F1A7C41E3AB3FF84FAE7C4526A307F684C9B227FB2451C4BB62862CA8DF872F87618C7D05FB287FC3D57FE1625EFF00C372FF00C33E7FC225FD8B27F677FC2A7FEDCFED1FED1F3A1F2FCCFED0FDD791E57DA376DF9F7F978E37574D782949CD491C9879CA1050717F7687D075F03FFC1C0FF1BFC6DA27ECD1E16FD8FF00E109F13DCF8A7E38F89CE957DA6781BC3379AAEB927866D23FB4EB12D8C16F2C2B348A9F668E48259556682E274385DF2C5F7C57CDFE1CFD8B3C45AEFF00C14F3C4FFB7C7C638BC31796DA37C3ED3BC23F076DF4D5792EEC6D99A7B8D4AEEF5678488AECCD3C90432DB4A01B59A549137392630F2842A73CBA6BEAFA1A62633A94F923D74F45D7F03E3BFDB27F6A8F07FED07FF04E6F11FEC0DF0D7FE094BFB68F87B4CFF842ECF49F0546FF0006E4F2ACA5D34C12E9914D349733CAD0096D2DD256C3CAD16FC1DE430FB13FE092DFB635F7EDD3FB04780FE3BF8A355B2B9F149B2934AF1A2DADF412C8BAADA486096599218E35B692E1163BC106C511A5DC61772ED76FA42BE7CFD94FF62AD53F658FDA97E3CFC52F0CF8D7CDF02FC5FD6B4BF12E97E13FB5DD37F636BA56EC6B33EC95DD0FDAA46B69BCC42A4FFA9F2D12DA22F72AB4AA5171B59A775D7C9FF9FC8CE346AD3AEA57BA6ACF4B5BAA7FA7CCFA0EBE2EFF009D88BFEECBBFF76DAFB46BE7CFF8650F889FF0F55FF86E5FED9D17FE112FF867CFF8417FB3BED337F68FF68FF6E7F6879BE5F95E5791E57CBBBCDDFBF8D98F9AB3A3251E6BF666B5A32972DBBA3E70F84F657DFF00047AFF008285CDF0164D3AF63FD9C3F693F13B5F781AF6CBC2700B6F09F8FAF6648868BE65A1530DA4D0C48B087876A8102A616DAF6E1BD07FE0DE7FF943EFC21FFB8FFF00EA41A957BB7EDC7FB1CFC2DFDBBFF668F127ECE7F1534AB278F55B291F41D62EAC4CF2685AA88DD6D752855648DBCC85DF2556441221922726395D4F2FFF0004B0FD943E227EC3FF00B077813F65DF8B1ACE8BA87883C31FDA9F6FBCF0EDCCD2D9C9F69D52EEED3CB79A289CE239D01CA2E183019182769D5854C33BFC5757F3B27AFE3A9853A33A58A56F82CEDE576B4FC343E83AFCC6F0F7EC65FF000D75FF000582FDB0BFE32BBE34FC30FF00847BFE15F7FC920F1D7F62FF006979FE1F3FF1F7FB993CEF2FC9FDDF4DBE6CBD7771FA735F0A78CFF650FF0082AAFC22FDBC7E36FED45FB166B3FB3E4FE1FF008BFF00F08DF9D67F146E75C6BCB6FECAD2D6D06D4B089513748F39397932BE59F90EE15186972F3D9D9B5A5FD5178A873725D3693D6DE8FF0053D3BF679FF8265FFC33E7C61D1FE2FF00FC3C17F69DF1C7F647DA3FE297F887F15FFB4F47BDF36DE483FD22DBECC9E66CF33CC4F986D92346E76E0FD3B5F1DF86E0FF0083802EBC45616DE2FD57F63BB1D264BD89754BDD36C3C5577736F6C5C09248A0796159A454DC56369630C4052E80EE1F625456E66D39493F434A1C8A2D462D7A851451589B9E2FFF000522FF0094777C7BFF00B22DE29FFD345D57C77FB03FFC1247C45E3FFD893E1378FF00C51FF0545FDAAB4DB9D7FE1F693AA45A4782FE2B3E99A56996D716B1CD6F656D6CF14C638E085E387EFE18C4595635611A7DD7FB5AFC27F117C79FD953E26FC0DF085ED95B6ADE33F87DAD685A5DC6A523A5B4573776335BC6F2B22BB2C61E452C5558800E149E2BE3BFD9CFE09FFC1C1DFB36FC0AF0A7C02D03C63FB246BDA6F83B458749D2752F111F121BC6B381765BC521B582089BCB8824418461996352E5DCB3B76519B541A8C9277EBE870D7845E214A516D5BA7A9F5BFECA1FB32FFC329FC3BBDF879FF0D05F13BE24FDB75A9351FEDCF8B1E2CFED8D460DF0C317D9A39BCB8F6C0BE4EF58F070F2C873F3607A757CF9FB287FC3D57FE1625EFF00C372FF00C33E7FC225FD8B27F677FC2A7FEDCFED1FED1F3A1F2FCCFED0FDD791E57DA376DF9F7F978E3757D075CF52FCFABBFA1D549AE4564D7A9F177EDBDFF2982FD873FEEA67FEA3F057DA35F3E7ED17FB287C44F8BBFB78FECE3FB51786F59D160F0FFC20FF0084BFFE125B3BEB9996F2E7FB574B8AD2DFECC891323ED91097DEF1E1705779E2BE83AAAB24E104BA2FD5914A328D4A8DF57FFB6C51F177FC1C31FF00287DF8BDFF00700FFD4834DABBFF000558FD9F3F683B4B1D0FFE0A09FB0A3DE8F8D5F092CA5893C3BA6E9515C47E3AF0F4D3C2F79A35EC61A39AE638C23DCC3123B387128823FB44D0CB17A0FF00C153FF00650F889FB707EC1DE3BFD977E13EB3A2E9FE20F13FF65FD82F3C4573345671FD9B54B4BB7F31E18A57198E070308D962A0E0648FA0EAE157D9D28DB74DE9E4D47F3D489D1F695677D1351B3F34E5B7A687E4F7843F6DDF0EFED29FF05F4FD9AFE397ECE3E22BD8FC1FF167F66FBEB0D52DF52D2D23B992DA0B9F115C49672AB86F2A48AFF4D8833C2C431B73B249227CBFEB0D7E7D7C32FF008219F83FE027FC15EB45FDBD3F67CD4745F0A7C38D3B45BFBDBAF03DB892497FB76EEDAEECA586D2111A456761E55CADC01E648525578A3892168FC9FD05A78B951938FB3D92FD593838568C67ED7772FD16C7C0FF00F0703F813C45F147E0CFECFF00F0CFC21F102F7C27AB788BF6AAF0A697A5F8AB4D0E6E746B9B8B7D4628EF62D9246DE642EEB22ED7439418653C8E9FFE1CCBFF00595CFDB47FF0FA7FF71D7A77FC1403F650F889FB567FC292FF008579ACE8B65FF0ADBF683F0DF8EB5CFEDAB99A3F3F4ED3FED3E7450795149BA76F39762BEC4383975E33F41D1EDE50A318C5F71FD5E13AF394D76317E1B7833FE15C7C3BD03E1E7FC259AD6BDFD83A2DAE9DFDB9E24BFF00B56A3A8F910AC5F69BA9B0BE74F26DDF24981B9D98E0671577C49E24F0EF837C3B7FE2FF0017EBF65A5693A5594B79AA6A9A95D2416D676D1217926964721638D115999D880A0124802AED7CF9FF000535FD9B7F689FDB03F65ABBFD99FF00679F89BA2F83BFE131D6ACEC3C73E22D55EEC4F6DE1D2C5EF56CD6D8AF9D3C9B6388C32B24334125C44EE9BC30C2094E6949D93EA744DB8536E2AED6C8FCFAFF00825FFF00C149BC6163E30F8D3FB71FC4AFD82BF69DF1AEB5F1DBC690DCE9D7BF0D7E1A47AC68569A16991C969A7DA457482D7CE9E0DF716D2CBB48716D1310B279B9F41FD857F6C6F117867FE0B11E2DF0047FB337C5BF871F0F3F699B2935BF0FF877E24FC367F0F9B0F15E97A787D42E208FED6D04B1DCDBC4F35CDCA219E4B896D15D42A1964FD2DF86DF0F3C1FF08BE1DE81F09FE1E68FFD9FE1FF000C68B6BA4E8761F68925FB359DB42B0C316F9599DF6C68ABB9D998E32493935E13FF000544FD8EFE297ED91FB3E68BA27ECFFE3EB2F0CFC48F017C41D1BC69F0F358D5E50BA7C1AAD8CACA1AE97ECD72648D619E76541190D2A43BBE4DEADD9F58A352A35CB652D37DBB7DD6470FD5ABD2A517CD77177B5B77D7EFBB3E90AF853FE0BE5E33FF008545F02BE08FED0DAAF84F5AD57C3FF0CBF69DF09F8A7C59FD8761E7CB6DA75AADE6F90E4AA26E91E2851A474432CF121605C57DD75CC7C67F831F0B7F688F85BADFC14F8D7E09B2F11785BC45646D758D1EFD498E68F219486521A3911D55D2542AF1BA23A32B2AB0E5A3354EAA93D8ECAF4DD5A2E29EACE9E8AF81FE1AFEC7BFF0594FD896C57E0BFEC7BFB557C24F895F0BF4FB28E0F08597C7DD33518755F0D5B24F7063B18E7D2D73771AC2F0279B2B80044B1C305BC6815BD07F66CFD987FE0A5BE21FDA474FFDA63F6F4FDB23458ECBC3DF6E8BC3FF0006FE0D5B5CDAF86E5F3ECE0B7FB45F4F7416E2F70C27956DE7593CA9BCB9629D14BC1552A3049BE756F9DFEE2235E6DA4E0D3F9597CEE7D6F5F0A7FC178FC19FF0B1FE1DFECE1F0F3FE12CD6B41FEDEFDADFC1FA77F6E786EFFECBA8E9DE7C3A845F69B59B0DE4CF1EEDF1C983B5D54E0E315F75D7CF9FF0500FD943E227ED59FF000A4BFE15E6B3A2D97FC2B6FDA0FC37E3AD73FB6AE668FCFD3B4FFB4F9D141E54526E9DBCE5D8AFB10E0E5D78CAC3C942B2931E260E741C523CC7FE1CCBFF00595CFDB47FF0FA7FF71D798FECA1FB32FF00C329FF00C177AF7E1E7FC3417C4EF893F6DFD9224D47FB73E2C78B3FB6351837F8A218BECD1CDE5C7B605F277AC7838796439F9B03F47EBE7CFF008650F889FF000F55FF0086E5FED9D17FE112FF00867CFF008417FB3BED337F68FF0068FF006E7F6879BE5F95E5791E57CBBBCDDFBF8D98F9AB586227252527BA6653C3538CA2E0B668FA0E8A28AE43B028A28A00FCFAFF00827D7C43F865FF0004DDF8C3FB487FC13E3E21EB1AD695E0DF865F6AF8ABF0F6FF0055B7D4A7820F055D5BC535EDB59A3ACC5A0D3AE774464495DEEA79EE184424498574FF00F0431F86BE36D77F67CF137EDFBF1C92F4FC48FDA3FC4F3789B5E5BDB7BC8458E950CB341A558DBA5D4F29368909926B7906D26DEEE18F2E90C4E697FC15B3FE0931F163F6F0F889E11F8B1FB367ED05FF000AD7C40DA2CFE0CF8997FF006FBF8FFB6BC2371379CF6DB2DE4093F95219DBEC8EA91DCFDA712CC8218C1FB47E1B7C3CF07FC22F877A07C27F879A3FF67F87FC31A2DAE93A1D87DA2497ECD676D0AC30C5BE56677DB1A2AEE766638C924E4D7656AB074AF17EF4AD7F97F9BD4E1A346A46B5A4BDD8DF97E7FE4B436ABE21FF00838B3C37E1DD77FE0917F13354D6F40B2BCB9D1AF741BCD1EE2EAD52492C6E5B59B2B769A16604C5218679E22EB825269173B5D81FB7ABE6FF00F82B1FEC93F19BF6E6FD873C53FB30FC0DF17786347D5BC457BA6B5C4DE2C82E0DB4D6D6F7B0DD346B2DBEE6B7937C31B090C538211A3D8A6513458E1E4A188849BB24D7E66F8A8B9E1A714AEDA7F91E7DFF000E65FF00ACAE7EDA3FF87D3FFB8EBE9DFD9E7E0C7FC33E7C1ED1FE107FC2D7F1A78E3FB23ED1FF001547C43D77FB4F58BDF36E249FFD22E762799B3CCF2D3E51B638D179DB93F317FC7445FF00565DFF00976D7D07FB287FC366FF00C2BBBDFF0086E5FF008563FF00096FF6D49FD9DFF0A9FF00B47FB3BFB3BC987CBF33FB43F7BE7F9BF68DDB7E4D9E5E39DD5759D470F7A49FA19D15494FDD835EA7A757E48C7FB39FED4BF1B7FE0E0BFDA67C4DFB2C7ED61FF0A7F52D0BC17E1DB5D53C45FF000AE17C45F6B82EB4AD21C5AEDB94169065AD43E5E649DBCAC451CA82E1A1FD6EAF09F813FB24F88BE0E7EDC7F1F3F6A6B9F17595FE93F192CBC22D65A74703C773A65CE936575653C6F9CAC91BA35BCA92020E64950A288D5E5587ABEC94DF56ADDFAAFD0AC4D1F6CE0BA2777D3A3FD4F853E307C0FF00DA7FC47FB6DF847F604FF82C1FFC1412F7C61F04BE23D90D4FE1D4DA0697A6785A3F19F886C2EAC58E85A9259DB99A28C89E42B1F9E126736661985D058A3FD54F0DF86FC3BE0DF0ED87843C21A059695A4E9565159E97A5E9B6A905B59DB4481238628D0058E3445555450028000000AF16FF00828B7EC6363FB71FECD17DF0C74EF10DEE87E30D0EF53C45F0C7C4D61ADCFA7C9A2789AD6397EC17666855D9630F2323908ECA923B4616558DD3D0BF673B2F8EBA5FC0AF0A691FB4DEA1A2DEF8FECB4586DBC59A97876F1A7B3D42F235D8F771936B6DB3CEDA2631085162691A352EA81D9D6A8AAD28BDADBADBE765DFA8A8D274AAC96F7D9BD5FA36FB743B4AFCEDF0AF8F3E16FF00C13E3FE0B61F1E2C3C59E2CF0C787FC13F16FE04DB7C53D5D574836F73697DA3C97305CC56E90BB1BD924863D57529F642D34877301FBA91E5FD12AF887FE0B4FF00F049AF117FC151FC3BF0C6DBC0BF11ECBC35AB7833C4F3ADFDEEACCEF6C9A2DEA442F648E08E22D71768F6B6A628CCB0C6C0CCAEE0B232AC34A1CEE33768B567F9FE683151A8E9A9D357945DD7E4FF0006731FF04DFF00D8975CF8EFFF000471F15784BF689BFDFE2DFDA83FB7BC6DE29D4F5AD3AC6FE0B5D475800D8EA905B5B88E25DB143617E916E578E7270D095548BC27C45F12AFBF6DBFF8261FEC97FF0004DDB17BDF0DF8A7C6FF00106C7C01F157C0D6B7107F6AD9687E12561AD34D25D41B74FBB892DB4DBF16D2059F13471AACEA5C3FEB0FC36F879E0FF845F0EF40F84FF0F347FECFF0FF0086345B5D2743B0FB4492FD9ACEDA158618B7CACCEFB63455DCECCC719249C9AF887F65EFF822BD8FC0AFF82B67C4BFF8289788BC6165A9E87AC5EDF6A9F0F7476BA9DF50B2D575552DA95CDC322430A47199AF60821C5C068AE95DD9258559F7A7888394E5276B3E65EBB25F97DC73D4C34E318422AF75CB2F4DDBFCFEF3EF8A28AF17FF008288FC13F8EBFB497EC55F10BE017ECDFE31D1741F16F8C7455D26DB52F1116166B673CD1A5FC521582765F32C8DCC419632CAD2295284075E28A52924DD8F42727183695EDD0FCDFF00D80BFE0A11F68FDA97E3AFFC14775DFF0082787ED07E35FF0085C9AD5AD8780757F871F03BEDF05978774C56B38D4DFB5E9CCF3F9100BA86126113D82B076F9521E9FF0067CFDB92FBC29FF05CC3E2BB9F801F16FE17F827F69FF0C5A695ACDAFC75F0DC1E1E2FE26D22D5A3B396C0BA399E3308B7B41009833DC6AA58E716F19FD3AF825F09FC3BF01BE0CF847E06F842F6F6E749F067862C342D2EE352911EE65B6B4B78EDE379591515A4291A962AAA09270A0715E47FF0535FD8AB54FDBAFF0065ABBF85BE06F1AFFC22FE3AD0B5AB3F12FC35F167DAEEA0FEC6D76CD89827DF6CEAE9BA379A1F30090C3E7F9CB1BBC482BB562284EA34E364D5AF7D974FBAC99E7FD5ABC2926A5769F35ADBBEBAF9DDA3E83AF17FF82917FCA3BBE3DFFD916F14FF00E9A2EABD3BE1B7FC2C4FF8577A07FC2DFF00EC5FF84B7FB16D7FE128FF00846FCEFECEFED1F257ED3F65F3FF007BE479BBFCBF33E7D9B77739AC5FDA47E107FC341FECEDE3DF807FF090FF00647FC271E0BD57C3FF00DADF64FB47D8BED9692DB79FE56F4F336799BB66E5DDB71B867238E0D46A26FA33BA69CA934BAA3E62FF008379FF00E50FBF087FEE3FFF00A906A55F68D7E707EC6DFB287FC177BF61FF00D9BBC39FB2EFC27D67F648D43C3FE18FB67D82F3C4573E2896F24FB4DE4F76FE63C314487124EE061170A141C9C93F5BFEC85FF0F11FF8A87FE1BDFF00E14B7FCBA7FC229FF0A83FB5FF00E9B7DABED7FDA3FF006EFE5F97FF004D777F0D6F898275673524D36DEFDD9CF859CA34A14DC5A6925B69A23DA2BE2EFF0082CD7FCDA8FF00D9E8F817FF006FABED1AF9F3FE0A01FB287C44FDAB3FE1497FC2BCD6745B2FF856DFB41F86FC75AE7F6D5CCD1F9FA769FF0069F3A283CA8A4DD3B79CBB15F621C1CBAF19CE84946AA6CD711194E8B48FA0E8A28AC4DCFCC6FF0082EFFC26D2FE3A7EDD3FB12FC27D63E23EB5E118B59F1A788234F12786F51B5B3D46C6557D1A489ED67B99E148A7F31116370CF2ABB29861B997CBB797DA3FE1CCBFF595CFDB47FF000FA7FF0071D5DFF82A3FEC21FB4BFED45F14BE067ED19FB26F8D3E1F5978C3E0AF89EFB51B5D1FE26E9525C6957F1DC8B562ECD1C5332C91BD9C6176C6AE0CC658E782582366A5FF001D117FD5977FE5DB5E82A927421184D2B5EF7F5679AE9C5622A4A706EED5ADE8BCFB9F5BFC36F067FC2B8F877A07C3CFF84B35AD7BFB0745B5D3BFB73C497FF6AD4751F22158BED3753617CE9E4DBBE4930373B31C0CE2B6AB8BFD9E7FE1A27FE14F68FF00F0D5FF00F085FF00C27FFE91FDBFFF000AF3ED7FD8FF00F1F12791F67FB67EFF00FD4793BF7FFCB4DF8F9715DA5704B4933D08FC28FCB8FF008227F86FC3BE32FDBBFF00E0A1FE10F17E8165AAE93AAFC5B6B3D534BD4AD527B6BCB69754F122490CB1B82B246E8CCAC8C08604820835E85FF04E7D63C61FF04D8FDA96FF00FE0901F17EF75ABFF02EADF6AD6BF65EF185FF0087635FED5B3DB35FEADA5DCDCDB31469EDA491DC19238D9B12BB79693D9407D6FF00601FF8275788BF631FDA5FF692F8F1ADFC4FB2D76DBE37FC418F5DD1F4FB5D35E1934DB6125E5D324CCCEC1A4F3B519E101460A5AC72EE0D33430F4FFF00053BFD837C1FFF000515FD91B5EF805AFB791AD41BB56F02EA4FA8496D1586BB0C1325ACB314493740DE73C52A98DCF95339402458DD7BAA56A73ACE2DFBB24BE4D25AFCBF2B9C14A855A742324BDF8B969DD36DDBE7D3B3B1E63FF06F3FFCA1F7E10FFDC7FF00F520D4ABED1AF09FF8267FEC93E22FD85BF61CF00FECB3E2FF0017596B9AB7866CAEDB54D474D81E3B66B9BABDB8BD9238B7FCCF1C6F70D12C8C10C8230E5232DB17DDAB971128CEBCE4B66DFE675E1A32861E1196E92FC828A28AC8D828A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A0028A28A00FFD9>';

function buildPdfBlob(data){
  const date=new Intl.DateTimeFormat('de-DE').format(new Date());
  const esc=pdfEscape, pages=[]; let c='',y=0;
  const txt=(x,yy,s,size=10,bold=false,color='0.10 0.15 0.17')=>{c+=`${color} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${yy} Tm (${esc(s)}) Tj ET\n`;};
  const rule=(yy,x1=48,x2=547,w=.7,col='0.45 0.49 0.50')=>{c+=`${col} RG ${w} w ${x1} ${yy} m ${x2} ${yy} l S\n`;};
  const portalLogo=()=>{
    // Vorläufiges Portal-Logo: schwarze Tür + orange flüchtende Person.
    c+='0.10 0.15 0.17 RG 2 w 427 789 36 38 re S\n';
    // geöffnete Tür / Fluchtöffnung
    c+='0.10 0.15 0.17 RG 1.5 w 456 792 m 456 824 l S\n';
    // laufende Person: Kopf, Rumpf, Arme und Beine
    c+='0.86 0.29 0.25 rg 441 816 5 5 re f\n';
    c+='0.86 0.29 0.25 RG 2.6 w 443 815 m 447 806 l S\n';
    c+='0.86 0.29 0.25 RG 2.3 w 446 811 m 453 813 l S 446 810 m 439 806 l S\n';
    c+='0.86 0.29 0.25 RG 2.5 w 447 806 m 453 799 l S 447 806 m 441 798 l S\n';
    txt(472,814,'MEIN',7,true,'0.20 0.25 0.27');
    txt(472,801,'BRANDSCHUTZPORTAL',8,true,'0.86 0.29 0.25');
    txt(472,790,'Brandschutzpläne einfach verwalten',5.8,false,'0.38 0.43 0.44');
  };
  const footer=()=>{
    rule(54,48,547,.45,'0.72 0.75 0.76');
    txt(48,40,'Matthias Klein',7.2,true,'0.28 0.32 0.33');
    txt(48,30,'Sachverständiger für vorbeugenden Brandschutz (EIPOS)',6.7,false,'0.32 0.36 0.37');
    txt(48,20,'Schloßstraße 76 · 49080 Osnabrück · Tel. 0176 24137533',6.7,false,'0.32 0.36 0.37');
    txt(335,40,'kontakt@mein-brandschutzportal.de',6.7,false,'0.32 0.36 0.37');
    txt(335,30,'USt-IdNr. DE324805288',6.7,false,'0.32 0.36 0.37');
    txt(335,20,'St.-Nr. 66/122/18189',6.7,false,'0.32 0.36 0.37');
  };
  const header=(first=false)=>{
    // Portal-Kopf mit dem vom Nutzer bereitgestellten Logo und Untertitel.
    c+='q 34 0 0 48 48 790 cm /ImLogo Do Q\n';
    txt(94,820,'Mein',13,true,'0.10 0.15 0.17');
    txt(128,820,'Brandschutzportal',13,true,'0.86 0.29 0.25');
    txt(94,800,'BRANDSCHUTZPLÄNE EINFACH VERWALTEN',6.25,false,'0.18 0.24 0.27');
    rule(786,48,547,.55,'0.72 0.75 0.76');
    if(first){
      txt(48,748,'KOSTENSCHÄTZUNG',9,true,'0.86 0.29 0.25');
      txt(48,716,`${data.planCount} ${data.planCount===1?'Flucht- und Rettungsplan':'Flucht- und Rettungspläne'}`,20,true,'0.10 0.15 0.17');
      y=674;
    } else {
      txt(48,748,'KOSTENSCHÄTZUNG · FORTSETZUNG',9,true,'0.86 0.29 0.25');
      txt(48,716,`${data.planCount} ${data.planCount===1?'Flucht- und Rettungsplan':'Flucht- und Rettungspläne'}`,17,true,'0.10 0.15 0.17'); y=674;
    }
  };
  const finish=()=>{footer();pages.push(c);c='';};
  const ensure=(need=60)=>{if(y<82+need){finish();header(false);}};
  const detail=(title,value)=>{const ls=wrapText(value,92);ensure(24+ls.length*13);txt(48,y,title,9,true,'0.27 0.34 0.37');y-=14;for(const l of ls){txt(58,y,l,9,false);y-=13;}y-=5;};
  const bullet=(value)=>{const ls=wrapText('• '+value,88);ensure(ls.length*14+6);for(const l of ls){txt(68,y,l,9,false);y-=14;}};
  const priceBox=()=>{
    ensure(92); c+=`0.94 0.96 0.96 rg 48 ${y-65} 499 74 re f\n`;
    txt(62,y-17,'VORLÄUFIGE KOSTENSCHÄTZUNG',8.5,true,'0.86 0.29 0.25');
    txt(62,y-42,data.net,17,true); txt(62,y-58,data.gross,9.5,false,'0.34 0.41 0.44'); y-=88;
  };

  header(true);
  // Kompakte Metadaten: auch ohne Namenseingabe bleibt klar, dass keine Angabe vorliegt.
  rule(y); y-=14;
  txt(54,y,'KUNDE / UNTERNEHMEN',6.6,true); txt(165,y,'ANSPRECHPARTNER',6.6,true); txt(275,y,'OBJEKT',6.6,true); txt(405,y,'NUTZUNG',6.6,true); txt(505,y,'DATUM',6.6,true); y-=13;
  const custMeta=data.customer==='nicht angegeben'?'ohne Angabe':data.customer;
  const contactMeta=data.contact==='nicht angegeben'?'ohne Angabe':data.contact;
  txt(54,y,custMeta,7.4,false); txt(165,y,contactMeta,7.4,false); txt(275,y,data.address,7.4,false); txt(405,y,data.usage,7.4,false); txt(505,y,date,7.4,false); y-=14; rule(y); y-=22;
  // Angebotähnliche, kompakte Darstellung statt langer Erläuterungsblöcke.
  txt(48,y,'Vorläufige Kostenschätzung für die Erstellung bzw. Aktualisierung der Flucht- und Rettungspläne.',9,false); y-=24;
  if(data.notes && data.notes!=='keine'){
    txt(48,y,'Hinweis zum Objekt / Auftrag:',8.5,true,'0.27 0.34 0.37'); y-=13;
    for(const l of wrapText(data.notes,92)){txt(58,y,l,8.5,false);y-=12;} y-=8;
  }
  const cols=[48,78,348,408,478,547];
  const tableHeader=()=>{
    ensure(34); rule(y,cols[0],cols[5],.8,'0.25 0.30 0.32');
    txt(53,y-15,'Pos.',7.5,true);txt(84,y-15,'Leistung',7.5,true);txt(353,y-15,'Menge',7.5,true);txt(413,y-15,'Einzel €',7.5,true);txt(483,y-15,'Gesamt €',7.5,true);
    y-=24; rule(y,cols[0],cols[5],.55,'0.45 0.49 0.50');
  };
  tableHeader();
  let pos=1;
  for(const row of data.costRows){
    const descLines=wrapText(row.desc,48); const noteLines=row.note?wrapText(row.note,48):[];
    const h=Math.max(28,descLines.length*12+noteLines.length*10+10);
    if(y-h<95){finish();header(false);tableHeader();}
    txt(56,y-15,String(pos++),8,false);
    descLines.forEach((l,i)=>txt(84,y-15-i*12,l,8.2,true));
    noteLines.forEach((l,i)=>txt(84,y-15-descLines.length*12-i*10,l,6.8,false,'0.38 0.43 0.44'));
    const qty=Number(row.qty); const qtyText=(row.unit==='km'||row.unit==='Std.')?`${qty.toFixed(2)} ${row.unit}`:`${qty} ${row.unit}`;
    txt(353,y-15,qtyText,7.5,false);txt(413,y-15,row.each==null?'–':money(row.each),7.5,false);txt(483,y-15,money(row.total),7.5,false);
    y-=h; rule(y,cols[0],cols[5],.35,'0.72 0.75 0.76');
  }
  ensure(48); y-=10;
  txt(48,y,'Vom Kunden angegebene Unterlagen / Kalkulationsgrundlage',8.2,true,'0.27 0.34 0.37'); y-=13;
  for(const l of wrapText(data.source,95)){txt(48,y,l,7.4,false,'0.36 0.43 0.46');y-=10;} y-=8;
  const subtotal=data.costRows.reduce((a,r)=>a+r.total,0), vat=subtotal*.19, gross=subtotal+vat;
  y-=15; txt(355,y,'Zwischensumme (netto)',8.5,false);txt(483,y,money(subtotal),8.5,false);y-=17;
  txt(355,y,'Umsatzsteuer 19 %',8.5,false);txt(483,y,money(vat),8.5,false);y-=20;
  txt(355,y,'Gesamtbetrag',9,true);txt(483,y,money(gross),9,true);y-=28;
  rule(y,48,547,.6,'0.45 0.49 0.50'); y-=20;
  const assumption=planKnowledge()==='unknown'?'Die Plananzahl ist eine Vorkalkulation mit 2 Plänen je angefangenen 200 m² relevanter Geschossfläche. Die endgültige Anzahl wird nach Prüfung festgelegt.':'';
  if(assumption){for(const l of wrapText(assumption,95)){txt(48,y,l,7.6,false,'0.36 0.43 0.46');y-=11;}y-=5;}
  const foot='Unverbindliche Kostenschätzung auf Grundlage Ihrer Angaben. Ein verbindliches Angebot erfolgt nach fachlicher Prüfung der Unterlagen.';
  for(const l of wrapText(foot,95)){txt(48,y,l,7.6,false,'0.36 0.43 0.46');y-=11;}
  finish();

  const pageCount=pages.length;
  for(let i=0;i<pageCount;i++){const label=`Seite ${i+1}/${pageCount}`;pages[i]+=`0.35 0.39 0.40 rg BT /F1 7 Tf 1 0 0 1 490 16 Tm (${esc(label)}) Tj ET\n`;}
  const objs=[],pageIds=[],contentIds=[];let id=3;for(let i=0;i<pages.length;i++){pageIds.push(id++);contentIds.push(id++);}const f1=id++,f2=id++,imLogo=id++,imTag=id++;
  objs[1]='<< /Type /Catalog /Pages 2 0 R >>';objs[2]=`<< /Type /Pages /Kids [${pageIds.map(x=>x+' 0 R').join(' ')}] /Count ${pages.length} >>`;
  pages.forEach((content,i)=>{objs[pageIds[i]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << /ImLogo ${imLogo} 0 R /ImTag ${imTag} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;objs[contentIds[i]]=`<< /Length ${winAnsiBytes(content).length} >>\nstream\n${content}\nendstream`;});
  objs[f1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';objs[f2]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[imLogo]=`<< /Type /XObject /Subtype /Image /Width 264 /Height 378 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${PORTAL_LOGO_JPEG_HEX.length} >>\nstream\n${PORTAL_LOGO_JPEG_HEX}\nendstream`;
  objs[imTag]=`<< /Type /XObject /Subtype /Image /Width 986 /Height 37 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${PORTAL_TAGLINE_JPEG_HEX.length} >>\nstream\n${PORTAL_TAGLINE_JPEG_HEX}\nendstream`;
  const maxId=imTag;let pdf='%PDF-1.4\n',offsets=[0];for(let i=1;i<=maxId;i++){offsets[i]=winAnsiBytes(pdf).length;pdf+=`${i} 0 obj\n${objs[i]}\nendobj\n`;}const xref=winAnsiBytes(pdf).length;pdf+=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;for(let i=1;i<=maxId;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([new Uint8Array(winAnsiBytes(pdf))],{type:'application/pdf'});
}

function downloadCalculationPdf() {
  if (!validateForPdf()) return false;
  const data = getCalculationData();
  const blob = buildPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10).replaceAll('-','');
  a.href = url;
  a.download = `Plankostenkalkulation_${stamp}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

function submitAndDownload() {
  if (!downloadCalculationPdf()) return;
  $('actionStatus').textContent = 'PDF erstellt. Die elektronische Übermittlung der Anfrage wird mit dem späteren Kunden-/Serverbereich aktiviert; in dieser Testversion werden noch keine Daten versendet.';
  $('actionStatus').className = 'action-status ok';
}




function remainingTimeLabel(step,total){
  if(step>=total) return 'noch weniger als 1 Minute';
  if(step>=6) return 'noch ca. 1 Minute';
  if(step>=3) return 'noch ca. 2 Minuten';
  return 'noch ca. 3 Minuten';
}

function initProgress(){
  const cards=[...document.querySelectorAll('main > section.card')];
  if(!cards.length)return;
  const update=(idx)=>{
    const n=Math.min(cards.length,Math.max(1,idx+1));
    $('progressText').textContent=`${remainingTimeLabel(n,cards.length)} · Schritt ${n} von ${cards.length}`;
    $('progressBar').style.width=`${(n/cards.length)*100}%`;
  };
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible)update(cards.indexOf(visible.target));
  },{threshold:[.2,.45,.7],rootMargin:'-15% 0px -55% 0px'});
  cards.forEach(c=>observer.observe(c)); update(0);
}

$('address').addEventListener('input',()=>{ route=null; verifiedGeo=null; verifiedAddressInput=''; const st=$('addressCheckStatus'); if(st){st.className='route-status'; st.textContent='';} calculate(); });
$('floorCount').addEventListener('change',renderFloorAreas);
$('plans').addEventListener('input',calculate);
document.querySelectorAll('input[name="planKnowledge"]').forEach(r => r.addEventListener('change', updatePlanChoice));
document.querySelectorAll('input[name="source"]').forEach(r => r.addEventListener('change', updateInventory));
document.querySelectorAll('input[name="inventory"]').forEach(r => r.addEventListener('change',() => { route = null; calculate(); }));
$('usage').addEventListener('change', updateUsage);
document.querySelectorAll('input[name="constructionVariant"]').forEach(r=>r.addEventListener('change',()=>{renderConstructionChoices();calculate();}));
$('constructionPlans').addEventListener('input',calculate);
document.querySelectorAll('input[name="frames"]').forEach(r => r.addEventListener('change', calculate));
document.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', calculate));
$('constructionAll')?.addEventListener('change',e=>{
  document.querySelectorAll('input[name="constructionFloor"]').forEach(cb=>cb.checked=e.target.checked);
  calculate();
});
$('routeButton').addEventListener('click',calculateRoute);
$('pdfOnly').addEventListener('click', () => {
  if (downloadCalculationPdf()) {
    $('actionStatus').textContent = 'PDF wurde erstellt. Es wurde keine Anfrage versendet.';
    $('actionStatus').className = 'action-status ok';
  }
});
$('submitAndPdf').addEventListener('click', submitAndDownload);

document.querySelectorAll('.help').forEach(helpButton => {
  helpButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = helpButton.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.help').forEach(b => b.setAttribute('aria-expanded','false'));
    helpButton.setAttribute('aria-expanded', String(!open));
  });
});
document.addEventListener('click', () => document.querySelectorAll('.help').forEach(b => b.setAttribute('aria-expanded','false')));

function setTheme(theme){ document.documentElement.dataset.theme='light'; }
document.documentElement.dataset.theme='light';
setTheme('light');

updateUsage();
updateInventory();
initProgress();
updatePlanChoice();


// V19: Schritt-für-Schritt-Ansicht statt langer Scrollseite.
(function initWizard(){
  const cards=[...document.querySelectorAll('main > section.card')];
  const result=document.querySelector('.result-card');
  const pages=[...cards,result];
  const nav=document.querySelector('.wizard-nav');
  let current=0;
  function showPage(index){
    current=Math.max(0,Math.min(index,pages.length-1));
    pages.forEach((el,i)=>el.classList.toggle('wizard-active',i===current));
    const onResult=current===pages.length-1;
    nav.classList.toggle('on-result',onResult);
    $('prevStep').style.visibility=current===0?'hidden':'visible';
    $('nextStep').textContent=current===cards.length-1?'Kostenschätzung anzeigen':'Weiter';
    $('nextStep').style.display=onResult?'none':'';
    if($('progressText')) $('progressText').textContent=onResult?'Kostenschätzung':`${remainingTimeLabel(current+1,cards.length)} · Schritt ${current+1} von ${cards.length}`;
    if($('progressBar')) $('progressBar').style.width=onResult?'100%':`${((current+1)/cards.length)*100}%`;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function missingForPage(index=current){
    const missing=[];
    if(index===0){
      if(!$('address').value.trim()) missing.push('Objektadresse oder zumindest Ort');
      if(!$('usage').value) missing.push('Nutzung des Objekts');
      if(['other','mixed'].includes($('usage').value) && !$('usageOther').value.trim()) missing.push('kurze Beschreibung der Nutzung');
    }
    if(index===5){
      if(!$('floorCount').value) missing.push('Anzahl der relevanten Geschosse');
      if($('floorCount').value==='more') missing.push('individuelle Kalkulation für mehr als 10 Geschosse – bitte kontaktieren Sie uns per E-Mail');
    }
    if(index===6){
      const knowledge=document.querySelector('input[name="planKnowledge"]:checked')?.value;
      if(knowledge==='known' && !(Number($('plans').value)>=1)) missing.push('Anzahl der benötigten Pläne');
    }
    if(index===7){
      const construction=document.querySelector('input[name="constructionVariant"]:checked')?.value;
      if(construction==='yes' && !document.querySelector('input[name="constructionFloor"]:checked')) missing.push('mindestens ein von der Bauphase betroffenes Geschoss');
    }
    return missing;
  }
  function pageIsValid(index=current){ return missingForPage(index).length===0; }
  function showValidation(){
    const box=$('wizardValidation'), missing=missingForPage();
    if(!box) return;
    if(!missing.length){ box.classList.add('hidden'); box.textContent=''; return; }
    box.innerHTML=`Bitte noch ausfüllen: <strong>${missing.join(' · ')}</strong>`;
    box.classList.remove('hidden');
    box.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function updateNextState(){
    const btn=$('nextStep');
    if(!btn || current>=cards.length){ return; }
    const valid=pageIsValid();
    btn.classList.toggle('is-incomplete',!valid);
    btn.setAttribute('aria-disabled',String(!valid));
    if(valid) $('wizardValidation')?.classList.add('hidden');
  }
  function showPageChecked(index){
    if(index>current && !pageIsValid()){ showValidation(); updateNextState(); return; }
    showPage(index);
    $('wizardValidation')?.classList.add('hidden');
    updateNextState();
  }
  $('prevStep').addEventListener('click',()=>showPageChecked(current-1));
  $('nextStep').addEventListener('click',async()=>{
    if(!pageIsValid()){ showValidation(); updateNextState(); return; }
    if(current===0){
      const addressOk=await verifyAddress();
      if(!addressOk){
        const box=$('wizardValidation');
        box.innerHTML='Bitte prüfen: <strong>Objektadresse oder Ort konnte nicht eindeutig gefunden werden.</strong>';
        box.classList.remove('hidden'); box.scrollIntoView({behavior:'smooth',block:'center'}); return;
      }
    }
    if(current===2 && (inventoryMode()==='us' || source()==='none') && !route){
      const routeOk=await calculateRoute();
      if(!routeOk){
        const box=$('wizardValidation');
        box.innerHTML='Bitte prüfen: <strong>Fahrtstrecke und Fahrzeit konnten nicht ermittelt werden.</strong> Gehen Sie zurück und prüfen Sie die Objektadresse.';
        box.classList.remove('hidden'); box.scrollIntoView({behavior:'smooth',block:'center'}); return;
      }
    }
    showPageChecked(current+1);
  });
  document.addEventListener('input',updateNextState);
  document.addEventListener('change',updateNextState);
  showPage(0);
  updateNextState();
})();

// V28 – klickbarer Login-/Kundenportal-Prototyp (noch ohne Backend)
(function initPortalPrototype(){
  const modal=$('loginModal'), portal=$('customerPortal'), main=document.querySelector('main');
  function openLogin(){ modal.classList.remove('hidden'); document.body.style.overflow='hidden'; }
  function closeLogin(){ modal.classList.add('hidden'); document.body.style.overflow=''; }
  function openPortal(){ closeLogin(); portal.classList.remove('hidden'); main.classList.add('hidden'); document.body.classList.add('portal-active'); $('loginOpen').querySelector('span:last-child').textContent='Kundenportal'; window.scrollTo(0,0); }
  function closePortal(){ portal.classList.add('hidden'); main.classList.remove('hidden'); document.body.classList.remove('portal-active'); window.scrollTo(0,0); }
  $('loginOpen')?.addEventListener('click',()=> portal.classList.contains('hidden') ? openLogin() : openPortal());
  $('loginClose')?.addEventListener('click',closeLogin);
  modal?.addEventListener('click',e=>{if(e.target===modal) closeLogin();});
  $('demoLogin')?.addEventListener('click',openPortal);
  $('registerDemo')?.addEventListener('click',openPortal);
  $('portalLogout')?.addEventListener('click',closePortal);
  $('changedSomething')?.addEventListener('click',()=>$('changePanel').classList.remove('hidden'));
  $('stillCurrent')?.addEventListener('click',()=>{ $('changePanel').classList.add('hidden'); $('stillCurrent').textContent='✓ Aktualität bestätigt'; });
  $('chooseUpload')?.addEventListener('click',()=>$('portalUpload').click());
  function uploadPicked(input){ const n=input.files?.length||0; if(n) $('uploadStatus').textContent=`${n} ${n===1?'Datei ausgewählt':'Dateien ausgewählt'} – Upload wird später mit dem Kundenkonto verbunden.`; }
  $('portalUpload')?.addEventListener('change',e=>uploadPicked(e.target));
  $('cameraUpload')?.addEventListener('change',e=>uploadPicked(e.target));
  $('forgotPassword')?.addEventListener('click',()=>alert('Die Passwort-Zurücksetzung wird mit der echten Benutzerverwaltung aktiviert.'));
})();

// Kundenportal v29: nachvollziehbare Aktualitätsbestätigung und Aktualisierungsanfrage
(() => {
  const byId = id => document.getElementById(id);
  const formatDate = d => new Intl.DateTimeFormat('de-DE').format(d);
  const addYears = (d, years) => { const n = new Date(d); n.setFullYear(n.getFullYear() + years); return n; };

  byId('stillCurrent')?.addEventListener('click', () => {
    const now = new Date();
    const date = formatDate(now);
    const next = formatDate(addYears(now, 2));
    byId('stillCurrent').textContent = `✓ Aktualität bestätigt · ${date}`;
    byId('lastCheckedText').textContent = `zuletzt bestätigt am ${date}`;
    byId('freshnessStatus').textContent = 'Aktuell';
    byId('freshnessSummary').textContent = `Bestätigt am ${date} · nächste Abfrage: ${next}`;
  });

  byId('requestHelp')?.addEventListener('click', e => {
    const b=e.currentTarget; b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  });

  byId('requestUpdate')?.addEventListener('click', () => {
    const name = byId('changeReporter')?.value.trim();
    const status = byId('updateRequestStatus');
    if (!name) {
      status.textContent = 'Bitte geben Sie Ihren Vor- und Nachnamen an, damit die Änderungsmeldung nachvollziehbar zugeordnet werden kann.';
      status.classList.remove('hidden');
      byId('changeReporter')?.focus();
      return;
    }
    const checked = [...document.querySelectorAll('#changePanel .portal-checks input:checked')].map(i => i.parentElement.textContent.trim());
    if (!checked.length) {
      status.textContent = 'Bitte wählen Sie mindestens eine Änderung aus.';
      status.classList.remove('hidden');
      return;
    }
    const date = formatDate(new Date());
    status.innerHTML = `<strong>Anfrage registriert · ${date}</strong><br>Vielen Dank, ${name}. Ihre Aktualisierungsanfrage für „Musterobjekt · Verwaltung“ wurde erfasst. Im späteren Live-Portal erhalten Sie jetzt automatisch eine Bestätigung per E-Mail. Wir prüfen die Angaben und melden uns, falls noch Informationen oder Unterlagen fehlen.`;
    byId('freshnessStatus').textContent = 'Prüfung angefragt';
    byId('freshnessSummary').textContent = `Aktualisierungsanfrage vom ${date}`;
  });
})();

// V32 – echter PDF-/Bild-Grundriss-Editor (Browser-Prototyp, ohne Backend)
(() => {
  const q=id=>document.getElementById(id), modal=q('surveyModal'), wrap=q('surveyCanvas'), marks=q('surveyMarks'), pdfCanvas=q('surveyPdfCanvas'), img=q('surveyImage');
  if(!modal||!wrap||!marks) return;
  if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let selected={symbolImg:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAIAAAD2HxkiAAAACXBIWXMAAC4jAAAuIwF4pT92AAAJxElEQVR42u3dfUyc9QHA8ety0YIYIcitrJLgXAZUK7PjsIuAoeBq1qUDNNpps7Wds2ntljRAsjSNa0jXmLTGLGv1H7W+VKNuFuzE2a3FSGuGMvvmWqzNHI463GnTLUHoHyTsj2e5XA7KgB6g8Pn8dW/xynP5+rz8fs/zzBkaGgoB0+crFgGIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECIgQRAiIEEQIiBBECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECF90YYsgVQb7+8++vn8G/4H5dbV+5ckwZ2hoyFJIib6enpbo4hn8B6785GO/ss1RECEgQhAhIEIQIZAqxgm/EGo6OzLy8uJPZ/xoB9aEYE0466VFIsveODA3O3vEd+dmZ5c9ujN4/NmRo+8//oQlNoOZMZMyY9+GHL3AEe2ZN3/a/0AzZmyOzhC5FeV1RzrHVSAiJJUFLnl+z5ywvQBEOB2KGxuqXnphXAUO9veffnL3yzfeZOnNYP6XPHUFLqzfGH86NDjYds/K3vZDoWHjE0F7HfWN3c0tlps1ISnbCr1YgSP61587rrmt2nITISlTuPb++OML58699t3bRynw03c6v3ZrxWT/k/Jra7IWFPlpRDhbfPU7i+MFtlZWnz/VdbFP9vX0XHnd16fgyE1OtOQbK+/104hwVshaUBROT48XOBCLxd9Ki0SKGxviwxWD/f2DfZ8HT6+OlhTe95PJ+1ddnpl53Yq7/ToinBWuKigIHvxl84PxArMWFC3d13LHiaML6zcGiQa7gplFhcHjjLy8kq1NKz48U9zYMIEvTYtEVnx4pqazo/K5Z9MikeEfyCwqCqen59fW+IFEOBvlVpR/74+v55RG/++uYDg9fWH9xsrnnh3vVwzEYh31jRl5efOrlvyg463hK9VwxhWhUOiGn//MzyHCWSQYcshaUDR8vH70XcH5VUviU0nH9XV9PT1BySVbm5buaxlpfVjo8IwIZ51bdu1Mii1xV/Bi8utqJ7CL+HZ9Y/xxTml0xJJvfXq3H0WEM38FuGfe/GAGdm5FeXyvLy5xV3AUVy8a97yZ3vZDF86dSyw5vhM40PtJfOdzAqtZRPhldc3tS5NeGfuo4NXRkgl845mnnkl8WrK1KXjw+dmziXFO7PAPIvzyuTwzc+y7gkkmduLFB08/k/QfCXo7uXNX4usL6zfqUISzzlh2BRPFRzLGZSAW+3fX+4mvFK1bGwqFzp/q+vSdzqQOyx7dOeJ4BiKcmca4K3jpel77Q1LM0W1bQ6HQ6d1PJX0yv652aes+P40IZ4WpmSAa+Edra9IrwVyZ7uaWpJUh08KpTNPj9O6n9i8f62yVskd3Xsodkc6f6urr6Uk8Wyqcnl7c2HB8+479y2vuPHnCaf7WhEy6v7/0u6RXgj3DUCjUWlk92N9vEYmQyZV0jDRYGQaj/wOx2Jur1iQOJyJCUiY4ABOU1r23OendwrU/DR70th9qrazWoQhJvfm3Vcc7fHdLU9JmZ0ZeXnwq3EAs1lpZnTSYgQhJgYI1q4NR+IFY7Ni2h5Le/faWB+MTuAdisVcrqxKnmyJCLlUwQTQ+G+b9x5947+FHEj8wJxyu+u2LiQP0o1x3AxEybvHh+GA2TCgUOr59x+F1DyRul87Nzl72xgETZUTIpOhubon3ll9XG5xS2N3c8sriWxJ3/+ZmZ9cd6TR3dLoYrJ8eJVubvrXpF2P88KUMpv/thRcL1qwOHueURu88eSK4zs2rlVW5FeWRm2+eV16WdcP14fT0onVrL8vK7Ny02a8zxdwQJmXGckOYS5z7MoHbwqRFInecOJr4ymB//7FtD03gTk9uCGNzlIkYPkIYXO2iprPDhS1EyBQ5vH7D8AHAjLy8ZW0Hlu5rmdQLKyJC/ufg3T8ccYJoTmm0ZGvTvWc/WrqvpbixwbpRhEziRumbq9YMDQ6OfGAgHM4pjS6s37is7UBNZ4fFNcUcHZ2BshYUXb/hgeDxyZ27gqvu97Yf+uuvf5N4XxpESOoVNzZce9ediacO5tfV9vX0HNv2UHdzy/HtO2Jvv+0upTZHmSxpkchlWZlX5OYmvZ6Rl1f22K5gxkxv+6G9i6LBRYERIanf8evctHnvomj33ubhu3/BjJm0SGQgFmuJLh5+ZhMiJGUpHl6/oe2elcPPD8wpjcaniR5ev+HgXStcY0aETJaLnacbTNfOrSgPPrN/eU3rkuoR15yIkBSsEi/W4ZLn98Svh3/+VNfh9Rv2Loq+9/AjHx9s+88HZyy6KeYo2Qzv8K11Dww/HDonHC57bNc1t1UfXr8h/snj23dYYtaETMp2ads9K0fc2syvq13x4Rn3CRUh09lhOD297LFdNZ0dxY0NzusVIZPe4cWuL5qRl7ewfuMdJ45+/42DUhQhqZRbUR7f2uxtP/TK4ls+fadzxFXi0ODgxwfb3v3lloFYzHKbYg7MzGQXPvus6qUXClavar/v/oFYbCAW27+8Ji0S+eaPf3Tltfnxj53904HgVt6IkBQ7f6praHAwpzRad6Tzo32/f3dLU5CiA6E2R5k6/3yzPRQKzQmH8+tqg72+UY7B5NfWuNyTNSEpduxX2+ZXLYk/zSwqzCwqjJ/QdOHcuXBaWuLtR/t6eqwnrQlJ8RZp0gV/E83Nzp7YDYARIeNwfPuOUTpEhOhQhOgQETJlHb58402nn9zt1rxfKI6Ozi7B2fedmzbn19YUrF6Vljsv8d3hl8ZgCrgMfsqM5TL4WQuKrioomPBXTO+8FpfBtyacCc6f6gouQAj2CUGEgAhBhIAIYbo5Opq6RZme7qJJTIBxQrA5CiIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBEQIIgRECCIERAgiBBFaBCBCECEgQhAhIEIQISBCECEgQhAhIEIQISBCECEgQhAhIEIQISBCECEgQhAhIEIQISBCECEgQhAhIEIQISBCECEgQhAhIEIQISBCECEgQhAhIEIQISBCECEgQvhS+C+9ZhVvpm6H3AAAAABJRU5ErkJggg==',label:'Feuerlöscher'}, entries=[], active=null, pdfDoc=null, pdfPage=null, scale=1.25, planName='', imageBase={w:0,h:0};
  const ids={Feuerlöscher:'FL',Handfeuermelder:'HM',Wandhydrant:'WH','Erste Hilfe':'EH',Notruftelefon:'NT',Notausgang:'NA',Krankentrage:'KT','Sonstiges / Rückfrage':'SO'};
  const nextId=label=>`${ids[label]||'E'}-${String(entries.filter(e=>e.label===label).length+1).padStart(2,'0')}`;
  const count=()=>{q('surveyCount').textContent=`${entries.length} ${entries.length===1?'Eintragung':'Eintragungen'}`;q('surveySelected').textContent=` · ausgewählt: ${selected.label}`};
  const setStatus=html=>{q('surveyStatus').innerHTML=html;q('surveyStatus').classList.remove('hidden')};
  const renderMarks=()=>{marks.innerHTML='';entries.forEach((e,i)=>{const b=document.createElement('button');b.className='survey-mark'+(e.photoName?' has-photo':'');b.type='button';b.style.left=e.x+'%';b.style.top=e.y+'%';if(e.symbolImg){const si=document.createElement('img');si.src=e.symbolImg;si.alt=e.label;b.appendChild(si)}else{b.textContent=e.symbol||'?'}b.title=`${e.id} · ${e.label}`;let moved=false,dragDX=0,dragDY=0;b.addEventListener('pointerdown',ev=>{ev.stopPropagation();b.setPointerCapture(ev.pointerId);moved=false;const r=wrap.getBoundingClientRect();const currentX=r.left+(e.x/100)*r.width,currentY=r.top+(e.y/100)*r.height;dragDX=ev.clientX-currentX;dragDY=ev.clientY-currentY;const move=mv=>{if(Math.abs(mv.clientX-ev.clientX)>2||Math.abs(mv.clientY-ev.clientY)>2)moved=true;const rr=wrap.getBoundingClientRect();e.x=Math.max(0,Math.min(100,(mv.clientX-dragDX-rr.left)/rr.width*100));e.y=Math.max(0,Math.min(100,(mv.clientY-dragDY-rr.top)/rr.height*100));b.style.left=e.x+'%';b.style.top=e.y+'%'};const up=()=>{b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',up);if(!moved)openEditor(i)};b.addEventListener('pointermove',move);b.addEventListener('pointerup',up)});marks.appendChild(b)});count()};
  const openEditor=i=>{active=i;const e=entries[i];q('markEditor').classList.remove('hidden');q('markEditorTitle').textContent=e.label;q('markEditorId').textContent=e.id;q('markNote').value=e.note||'';q('markPhotoStatus').textContent=e.photoName?`Foto: ${e.photoName}`:'Noch kein Foto';q('markEditor').scrollIntoView({behavior:'smooth',block:'nearest'})};
  const closeEditor=()=>{active=null;q('markEditor').classList.add('hidden');q('markPhoto').value=''};
  async function renderPdf(){if(!pdfPage)return;const viewport=pdfPage.getViewport({scale});pdfCanvas.width=viewport.width;pdfCanvas.height=viewport.height;pdfCanvas.style.width=viewport.width+'px';pdfCanvas.style.height=viewport.height+'px';wrap.style.width=viewport.width+'px';wrap.style.height=viewport.height+'px';await pdfPage.render({canvasContext:pdfCanvas.getContext('2d'),viewport}).promise;q('surveyZoomLabel').textContent=Math.round(scale/1.25*100)+'%';renderMarks()}
  async function loadPdfBytes(bytes,name){if(!window.pdfjsLib){setStatus('PDF-Anzeige konnte nicht geladen werden. Bitte Internetverbindung prüfen.');return}pdfDoc=await pdfjsLib.getDocument({data:bytes}).promise;pdfPage=await pdfDoc.getPage(1);planName=name;pdfCanvas.classList.remove('hidden');img.classList.add('hidden');q('surveyEmpty').classList.add('hidden');q('surveyFileName').textContent=`${name} · Seite 1 von ${pdfDoc.numPages}`;entries=[];closeEditor();await renderPdf()}
  async function loadFile(f){planName=f.name;const isPdf=f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf');if(isPdf){await loadPdfBytes(await f.arrayBuffer(),f.name)}else{pdfDoc=pdfPage=null;const url=URL.createObjectURL(f);img.onload=()=>{imageBase={w:img.naturalWidth,h:img.naturalHeight};scale=1;img.style.width=imageBase.w+'px';img.style.height='auto';wrap.style.width=imageBase.w+'px';wrap.style.height=img.naturalHeight+'px';URL.revokeObjectURL(url)};img.src=url;img.classList.remove('hidden');pdfCanvas.classList.add('hidden');q('surveyEmpty').classList.add('hidden');q('surveyFileName').textContent=f.name;entries=[];closeEditor();renderMarks()}}
  q('openSurveyTool')?.addEventListener('click',()=>{modal.classList.remove('hidden');document.body.style.overflow='hidden'});q('closeSurveyTool')?.addEventListener('click',()=>{modal.classList.add('hidden');document.body.style.overflow=''});q('chooseSurveyPlan')?.addEventListener('click',()=>q('surveyPlan').click());q('surveyPlan')?.addEventListener('change',e=>e.target.files?.[0]&&loadFile(e.target.files[0]).catch(err=>setStatus('PDF konnte nicht geöffnet werden: '+err.message)));
  q('loadExamplePlan')?.addEventListener('click',async()=>{try{const r=await fetch('Beispiel-FuR.pdf');await loadPdfBytes(await r.arrayBuffer(),'Beispiel FuR.pdf')}catch(e){setStatus('Die Beispiel-PDF konnte hier nicht automatisch geladen werden. Bitte über „Grundriss laden“ auswählen.')}});
  document.querySelectorAll('.symbol-palette button[data-label]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.symbol-palette button').forEach(x=>x.classList.remove('active'));b.classList.add('active');selected={symbol:b.dataset.symbol||'',symbolImg:b.dataset.symbolImg||'',label:b.dataset.label};count()}));document.querySelector('.symbol-palette button[data-label]')?.classList.add('active');
  wrap.addEventListener('click',e=>{if(e.target.closest('.survey-mark')||(!pdfPage&&img.classList.contains('hidden')))return;const r=wrap.getBoundingClientRect();const ent={id:nextId(selected.label),...selected,x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100,note:'',photoName:''};entries.push(ent);renderMarks();openEditor(entries.length-1)});
  q('markDone')?.addEventListener('click',()=>{if(active===null)return;entries[active].note=q('markNote').value.trim();renderMarks();closeEditor()});q('markDelete')?.addEventListener('click',()=>{if(active===null)return;entries.splice(active,1);renderMarks();closeEditor()});q('markPhoto')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f&&active!==null){entries[active].photoName=f.name;q('markPhotoStatus').textContent=`Foto: ${f.name}`;renderMarks()}});
  q('surveyZoomIn')?.addEventListener('click',()=>{if(pdfPage){scale=Math.min(3,scale+.25);renderPdf()}else if(!img.classList.contains('hidden')){scale=Math.min(2.5,scale+.2);img.style.width=imageBase.w*scale+'px';wrap.style.width=imageBase.w*scale+'px';wrap.style.height=img.naturalHeight*scale+'px';q('surveyZoomLabel').textContent=Math.round(scale*100)+'%'}});q('surveyZoomOut')?.addEventListener('click',()=>{if(pdfPage){scale=Math.max(.5,scale-.25);renderPdf()}else if(!img.classList.contains('hidden')){scale=Math.max(.4,scale-.2);img.style.width=imageBase.w*scale+'px';wrap.style.width=imageBase.w*scale+'px';wrap.style.height=img.naturalHeight*scale+'px';q('surveyZoomLabel').textContent=Math.round(scale*100)+'%'}});
  q('surveySave')?.addEventListener('click',()=>{const data={planName,type:q('surveyType').value,floor:q('surveyFloor').value,reporter:q('surveyReporter').value,entries:entries.map(({photoName,...e})=>({...e,photoName}))};localStorage.setItem('mbp-survey-v33',JSON.stringify(data));setStatus('<strong>Zwischenstand lokal gespeichert.</strong> Die Markierungen bleiben auf diesem Gerät im Browser gespeichert. Fotos selbst werden im Prototyp noch nicht dauerhaft gespeichert.')});
  q('surveyExport')?.addEventListener('click',()=>{const data={version:33,created:new Date().toISOString(),planName,type:q('surveyType').value,floor:q('surveyFloor').value,reporter:q('surveyReporter').value,entries};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='bestandsaufnahme-'+(q('surveyFloor').value||'geschoss').toLowerCase().replace(/[^a-z0-9]+/gi,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  q('surveySubmit')?.addEventListener('click',()=>{const name=q('surveyReporter').value.trim();if(!name)return setStatus('Bitte geben Sie an, wer die Bestandsaufnahme durchgeführt hat.');if(!planName)return setStatus('Bitte laden Sie zuerst einen Grundriss hoch.');if(!entries.length)return setStatus('Bitte tragen Sie mindestens eine Einrichtung oder einen Hinweis im Grundriss ein.');const withoutPhoto=entries.filter(e=>!e.photoName).length,d=new Intl.DateTimeFormat('de-DE').format(new Date());setStatus(`<strong>Bestandsaufnahme testweise registriert · ${d}</strong><br>${entries.length} Eintragungen von ${name}; ${entries.length-withoutPhoto} mit Foto, ${withoutPhoto} ohne Foto. Im Live-Portal würde jetzt der Vorgang an Mein Brandschutzportal übermittelt und die Eingangsbestätigung versendet.`)});
  count();
})();
