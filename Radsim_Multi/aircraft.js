'use strict';
// Aircraft simulation state
let isSimulationRunning = false;
let aircrafts = [], selectedAircraft = null;
let isSpawnerArmed = false;
let fmnMode = false, fmnSize = 2;
let _pendingSpawnPos = null;
window.onload = () => {
  LABEL_LINE_DEFS.forEach(d => { labelLines[d.key] = d.defaultOn; });
  lucide.createIcons(); applyStoredSplitSizes(); resizeCanvas(); renderTabs(); initPanHandlers(); initLayoutSplitter();
  const nb = $('btn-nav-lock');
  if (nb) { nb.innerHTML = SVG_LOCK; nb.classList.add('border-amber-500/70','text-amber-400'); nb.classList.remove('border-slate-600/50','text-slate-400'); }
  syncZoomSlider();
  const zs = $('zoom-slider'); if (zs) zs.disabled = isNavLocked;
  syncHistoryDotsLabel();
  document.addEventListener('keydown', e => {
    if ($('spawn-dialog') && !$('spawn-dialog').classList.contains('hidden')) {
      if (e.key === 'Enter') { e.preventDefault(); confirmSpawnDialog(); }
      if (e.key === 'Escape') closeSpawnDialog();
    }
  });
  $('spawn-dialog')?.addEventListener('click', e => { if (e.target === $('spawn-dialog')) closeSpawnDialog(); });
  requestAnimationFrame(drawLoop);
};

function openSettings() {
  const sel = $('set-trail-select');
  if (sel) sel.value = String(settings.trailDots);
  const rwy = $('set-rwy-orientation');
  if (rwy) rwy.value = settings.rwyOrientation;
  $('settings-modal').classList.remove('hidden');
  lucide.createIcons({ nameAttr:'data-lucide', rootNode:$('settings-modal') });
}
function closeSettings() { $('settings-modal').classList.add('hidden'); }

function setTrailDots(n) {
  settings.trailDots = n;
  const sel = $('set-trail-select');
  if (sel) sel.value = String(n);
  syncHistoryDotsLabel();
}

function updateRwySetting(val) {
  const n = parseInt(val);
  if (!isNaN(n) && n >= 1 && n <= 360) {
    settings.rwyOrientation = n;
    if (appRole === 'instructor') iBroadcast({ type:'trackSettings', rwyOrientation:n });
  }
}

function toggleSimulation() {
  isSimulationRunning = !isSimulationRunning;
  const btn = $('btn-toggle-sim'), icon = $('sim-btn-icon'), ind = $('status-indicator');
  const label = btn?.querySelector('.desktop-label');
  if (isSimulationRunning) {
    btn.className = 'flex-shrink-0 w-8 h-7 bg-emerald-600 text-slate-950 rounded flex items-center justify-center transition-all';
    icon.setAttribute('data-lucide','square');
    if (label) label.textContent = 'Stop';
    ind.className = 'w-1.5 h-1.5 flex-shrink-0 bg-emerald-500 rounded-full shadow-[0_0_6px_rgba(16,185,129,.9)]';
  } else {
    btn.className = 'flex-shrink-0 w-8 h-7 bg-red-600 text-slate-950 rounded flex items-center justify-center transition-all';
    icon.setAttribute('data-lucide','play');
    if (label) label.textContent = 'Start';
    ind.className = 'w-1.5 h-1.5 flex-shrink-0 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,.8)]';
  }
  lucide.createIcons();
  if (appRole === 'instructor') iBroadcast({ type:'simState', running:isSimulationRunning });
}

function toggleSpawnerArming() {
  if (aircrafts.length >= 20) return;
  if (appRole === 'instructor') { spawnInstructor(); return; }
  isSpawnerArmed = !isSpawnerArmed;
  const btn = $('btn-arm-spawner');
  if (isSpawnerArmed) {
    btn.className = 'flex-shrink-0 w-8 h-7 bg-amber-500 text-slate-950 rounded flex items-center justify-center transition-all animate-pulse';
    btn.querySelector('.desktop-label')?.replaceChildren(document.createTextNode('Tap scope…'));
  } else resetSpawnBtn();
}

function spawnInstructor() {
  if (aircrafts.length >= 20) return;
  isSpawnerArmed = true;
  const btn = $('btn-arm-spawner');
  if (btn) {
    btn.className = 'flex-shrink-0 w-8 h-7 bg-amber-500 text-slate-950 rounded flex items-center justify-center transition-all animate-pulse';
    const lbl = btn.querySelector('.desktop-label');
    if (lbl) lbl.textContent = 'Tap scope…';
    btn.title = 'Click on radar scope to place aircraft';
  }
  const hint = $('spawner-hint-label');
  if (hint) { hint.textContent = ''; hint.innerHTML = '↓ Tap scope to place'; hint.style.color = '#f59e0b'; }
  showToast('Tap on the radar scope to place aircraft');
}

function makeAc(x, y, hdg) {
  return { id:callsign(), squawk:squawk(), x_nm:x, y_nm:y, heading:hdg, assignedHeading:hdg, speed:300, assignedSpeed:300, altitude:15000, assignedAltitude:15000, history:[], turnRateLimit:3, continuousAction:{turn:null,altitude:null,speed:null}, tickCount:0, frozen:false, hiddenFromTrainee:false };
}
function resetSpawnBtn() {
  isSpawnerArmed = false;
  const hint = $('spawner-hint-label');
  if (hint) { hint.style.color = ''; hint.innerHTML = 'Click <b class="text-emerald-500">Create</b> then tap on scope'; }
  const btn = $('btn-arm-spawner'); if (!btn) return;
  const slotsFull = aircrafts.length >= 20;
  if (slotsFull) {
    btn.className='flex-shrink-0 w-8 h-7 bg-slate-700 text-slate-500 rounded flex items-center justify-center transition-all cursor-not-allowed opacity-50';
    btn.querySelector('.desktop-label')?.replaceChildren(document.createTextNode('Max 20'));
    btn.title='Max 20 aircraft';
  } else {
    btn.className = 'flex-shrink-0 w-8 h-7 bg-emerald-600 text-slate-950 rounded flex items-center justify-center transition-all';
    btn.querySelector('.desktop-label')?.replaceChildren(document.createTextNode('Create Aircraft'));
    btn.title = 'Create aircraft';
  }
}

function callsign() {
  const t=['JAG','RAF','MIR','MIG','SU','TEJ','HWK'];
  return `${t[Math.random()*t.length|0]}-${100+Math.random()*900|0}`;
}
function squawk() { return (Math.random()*4096|0).toString(8).padStart(4,'0'); }
function fmtSquawk(sq) {
  if (!sq) return '3-0000';
  const raw = String(sq).startsWith('3-') ? String(sq).slice(2) : String(sq);
  return '3-' + raw.padEnd(4,'0').slice(0,4);
}
function parseSquawkInput(val) {
  const s = (val||'').trim().replace(/^3-/,'');
  return s.padEnd(4,'0').slice(0,4);
}

function clearContinuousAction(ac, cat) {
  if (!ac?.continuousAction) return;
  ac.continuousAction[cat] = null;
  if (ac === selectedAircraft) { updateActionUI(); syncLabels(); }
}

function parseCmdForAircraft(ac, raw, skipFormationPropagation) {
  if (!ac) return null;
  const cmd = raw.trim().toUpperCase().replace(/\s+/g,'');
  if (!cmd) return null;

  const hm = cmd.match(/^H?(\d{3})$/) || cmd.match(/^HDG(\d{3})$/);
  if (hm) {
    const h = parseInt(hm[1]);
    if (h >= 1 && h <= 360) {
      ac.assignedHeading = h;
      clearContinuousAction(ac, 'turn');
      if (!skipFormationPropagation && ac.formationId) propagateToFormation(ac, a => { a.assignedHeading = h; clearContinuousAction(a, 'turn'); });
      return `H${h.toString().padStart(3,'0')}`;
    }
  }
  const am = cmd.match(/^(?:A|F|FL)(\d{2,3})$/);
  if (am) {
    const fl=parseInt(am[1]),alt=fl*100;
    if(alt>=2000&&alt<=40000){
      ac.assignedAltitude=alt; clearContinuousAction(ac,'altitude');
      if (!skipFormationPropagation && ac.formationId) propagateToFormation(ac, a => { a.assignedAltitude = alt; clearContinuousAction(a, 'altitude'); });
      return `A${fl.toString().padStart(3,'0')}`;
    }
  }
  const sm = cmd.match(/^[NS](\d{2,3})$/);
  if (sm) {
    const s=parseInt(sm[1]);
    if(s>=100&&s<=600){
      ac.assignedSpeed=s; clearContinuousAction(ac,'speed');
      if (!skipFormationPropagation && ac.formationId) propagateToFormation(ac, a => { a.assignedSpeed = s; clearContinuousAction(a, 'speed'); });
      return `N${s}`;
    }
  }
  const rm = cmd.match(/^ROT([1-5])$/);
  if (rm) {
    ac.turnRateLimit = parseInt(rm[1]);
    if (!skipFormationPropagation && ac.formationId) propagateToFormation(ac, a => { a.turnRateLimit = parseInt(rm[1]); });
    return `ROT${rm[1]}`;
  }
  return null;
}

function propagateToFormation(triggerAc, fn) {
  aircrafts.forEach(a => { if (a.formationId === triggerAc.formationId && a.id !== triggerAc.id) fn(a); });
}

function splitFormation(formationId) {
  const members = aircrafts.filter(a => a.formationId === formationId);
  members.forEach(ac => { ac.formationId = null; ac.formationRole = null; ac.formationOffset = null; });
  showToast(`✂ Formation split — ${members.length} aircraft now independent`);
  renderTabs();
  if (appRole === 'instructor') iBroadcast({ type:'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id||null });
}

function ejectFromFormation(acId) {
  const ac = aircrafts.find(a => a.id === acId);
  if (!ac || !ac.formationId) return;
  const fid = ac.formationId;
  ac.formationId = null; ac.formationRole = null; ac.formationOffset = null;
  const remaining = aircrafts.filter(a => a.formationId === fid);
  if (remaining.length <= 1) {
    remaining.forEach(a => { a.formationId = null; a.formationRole = null; a.formationOffset = null; });
    showToast(`${acId} ejected · formation dissolved`);
  } else {
    remaining.sort((a,b) => a.formationRole - b.formationRole).forEach((a, i) => {
      a.formationRole = i + 1;
      a.formationOffset = fmnOffset(i + 1);
    });
    showToast(`${acId} ejected from ${fid} · ${remaining.length} remain`);
  }
  if (selectedAircraft?.id === acId) selectedAircraft = aircrafts[0] || null;
  renderTabs(); loadControls();
  if (appRole === 'instructor') iBroadcast({ type:'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id||null });
}

function parseCmd(raw) { return parseCmdForAircraft(selectedAircraft, raw); }

function submitCommand() {
  const inp=$('cmd-input'), lbl=$('last-cmd-label'); if(!inp) return;
  const r = parseCmdForAircraft(selectedAircraft, inp.value);
  if (r) {
    if (selectedAircraft) {
      selectedAircraft.lastCommand = r;
      const isFormationCmd = selectedAircraft?.formationId;
      if(lbl){lbl.textContent = isFormationCmd ? `${r}×FMN` : r; lbl.style.color='#fbbf24';}
    }
    inp.value=''; inp.style.borderColor=''; updateAircraftCards();
  } else { inp.style.borderColor='#ef4444'; setTimeout(()=>{inp.style.borderColor='';},600); }
}

function submitCardCommand(acId, input) {
  const ac = aircrafts.find(a => a.id === acId); if (!ac || !input) return;
  const card = input.closest('.aircraft-card'), lbl = card?.querySelector('[data-card-last]');
  const r = parseCmdForAircraft(ac, input.value);
  if (r) {
    ac.lastCommand = r;
    const isFormationCmd = ac.formationId;
    if (lbl) { lbl.textContent = isFormationCmd ? `${r}×FMN` : r; lbl.style.color = '#fbbf24'; }
    input.value = ''; input.style.borderColor = '';
    updateAircraftCards();
  } else {
    input.style.borderColor = '#ef4444';
    setTimeout(() => { input.style.borderColor = ''; }, 600);
  }
}

function renderTabs() {
  const cont = $('target-tabs-container'); if (!cont) return;
  cont.innerHTML = '';
  if (appRole !== 'trainee') {
    const sb = $('btn-arm-spawner');
    if (sb) { if (aircrafts.length>=20 || !isSpawnerArmed) resetSpawnBtn(); }
  }
  if (aircrafts.length === 0) {
    if (appRole !== 'trainee') { $('no-target-msg')?.classList.remove('hidden'); $('target-info')?.classList.add('hidden'); $('target-actions')?.classList.add('hidden'); }
    cont.innerHTML = `
      <div class="aircraft-empty-card">
        <i data-lucide="radio-tower" class="w-6 h-6 opacity-40"></i>
        <p>No aircraft</p>
        <span>${appRole === 'trainee' ? 'Waiting for instructor traffic' : 'Use Create Aircraft to place a target'}</span>
      </div>`;
    lucide.createIcons({ nameAttr:'data-lucide', rootNode:cont });
    return;
  }
  if (appRole !== 'trainee') { $('no-target-msg')?.classList.add('hidden'); $('target-info')?.classList.remove('hidden'); $('target-actions')?.classList.remove('hidden'); }

  const rendered = new Set();
  const formationIds = [];
  aircrafts.forEach(ac => { if (ac.formationId && !formationIds.includes(ac.formationId)) formationIds.push(ac.formationId); });

  formationIds.forEach(fid => {
    const members = aircrafts.filter(a => a.formationId === fid).sort((a,b) => a.formationRole - b.formationRole);
    members.forEach(ac => rendered.add(ac.id));

    const activeMember = members.find(m => m === selectedAircraft) || members[0];
    const isSel = members.includes(selectedAircraft);

    const card = document.createElement('div');
    card.className = `aircraft-card px-1.5 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-0.5 border flex-shrink-0 cursor-default
      ${isSel ? 'is-selected border-amber-600 shadow-[0_0_8px_rgba(245,158,11,.3)]' : 'border-violet-800/50'}`;
    card.dataset.fmnCard = fid;

    // Main row: ident + brg/rng only
    const mainRow = document.createElement('span');
    mainRow.className = 'aircraft-card-main';
    mainRow.innerHTML = `
      <span class="aircraft-card-ident" style="background:rgba(109,40,217,.85);border-color:rgba(139,92,246,.6)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#ede9fe"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span class="aircraft-card-name" style="color:#ede9fe">${fid}</span>
        <span style="font-size:.52rem;font-weight:900;color:#c4b5fd;background:rgba(139,92,246,.35);border:1px solid rgba(167,139,250,.4);border-radius:999px;padding:.05rem .3rem;flex-shrink:0;letter-spacing:.1em">${members.length}-ACF</span>
      </span>
      <span data-card-field="brg-rng" class="aircraft-card-bearing desktop-label">--- / -- NM</span>`;
    card.appendChild(mainRow);

    // SPLIT ALL button — freeze/hide moved to global panel buttons
    if (appRole !== 'trainee') {
      const sideActions = document.createElement('div');
      sideActions.className = 'aircraft-card-side-actions';
      sideActions.innerHTML = `
        <button type="button" class="fmn-split-btn" data-fmn-split="${fid}" title="Split all into individual aircraft">SPLIT ALL</button>`;
      sideActions.querySelector('[data-fmn-split]')?.addEventListener('click', e => { e.stopPropagation(); splitFormation(fid); });
      card.appendChild(sideActions);
    }

    // Meta row
    const metaRow = document.createElement('span');
    metaRow.className = 'aircraft-card-meta';
    metaRow.setAttribute('aria-hidden', 'true');
    metaRow.innerHTML = `
      <span><b><i data-lucide="hash"></i>SQK</b><em data-card-field="sqk" class="not-italic tabular-nums">----</em></span>
      <span><b><i data-lucide="compass"></i>HDG</b><em data-card-field="hdg" class="not-italic tabular-nums">---</em></span>
      <span><b><i data-lucide="gauge"></i>SPD</b><em data-card-field="spd" class="not-italic tabular-nums">---</em></span>
      <span><b><i data-lucide="mountain"></i>LVL</b><em data-card-field="alt" class="not-italic tabular-nums">---</em></span>`;
    card.appendChild(metaRow);

    // Controls row
    const ctrlRow = document.createElement('span');
    ctrlRow.className = 'aircraft-card-controls';
    ctrlRow.innerHTML = `
      <input type="text" maxlength="6" placeholder="H090·A150·N300" class="aircraft-card-input" data-card-command>
      <span class="aircraft-card-last" data-card-last>${activeMember.lastCommand||'---'}</span>
      <span class="aircraft-card-actions">
        <button type="button" class="aircraft-card-action" title="Turn left" data-card-action="turn-left">
          <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i><span>Left</span>
        </button>
        <button type="button" class="aircraft-card-action stop" title="Stop turn" data-card-action="turn-stop">
          <i data-lucide="circle" class="w-3 h-3"></i><span>Hold</span>
        </button>
        <button type="button" class="aircraft-card-action" title="Turn right" data-card-action="turn-right">
          <span>Right</span><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        </button>
      </span>`;
    const input = ctrlRow.querySelector('[data-card-command]');
    input?.addEventListener('click', e => e.stopPropagation());
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const target = members.find(m => m === selectedAircraft) || members[0];
        submitCardCommand(target.id, input); input.blur();
      }
    });
    ctrlRow.querySelectorAll('[data-card-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!selectedAircraft || !members.includes(selectedAircraft)) selectedAircraft = members[0];
        loadControls();
        const action = btn.dataset.cardAction;
        if (action === 'turn-left') startContinuousAction('turn','left');
        if (action === 'turn-stop') stopContinuousAction('turn');
        if (action === 'turn-right') startContinuousAction('turn','right');
        updateAircraftCards();
      });
    });
    card.appendChild(ctrlRow);

    if (appRole !== 'trainee') {
      card.addEventListener('click', e => {
        if (e.target.closest('.aircraft-card-controls') || e.target.closest('.aircraft-card-side-actions')) return;
        selectedAircraft = members[0]; loadControls();
      });
    }
    cont.appendChild(card);
  });

  // Independent aircraft
  aircrafts.filter(ac => !rendered.has(ac.id)).forEach(ac => {
    const sel = selectedAircraft === ac;
    const card = buildAircraftCard(ac, sel, {});
    cont.appendChild(card);
  });

  updateAircraftCards();
  updateMemberStrip();
  lucide.createIcons({ nameAttr:'data-lucide', rootNode:cont });
}

function buildAircraftCard(ac, sel, opts) {
  const isFormationMember = opts.isFormationMember || false;
  const isLeader = isFormationMember && ac.formationRole === 1;
  const isWingman = isFormationMember && ac.formationRole !== 1;

  if (isWingman) {
    const card = document.createElement('div');
    card.dataset.acId = ac.id;
    card.className = 'aircraft-card px-1.5 py-0.5 text-[10px] font-bold rounded-none border border-t-0 border-violet-900/25 bg-slate-950/60 flex items-center gap-1 flex-shrink-0';
    card.innerHTML = `
      <span style="font-size:.55rem;font-weight:900;color:#7c3aed;background:rgba(139,92,246,.18);border:1px solid rgba(139,92,246,.28);border-radius:.25rem;padding:.06rem .28rem;flex-shrink:0">#${ac.formationRole}</span>
      <span class="text-violet-400 font-black text-[9px] tracking-wide truncate flex-1">${ac.id}</span>
      <span data-card-field="hdg" class="text-violet-500 text-[8px] tabular-nums">---°</span>
      <span class="text-violet-800 text-[7px]">·</span>
      <span data-card-field="brg-rng" class="text-violet-600 text-[8px] tabular-nums whitespace-nowrap">--- NM</span>`;
    return card;
  }

  const selCls = 'bg-amber-500 text-slate-950 border-amber-600 shadow-[0_0_8px_rgba(245,158,11,.3)]';
  const defCls = isLeader ? 'bg-slate-900/80 text-violet-300 border-violet-800/50' : 'bg-slate-900 text-emerald-400 border-emerald-900/50';
  const card = document.createElement('div');
  card.dataset.acId = ac.id;
  const borderRad = isLeader ? 'rounded-none' : 'rounded';
  card.className = `aircraft-card px-1.5 py-1 text-[10px] font-bold ${borderRad} transition-all duration-150 flex items-center gap-0.5 border flex-shrink-0 ${sel?selCls:defCls} ${appRole==='trainee'?'cursor-default':'hover:bg-emerald-950/40'}`;
  card.classList.toggle('is-selected', sel);

  const leaderBadge = isLeader
    ? `<span style="font-size:.55rem;font-weight:900;color:#a78bfa;background:rgba(139,92,246,.25);border:1px solid rgba(139,92,246,.45);border-radius:.25rem;padding:.06rem .28rem;flex-shrink:0;letter-spacing:.06em">LDR</span>`
    : '';

  // Main row: ident + brg only (NO freeze/hide/delete here)
  const mainHTML = `
    <span class="aircraft-card-main">
      <span class="aircraft-card-ident">
        <i data-lucide="${isLeader?'users':'plane'}" class="w-3 h-3 flex-shrink-0"></i>
        <span class="aircraft-card-name truncate">${ac.id}</span>
        ${leaderBadge}
      </span>
      <span data-card-field="brg-rng" class="aircraft-card-bearing desktop-label">--- / -- NM</span>
    </span>`;

  // No per-card side cluster — delete/freeze/hide all in global panel buttons
  const sideHTML = '';

  const metaHTML = `
    <span class="aircraft-card-meta" aria-hidden="true">
      <span><b><i data-lucide="hash"></i>SQK</b><em data-card-field="sqk" class="not-italic tabular-nums">----</em></span>
      <span><b><i data-lucide="compass"></i>HDG</b><em data-card-field="hdg" class="not-italic tabular-nums">---</em></span>
      <span><b><i data-lucide="gauge"></i>SPD</b><em data-card-field="spd" class="not-italic tabular-nums">---</em></span>
      <span><b><i data-lucide="mountain"></i>LVL</b><em data-card-field="alt" class="not-italic tabular-nums">---</em></span>
    </span>`;

  const ctrlHTML = `
    <span class="aircraft-card-controls">
      <input type="text" maxlength="6" placeholder="H090·A150·ROT3" class="aircraft-card-input" data-card-command>
      <span class="aircraft-card-last" data-card-last>${ac.lastCommand||'---'}</span>
      <span class="aircraft-card-actions">
        <button type="button" class="aircraft-card-action" title="Turn left" data-card-action="turn-left">
          <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i><span>Left</span>
        </button>
        <button type="button" class="aircraft-card-action stop" title="Stop turn" data-card-action="turn-stop">
          <i data-lucide="circle" class="w-3 h-3"></i><span>Hold</span>
        </button>
        <button type="button" class="aircraft-card-action" title="Turn right" data-card-action="turn-right">
          <span>Right</span><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        </button>
      </span>
    </span>`;

  card.innerHTML = mainHTML + sideHTML + metaHTML + ctrlHTML;

  const input = card.querySelector('[data-card-command]');
  input?.addEventListener('click', e => e.stopPropagation());
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); submitCardCommand(ac.id, input); input.blur(); }
  });
  // delete/freeze/hide now via global panel buttons
  card.querySelectorAll('[data-card-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedAircraft = ac; loadControls();
      const action = btn.dataset.cardAction;
      if (action === 'turn-left') startContinuousAction('turn','left');
      if (action === 'turn-stop') stopContinuousAction('turn');
      if (action === 'turn-right') startContinuousAction('turn','right');
      updateAircraftCards();
    });
  });
  if (appRole !== 'trainee') card.addEventListener('click', e => {
    if (e.target.closest('.aircraft-card-controls') || e.target.closest('.aircraft-card-side-actions')) return;
    selectedAircraft = ac; loadControls();
  });
  return card;
}

function updateAircraftCards() {
  const cont = $('target-tabs-container'); if (!cont) return;

  // Formation cards
  cont.querySelectorAll('[data-fmn-card]').forEach(card => {
    const fid = card.dataset.fmnCard;
    const members = aircrafts.filter(a => a.formationId === fid).sort((a,b) => a.formationRole - b.formationRole);
    if (!members.length) return;
    const activeMember = members.find(m => m === selectedAircraft) || members[0];
    const isSel = members.includes(selectedAircraft);

    card.classList.toggle('is-selected', isSel);
    card.style.borderColor = isSel ? 'rgba(245,158,11,.85)' : 'rgba(139,92,246,.45)';

    const strip = $('fmn-member-strip');
    if (strip && strip.classList.contains('is-visible') && selectedAircraft?.formationId === fid) {
      members.forEach(ac => {
        const tab = strip.querySelector(`.fmn-subtab[data-ac-id="${ac.id}"]`);
        if (tab) {
          tab.classList.toggle('is-selected', ac === selectedAircraft);
          const hdgEl = tab.querySelector(`[data-tab-hdg="${ac.id}"]`);
          if (hdgEl) hdgEl.textContent = Math.round(ac.heading).toString().padStart(3,'0') + '°';
        }
      });
    }

    const set = (field, val) => { const el = card.querySelector(`[data-card-field="${field}"]`); if (el) el.textContent = val; };
    const b = bearing(activeMember);
    const dist = Math.sqrt(activeMember.x_nm**2 + activeMember.y_nm**2);
    set('sqk', fmtSquawk(activeMember.squawk));
    set('hdg', Math.round(activeMember.heading).toString().padStart(3,'0') + '°');
    set('alt', 'A' + Math.round(activeMember.assignedAltitude/100).toString().padStart(3,'0'));
    set('spd', 'N' + Math.round(activeMember.assignedSpeed));
    set('brg-rng', `${b.toString().padStart(3,'0')}° / ${dist.toFixed(1)} NM`);

    const lbl = card.querySelector('[data-card-last]');
    if (lbl && activeMember.lastCommand) lbl.textContent = activeMember.lastCommand;

    const ca = activeMember.continuousAction || {};
    card.querySelector('[data-card-action="turn-left"]')?.classList.toggle('is-active', ca.turn === 'left');
    card.querySelector('[data-card-action="turn-right"]')?.classList.toggle('is-active', ca.turn === 'right');
    card.querySelector('[data-card-action="turn-stop"]')?.classList.toggle('is-active', !ca.turn);

    // freeze/hide state synced via updateGlobalActionBtns()
    lucide.createIcons({ nameAttr:'data-lucide', rootNode:card });
  });

  // Independent cards
  aircrafts.filter(ac => !ac.formationId).forEach(ac => {
    const card = Array.from(cont.querySelectorAll('.aircraft-card')).find(el => el.dataset.acId === ac.id); if (!card) return;
    const set = (field, value) => { const el = card.querySelector(`[data-card-field="${field}"]`); if (el) el.textContent = value; };
    const b = bearing(ac);
    const dist = Math.sqrt(ac.x_nm**2 + ac.y_nm**2);
    const brgRng = `${b.toString().padStart(3,'0')}° / ${dist.toFixed(1)} NM`;
    set('sqk', fmtSquawk(ac.squawk));
    set('hdg', Math.round(ac.heading).toString().padStart(3,'0') + '°');
    set('alt', 'A' + Math.round(ac.assignedAltitude/100).toString().padStart(3,'0'));
    set('spd', 'N' + Math.round(ac.assignedSpeed));
    set('brg-rng', brgRng);

    const ca = ac.continuousAction || {};
    card.querySelector('[data-card-action="turn-left"]')?.classList.toggle('is-active', ca.turn === 'left');
    card.querySelector('[data-card-action="turn-right"]')?.classList.toggle('is-active', ca.turn === 'right');
    card.querySelector('[data-card-action="turn-stop"]')?.classList.toggle('is-active', !ca.turn);

    // freeze/hide state synced via updateGlobalActionBtns()
    lucide.createIcons({ nameAttr:'data-lucide', rootNode:card });
  });
}

function bearing(ac) {
  let b = 90 - (Math.atan2(ac.y_nm, ac.x_nm) * 180 / Math.PI);
  if (b < 0) b += 360;
  return Math.round(b);
}
function homing(b) { return (b + 180) % 360; }

function snapAircrafts(forTrainee) {
  return aircrafts
    .filter(ac => !forTrainee || !ac.hiddenFromTrainee)
    .map(ac => ({
      id:ac.id, squawk:ac.squawk, x_nm:ac.x_nm, y_nm:ac.y_nm,
      heading:ac.heading, assignedHeading:ac.assignedHeading,
      speed:ac.speed, assignedSpeed:ac.assignedSpeed,
      altitude:ac.altitude, assignedAltitude:ac.assignedAltitude,
      turnRateLimit:ac.turnRateLimit||3, tickCount:ac.tickCount, history:ac.history,
      formationId:ac.formationId||null, formationRole:ac.formationRole||null,
      formationOffset:ac.formationOffset||null, lastCommand:ac.lastCommand||null,
      frozen:ac.frozen||false
    }));
}

function physicsTick() {
  if (!isSimulationRunning) return;
  const leaders = aircrafts.filter(ac => ac.formationId && ac.formationRole === 1);
  const independent = aircrafts.filter(ac => !ac.formationId);
  independent.forEach(ac => moveAircraft(ac));
  leaders.forEach(leader => {
    moveAircraft(leader);
    const wingmen = aircrafts.filter(ac => ac.formationId === leader.formationId && ac.formationRole !== 1);
    wingmen.forEach(wm => {
      wm.assignedHeading = leader.assignedHeading;
      wm.assignedAltitude = leader.assignedAltitude;
      wm.assignedSpeed = leader.assignedSpeed;
      wm.heading = leader.heading;
      wm.altitude = leader.altitude;
      wm.speed = leader.speed;
      wm.tickCount = (wm.tickCount||0) + 1;
      wm.x_nm = leader.x_nm;
      wm.y_nm = leader.y_nm;
    });
  });
  if (selectedAircraft) updateTelemetry();
  updateAircraftCards();
}

function moveAircraft(ac) {
  if (ac.frozen) return;
  const ca = ac.continuousAction || {};
  const tr = ac.turnRateLimit || 3;
  if (ca.turn === 'left') { ac.assignedHeading -= tr; if (ac.assignedHeading <= 0) ac.assignedHeading += 360; }
  if (ca.turn === 'right') { ac.assignedHeading += tr; if (ac.assignedHeading > 360) ac.assignedHeading -= 360; }
  if (ca.altitude === 'up')    ac.assignedAltitude = Math.min(40000, ac.assignedAltitude + 50);
  if (ca.altitude === 'down')  ac.assignedAltitude = Math.max(2000,  ac.assignedAltitude - 50);
  if (ca.speed === 'increase') ac.assignedSpeed    = Math.min(600,   ac.assignedSpeed + 5);
  if (ca.speed === 'decrease') ac.assignedSpeed    = Math.max(100,   ac.assignedSpeed - 5);
  if (ac.heading !== ac.assignedHeading) {
    let diff = ac.assignedHeading - ac.heading;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;
    const step = Math.min(Math.abs(diff), tr) * Math.sign(diff);
    let h = ac.heading + step;
    if (h <= 0)   h += 360;
    if (h >  360) h -= 360;
    ac.heading = (Math.abs(diff) <= tr) ? ac.assignedHeading : h;
  }
  if (ac.altitude !== ac.assignedAltitude) {
    const d = ac.assignedAltitude - ac.altitude;
    ac.altitude = Math.abs(d) <= 33 ? ac.assignedAltitude : ac.altitude + Math.sign(d) * 33;
  }
  if (ac.speed !== ac.assignedSpeed) {
    const d = ac.assignedSpeed - ac.speed;
    ac.speed = Math.abs(d) <= 2 ? ac.assignedSpeed : ac.speed + Math.sign(d) * 2;
  }
  ac.tickCount = (ac.tickCount || 0) + 1;
  const rad = ((90 - ac.heading) * Math.PI) / 180;
  ac.x_nm += Math.cos(rad) * (ac.speed / 3600);
  ac.y_nm += Math.sin(rad) * (ac.speed / 3600);
}

function broadcastTick() {
  if (!isSimulationRunning) return;
  aircrafts.forEach(ac => {
    if (ac.frozen) return;
    const ca = ac.continuousAction || {};
    const turning = Math.abs(ac.heading - ac.assignedHeading) > 0.5 || ca.turn != null;
    ac.history.push({ x: ac.x_nm, y: ac.y_nm, turning });
  });
  if (appRole === 'instructor' && selectedAircraft && activeLineDisplay)
    broadcastLineState(activeLineDisplay, bearing(selectedAircraft));
  if (appRole === 'instructor' && iConnCount() > 0)
    iBroadcast({ type: 'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id || null });
}

function spawnAtClick(e) {
  if (aircrafts.length>=20) { resetSpawnBtn(); return; }
  const rect=canvas.getBoundingClientRect();
  const w=canvas.width/devicePixelRatio, h=canvas.height/devicePixelRatio;
  const R=Math.min(w,h)/2-12, zNM=getZoom(), px=R/zNM;
  const x=((e.clientX-rect.left-w/2)/px)+panX, y=-((e.clientY-rect.top-h/2)/px)+panY;
  _pendingSpawnPos = { x, y };
  openSpawnDialog();
}

function openSpawnDialog() {
  const dlg = $('spawn-dialog'); if (!dlg) return;
  const tp = $('dlg-type'); if (tp) tp.value = 'fighter';
  const cs = $('dlg-callsign'); if (cs) { cs.value = callsign(); }
  const hd = $('dlg-hdg'); if (hd) hd.value = '';
  const al = $('dlg-alt'); if (al) al.value = '';
  const er = $('dlg-error'); if (er) { er.classList.add('hidden'); er.textContent = ''; }
  _applyDlgType('fighter');
  dlg.classList.remove('hidden');
  lucide.createIcons({ nameAttr:'data-lucide', rootNode:dlg });
  setTimeout(() => $('dlg-callsign')?.focus(), 80);
}

function closeSpawnDialog() {
  $('spawn-dialog')?.classList.add('hidden');
  _pendingSpawnPos = null;
  resetSpawnBtn();
}

function _applyDlgType(tp) {
  const isFmn = tp.startsWith('fmn');
  const sz = tp === 'fmn2' ? 2 : tp === 'fmn3' ? 3 : tp === 'fmn4' ? 4 : 1;
  const titleEl = $('dlg-title');
  const titleMap = { fighter:'Place Fighter', transport:'Place Transport', fmn2:'Place 2-Ship Formation', fmn3:'Place 3-Ship Formation', fmn4:'Place 4-Ship Formation' };
  if (titleEl) titleEl.textContent = titleMap[tp] || 'Place Aircraft';
  const csLabel = $('dlg-cs-label');
  if (csLabel) csLabel.textContent = isFmn ? 'Formation Callsign' : 'Callsign';
  const csInput = $('dlg-callsign');
  if (csInput) {
    csInput.placeholder = isFmn ? 'e.g. WOLF' : (tp === 'transport' ? 'e.g. ATL-201' : 'e.g. MIG-101');
    if (isFmn) {
      const used = new Set(aircrafts.map(a => a.formationId).filter(Boolean));
      const pools = ['COLA','THOR','WOLF','HAWK','VIPER','EAGLE','TIGER','SHARK','COBRA','STORM'];
      const avail = pools.filter(n => !used.has(n));
      csInput.value = avail[Math.floor(Math.random()*avail.length)] || 'BRAVO';
    } else {
      csInput.value = callsign();
    }
  }
  const sqSingle = $('dlg-sqk-single');
  const sqMulti = $('dlg-sqk-multi');
  if (isFmn) {
    sqSingle?.classList.add('hidden');
    sqMulti?.classList.remove('hidden');
    sqMulti.innerHTML = `<label class="text-[8px] text-slate-500 font-black tracking-widest uppercase block">Squawks (${sz} aircraft) <span class="text-slate-600 normal-case font-semibold">blank or 0000 = PSR</span></label>`;
    for (let i = 0; i < sz; i++) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2';
      row.innerHTML = `<span class="text-[8px] text-violet-500 font-black w-4 flex-shrink-0">#${i+1}</span>
        <div class="sqk-prefix-wrap flex-1">
          <span class="sqk-prefix">3-</span>
          <input id="dlg-squawk-${i}" type="text" maxlength="4" placeholder="blank = PSR"
            class="w-full bg-black border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs font-black text-slate-300 focus:outline-none focus:border-slate-500 placeholder:text-slate-700"
            oninput="this.value=this.value.replace(/[^0-7]/g,'').slice(0,4)">
        </div>`;
      sqMulti.appendChild(row);
    }
  } else {
    sqSingle?.classList.remove('hidden');
    sqMulti?.classList.add('hidden');
    const sq0 = $('dlg-squawk-0'); if (sq0) sq0.value = '';
  }
}

function onDlgTypeChange() {
  const tp = $('dlg-type')?.value || 'fighter';
  _applyDlgType(tp);
}

function confirmSpawnDialog() {
  if (!_pendingSpawnPos) { closeSpawnDialog(); return; }
  const { x, y } = _pendingSpawnPos;
  const er = $('dlg-error');
  const tp = ($('dlg-type')?.value || 'fighter');
  const isFmn = tp.startsWith('fmn');
  const sz = tp === 'fmn2' ? 2 : tp === 'fmn3' ? 3 : tp === 'fmn4' ? 4 : 1;
  const csRaw = ($('dlg-callsign')?.value || '').trim().toUpperCase();
  if (!csRaw) { er.textContent = 'Callsign is required.'; er.classList.remove('hidden'); return; }
  const hdRaw = ($('dlg-hdg')?.value || '').trim();
  const hdv = parseInt(hdRaw);
  const hdg = (!hdRaw || isNaN(hdv)) ? ((Math.random() * 360 | 0) || 1) : Math.max(1, Math.min(360, hdv));
  const altRaw = ($('dlg-alt')?.value || '').trim();
  const altv = parseInt(altRaw);
  const randomAlt = () => (Math.floor(Math.random() * 6) + 10) * 1000;
  const alt = (!altRaw || isNaN(altv) || altv < 1000) ? randomAlt() : Math.round(altv / 1000) * 1000;
  const defaultSpd = tp === 'transport' ? 250 : 300;
  if (!isFmn) {
    const sqRaw = ($('dlg-squawk-0')?.value || '').trim();
    const sqNorm = parseSquawkInput(sqRaw);
    const sq = (!sqRaw || sqNorm === '0000') ? '' : sqNorm;
    const ac = makeAc(x, y, hdg);
    ac.id = csRaw; ac.squawk = sq;
    ac.speed = defaultSpd; ac.assignedSpeed = defaultSpd;
    ac.altitude = alt; ac.assignedAltitude = alt;
    aircrafts.push(ac); selectedAircraft = ac; loadControls();
    if (appRole === 'instructor') iBroadcast({ type: 'spawn', aircraft: ac, selectedId: ac.id });
  } else {
    const squawks = [];
    for (let i = 0; i < sz; i++) {
      const sqRaw = ($(`dlg-squawk-${i}`)?.value || '').trim();
      const sqNorm = parseSquawkInput(sqRaw);
      squawks.push((!sqRaw || sqNorm === '0000') ? '' : sqNorm);
    }
    spawnFormation(x, y, hdg, defaultSpd, alt, csRaw, sz, squawks);
  }
  $('spawn-dialog')?.classList.add('hidden');
  _pendingSpawnPos = null;
  resetSpawnBtn();
}

function updateMemberStrip() {
  const strip = $('fmn-member-strip'); if (!strip) return;
  strip.innerHTML = '';
  const fid = selectedAircraft?.formationId;
  if (!fid) { strip.classList.remove('is-visible'); strip.classList.add('hidden'); return; }
  const members = aircrafts.filter(a => a.formationId === fid).sort((a,b) => a.formationRole - b.formationRole);
  if (members.length < 2) { strip.classList.remove('is-visible'); strip.classList.add('hidden'); return; }
  members.forEach(ac => {
    const isSel = selectedAircraft === ac;
    const tab = document.createElement('div');
    tab.dataset.acId = ac.id;
    tab.className = `fmn-subtab${isSel ? ' is-selected' : ''}`;
    tab.title = ac.id;
    tab.innerHTML = `
      <span class="fmn-subtab-role">#${ac.formationRole}</span>
      <span data-tab-hdg="${ac.id}" class="fmn-subtab-hdg">${Math.round(ac.heading).toString().padStart(3,'0')}°</span>
      ${appRole !== 'trainee' ? `<button class="fmn-eject-btn" title="Eject ${ac.id}" data-eject="${ac.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}`;
    if (appRole !== 'trainee') {
      tab.addEventListener('click', e => {
        if (e.target.closest('[data-eject]')) return;
        selectedAircraft = ac; loadControls();
      });
      tab.querySelector('[data-eject]')?.addEventListener('click', e => {
        e.stopPropagation(); ejectFromFormation(ac.id);
      });
    }
    strip.appendChild(tab);
  });
  strip.classList.remove('hidden');
  strip.classList.add('is-visible');
}

function loadControls() {
  renderTabs(); updateMemberStrip(); updateGlobalActionBtns(); if (!selectedAircraft) return;
  const ci=$('cmd-input'); if(ci) {
    ci.value='';
    if (selectedAircraft.formationId) {
      ci.style.borderColor = 'rgba(139,92,246,.55)';
      ci.placeholder = `H090·A150·N300 (${selectedAircraft.formationId})`;
    } else {
      ci.style.borderColor = '';
      ci.placeholder = 'H090·A150·ROT3';
    }
  }
  const lc=$('last-cmd-label'); if(lc){lc.textContent='---';lc.style.color='';}
  syncLabels(); updateActionUI(); updateTelemetry();
}

function startContinuousAction(cat, dir) {
  if (!selectedAircraft) return;
  if (!selectedAircraft.continuousAction) selectedAircraft.continuousAction={turn:null,altitude:null,speed:null};
  if (cat === 'turn') {
    const delta = dir === 'left' ? -5 : 5;
    selectedAircraft.assignedHeading = ((selectedAircraft.assignedHeading + delta) % 360 + 360) % 360 || 360;
    if (selectedAircraft.assignedHeading === 0) selectedAircraft.assignedHeading = 360;
  }
  selectedAircraft.continuousAction[cat] = dir;
  if (selectedAircraft.formationId) {
    propagateToFormation(selectedAircraft, a => {
      if (!a.continuousAction) a.continuousAction = {turn:null,altitude:null,speed:null};
      if (cat === 'turn') {
        const delta = dir === 'left' ? -5 : 5;
        a.assignedHeading = ((a.assignedHeading + delta) % 360 + 360) % 360 || 360;
        if (a.assignedHeading === 0) a.assignedHeading = 360;
      }
      a.continuousAction[cat] = dir;
    });
  }
  updateActionUI();
}
function stopAction(cat) {
  if (!selectedAircraft?.continuousAction) return;
  selectedAircraft.continuousAction[cat] = null;
  if (cat === 'turn') { let h = Math.round(selectedAircraft.heading); if (h === 0) h = 360; selectedAircraft.assignedHeading = h; }
  if (cat === 'altitude') selectedAircraft.assignedAltitude = Math.round(selectedAircraft.altitude);
  if (cat === 'speed')    selectedAircraft.assignedSpeed    = Math.round(selectedAircraft.speed);
  if (selectedAircraft.formationId) {
    propagateToFormation(selectedAircraft, a => {
      if (!a.continuousAction) return;
      a.continuousAction[cat] = null;
      if (cat === 'turn') { let h = Math.round(a.heading); a.assignedHeading = h || 360; }
      if (cat === 'altitude') a.assignedAltitude = Math.round(a.altitude);
      if (cat === 'speed')    a.assignedSpeed    = Math.round(a.speed);
    });
  }
  updateActionUI(); syncLabels();
}
const stopContinuousAction = stopAction;

function updateActionUI() {
  if (!selectedAircraft) return;
  const ca=selectedAircraft.continuousAction||{};
  setBtnActive('btn-turn-left',  ca.turn==='left');
  setBtnActive('btn-turn-right', ca.turn==='right');
  setBtnActive('btn-alt-down',   ca.altitude==='down');
  setBtnActive('btn-alt-up',     ca.altitude==='up');
  setBtnActive('btn-spd-dec',    ca.speed==='decrease');
  setBtnActive('btn-spd-inc',    ca.speed==='increase');
}
function setBtnActive(id, on) {
  const btn=$(id); if(!btn) return;
  if (on) { btn.classList.add('bg-amber-500/20','border-amber-500/60','text-amber-400'); btn.classList.remove('bg-slate-800','border-emerald-900/60','text-emerald-400','bg-slate-900','border-slate-600/50','text-slate-500'); }
  else    { btn.classList.remove('bg-amber-500/20','border-amber-500/60','text-amber-400'); btn.classList.add(id==='btn-turn-stop'?'bg-slate-900':'bg-slate-800', id==='btn-turn-stop'?'border-slate-600/50':'border-emerald-900/60', id==='btn-turn-stop'?'text-slate-500':'text-emerald-400'); }
}

function syncLabels() {
  if (!selectedAircraft) return;
  const ae=$('display-altitude'), se=$('display-speed');
  if(ae) ae.textContent='A'+Math.round(selectedAircraft.assignedAltitude/100).toString().padStart(3,'0');
  if(se) se.textContent='N'+Math.round(selectedAircraft.assignedSpeed);
}

function updateTelemetry() {
  if (!selectedAircraft) return;
  const b=bearing(selectedAircraft), dist=Math.sqrt(selectedAircraft.x_nm**2+selectedAircraft.y_nm**2);
  const el=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const sqkVal = selectedAircraft.formationId
    ? `${selectedAircraft.formationId}-${selectedAircraft.formationRole}`
    : fmtSquawk(selectedAircraft.squawk);
  el('display-squawk', sqkVal);
  el('display-heading', Math.round(selectedAircraft.heading).toString().padStart(3,'0')+'°');
  el('display-altitude', 'A'+Math.round(selectedAircraft.assignedAltitude/100).toString().padStart(3,'0'));
  el('display-speed', 'N'+Math.round(selectedAircraft.assignedSpeed));
  el('display-brg', b.toString().padStart(3,'0')+'°');
  el('display-rng-nm', dist.toFixed(1)+' NM');
  el('display-brg-rng', `${b.toString().padStart(3,'0')}° / ${dist.toFixed(1)} NM`);
  el('display-bearing', b.toString().padStart(3,'0')+'°');
  el('display-homing', homing(b).toString().padStart(3,'0')+'°');
  el('display-range', dist.toFixed(1)+' NM');
  el('display-callsign', selectedAircraft.id);
  syncLabels();
}

function terminateSelectedTarget() {
  if (!selectedAircraft) return;
  deleteAircraftById(selectedAircraft.id);
}

function deleteAircraftById(acId) {
  const ac = aircrafts.find(a => a.id === acId);
  if (ac?.formationId) {
    const fid = ac.formationId;
    aircrafts = aircrafts.filter(a => a.id !== acId);
    const remaining = aircrafts.filter(a => a.formationId === fid);
    if (remaining.length <= 1) {
      remaining.forEach(a => { a.formationId = null; a.formationRole = null; a.formationOffset = null; });
      showToast(`Formation dissolved — 1 aircraft remaining`);
    }
  } else {
    aircrafts = aircrafts.filter(a => a.id !== acId);
  }
  if (selectedAircraft?.id === acId || !aircrafts.find(a => a.id === selectedAircraft?.id)) {
    selectedAircraft = aircrafts[0] || null;
  }
  renderTabs(); loadControls();
}

function toggleFreeze(acId) {
  const ac = aircrafts.find(a => a.id === acId); if (!ac) return;
  const newState = !ac.frozen;
  if (ac.formationId) {
    aircrafts.filter(a => a.formationId === ac.formationId).forEach(a => { a.frozen = newState; });
    showToast(newState ? `✦ ${ac.formationId} formation frozen` : `✦ ${ac.formationId} formation unfrozen`);
  } else {
    ac.frozen = newState;
    showToast(newState ? `❄ ${acId} frozen` : `▶ ${acId} unfrozen`);
  }
  updateAircraftCards();
  if (appRole === 'instructor') iBroadcast({ type:'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id||null });
}

function toggleHideFromTrainee(acId) {
  const ac = aircrafts.find(a => a.id === acId); if (!ac) return;
  const newState = !ac.hiddenFromTrainee;
  if (ac.formationId) {
    aircrafts.filter(a => a.formationId === ac.formationId).forEach(a => { a.hiddenFromTrainee = newState; });
    showToast(newState ? `👁 ${ac.formationId} hidden from trainees` : `👁 ${ac.formationId} visible to trainees`);
  } else {
    ac.hiddenFromTrainee = newState;
    showToast(newState ? `👁 ${acId} hidden from trainees` : `👁 ${acId} visible to trainees`);
  }
  updateAircraftCards();
  if (appRole === 'instructor') iBroadcast({ type:'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id||null });
}

let fmnMode = false, fmnSize = 2;

function getFmnName() {
  const v = ($('fmn-name-input')?.value||'').trim().toUpperCase();
  if (v && v.length >= 2) return v;
  const used = new Set(aircrafts.map(a => a.formationId).filter(Boolean));
  const avail = FMN_CALLSIGN_POOLS.filter(n => !used.has(n));
  return avail[Math.floor(Math.random()*avail.length)] || 'BRAVO';
}

function fmnOffset(role) {
  const step = 0.6;
  return role === 1 ? {fwd:0, lat:0} : {fwd:-(role-1)*step, lat:(role-1)*step};
}

function spawnFormation(leaderX, leaderY, hdg, spd, alt, fmnName, fmnSz, squawksArr) {
  const name = fmnName || getFmnName();
  const totalSlots = 20;
  const existingCount = aircrafts.length;
  const canFit = Math.min(fmnSz || fmnSize, totalSlots - existingCount);
  if (canFit < 2) { showToast('⚠ Not enough slots for formation (max 20 total)'); return; }
  const actualSize = canFit;
  const newAcs = [];
  for (let role = 1; role <= actualSize; role++) {
    const off = fmnOffset(role);
    const ac = makeAc(leaderX, leaderY, hdg);
    ac.id = `${name}-${role}`;
    ac.squawk = (squawksArr && squawksArr[role-1] !== undefined) ? squawksArr[role-1] : squawk();
    ac.speed = spd; ac.assignedSpeed = spd;
    ac.altitude = alt; ac.assignedAltitude = alt;
    ac.formationId = name;
    ac.formationRole = role;
    ac.formationOffset = off;
    newAcs.push(ac);
  }
  newAcs.forEach(ac => aircrafts.push(ac));
  selectedAircraft = newAcs[0];
  loadControls();
  if (appRole === 'instructor') {
    iBroadcast({ type:'stateSnapshot', aircrafts: snapAircrafts(true), selectedId: selectedAircraft?.id||null });
  }
  showToast(`✦ ${name} formation (${actualSize} acft) created`);
  return newAcs;
}

// ── Global freeze/hide panel buttons ─────────────────────────────────────────
function updateGlobalActionBtns() {
  if (appRole === 'trainee') return;
  const ac = selectedAircraft;
  const freezeBtn = $('btn-global-freeze');
  const hideBtn   = $('btn-global-hide');
  if (!freezeBtn || !hideBtn) return;

  if (!ac) {
    freezeBtn.className = 'w-7 h-7 rounded border border-slate-700/50 bg-slate-900/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all';
    freezeBtn.title = 'Freeze aircraft';
    freezeBtn.innerHTML = '<i data-lucide="snowflake" class="w-3.5 h-3.5"></i>';
    hideBtn.className   = 'w-7 h-7 rounded border border-slate-700/50 bg-slate-900/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all';
    hideBtn.title = 'Hide from trainees';
    hideBtn.innerHTML   = '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
    lucide.createIcons({ nameAttr:'data-lucide', rootNode:freezeBtn });
    lucide.createIcons({ nameAttr:'data-lucide', rootNode:hideBtn });
    return;
  }

  const frozen = !!ac.frozen;
  const hidden = !!ac.hiddenFromTrainee;

  if (frozen) {
    freezeBtn.className = 'w-7 h-7 rounded border border-sky-500/70 bg-sky-900/40 text-sky-300 flex items-center justify-center active:scale-95 transition-all';
    freezeBtn.title = 'Unfreeze aircraft';
    freezeBtn.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i>';
  } else {
    freezeBtn.className = 'w-7 h-7 rounded border border-slate-700/50 bg-slate-900/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all';
    freezeBtn.title = 'Freeze aircraft';
    freezeBtn.innerHTML = '<i data-lucide="snowflake" class="w-3.5 h-3.5"></i>';
  }

  if (hidden) {
    hideBtn.className = 'w-7 h-7 rounded border border-amber-600/60 bg-amber-950/40 text-amber-400 flex items-center justify-center active:scale-95 transition-all';
    hideBtn.title = 'Show to trainees';
    hideBtn.innerHTML = '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>';
  } else {
    hideBtn.className = 'w-7 h-7 rounded border border-slate-700/50 bg-slate-900/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all';
    hideBtn.title = 'Hide from trainees';
    hideBtn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
  }

  lucide.createIcons({ nameAttr:'data-lucide', rootNode:freezeBtn });
  lucide.createIcons({ nameAttr:'data-lucide', rootNode:hideBtn });
}

function globalFreeze() {
  if (!selectedAircraft || appRole === 'trainee') return;
  toggleFreeze(selectedAircraft.id);
  updateGlobalActionBtns();
}

function globalHide() {
  if (!selectedAircraft || appRole === 'trainee') return;
  toggleHideFromTrainee(selectedAircraft.id);
  updateGlobalActionBtns();
}
</script>
</body>
