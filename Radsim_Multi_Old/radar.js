'use strict';
// Canvas
const canvas = $('radarCanvas');
const ctx    = canvas.getContext('2d');
// Scope settings (local to each view — never broadcast)
let settings = {
  showSweep:true, showRings:true, showDistanceLabels:true, showAngleMarkers:true,
  rwyOrientation:300, trailDots:10, showLabels:true
};
// Radar sweep angle
let radarAngle = -Math.PI / 2;
// Label drag state
let labelOffsets  = {};
let draggingLabel = null, dragStartX = 0, dragStartY = 0;
// Label line visibility (keyed by LABEL_LINE_DEFS key)
let labelLines = {};
// Pan/zoom state
let zoomIndex = 23, isNavLocked = true;
let panX = 0, panY = 0;
let isPanning = false, panMoved = false, panSX = 0, panSY = 0, panOX = 0, panOY = 0;
// Line display (bearing/homing)
let activeLineDisplay = null;
// Toast timer
let _toastTimer = null;
// Label-lines dropdown state
let _labelLinesPanelOpen = false;

function getZoom() { return ZOOM_STEPS[zoomIndex]; }
function initLabelLinesPanel() {
  const defs = LABEL_LINE_DEFS.filter(d =>
    (!d.instructorOnly || appRole === 'instructor') &&
    (!d.traineeHidden  || appRole !== 'trainee')
  );
  defs.forEach(d => {
    if (d.traineeHidden && appRole === 'trainee') {
      labelLines[d.key] = false;
    } else if (!(d.key in labelLines)) {
      labelLines[d.key] = d.defaultOn;
    }
  });
  LABEL_LINE_DEFS.forEach(d => {
    if (d.traineeHidden && appRole === 'trainee') labelLines[d.key] = false;
  });

  let panel = document.getElementById('label-lines-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'label-lines-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `<p class="text-[7px] text-emerald-700 font-black tracking-widest uppercase mb-1.5 px-0.5">Label Info</p>`;

  defs.forEach(d => {
    const row = document.createElement('div');
    row.className = 'll-row';
    row.dataset.llKey = d.key;
    row.innerHTML = `
      <span class="ll-check${labelLines[d.key] ? ' is-on' : ''}">
        <svg viewBox="0 0 12 10"><polyline points="1.5,5 4.5,8.5 10.5,1.5"/></svg>
      </span>
      <span class="ll-label">${d.label}</span>`;
    row.addEventListener('click', (e) => { e.stopPropagation(); toggleLabelLine(d.key); });
    panel.appendChild(row);
  });

  syncLabelLinesBtn();
}

function toggleLabelLine(key) {
  labelLines[key] = !labelLines[key];
  const panel = document.getElementById('label-lines-panel'); if (!panel) return;
  const row = panel.querySelector(`[data-ll-key="${key}"]`); if (!row) return;
  const chk = row.querySelector('.ll-check');
  if (chk) chk.classList.toggle('is-on', labelLines[key]);
  syncLabelLinesBtn();
}

function syncLabelLinesBtn() {
  const btn = $('btn-label-lines'); if (!btn) return;
  const defs = LABEL_LINE_DEFS.filter(d =>
    (!d.instructorOnly || appRole === 'instructor') &&
    (!d.traineeHidden  || appRole !== 'trainee')
  );
  const allOn = defs.every(d => labelLines[d.key] !== false);
  btn.classList.toggle('border-emerald-500/60', !allOn);
  btn.classList.toggle('text-emerald-300', !allOn);
  btn.classList.toggle('border-slate-600/50', allOn);
  btn.classList.toggle('text-slate-300', allOn);
}

let _labelLinesPanelOpen = false;
function toggleLabelLinesPanel(e) {
  e.stopPropagation();
  _labelLinesPanelOpen = !_labelLinesPanelOpen;
  const panel = document.getElementById('label-lines-panel');
  if (!panel) return;

  if (_labelLinesPanelOpen) {
    const btn = $('btn-label-lines');
    if (btn) {
      const r = btn.getBoundingClientRect();
      panel.style.left = Math.max(4, r.left) + 'px';
      panel.style.top = (r.top - 4) + 'px';
      panel.style.transform = 'translateY(-100%)';
    }
    panel.classList.add('is-open');
  } else {
    panel.classList.remove('is-open');
  }
}

document.addEventListener('click', e => {
  if (_labelLinesPanelOpen && !e.target.closest('#btn-label-lines-wrap') && e.target.id !== 'label-lines-panel' && !e.target.closest('#label-lines-panel')) {
    _labelLinesPanelOpen = false;
    document.getElementById('label-lines-panel')?.classList.remove('is-open');
  }
});

function toggleLabels() {
  settings.showLabels = !settings.showLabels;
  const btn = $('btn-toggle-labels'); if (!btn) return;
  btn.classList.toggle('bg-emerald-600/25', settings.showLabels);
  btn.classList.toggle('border-emerald-500/60', settings.showLabels);
  btn.classList.toggle('text-emerald-300', settings.showLabels);
  btn.classList.toggle('bg-slate-800', !settings.showLabels);
  btn.classList.toggle('border-slate-600/50', !settings.showLabels);
  btn.classList.toggle('text-slate-500', !settings.showLabels);
}

function toggleNavLock() {
  isNavLocked = !isNavLocked;
  const btn = $('btn-nav-lock'); if (!btn) return;
  btn.innerHTML = isNavLocked ? SVG_LOCK : SVG_UNLOCK;
  btn.classList.toggle('border-amber-500/70', isNavLocked);
  btn.classList.toggle('text-amber-400', isNavLocked);
  btn.classList.toggle('border-slate-600/50', !isNavLocked);
  btn.classList.toggle('text-slate-400', !isNavLocked);
  const slider = $('zoom-slider');
  if (slider) slider.disabled = isNavLocked;
}
function syncZoomSlider() {
  const slider = $('zoom-slider');
  if (slider) slider.value = String((ZOOM_STEPS.length - 1) - zoomIndex);
}
function setZoomFromSlider(v) {
  if (isNavLocked) { syncZoomSlider(); return; }
  zoomIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, (ZOOM_STEPS.length - 1) - parseInt(v)));
}
function adjustZoom(dir) {
  if (isNavLocked) return;
  zoomIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, zoomIndex - dir));
  syncZoomSlider();
}
function centerPan() { if (isNavLocked) return; panX = 0; panY = 0; }
function resetPan() { if (isNavLocked) return; panX = 0; panY = 0; zoomIndex = 23; syncZoomSlider(); }

const HISTORY_DOT_STEPS = [5, 10, 15, 20, 0];
function cycleHistoryDots() {
  const idx = HISTORY_DOT_STEPS.indexOf(settings.trailDots);
  const next = HISTORY_DOT_STEPS[(idx + 1) % HISTORY_DOT_STEPS.length];
  setTrailDots(next);
}
function syncHistoryDotsLabel() {
  const lbl = $('history-dots-label');
  if (lbl) lbl.textContent = settings.trailDots === 0 ? 'FULL' : String(settings.trailDots);
}

function edgeDist(rad, cx, cy, w, h) {
  const cr = Math.cos(rad), sr = Math.sin(rad);
  const tx = cr !== 0 ? (cr > 0 ? (w-cx) : cx) / Math.abs(cr) : Infinity;
  const ty = sr !== 0 ? (sr > 0 ? (h-cy) : cy) / Math.abs(sr) : Infinity;
  return Math.min(tx, ty);
}

function hasSquawk(ac) {
  const sq = ac.squawk || '';
  return sq !== '' && sq !== '0000' && sq !== '----';
}

function _labelGeometry(ac, rx, ry) {
  const sel = selectedAircraft === ac;
  const sq = sel ? 4.8 : 3.8;
  const isPrimary = !hasSquawk(ac);
  const lx = rx + sq + 5;
  let h;
  if (isPrimary) {
    const primaryKeys = ['callsign', 'speed'];
    const visibleCount = primaryKeys.filter(k => {
      if (labelLines[k] === false) return false;
      const def = LABEL_LINE_DEFS.find(d => d.key === k);
      if (def?.traineeHidden && appRole === 'trainee') return false;
      return true;
    }).length;
    h = Math.max(10, visibleCount * 10 + 2);
  } else {
    const lines = _visibleLabelLines();
    h = Math.max(12, lines.length * 10 + 2);
  }
  const ly = (isPrimary ? ry - 4 : ry - (h * 0.5 + 4)) - 4;
  return { lx, ly, w: 56, h, sq };
}

function _visibleLabelLines() {
  const order = ['callsign', 'squawk', 'altitude', 'speed', 'heading'];
  return order.filter(k => {
    if (labelLines[k] === false) return false;
    const def = LABEL_LINE_DEFS.find(d => d.key === k);
    if (def?.traineeHidden && appRole === 'trainee') return false;
    return true;
  });
}

function declutterLabels() {
  if (!aircrafts.length) return;
  const cw = canvas.width / devicePixelRatio, ch = canvas.height / devicePixelRatio;
  const R = Math.min(cw, ch) / 2 - 12, zNM = getZoom(), pxNM = R / zNM;
  const cx = cw / 2 - panX * pxNM, cy = ch / 2 + panY * pxNM;

  const boxes = aircrafts.map(ac => {
    const rx = cx + (ac.x_nm / zNM) * R;
    const ry = cy - (ac.y_nm / zNM) * R;
    const geo = _labelGeometry(ac, rx, ry);
    const prev = labelOffsets[ac.id] || { x: 0, y: 0 };
    return { id: ac.id, blipX: rx, blipY: ry, baseX: geo.lx, baseY: geo.ly, w: geo.w, h: geo.h, ox: prev.x, oy: prev.y };
  });

  const PAD = 3, ITER = 120, MARGIN = 6;

  for (let it = 0; it < ITER; it++) {
    let anyMoved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ax = a.baseX + a.ox, ay = a.baseY + a.oy;
        const bx = b.baseX + b.ox, by = b.baseY + b.oy;
        const overlapX = Math.min(ax + a.w, bx + b.w) - Math.max(ax, bx) + PAD;
        const overlapY = Math.min(ay + a.h, by + b.h) - Math.max(ay, by) + PAD;
        if (overlapX > 0 && overlapY > 0) {
          anyMoved = true;
          if (overlapX <= overlapY) {
            const half = overlapX / 2, dir = ax + a.w / 2 < bx + b.w / 2 ? -1 : 1;
            a.ox += dir * half; b.ox -= dir * half;
          } else {
            const half = overlapY / 2, dir = ay + a.h / 2 < by + b.h / 2 ? -1 : 1;
            a.oy += dir * half; b.oy -= dir * half;
          }
        }
      }
    }
    for (const b of boxes) {
      const lx = b.baseX + b.ox, ly = b.baseY + b.oy;
      if (lx < MARGIN)            { b.ox += MARGIN - lx; anyMoved = true; }
      if (lx + b.w > cw - MARGIN) { b.ox -= (lx + b.w) - (cw - MARGIN); anyMoved = true; }
      if (ly < MARGIN)            { b.oy += MARGIN - ly; anyMoved = true; }
      if (ly + b.h > ch - MARGIN) { b.oy -= (ly + b.h) - (ch - MARGIN); anyMoved = true; }
    }
    for (const b of boxes) { b.ox *= 0.97; b.oy *= 0.97; }
    if (!anyMoved) break;
  }
  boxes.forEach(b => { labelOffsets[b.id] = { x: b.ox, y: b.oy }; });
  showToast('Labels decluttered — drag to fine-tune');
}

function hitTestLabel(mx, my) {
  const cw = canvas.width / devicePixelRatio, ch = canvas.height / devicePixelRatio;
  const R = Math.min(cw, ch) / 2 - 12, zNM = getZoom(), pxNM = R / zNM;
  const cx = cw / 2 - panX * pxNM, cy = ch / 2 + panY * pxNM;
  for (const ac of aircrafts) {
    const rx = cx + (ac.x_nm / zNM) * R, ry = cy - (ac.y_nm / zNM) * R;
    const geo = _labelGeometry(ac, rx, ry);
    const offset = labelOffsets[ac.id] || { x: 0, y: 0 };
    const lx = geo.lx + offset.x, ly = geo.ly + offset.y;
    if (mx >= lx - 3 && mx <= lx + geo.w + 3 && my >= ly - 2 && my <= ly + geo.h + 2) return ac.id;
  }
  return null;
}

function initPanHandlers() {
  canvas.addEventListener('mousedown', e => {
    if (isSpawnerArmed) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left), my = (e.clientY - rect.top);
    const hit = settings.showLabels ? hitTestLabel(mx, my) : null;
    if (hit) { draggingLabel = hit; dragStartX = mx; dragStartY = my; canvas.style.cursor = 'move'; return; }
    if (isNavLocked) return;
    isPanning = true; panMoved = false;
    panSX = e.clientX; panSY = e.clientY; panOX = panX; panOY = panY;
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left), my = (e.clientY - rect.top);
    if (draggingLabel) {
      const dx = mx - dragStartX, dy = my - dragStartY;
      if (!labelOffsets[draggingLabel]) labelOffsets[draggingLabel] = {x: 0, y: 0};
      labelOffsets[draggingLabel].x += dx; labelOffsets[draggingLabel].y += dy;
      dragStartX = mx; dragStartY = my; return;
    }
    if (!isPanning) return;
    panMoved = true;
    const px = (Math.min(canvas.width/devicePixelRatio,canvas.height/devicePixelRatio)/2-12)/getZoom();
    panX = panOX - (e.clientX - panSX) / px;
    panY = panOY + (e.clientY - panSY) / px;
  });
  canvas.addEventListener('mouseup', e => {
    const moved = panMoved; isPanning = false; panMoved = false; canvas.style.cursor = 'crosshair'; draggingLabel = null;
    if (isSpawnerArmed && !moved) spawnAtClick(e);
  });
  canvas.addEventListener('mouseleave', () => { isPanning = false; panMoved = false; canvas.style.cursor = 'crosshair'; draggingLabel = null; });

  let lastT = null;
  canvas.addEventListener('touchstart', e => {
    lastT = e.touches[0];
    if (isSpawnerArmed || e.touches.length !== 1) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (lastT.clientX - rect.left), my = (lastT.clientY - rect.top);
    const hit = settings.showLabels ? hitTestLabel(mx, my) : null;
    if (hit) { draggingLabel = hit; dragStartX = mx; dragStartY = my; return; }
    if (isNavLocked) return;
    isPanning = true; panMoved = false;
    panSX = lastT.clientX; panSY = lastT.clientY; panOX = panX; panOY = panY;
  }, { passive:true });
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    lastT = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const mx = (lastT.clientX - rect.left), my = (lastT.clientY - rect.top);
    if (draggingLabel) {
      const dx = mx - dragStartX, dy = my - dragStartY;
      if (!labelOffsets[draggingLabel]) labelOffsets[draggingLabel] = {x: 0, y: 0};
      labelOffsets[draggingLabel].x += dx; labelOffsets[draggingLabel].y += dy;
      dragStartX = mx; dragStartY = my; return;
    }
    if (!isPanning) return;
    panMoved = true;
    const px = (Math.min(canvas.width/devicePixelRatio,canvas.height/devicePixelRatio)/2-12)/getZoom();
    panX = panOX - (lastT.clientX - panSX) / px;
    panY = panOY + (lastT.clientY - panSY) / px;
  }, { passive:true });
  canvas.addEventListener('touchend', e => {
    const wasDragging = draggingLabel;
    isPanning = false; draggingLabel = null;
    if (isSpawnerArmed && lastT && !panMoved && !wasDragging) spawnAtClick({ clientX:lastT.clientX, clientY:lastT.clientY });
    lastT = null; panMoved = false;
  });
}

function setLineDisplay(type, active) {
  activeLineDisplay = active ? type : null;
  const cls = ['bg-amber-500/20','border-amber-400'], base = ['bg-emerald-950/10','border-emerald-900/40'];
  const tb = $('tile-bearing'), th = $('tile-homing');
  if (activeLineDisplay === 'bearing') {
    tb.classList.add(...cls); tb.classList.remove(...base);
    th.classList.remove(...cls); th.classList.add(...base);
  } else if (activeLineDisplay === 'homing') {
    th.classList.add(...cls); th.classList.remove(...base);
    tb.classList.remove(...cls); tb.classList.add(...base);
  } else {
    tb.classList.remove(...cls); tb.classList.add(...base);
    th.classList.remove(...cls); th.classList.add(...base);
  }
  if (selectedAircraft) broadcastLineState(activeLineDisplay, bearing(selectedAircraft));
}

function isLandscapeLayout() {
  return window.matchMedia('(orientation: landscape)').matches;
}

function splitStoreGet(key, fallback) {
  try { return localStorage.getItem((appRole||'solo') + '_' + key) || fallback; } catch(e) { return fallback; }
}
function splitStoreSet(key, value) {
  try { localStorage.setItem((appRole||'solo') + '_' + key, value); } catch(e) {}
}

function applyStoredSplitSizes() {
  const root = document.documentElement;
  const portrait = splitStoreGet('radarPortraitSize', '65%');
  const landscape = splitStoreGet('controllerLandscapeSize', '28%');
  root.style.setProperty('--radar-portrait-size', portrait);
  root.style.setProperty('--controller-landscape-size', landscape);
  const splitter = $('layout-splitter');
  if (splitter) splitter.setAttribute('aria-orientation', isLandscapeLayout() ? 'vertical' : 'horizontal');
}

function initLayoutSplitter() {
  const splitter = $('layout-splitter'), workspace = $('radar-workspace');
  if (!splitter || !workspace) return;
  applyStoredSplitSizes();
  splitter.addEventListener('pointerdown', e => {
    e.preventDefault();
    splitter.setPointerCapture?.(e.pointerId);
    workspace.classList.add('is-resizing');
    const move = ev => {
      const rect = workspace.getBoundingClientRect();
      if (isLandscapeLayout()) {
        const panelPx = rect.right - ev.clientX;
        const minPanel = Math.min(Math.max(280, rect.width * .28), rect.width - 256);
        const minPx = Math.max(260, minPanel);
        const maxPx = Math.max(minPx, Math.min(rect.width * .44, rect.width - 256));
        const pct = Math.max(minPx, Math.min(maxPx, panelPx)) / rect.width * 100;
        const val = `${pct.toFixed(1)}%`;
        document.documentElement.style.setProperty('--controller-landscape-size', val);
        splitStoreSet('controllerLandscapeSize', val);
      } else {
        const radarPx = ev.clientY - rect.top;
        const minPx = Math.min(260, Math.max(160, rect.height * .34));
        const maxPx = Math.max(minPx, rect.height * .78);
        const pct = Math.max(minPx, Math.min(maxPx, radarPx)) / rect.height * 100;
        const val = `${pct.toFixed(1)}%`;
        document.documentElement.style.setProperty('--radar-portrait-size', val);
        splitStoreSet('radarPortraitSize', val);
      }
      resizeCanvas();
    };
    const up = ev => {
      splitter.releasePointerCapture?.(ev.pointerId);
      workspace.classList.remove('is-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      resizeCanvas();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function resizeCanvas() {
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * devicePixelRatio; canvas.height = r.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}
window.addEventListener('resize', () => { applyStoredSplitSizes(); resizeCanvas(); });

window.onload = () => {
function showToast(msg) {
  const el=$('radar-toast'); if(!el) return;
  el.textContent=msg; el.style.opacity='1'; el.classList.remove('hidden');
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.classList.add('hidden'),420); },3500);
}

function drawLoop() {
  const w = canvas.width/devicePixelRatio, h = canvas.height/devicePixelRatio;
  const R = Math.min(w,h)/2 - 12, zNM = getZoom(), pxNM = R/zNM;
  const cx = w/2 - panX*pxNM, cy = h/2 + panY*pxNM;

  ctx.fillStyle = '#020604'; ctx.fillRect(0,0,w,h);

  if (settings.showRings) {
    const cornerNM = (Math.sqrt(w*w+h*h)/2/R)*zNM;
    const maxNM = Math.max(200, Math.ceil(cornerNM/10)*10);
    for (let n=10; n<=maxNM; n+=10) {
      const rp = (n/zNM)*R;
      ctx.beginPath(); ctx.arc(cx,cy,rp,0,Math.PI*2);
      ctx.strokeStyle = n===60 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)';
      ctx.lineWidth   = n===60 ? 2.2 : 1.2; ctx.stroke();
      if (settings.showDistanceLabels) {
        ctx.fillStyle = n===60 ? 'rgba(255,255,255,.60)' : 'rgba(255,255,255,.25)';
        ctx.font='8px monospace'; ctx.fillText(`${n}NM`, cx+4, cy-rp+10);
      }
    }
  }

  if (settings.showAngleMarkers) {
    const reach = (100/zNM)*R;
    [270,90,0,180].forEach(deg => {
      const r = deg*Math.PI/180;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(r)*reach, cy+Math.sin(r)*reach);
      ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.lineWidth=1.2; ctx.stroke();
    });
  }

  {
    const ori = settings.rwyOrientation||300;
    const rwyRad = (ori-90)*Math.PI/180;
    const eclMag = (ori+180)%360, eclRad = (eclMag-90)*Math.PI/180;
    const halfL = (0.81/zNM)*R, halfW = Math.max((0.01215/zNM)*R, 1);
    const cosR=Math.cos(rwyRad), sinR=Math.sin(rwyRad), pCos=-sinR, pSin=cosR;
    const corners=[{a:1,b:1},{a:1,b:-1},{a:-1,b:-1},{a:-1,b:1}].map(({a,b})=>({
      x:cx+cosR*a*halfL+pCos*b*halfW, y:cy+sinR*a*halfL+pSin*b*halfW
    }));
    ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y);
    corners.slice(1).forEach(c=>ctx.lineTo(c.x,c.y)); ctx.closePath();
    ctx.fillStyle='rgba(255,255,255,.75)'; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.90)'; ctx.lineWidth=0.5; ctx.setLineDash([]); ctx.stroke();
    const cosE=Math.cos(eclRad), sinE=Math.sin(eclRad);
    const thPx=halfL, endPx=thPx+(25/zNM)*R;
    ctx.beginPath(); ctx.moveTo(cx+cosE*thPx,cy+sinE*thPx); ctx.lineTo(cx+cosE*endPx,cy+sinE*endPx);
    ctx.strokeStyle='rgba(255,255,255,.60)'; ctx.lineWidth=1.0; ctx.stroke();
    const tkPx=Math.max((0.35/zNM)*R,3), tpX=-sinE, tpY=cosE;
    for (let d=5; d<=25; d+=5) {
      const dp=thPx+(d/zNM)*R, mx=cx+cosE*dp, my=cy+sinE*dp;
      ctx.beginPath(); ctx.moveTo(mx-tpX*tkPx,my-tpY*tkPx); ctx.lineTo(mx+tpX*tkPx,my+tpY*tkPx);
      ctx.strokeStyle='rgba(255,255,255,.70)'; ctx.lineWidth=1.2; ctx.stroke();
    }
  }

  if (settings.showSweep) {
    if (isSimulationRunning) { radarAngle+=SWEEP_SPEED; if(radarAngle>=Math.PI*2) radarAngle-=Math.PI*2; }
    if (settings.showRings) {
      const cornerNM2=(Math.sqrt(w*w+h*h)/2/R)*zNM, maxNM=Math.max(200,Math.ceil(cornerNM2/10)*10);
      const span=Math.PI/4, t0=radarAngle-span;
      for (let n=10; n<=maxNM; n+=10) {
        const rp=(n/zNM)*R;
        for (let s=0; s<12; s++) {
          ctx.beginPath(); ctx.arc(cx,cy,rp, t0+(s/12)*span, t0+((s+1)/12)*span);
          const a = n===60 ? 0.18+0.65*(s/12) : 0.08+0.35*(s/12);
          ctx.strokeStyle=`rgba(255,255,255,${a})`; ctx.lineWidth=n===60?2.8:1.6; ctx.stroke();
        }
      }
    }
  }

  ctx.font='9px monospace';

  function drawPlusBlip(rx, ry, sz, color) {
    const arm = sz * 1.6, thick = Math.max(1.5, sz * 0.55);
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rx - arm, ry); ctx.lineTo(rx + arm, ry); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx, ry - arm); ctx.lineTo(rx, ry + arm); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawCrossBlip(rx, ry, sz, color) {
    const arm = sz * 1.5, thick = Math.max(1.5, sz * 0.55);
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rx - arm, ry - arm); ctx.lineTo(rx + arm, ry + arm); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + arm, ry - arm); ctx.lineTo(rx - arm, ry + arm); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  aircrafts.forEach(ac => {
    const rx=cx+(ac.x_nm/zNM)*R, ry=cy-(ac.y_nm/zNM)*R, sel=selectedAircraft===ac;
    const isPrimary = !hasSquawk(ac);
    const distNM = Math.sqrt(ac.x_nm**2 + ac.y_nm**2);
    const isBeyond60 = distNM > 60;
    const isFrozen = !!ac.frozen && appRole === 'instructor';
    const isHidden = !!ac.hiddenFromTrainee && appRole === 'instructor';
    const blipColor = isFrozen ? 'rgba(56,189,248,1)' : isHidden ? 'rgba(253,224,71,0.35)' : 'rgba(253,224,71,1)';
    const labelColor = isFrozen ? 'rgba(56,189,248,.90)' : isHidden ? 'rgba(253,224,71,0.35)' : 'rgba(253,224,71,.95)';

    if (ac.history?.length) {
      const dr = sel ? 1.4 : 1.2;
      const trail = ac.frozen
        ? ac.history
        : (settings.trailDots > 0 ? ac.history.slice(-settings.trailDots) : ac.history);
      const dotColor = isFrozen ? 'rgba(56,189,248,' : (isHidden ? 'rgba(253,224,71,0.2' : null);
      trail.forEach(h => {
        const hx=cx+(h.x/zNM)*R, hy=cy-(h.y/zNM)*R;
        ctx.beginPath(); ctx.arc(hx,hy,dr,0,Math.PI*2);
        if (dotColor) {
          ctx.fillStyle = dotColor + (h.turning ? '.70)' : '.45)');
        } else {
          ctx.fillStyle=h.turning?(sel?'rgba(34,211,238,.90)':'rgba(34,211,238,.60)'):(sel?'rgba(253,224,71,.75)':'rgba(253,224,71,.50)');
        }
        ctx.fill();
      });
    }

    const sq = sel ? 4.8 : 3.8;
    if (isPrimary) {
      drawPlusBlip(rx, ry, sq, blipColor);
    } else if (isBeyond60) {
      drawCrossBlip(rx, ry, sq, blipColor);
    } else {
      ctx.fillStyle = blipColor;
      ctx.fillRect(rx-sq, ry-sq, sq*2, sq*2);
    }

    if (isFrozen) {
      ctx.beginPath(); ctx.arc(rx, ry, sq + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56,189,248,0.75)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (isHidden) {
      const r2 = sq + 3;
      ctx.beginPath(); ctx.moveTo(rx - r2, ry - r2); ctx.lineTo(rx + r2, ry + r2);
      ctx.strokeStyle = 'rgba(148,163,184,0.7)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
    }

    if (settings.showLabels) {
      const geo = _labelGeometry(ac, rx, ry);
      const offset = labelOffsets[ac.id] || {x: 0, y: 0};
      const labelX = geo.lx + offset.x;

      if (isPrimary) {
        const primaryKeys = ['callsign', 'speed'];
        const visiblePrimary = primaryKeys.filter(k => {
          if (labelLines[k] === false) return false;
          const def = LABEL_LINE_DEFS.find(d => d.key === k);
          if (def?.traineeHidden && appRole === 'trainee') return false;
          return true;
        });
        const labelY = geo.ly + 9 + offset.y;
        if (offset.x !== 0 || offset.y !== 0) {
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(labelX, labelY);
          ctx.strokeStyle = 'rgba(253,224,71,.40)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
        ctx.fillStyle = labelColor;
        visiblePrimary.forEach((k, i) => {
          const text = k === 'callsign' ? ac.id : `N${Math.round(ac.speed)}`;
          ctx.fillText(text, labelX, labelY + i * 10);
        });
      } else {
        const visibleLines = _visibleLabelLines();
        const labelY = geo.ly + 9 + offset.y;
        if (offset.x !== 0 || offset.y !== 0) {
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(labelX, labelY);
          ctx.strokeStyle = 'rgba(253,224,71,.40)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
        const fl=Math.round(ac.altitude/100), flA=Math.round(ac.assignedAltitude/100);
        const trendChar = flA > fl ? '↑' : flA < fl ? '↓' : '=';
        const altLabel = fl !== flA
          ? `A${fl.toString().padStart(3,'0')}${trendChar}${flA.toString().padStart(3,'0')}`
          : `A${fl.toString().padStart(3,'0')}${trendChar}`;
        const altColour = flA > fl ? 'rgba(255,255,255,.95)' : flA < fl ? 'rgba(34,211,238,.95)' : labelColor;

        let lineIdx = 0;
        for (const key of visibleLines) {
          const baseY = labelY + lineIdx * 10;
          if (key === 'callsign') { ctx.fillStyle = labelColor; ctx.fillText(ac.id, labelX, baseY); }
          else if (key === 'squawk') { ctx.fillStyle = labelColor; ctx.fillText(fmtSquawk(ac.squawk), labelX, baseY); }
          else if (key === 'altitude') { ctx.fillStyle = altColour; ctx.fillText(altLabel, labelX, baseY); }
          else if (key === 'speed') { ctx.fillStyle = labelColor; ctx.fillText(`N${Math.round(ac.speed)}`, labelX, baseY); }
          else if (key === 'heading') { ctx.fillStyle = labelColor; ctx.fillText(`${Math.round(ac.heading).toString().padStart(3,'0')}°`, labelX, baseY); }
          lineIdx++;
        }
      }
    }

    if (sel && activeLineDisplay && appRole !== 'trainee') {
      const b=bearing(ac), lr=((90-b)*Math.PI/180);
      const lbl=activeLineDisplay==='bearing'?`B- ${b.toString().padStart(3,'0')}°`:`H- ${homing(b).toString().padStart(3,'0')}°`;
      const cr=Math.cos(lr), sr=-Math.sin(lr), cr2=Math.atan2(sr,cr);
      const ed=edgeDist(cr2,cx,cy,w,h);
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(cr2)*ed,cy+Math.sin(cr2)*ed);
      ctx.setLineDash([6,5]); ctx.strokeStyle='rgba(56,189,248,.80)'; ctx.lineWidth=1.5; ctx.stroke(); ctx.setLineDash([]);
      const ld=Math.max(30,ed-45), px=Math.cos(cr2-Math.PI/2)*16, py=Math.sin(cr2-Math.PI/2)*16;
      ctx.fillStyle='rgba(56,189,248,1)'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
      ctx.fillText(lbl, cx+Math.cos(cr2)*ld+px, cy+Math.sin(cr2)*ld+py); ctx.textAlign='start';
    }
  });

  if (appRole==='trainee' && traineeLineState.active && traineeLineState.bearing!=null) {
    const b=traineeLineState.bearing, lr=((90-b)*Math.PI/180);
    const lbl=traineeLineState.active==='bearing'?`B- ${b.toString().padStart(3,'0')}°`:`H- ${homing(b).toString().padStart(3,'0')}°`;
    const cr=Math.cos(lr), sr=-Math.sin(lr), cr2=Math.atan2(sr,cr);
    const ed=edgeDist(cr2,cx,cy,w,h);
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(cr2)*ed,cy+Math.sin(cr2)*ed);
    ctx.setLineDash([]); ctx.strokeStyle='rgba(255,255,255,.92)'; ctx.lineWidth=1.6; ctx.stroke();
    const ld=Math.max(30,ed-45), px=Math.cos(cr2-Math.PI/2)*18, py=Math.sin(cr2-Math.PI/2)*18;
    ctx.fillStyle='rgba(255,255,255,1)'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
    ctx.fillText(lbl, cx+Math.cos(cr2)*ld+px, cy+Math.sin(cr2)*ld+py); ctx.textAlign='start';
  }

  updateAircraftCards();
  requestAnimationFrame(drawLoop);
}

let _pendingSpawnPos = null;
