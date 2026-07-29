
//********commands.js script file starts here**********/

// Aircraft Commands
function processCommand(blip) {
    const input = document.getElementById(`commandInput_${blip.callsign}`);
    const command = input.value.trim().toUpperCase();

    // Extract the formation callsign
    const formationCallsign = getFormationCallsign(blip.callsign);

    // Check if formationCallsign exists in the formationCallsigns array
    const isMemberOfFormation = formationCallsigns.includes(formationCallsign);

    if (isMemberOfFormation) {
        
        // Command is for a formation or its member
        if (blip.role === "Leader") {
            const checkbox = document.getElementById(`formationCheckbox_${blip.callsign}`);

            if (checkbox && checkbox.checked) {  // Propagate if checked
                console.log(`Command received by leader C/S ${blip.callsign} for formation ${formationCallsign}. Propagating "${command}" to formation members.`);
                speak(` Command received by ${formationCallsign}`);
                propagateCommandToFormation(formationCallsign, command);
            } else {
                console.log(`Command received by specific member: ${blip.callsign} of formation ${formationCallsign}.`);
                processCommandForBlip(blip, command);  // Execute only for the leader
                //const voiceCallsign = pronounceCallsign(blip.callsign);
                speak(` Command received by ${formationCallsign}`);
            }
        } else {
            console.log(`Command received by specific member: ${blip.callsign} of formation ${formationCallsign}.`);
            speak(`Command received by ${blip.callsign}`);
            processCommandForBlip(blip, command); // Execute for the specific member
        }
    } else {
        // Command is for an individual aircraft not part of any formation
        console.log(`Command received by individual aircraft: ${blip.callsign}.`);
        speak(`Command received by ${blip.callsign}`);
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
    const speedMatch = command.match(/^S(\d+)$/);
    const altitudeMatch = command.match(/^H(\d{1,2})$/);
    const verticalRateMatch = command.match(/^V(\d+)$/);
    const ssrMatch = command.match(/^SSR([0-7]{4})$/);

    let isValidCommand = false; // Track whether the command is valid

    console.log(`Command "${command}" being executed by C/S ${blip.callsign}.`);

    // Handle heading command
    if (headingMatch) {
        const direction = headingMatch[1];
        const targetHeading = parseInt(headingMatch[2], 10);

        blip.orbitLeft = false;
        blip.orbitRight = false;

        blip.turnRight = direction === 'R'; // Set turning direction
        blip.setTargetHeading(targetHeading);

        const turnDirection = direction === 'L' ? 'Left' : 'Right';
        updateStatusBar(`Aircraft ${blip.callsign} turning ${turnDirection} heading ${blip.targetHeading}°`);
        isValidCommand = true;
        const voiceHeading = pronounceHeading(blip.targetHeading);
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(`${voiceCallsign} Turning ${turnDirection} Heading ${voiceHeading}`);
    }

    // Handle speed command
    else if (speedMatch) {
        const speed = parseInt(speedMatch[1], 10);
        blip.setTargetSpeed(speed);
        updateStatusBar(`Aircraft ${blip.callsign} speed set to ${speed} knots.`);
        isValidCommand = true;
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(` Setting speed to ${speed} knots ${voiceCallsign}`);
    }

    // Handle altitude command
    else if (altitudeMatch) {
        const altitude = parseInt(altitudeMatch[1], 10) * 100;
        blip.targetAltitude = altitude;
        updateStatusBar(`Aircraft ${blip.callsign} target altitude set to ${altitude} feet.`);
        isValidCommand = true;
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(` Setting altitude to ${altitude} feet ${voiceCallsign}`);
    }

    // Handle vertical rate command
    else if (verticalRateMatch) {
        const rate = parseInt(verticalRateMatch[1], 10);
        blip.verticalClimbDescendRate = rate;
        updateStatusBar(`Aircraft ${blip.callsign} vertical rate set to ${rate} feet per minute.`);
        isValidCommand = true;
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(` Changing Vertical Rate of Climb to ${rate} feet per minute ${voiceCallsign}`);
    }

    // Handle SSR code command
    else if (ssrMatch) {
        const newSSRCode = ssrMatch[1];

        if (!['7500', '7600', '7700'].includes(newSSRCode)) {
            const existingSSR = aircraftBlips.find(b => b.ssrCode === newSSRCode);
            if (existingSSR && newSSRCode !== '0000') {
                updateStatusBar(`Duplicate SSR code. Aircraft ${existingSSR.callsign} already squawking ${existingSSR.ssrCode}`);
                //const voiceCallsign = pronounceCallsign(existingSSR.callsign);
                //const voiceSSR = pronounce(existingSSR.ssrCode);
                //speak(`Duplicate SSR code. ${voiceCallsign} already squawking ${voiceSSR}`);
                return;
            }
        }

        blip.setSSRCode(newSSRCode);
        updateStatusBar(`Aircraft ${blip.callsign} SSR code set to 3-${newSSRCode}`);
        //const voiceCallsign = pronounceCallsign(blip.callsign);
        //const voiceSSR = pronounce(newSSRCode);
        //speak(`Squawking ${voiceSSR},${voiceCallsign}` );
        isValidCommand = true;
    }

    // Handle report heading command
    else if (command === "RH") {
        const formattedHeading = String(Math.round(blip.heading) % 360).padStart(3, '0');
        updateStatusBar(`Aircraft ${blip.callsign} heading: ${formattedHeading}°`);
        isValidCommand = true;
        //const voiceHeading = pronounceHeading(formattedHeading);
        //const voiceCallsign = pronounceCallsign(blip.callsign);
        //speak(`${voiceCallsign}  Heading ${voiceHeading}`);
    }

    // Handle delete command
    else if (command === "DEL") {
        deleteAircraft(blip);
        updateStatusBar(`Aircraft ${blip.callsign} deleted.`);
        isValidCommand = true;

    }

    // Handle orbit left command
    else if (command === "OL") {
        blip.startOrbitLeft();
        updateStatusBar(`Aircraft ${blip.callsign} orbiting left.`);
        isValidCommand = true;
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(` Orbiting Left ${voiceCallsign}`);
    }

    // Handle orbit right command
    else if (command === "OR") {
        blip.startOrbitRight();
        updateStatusBar(`Aircraft ${blip.callsign} orbiting right.`);
        isValidCommand = true;
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(` Orbiting Right ${voiceCallsign}`);
    }

    // Handle stop turn command
    else if (command === "ST") {
        blip.stopTurn();
        const formattedHeading = String(Math.round(blip.heading) % 360).padStart(3, '0');
        updateStatusBar(`Aircraft ${blip.callsign} stopping turn heading: ${formattedHeading}°.`);
        isValidCommand = true;
        const voiceHeading = pronounceHeading(formattedHeading);
        const voiceCallsign = pronounceCallsign(blip.callsign);
        speak(`${voiceCallsign} Stopping Turn Heading ${voiceHeading}`);
    }

    // Handle invalid command
    else {
        updateStatusBar(`Invalid command: ${command}.`);
    }

    // Update the last command display
    const lastCommandDisplay = document.getElementById(`lastCommand_${blip.callsign}`);
    if (lastCommandDisplay) {
        lastCommandDisplay.textContent = `${command}`;
        lastCommandDisplay.style.backgroundColor = isValidCommand ? 'lightgreen' : 'lightcoral'; // Green for valid, red for invalid
    }

}

/****Speaking Commands *******/
/****Functions to pronounce callsign and heading for acknowledgement of commands */
function pronounceCallsign(callsign) {
    const phoneticAlphabet = {
        'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo', 'F': 'Foxtrot', 'G': 'Golf',
        'H': 'Hotel', 'I': 'India', 'J': 'Juliett', 'K': 'Kilo', 'L': 'Lima', 'M': 'Mike', 'N': 'November',
        'O': 'Oscar', 'P': 'Papa', 'Q': 'Quebec', 'R': 'Romeo', 'S': 'Sierra', 'T': 'Tango', 'U': 'Uniform',
        'V': 'Victor', 'W': 'Whiskey', 'X': 'X-ray', 'Y': 'Yankee', 'Z': 'Zulu',
        '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
        '8': 'Eight', '9': 'Nine'
    };

    // Define a mapping for formation callsigns (names like "Cola", "Limca", "Thunder")
    const formationCallsigns = [
        "Limca", //1
        "Rhino", //2
        "Spider", //3
        "Thunder", //4
        "Maza", //5
        "Cobra", //6
        "Cola", //7
        "Khanjar", //8
        "Mica", //9
        "Loki", //10
        "Tusker" //11
    ];

    // Check if the callsign is a formation name (like "Cola", "Limca", "Thunder")
    if (formationCallsigns.includes(callsign)) {
        return callsign; // Return the callsign as is for formation names
    }

    // If no formation name is found, proceed with phonetic conversion for the entire callsign
    return callsign
        .split('')
        .map(char => phoneticAlphabet[char.toUpperCase()] || phoneticAlphabet[char] || char) // Convert letters and digits
        .join(' ');
}


function pronounceHeading(heading) {
    const formattedHeading = formatHeading(heading);
    return formattedHeading
        .split('')
        .map(digit => ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][parseInt(digit)])
        .join(' ');
}

function pronounce(number) {
    return number
        .split('')
        .map(digit => ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][parseInt(digit)])
        .join(' ');
}

function formatHeading(heading) {
    // Ensures the heading is a 3-digit string (e.g., "005" instead of "5")
    return String(heading).padStart(3, '0');
}
//********commands.js script file ends here**********/

/*****voiceCommands.js script file starts here */


/*******Voice Commands handling */

// Function to handle voice command

// Function to handle voice command
function handleVoiceCommand(command) {
    if (!speechActivated) {
        console.log('Speech synthesis not activated');
        return;
    }

    // Normalize command and trim spaces
    const normalizedCommand = normalizeCommand(command.toLowerCase().trim());
    console.log('Normalized Voice command:', normalizedCommand);

    // Regex to extract the base callsign, number (if present), and command
    const match = normalizedCommand.match(/^(\w+)(?:\s+(\d+))?\s+(.*)$/);

    if (match) {
        let callsign = match[1];
        const number = match[2]; // Extract number if present (e.g., '1' in 'Cola 1')
        const userCommand = match[3]; // Remaining part of the command

        // Normalize the callsign for consistency (e.g., mapping 'kola' to 'cola' if needed)
        callsign = normalizeCallsign(callsign);
        console.log(`Identified base callsign: ${callsign}`);

        // Check if a number is specified (e.g., 'Cola 1')
        if (number) {
            // Handle individual member of the formation
            const memberCallsign = `${callsign}-${number}`;
            console.log(`Identified specific formation member: ${memberCallsign}`);
            // Here, proceed with issuing the command to the specific formation member
        } else {
            // Handle the base callsign (e.g., 'Cola') for the whole formation
            console.log(`Identified base callsign for formation: ${callsign}`);
            // Here, you can handle command propagation to all formation members
        }

    } else {
        console.warn('Failed to match voice command structure:', command);
    }
}


// Normalize to handle common mispronunciations
function normalizeCommand(command) {
    // Replace common misrecognitions
    const replacements = {
        'handing': 'heading',
        'into': 'heading', // Replacing into  as heading
        'in': 'heading' // replacing in as heading
    };
    for (let [incorrect, correct] of Object.entries(replacements)) {
        command = command.replace(new RegExp(`\\b${incorrect}\\b`, 'g'), correct);
    }
    return command.trim();
}


function normalizeCallsign(callsign) {
    // Map for phonetic alphabet to single-letter conversions
    const phoneticMap = {
        'alpha': 'A', 'bravo': 'B', 'charlie': 'C', 'delta': 'D', 'echo': 'E',
        'foxtrot': 'F', 'golf': 'G', 'hotel': 'H', 'india': 'I', 'juliett': 'J',
        'kilo': 'K', 'lima': 'L', 'mike': 'M', 'november': 'N', 'oscar': 'O',
        'papa': 'P', 'quebec': 'Q', 'romeo': 'R', 'sierra': 'S', 'tango': 'T',
        'uniform': 'U', 'victor': 'V', 'whiskey': 'W', 'x-ray': 'X', 'yankee': 'Y', 'zulu': 'Z'
    };

    // Normalize input callsign to lowercase and trim whitespace
    let normalized = callsign.toLowerCase().trim();

    // Handle formation callsigns (e.g., "Cola 1" -> "Cola-1")
    const formationMatch = normalized.match(/^(\w+)\s*(\d)$/);
    if (formationMatch) {
        const formationCallsign = formationMatch[1];
        const number = formationMatch[2];
        if (number >= '1' && number <= '4') {
            return `${formationCallsign.toUpperCase()}-${number}`;
        }
    }

    // Handle phonetic-based callsigns (e.g., "Victory Charlie Golf" -> "VCG")
    const words = normalized.split(/\s+/);
    let result = '';
    let allPhonetic = true;

    for (const word of words) {
        if (phoneticMap[word]) {
            result += phoneticMap[word];
        } else {
            allPhonetic = false;
            result += word; // If it's not in the phonetic map, keep as-is
        }
    }

    // If all words are phonetic letters, return the compressed result
    if (allPhonetic) {
        return result.toUpperCase();
    }

    return callsign.toUpperCase(); // Default to returning the original callsign in uppercase if no match
}



/********* voiceCommands.js script file ends here */