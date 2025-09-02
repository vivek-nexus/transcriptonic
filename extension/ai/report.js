// report.js (fullscreen UX) - stati: config -> loading -> report
const DEFAULT_SECTIONS = ['Riassunto','Obiettivi','Decisioni','Azioni','Rischi','Analisi Partecipanti','Temi Ricorrenti'];

// Views
const viewConfig = document.getElementById('viewConfig');
const viewLoading = document.getElementById('viewLoading');
const viewReport = document.getElementById('viewReport');

// Config elements
const sectionsGrid = document.getElementById('sectionsGrid');
const customInput = document.getElementById('customSection');
const addCustomBtn = document.getElementById('addCustom');
const btnGenerate = document.getElementById('btnGenerate');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnClear = document.getElementById('btnClear');
const statusEl = document.getElementById('status');
const meetingSubtitleEl = document.getElementById('meetingSubtitle');

// Report elements
const reportTitleEl = document.getElementById('reportTitle');
const blocksEl = document.getElementById('blocks');
const btnOpenChat = document.getElementById('btnOpenChat');
const btnPrint = document.getElementById('btnPrint');
const btnRegenera = document.getElementById('btnRegenera');
const reportErrorEl = document.getElementById('reportError');
const loadingTextEl = document.getElementById('loadingText');

let meeting = null; // meeting record
let llmClient = null; // LLM instance
let lastRequestedSections = []; // per rigenera
let selectedSet = new Set();

function qsParam(name){ return new URLSearchParams(location.search).get(name); }
function setStatus(msg, type='info'){ if(!statusEl) return; statusEl.textContent = msg; statusEl.style.color = type==='error'? '#ff6b6b': (type==='warn'? '#ffcc66': '#c0c0c0'); }
function loadProviders(){ try { return JSON.parse(localStorage.getItem('aiProviders')||'[]'); } catch { return []; } }
function loadDefaultProvider(){ const defaultId = localStorage.getItem('aiDefaultProviderId'); const list = loadProviders(); if(defaultId){ const p=list.find(x=>x.id===defaultId); if(p) return p; } return list[list.length-1]||null; }

function addSectionCard(label){
  const key = label.trim();
  if(!key || Array.from(sectionsGrid.querySelectorAll('.check-card span')).some(s=> s.textContent===key)) return;
  const card = document.createElement('div');
  card.className='check-card';
  card.setAttribute('data-label', key);
  card.innerHTML = `<input type="checkbox"/><span>${key}</span>`;
  card.addEventListener('click', (e)=>{
    e.preventDefault();
    const active = card.classList.toggle('active');
    if(active) selectedSet.add(key); else selectedSet.delete(key);
  });
  sectionsGrid.appendChild(card);
}
function renderDefaultCards(){ DEFAULT_SECTIONS.forEach(addSectionCard); }
function collectSelectedSections(){ return Array.from(selectedSet); }

function truncateTranscript(str, max=60000){
  if(str.length<=max) return { txt:str, truncated:false };
  return { txt: str.slice(0,max-20)+"\n...[TRONCATO]...", truncated:true };
}

function transcriptToString(mt){
  if(Array.isArray(mt.transcript)){
    return mt.transcript.map(b=> `${b.personName} (${b.timestamp})\n${b.transcriptText}\n`).join('\n');
  }
  return typeof mt.transcript==='string'? mt.transcript : '';
}

function buildPrompt(sections, transcript, meta){
  const schema = {
    meetingTitle: 'string',
    generatedAt: 'ISO datetime string',
    sections: sections.map(s=> ({ name:s, content:'string (detailed but concise paragraphs, bullet lists where natural)' }))
  };
  return `Sei un assistente che analizza una riunione.
Devi restituire *SOLO* JSON valido (nessun testo extra) che aderisce allo schema seguente.
Se una sezione non ha contenuto utile, usa una breve frase placeholder.
Lingua: usa la lingua del titolo meeting o del contenuto.
Schema:
${JSON.stringify(schema, null, 2)}

Metadati:
Titolo: ${meta.meetingTitle||'Senza titolo'}
Start: ${meta.meetingStartTimestamp}
End: ${meta.meetingEndTimestamp}
Sezioni richieste: ${sections.join(', ')}
${transcript.truncated?'[TRASCRIZIONE TRONCATA]\n':''}
Trascrizione:
"""
${transcript.txt}
"""
Restituisci solo JSON puro.`;
}

function ensureLLM(){
  if(llmClient) return llmClient;
  const p = loadDefaultProvider();
  if(!p) throw new Error('Nessun provider configurato');
  llmClient = new window.LLM(p.provider, p.apiKey, { model: p.model });
  return llmClient;
}

function sanitizeJson(raw){
  if(!raw) return raw;
  // Remove markdown fences ```json ... ```
  raw = raw.replace(/```(json)?/gi,'');
  // Trim
  raw = raw.trim();
  // Try to extract first { ... } block
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if(first!==-1 && last!==-1 && last>first){ raw = raw.slice(first, last+1); }
  return raw;
}

function safeParseJson(raw){
  try{ return JSON.parse(raw); } catch(e){ return null; }
}

function renderReport(data){
  blocksEl.innerHTML=''; reportErrorEl.innerHTML='';
  if(!data || !Array.isArray(data.sections)){ reportErrorEl.innerHTML = '<div class="error-box">JSON non valido o formato inatteso.</div>'; return; }
  data.sections.forEach(sec=>{
    const div = document.createElement('div');
    div.className='block';
    const title = sec.name || 'Sezione';
    const content = (sec.content||'').trim() || '(Nessun contenuto)';
    const safe = content.replace(/[<>]/g, c=> ({'<':'&lt;','>':'&gt;'}[c]));
    div.innerHTML = `<h2>${title}</h2><div class="body">${safe}</div>`;
    blocksEl.appendChild(div);
  });
}

function showView(name){
  [viewConfig, viewLoading, viewReport].forEach(v=> v && v.classList.remove('active','report-active'));
  if(name==='config') viewConfig.classList.add('active');
  else if(name==='loading') viewLoading.classList.add('active');
  else if(name==='report') { viewReport.classList.add('active','report-active'); }
}

async function generate(sections){
  if(!meeting){ setStatus('Meeting non trovato','error'); return; }
  if(!sections.length){ setStatus('Nessuna sezione selezionata','warn'); return; }
  showView('loading');
  loadingTextEl.textContent = 'Generazione in corso...';
  try {
    const trStr = transcriptToString(meeting);
    const truncated = truncateTranscript(trStr);
    const prompt = buildPrompt(sections, truncated, meeting);
    const llm = ensureLLM();
    const raw = await llm.chat(prompt);
    const sanitized = sanitizeJson(raw);
    let parsed = safeParseJson(sanitized);
    if(!parsed) parsed = safeParseJson(sanitizeJson(sanitized));
    if(!parsed) throw new Error('Parsing JSON fallito');
    parsed.generatedAt = new Date().toISOString();
    reportTitleEl.textContent = meeting.meetingTitle || 'Report';
    renderReport(parsed);
    lastRequestedSections = sections;
    showView('report');
  } catch(e){
    console.error(e);
    showView('report');
    reportErrorEl.innerHTML = `<div class='error-box'>Errore generazione: ${(e.message||e)}</div>`;
  }
}

function bind(){
  addCustomBtn?.addEventListener('click', ()=>{ const v=(customInput.value||'').trim(); if(!v) return; addSectionCard(v); customInput.value=''; customInput.focus(); });
  customInput?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addCustomBtn.click(); }});
  btnSelectAll?.addEventListener('click', (e)=>{ e.preventDefault(); sectionsGrid.querySelectorAll('.check-card').forEach(c=>{ c.classList.add('active'); selectedSet.add(c.getAttribute('data-label')); }); });
  btnClear?.addEventListener('click', (e)=>{ e.preventDefault(); selectedSet.clear(); sectionsGrid.querySelectorAll('.check-card').forEach(c=> c.classList.remove('active')); setStatus(''); });
  btnGenerate?.addEventListener('click', ()=> generate(collectSelectedSections()));
  btnOpenChat?.addEventListener('click', ()=>{ if(!meeting) return; const url = chrome.runtime.getURL(`ai/chat.html?meetingId=${encodeURIComponent(meeting.meetingStartTimestamp)}`); chrome.tabs.create({ url }); });
  btnPrint?.addEventListener('click', ()=> window.print());
  btnRegenera?.addEventListener('click', ()=>{ // Torna a config
    showView('config');
    reportErrorEl.innerHTML=''; blocksEl.innerHTML='';
    // Manteniamo selezioni precedenti (già nel set). Se si vuole pulire, decommentare riga seguente.
    // selectedSet.clear(); sectionsGrid.querySelectorAll('.check-card').forEach(c=> c.classList.remove('active'));
  });
}

function loadMeeting(meetingId){
  return new Promise((resolve)=>{
    chrome.storage.local.get(['meetings'], res=>{
      const list = res.meetings||[];
      const mt = list.find(m=> m.meetingStartTimestamp === meetingId);
      resolve(mt||null);
    });
  });
}

async function init(){
  renderDefaultCards();
  bind();
  showView('config');
  const meetingId = qsParam('meetingId');
  if(!meetingId){ setStatus('meetingId mancante','error'); return; }
  meeting = await loadMeeting(meetingId);
  if(!meeting){ setStatus('Meeting non trovato','error'); return; }
  meetingSubtitleEl.textContent = (meeting.meetingTitle? `Riunione: ${meeting.meetingTitle}. `: '') + 'Seleziona contenuti utili per il tuo report.';
  setStatus('Pronto.');
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
