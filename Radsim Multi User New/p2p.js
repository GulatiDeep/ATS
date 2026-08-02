'use strict';
let appRole = null;
let peer = null;
let p2pConnections = {};
let p2pConn = null;
let heartbeatInterval = null, timeoutCheckInterval = null, p2pStatusInterval = null;
let lastPingTime = Date.now();
let connectedTrainees = {};
let reconnectTimeout = null, reconnectAttempt = 0;
let traineeLineState = { active: null, bearing: null };
let instructorName = '', traineeName = '', traineeTargetId = '';
let lastSimRunningState = null;
let appLaunched = false;


function iBroadcast(msg) {
  Object.values(p2pConnections).forEach(c => { if (c?.open) try { c.send(msg); } catch(e){} });
}
function iConnCount() {
  return Object.values(p2pConnections).filter(c => c?.open).length;
}
function shortId() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:3}, () => ch[Math.random()*ch.length|0]).join('');
}

function selectRole(role) {
  appRole = role;
  hideOverlays();
  // SRE setup div is 'sre-setup'; instructor uses 'instructor-setup'
  const setupId = role === 'trainee' ? 'sre-setup' : `${role}-setup`;
  $(setupId)?.classList.remove('hidden');
  initPeer(role);
}
function goBackToRoleSelect() {
  Object.values(p2pConnections).forEach(c => { try { c.close(); } catch(e){} });
  p2pConnections = {}; connectedTrainees = {};
  if (peer) { try { peer.destroy(); } catch(e){} peer = null; }
  p2pConn = null; appRole = null;
  hideOverlays();
  $('role-overlay').classList.remove('hidden');
}
function hideOverlays() {
  ['role-overlay','instructor-setup','sre-setup'].forEach(id => $(id).classList.add('hidden'));
}

function initPeer(role) {
  peer = new Peer(shortId());
  peer.on('open', id => { if (role === 'instructor') $('instructor-my-id').textContent = id; });
  peer.on('error', () => {
    if (role === 'trainee') {
      const e = $('trainee-error');
      e.textContent = 'Connection failed — check the ID and try again.';
      e.classList.remove('hidden');
      $('trainee-connecting').classList.add('hidden');
    }
  });
  if (role === 'instructor') {
    peer.on('connection', conn => { p2pConnections[conn.peer] = conn; setupInstrConn(conn); });
  }
}

function traineeConnect() {
  const tid = $('trainee-id-input').value.trim().toUpperCase();
  const name = $('trainee-name-input').value.trim();
  const err = $('trainee-error');
  err.classList.add('hidden');
  if (!name) { err.textContent = 'Please enter your name.'; err.classList.remove('hidden'); return; }
  if (!tid || tid.length < 2) { err.textContent = 'Please enter a valid 3-character ID.'; err.classList.remove('hidden'); return; }
  traineeName = name; traineeTargetId = tid;
  $('trainee-connecting').classList.remove('hidden');
  if (!peer) initPeer('trainee');
  const go = () => { if (p2pConn?.open) try { p2pConn.close(); } catch(e){} p2pConn = peer.connect(tid); setupTraineeConn(p2pConn); };
  peer.id ? go() : peer.on('open', go);
}

function setupInstrConn(conn) {
  conn.on('open', () => {
    p2pConnections[conn.peer] = conn;
    updateInstrUI();
    sendUserInfoTo(conn); sendTrackTo(conn);
    try { conn.send({ type:'simState', running:isSimulationRunning }); } catch(e){}
    if (aircrafts.length) {
      try { conn.send({ type:'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id||null }); } catch(e){}
    }
    conn.on('data', d => handleInstrData(d, conn));
  });
  const cleanup = () => { delete p2pConnections[conn.peer]; delete connectedTrainees[conn.peer]; updateInstrUI(); };
  conn.on('close', cleanup); conn.on('error', cleanup);
}

function handleInstrData(data, conn) {
  if (data === 'ping') { if (conn?.open) try { conn.send('pong'); } catch(e){} return; }
  if (data === 'pong') return;
  if (data?.type === 'userInfo' && data.traineeName) {
    connectedTrainees[conn.peer] = data.traineeName; updateInstrUI();
  }
}

function updateInstrUI() {
  const count = iConnCount();
  const waiting = $('instructor-waiting'), connected = $('instructor-connected');
  const label = $('instructor-connected-label'), list = $('instructor-trainee-list');
  if (count > 0) {
    waiting?.classList.add('hidden');
    connected && (connected.classList.remove('hidden'), connected.classList.add('flex'));
    if (label) label.textContent = `${count} trainee${count>1?'s':''} connected`;
    if (list) list.textContent = Object.values(connectedTrainees).filter(Boolean).join(' · ');
  } else {
    waiting?.classList.remove('hidden');
    connected && (connected.classList.add('hidden'), connected.classList.remove('flex'));
    if (list) list.textContent = '';
  }
  const badge = $('role-badge');
  if (badge && appRole === 'instructor') badge.textContent = count > 0 ? `INSTR · ${count}` : 'INSTR';
  setP2PState(count > 0 ? 'connected' : 'waiting');
}

function setupTraineeConn(conn) {
  conn.on('open', () => {
    p2pConn = conn;
    reconnectAttempt = 0;
    if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
    if (typeof lastSimRunningState === 'boolean') updateTraineeStatus(lastSimRunningState);
    if (!appLaunched) { hideOverlays(); applyRoleBadge(); launchApp(); }
    lastPingTime = Date.now();
    startHeartbeat('trainee');
    sendUserInfo();
    updateNameDisplay();
    conn.on('data', d => handleP2PData(d));
  });
  conn.on('close', () => onTraineeDisconnect());
  conn.on('error', () => onTraineeDisconnect());
}

function handleP2PData(data) {
  if (data === 'ping') { lastPingTime = Date.now(); if (p2pConn?.open) try { p2pConn.send('pong'); } catch(e){} return; }
  if (data === 'pong') { lastPingTime = Date.now(); return; }
  if (data?.type === 'lineDisplay') { traineeLineState.active = data.activeLineDisplay; traineeLineState.bearing = data.bearing; }
  if (data?.type === 'trackSettings' && data.rwyOrientation != null) settings.rwyOrientation = data.rwyOrientation;
  if (data?.type === 'userInfo') { if (data.instructorName) { instructorName = data.instructorName; updateNameDisplay(); } }
  if (data?.type === 'spawn') {
    try {
      const ac = data.aircraft;
      ac.history = ac.history || [];
      ac.continuousAction = ac.continuousAction || { turn:null, altitude:null, speed:null };
      aircrafts.push(ac);
      if (data.selectedId) selectedAircraft = aircrafts.find(a => a.id === data.selectedId) || selectedAircraft;
      renderTabs();
    } catch(e) {}
  }
  if (data?.type === 'stateSnapshot') {
    try {
      aircrafts = (data.aircrafts||[]).map(a => ({
        id:a.id, squawk:a.squawk||'0000', x_nm:a.x_nm, y_nm:a.y_nm,
        heading:a.heading, assignedHeading:a.assignedHeading,
        speed:a.speed, assignedSpeed:a.assignedSpeed,
        altitude:a.altitude, assignedAltitude:a.assignedAltitude,
        turnRateLimit:a.turnRateLimit||3,
        history:a.history||[], continuousAction:{turn:null,altitude:null,speed:null}, tickCount:a.tickCount||0,
        formationId:a.formationId||null, formationRole:a.formationRole||null,
        formationOffset:a.formationOffset||null, lastCommand:a.lastCommand||null,
        frozen:a.frozen||false, hiddenFromTrainee:false
      }));
      selectedAircraft = data.selectedId ? (aircrafts.find(a => a.id === data.selectedId)||null) : null;
      renderTabs();
    } catch(e) {}
  }
  if (data?.type === 'simState') { isSimulationRunning = !!data.running; updateTraineeStatus(data.running); }
}

function startHeartbeat(role) {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (role === 'instructor') iBroadcast('ping');
    else if (p2pConn?.open) p2pConn.send('ping');
  }, 10000);
  timeoutCheckInterval = setInterval(() => {
    if (role === 'instructor') {
      Object.keys(p2pConnections).forEach(pid => {
        if (!p2pConnections[pid]?.open) { delete p2pConnections[pid]; delete connectedTrainees[pid]; }
      });
      updateInstrUI();
    } else if (p2pConn?.open && Date.now() - lastPingTime > 30000) onTraineeDisconnect();
  }, 2000);
}
function stopHeartbeat() {
  clearInterval(heartbeatInterval); clearInterval(timeoutCheckInterval);
  heartbeatInterval = timeoutCheckInterval = null;
}

function updateTraineeStatus(running) {
  const dot = $('trainee-ex-dot'), label = $('trainee-ex-label'), sub = $('trainee-ex-sub');
  if (!dot) return;
  if (running === 'disconnected') {
    dot.className = 'w-1.5 h-1.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse';
    label.className = 'text-[9px] font-black tracking-widest text-red-400 uppercase leading-none';
    label.textContent = 'EXERCISE DISCONNECTED'; sub.textContent = 'Waiting for reconnection…';
  } else if (running) {
    lastSimRunningState = true;
    dot.className = 'w-1.5 h-1.5 flex-shrink-0 rounded-full bg-emerald-400 animate-pulse';
    label.className = 'text-[9px] font-black tracking-widest text-emerald-300 uppercase leading-none';
    label.textContent = 'EXERCISE IN PROGRESS'; sub.textContent = 'Instructor simulation running';
  } else {
    lastSimRunningState = false;
    dot.className = 'w-1.5 h-1.5 flex-shrink-0 rounded-full bg-amber-400';
    label.className = 'text-[9px] font-black tracking-widest text-amber-400 uppercase leading-none';
    label.textContent = 'EXERCISE PAUSED'; sub.textContent = 'Instructor has stopped the simulation';
  }
}

function onTraineeDisconnect() {
  stopHeartbeat();
  if (p2pConn) { try { p2pConn.close(); } catch(e){} }
  p2pConn = null; lastPingTime = Date.now();
  setP2PState('disconnected'); updateTraineeStatus('disconnected');
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (!traineeTargetId) return;
  if (++reconnectAttempt > RECONNECT_MAX) { setP2PState('disconnected'); return; }
  setP2PState('waiting');
  reconnectTimeout = setTimeout(() => { if (!p2pConn?.open) doReconnect(); }, RECONNECT_DELAY);
}

function doReconnect() {
  if (!traineeTargetId) return;
  if (!peer || peer.destroyed) { initPeer('trainee'); peer.on('open', doConnect); return; }
  doConnect();
}
function doConnect() {
  if (p2pConn) { try { p2pConn.close(); } catch(e){} p2pConn = null; }
  p2pConn = peer.connect(traineeTargetId);
  setupTraineeConn(p2pConn);
  const wd = setTimeout(() => { if (!p2pConn?.open) scheduleReconnect(); }, 8000);
  p2pConn.on('open', () => clearTimeout(wd));
}
function manualReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectAttempt = 0; setP2PState('waiting'); doReconnect();
}

function launchApp() {
  appLaunched = true;
  if (appRole === 'instructor') instructorName = $('instructor-name-input').value.trim() || 'Instructor';
  hideOverlays(); applyRoleBadge(); applyRoleUI(); updateNameDisplay();
  applyStoredSplitSizes(); resizeCanvas();
  initLabelLinesPanel();
  const iconBtn = $('p2p-icon-btn');
  if (iconBtn) { iconBtn.classList.remove('hidden'); iconBtn.classList.add('flex'); }
  setP2PState(appRole === 'instructor' ? (iConnCount()>0?'connected':'waiting') : (p2pConn?.open?'connected':'waiting'));
  if (appRole === 'instructor') {
    startHeartbeat('instructor');
    setInterval(physicsTick, 1000);
    setInterval(broadcastTick, 4000);
  }
  sendUserInfo();
  if (!p2pStatusInterval) p2pStatusInterval = setInterval(() => {
    if (appRole === 'instructor') updateInstrUI();
    else setP2PState(p2pConn?.open ? 'connected' : 'disconnected');
  }, 2000);
}

function setP2PState(state) {
  const btn = $('p2p-icon-btn'), link = $('p2p-link-icon'), spin = $('p2p-spinner-svg'), cross = $('p2p-cross-svg');
  if (!btn) return;
  btn.classList.remove('border-emerald-600/60','border-amber-600/60','border-red-700/60',
                        'bg-emerald-950/60','bg-amber-950/40','bg-slate-900/80','bg-red-950/40','cursor-default','cursor-pointer');
  spin?.classList.add('hidden'); cross?.classList.add('hidden');
  if (state === 'connected') {
    btn.classList.add('border-emerald-600/60','bg-emerald-950/60','cursor-default');
    link?.setAttribute('stroke','#34d399'); btn.style.filter = 'drop-shadow(0 0 4px rgba(52,211,153,.6))';
  } else if (state === 'waiting') {
    btn.classList.add('border-amber-600/60','bg-amber-950/40','cursor-pointer');
    link?.setAttribute('stroke','#94a3b8'); spin?.classList.remove('hidden'); btn.style.filter = 'none';
  } else {
    btn.classList.add('border-red-700/60','bg-red-950/40','cursor-pointer');
    link?.setAttribute('stroke','#64748b'); cross?.classList.remove('hidden'); btn.style.filter = 'none';
  }
  btn.style.pointerEvents = (appRole === 'trainee' && state !== 'connected') ? 'auto' : 'none';
}
function p2pIconClicked() { if (appRole === 'trainee' && !p2pConn?.open) manualReconnect(); }

function applyRoleBadge() {
  const badge = $('role-badge'), title = $('app-header-title');
  if (appRole === 'instructor') {
    badge.textContent = 'INSTR';
    badge.className = 'text-[7px] font-black tracking-widest px-1.5 py-0.5 rounded-full border bg-emerald-950 border-emerald-700/60 text-emerald-400';
    badge.classList.remove('hidden');
    if (title) title.textContent = 'RADAR SIMULATOR';
    document.title = 'Radar Simulator';
  } else {
    badge.textContent = 'TRNEE';
    badge.className = 'text-[7px] font-black tracking-widest px-1.5 py-0.5 rounded-full border bg-sky-950 border-sky-700/60 text-sky-400';
    badge.classList.remove('hidden');
    if (title) title.textContent = 'SRE SIMULATOR';
    document.title = 'SRE Simulator';
  }
}

function applyRoleUI() {
  if (appRole === 'trainee') {
    $('btn-global-freeze')?.classList.add('hidden');
    $('btn-global-hide')?.classList.add('hidden');
    $('spawner-bar')?.classList.add('hidden');
    $('trainee-status-bar')?.classList.remove('hidden');
    $('no-target-msg')?.classList.add('hidden');
    $('target-info')?.classList.add('hidden');
    $('panel-divider')?.classList.add('hidden');
    const aw = $('aircraft-area-wrapper');
    if (aw) { aw.classList.remove('flex-1'); aw.classList.add('flex-shrink-0'); }
    $('settings-runway-section')?.classList.add('hidden');
    updateNameDisplay();
  }
}

function sendUserInfo() {
  if (appRole === 'instructor') {
    iBroadcast({ type:'userInfo', instructorName: instructorName||'Instructor' });
    iBroadcast({ type:'trackSettings', rwyOrientation: settings.rwyOrientation });
  } else if (appRole === 'trainee' && p2pConn?.open) {
    try { p2pConn.send({ type:'userInfo', traineeName: traineeName||'Trainee' }); } catch(e){}
  }
}
function sendUserInfoTo(conn) {
  if (!conn?.open) return;
  try { conn.send({ type:'userInfo', instructorName: instructorName||'Instructor' }); } catch(e){}
}
function sendTrackTo(conn) {
  if (!conn?.open) return;
  try { conn.send({ type:'trackSettings', rwyOrientation: settings.rwyOrientation }); } catch(e){}
}

function updateNameDisplay() {
  const badge = $('user-name-badge'); if (!badge) return;
  const sid = appRole === 'instructor' ? (peer?.id||'---') : (traineeTargetId||'---');
  const name = appRole === 'instructor' ? (instructorName||'Instructor') : (traineeName||'Trainee');
  badge.textContent = `${name} (${sid})`;
  badge.classList.remove('hidden');
}

function broadcastLineState(active, bearing) {
  if (appRole === 'instructor') iBroadcast({ type:'lineDisplay', activeLineDisplay:active, bearing });
}

window.addEventListener('beforeunload', () => {
  stopHeartbeat(); if (reconnectTimeout) clearTimeout(reconnectTimeout);
  Object.values(p2pConnections).forEach(c => { try { c.close(); } catch(e){} });
  if (p2pConn?.open) try { p2pConn.close(); } catch(e){}
  if (peer) try { peer.destroy(); } catch(e){}
});

// ── Auto-role bootstrap (instructor.html / sre.html set window._autoRole) ────
if (window._autoRole) {
  document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    selectRole(window._autoRole);
  });
}
