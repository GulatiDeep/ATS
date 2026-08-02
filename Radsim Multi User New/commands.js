
//********commands.js script file starts here**********/


// Aircraft Commands
function processCommand(blip, cmd) {
    const input = document.getElementById(`commandInput_${blip.callsign}`);
    //const command = input.value.trim().toUpperCase();
    const command = cmd || input.value.trim().toUpperCase(); // Use provided command or get it

    // Extract the formation callsign
    const formationCallsign = getFormationCallsign(blip.callsign);

    // Check if formationCallsign exists in the formationCallsigns array
    const isMemberOfFormation = formationCallsigns.includes(formationCallsign);

    if (isMemberOfFormation) {

        // Command is for a formation or its member
        if (blip.role === "Leader") {
            const checkbox = document.getElementById(`formationCheckbox_${blip.callsign}`);

            if (checkbox && checkbox.checked) {  // Propagate if checked

                //Logging into console
                console.log(`→ "${command}" command received by ${blip.callsign} for formation ${formationCallsign}.\n`);

                //Logging into Command Log
                commandLogs.innerHTML += `<br><br>→ "<b style="color: blue">${command}</b>" command received by "<b style="color: blue">${blip.callsign}</b>" for formation "<b style="color: blue">${formationCallsign}</b>". `;

                propagateCommandToFormation(formationCallsign, command);

            } else {
                //Logging into console
                console.log(`→ "${command}" command received by ${blip.callsign}`);

                //Logging into Command Log
                commandLogs.innerHTML += `<br><br>→ "<b style="color: blue">${command}</b>" command received by "<b style="color: blue">${blip.callsign}</b>". `;

                processCommandForBlip(blip, command);  // Execute only for the leader
            }
        } else {
            //Logging into console
            console.log(`→ "${command}" command received by ${blip.callsign}.`);

            //Logging into Command Log
            commandLogs.innerHTML += `<br><br>→ "<b style="color: blue">${command}</b>" command received by "<b style="color: blue">${blip.callsign}</b>". `;

            processCommandForBlip(blip, command); // Execute for the specific member
        }
    } else {
        // Command is for an individual aircraft not part of any formation
        //Logging into console
        console.log(`→ "${command}" command received by ${blip.callsign}.`);

        //Logging into Command Log
        commandLogs.innerHTML += `<br><br>→ "<b style="color: blue">${command}</b>" command received by "<b style="color: blue">${blip.callsign}</b>". `;

        processCommandForBlip(blip, command);
    }

    input.value = ''; // Clear input after processing
}


// Function to propagate commands to formation members in reverse order (last to first)
function propagateCommandToFormation(formationCallsign, command) {
    // Loop backwards from the last aircraft in the formation to the first (including the leader)
    for (let i = 1; i <= 4; i++) {
        const currentCallsign = `${formationCallsign}-${i}`;
        const currentBlip = aircraftBlips.find(blip => blip.callsign === currentCallsign);

        if (currentBlip) {
            processCommandForBlip(currentBlip, command); // Execute the command for each aircraft
        }
    }
}

// Function to process a specific command for an individual aircraft or formation member
function processCommandForBlip(blip, command) {
    const headingMatch = command.match(/^([LR])(\d{3})$/);
    const rotMatch = command.match(/^ROT([1-9]|10)$/);
    const speedMatch = command.match(/^S(\d+)$/);
    const altitudeMatch = command.match(/^H(\d{1,3})$/);
    const verticalRateMatch = command.match(/^V(\d+)$/);
    const ssrMatch = command.match(/^SSR([0-7]{4})$/);

    let isValidCommand = false; // Track whether the command is valid

    // Handle heading command
    if (headingMatch) {
        const direction = headingMatch[1];
        const targetHeading = parseInt(headingMatch[2], 10);

        blip.orbitLeft = false;
        blip.orbitRight = false;

        blip.turnRight = direction === 'R'; // Set turning direction
        blip.setTargetHeading(targetHeading);

        const turnDirection = direction === 'L' ? 'Left' : 'Right';
        updateStatusBar(`→ ${blip.callsign} turning ${turnDirection} heading ${blip.targetHeading}°`);
        isValidCommand = true;


    }

    // Handle ROT command (turn rate)
    else if (rotMatch) {
        const rot = parseInt(rotMatch[1], 10);
        blip.headingChangeRate = rot;   // degrees per second
        updateStatusBar(`→ ${blip.callsign} Rate of Turn set to ${rot}°/s.`);
        isValidCommand = true;

    }


    // Handle speed command
    else if (speedMatch) {
    const speed = parseInt(speedMatch[1], 10);
    blip.setTargetSpeed(speed);
    updateStatusBar(`→ ${blip.callsign} speed set to ${speed} knots.`);
    isValidCommand = true;


}


else if (altitudeMatch) {
    const altitude = parseInt(altitudeMatch[1], 10) * 100;
    blip.targetAltitude = altitude;
    updateStatusBar(`→ Aircraft ${blip.callsign} target altitude set to ${altitude} feet.`);
    isValidCommand = true;

}


// Handle vertical rate command
else if (verticalRateMatch) {
    const rate = parseInt(verticalRateMatch[1], 10);
    blip.verticalClimbDescendRate = rate;
    updateStatusBar(`→ Aircraft ${blip.callsign} vertical rate set to ${rate} feet per minute.`);
    isValidCommand = true;


}

// Handle SSR code command
else if (ssrMatch) {
    const newSSRCode = ssrMatch[1];

    if (!['7500', '7600', '7700'].includes(newSSRCode)) {
        const existingSSR = aircraftBlips.find(b => b.ssrCode === newSSRCode);
        if (existingSSR && newSSRCode !== '0000') {
            updateStatusBar(`→ Duplicate SSR code. Aircraft ${existingSSR.callsign} already squawking ${existingSSR.ssrCode}`);
            return;
        }
    }

    blip.setSSRCode(newSSRCode);
    updateStatusBar(`→ Aircraft ${blip.callsign} SSR code set to 3-${newSSRCode}`);
    isValidCommand = true;

    blip.updateLabelInfo();
}

// Handle report heading command
else if (command === "RH") {
    const formattedHeading = String(Math.round(blip.heading) % 360).padStart(3, '0');
    updateStatusBar(`→ Aircraft ${blip.callsign} heading: ${formattedHeading}°`);
    isValidCommand = true;

}

// Handle delete command
else if (command === "DEL") {
    deleteAircraft(blip);
    updateStatusBar(`→ ${blip.callsign} deleted.`);
    isValidCommand = true;

}

// Handle orbit left command
else if (command === "OL") {
    blip.startOrbitLeft();
    updateStatusBar(`→ ${blip.callsign} orbiting left.`);
    isValidCommand = true;

}

// Handle orbit right command
else if (command === "OR") {
    blip.startOrbitRight();
    updateStatusBar(`→ ${blip.callsign} orbiting right.`);
    isValidCommand = true;


}

// Handle stop turn command
else if (command === "ST") {
    blip.stopTurn();
    const formattedHeading = String(Math.round(blip.heading) % 360).padStart(3, '0');
    updateStatusBar(`→ ${blip.callsign} stopping turn heading: ${formattedHeading}°.`);
    isValidCommand = true;


}

// Handle IDENT command
else if (command === "IDENT") {
    blip.showIdentEffect();  // Call method in AircraftBlip
    updateStatusBar(`→ Aircraft ${blip.callsign} squawking IDENT.`);
    isValidCommand = true;
}


// Handle invalid command
else {
    updateStatusBar(`→ Invalid command: ${command}.`);

}

// Update the last command display
const lastCommandDisplay = document.getElementById(`lastCommand_${blip.callsign}`);
if (lastCommandDisplay) {
    lastCommandDisplay.textContent = `${command}`;
    lastCommandDisplay.style.backgroundColor = isValidCommand ? 'lightgreen' : 'lightcoral'; // Green for valid, red for invalid
}

}

/****Speaking Commands *******/


function formatHeading(heading) {
    // Ensures the heading is a 3-digit string (e.g., "005" instead of "5")
    return String(heading).padStart(3, '0');
}
//********commands.js script file ends here**********/


