// chat.js - Gestione interfaccia chat meeting
// Storage keys
const CHAT_INDEX_KEY = 'aiChatIndex'; // array metadata
const CHAT_PREFIX = 'aiChat:'; // dettaglio
const MAX_CHATS = 100;
const TRANSCRIPT_TRUNCATE_LIMIT = 200000; // chars

// Utilities
const qs = sel => document.querySelector(sel);
const $ = id => document.getElementById(id);
function nowISO(){ return new Date().toISOString(); }
function uuid(){ return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

// Elements (inizializzati dopo DOMContentLoaded)
let sidebarEl, chatListEl, toggleSidebarBtn, btnNewChat, bannerContainer, chatTitleEl, modelTagEl, messagesEl, inputMessage, btnSend, statusLeft, statusRight, modalNewChat, meetingSelect, chatNameInput, cancelNewChatBtn, createNewChatBtn;
// Extra modali (rinomina / elimina)
let modalRenameChat, renameChatInput, cancelRenameChatBtn, applyRenameChatBtn;
let modalDeleteChat, cancelDeleteChatBtn, confirmDeleteChatBtn;
let __pendingRenameChatId = null;
let __pendingDeleteChatId = null;
function captureElements(){
  sidebarEl = $('#sidebar');
  chatListEl = $('#chatList');
  toggleSidebarBtn = $('#toggleSidebar');
  btnNewChat = $('#btnNewChat');
  bannerContainer = $('#bannerContainer');
  chatTitleEl = $('#chatTitle');
  modelTagEl = $('#modelTag');
  messagesEl = $('#messages');
  inputMessage = $('#inputMessage');
  btnSend = $('#btnSend');
  statusLeft = $('#statusLeft');
  statusRight = $('#statusRight');
  modalNewChat = $('#modalNewChat');
  meetingSelect = $('#meetingSelect');
  chatNameInput = $('#chatName');
  cancelNewChatBtn = $('#cancelNewChat');
  createNewChatBtn = $('#createNewChat');
  // modali extra
  modalRenameChat = $('#modalRenameChat');
  renameChatInput = $('#renameChatInput');
  cancelRenameChatBtn = $('#cancelRenameChat');
  applyRenameChatBtn = $('#applyRenameChat');
  modalDeleteChat = $('#modalDeleteChat');
  cancelDeleteChatBtn = $('#cancelDeleteChat');
  confirmDeleteChatBtn = $('#confirmDeleteChat');
}

let activeChatId = null;
let llmClient = null;
let providersCache = null; // loaded providers

// ---- Storage Layer ----
function loadIndex(){ try { return JSON.parse(localStorage.getItem(CHAT_INDEX_KEY)||'[]'); } catch { return []; } }
function saveIndex(list){ localStorage.setItem(CHAT_INDEX_KEY, JSON.stringify(list)); }
function loadChat(id){ try { return JSON.parse(localStorage.getItem(CHAT_PREFIX+id)||'null'); } catch { return null; } }
function saveChat(chat){ localStorage.setItem(CHAT_PREFIX+chat.id, JSON.stringify(chat)); }
function pruneChats(){ let idx = loadIndex(); if(idx.length <= MAX_CHATS) return; idx.sort((a,b)=> new Date(b.lastActivityAt)-new Date(a.lastActivityAt)); const keep = idx.slice(0,MAX_CHATS); const toDelete = idx.slice(MAX_CHATS); toDelete.forEach(m => localStorage.removeItem(CHAT_PREFIX+m.id)); saveIndex(keep); }

// ---- Providers ----
function loadProviders(){ if(providersCache) return providersCache; try { providersCache = JSON.parse(localStorage.getItem('aiProviders')||'[]'); } catch { providersCache=[]; } return providersCache; }
function loadDefaultProvider(){ const defaultId = localStorage.getItem('aiDefaultProviderId'); const list = loadProviders(); if(defaultId){ const p = list.find(x=>x.id===defaultId); if(p) return p; } return list[list.length-1] || null; }

// ---- Meetings (chrome.storage.local) ----
function getMeetings(){ return new Promise(resolve => { chrome.storage.local.get(['meetings'], res => { resolve(res.meetings||[]); }); }); }

// ---- UI Helpers ----
function clearChildren(el){ if(!el) return; while(el.firstChild) el.removeChild(el.firstChild); }
function showBanner(msg, type='info'){ const cont = bannerContainer || document.getElementById('bannerContainer'); if(!cont){ console.warn('[chat] bannerContainer non trovato'); return; } const div = document.createElement('div'); div.className = 'banner'+(type==='warn'?' warn':type==='error'?' error':''); div.textContent = msg; cont.appendChild(div); setTimeout(()=>{ div.remove(); }, 4000); }
function setStatus(left='', right=''){
  if(!statusLeft) statusLeft = document.getElementById('statusLeft');
  if(!statusRight) statusRight = document.getElementById('statusRight');
  if(!statusLeft || !statusRight){
    if(!(window.__chat_missing_status_logged)){
      console.warn('[chat] status elements non trovati, skip setStatus');
      window.__chat_missing_status_logged = true;
    }
    return;
  }
  statusLeft.textContent = left;
  statusRight.textContent = right;
}
function scrollToBottom(){ if(!messagesEl){ messagesEl=document.getElementById('messages'); } if(!messagesEl){ console.warn('[chat] messagesEl mancante (scroll)'); return; } try { messagesEl.scrollTop = messagesEl.scrollHeight; } catch(_){} }

function renderSidebar(){
  let target = chatListEl || document.getElementById('chatList');
  if(!target){ console.warn('[chat] chatList element non trovato, skip renderSidebar'); return; }
  const idx = loadIndex().sort((a,b)=> new Date(b.lastActivityAt)-new Date(a.lastActivityAt));
  clearChildren(target);
  if(!idx.length){ const empty = document.createElement('div'); empty.className='empty-state'; empty.textContent='Nessuna chat.'; target.appendChild(empty); return; }
  idx.forEach(meta => { const item = document.createElement('div'); item.className='chat-item'+(meta.id===activeChatId?' active':'');
  const title = document.createElement('div'); title.className='chat-item-title truncate'; title.textContent=meta.title || meta.meetingTitleOriginal || 'Chat';
  const metaLine = document.createElement('div'); metaLine.className='chat-item-meta';
  const dateSpan = document.createElement('span'); dateSpan.className='chat-date'; dateSpan.textContent=new Date(meta.createdAt).toLocaleDateString();
  const actions = document.createElement('div'); actions.className='chat-actions-inline';
  const bRen=document.createElement('button'); bRen.className='icon-btn'; bRen.title='Rinomina'; bRen.textContent='✏️'; bRen.onclick=(e)=>{ e.stopPropagation(); openRenameChat(meta.id); };
  const bDel=document.createElement('button'); bDel.className='icon-btn danger'; bDel.title='Elimina'; bDel.textContent='🗑️'; bDel.onclick=(e)=>{ e.stopPropagation(); openDeleteChat(meta.id); };
  actions.appendChild(bRen); actions.appendChild(bDel);
  metaLine.appendChild(dateSpan); metaLine.appendChild(actions);
  item.appendChild(title); item.appendChild(metaLine); item.onclick=()=>{ openChat(meta.id); };
    target.appendChild(item); });
}

function renderMessages(chat){ if(!messagesEl){ messagesEl=document.getElementById('messages'); } if(!messagesEl){ console.warn('[chat] messagesEl mancante (renderMessages)'); return; } clearChildren(messagesEl); chat.messages.forEach(m => { if(m.role==='system') return; const row = document.createElement('div'); row.className='msg '+(m.role==='assistant'?'assistant':'user'); const avatar = document.createElement('div'); avatar.className='avatar'; avatar.textContent = m.role==='assistant'?'AI':'TU'; const bubble = document.createElement('div'); bubble.className='bubble'; bubble.textContent = m.content; row.appendChild(avatar); row.appendChild(bubble); messagesEl.appendChild(row); }); scrollToBottom(); }

function updateTopBar(chat){
  const titleEl = chatTitleEl || document.getElementById('chatTitle');
  const modelEl = modelTagEl || document.getElementById('modelTag');
  if(titleEl){ titleEl.textContent = chat.title || chat.meetingTitleOriginal || 'Chat'; }
  else { console.warn('[chat] chatTitle element non trovato'); }
  if(modelEl){ modelEl.textContent = chat.model || ''; }
  else { console.warn('[chat] modelTag element non trovato'); }
}

function persistMeta(chat){ let idx = loadIndex(); const existing = idx.find(i=>i.id===chat.id); const meta = { id:chat.id, meetingId:chat.meetingId||'', title:chat.title||'', meetingTitleOriginal:chat.meetingTitleOriginal||'', createdAt:chat.createdAt, lastActivityAt:chat.lastActivityAt, provider:chat.provider, model:chat.model }; if(existing){ Object.assign(existing, meta); } else { idx.push(meta); } saveIndex(idx); pruneChats(); }

// (Funzioni legacy renameChat/deleteChat rimosse: ora si usano i modali custom)

// ---- Modali Rinomina / Elimina ----
function openRenameChat(chatId){
  if(!modalRenameChat) modalRenameChat = document.getElementById('modalRenameChat');
  if(!renameChatInput) renameChatInput = document.getElementById('renameChatInput');
  if(!modalRenameChat){ console.warn('[chat] modalRenameChat non trovato'); return; }
  const chat = loadChat(chatId);
  if(!chat){ showBanner('Chat non trovata','error'); return; }
  __pendingRenameChatId = chatId;
  if(renameChatInput){ renameChatInput.value = chat.title || chat.meetingTitleOriginal || ''; setTimeout(()=>{ try{ renameChatInput.focus(); renameChatInput.select(); }catch(_){} },30); }
  modalRenameChat.classList.remove('hidden');
}
function applyRenameChat(){
  if(!__pendingRenameChatId) { closeRenameChat(); return; }
  const chat = loadChat(__pendingRenameChatId);
  if(!chat){ showBanner('Chat non trovata','error'); closeRenameChat(); return; }
  if(!renameChatInput) renameChatInput = document.getElementById('renameChatInput');
  const newTitle = (renameChatInput && renameChatInput.value.trim()) || '';
  if(newTitle){ chat.title = newTitle; saveChat(chat); persistMeta(chat); if(chat.id===activeChatId){ updateTopBar(chat); } renderSidebar(); }
  closeRenameChat();
}
function closeRenameChat(){
  if(modalRenameChat || (modalRenameChat = document.getElementById('modalRenameChat'))){ modalRenameChat.classList.add('hidden'); }
  __pendingRenameChatId = null;
}

function openDeleteChat(chatId){
  if(!modalDeleteChat) modalDeleteChat = document.getElementById('modalDeleteChat');
  if(!modalDeleteChat){ console.warn('[chat] modalDeleteChat non trovato'); return; }
  const chat = loadChat(chatId);
  if(!chat){ showBanner('Chat non trovata','error'); return; }
  __pendingDeleteChatId = chatId;
  modalDeleteChat.classList.remove('hidden');
}
function confirmDeleteChat(){
  if(!__pendingDeleteChatId){ closeDeleteChat(); return; }
  const id = __pendingDeleteChatId;
  const chatKey = CHAT_PREFIX + id;
  // Rimuovi dalla lista indice
  let idx = loadIndex();
  idx = idx.filter(m=> m.id !== id);
  saveIndex(idx);
  // Rimuovi record persistenza
  try { localStorage.removeItem(chatKey); } catch(_){ }
  // Se era attiva, reset UI
  if(activeChatId === id){
    activeChatId = null;
    if(messagesEl){ clearChildren(messagesEl); }
    if(chatTitleEl) chatTitleEl.textContent = '—';
    if(modelTagEl) modelTagEl.textContent = '';
    if(inputMessage){ inputMessage.disabled = true; }
    if(btnSend){ btnSend.disabled = true; }
  }
  renderSidebar();
  closeDeleteChat();
  showBanner('Chat eliminata','info');
}
function closeDeleteChat(){
  if(modalDeleteChat || (modalDeleteChat = document.getElementById('modalDeleteChat'))){ modalDeleteChat.classList.add('hidden'); }
  __pendingDeleteChatId = null;
}

function bindExtraModalListeners(){
  // Rinomina
  if(!applyRenameChatBtn) applyRenameChatBtn = document.getElementById('applyRenameChat');
  if(!cancelRenameChatBtn) cancelRenameChatBtn = document.getElementById('cancelRenameChat');
  if(applyRenameChatBtn && !applyRenameChatBtn.__bound){ applyRenameChatBtn.addEventListener('click', applyRenameChat); applyRenameChatBtn.__bound = true; }
  if(cancelRenameChatBtn && !cancelRenameChatBtn.__bound){ cancelRenameChatBtn.addEventListener('click', closeRenameChat); cancelRenameChatBtn.__bound = true; }
  // Elimina
  if(!confirmDeleteChatBtn) confirmDeleteChatBtn = document.getElementById('confirmDeleteChat');
  if(!cancelDeleteChatBtn) cancelDeleteChatBtn = document.getElementById('cancelDeleteChat');
  if(confirmDeleteChatBtn && !confirmDeleteChatBtn.__bound){ confirmDeleteChatBtn.addEventListener('click', confirmDeleteChat); confirmDeleteChatBtn.__bound = true; }
  if(cancelDeleteChatBtn && !cancelDeleteChatBtn.__bound){ cancelDeleteChatBtn.addEventListener('click', closeDeleteChat); cancelDeleteChatBtn.__bound = true; }
  // ESC chiude eventuale modale aperto
  if(!window.__chat_escape_bound){
    window.addEventListener('keydown', e=>{
      if(e.key==='Escape'){
        if(modalRenameChat && !modalRenameChat.classList.contains('hidden')) closeRenameChat();
        else if(modalDeleteChat && !modalDeleteChat.classList.contains('hidden')) closeDeleteChat();
        else if(modalNewChat && !modalNewChat.classList.contains('hidden')) closeNewChatModal();
      }
    });
    window.__chat_escape_bound = true;
  }
}

async function openChat(id){ const chat = loadChat(id); if(!chat){ showBanner('Chat non trovata','error'); return; } activeChatId = id; persistMeta(chat); renderSidebar(); updateTopBar(chat); await ensureLLM(chat); renderMessages(chat); if(inputMessage){ try{ inputMessage.focus(); } catch(_){} } }

// ---- LLM ----
function getSystemPromptFromChat(chat){ const sys = chat.messages.find(m=>m.role==='system'); return sys? sys.content : undefined; }
async function ensureLLM(chat){ const providerRec = loadProviders().find(p=>p.provider===chat.provider && (!chat.providerId || p.id===chat.providerId)) || loadDefaultProvider(); if(!providerRec){ showBanner('Nessun provider configurato. Vai alle impostazioni AI.','warn'); return; }
  if(!window.LLM){ showBanner('LLM non disponibile','error'); return; }
  if(!llmClient || llmClient.provider!==providerRec.provider || llmClient.apiKey!==providerRec.apiKey || llmClient.model!==chat.model){
    llmClient = new window.LLM(providerRec.provider, providerRec.apiKey, { model: chat.model, systemPrompt: getSystemPromptFromChat(chat) });
    llmClient.history = llmClient.history || [];
    chat.messages.forEach(m=>{ if(m.role!=='system'){ llmClient.history.push({ role:m.role, content:m.content }); } });
  }
}

async function sendMessage(){ if(!activeChatId) return; const inp = inputMessage || document.getElementById('inputMessage'); if(!inp){ console.warn('[chat] inputMessage non trovato'); return; } const txt = inp.value.trim(); if(!txt) return; const chat = loadChat(activeChatId); if(!chat) return; inp.value=''; appendMessage(chat,'user',txt); renderMessages(chat); setStatus('Invio...'); await ensureLLM(chat); if(!llmClient){ setStatus('Errore provider'); return; }
  try { const reply = await llmClient.chat(txt); appendMessage(chat,'assistant',reply); saveChat(chat); persistMeta(chat); renderMessages(chat); setStatus('', ''); } catch(e){ appendMessage(chat,'assistant','[Errore] '+(e.message||e)); saveChat(chat); renderMessages(chat); setStatus('Errore'); }
}

function appendMessage(chat, role, content){ chat.messages.push({ role, content, ts: nowISO() }); chat.lastActivityAt = nowISO(); saveChat(chat); }

// ---- Chat Creation ----
function buildSystemPrompt(meeting, transcriptStr, truncated){ 
  return `Meeting Assistant | Title: ${meeting.meetingTitle || 'Untitled'} | Start: ${meeting.meetingStartTimestamp} | End: ${meeting.meetingEndTimestamp}
${truncated ? '[TRANSCRIPT TRUNCATED]\n' : ''}
Guidelines:
• Always reply in the same language as the query.  
• Provide a clear **summary** including: Objectives, Key Decisions, Action Points, and Risks.  
• List **action items** with assignees (who is responsible).  
• Be concise first; expand with details, context, and background only if asked.  
• When referencing the transcript, use **precise citations** (e.g., quote or paraphrase exact sentences).  
• Maintain a professional, conversational style that highlights clarity and readability.  

<transcript>
${transcriptStr}
</transcript>`; 
}
function flattenTranscript(meeting){ if(Array.isArray(meeting.transcript)){ return meeting.transcript.map(b=> `${b.personName} (${b.timestamp})\n${b.transcriptText}\n`).join('\n'); } else if(typeof meeting.transcript === 'string'){ return meeting.transcript; } return ''; }
function createChatFromMeeting(meeting, title){ const provider = loadDefaultProvider(); if(!provider){ showBanner('Configura almeno un provider AI.','warn'); }
  const transcriptFull = flattenTranscript(meeting) || ''; let truncated=false; let transcriptStr = transcriptFull; if(transcriptStr.length>TRANSCRIPT_TRUNCATE_LIMIT){ transcriptStr = transcriptStr.slice(0,TRANSCRIPT_TRUNCATE_LIMIT-20)+"\n...[TRONCATO]..."; truncated=true; }
  const systemPrompt = buildSystemPrompt(meeting, transcriptStr, truncated);
  const chat = { id: uuid(), meetingId: meeting.meetingStartTimestamp || '', title: title || (meeting.meetingTitle||'Chat Meeting'), meetingTitleOriginal: meeting.meetingTitle||'', provider: provider? provider.provider : 'openai', providerId: provider? provider.id: '', model: provider? provider.model: 'gpt-4.1-mini', createdAt: nowISO(), lastActivityAt: nowISO(), messages: [ { role:'system', content: systemPrompt, ts: nowISO() } ] };
  saveChat(chat); persistMeta(chat); return chat.id; }

// Modal
function openNewChatModal(){ const modal = modalNewChat || document.getElementById('modalNewChat'); if(!modal){ console.warn('[chat] modalNewChat non trovato'); return; } modal.classList.remove('hidden'); bindModalListeners(); loadMeetingsIntoSelect(); }
function closeNewChatModal(){ const modal = modalNewChat || document.getElementById('modalNewChat'); if(!modal) return; modal.classList.add('hidden'); }
async function loadMeetingsIntoSelect(){ const meetings = await getMeetings(); meetingSelect.innerHTML=''; if(!meetings.length){ const opt=document.createElement('option'); opt.value=''; opt.textContent='Nessuna trascrizione disponibile'; meetingSelect.appendChild(opt); meetingSelect.disabled=true; createNewChatBtn.disabled=true; return; } meetingSelect.disabled=false; createNewChatBtn.disabled=false; meetings.slice().reverse().forEach((m,i)=>{ const opt=document.createElement('option'); opt.value=String(i); const title = m.meetingTitle || 'Senza titolo'; const date = new Date(m.meetingStartTimestamp).toLocaleString(); opt.textContent = `${title} — ${date}`; meetingSelect.appendChild(opt); }); setTimeout(()=>{ const selMeeting = meetings[meetings.length-1]; chatNameInput.value = selMeeting.meetingTitle || 'Nuova Chat'; },0); }
function bindModalListeners(){
  // Recupera sempre gli elementi aggiornati (il modal potrebbe essere stato montato dopo)
  meetingSelect = meetingSelect || document.getElementById('meetingSelect');
  chatNameInput = chatNameInput || document.getElementById('chatName');
  createNewChatBtn = createNewChatBtn || document.getElementById('createNewChat');
  cancelNewChatBtn = cancelNewChatBtn || document.getElementById('cancelNewChat');
  if(createNewChatBtn && !createNewChatBtn.__bound){
    createNewChatBtn.addEventListener('click', async ()=>{ try { const meetings = await getMeetings(); const idx = parseInt(meetingSelect.value,10); if(isNaN(idx) || !meetings[idx]) return; const chosen = meetings[idx]; const title = (chatNameInput && chatNameInput.value.trim()) || chosen.meetingTitle || 'Chat Meeting'; const newId = createChatFromMeeting(chosen, title); closeNewChatModal(); openChat(newId); renderSidebar(); } catch(e){ showBanner('Errore creazione chat','error'); console.error(e); } });
    createNewChatBtn.__bound = true;
  }
  if(cancelNewChatBtn && !cancelNewChatBtn.__bound){
    cancelNewChatBtn.addEventListener('click', ()=> closeNewChatModal());
    cancelNewChatBtn.__bound = true;
  }
}

// Sidebar toggle
function restoreSidebarState(){ const el = sidebarEl || document.getElementById('sidebar'); const collapsed = localStorage.getItem('aiSidebarCollapsed')==='1'; if(collapsed && el) el.classList.add('collapsed'); }
function toggleSidebar(){ const el = sidebarEl || document.getElementById('sidebar'); if(!el){ console.warn('[chat] sidebarEl non trovato (toggle)'); return; } el.classList.toggle('collapsed'); localStorage.setItem('aiSidebarCollapsed', el.classList.contains('collapsed')?'1':'0'); }
// Global listeners will be bound in bindGlobalListeners() during init for robustness

function bindGlobalListeners(){
  if(window.__chat_global_bound) return; // avoid double binding
  window.__chat_global_bound = true;
  const tBtn = document.getElementById('toggleSidebar');
  if(tBtn){ tBtn.addEventListener('click', toggleSidebar); }
  const newBtn = document.getElementById('btnNewChat');
  if(newBtn){ newBtn.addEventListener('click', openNewChatModal); }
  const sendBtn = document.getElementById('btnSend');
  if(sendBtn){ sendBtn.addEventListener('click', sendMessage); }
  const msgInput = document.getElementById('inputMessage');
  if(msgInput){ msgInput.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }); }
}

function getQuery(){ const p = new URLSearchParams(location.search); return { chatId: p.get('chatId'), meetingId: p.get('meetingId') }; }
function injectExtraCss(){
  if(document.getElementById('chat-extra-css')) return;
  const style=document.createElement('style');
  style.id='chat-extra-css';
  style.textContent=`
  .chat-item-meta{display:flex;align-items:center;justify-content:space-between;font-size:.65rem;opacity:.8;margin-top:2px;}
  .chat-actions-inline{display:flex;gap:4px;}
  .icon-btn{background:transparent;border:0;color:var(--c-fg-secondary,#8aa0aa);cursor:pointer;padding:2px;font-size:.7rem;line-height:1;border-radius:4px;}
  .icon-btn:hover{background:rgba(255,255,255,0.08);color:#fff;}
  .icon-btn.danger:hover{color:#ff6b6b;}
  `;
  document.head.appendChild(style);
}
async function init(){
  console.debug('[chat] init start');
  captureElements();
  injectExtraCss();
  restoreSidebarState();
  bindGlobalListeners();
  bindModalListeners();
  if(typeof bindExtraModalListeners==='function') bindExtraModalListeners();
  const q = getQuery();
  renderSidebar();
  if(q.chatId){
    await openChat(q.chatId);
  } else if(q.meetingId){
    const meetings = await getMeetings();
    const meeting = meetings.find(m=> m.meetingStartTimestamp === q.meetingId);
    if(meeting){
      const newId = createChatFromMeeting(meeting);
      await openChat(newId);
    } else {
      showBanner('Meeting non trovato per meetingId','error');
    }
  } else {
  showBanner('Apri o crea una chat.','info');
  }
  if(!activeChatId && inputMessage && btnSend){
    inputMessage.disabled=true; btnSend.disabled=true;
  }
  if(!loadDefaultProvider() && inputMessage && btnSend){
    inputMessage.disabled = true; btnSend.disabled = true; showBanner('Configura un provider in Impostazioni AI.','warn');
  }
  console.debug('[chat] init done');
}

document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && activeChatId){ renderSidebar(); }});
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
