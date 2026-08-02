//********radar.js script file starts here**********/




// Update status bar
function updateStatusBar(message) {
    document.getElementById('statusBar').innerText = message;
}

//defining constructors
const radarScope = document.getElementById('radarScope');
const rangeRingsContainer = document.getElementById('rangeRingsContainer');
const zoomSlider = document.getElementById('zoomSlider');
const zoomInButton = document.getElementById('zoomIn');
const zoomOutButton = document.getElementById('zoomOut');
const homeButton = document.getElementById('home');
const runwaySelector = document.getElementById('runwaySelector');
const changeRunwayButton = document.getElementById('changeRunway');
const SRAdistanceMarkersButton = document.getElementById('SRAdistanceMarkers');
const directionLine = document.getElementById('directionLine');
const panContainer = document.getElementById('panContainer');

let runwayOrientationDegrees = 200;
let runwayDisplayMode = 'same'; // SRE local option for runway side
let hostRunwayState = null;
const isSREReplica = !!document.getElementById('hostPeerIdInput');

//global alert state for inhibition of STCA and MSAW, to be loaded before STCA/MSAW.js file
//const inhibitedAlerts = new Set(); // Global: shared between STCA and MSAW
const inhibitedAlerts = new Map(); // key: alert key, value: timestamp
  function isInhibited(key) {
    const expiry = inhibitedAlerts.get(key);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      inhibitedAlerts.delete(key);
      return false;
    }
    return true;
  }


// ==============================
// Excluded Airspace Settings
// ==============================

//STCA Airspace Volume Settings
let stcaExcludedVolume = {
    horizontalRadiusNM: 10,
    verticalCeilingFT: 2000
};

//MSAW Airspace Volume Settings
let msawExcludedVolume = {
    horizontalRadiusNM: 10,
    verticalCeilingFT: 20000
};


//other global variables
let currentHistoryDotCount = 20; // Default value (can be updated via settings)

let zoomLevel = parseFloat(zoomSlider.value);
let panX = 0;
let panY = 0;
let startX, startY, isDragging = false;
let isDirectionReversed = false; // Tracks if the direction is reversed
let areMarkersVisible = false; // Tracks the visibility of the distance markers

// Define global variable for runway designation
let runwayDesignation = '';

// Store initial values
const initialZoomLevel = 6;
const initialPanX = 0;
const initialPanY = 0;
let distanceBetweenRings = 10; // nautical miles
const numRings = 20;



function createRangeRings() {
    rangeRingsContainer.innerHTML = ''; // Clear old rings

    const rect = radarScope.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const initialRadius = 10; // Starting radius in NM

    for (let i = 0; i < numRings; i++) {
        const ring = document.createElement('div');
        ring.className = 'ring';

        const ringRadius = (initialRadius + distanceBetweenRings * i) * zoomLevel;
        const diameter = ringRadius * 2;

        ring.style.width = `${diameter}px`;
        ring.style.height = `${diameter}px`;
        ring.style.left = `${centerX - ringRadius}px`;
        ring.style.top = `${centerY - ringRadius}px`;

        rangeRingsContainer.appendChild(ring);
    }

    // to draw excluded zone after rings
    createExcludedZones(); 
    
    
    // Create and position the runway and direction line
    drawRunway();
}

function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

function runwayNumberFromOrientation(degrees) {
    const normalized = normalizeAngle(degrees);
    let runwayNumber = Math.round(normalized / 10);
    if (runwayNumber <= 0) runwayNumber = 36;
    if (runwayNumber > 36) runwayNumber = 36;
    if (runwayNumber === 36) runwayNumber = 18;
    return String(runwayNumber).padStart(2, '0');
}

function getRunwayStateFromInputs() {
    let orientation = null;
    const orientationInput = document.getElementById('runwayOrientationInput');
    if (orientationInput) {
        const inputValue = parseFloat(orientationInput.value);
        if (!isNaN(inputValue) && inputValue > 0) {
            orientation = normalizeAngle(inputValue);
        }
    }

    if (orientation === null && runwaySelector) {
        const selectedValue = parseInt(runwaySelector.value.substring(0, 2));
        if (!isNaN(selectedValue) && selectedValue > 0) {
            orientation = selectedValue * 10;
        }
    }

    if (orientation === null) {
        orientation = runwayOrientationDegrees || 200;
    }

    const selectedOrientation = normalizeAngle(orientation);
    const reciprocalOrientation = normalizeAngle(selectedOrientation + 180);
    const runwayNumber = runwayNumberFromOrientation(selectedOrientation);
    const reciprocalRunwayNumber = runwayNumberFromOrientation(reciprocalOrientation);

    return {
        orientationDegrees: selectedOrientation,
        reciprocalOrientationDegrees: reciprocalOrientation,
        runwayNumber,
        reciprocalRunwayNumber
    };
}

function formatRunwayLabel(runwayState, isReciprocalView) {
    if (!runwayState) {
        return 'RW 00(000°)';
    }

    const orientation = normalizeAngle(
        isReciprocalView ? runwayState.reciprocalOrientationDegrees : runwayState.orientationDegrees
    );
    const visibleLabel = isReciprocalView ? runwayState.reciprocalRunwayNumber : runwayState.runwayNumber;
    const orientationLabel = String(Math.round(orientation)).toString().padStart(3, '0');
    return `RW ${visibleLabel}(${orientationLabel}°)`;
}

function getRunwayDrawInfoForState(runwayState, isReciprocalView) {
    if (!runwayState) {
        return null;
    }

    const selectedOrientation = normalizeAngle(
        isReciprocalView ? runwayState.reciprocalOrientationDegrees : runwayState.orientationDegrees
    );
    const angleDegrees = normalizeAngle(selectedOrientation + 90);
    const label = isReciprocalView ? runwayState.reciprocalRunwayNumber : runwayState.runwayNumber;
    const orientationDegrees = selectedOrientation;

    return {
        angleDegrees,
        runwayLabel: label,
        orientationDegrees
    };
}

function getSreRunwayDrawInfo() {
    if (!hostRunwayState) {
        return null;
    }

    const isReciprocal = runwayDisplayMode === 'reciprocal';
    return getRunwayDrawInfoForState(hostRunwayState, isReciprocal);
}

function applyHostRunwayState(runwayState) {
    if (!runwayState) return;
    hostRunwayState = {
        orientationDegrees: runwayState.orientationDegrees,
        reciprocalOrientationDegrees: runwayState.reciprocalOrientationDegrees,
        runwayNumber: runwayState.runwayNumber,
        reciprocalRunwayNumber: runwayState.reciprocalRunwayNumber
    };
}

function getSreRunwayLabel() {
    if (!hostRunwayState) return '';
    const info = getSreRunwayDrawInfo();
    return info ? `Rwy ${info.runwayLabel.toString().padStart(2, '0')}` : '';
}

function updateSreRunwayStatus() {
    const statusEl = document.getElementById('exerciseStateTop');
    if (!statusEl) return;
    const currentText = statusEl.textContent || '';
    const connectionPart = currentText.includes('Connected') ? '✅ Connected' : (currentText.includes('Disconnected') ? '⛔ Disconnected' : currentText.split(' ')[0] || '');
    const statePart = currentText.includes('Paused') ? 'Paused' : 'Running';
    statusEl.textContent = `${connectionPart} ${statePart}`.trim();
}

function createExcludedZones() {
    // Remove old zones if they exist
    const oldSTCA = document.getElementById('excludedZoneSTCA');
    const oldMSAW = document.getElementById('excludedZoneMSAW');
    if (oldSTCA) oldSTCA.remove();
    if (oldMSAW) oldMSAW.remove();

    const rect = radarScope.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const pixelsPerNM = zoomLevel; // Same as your scale

    // STCA Zone
    if (document.getElementById('stcaToggle').checked) {
        const stcaZone = document.createElement('div');
        stcaZone.id = 'excludedZoneSTCA';
        stcaZone.className = 'excluded-zone-stca';

        const radiusPixels = stcaExcludedVolume.horizontalRadiusNM * pixelsPerNM;
        const diameter = radiusPixels * 2;

        stcaZone.style.width = `${diameter}px`;
        stcaZone.style.height = `${diameter}px`;
        stcaZone.style.left = `${centerX - radiusPixels}px`;
        stcaZone.style.top = `${centerY - radiusPixels}px`;

        rangeRingsContainer.appendChild(stcaZone);
    }

    // MSAW Zone
    if (document.getElementById('msawToggle').checked) {
        const msawZone = document.createElement('div');
        msawZone.id = 'excludedZoneMSAW';
        msawZone.className = 'excluded-zone-msaw';

        const radiusPixels = msawExcludedVolume.horizontalRadiusNM * pixelsPerNM;
        const diameter = radiusPixels * 2;

        msawZone.style.width = `${diameter}px`;
        msawZone.style.height = `${diameter}px`;
        msawZone.style.left = `${centerX - radiusPixels}px`;
        msawZone.style.top = `${centerY - radiusPixels}px`;

        rangeRingsContainer.appendChild(msawZone);
    }
}



function drawRunway() {

    const runway = document.getElementById('runway');
    const initialRadius = 10; // nautical miles for the innermost ring
    const radiusOfInnermostRing = initialRadius * zoomLevel;
    const runwayLength = radiusOfInnermostRing * 0.15; // 15% of the radius

    runway.style.width = `${runwayLength}px`;
    runway.style.height = `4px`; // Thickness of the runway

    // Set position to center of radar scope
    runway.style.position = 'absolute';
    runway.style.left = `${(radarScope.offsetWidth / 2) - (runwayLength / 2)}px`;
    runway.style.top = `${(radarScope.offsetHeight / 2) - 2}px`; // Adjust for thickness

    let drawAngle = 0;
    let runwayLabel = '00';
    let runwayStateForLabel = null;
    let isReciprocalView = false;

    if (isSREReplica && hostRunwayState) {
        isReciprocalView = runwayDisplayMode === 'reciprocal';
        const sreInfo = getSreRunwayDrawInfo();
        drawAngle = sreInfo.angleDegrees;
        runwayLabel = sreInfo.runwayLabel.toString().padStart(2, '0');
        runwayStateForLabel = hostRunwayState;
    } else {
        runwayStateForLabel = getRunwayStateFromInputs();
        isReciprocalView = isDirectionReversed;
        const hostInfo = getRunwayDrawInfoForState(runwayStateForLabel, isReciprocalView);
        drawAngle = hostInfo.angleDegrees;
        runwayLabel = hostInfo.runwayLabel.toString().padStart(2, '0');

        window.runwayState = {
            orientationDegrees: runwayStateForLabel.orientationDegrees,
            reciprocalOrientationDegrees: runwayStateForLabel.reciprocalOrientationDegrees,
            runwayNumber: runwayStateForLabel.runwayNumber,
            reciprocalRunwayNumber: runwayStateForLabel.reciprocalRunwayNumber
        };
    }

    runwayDesignation = runwayLabel;
    const runwayLabelText = formatRunwayLabel(runwayStateForLabel, isReciprocalView);
    updateStatusBar('→ Runway: ' + runwayLabelText);
    if (changeRunwayButton) {
        changeRunwayButton.textContent = runwayLabelText;
        changeRunwayButton.title = isSREReplica ? 'Toggle reciprocal runway view' : 'Toggle reciprocal runway direction';
    }

    runway.style.transform = `rotate(${drawAngle}deg)`;
    runway.style.transformOrigin = 'center center';

    // Calculate the end position of the runway
    const runwayEndX = (radarScope.offsetWidth / 2) + (runwayLength / 2) * Math.cos(drawAngle * Math.PI / 180);
    const runwayEndY = (radarScope.offsetHeight / 2) + (runwayLength / 2) * Math.sin(drawAngle * Math.PI / 180);

    // Set the white direction line properties
    const directionLineLength = radiusOfInnermostRing * 2.5; // 250% of the radius
    directionLine.style.width = `${directionLineLength}px`;
    directionLine.style.height = `1px`; // Thickness of the white line

    // Position the white direction line
    directionLine.style.position = 'absolute';
    directionLine.style.left = `${runwayEndX}px`;
    directionLine.style.top = `${runwayEndY - 1}px`; // Adjust for thickness
    directionLine.style.transform = `rotate(${drawAngle}deg)`;
    directionLine.style.transformOrigin = '0 50%'; // Start from the end of the runway

    // Append the direction line to the panContainer
    panContainer.appendChild(directionLine);

    // Create and position permanent markers
    createPermanentMarkers(runwayEndX, runwayEndY, drawAngle);

    // Create distance markers
    createDistanceMarkers(runwayEndX, runwayEndY, drawAngle);
}



function createPermanentMarkers(startX, startY, angle) {
    const initialRadius = 10; // nautical miles for the innermost ring
    const radiusOfInnermostRing = initialRadius * zoomLevel;
    const markerDistance = radiusOfInnermostRing * 0.50; // 50% of the radius
    const numMarkers = 5;

    // Remove existing markers
    const existingMarkers = document.querySelectorAll('.permanent-marker');
    existingMarkers.forEach(marker => marker.remove());

    for (let i = 0; i < numMarkers; i++) {
        const marker = document.createElement('div');
        marker.className = 'permanent-marker';

        marker.style.height = '10px'; // Height of the permanent markers
        marker.style.width = '1px';  // Width of the permanent markers


        // Calculate marker position
        const markerPosition = markerDistance * (i + 1); // Increment by 50% of radius
        const x = startX + (markerPosition * Math.cos(angle * Math.PI / 180));
        const y = startY + (markerPosition * Math.sin(angle * Math.PI / 180));

        // Center align by adjusting left and top positions
        const markerOffsetX = (parseFloat(marker.style.width) / 2);
        const markerOffsetY = (parseFloat(marker.style.height) / 2);

        marker.style.left = `${x - markerOffsetX}px`;
        marker.style.top = `${y - markerOffsetY}px`;


        // Rotate to be perpendicular to the direction line
        marker.style.transform = `rotate(${angle}deg)`;

        panContainer.appendChild(marker);
    }
}


function createDistanceMarkers(startX, startY, angle) {
    const initialRadius = 10; // nautical miles for the innermost ring
    const radiusOfInnermostRing = initialRadius * zoomLevel;
    const markerDistance = radiusOfInnermostRing * 0.10; // 10% of the radius
    const numMarkers = 15;

    // Remove existing markers and labels
    const existingMarkers = document.querySelectorAll('.distance-marker, .distance-label');
    existingMarkers.forEach(marker => marker.remove());

    for (let i = 0; i < numMarkers; i++) {
        // Create the marker
        const marker = document.createElement('div');
        marker.className = 'distance-marker';

        if (i === 4 || i === 9 || i === 14) { // 0-based index for 5th, 10th, and 15th markers
            marker.style.height = '12px'; // Double the height for these specific markers
            marker.style.width = '2px';  // Increase the width to 2px for these specific markers
        } else {
            marker.style.height = '6px'; // Normal height for other markers
            marker.style.width = '1px';  // Normal width for other markers
        }

        // Calculate marker position
        const markerPosition = markerDistance * (i + 1); // Increment by 10% of radius
        const x = startX + (markerPosition * Math.cos(angle * Math.PI / 180));
        const y = startY + (markerPosition * Math.sin(angle * Math.PI / 180));

        // Center align by adjusting left and top positions
        const markerOffsetX = (parseFloat(marker.style.width) / 2);
        const markerOffsetY = (parseFloat(marker.style.height) / 2);

        marker.style.left = `${x - markerOffsetX}px`;
        marker.style.top = `${y - markerOffsetY}px`;

        // Rotate to be perpendicular to the direction line
        marker.style.transform = `rotate(${angle}deg)`;

        // Set visibility based on the current toggle state
        marker.style.display = areMarkersVisible ? 'block' : 'none';

        panContainer.appendChild(marker);

        // Create the label
        const label = document.createElement('div');
        label.className = 'distance-label';
        label.textContent = `${i + 1}`; // Numbering starts from 1

        // Offset the label slightly to avoid overlapping with the marker
        const labelOffset = 20; // Adjust this value as needed
        const labelX = x + labelOffset * Math.cos((angle - 90) * Math.PI / 180);
        const labelY = y + labelOffset * Math.sin((angle - 90) * Math.PI / 180);

        label.style.left = `${labelX}px`;
        label.style.top = `${labelY}px`;

        // Ensure the label is displayed consistently with the markers
        label.style.display = areMarkersVisible ? 'block' : 'none';

        panContainer.appendChild(label);
    }
}



function updateTransform() {
    panContainer.style.transform = `translate(${panX}px, ${panY}px) `;
    try {
        // Notify listeners (SRE client) that pan/transform changed so mirrors can refresh immediately
        window.dispatchEvent(new CustomEvent('radar-transform', { detail: { panX: panX, panY: panY, zoomLevel: zoomLevel } }));
    } catch (e) { /* ignore if environment doesn't support CustomEvent */ }
}


function resetToInitial() {
    zoomLevel = initialZoomLevel;
    panX = initialPanX;
    panY = initialPanY;

    updateRadarCenter(); // Ensure radar center is recalculated
    createRangeRings();
    updateTransform();

    aircraftBlips.forEach(blip => blip.updateBlipPosition()); // Correct blip positions

}


// Toggle the direction of the line
changeRunwayButton.addEventListener('click', () => {
    if (isSREReplica) {
        runwayDisplayMode = runwayDisplayMode === 'reciprocal' ? 'same' : 'reciprocal';
    } else {
        isDirectionReversed = !isDirectionReversed;
    }

    drawRunway();

    if (!isSREReplica && window._sreHost && typeof window._sreHost.broadcastState === 'function') {
        try {
            window._sreHost.broadcastState();
        } catch (e) {
            console.warn('Failed to broadcast runway toggle state:', e);
        }
    }
});

// Set the initial state of the button (optional)
document.getElementById('SRAdistanceMarkers').classList.add(areMarkersVisible ? 'active' : 'inactive');

// Toggle the visibility of distance markers and their labels
SRAdistanceMarkersButton.addEventListener('click', () => {
    areMarkersVisible = !areMarkersVisible;

    // Update the button's appearance based on the state
    const SRAdistanceMarkersButton = document.getElementById('SRAdistanceMarkers');
    if (areMarkersVisible) {
        SRAdistanceMarkersButton.classList.add('active');
        SRAdistanceMarkersButton.classList.remove('inactive');
        updateStatusBar('→ SRA Distance Markers On');
    } else {
        SRAdistanceMarkersButton.classList.add('inactive');
        SRAdistanceMarkersButton.classList.remove('active');
        updateStatusBar('→ SRA Distance Markers Off');
    }

    const markers = document.querySelectorAll('.distance-marker');
    const labels = document.querySelectorAll('.distance-label'); // Add this line to select labels
    markers.forEach(marker => {
        marker.style.display = areMarkersVisible ? 'block' : 'none';
    });
    labels.forEach(label => {  // Add this block to handle label visibility
        label.style.display = areMarkersVisible ? 'block' : 'none';
    });
});



// Set initial zoom level and create range rings
zoomSlider.value = initialZoomLevel; // Default zoom value
zoomLevel = initialZoomLevel;
createRangeRings();
updateTransform();


// Zoom functionality
zoomSlider.addEventListener('input', () => {
    zoomLevel = parseFloat(zoomSlider.value);
    createRangeRings();
    drawRunway();
    aircraftBlips.forEach(blip => blip.updateBlipPosition()); // Update blip positions after zooming

    if (areMarkersVisible) {
        const markers = document.querySelectorAll('.distance-marker');
        const labels = document.querySelectorAll('.distance-label');
        markers.forEach(marker => marker.style.display = 'block');
        labels.forEach(label => label.style.display = 'block');
    }

    try { window.dispatchEvent(new CustomEvent('radar-zoom', { detail: { zoomLevel: zoomLevel } })); } catch(e){}
});

zoomInButton.addEventListener('click', () => {
    zoomLevel = Math.min(zoomLevel + 1, 80);
    zoomSlider.value = zoomLevel;
    createRangeRings();
    drawRunway();
    aircraftBlips.forEach(blip => blip.updateBlipPosition()); // Update blip positions after zooming

    if (areMarkersVisible) {
        const markers = document.querySelectorAll('.distance-marker');
        const labels = document.querySelectorAll('.distance-label');
        markers.forEach(marker => marker.style.display = 'block');
        labels.forEach(label => label.style.display = 'block');
    }

    try { window.dispatchEvent(new CustomEvent('radar-zoom', { detail: { zoomLevel: zoomLevel } })); } catch(e){}
});

zoomOutButton.addEventListener('click', () => {
    zoomLevel = Math.max(zoomLevel - 1, 1);
    zoomSlider.value = zoomLevel;
    createRangeRings();
    drawRunway();
    aircraftBlips.forEach(blip => blip.updateBlipPosition()); // Update blip positions after zooming

    if (areMarkersVisible) {
        const markers = document.querySelectorAll('.distance-marker');
        const labels = document.querySelectorAll('.distance-label');
        markers.forEach(marker => marker.style.display = 'block');
        labels.forEach(label => label.style.display = 'block');
    }

    try { window.dispatchEvent(new CustomEvent('radar-zoom', { detail: { zoomLevel: zoomLevel } })); } catch(e){}
});



homeButton.addEventListener('click', resetToInitial);

// Mouse drag to pan
radarScope.addEventListener('mousedown', (event) => {
    if (isLabelDragging) return;  // Prevent panning if a label is being dragged

    isDragging = true;
    startX = event.clientX - panX;
    startY = event.clientY - panY;
});

document.addEventListener('mousemove', (event) => {
    if (isDragging && !isLabelDragging) {  // Allow panning only if a label is not being dragged
        panX = event.clientX - startX;
        panY = event.clientY - startY;
        updateTransform();
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});



// Calculate distance and bearing of the mouse pointer from center of the radar scope
function getDistanceAndBearing(x, y) {
    // Center of the radar scope (before panning)
    const centerX = radarScope.offsetWidth / 2;
    const centerY = radarScope.offsetHeight / 2;

    // Convert to radar scope coordinates (account for panning)
    const deltaX = x - (centerX + panX);
    const deltaY = y - (centerY + panY);

    // Calculate the distance in pixels
    const distancePixels = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Calculate the distance in nautical miles (adjust for zoom level)
    const distanceNM = distancePixels / (zoomLevel * 1.0); // 1.0 is a placeholder for the conversion factor for NM

    // Calculate the bearing in degrees (adjusted for the offset)
    let bearing = Math.atan2(deltaX, deltaY) * 180 / Math.PI; // Convert radians to degrees
    bearing = Math.abs((bearing - 180) % 360); // Normalize to 0-360 degrees

    return {
        distanceNM: distanceNM.toFixed(1), // Round to 1 decimal place
        bearing: bearing.toFixed(0).padStart(3, '0') // Ensure bearing is always 3 digits
    };
}

// Reference the display element in the HTML
const displayElement = document.getElementById('radarDisplay');

// Function to update the display element with distance and bearing
function updateDisplay(x, y) {
    if (!displayElement) return; // Ensure the display element exists

    const rect = radarScope.getBoundingClientRect();
    const result = getDistanceAndBearing(x - rect.left, y - rect.top);

    // Update the content of the display element
    displayElement.textContent = `${result.bearing}° / ${result.distanceNM} NM`;
}

// Event listener for mouse move to update the display
radarScope.addEventListener('mousemove', (event) => {
    const rect = radarScope.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    updateDisplay(mouseX, mouseY);
});


//******************Functions related to radar scope******************//
// Update the radar center on pan or zoom
function updateRadarCenter() {
    const rect = radarScope.getBoundingClientRect();
    radarCenter = {
        x: rect.width / 2,
        y: rect.height / 2
    };
}

function handleRadarResize() {
    updateRadarCenter();
    createRangeRings();
    drawRunway();
    aircraftBlips.forEach(blip => blip.updateBlipPosition());
    try {
        window.dispatchEvent(new CustomEvent('radar-zoom', { detail: { zoomLevel: zoomLevel } }));
        window.dispatchEvent(new CustomEvent('radar-transform', { detail: { panX: panX, panY: panY, zoomLevel: zoomLevel } }));
    } catch (e) { }
}

window.addEventListener('resize', () => {
    window.requestAnimationFrame(handleRadarResize);
});

// Handle radar panning
function panRadar(dx, dy) {
    // Code to pan the radar
    panContainer.style.transform = `translate(${dx}px, ${dy}px)`;
    updateRadarCenter(); // Update center after panning
}


// Calculate mouse position based on radar's original center and panned position
function calculatePosition(clientX, clientY) {
    const rect = radarScope.getBoundingClientRect();

    // Get current pan offsets (dx, dy) from the panContainer
    const styleTransform = window.getComputedStyle(panContainer).transform;
    let panMatrixLocal;
    try { panMatrixLocal = new DOMMatrix(styleTransform); } catch(e) { try { panMatrixLocal = new WebKitCSSMatrix(styleTransform); } catch(e2) { panMatrixLocal = null; } }
    const panX = panMatrixLocal ? (typeof panMatrixLocal.m41 !== 'undefined' ? panMatrixLocal.m41 : (typeof panMatrixLocal.e !== 'undefined' ? panMatrixLocal.e : 0)) : 0;
    const panY = panMatrixLocal ? (typeof panMatrixLocal.m42 !== 'undefined' ? panMatrixLocal.m42 : (typeof panMatrixLocal.f !== 'undefined' ? panMatrixLocal.f : 0)) : 0;

    // Calculate relative positions considering the panning
    const relativeX = (clientX - rect.left - radarCenter.x - panX) / zoomLevel;
    const relativeY = (radarCenter.y - (clientY - rect.top - panY)) / zoomLevel;

    return { x: relativeX, y: relativeY };
}


//Event listener to Toggle the visibility of labels and update the button's appearance
document.getElementById('label').addEventListener('click', () => {
    labelsVisible = !labelsVisible;

    // Get the label button element
    const labelButton = document.getElementById('label');

    // Update the button's appearance based on the current state
    if (labelsVisible) {
        labelButton.classList.add('active');
        labelButton.classList.remove('inactive');
        updateStatusBar('→ Labels Visible');
    } else {
        labelButton.classList.add('inactive');
        labelButton.classList.remove('active');
        updateStatusBar('→ Labels Hidden');
    }

    // Update visibility for all aircraft labels and lines
    aircraftBlips.forEach(blip => {
        if (blip.label) {
            blip.label.style.display = labelsVisible ? 'block' : 'none';
        }
        if (blip.line) {
            blip.line.style.display = labelsVisible ? 'block' : 'none';
        }
    });
});


//Function to smooth the appearance of zooming
function smoothZoom(targetZoomLevel) {
    const step = (targetZoomLevel - zoomLevel) / 10; // Adjust for smoothness

    function animateZoom() {
        zoomLevel += step;
        //updateZoomLevel(zoomLevel);
        //updateBlipPosition(); // Update the blip's position
        createRangeRings(); // Recreate elements based on new zoom
        drawRunway(); // Recalculate and redraw the runway

        if (Math.abs(targetZoomLevel - zoomLevel) > Math.abs(step)) {
            requestAnimationFrame(animateZoom);
        }
    }

    animateZoom();
}


//radar.js script file ends here


















