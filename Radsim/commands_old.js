//Commands
// RH : Report Heading
// R090 or L090: Turn Right or Left Heading 090
// H20: To climb or descend to 2000 ft
// V4000: To set the rate of climb/descend to 4000 ft per minute
// S600: To set the speed to 600 knots
// DEl: To delete the aircraft
// SSR1000: Set the squawk code to 1000

// Initialize the SpeechRecognition API
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true; // Keep recognizing as long as the user is speaking
recognition.interimResults = false; // Don't show intermediate results

// Start recognition when the page loads
recognition.start();

// Event handler for when speech recognition starts
recognition.onstart = () => {
    console.log('Speech recognition started');
};

// Event handler for when speech is recognized
recognition.onresult = (event) => {
    const results = event.results;
    const command = results[results.length - 1][0].transcript.toLowerCase().trim();
    console.log('Controller: ' + command);
    updateStatusBar('Radar: ' + command);

    // Handle the recognized command
    handleVoiceCommand(command);
};

// Event handler for errors
recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    restartRecognition(); // Restart recognition on error
};

// Event handler for when speech recognition ends
recognition.onend = () => {
    console.log('Speech recognition ended');
    restartRecognition(); // Restart recognition when it ends
};

// Function to restart speech recognition
function restartRecognition() {
    // Stop and then start recognition
    recognition.stop();
    setTimeout(() => {
        recognition.start();
    }, 1000); // Wait for 1 second before restarting
}

// Flag to track if speech synthesis has been activated
let speechActivated = true;

// Function to activate speech synthesis
document.getElementById('activateSpeech').addEventListener('click', () => {
    speechActivated = true;
    document.getElementById('activateSpeech').style.display = 'none'; // Hide the button after activation
});

// Function to speak out a message
function speak(text) {
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    speechSynthesis.speak(speech);
}

// Function to handle voice command
function handleVoiceCommand(command) {
    if (!speechActivated) {
        console.log('Speech synthesis not activated');
        return;
    }

    // Normalize command and trim spaces
    const normalizedCommand = command.toLowerCase().trim();
    console.log('Normalized command:', normalizedCommand);

    // Extract heading if present
    const headingMatch = normalizedCommand.match(/(\d{3})/);
    const heading = headingMatch ? headingMatch[1] : null;

    if (normalizedCommand.includes('report heading')) {
        // No heading is needed for this command
        const currentHeading = aircraftDirection ? aircraftDirection.toFixed(0).padStart(3, '0') : '000'; // Get the current heading of the aircraft
        const message = `Heading ${currentHeading}`;
        speak(message);
        updateStatusBar('Pilot: ' + message); // Update status bar with the spoken message
    } else if (normalizedCommand.includes('turn right heading') && heading) {
        const message = `Roger, Turning Right Heading ${heading}`;
        speak(message);
        updateStatusBar('Pilot: ' + message);
        turnAircraft('right', heading); // Function to turn aircraft to the specified heading
    } else if (normalizedCommand.includes('turn left heading') && heading) {
        const message = `Roger, Turning Left Heading ${heading}`;
        speak(message);
        updateStatusBar('Pilot: ' + message);
        turnAircraft('left', heading); // Function to turn aircraft to the specified heading
    } else if (normalizedCommand.includes('make heading') && heading) {
        const message = `Roger, Heading ${heading}`;
        speak(message);
        updateStatusBar('Pilot: ' + message);
        setAircraftHeading(heading); // Function to set aircraft to the specified heading
    } else {
        speak('Say again');
        updateStatusBar('Pilot: Say Again');
    }
}

// Function to turn the aircraft
function turnAircraft(direction, heading) {
    // Logic to turn the aircraft in the specified direction to the given heading
    console.log(`Pilot: Turning ${direction} to heading ${heading}`);
    // Implement turning logic here
}

// Function to set the aircraft heading
function setAircraftHeading(heading) {
    // Logic to set the aircraft's heading
    console.log(`Pilot: Setting heading to ${heading}`);
    // Implement heading setting logic here
}


// Aircraft Commands
function processCommand(blip) {
    const input = document.getElementById(`commandInput_${blip.callsign}`);
    const command = input.value.trim().toUpperCase();
    const headingMatch = command.match(/^([LR])(\d{3})$/);
    const speedMatch = command.match(/^S(\d+)$/);
    const altitudeMatch = command.match(/^H(\d{1,2})$/);
    const verticalRateMatch = command.match(/^V(\d+)$/);
    const ssrMatch = command.match(/^SSR([0-7]{4})$/); // SSR should be a 4-digit octal number

    // Handle heading command
    if (headingMatch) {
        const direction = headingMatch[1];
        const targetHeading = parseInt(headingMatch[2], 10);

        // Stop any ongoing orbit when a specific heading is given
        blip.orbitLeft = false;
        blip.orbitRight = false;

        let turnDirection = null;

        if (direction === 'L') {
            blip.turnRight = false;  // Turn left (counterclockwise)
            blip.setTargetHeading(targetHeading);
            turnDirection = `Left`;
        } else if (direction === 'R') {
            blip.turnRight = true;  // Turn right (clockwise)
            blip.setTargetHeading(targetHeading);
            turnDirection = `Right`;
        }

        updateStatusBar(`Aircraft ${blip.callsign} turning ${turnDirection} heading ${blip.targetHeading}°`);
    }

    // Handle speed command
    else if (speedMatch) {
        const speed = parseInt(speedMatch[1], 10);
        blip.setTargetSpeed(speed);  // Set target speed for gradual change
        updateStatusBar(`Aircraft ${blip.callsign} speed set to ${speed} knots.`);

        const speedElement = document.getElementById(`speed_${blip.callsign}`);
        //if (speedElement) {
           // speedElement.textContent = `N${blip.speed}`;  // Update speed in control box
        //}

        //blip.updateLabelInfo();  // Update label with new speed
    }

    // Handle altitude command
    else if (altitudeMatch) {
        const altitude = parseInt(altitudeMatch[1], 10) * 100;
        blip.targetAltitude = altitude;  // Set target altitude for gradual change
        updateStatusBar(`Aircraft ${blip.callsign} target altitude set to ${altitude} feet.`);

        const altitudeElement = document.getElementById(`altitude_${blip.callsign}`);
        //if (altitudeElement) {
           // altitudeElement.textContent = `${blip.targetAltitude / 100}`;  // Update altitude in control box
        //}
    }

    // Handle vertical climb/descent rate command
    else if (verticalRateMatch) {
        const rate = parseInt(verticalRateMatch[1], 10);
        blip.verticalClimbDescendRate = rate;  // Set vertical climb/descent rate
        updateStatusBar(`Aircraft ${blip.callsign} vertical rate set to ${rate} feet per minute.`);
    }

    //Handle SSR code changes commands
    else if (ssrMatch) {
        const newSSRCode = ssrMatch[1];  // Get the SSR code from the command

        // Allow duplication for 7500, 7600, and 7700
        if (newSSRCode !== '7500' && newSSRCode !== '7600' && newSSRCode !== '7700') {
            const existingSSR = aircraftBlips.find(blip => blip.ssrCode === newSSRCode);

            if (existingSSR && newSSRCode !== '0000') {
                updateStatusBar(`Duplicate SSR code. Aircraft ${existingSSR.callsign} already squawking ${existingSSR.ssrCode}`);
                return;
            }
        }

        // Update the aircraft's SSR code if it's not a duplicate or is an emergency code
        blip.setSSRCode(newSSRCode);
        updateStatusBar(`Aircraft ${blip.callsign} SSR code set to 3-${newSSRCode}`);
    }


    // Handle Report Heading command
    else if (command === "RH") {
        updateStatusBar(`Aircraft ${blip.callsign} heading: ${blip.heading}°`);
    }

    // Handle aircraft Delete command
    else if (command === "DEL") {
        deleteAircraft(blip);
        updateStatusBar(`Aircraft ${blip.callsign} deleted.`);
    }

    // Handle orbit left (OL) command
    else if (command === "OL") {
        blip.startOrbitLeft();
        updateStatusBar(`Aircraft ${blip.callsign} orbiting left.`);
    }

    // Handle orbit right (OR) command
    else if (command === "OR") {
        blip.startOrbitRight();
        updateStatusBar(`Aircraft ${blip.callsign} orbiting right.`);
    }

    // Handle stop turn (ST) command
    else if (command === "ST") {
        blip.stopTurn();
        updateStatusBar(`Aircraft ${blip.callsign} stopping turn.`);
    }

    //Handle invalid command
    else {
        updateStatusBar(`Invalid command: ${command}.`);
    }

    // Update last command display
    const lastCommandDisplay = document.getElementById(`lastCommand_${blip.callsign}`);
    lastCommandDisplay.textContent = `${command}`;

    input.value = '';  // Clear input after processing
}
