// ai_setting.js (rev)
// Gestione provider AI, salvataggio localStorage, test modelli e azione fine meeting.

const LS_KEYS = {
  providers: 'aiProviders',            // Array provider salvati
  defaultProviderId: 'aiDefaultProviderId',
  endAction: 'aiEndMeetingAction'      // 'chat' | 'report' | 'none'
};

function loadProviders() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.providers) || '[]'); } catch { return []; }
}
function saveProviders(list) { localStorage.setItem(LS_KEYS.providers, JSON.stringify(list)); }
function loadDefaultProviderId() { return localStorage.getItem(LS_KEYS.defaultProviderId) || ''; }
function saveDefaultProviderId(id) { localStorage.setItem(LS_KEYS.defaultProviderId, id || ''); }
function loadEndAction() { return localStorage.getItem(LS_KEYS.endAction) || 'none'; }
function saveEndAction(v) { localStorage.setItem(LS_KEYS.endAction, v); }

// UI refs
const $ = id => document.getElementById(id);
const providerSel = $('provider');
const modelInput = $('model');
const apiKeyInput = $('apiKey');
const testSaveBtn = $('testSaveBtn');
const resetFormBtn = $('resetForm');
const statusBox = $('status');
const answerBox = $('answerBox');
const providersCards = $('providersCards');
const emptyProviders = $('emptyProviders');
const endActionGroup = $('endActionGroup');
const providerHelpEl = document.getElementById('providerHelp');
const modelSuggestionsEl = document.getElementById('modelSuggestions');

const HELP_LINKS = {
  openai: {
    key: 'https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key',
    models: 'https://platform.openai.com/docs/api-reference/models/list'
  },
  google: {
    key: 'https://ai.google.dev/gemini-api/docs/api-key',
    models: 'https://ai.google.dev/gemini-api/docs/models'
  }
};

const SUGGESTED_MODELS = {
  openai: ['gpt-4.1-mini','gpt-4.1-nano','gpt-4.1'],
  google: ['gemini-2.5-flash','gemini-2.5-pro']
};

function updateProviderUI(){
  const prov = providerSel.value;
  const links = HELP_LINKS[prov];
  if (links) {
    providerHelpEl.innerHTML = `<a href="${links.key}" target="_blank" rel="noopener">API KEY</a>`+
      ` <a href="${links.models}" target="_blank" rel="noopener">MODELLI</a>`;
  } else providerHelpEl.textContent='';
  // suggestions
  modelSuggestionsEl.innerHTML = '';
  (SUGGESTED_MODELS[prov]||[]).forEach(m => {
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = m;
    span.onclick = () => { modelInput.value = m; };
    modelSuggestionsEl.appendChild(span);
  });
  if(!modelInput.value) modelInput.placeholder = prov==='google' ? 'es: gemini-2.5-flash' : 'es: gpt-4.1-mini';
}

let providers = loadProviders().filter(p => ['openai','google'].includes(p.provider)); // purge old unsupported
saveProviders(providers);
let defaultProviderId = loadDefaultProviderId();
if (defaultProviderId && !providers.find(p=>p.id===defaultProviderId)) defaultProviderId='';
// Se non esiste default ma abbiamo provider, assegna il primo (o l'ultimo) disponibile
if (!defaultProviderId && providers.length) {
  defaultProviderId = providers[providers.length-1].id; // scegliamo l'ultimo (più recente)
  saveDefaultProviderId(defaultProviderId);
}

function uuid() { return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function nowISO() { return new Date().toISOString(); }

function setStatus(msg, type='info') {
  statusBox.textContent = msg;
  statusBox.style.color = type === 'error' ? '#ff6b6b' : (type==='success' ? '#4CAF50' : '#C0C0C0');
}

function renderProviders() {
  providersCards.innerHTML='';
  if (!providers.length) { emptyProviders.style.display='block'; return; }
  emptyProviders.style.display='none';
  providers.forEach(p => {
    const card = document.createElement('div');
    card.className='card';

    const header = document.createElement('div');
    header.className='card-header';
    const title = document.createElement('h3');
    title.textContent = p.provider + (p.model? ' • ' + p.model : '');
    header.appendChild(title);

    const defaultWrap = document.createElement('label');
    defaultWrap.className='default-row';
    const r = document.createElement('input');
    r.type='radio'; r.name='defaultProvider'; r.value=p.id; r.checked = p.id === defaultProviderId;
    r.onchange = () => { defaultProviderId=p.id; saveDefaultProviderId(p.id); };
    defaultWrap.appendChild(r);
    const span = document.createElement('span'); span.textContent='Default'; span.style.fontSize='0.65rem'; span.style.letterSpacing='0.5px'; span.style.textTransform='uppercase';
    defaultWrap.appendChild(span);
    header.appendChild(defaultWrap);

    const body = document.createElement('div');
    body.className='card-body';
    body.innerHTML = `<div class="muted" style="font-size:0.65rem;">Creato: ${new Date(p.createdAt).toLocaleString()}${p.lastTestAt?'<br>Test: '+ new Date(p.lastTestAt).toLocaleTimeString():''}</div>`;

    if (p.lastTestOk) {
      const ok = document.createElement('div');
      ok.innerHTML = '<span class="badge">OK</span>';
      body.appendChild(ok);
    } else if (p.lastTestOk === false) {
      const ko = document.createElement('div');
      ko.innerHTML = '<span class="badge" style="background:#ff6b6b;color:#fff;">ERR</span>';
      body.appendChild(ko);
    }

    const actions = document.createElement('div');
    actions.className='card-actions';
    const btnRetest = document.createElement('button'); btnRetest.className='small'; btnRetest.textContent='Riprova'; btnRetest.onclick=()=>retestProvider(p);
    const btnDelete = document.createElement('button'); btnDelete.className='small danger'; btnDelete.textContent='Elimina'; btnDelete.onclick=()=>deleteProvider(p.id);
    actions.appendChild(btnRetest); actions.appendChild(btnDelete);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);

    providersCards.appendChild(card);
  });
}

function deleteProvider(id){
  if(!confirm('Eliminare questo provider?')) return;
  providers = providers.filter(p=>p.id!==id);
  saveProviders(providers);
  if(defaultProviderId===id){
    // Se ci sono ancora provider, scegli l'ultimo rimasto come nuovo default
    if (providers.length) {
      defaultProviderId = providers[providers.length-1].id;
      saveDefaultProviderId(defaultProviderId);
    } else {
      defaultProviderId='';
      saveDefaultProviderId('');
    }
  }
  renderProviders();
}

async function quickTest(provider, apiKey, model){
  const msg = `Rispondi solo con: OK - provider ${provider} modello ${model||'(default)'}`;
  const llm = new window.LLM(provider, apiKey, { model });
  const answer = await llm.chat(msg);
  return answer.trim();
}

async function handleTestSave(){
  setStatus('Verifica in corso...');
  answerBox.style.display='none';
  answerBox.textContent='';
  const provider = providerSel.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  if(!provider || !apiKey){ setStatus('Provider e API key richiesti','error'); return; }
  if(!model){ setStatus('Modello obbligatorio','error'); modelInput.focus(); return; }
  try {
    if(!window.LLM) throw new Error('LLM non caricato');
    const reply = await quickTest(provider, apiKey, model);
    if(!/^OK\b/i.test(reply)) throw new Error('Risposta inattesa: '+reply);
    const entry = { id: uuid(), provider, apiKey, model, createdAt: nowISO(), lastTestAt: nowISO(), lastTestOk: true };
    providers.push(entry); saveProviders(providers); 
    // L'ultimo aggiunto diventa SEMPRE il default
    defaultProviderId = entry.id; saveDefaultProviderId(entry.id);
    renderProviders();
    setStatus('Provider verificato e salvato.','success');
    answerBox.textContent = reply; answerBox.style.display='block';
    resetForm(false);
  } catch(e){
    setStatus('Errore: '+ (e.message||e),'error');
  }
}

async function retestProvider(p){
  setStatus(`Retest ${p.provider}...`);
  try {
    const reply = await quickTest(p.provider, p.apiKey, p.model);
    p.lastTestAt = nowISO();
    p.lastTestOk = /^OK\b/i.test(reply);
    saveProviders(providers);
    renderProviders();
    setStatus(p.lastTestOk? 'Retest OK':'Retest fallito','success');
  } catch(e){
    p.lastTestAt = nowISO(); p.lastTestOk=false; saveProviders(providers); renderProviders();
    setStatus('Errore retest: '+(e.message||e),'error');
  }
}

function resetForm(clearStatus=true){
  providerSel.value='openai';
  modelInput.value='';
  apiKeyInput.value='';
  if(clearStatus) setStatus('');
  answerBox.style.display='none';
  updateProviderUI();
}

function initEndAction(){
  const val = loadEndAction();
  const radios = endActionGroup.querySelectorAll('input[type=radio][name=endAction]');
  let has=false;
  radios.forEach(r=>{ if(r.value===val){ r.checked=true; has=true; }
    r.addEventListener('change',()=>{ if(r.checked) saveEndAction(r.value); });
  });
  if(!has){ const def=endActionGroup.querySelector('input[value=none]'); if(def) def.checked=true; saveEndAction('none'); }
}

if(testSaveBtn) testSaveBtn.addEventListener('click', e=>{ e.preventDefault(); handleTestSave(); });
if(resetFormBtn) resetFormBtn.addEventListener('click', e=>{ e.preventDefault(); resetForm(); });
if(providerSel) providerSel.addEventListener('change', updateProviderUI);

renderProviders();
initEndAction();
updateProviderUI();
setStatus('Pronto.');
