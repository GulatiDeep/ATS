// SRE PeerJS client that receives aircraft state from RADSIM host and renders mirrored aircraft
(function(){
    if (typeof Peer === 'undefined') {
        console.warn('PeerJS not loaded; SRE peer features disabled.');
        return;
    }

    // UI elements for connect
    function createConnectPanel() {
        // If the top-table cell already has the input/button (SRE Index.html), use that instead of creating a floating panel
        const existingInput = document.getElementById('hostPeerIdInput');
        const existingBtn = document.getElementById('hostConnectBtn');
        if (existingInput && existingBtn) {
            // attach uppercase enforcement and Enter-key connect/disconnect
            existingInput.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
            existingInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const id = existingInput.value.trim().toUpperCase();
                    if (isConnected) {
                        disconnectFromHost();
                    } else if (id) {
                        connectToHost(id);
                    }
                }
            });
            existingBtn.addEventListener('click', () => {
                const id = existingInput.value.trim().toUpperCase();
                if (isConnected) {
                    disconnectFromHost();
                } else if (id) {
                    connectToHost(id);
                }
            });
            updateConnectControls('disconnected');
            return; // done
        }

        let panel = document.getElementById('sreConnectPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'sreConnectPanel';
            panel.style.position = 'absolute';
            panel.style.top = '6px';
            panel.style.right = '6px';
            panel.style.zIndex = 1000;
            panel.style.background = 'rgba(0,0,0,0.6)';
            panel.style.color = 'white';
            panel.style.padding = '6px';
            panel.style.borderRadius = '6px';

            panel.innerHTML = `
                <label style="font-size:12px">Host Peer ID (UPPERCASE):</label>
                <input id="hostPeerIdInput" maxlength="3" style="width:140px; font-size:12px; text-transform:uppercase" />
                <button id="hostConnectBtn" style="font-size:12px">Connect</button>
                <span id="sreConnStatus" style="margin-left:8px; font-size:12px"></span>
            `;
            document.body.appendChild(panel);

            const hostInput = document.getElementById('hostPeerIdInput');
            // Force uppercase while typing
            hostInput.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
            hostInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const id = hostInput.value.trim().toUpperCase(); if (id) connectToHost(id); } });

            document.getElementById('hostConnectBtn').addEventListener('click', () => {
                const hostId = document.getElementById('hostPeerIdInput').value.trim().toUpperCase();
                if (hostId) connectToHost(hostId);
            });
        }
    }

    createConnectPanel();

    let isConnected = false;

    function updateConnectControls(state) {
        const hostInput = document.getElementById('hostPeerIdInput');
        const hostButton = document.getElementById('hostConnectBtn');
        if (!hostInput || !hostButton) return;

        if (state === 'connected') {
            hostInput.disabled = true;
            hostButton.textContent = '✖';
            hostButton.title = 'Disconnect';
            hostButton.disabled = false;
        } else if (state === 'connecting') {
            hostInput.disabled = true;
            hostButton.textContent = '⏳';
            hostButton.title = 'Connecting...';
            hostButton.disabled = true;
        } else {
            hostInput.disabled = false;
            hostButton.textContent = '🔗';
            hostButton.title = 'Connect';
            hostButton.disabled = false;
        }
    }

    function setSreStatus(connected, paused, message) {
        const exerciseStateEl = document.getElementById('exerciseStateTop');
        if (!exerciseStateEl) return;
        const statusSpan = document.getElementById('sreConnStatus');
        if (statusSpan) statusSpan.textContent = '';
        if (connected) {
            const icon = paused ? '⏸' : '✅';
            exerciseStateEl.textContent = `${icon} Connected: ${paused ? 'Paused' : 'Running'}`;
        } else {
            const icon = '⛔';
            exerciseStateEl.textContent = `${icon} ${message || 'Disconnected'}`;
        }
    }

    function setConnectionState(connected) {
        isConnected = connected;
        updateConnectControls(connected ? 'connected' : 'disconnected');
        if (!connected) {
            setSreStatus(false, false, 'Disconnected');
        }
    }

    setConnectionState(false);

    // Ensure label button toggles mirror labels by refreshing mirrors whenever label is clicked
    const labelBtn = document.getElementById('label');
    if (labelBtn) {
        labelBtn.addEventListener('click', () => {
            // Use a small timeout to allow global labelsVisible to be toggled by other handlers
            setTimeout(() => { refreshAllMirrors(); }, 10);
        });
    }

    let peer = null;
    let conn = null;
    const mirrors = new Map(); // id -> MirrorAircraft
    let _refreshScheduled = false;

    // Mirror aircraft class with expanded behavior to match RADSIM blips
    class MirrorAircraft {
        constructor(info) {
            this.id = info.id;
            this.callsign = info.callsign;
            this.ssr = info.ssr;
            this.heading = info.heading;
            this.speed = info.speed;
            this.altitude = info.altitude || 0;

            // Require logical coords (x,y) in domain units from host. Do NOT fallback to px/py.
            if (typeof info.x !== 'undefined' && typeof info.y !== 'undefined') {
                this.position = { x: info.x, y: info.y };
            } else {
                console.warn('MirrorAircraft created without logical x/y for id', this.id, '- this mirror will be placed at origin');
                this.position = { x: 0, y: 0 };
            }

            this.history = [];
            this.historyDots = [];
            this.rawPickupLines = [];
            this.speedVectorDots = [];
            this.currentSTCA = 'none';
            this.currentMSAW = 'none';
            this.targetAltitude = this.altitude;
            this.verticalClimbDescendRate = 0;

            // Create DOM elements mirroring RADSIM AircraftBlip structure
            this.element = document.createElement('div');
            this.element.className = 'aircraft-blip';
            this.element.style.position = 'absolute';
            this.element.style.zIndex = '2';

            this.emergencyCircle = document.createElement('div');
            this.emergencyCircle.className = 'emergency-circle';
            this.emergencyCircle.style.display = 'none';
            this.element.appendChild(this.emergencyCircle);

            this.stcaHalo = document.createElement('div');
            this.stcaHalo.className = 'stca-halo';
            this.stcaHalo.style.display = 'none';

            this.msawHalo = document.createElement('div');
            this.msawHalo.className = 'msaw-halo';
            this.msawHalo.style.display = 'none';

            this.label = document.createElement('div');
            this.label.className = 'aircraft-label';
            this.label.style.position = 'absolute';
            this.label.style.zIndex = '3';
            this.label.innerHTML = `${this.callsign}<br>3-${this.ssr}<br>A${Math.round(this.altitude/100)}<br>N${this.speed}`;

            this.line = document.createElement('div');
            this.line.className = 'aircraft-line';
            this.line.style.position = 'absolute';
            this.line.style.height = '1px';
            this.line.style.backgroundColor = 'grey';
            this.line.style.zIndex = '1';

            this.speedVectorLine = document.createElement('div');
            this.speedVectorLine.className = 'speed-vector-line';
            this.speedVectorLine.style.position = 'absolute';
            this.speedVectorLine.style.zIndex = '1';
            this.speedVectorLine.style.height = '1px';
            this.speedVectorLine.style.borderTop = '0.8px solid white';
            this.speedVectorLine.style.backgroundColor = 'white';
            this.speedVectorLine.style.transformOrigin = '0% 50%';
            this.speedVectorLine.style.display = 'none';

            // raw pickup lines
            for (let i=0;i<6;i++) {
                const line = document.createElement('div');
                line.className = `raw-pickup-line fade${i+1}`;
                this.rawPickupLines.push(line);
            }

            // Append to panContainer
            const pan = document.getElementById('panContainer');
            if (pan) {
                pan.appendChild(this.element);
                pan.appendChild(this.stcaHalo);
                pan.appendChild(this.msawHalo);
                pan.appendChild(this.label);
                pan.appendChild(this.line);
                pan.appendChild(this.speedVectorLine);
                this.rawPickupLines.forEach(l => pan.appendChild(l));
                this.element.setAttribute('data-blip-id', this.id);
            }

            // Default label offset and create history dots
            this.labelOffset = { x: 40, y: -40 };
            const dotCount = (typeof currentHistoryDotCount === 'number') ? currentHistoryDotCount : 20;
            for (let i=0;i<dotCount;i++) {
                const dot = document.createElement('div');
                dot.className = 'history-dot';
                dot.style.position = 'absolute';
                dot.style.zIndex = '1';
                this.historyDots.push(dot);
                if (pan) pan.appendChild(dot);
            }

            // enable dragging of labels if helper exists
            if (typeof dragElement === 'function') {
                try { dragElement(this.label, this); } catch(e) { /* ignore */ }
            }

            // Initial render
            this.updateFrom({ callsign: this.callsign, ssr: this.ssr, heading: this.heading, speed: this.speed, altitude: this.altitude });
        }

        updateFrom(info) {
            if (!info) return;
            this.callsign = info.callsign || this.callsign;
            this.ssr = info.ssr || this.ssr;
            this.heading = (typeof info.heading !== 'undefined') ? info.heading : this.heading;
            this.speed = (typeof info.speed !== 'undefined') ? info.speed : this.speed;
            this.altitude = (typeof info.altitude !== 'undefined') ? info.altitude : this.altitude;
            this.currentSTCA = (typeof info.stca !== 'undefined') ? info.stca : this.currentSTCA;
            this.currentMSAW = (typeof info.msaw !== 'undefined') ? info.msaw : this.currentMSAW;
            if (typeof info.targetAltitude !== 'undefined') this.targetAltitude = info.targetAltitude;
            if (typeof info.verticalClimbDescendRate !== 'undefined') this.verticalClimbDescendRate = info.verticalClimbDescendRate;

            // update logical position
            if (typeof info.x !== 'undefined' && typeof info.y !== 'undefined') {
                this.position.x = info.x;
                this.position.y = info.y;
            } else {
                // If host did not provide logical x/y, skip updating position to avoid inconsistent mapping
                console.warn('MirrorAircraft.updateFrom called without x/y for id', this.id);
            }

            // maintain history using host-provided history if available
            if (Array.isArray(info.history)) {
                this.history = info.history.slice();
                // Preserve a reasonable local buffer if the host sends more than expected
                if (this.history.length > 100) {
                    this.history = this.history.slice(-100);
                }
            } else {
                this.history.push({ x: this.position.x, y: this.position.y });
                if (this.history.length > this.historyDots.length) this.history.shift();
            }

            // compute screen coords with local zoom
            const blipSize = 6;
            const scopeCenterX = (window.radarCenter && window.radarCenter.x) ? window.radarCenter.x : (document.getElementById('radarScope').offsetWidth/2);
            const scopeCenterY = (window.radarCenter && window.radarCenter.y) ? window.radarCenter.y : (document.getElementById('radarScope').offsetHeight/2);
            const z = (typeof zoomLevel === 'number') ? zoomLevel : 1;
            const screenX = scopeCenterX + this.position.x * z;
            const screenY = scopeCenterY - this.position.y * z;

            this.element.style.left = `${screenX - blipSize/2}px`;
            this.element.style.top = `${screenY - blipSize/2}px`;

            this.label.style.left = `${this.element.offsetLeft + this.labelOffset.x}px`;
            this.label.style.top = `${this.element.offsetTop + this.labelOffset.y}px`;

            this.updateLabelInfo();
            this.updateColorBasedOnSSR();

            // Apply label visibility according to global labelsVisible (mirrors must follow host UI)
            try {
                const showLabels = (typeof labelsVisible === 'undefined') ? true : labelsVisible;
                this.label.style.display = showLabels ? 'block' : 'none';
                this.line.style.display = showLabels ? 'block' : 'none';
            } catch(e) { /* ignore */ }

            this.updateRawPickupLines();
            this.updateHistoryDots();
            this.updateSpeedVector();
            this.updateSTCA(info && info.stca);
            this.updateMSAW(info && info.msaw);

            this.updateLinePosition();
        }

        remove() {
            if (this.element && this.element.parentNode) this.element.parentNode.removeChild(this.element);
            if (this.label && this.label.parentNode) this.label.parentNode.removeChild(this.label);
            if (this.line && this.line.parentNode) this.line.parentNode.removeChild(this.line);
            if (this.speedVectorLine && this.speedVectorLine.parentNode) this.speedVectorLine.parentNode.removeChild(this.speedVectorLine);
            this.speedVectorDots.forEach(d => { if (d && d.parentNode) d.parentNode.removeChild(d); });
            this.speedVectorDots = [];
            this.historyDots.forEach(d => { if (d && d.parentNode) d.parentNode.removeChild(d); });
            this.rawPickupLines.forEach(l => { if (l && l.parentNode) l.parentNode.removeChild(l); });
            if (this.stcaHalo && this.stcaHalo.parentNode) this.stcaHalo.parentNode.removeChild(this.stcaHalo);
            if (this.msawHalo && this.msawHalo.parentNode) this.msawHalo.parentNode.removeChild(this.msawHalo);
        }

        updateRawPickupLines() {
            try {
                const count = this.rawPickupLines.length;
                const spacingNM = 0.25;
                const aheadNM = 0.5;
                const blipWidth = 8;

                const angleRad = (this.heading || 0) * Math.PI / 180;
                const baseX = this.position.x;
                const baseY = this.position.y;

                for (let i = 0; i < count; i++) {
                    const distance = (i === 0) ? aheadNM : -(i - 1) * spacingNM;
                    const echoX = baseX + Math.sin(angleRad) * distance;
                    const echoY = baseY + Math.cos(angleRad) * distance;
                    const screenX = (window.radarCenter ? window.radarCenter.x : (document.getElementById('radarScope').offsetWidth/2)) + echoX * (zoomLevel || 1);
                    const screenY = (window.radarCenter ? window.radarCenter.y : (document.getElementById('radarScope').offsetHeight/2)) - echoY * (zoomLevel || 1);

                    const line = this.rawPickupLines[i];
                    line.style.width = `${blipWidth}px`;
                    line.style.height = `1px`;
                    line.style.left = `${screenX - blipWidth/2}px`;
                    line.style.top = `${screenY}px`;
                    line.style.transform = `none`;
                }
            } catch(e) { console.warn('updateRawPickupLines failed', e); }
        }

        updateHistoryDots() {
            const scopeCenterX = radarCenter.x;
            const scopeCenterY = radarCenter.y;

            for (let i = 0; i < this.historyDots.length; i++) {
                const historyPos = this.history[this.history.length - this.historyDots.length + i];
                const dot = this.historyDots[i];
                if (dot && historyPos) {
                    const dotSize = 2;
                    dot.style.left = `${scopeCenterX + historyPos.x * zoomLevel - dotSize/2}px`;
                    dot.style.top = `${scopeCenterY - historyPos.y * zoomLevel - dotSize/2}px`;
                    dot.style.opacity = (i + 1) / this.historyDots.length;
                }
            }
        }

        updateSpeedVector() {
            try {
                this.speedVectorDots.forEach(d => d.remove());
                this.speedVectorDots = [];

                if (!this.speedVectorLine || !speedVectorMinutes) {
                    if (this.speedVectorLine) this.speedVectorLine.style.display = 'none';
                    return;
                }

                const speedNMps = this.speed / 3600;
                const headingRad = this.heading * Math.PI / 180;
                const startX = this.position.x;
                const startY = this.position.y;
                const x1 = radarCenter.x + startX * zoomLevel;
                const y1 = radarCenter.y - startY * zoomLevel;

                const finalX = startX + Math.sin(headingRad) * speedNMps * speedVectorMinutes * 60;
                const finalY = startY + Math.cos(headingRad) * speedNMps * speedVectorMinutes * 60;
                const x2 = radarCenter.x + finalX * zoomLevel;
                const y2 = radarCenter.y - finalY * zoomLevel;

                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                this.speedVectorLine.style.display = 'block';
                this.speedVectorLine.style.width = `${length}px`;
                this.speedVectorLine.style.left = `${x1}px`;
                this.speedVectorLine.style.top = `${y1}px`;
                this.speedVectorLine.style.transform = `rotate(${angle}deg)`;
                this.speedVectorLine.style.backgroundColor = 'white';

                const pan = document.getElementById('panContainer');
                for (let i=1;i<=speedVectorMinutes;i++) {
                    const t = i * 60;
                    const dotX = startX + Math.sin(headingRad) * speedNMps * t;
                    const dotY = startY + Math.cos(headingRad) * speedNMps * t;
                    const screenX = radarCenter.x + dotX * zoomLevel;
                    const screenY = radarCenter.y - dotY * zoomLevel;

                    const dot = document.createElement('div');
                    dot.className = 'speed-vector-dot';
                    dot.style.position = 'absolute';
                    dot.style.width = '4px';
                    dot.style.height = '4px';
                    dot.style.borderRadius = '50%';
                    dot.style.backgroundColor = 'lime';
                    dot.style.left = `${screenX - 2}px`;
                    dot.style.top = `${screenY - 2}px`;
                    dot.style.zIndex = '1';
                        if (pan) pan.appendChild(dot);
                    this.speedVectorDots.push(dot);
                }
            } catch(e){ console.warn('updateSpeedVector failed', e); }
        }

        updateSTCA(stcaState) {
            if (!this.stcaHalo) return;
            const enabled = (typeof stcaEnabled === 'undefined') ? true : stcaEnabled;
            if (!enabled) {
                this.stcaHalo.style.display = 'none';
                return;
            }

            if (stcaState && stcaState !== 'none') this.stcaHalo.style.display = 'block';
            else this.stcaHalo.style.display = 'none';

            const x = radarCenter.x + this.position.x * zoomLevel;
            const y = radarCenter.y - this.position.y * zoomLevel;
            this.stcaHalo.style.left = `${x}px`;
            this.stcaHalo.style.top = `${y}px`;
        }

        updateMSAW(msawState) {
            if (!this.msawHalo) return;
            const enabled = (typeof msawEnabled === 'undefined') ? true : msawEnabled;
            if (!enabled) {
                this.msawHalo.style.display = 'none';
                return;
            }

            if (msawState && msawState !== 'none') this.msawHalo.style.display = 'block';
            else this.msawHalo.style.display = 'none';

            const x = radarCenter.x + this.position.x * zoomLevel;
            const y = radarCenter.y - this.position.y * zoomLevel;
            this.msawHalo.style.left = `${x}px`;
            this.msawHalo.style.top = `${y}px`;
        }

        updateLinePosition() {
            try {
                const blipRect = this.element.getBoundingClientRect();
                const labelRect = this.label.getBoundingClientRect();

                const styleTransform = window.getComputedStyle(panContainer).transform;
                let panMatrix;
                try {
                    panMatrix = new DOMMatrix(styleTransform);
                } catch(e) {
                    try { panMatrix = new WebKitCSSMatrix(styleTransform); } catch(e2) { panMatrix = null; }
                }
                const panX = panMatrix ? (typeof panMatrix.m41 !== 'undefined' ? panMatrix.m41 : (typeof panMatrix.e !== 'undefined' ? panMatrix.e : 0)) : 0;
                const panY = panMatrix ? (typeof panMatrix.m42 !== 'undefined' ? panMatrix.m42 : (typeof panMatrix.f !== 'undefined' ? panMatrix.f : 0)) : 0;

                const blipCenterX = blipRect.left + blipRect.width/2 - panX;
                const blipCenterY = blipRect.top + blipRect.height/2 - panY;

                const labelCorners = [
                    { x: labelRect.left - panX, y: labelRect.top - panY },
                    { x: labelRect.right - panX, y: labelRect.top - panY },
                    { x: labelRect.left - panX, y: labelRect.bottom - panY },
                    { x: labelRect.right - panX, y: labelRect.bottom - panY }
                ];

                const labelEdges = [
                    { x: (labelRect.left + labelRect.right)/2 - panX, y: labelRect.top - panY },
                    { x: (labelRect.left + labelRect.right)/2 - panX, y: labelRect.bottom - panY },
                    { x: labelRect.left - panX, y: (labelRect.top + labelRect.bottom)/2 - panY },
                    { x: labelRect.right - panX, y: (labelRect.top + labelRect.bottom)/2 - panY }
                ];

                const labelPoints = [...labelCorners, ...labelEdges];

                let nearestPoint = labelPoints[0];
                let minDistance = Infinity;
                for (const p of labelPoints) {
                    const d = Math.sqrt(Math.pow(p.x - blipCenterX,2) + Math.pow(p.y - blipCenterY,2));
                    if (d < minDistance) { minDistance = d; nearestPoint = p; }
                }

                const deltaX = nearestPoint.x - blipCenterX;
                const deltaY = nearestPoint.y - blipCenterY;
                const lineLength = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
                const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;

                this.line.style.width = `${lineLength}px`;
                this.line.style.left = `${blipCenterX}px`;
                this.line.style.top = `${blipCenterY}px`;
                this.line.style.transform = `rotate(${angle}deg)`;
                this.line.style.zIndex = '1';
                this.label.style.zIndex = '3';
            } catch(e) { console.warn('updateLinePosition failed', e); }
        }

        updateLabelInfo() {
            // similar to aircraft.js logic
            const rawLevel = Math.round(this.altitude / 100);
            const isAboveTL = this.altitude >= (transitionLevel * 100);
            const level = isAboveTL ? `F${rawLevel}` : `A${rawLevel}`;
            const speed = this.speed;
            let arrow = '';
            if (this.altitude < this.targetAltitude) arrow = '↑';
            else if (this.altitude > this.targetAltitude) arrow = '↓';

            let mappedCallsign = ssrToCallsignMap[this.ssr] || null;
            if (!mappedCallsign && this.ssr === '0000') mappedCallsign = primarySSRMapping[this.id];

            let labelContent = '';
            if (mappedCallsign) labelContent += `<strong>${mappedCallsign}</strong><br>`;
            if (this.ssr !== '0000') labelContent += `3-${this.ssr}<br>`;
            if (this.ssr !== '0000') labelContent += `${level} ${arrow}<br>N${speed}`;
            else labelContent += `N${speed}`;

            const stcaEnabledLocal = (typeof stcaEnabled === 'undefined') ? true : stcaEnabled;
            const msawEnabledLocal = (typeof msawEnabled === 'undefined') ? true : msawEnabled;

            if (stcaEnabledLocal) {
                if (this.currentSTCA === 'predicted') labelContent += `<br><span style="color: yellow;">PRED STCA</span>`;
                else if (this.currentSTCA === 'actual') labelContent += `<br><span style="color: red;">ACT STCA</span>`;
            }

            if (msawEnabledLocal) {
                if (this.currentMSAW === 'predicted') labelContent += `<br><span style="color: yellow;">PRED MSAW</span>`;
                else if (this.currentMSAW === 'actual') labelContent += `<br><span style="color: red;">ACT MSAW</span>`;
            }

            this.label.innerHTML = labelContent;
        }

        updateColorBasedOnSSR() {
            const isEmergencySSR = ['7500','7600','7700'].includes(this.ssr);
            const isMappedSSR = ssrToCallsignMap[this.ssr] !== undefined;
            const isMappedPrimary = (this.ssr === '0000' && primarySSRMapping[this.id] !== undefined);

            this.element.classList.remove('red','hotpink','yellow');

            if (isEmergencySSR) {
                this.label.style.color = 'red';
                this.line.style.backgroundColor = 'red';
                this.element.style.backgroundColor = 'red';
                this.historyDots.forEach(dot => dot.style.backgroundColor = 'red');
                this.emergencyCircle.style.display = 'block';
                if (this.element.classList.contains('cross-sign') || this.element.classList.contains('plus-sign')) this.element.classList.add('red');
            } else if (isMappedSSR || isMappedPrimary) {
                this.label.style.color = 'hotpink';
                this.line.style.backgroundColor = 'hotpink';
                this.element.style.backgroundColor = 'hotpink';
                this.historyDots.forEach(dot => dot.style.backgroundColor = 'hotpink');
                this.emergencyCircle.style.display = 'none';
                if (this.element.classList.contains('cross-sign') || this.element.classList.contains('plus-sign')) this.element.classList.add('hotpink');
            } else {
                this.label.style.color = 'yellow';
                this.line.style.backgroundColor = 'yellow';
                this.element.style.backgroundColor = 'yellow';
                this.historyDots.forEach(dot => dot.style.backgroundColor = 'yellow');
                this.emergencyCircle.style.display = 'none';
                if (this.element.classList.contains('cross-sign') || this.element.classList.contains('plus-sign')) this.element.classList.add('yellow');
            }
        }
    }

    function connectToHost(hostId) {
        if (conn) {
            try { conn.close(); } catch(e){}
            conn = null;
        }

        updateConnectControls('connecting');

        if (!peer) peer = new Peer();

        const startConnection = (id) => {
            console.log('SRE peer open id', id);
            setSreStatus(false, false, 'Connecting...');

            conn = peer.connect(hostId, { reliable: true });

            conn.on('open', () => {
                console.log('Connected to host', hostId);
                setConnectionState(true);
                setSreStatus(true, false, 'Connected...');
                // Request full state
                conn.send({ type: 'requestFull' });

                // Try to enter fullscreen for better viewing (may be blocked by browser if not in user gesture)
                try {
                    const el = document.documentElement;
                    if (el.requestFullscreen) el.requestFullscreen();
                    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
                    else if (el.msRequestFullscreen) el.msRequestFullscreen();
                } catch (e) { /* ignore */ }
            });

            conn.on('data', (msg) => {
                try {
                    console.log('SRE received message', msg && msg.type);
                    if (!msg || !msg.type) return;
                    if (msg.type === 'hostClosing') {
                        setSreStatus(false, false, 'Instructor Closed');
                        return;
                    }
                    if (msg.type === 'fullState' || msg.type === 'state') {
                        const state = msg.payload;
                        console.log('SRE state aircraft count', state && state.aircraft ? state.aircraft.length : 0);
                        const displayEl = document.getElementById('aircraftCountDisplay');
                        if (displayEl) displayEl.textContent = 'Total Aircraft: ' + (state && state.aircraft ? state.aircraft.length : 0);
                        const paused = state && typeof state.paused !== 'undefined' && state.paused;
                        // Mirror paused state locally so sweep and movement obey host paused flag
                        try {
                            if (typeof isPaused !== 'undefined') {
                                isPaused = !!paused; // update local lexical variable (declared in aircraft.js)
                            } else {
                                window.isPaused = !!paused; // fallback to window property
                            }
                        } catch(e) { try { window.isPaused = !!paused; } catch(e2) { /* ignore */ } }
                        setSreStatus(true, paused);
                        syncState(state);
                    }
                } catch(e) { console.error(e); }
            });

            conn.on('close', () => {
                console.log('Disconnected from host');
                setConnectionState(false);
                setSreStatus(false, false, 'Disconnected');
            });

            conn.on('error', (err) => {
                console.warn('Conn error', err);
                setConnectionState(false);
                setSreStatus(false, false, 'Error');
            });
        };

        if (peer.open) {
            startConnection(peer.id);
        } else {
            peer.once('open', startConnection);
        }
    }

    function disconnectFromHost() {
        if (conn) {
            try { conn.close(); } catch (e) { }
            conn = null;
        }
        setConnectionState(false);
    }

    function syncState(state) {
        if (!state || !state.aircraft) return;

        if (state.runway) {
            try {
                applyHostRunwayState(state.runway);
                if (typeof drawRunway === 'function') drawRunway();
                if (typeof updateSreRunwayStatus === 'function') updateSreRunwayStatus();
            } catch (e) {
                console.warn('Unable to apply mirrored runway state:', e);
            }
        }

        const incoming = new Set();
        state.aircraft.forEach(a => {
            // Only accept aircraft payloads that include logical x and y coordinates
            if (typeof a.x === 'undefined' || typeof a.y === 'undefined') {
                console.warn('sre-p2p-client: ignoring aircraft without logical x/y', a && a.id);
                return; // skip this aircraft
            }

            incoming.add(a.id);
            if (mirrors.has(a.id)) {
                mirrors.get(a.id).updateFrom(a);
            } else {
                const m = new MirrorAircraft(a);
                mirrors.set(a.id, m);
                m.updateFrom(a);
            }
        });

        // remove mirrors not present
        Array.from(mirrors.keys()).forEach(id => {
            if (!incoming.has(id)) {
                const m = mirrors.get(id);
                m.remove();
                mirrors.delete(id);
            }
        });
    }

    // Refresh all mirrors immediately (useful when local zoom/pan changes)
    function rebuildMirrorHistoryDots() {
        const pan = document.getElementById('panContainer');
        mirrors.forEach((m) => {
            if (Array.isArray(m.historyDots)) {
                m.historyDots.forEach(dot => { if (dot && dot.parentNode) dot.parentNode.removeChild(dot); });
            }
            m.historyDots = [];
            for (let i = 0; i < currentHistoryDotCount; i++) {
                const dot = document.createElement('div');
                dot.className = 'history-dot';
                dot.style.position = 'absolute';
                dot.style.zIndex = '1';
                m.historyDots.push(dot);
                if (pan) pan.appendChild(dot);
            }
            try { if (typeof m.updateHistoryDots === 'function') m.updateHistoryDots(); } catch (e) { /* ignore */ }
        });
    }

    function refreshAllMirrors() {
        if (_refreshScheduled) return;
        _refreshScheduled = true;
        requestAnimationFrame(() => {
            mirrors.forEach((m) => {
                // call updateFrom with current stored logical position so it re-renders with local zoomLevel
                m.updateFrom({ x: m.position.x, y: m.position.y, heading: m.heading, speed: m.speed, altitude: m.altitude, ssr: m.ssr, callsign: m.callsign, stca: m.currentSTCA, msaw: m.currentMSAW });
            });
            _refreshScheduled = false;
        });
    }

    // Hook zoom controls to refresh immediately and listen for pan/zoom events from radar.js
    const zoomSliderEl = document.getElementById('zoomSlider');
    if (zoomSliderEl) {
        zoomSliderEl.addEventListener('input', () => {
            // zoomLevel is updated by radar.js; just refresh mirrors
            refreshAllMirrors();
        });
        zoomSliderEl.addEventListener('change', () => { refreshAllMirrors(); });
    }
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => refreshAllMirrors());
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => refreshAllMirrors());

    // Listen to pan/zoom dispatched events from radar.js for immediate, smooth re-positioning
    try {
        window.addEventListener('radar-transform', () => { refreshAllMirrors(); });
        window.addEventListener('radar-zoom', () => { refreshAllMirrors(); });
    } catch(e) { /* ignore if not supported */ }

    // Expose connect for debugging
    window._sreClient = { connectToHost, refreshAllMirrors, applyHistoryDotCount: rebuildMirrorHistoryDots };
})();