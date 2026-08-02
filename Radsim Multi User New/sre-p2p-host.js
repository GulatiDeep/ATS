// Host broadcaster for SRE viewers using PeerJS
// Uses global aircraftBlips array and updateInterval from aircraft.js
(function(){
    // Ensure PeerJS is available
    if (typeof Peer === 'undefined') {
        console.warn('PeerJS not loaded; peer features disabled.');
        return;
    }

    const hostPanelId = 'hostPeerPanel';
    const hostPeerIdEl = document.getElementById('hostPeerId');
    const hostPeerIdTopEl = document.getElementById('hostPeerIdTop');
    const viewersCountEl = document.getElementById('hostViewersCount');
    const viewersCountTopEl = document.getElementById('hostViewersCountTop');

    // Create Peer with a short 3-char alphanumeric id for easier typing
    let peer = null;
    const connections = new Map(); // peerId -> DataConnection

    function randomShortId() {
            // Uppercase only alphanumeric for easier typing and consistency
            const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let s = '';
            for (let i=0;i<3;i++) s += chars[Math.floor(Math.random()*chars.length)];
            return s;
        }

    function setupPeerEventHandlers(p) {
        p.on('open', (id) => {
            console.log('PeerJS host ready. Peer ID:', id);
            if (hostPeerIdEl) hostPeerIdEl.textContent = id;
            if (hostPeerIdTopEl) hostPeerIdTopEl.textContent = id;
        });

        p.on('connection', (conn) => {
            console.log('Viewer connected (pending open):', conn.peer);
            connections.set(conn.peer, conn);
            updateViewersCount();

            // When connection is open, send full state
            if (conn.open) {
                sendFullStateTo(conn);
            } else {
                conn.on('open', () => {
                    console.log('Connection opened for', conn.peer);
                    try { sendFullStateTo(conn); } catch(e) { console.warn('Error sending full state on open', conn.peer, e); }
                });
            }

            conn.on('data', (data) => {
                // Handle requests from client
                try {
                    if (data && data.type === 'requestFull') {
                        if (conn.open) sendFullStateTo(conn);
                        else console.warn('RequestFull received but connection not open for', conn.peer);
                    }
                } catch (e) { console.error(e); }
            });

            conn.on('close', () => {
                console.log('Viewer disconnected:', conn.peer);
                connections.delete(conn.peer);
                updateViewersCount();
            });

            conn.on('error', (err) => {
                console.warn('Connection error for', conn.peer, err);
            });

        });

        p.on('error', (err) => {
            console.warn('Peer error:', err);
        });
    }

    // Try creating a peer with a short id, retry a few times on failure
    (function createPeerWithShortId(attemptsLeft=5){
        const id = randomShortId();
        try {
            peer = new Peer(id);
            setupPeerEventHandlers(peer);

            // If peer emits an error like ID taken, the 'error' handler will catch it; attempt recovery
            peer.on('error', (err) => {
                console.warn('Peer creation error for id', id, err);
                try { peer.destroy(); } catch(e) {}
                if (attemptsLeft > 0) {
                    console.log('Retrying with a new short id, attempts left:', attemptsLeft-1);
                    createPeerWithShortId(attemptsLeft-1);
                } else {
                    console.log('Falling back to auto-generated Peer ID (no id passed).');
                    peer = new Peer();
                    setupPeerEventHandlers(peer);
                }
            });
        } catch(e) {
            console.warn('Failed to create Peer with id', id, e);
            if (attemptsLeft > 0) createPeerWithShortId(attemptsLeft-1);
            else { peer = new Peer(); setupPeerEventHandlers(peer); }
        }
    })();

    function updateViewersCount() {
        if (viewersCountEl) viewersCountEl.textContent = connections.size;
        if (viewersCountTopEl) viewersCountTopEl.textContent = connections.size;
    }

    function sendFullStateTo(conn) {
        const payload = gatherFullState();
        try { conn.send({ type: 'fullState', payload }); }
        catch(e){ console.warn('Failed to send fullState to', conn.peer, e); }
    }

    function broadcastState() {
        const payload = gatherFullState();
        const message = { type: 'state', payload };
        connections.forEach((conn) => {
            try {
                if (conn.open) conn.send(message);
            }
            catch(e) { console.warn('Failed to send state to', conn.peer, e); }
        });
    }

    function gatherFullState() {
        // Try to read aircraft array from page scope. aircraftBlips may be declared with 'let' and not on window.
        const sourceArr = (typeof aircraftBlips !== 'undefined') ? aircraftBlips : (window.aircraftBlips || []);
        if (!sourceArr || sourceArr.length === 0) {
            console.debug('gatherFullState: no aircraft found in aircraftBlips (length=' + (sourceArr ? sourceArr.length : 0) + ')');
        }

        // Aggregate aircraft state into compact form
        const hostZoom = (typeof window.zoomLevel === 'number') ? window.zoomLevel : 1;
        const now = Date.now();
        const arr = sourceArr.map(b => {
            // logical coordinates (domain units) if available
            const lx = (b.position && (b.position.x !== undefined)) ? b.position.x : null;
            const ly = (b.position && (b.position.y !== undefined)) ? b.position.y : null;
            // compute pixel positions consistent with updateBlipPosition() for backwards compatibility
            const px = (lx !== null) ? (lx * hostZoom) : ((b.px !== undefined) ? b.px : 0);
            const py = (ly !== null) ? (ly * hostZoom) : ((b.py !== undefined) ? b.py : 0);
            return {
                id: b.id,
                callsign: b.callsign,
                // Prefer logical coordinates; keep px/py for backward compatibility
                x: lx,
                y: ly,
                px: px,
                py: py,
                hostZoom: hostZoom,
                heading: b.heading,
                speed: b.speed,
                altitude: b.altitude,
                targetAltitude: b.targetAltitude,
                verticalClimbDescendRate: b.verticalClimbDescendRate,
                ssr: b.ssrCode,
                role: b.role,
                formationSize: b.formationSize,
                stca: b.currentSTCA || 'none',
                msaw: b.currentMSAW || 'none',
                timestamp: now,
                history: Array.isArray(b.history) ? b.history.slice() : []
            };
        });
        let runwayState = null;
        if (typeof window.getRunwayStateFromInputs === 'function') {
            try {
                runwayState = window.getRunwayStateFromInputs();
            } catch (e) {
                console.warn('Unable to read runway state for broadcast:', e);
            }
        } else if (window.runwayState) {
            runwayState = window.runwayState;
        }

        console.log('gatherFullState: returning', arr.length, 'aircraft @', now, 'paused=', (typeof isPaused !== 'undefined' ? isPaused : false));
        return { timestamp: now, paused: (typeof isPaused !== 'undefined') ? isPaused : false, runway: runwayState, aircraft: arr };
    }

    // Broadcast periodically to SRE viewers every 4 seconds, independent of RADSIM movement physics
    const intervalMs = (typeof window.sreBroadcastInterval === 'number') ? window.sreBroadcastInterval : 4000;
    setInterval(broadcastState, intervalMs);

    // Notify viewers if the host page closes or reloads
    window.addEventListener('beforeunload', () => {
        connections.forEach((conn) => {
            try {
                if (conn.open) conn.send({ type: 'hostClosing' });
            } catch (e) { }
        });
    });

    // Expose for debugging and allow immediate state pushes from host UI
    window._sreHost = { peer, connections, gatherFullState, broadcastState };
})();