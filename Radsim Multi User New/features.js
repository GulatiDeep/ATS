// Functions to make the dialog boxes draggable (with clamping)
function makeDraggable(dialogId, handleId) {
    const dialog = document.getElementById(dialogId);
    const handle = document.getElementById(handleId);

    let offsetX = 0, offsetY = 0;
    let isDragging = false;
    let dragStart = false;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

        const rect = dialog.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        dragStart = true;

        dialog.style.left = `${rect.left}px`;
        dialog.style.top = `${rect.top}px`;
        dialog.style.bottom = 'auto';           // override bottom if set
        dialog.style.transform = 'none';        // cancel center transform

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!dragStart) return;

        // Start dragging only if the mouse moves enough
        if (!isDragging && (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2)) {
            isDragging = true;
        }

        if (isDragging) {
            // Clamp within viewport
            const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - dialog.offsetWidth));
            const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - dialog.offsetHeight));

            dialog.style.left = `${x}px`;
            dialog.style.top = `${y}px`;
        }
    }

    function onMouseUp() {
        isDragging = false;
        dragStart = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

makeDraggable('initialAircraftDialog', 'initialAircraftDialog');
makeDraggable('aircraftDialog', 'aircraftDialog');
makeDraggable("mappingDialog", "mappingDialog");
makeDraggable("settingsDialog", "settingsDialog");

//Function to produce beep sound or warnings
function initializeRadarAudio() {
    if (!radarAudioContext) {
        radarAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Function to start the app in fullscreen
function openFullscreen() {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) { // Firefox
        document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullscreen) { // Chrome, Safari and Opera
        document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) { // IE/Edge
        document.documentElement.msRequestFullscreen();
    }
}

// Attach event listeners to track window resizing or zooming
window.addEventListener('resize', () => {
    updateRadarCenter();
    createRangeRings();  // Reposition range rings correctly
    aircraftBlips.forEach(blip => blip.updateBlipPosition());
});

//Function to Open the Log Tab for tabbed browsing
function openLogTab(evt, cityName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(cityName).style.display = "block";
    evt.currentTarget.className += " active";
}


//To display current time on the radar scope
function updateRunningTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    document.getElementById("runningTime").textContent = `Time: ${timeString}`;
}

// Call it immediately to display time right away
updateRunningTime();

// Then update time every second
setInterval(updateRunningTime, 1000);
const startTime = Date.now();

// Function to pause or resume the exercise
function togglePause() {
    const pauseButton = document.getElementById('pauseButton');
    const rangeRingsContainer = document.querySelector('.range-rings');
    isPaused = !isPaused;

    if (isPaused) {
        pauseButton.textContent = '▶';
        pauseButton.title = 'Resume';
        updateStatusBar('→ Exercise paused.');
        disableControlPanel();

        rangeRingsContainer.style.animationPlayState = 'paused'; // Stop radar rings rotation
    } else {
        pauseButton.textContent = '⏸';
        pauseButton.title = 'Pause';
        updateStatusBar('→ Exercise resumed.');
        enableControlPanel();

        rangeRingsContainer.style.animationPlayState = 'running'; // Resume radar rings rotation

        moveAircraftBlips(); // Resume aircraft movements
    }

    // Immediately notify connected SRE viewers of pause/resume
    if (window._sreHost && typeof window._sreHost.broadcastState === 'function') {
        window._sreHost.broadcastState();
    }
}

// Attach event listener to the pause button (only if present)
const pauseBtnEl = document.getElementById('pauseButton');
if (pauseBtnEl) {
    pauseBtnEl.addEventListener('click', togglePause);
    pauseBtnEl.textContent = isPaused ? '▶' : '⏸';
    pauseBtnEl.title = isPaused ? 'Resume' : 'Pause';
}

// Function to disable the control panel inputs while paused
function disableControlPanel() {
    const controlPanel = document.getElementById('controlPanel');
    controlPanel.classList.add('disabled-panel');  // Disable interactions
}

// Function to enable the control panel inputs while resumed
function enableControlPanel() {
    const controlPanel = document.getElementById('controlPanel');
    controlPanel.classList.remove('disabled-panel');  // Enable interactions
}