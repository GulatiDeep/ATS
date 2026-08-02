// ===========================
// MSAW CONFIGURATION & SETUP
// ===========================

// Enable or disable MSAW globally
let msawEnabled = false;

// Default minimum safe altitude (in feet)
let minimumSafeAltitudeFT = 2000;

// Sets to track current MSAW conflicts
const predictedMSAWConflicts = new Set();
const actualMSAWConflicts = new Set();

// How far ahead to predict (in seconds)
let lookaheadSecondsMSAW = 120;

//Initialise radar Audio context to play the beep sound through browser
let radarAudioContext = null;


/**
 * Main MSAW conflict check — detects actual and predicted infringements.
 * Runs periodically via setInterval.
 */
function runMSAWCheck() {
    if (!msawEnabled) return;  // Exit if MSAW (Minimum Safe Altitude Warning) is not enabled

    // Reset MSAW state for this cycle (clear current MSAW state for each aircraft)
    aircraftBlips.forEach(blip => {
        blip.currentMSAW = "none";
    });

    const newActual = new Set();  // Set to store callsigns of aircraft with actual infringements
    const newPredicted = new Set();  // Set to store callsigns of aircraft with predicted infringements

    // Predict positions ahead for each aircraft in the system
    const positionCache = {};  // Cache to store predicted positions for each aircraft
    aircraftBlips.forEach(blip => {
        positionCache[blip.callsign] = {};  // Initialize cache for each aircraft
        for (let t = 0; t <= lookaheadSecondsMSAW; t += 1) {  // Predict positions at intervals (e.g., every 1 second)
            positionCache[blip.callsign][t] = predictPosition(blip, t);  // Predict position at time t for each aircraft
        }
    });

    // ===== Check for actual MSAW infringements =====
    aircraftBlips.forEach(blip => {
        const key = `MSAW|${blip.callsign}`; // Create a unique key for each aircraft's MSAW alert

        // ===== 🛡️ New check: Skip aircraft inside excluded airspace =====
        if (isInsideMSAWExcludedZone(blip)) {
            return; // Skip MSAW alert if inside MSAW exclusion zone
        }
        

        // Skip processing if the aircraft is in the inhibited alerts list
        if (inhibitedAlerts.has(key)) return;

        // Check if aircraft altitude is below Minimum Safe Altitude by 200 ft
        if (blip.altitude <= (minimumSafeAltitudeFT - 200)) {
            newActual.add(blip.callsign);
            triggerActualMSAW(blip);
            updateMSAWRoaster(blip.callsign, "actual");
        }
    });


    // ===== Check for predicted MSAW infringements =====
    for (let t = 0; t <= lookaheadSecondsMSAW; t += 1) { // Predict 1-second steps
        aircraftBlips.forEach(blip => {
            const predictedAlt = positionCache[blip.callsign][t].altitude;
            const key = `MSAW|${blip.callsign}`;

            // ===== 🛡️ New check: Skip aircraft inside excluded airspace =====
            if (isInsideMSAWExcludedZone(blip)) {
                return; // Skip MSAW alert if inside MSAW exclusion zone
            }
            

            if (predictedAlt <= (minimumSafeAltitudeFT - 200)) {
                if (!newActual.has(blip.callsign)) {
                    if (!inhibitedAlerts.has(key)) { // Only trigger if not inhibited
                        newPredicted.add(blip.callsign);
                        triggerPredictedMSAW(blip);
                    }
                    updateMSAWRoaster(blip.callsign, "predicted"); // Always update message color
                }
            }
        });
    }


    // Update conflict sets with new infringements
    predictedMSAWConflicts.clear();  // Clear previous predicted conflicts
    newPredicted.forEach(c => predictedMSAWConflicts.add(c));  // Add newly predicted conflicts to the set

    actualMSAWConflicts.clear();  // Clear previous actual conflicts
    newActual.forEach(c => actualMSAWConflicts.add(c));  // Add newly actual conflicts to the set

    // Clear halos for resolved conflicts (aircraft that are no longer in conflict)
    aircraftBlips.forEach(blip => {
        // If the aircraft is not in actual or predicted conflict
        if (!newActual.has(blip.callsign) && !newPredicted.has(blip.callsign)) {
            // Clear the MSAW state only if the aircraft has climbed back to or above the MSA
            const key = `MSAW|${blip.callsign}`;
            if (blip.altitude >= minimumSafeAltitudeFT) {
                clearMSAW(blip);  // Clear the MSAW warning for the aircraft
                if (!inhibitedAlerts.has(key)) {  // If the aircraft is not in the inhibited alerts list
                    removeMSAWRoaster(blip.callsign);  // Remove this aircraft from the MSAW roaster
                }
            }
        }
    });




    // Update the visibility of the alert roaster box based on the number of active alerts
    const roasterBox = document.getElementById("alertRoasterBox");
    roasterBox.style.display = roasterBox.querySelector(".roaster-entry") ? "block" : "none"; // Show or hide the roaster box based on whether there are active alerts

    // 🔥 Force refresh timers even for inhibited MSAW alerts
    aircraftBlips.forEach(blip => {
        const key = `MSAW|${blip.callsign}`;
        if (lastMSAWTypeMap.has(key)) { // if it was ever alerted
            updateMSAWRoaster(blip.callsign, lastMSAWTypeMap.get(key));
        }
    });
}




/**
 * Triggers a predicted MSAW alert — yellow halo + beep sound.
 */
function triggerPredictedMSAW(blip) {
    // If the aircraft has an MSAW halo element (visual representation), show it and apply the yellow color
    if (blip.msawHalo) {
        blip.msawHalo.style.display = 'block';  // Make the halo visible
        blip.msawHalo.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';  // Apply yellow color with some transparency
    }

    // Set the aircraft's MSAW status to "predicted"
    blip.currentMSAW = "predicted";

    // Update the aircraft's label or information display (e.g., text or status in UI)
    blip.updateLabelInfo();

    // Play a beep sound to alert the user of a predicted MSAW infringement
    playBeepSound();
}


/**
 * Triggers an actual MSAW alert — red halo + beep sound.
 */
function triggerActualMSAW(blip) {
    // If the aircraft has an MSAW halo element (visual representation), show it and apply the red color
    if (blip.msawHalo) {
        blip.msawHalo.style.display = 'block';  // Make the halo visible
        blip.msawHalo.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';  // Apply red color with higher opacity
    }

    // Set the aircraft's MSAW status to "actual"
    blip.currentMSAW = "actual";

    // Update the aircraft's label or information display (e.g., text or status in UI)
    blip.updateLabelInfo();

    // Play a beep sound to alert the user of an actual MSAW infringement
    playBeepSound();
}


/**
 * Clears MSAW visual and status if no conflict.
 */
function clearMSAW(blip) {
    // If the aircraft has an MSAW halo element, hide it (no conflict)
    if (blip.msawHalo) {
        blip.msawHalo.style.display = 'none';  // Hide the halo
    }

    // Reset the aircraft's MSAW status to "none" (no infringement)
    blip.currentMSAW = "none";

    // Update the aircraft's label or information display to reflect the cleared status
    blip.updateLabelInfo();
}


/**
 * Plays an MSAW warning sound.
 */
function playBeepSound() {
    // If the radar audio context is not initialized, exit the function
    if (!radarAudioContext) return;

    // Create an oscillator to generate a sound
    const oscillator = radarAudioContext.createOscillator();

    // Create a gain node to control the volume of the sound
    const gainNode = radarAudioContext.createGain();

    // Set the oscillator type to 'square' (a harsh, beeping tone)
    oscillator.type = 'square';

    // Set the frequency of the sound to 600 Hz (a typical alert tone)
    oscillator.frequency.setValueAtTime(600, radarAudioContext.currentTime);

    // Set the volume of the sound to 0.2 (out of 1)
    gainNode.gain.setValueAtTime(0.2, radarAudioContext.currentTime);

    // Connect the oscillator to the gain node, and then the gain node to the audio output
    oscillator.connect(gainNode);
    gainNode.connect(radarAudioContext.destination);

    // Start the oscillator (sound starts playing)
    oscillator.start();

    // Stop the oscillator after 0.2 seconds to produce a brief beep
    oscillator.stop(radarAudioContext.currentTime + 0.2);
}


// Set an interval to run the MSAW check every second (1000 milliseconds)
setInterval(runMSAWCheck, 1000);


// Maps to store the last MSAW type for each callsign and the remaining breach time for each aircraft.
const lastMSAWTypeMap = new Map();
const msawBreachTimeMap = new Map(); // callsign => seconds remaining to breach

/**
 * Updates the MSAW roaster (list) with a new entry or updates an existing one.
 * This function is called when a new MSAW alert is triggered or when the status needs to be updated.
 * 
 * @param {string} callsign - The callsign of the aircraft.
 * @param {string} type - The type of MSAW alert (either "predicted" or "actual").
 */
function updateMSAWRoaster(callsign, type) {
    // Get the container element where the MSAW roaster entries are displayed.
    const box = document.getElementById("alertRoasterBox");

    // Create a unique key for this aircraft's MSAW entry.
    const key = `MSAW|${callsign}`;
    const id = `roaster-${key.replace("|", "-")}`; // Generate a safe ID for the entry (replace | with -).

    // Check if there's an existing entry for this callsign in the roaster.
    let entry = document.getElementById(id);

    // Retrieve the last known MSAW type for this callsign.
    const prevType = lastMSAWTypeMap.get(key);
    if (prevType === "actual" || type === "actual") {
        // If the previous type was "actual" or the new type is "actual", set the type to "actual".
        lastMSAWTypeMap.set(key, "actual");
        type = "actual"; // Force "actual" MSAW if needed.
    }

    // Check if the MSAW alert is currently inhibited for this callsign.
    const isInhibitedNow = isInhibited(key);

    // Find the blip (aircraft data) for the given callsign.
    const blip = aircraftBlips.find(b => b.callsign === callsign);
    if (!blip) return; // If the blip is not found, exit the function.

    // Calculate the time remaining until the MSAW breach (time to MSA violation).
    const breachTime = calculateTimeToMSAWBreach(blip); // 💥 Calculate FRESH every time

    // Prepare the time text to display in the roaster (e.g., "Breach in 20 sec").
    let timeText = '';
    if (breachTime !== null && breachTime !== undefined) {
        timeText = ` | Breach in ${breachTime} sec`;
    }

    // Generate the new text for the roaster entry based on the MSAW type (actual or predicted).
    const newText = `${type === "actual" ? "Actual MSAW" : "Predicted MSAW"}: ${callsign}${timeText}`;

    // Determine the appropriate class to style the entry (color coding for actual, predicted, or inhibited).
    const newClass = `roaster-entry ${isInhibitedNow ? "roaster-blue" : (type === "actual" ? "roaster-red" : "roaster-yellow")}`;

    // If no entry exists for the callsign, create a new roaster entry.
    if (!entry) {
        entry = document.createElement("div");
        entry.id = id; // Set the unique ID for the new entry.
        entry.textContent = newText; // Set the text content for the entry.
        entry.className = newClass; // Apply the appropriate class for styling.

        // Set up a double-click event to inhibit the MSAW alert and reset the status.
        entry.ondblclick = () => {
            if (!isInhibited(key)) {
                // Inhibit the MSAW alert for 60 seconds.
                inhibitedAlerts.set(key, Date.now() + 60000);
                clearMSAWByCallsign(callsign); // Clear the MSAW for this callsign.
                updateMSAWRoaster(callsign, lastMSAWTypeMap.get(key) || type); // Re-update the roaster entry.
            }
        };

        // Add the new entry to the roaster box (UI).
        box.appendChild(entry);
    } else {
        // If the entry already exists, update its text and class.
        entry.textContent = newText;
        entry.className = newClass;
    }
}


/**
 * Removes an MSAW entry from the roaster for a given callsign.
 * 
 * @param {string} callsign - The callsign of the aircraft whose MSAW entry should be removed.
 */
function removeMSAWRoaster(callsign) {
    // Generate the unique key for the MSAW entry.
    const key = `MSAW|${callsign}`;
    // Find the existing entry for this callsign in the roaster.
    const entry = document.getElementById(`roaster-${key.replace("|", "-")}`);
    // If the entry exists, remove it from the roaster.
    if (entry) entry.remove();
}


/**
 * This function is used when the MSAW condition for the aircraft is resolved or the alert needs to be cleared.
 * 
 * Clears the MSAW alert and its associated breach time for a given aircraft's callsign.
 * 
 * @param {string} callsign - The callsign of the aircraft whose MSAW alert and breach time should be cleared.
 */
function clearMSAWByCallsign(callsign) {
    // Find the aircraft blip for the given callsign and clear its MSAW status.
    const blip = aircraftBlips.find(b => b.callsign === callsign);
    if (blip) clearMSAW(blip);

    // Also remove the breach time entry for this aircraft from the breach time map.
    msawBreachTimeMap.delete(callsign);
}

// Function to calculate the time in which MSAW (Minimum Safe Altitude Warning) will be breached 
function calculateTimeToMSAWBreach(blip) {
    const currentAltitude = blip.altitude; // Current altitude of the aircraft (in feet)
    const breachAltitude = minimumSafeAltitudeFT - 200; // Define the MSAW breach altitude, 200 feet below the minimum safe altitude
    let verticalRateFPM = blip.verticalClimbDescendRate || 0; // Vertical rate of climb or descent (feet per minute), default to 0 if not provided

    // Check if the aircraft is descending based on the target altitude
    if (blip.targetAltitude < currentAltitude) {
        verticalRateFPM = -verticalRateFPM; // Make the vertical rate negative to indicate descent if target altitude is lower than current altitude
    }

    // If the vertical rate is positive (climbing or level flight), there's no breach expected
    if (verticalRateFPM >= 0) {
        return null; // No breach will occur if climbing or level
    }

    // Convert the vertical rate from feet per minute (FPM) to feet per second (FPS)
    const verticalRateFPS = verticalRateFPM / 60; // 1 minute = 60 seconds, so divide by 60

    // Calculate the time in seconds it will take to reach the breach altitude
    const timeToBreachSeconds = (currentAltitude - breachAltitude) / Math.abs(verticalRateFPS); // Absolute value to avoid negative time

    // If the time to breach is less than 0, it means the aircraft is already below the breach altitude
    if (timeToBreachSeconds < 0) {
        return 0; // Return 0 if the aircraft is already below the breach altitude
    }

    // Return the time to breach in seconds, rounded to the nearest whole number for display
    return Math.round(timeToBreachSeconds);
}


function isInsideMSAWExcludedZone(blip) {
    const dx = blip.position.x;
    const dy = blip.position.y;
    const horizontalDistance = Math.sqrt(dx * dx + dy * dy);

    return (
        horizontalDistance <= msawExcludedVolume.horizontalRadiusNM &&
        blip.altitude <= msawExcludedVolume.verticalCeilingFT
    );
}

