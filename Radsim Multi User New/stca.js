// Enable or disable STCA globally
let stcaEnabled = false;

// Sets to track current conflict pairs
const predictedConflicts = new Set();
const actualConflicts = new Set();


// Separation criteria (STCA thresholds)
let horizontalSeparationNM = 8;      // in nautical miles
let verticalSeparationFT = 1000;     // in feet
let lookaheadSecondsSTCA = 120;          // seconds into the future for conflict prediction


/**
 * Predicts the future position and altitude of an aircraft blip after a given number of seconds.
 * This is used for STCA predicted conflict detection.
 *
 * @param {Object} blip - The aircraft blip object containing position, speed, heading, altitude etc.
 * @param {number} seconds - How many seconds into the future to predict the position for.
 * @returns {Object} Predicted position and altitude at the given future time.
 */
function predictPosition(blip, seconds) {
    // Convert aircraft's speed from knots to nautical miles per second
    const speedNMps = blip.speed / 3600;

    // Convert vertical climb/descent rate from feet per minute to feet per second
    const verticalRateFps = (blip.verticalClimbDescendRate || 0) / 60;

    // Convert heading from degrees to radians (for trigonometric calculations)
    const headingRad = blip.heading * Math.PI / 180;

    // Determine climb direction:
    // +1 if climbing towards targetAltitude
    // -1 if descending towards targetAltitude
    // 0 if already at targetAltitude
    const climbDir = (blip.targetAltitude > blip.altitude) ? 1 : (blip.targetAltitude < blip.altitude ? -1 : 0);

    // Calculate predicted altitude after 'seconds' seconds based on climbDir and vertical rate
    const predictedAltitude = blip.altitude + climbDir * verticalRateFps * seconds;

    // Calculate predicted X and Y positions based on heading and speed
    return {
        x: blip.position.x + Math.sin(headingRad) * speedNMps * seconds, // displacement along X-axis
        y: blip.position.y + Math.cos(headingRad) * speedNMps * seconds, // displacement along Y-axis
        altitude: predictedAltitude  // predicted altitude at the future time
    };
}



/**
 * Checks for predicted conflicts between every unique pair of aircraft at a specific future time 't'.
 *
 * Uses precomputed predicted positions from the positionCache.
 *
 * @param {number} t - The future time (in seconds) at which to check for conflicts.
 * @param {Object} positionCache - A nested object mapping callsigns to predicted positions by time.
 * @returns {Array} An array of conflict pairs (objects containing { a, b }).
 */
function checkPredictedConflictsAtTime(t, positionCache) {
    const conflictsAtTime = []; // List to store detected conflict pairs at this time

    // Loop through every unique aircraft pair (no repeats)
    for (let i = 0; i < aircraftBlips.length; i++) {
        for (let j = i + 1; j < aircraftBlips.length; j++) {
            const a = aircraftBlips[i];
            const b = aircraftBlips[j];

            // Get cached predicted positions at time 't' for both aircraft
            const posA = positionCache[a.callsign][t];
            const posB = positionCache[b.callsign][t];

            // Calculate horizontal distance between the two positions (Pythagoras)
            const dx = posA.x - posB.x;
            const dy = posA.y - posB.y;
            const horizontalDistance = Math.sqrt(dx * dx + dy * dy);

            // Calculate vertical distance (altitude difference)
            const verticalDistance = Math.abs(posA.altitude - posB.altitude);

            // Check if both horizontal and vertical separation minima are breached
            if (horizontalDistance < horizontalSeparationNM && verticalDistance < verticalSeparationFT) {
                // If conflict detected, store this pair in the result array
                conflictsAtTime.push({ a, b });
            }
        }
    }

    // Return the list of conflict pairs for this prediction time
    return conflictsAtTime;
}


/**
 * Checks whether two aircraft are currently in actual conflict (right now).
 *
 * Uses current live positions and altitudes to determine if separation minima are violated.
 *
 * @param {Object} a - First aircraft blip.
 * @param {Object} b - Second aircraft blip.
 * @returns {boolean} True if actual conflict exists, false otherwise.
 */
function checkActualConflict(a, b) {
    // Calculate horizontal distance (Pythagoras)
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    const horizontalDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate vertical distance (altitude difference)
    const dz = a.altitude - b.altitude;
    const verticalDistance = Math.abs(dz);

    // Return true if both horizontal and vertical separation minima are violated
    return horizontalDistance < horizontalSeparationNM && verticalDistance < verticalSeparationFT;
}



/**
 * Calculates conflict details between two aircraft:
 * - Current range (distance)
 * - Bearing from one to the other
 * - Time to Closest Point of Approach (CPA)
 * 
 * @param {Object} a - First aircraft blip.
 * @param {Object} b - Second aircraft blip.
 * @returns {Object} Conflict metrics: range (NM), bearing (degrees), CPA time (seconds)
 */
function calculateConflictDetails(a, b) {
    // Convert headings from degrees to radians for trigonometric calculations
    const radA = a.heading * Math.PI / 180;
    const radB = b.heading * Math.PI / 180;

    // Calculate position difference (in nautical miles)
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;

    // Calculate velocity components (in NM/sec) for both aircraft
    const vxA = (a.speed / 3600) * Math.sin(radA);
    const vyA = (a.speed / 3600) * Math.cos(radA);
    const vxB = (b.speed / 3600) * Math.sin(radB);
    const vyB = (b.speed / 3600) * Math.cos(radB);

    // Calculate relative velocity components
    const dvx = vxB - vxA;
    const dvy = vyB - vyA;

    // Compute current horizontal distance (range) between aircraft (Pythagoras)
    const range = Math.sqrt(dx * dx + dy * dy);

    // Compute bearing from aircraft A to B (0-360°)
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

    // Compute relative speed squared
    const relativeSpeedSq = dvx * dvx + dvy * dvy;

    // Initialize time to CPA (seconds)
    let cpaTime = 0;

    // If aircraft are moving relative to each other, calculate CPA time
    if (relativeSpeedSq > 0) {
        // Compute dot product of position difference and relative velocity
        const dot = dx * dvx + dy * dvy;

        // Calculate time to CPA
        cpaTime = -dot / relativeSpeedSq;

        // If CPA is in the past, set it to 0 (meaning now)
        if (cpaTime < 0) cpaTime = 0;
    }

    // Predict positions of both aircraft at CPA time
    const axCPA = a.position.x + vxA * cpaTime;
    const ayCPA = a.position.y + vyA * cpaTime;
    const bxCPA = b.position.x + vxB * cpaTime;
    const byCPA = b.position.y + vyB * cpaTime;

    // Calculate distance between them at CPA
    const cpaDistance = Math.hypot(axCPA - bxCPA, ayCPA - byCPA);

    // Return conflict details: current range, bearing, and time to CPA
    return {
        range: range.toFixed(1),                 // 1 decimal precision
        bearing: Math.round(bearing),            // Rounded bearing in degrees
        cpaTime: `${Math.round(cpaTime)} seconds` // Time to CPA, rounded to nearest second
    };
}


/**
 * Activates a predicted STCA (Short Term Conflict Alert) for a pair of aircraft.
 * 
 * Displays a yellow halo around both blips if not already showing an actual conflict.
 * Updates the blip’s label info to reflect the STCA state.
 * 
 * @param {Object} a - First aircraft blip.
 * @param {Object} b - Second aircraft blip.
 */
function triggerPredictedSTCA(a, b) {
    [a, b].forEach(blip => {
        // Only trigger predicted STCA if it isn't already flagged as an actual conflict
        if (blip.currentSTCA !== 'actual' && blip.stcaHalo) {
            blip.stcaHalo.style.display = 'block';
            blip.stcaHalo.style.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // Yellow halo for predicted conflict
            blip.currentSTCA = 'predicted'; // Update state
            blip.updateLabelInfo();         // Refresh label with STCA status
            playBeepSound();
        }
    });
}


/**
 * Activates an actual STCA (Short Term Conflict Alert) for a pair of aircraft.
 * 
 * Displays a red halo around both blips, giving it precedence over any predicted conflicts.
 * Updates the blip’s label info to reflect the STCA state.
 * 
 * @param {Object} a - First aircraft blip.
 * @param {Object} b - Second aircraft blip.
 */
function triggerActualSTCA(a, b) {
    [a, b].forEach(blip => {
        if (blip.stcaHalo) {
            blip.stcaHalo.style.display = 'block';
            blip.stcaHalo.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Red halo for actual conflict
            blip.currentSTCA = 'actual'; // Update state (takes precedence)
            blip.updateLabelInfo();      // Refresh label with STCA status
            playBeepSound(); //play an alert sound for all actual STCA
        }
    });
}


/**
 * Draws visual conflict lines on the STCA radar canvas.
 * 
 * - Yellow solid lines for predicted conflicts.
 * - Red solid lines for actual conflicts.
 */
function drawSTCALines() {
    // Get the canvas element used for drawing STCA lines
    const canvas = document.getElementById("stcaCanvas");
    if (!canvas) return; // Exit if canvas is not found

    const ctx = canvas.getContext("2d");

    // Clear the entire canvas before redrawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ======================
    // Draw predicted conflicts
    // ======================
    predictedConflicts.forEach(key => {
        // Split the conflict key into two callsigns
        const [c1, c2] = key.split("|");

        // Find the two blips (aircraft) by their callsigns
        const blip1 = aircraftBlips.find(b => b.callsign === c1);
        const blip2 = aircraftBlips.find(b => b.callsign === c2);
        if (!blip1 || !blip2) return; // Skip if either blip is missing

        // Convert blip positions to canvas coordinates
        const x1 = radarCenter.x + blip1.position.x * zoomLevel;
        const y1 = radarCenter.y - blip1.position.y * zoomLevel;
        const x2 = radarCenter.x + blip2.position.x * zoomLevel;
        const y2 = radarCenter.y - blip2.position.y * zoomLevel;

        // Draw yellow line between the two aircraft
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]); // solid line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });

    // ===================
    // Draw actual conflicts
    // ===================
    actualConflicts.forEach(key => {
        // Split the conflict key into two callsigns
        const [c1, c2] = key.split("|");

        // Find the two blips (aircraft) by their callsigns
        const blip1 = aircraftBlips.find(b => b.callsign === c1);
        const blip2 = aircraftBlips.find(b => b.callsign === c2);
        if (!blip1 || !blip2) return; // Skip if either blip is missing

        // Convert blip positions to canvas coordinates
        const x1 = radarCenter.x + blip1.position.x * zoomLevel;
        const y1 = radarCenter.y - blip1.position.y * zoomLevel;
        const x2 = radarCenter.x + blip2.position.x * zoomLevel;
        const y2 = radarCenter.y - blip2.position.y * zoomLevel;

        // Draw red line between the two aircraft
        ctx.strokeStyle = "red";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]); // solid line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });
}


/**
 * Updates or creates an entry in the STCA Roaster display for a conflict pair.
 * 
 * Displays conflict type (predicted/actual), callsigns involved, current range, bearing, and CPA time.
 *
 * @param {string} key - Unique conflict key in the form "CALLSIGN1|CALLSIGN2"
 * @param {string} type - 'predicted' or 'actual'
 * @param {Object} a - First aircraft blip
 * @param {Object} b - Second aircraft blip
 */


// Unified Roaster Update Function
// Track last alert type per key (outside function)
const lastSTCATypeMap = new Map();


function updateRoaster(key, type, a, b) {
    const box = document.getElementById("alertRoasterBox");
    const id = `roaster-${key.replace("|", "-")}`;
    let entry = document.getElementById(id);

    const prevType = lastSTCATypeMap.get(key);
    if (prevType === "actual" || type === "actual") {
        lastSTCATypeMap.set(key, "actual");
        type = "actual";
    }

    const { range, bearing, cpaTime } = calculateConflictDetails(a, b);
    const isInhibitedNow = isInhibited(key);
    const newText = `${type === "actual" ? "Actual STCA" : "Predicted STCA"}: ${a.callsign} ↔ ${b.callsign} | ${range} NM / ${bearing}° | CPA in ${cpaTime}`;
    const newClass = `roaster-entry ${isInhibitedNow ? "roaster-blue" : (type === "actual" ? "roaster-red" : "roaster-yellow")}`;

    if (!entry) {
        entry = document.createElement("div");
        entry.id = id;
        entry.textContent = newText;
        entry.className = newClass;
        entry.ondblclick = () => {
            if (!isInhibited(key)) {
                inhibitedAlerts.set(key, Date.now() + 60000);
                clearSTCA(a, b);
                updateRoaster(key, lastSTCATypeMap.get(key) || type, a, b);
            }
        };
        box.appendChild(entry);
    } else if (entry.textContent !== newText || entry.className !== newClass) {
        entry.textContent = newText;
        entry.className = newClass;
        //console.log("Updated STCA Roaster", key);
    }

}




/**
 * Main Short Term Conflict Alert (STCA) check loop.
 * 
 * Runs once every second via setInterval — detects both actual and predicted conflicts,
 * manages conflict sets, updates visuals (halos, roaster), and draws conflict lines.
 */
function runSTCACheck() {
    if (!stcaEnabled) return; 

    aircraftBlips.forEach(blip => {
        blip.currentSTCA = "none";
    });

    const newPredicted = new Set();
    const newActual = new Set();

    const positionCache = {};
    aircraftBlips.forEach(blip => {
        positionCache[blip.callsign] = {};
        for (let t = 0; t <= lookaheadSecondsSTCA; t += 10) {
            positionCache[blip.callsign][t] = predictPosition(blip, t);
        }
    });

    // ===== Check for actual conflicts =====
for (let i = 0; i < aircraftBlips.length; i++) {
    for (let j = i + 1; j < aircraftBlips.length; j++) {
        const a = aircraftBlips[i];
        const b = aircraftBlips[j];
        const key = `${a.callsign}|${b.callsign}`;

        // Skip conflict if both aircraft are in the same formation (e.g., leader and wingman)
        if (getFormationCallsign(a.callsign) === getFormationCallsign(b.callsign)) continue;

        // ===== 🛡️ New check: Skip conflict if BOTH aircraft are inside the excluded airspace =====
        if (isInsideSTCAExcludedZone(a) && isInsideSTCAExcludedZone(b)) {
            continue; // Skip STCA conflict if both aircraft inside STCA exclusion zone
        }
        

        // Skip conflict if this pair is currently inhibited
        if (isInhibited(key)) continue;

        // Check if actual conflict exists between a and b
        if (checkActualConflict(a, b)) {
            newActual.add(key);
            triggerActualSTCA(a, b);
            updateRoaster(key, 'actual', a, b);
        }
    }
}

// ===== Check for predicted conflicts =====
for (let t = 0; t <= lookaheadSecondsSTCA; t += 10) {
    const conflictsAtTime = checkPredictedConflictsAtTime(t, positionCache);

    conflictsAtTime.forEach(({ a, b }) => {
        const key = `${a.callsign}|${b.callsign}`;

        // Skip predicted conflict if both aircraft are in the same formation
        if (getFormationCallsign(a.callsign) === getFormationCallsign(b.callsign)) return;

        // ===== 🛡️ New check: Skip predicted conflict if BOTH aircraft are inside the excluded airspace =====
        if (isInsideSTCAExcludedZone(a) && isInsideSTCAExcludedZone(b)) {
            return; // Skip STCA conflict if both aircraft inside STCA exclusion zone
        }
        

        // If this pair is not already in actual conflict
        if (!newActual.has(key)) {
            if (!isInhibited(key)) {
                newPredicted.add(key);
                triggerPredictedSTCA(a, b);
            }
            updateRoaster(key, 'predicted', a, b); // Always update message color
        }
    });
}


    // ===== Update conflict sets =====
    predictedConflicts.clear();
    newPredicted.forEach(key => predictedConflicts.add(key));

    actualConflicts.clear();
    newActual.forEach(key => actualConflicts.add(key));

    // ===== Clear visuals & remove roaster for resolved conflicts =====
    for (let i = 0; i < aircraftBlips.length; i++) {
        for (let j = i + 1; j < aircraftBlips.length; j++) {
            const a = aircraftBlips[i];
            const b = aircraftBlips[j];
            const key = `${a.callsign}|${b.callsign}`;

            const isStillInPredicted = newPredicted.has(key);
            const isStillInActual = newActual.has(key);

            if (!isStillInActual && !isStillInPredicted) {
                clearSTCA(a, b);

                if (!isInhibited(key)) {
                    removeRoaster(key);
                }
            }
        }
    }

    // ===== Unified roaster display toggle =====
    const roasterBox = document.getElementById("alertRoasterBox");
    roasterBox.style.display =
        (newActual.size + newPredicted.size > 0 || actualMSAWConflicts.size + predictedMSAWConflicts.size > 0)
            ? "block"
            : "none";

    // ===== Draw conflict lines =====
    drawSTCALines();
}


/**
 * Clears STCA status and visuals for a pair of aircraft if no conflicts remain.
 * 
 * If a blip is still in a predicted conflict, it falls back to predicted state (yellow).
 * Otherwise, its halo is hidden and STCA state reset.
 *
 * @param {Object} a - First aircraft blip
 * @param {Object} b - Second aircraft blip
 */
function clearSTCA(a, b) {
    [a, b].forEach(blip => {
        // Check if this blip is still involved in any predicted conflicts
        const stillInPredicted = [...predictedConflicts].some(key => key.includes(blip.callsign));

        // Check if this blip is still involved in any actual conflicts
        const stillInActual = [...actualConflicts].some(key => key.includes(blip.callsign));

        // If no conflicts remain, hide the halo and reset status
        if (!stillInActual && !stillInPredicted && blip.stcaHalo) {
            blip.stcaHalo.style.display = 'none';
            blip.currentSTCA = 'none';
            blip.updateLabelInfo();
        }
        // If only predicted conflicts remain, fall back to predicted halo (yellow)
        else if (!stillInActual && stillInPredicted && blip.stcaHalo) {
            blip.stcaHalo.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
            blip.currentSTCA = 'predicted';
            blip.updateLabelInfo();
        }
    });
}


/**
 * Removes a conflict entry from the STCA Roaster UI based on conflict key.
 *
 * @param {string} key - The conflict pair key in the form "CALLSIGN1|CALLSIGN2"
 */
function removeRoaster(key) {
    // Find the existing roaster entry div by its unique ID
    const entry = document.getElementById(`roaster-${key.replace("|", "-")}`);

    // If it exists, remove it from the DOM
    if (entry) entry.remove();
}


/**
 * Cleans up all conflict data, visuals, and roaster entries related to a deleted aircraft.
 * 
 * Removes its associated conflicts from both predicted and actual sets,
 * clears any related roaster entries, and updates remaining blips accordingly.
 *
 * @param {string} deletedCallsign - The callsign of the aircraft being removed
 */
function cleanUpConflictsForDeletedBlip(deletedCallsign) {
    const affectedBlips = new Set();

    function removeConflictSet(conflictSet) {
        [...conflictSet].forEach(key => {
            if (key.includes(deletedCallsign)) {
                const [c1, c2] = key.split("|");
                const otherCallsign = (c1 === deletedCallsign) ? c2 : c1;
                affectedBlips.add(otherCallsign);
                conflictSet.delete(key);
                removeRoaster(key); // always remove even if inhibited
            }
        });
    }

    function removeMSAWConflictSet(msawSet) {
        if (msawSet.has(deletedCallsign)) {
            msawSet.delete(deletedCallsign);
            removeMSAWRoaster(deletedCallsign); // always remove even if inhibited
        }
    }

    function forceRemoveRoasterEntries() {
        const box = document.getElementById("alertRoasterBox");

        const entries = [...box.querySelectorAll(".roaster-entry")].filter(entry => {
            const id = entry.id.replace("roaster-", "").replace("-", "|");
            return id.includes(deletedCallsign);
        });

        // 🔥 Place the fade-out check BEFORE actually removing
        if (entries.length === box.querySelectorAll(".roaster-entry").length) {
            box.classList.add("fade-out");
            setTimeout(() => {
                box.style.display = "none";
                box.classList.remove("fade-out");
            }, 300);
        }

        entries.forEach(entry => entry.remove());

        // 🛠 New code here:
        if (!box.querySelector(".roaster-entry")) {
            box.style.display = "none"; // hide if no entries remain
        }
    }


    function removeInhibitedAlerts() {
        [...inhibitedAlerts.keys()].forEach(key => {
            if (key.includes("|")) {
                const [c1, c2] = key.split("|");
                if (c1 === deletedCallsign || c2 === deletedCallsign) {
                    inhibitedAlerts.delete(key);
                }
            } else if (key.startsWith("MSAW|")) {
                const callsign = key.split("|")[1];
                if (callsign === deletedCallsign) {
                    inhibitedAlerts.delete(key);
                }
            }
        });
    }

    // === Perform cleanup ===
    removeConflictSet(predictedConflicts);
    removeConflictSet(actualConflicts);
    removeMSAWConflictSet(predictedMSAWConflicts);
    removeMSAWConflictSet(actualMSAWConflicts);

    removeInhibitedAlerts();

    // 🛑 Important step
    forceRemoveRoasterEntries(); // Remove leftover roaster entries (including inhibited ones)

    // === Update affected blips ===
    affectedBlips.forEach(callsign => {
        const blip = aircraftBlips.find(b => b.callsign === callsign);
        if (blip) {
            const stillInPredicted = [...predictedConflicts].some(key => key.includes(callsign));
            const stillInActual = [...actualConflicts].some(key => key.includes(callsign));
            if (!stillInPredicted && !stillInActual && blip.stcaHalo) {
                blip.stcaHalo.style.display = 'none';
                blip.currentSTCA = 'none';
                blip.updateLabelInfo();
            }
        }
    });

    const deletedBlip = aircraftBlips.find(b => b.callsign === deletedCallsign);
    if (deletedBlip) {
        if (deletedBlip.stcaHalo) deletedBlip.stcaHalo.style.display = 'none';
        if (deletedBlip.msawHalo) deletedBlip.msawHalo.style.display = 'none';
    }
}



/**
 * Schedules the runSTCACheck function to run continuously at a regular interval.
 *
 * In this case, it triggers once every 1000 milliseconds (1 second),
 * continuously checking for actual and predicted conflicts,
 * updating visuals, STCA roaster entries, and radar lines.
 */
setInterval(runSTCACheck, 1000);


function isInsideSTCAExcludedZone(blip) {
    const dx = blip.position.x;
    const dy = blip.position.y;
    const horizontalDistance = Math.sqrt(dx * dx + dy * dy);

    return (
        horizontalDistance <= stcaExcludedVolume.horizontalRadiusNM &&
        blip.altitude <= stcaExcludedVolume.verticalCeilingFT
    );
}

