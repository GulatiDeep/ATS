// ===============================
// Settings Dialog Handling
// ===============================

// Function to open or close the settings dialog box
function toggleSettingsDialog() {
    const dialog = document.getElementById("settingsDialog");
    dialog.style.display = dialog.style.display === "none" ? "block" : "none";
}

// Update Speed Vector Minutes immediately when selection changes
document.getElementById("speedVectorSelect").addEventListener("change", (e) => {
    speedVectorMinutes = parseInt(e.target.value, 10);
});

function updateRunwayOrientationPreview() {
    const input = document.getElementById("runwayOrientationInput");
    const preview = document.getElementById("runwayOrientationPreview");
    const tooltip = document.getElementById("runwayOrientationTooltip");
    if (!input || !preview || !tooltip) return;

    // Keep raw input with leading zeros (but strip non-digits and limit to 3 chars)
    let raw = (input.value || '').toString();
    raw = raw.replace(/\D/g, '').slice(0, 3);
    input.value = raw; // preserves leading zeros

    if (raw.length === 0) {
        preview.textContent = "RW 00 (000°) / RW 00 (000°)";
        tooltip.style.display = 'none';
        return;
    }

    // Parse numeric value (leading zeros allowed, parseInt handles them)
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1 || num > 360) {
        // show inline tooltip
        tooltip.style.display = 'inline-block';
        preview.textContent = "RW 00 (000°) / RW 00 (000°)";
        return;
    }

    // valid; hide tooltip
    tooltip.style.display = 'none';

    const selectedOrientation = normalizeAngle(num);
    const reciprocalOrientation = normalizeAngle(selectedOrientation + 180);
    const runwayNumber = runwayNumberFromOrientation(selectedOrientation);
    const reciprocalRunwayNumber = runwayNumberFromOrientation(reciprocalOrientation);

    // Preview format: RW <selected> (<reciprocal°>) / RW <reciprocal> (<reciprocal°>)
    const recipLabel = String(Math.round(reciprocalOrientation)).padStart(3, '0');
    preview.textContent = `RW ${runwayNumber} (${recipLabel}°) / RW ${reciprocalRunwayNumber} (${recipLabel}°)`;
}

const runwayOrientationInput = document.getElementById("runwayOrientationInput");
if (runwayOrientationInput) {
    runwayOrientationInput.addEventListener("input", updateRunwayOrientationPreview);
    runwayOrientationInput.addEventListener("change", updateRunwayOrientationPreview);
    // Allow paste of up to 3 digits (leading zeros ok) and strip any non-digit content
    runwayOrientationInput.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text') || '';
        if (!/^[0-9]{1,3}$/.test(text)) {
            // sanitize pasted content: keep only digits up to 3
            e.preventDefault();
            const sanitized = text.replace(/\D/g, '').slice(0,3);
            const selStart = runwayOrientationInput.selectionStart || 0;
            const selEnd = runwayOrientationInput.selectionEnd || 0;
            const cur = runwayOrientationInput.value || '';
            const newVal = cur.slice(0, selStart) + sanitized + cur.slice(selEnd);
            runwayOrientationInput.value = newVal.slice(0,3);
            updateRunwayOrientationPreview();
        }
    });
}

updateRunwayOrientationPreview();

// ===============================
// Apply Settings Function
// ===============================

function applySettings() {
    // --- Update History Dots Count ---
    const newDotCount = parseInt(document.getElementById("historyDotCountSelect").value, 10);
    if (!isNaN(newDotCount)) {
        currentHistoryDotCount = newDotCount;

        // Clear old dots and recreate with new count for local aircraft screens
        aircraftBlips.forEach(blip => {
            blip.historyDots.forEach(dot => dot.remove());
            blip.historyDots = [];
            blip.createHistoryDots();
            blip.updateHistoryDots();
        });

        // If running on SRE, ask the SRE client to rebuild its mirror history dots too
        if (window._sreClient && typeof window._sreClient.applyHistoryDotCount === 'function') {
            try {
                window._sreClient.applyHistoryDotCount();
            } catch (e) {
                console.warn('Failed to apply SRE history dot count:', e);
            }
        }

        // Refresh SRE mirrors immediately after changing display settings
        if (window._sreClient && typeof window._sreClient.refreshAllMirrors === 'function') {
            try {
                window._sreClient.refreshAllMirrors();
            } catch (e) {
                console.warn('Failed to refresh SRE mirrors after applySettings:', e);
            }
        }
    }

    //to set the transition level
    transitionLevel = parseInt(document.getElementById('transitionLevelSelect').value);

    // --- Update runway orientation / display mode ---
    const runwayOrientationInput = document.getElementById('runwayOrientationInput');
    if (runwayOrientationInput) {
        const orientationValue = parseFloat(runwayOrientationInput.value);
        if (!isNaN(orientationValue) && orientationValue > 0) {
            runwayOrientationDegrees = normalizeAngle(orientationValue);
        }
    }

    // --- Update STCA Toggle ---
    stcaEnabled = document.getElementById("stcaToggle").checked;

    // --- Update STCA Parameters ---
    const horizontalInput = parseFloat(document.getElementById("horizontalSeparationInput").value);
    if (!isNaN(horizontalInput)) horizontalSeparationNM = horizontalInput;

    const verticalInput = parseFloat(document.getElementById("verticalSeparationInput").value);
    if (!isNaN(verticalInput)) verticalSeparationFT = verticalInput;

    const lookaheadSTCAInput = parseFloat(document.getElementById("lookaheadSTCAInput").value);
    if (!isNaN(lookaheadSTCAInput)) lookaheadSecondsSTCA = lookaheadSTCAInput;

    //Update excluded volumes
    stcaExcludedVolume.horizontalRadiusNM = parseFloat(document.getElementById('stcaExcludedHorizontalInput').value);
    stcaExcludedVolume.verticalCeilingFT = parseFloat(document.getElementById('stcaExcludedVerticalInput').value);

    // --- MSAW Settings ---
    msawEnabled = document.getElementById("msawToggle").checked;

    const msaInput = parseFloat(document.getElementById("minimumAltitudeInput").value);
    if (!isNaN(msaInput)) minimumSafeAltitudeFT = msaInput;

    const lookaheadMSAWInputValue = parseFloat(document.getElementById("lookaheadMSAWInput").value);
    if (!isNaN(lookaheadMSAWInputValue)) lookaheadSecondsMSAW = lookaheadMSAWInputValue;

    //Update excluded volumes
    msawExcludedVolume.horizontalRadiusNM = parseFloat(document.getElementById('msawExcludedHorizontalInput').value);
    msawExcludedVolume.verticalCeilingFT = parseFloat(document.getElementById('msawExcludedVerticalInput').value);

    createRangeRings(); // redraw full rings + zones based on new settings

    if (window._sreHost && typeof window._sreHost.broadcastState === 'function') {
        try {
            window._sreHost.broadcastState();
        } catch (e) {
            console.warn('Failed to broadcast runway state after settings apply:', e);
        }
    }

    // --- Clear STCA alerts if disabled ---
    if (!stcaEnabled) {
        aircraftBlips.forEach(blip => {
            if (blip.stcaHalo) blip.stcaHalo.style.display = 'none';
            blip.currentSTCA = "none"; // 💥 Clear STCA state
            blip.updateLabelInfo();    // 💥 Update label to remove STCA info
        });
    
        predictedConflicts.clear();
        actualConflicts.clear();
    
        const canvas = document.getElementById("stcaCanvas");
        if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    
        [...document.querySelectorAll("#alertRoasterBox .roaster-entry")].forEach(entry => {
            if (entry.textContent.includes("STCA")) {
                entry.remove();
            }
        });
    }
    

    // Clear MSAW alerts if disabled
    if (!msawEnabled) {
        aircraftBlips.forEach(blip => {
            if (blip.msawHalo) blip.msawHalo.style.display = 'none';
            blip.currentMSAW = "none"; // 💥 Clear MSAW state
            blip.updateLabelInfo();    // 💥 Update label to remove MSAW info
        });
    
        predictedMSAWConflicts.clear();
        actualMSAWConflicts.clear();
    
        [...document.querySelectorAll("#alertRoasterBox .roaster-entry")].forEach(entry => {
            if (entry.textContent.includes("MSAW")) {
                entry.remove();
            }
        });
    }
    

    // 🔥 After clearing, if no entries left, hide the box
    const box = document.getElementById("alertRoasterBox");
    if (!box.querySelector(".roaster-entry")) {
        box.style.display = "none";
    }

    // --- Update Status Bar ---
    updateStatusBar(`✅  Settings successfully applied`);

    // --- Show Toast Notification ---
    showToast("✅ Settings successfully applied!");

    // --- Close the settings dialog ---
    toggleSettingsDialog();
}

// ===============================
// Simple Toast Notification Handler
// ===============================

function showToast(message) {
    const panContainer = document.getElementById("panContainer");
    if (!panContainer) return; // safety check if panContainer doesn't exist

    // Create toast container if it doesn't exist
    let toast = document.getElementById("toastNotification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toastNotification";
        panContainer.appendChild(toast);  // ← append inside panContainer now

        // Style the toast
        toast.style.position = "absolute";
        toast.style.bottom = "30px";
        toast.style.right = "20px";
        toast.style.background = "rgba(0,0,0,0.85)";
        toast.style.color = "#fff";
        toast.style.padding = "10px 20px";
        toast.style.borderRadius = "6px";
        toast.style.fontSize = "14px";
        toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
        toast.style.zIndex = "500";  // high but within radar container
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease";
        toast.style.pointerEvents = "none"; // make sure it doesn't block clicks
    }

    // Update message and show
    toast.textContent = message;
    toast.style.opacity = "1";

    // Hide after 2.5 seconds
    setTimeout(() => {
        toast.style.opacity = "0";
    }, 2500);
}

