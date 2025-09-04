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
function loadEndAction() {
  // Prefer value from chrome.storage.local if present, fallback to localStorage for backward compat
  // This function becomes async-like via callback in initEndAction, so here we just return localStorage immediate default.
  return localStorage.getItem(LS_KEYS.endAction) || 'none';
}
function saveEndAction(v) {
  localStorage.setItem(LS_KEYS.endAction, v);
  try { chrome.storage.local.set({ [LS_KEYS.endAction]: v }); } catch(_) {}
}

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
    providerHelpEl.innerHTML = `<a href="${links.key}" target="_blank" rel="noopener">Ottieni API Key</a> • ` +
      `<a href="${links.models}" target="_blank" rel="noopener">Modelli disponibili</a>`;
  } else providerHelpEl.textContent='';
  // suggestions
  modelSuggestionsEl.innerHTML = '';
  (SUGGESTED_MODELS[prov]||[]).forEach(m => {
    const span = document.createElement('span');
    span.className = 'suggestion-pill';
    span.textContent = m;
    span.onclick = () => { modelInput.value = m; };
    modelSuggestionsEl.appendChild(span);
  });
  if(!modelInput.value) modelInput.placeholder = prov==='google' ? 'es. gemini-2.5-flash' : 'es. gpt-4o-mini';
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
  statusBox.className = 'status ' + type;
}

function renderProviders() {
  providersCards.innerHTML='';
  
  // Gestione expander: aperto se non ci sono provider
  const expander = document.getElementById('newProviderExpander');
  const expanderContent = document.getElementById('newProviderContent');
  const expanderIcon = expander.querySelector('.expander-icon');
  
  if (!providers.length) { 
    emptyProviders.style.display='block';
    // Apri automaticamente l'expander se non ci sono provider
    expanderContent.classList.add('expanded');
    expanderIcon.classList.add('expanded');
    return; 
  }
  
  emptyProviders.style.display='none';
  // Chiudi l'expander se ci sono provider configurati
  expanderContent.classList.remove('expanded');
  expanderIcon.classList.remove('expanded');
  
  providers.forEach(p => {
    const card = document.createElement('div');
    card.className='card';

    const header = document.createElement('div');
    header.className='card-header';
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = p.provider + (p.model? ' • ' + p.model : '');
    header.appendChild(title);

    const defaultWrap = document.createElement('label');
    defaultWrap.className='default-row';
    defaultWrap.style.fontSize = '12px';
    defaultWrap.style.color = '#5f6368';
    const r = document.createElement('input');
    r.type='radio'; r.name='defaultProvider'; r.value=p.id; r.checked = p.id === defaultProviderId;
    r.onchange = () => { defaultProviderId=p.id; saveDefaultProviderId(p.id); };
    defaultWrap.appendChild(r);
    const span = document.createElement('span'); 
    span.textContent='Predefinito';
    span.style.marginLeft = '8px';
    defaultWrap.appendChild(span);
    header.appendChild(defaultWrap);

    const body = document.createElement('div');
    body.style.fontSize = '12px';
    body.style.color = '#5f6368';
    body.style.marginBottom = '12px';
    //body.innerHTML = `Creato: ${new Date(p.createdAt).toLocaleDateString()}${p.lastTestAt?' • Ultimo test: '+ new Date(p.lastTestAt).toLocaleTimeString():''}`;

    if (p.lastTestOk === false) {
      const ko = document.createElement('div');
      ko.innerHTML = '<span class="badge" style="background: #fce8e6; color: #ea4335;">Errore</span>';
      ko.style.marginBottom = '12px';
      body.appendChild(ko);
    }

    const actions = document.createElement('div');
    actions.className='card-actions';
    const btnRetest = document.createElement('button'); 
    btnRetest.className='btn btn-secondary';
    btnRetest.style.fontSize = '12px';
    btnRetest.style.padding = '6px 12px';
    btnRetest.textContent='Riprova'; 
    btnRetest.onclick=()=>retestProvider(p);
    const btnDelete = document.createElement('button'); 
    btnDelete.className='btn btn-danger';
    btnDelete.style.fontSize = '12px';
    btnDelete.style.padding = '6px 12px';
    btnDelete.textContent='Elimina'; 
    btnDelete.onclick=()=>deleteProvider(p.id);
    actions.appendChild(btnRetest); 
    actions.appendChild(btnDelete);

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
    renderProviders(); // Questo chiuderà automaticamente l'expander visto che ora abbiamo provider
    setStatus('Provider verificato e salvato con successo!','success');
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
  // Migrate chrome.storage.local -> localStorage (one-way) if local copy missing
  try {
    chrome.storage.local.get([LS_KEYS.endAction], res => {
      const stored = res[LS_KEYS.endAction];
      if (stored && !localStorage.getItem(LS_KEYS.endAction)) {
        localStorage.setItem(LS_KEYS.endAction, stored);
      }
      // Now proceed with UI init using (possibly migrated) value
      const val = loadEndAction();
      const radios = endActionGroup.querySelectorAll('input[type=radio][name=endAction]');
      let has=false;
      radios.forEach(r=>{ if(r.value===val){ r.checked=true; has=true; }
        r.addEventListener('change',()=>{ if(r.checked) saveEndAction(r.value); });
      });
      if(!has){ const def=endActionGroup.querySelector('input[value=none]'); if(def) def.checked=true; saveEndAction('none'); }
      // Ensure mirror is saved at least once
      saveEndAction(val);
    });
  } catch(_) {
    // Fallback to legacy behavior
    const val = loadEndAction();
    const radios = endActionGroup.querySelectorAll('input[type=radio][name=endAction]');
    let has=false;
    radios.forEach(r=>{ if(r.value===val){ r.checked=true; has=true; }
      r.addEventListener('change',()=>{ if(r.checked) saveEndAction(r.value); });
    });
    if(!has){ const def=endActionGroup.querySelector('input[value=none]'); if(def) def.checked=true; saveEndAction('none'); }
  }
}

if(testSaveBtn) testSaveBtn.addEventListener('click', e=>{ e.preventDefault(); handleTestSave(); });
if(resetFormBtn) resetFormBtn.addEventListener('click', e=>{ e.preventDefault(); resetForm(); });
if(providerSel) providerSel.addEventListener('change', updateProviderUI);

// Gestione expander
function toggleExpander(expanderId) {
  const expander = document.getElementById(expanderId);
  const content = expander.querySelector('.expander-content');
  const icon = expander.querySelector('.expander-icon');
  
  const isExpanded = content.classList.contains('expanded');
  
  if (isExpanded) {
    content.classList.remove('expanded');
    icon.classList.remove('expanded');
  } else {
    content.classList.add('expanded');
    icon.classList.add('expanded');
  }
}

// Event listener per l'expander
const expanderHeader = document.getElementById('expanderHeader');
if (expanderHeader) {
  expanderHeader.addEventListener('click', () => toggleExpander('newProviderExpander'));
}

renderProviders();
initEndAction();
updateProviderUI();
setStatus('');
