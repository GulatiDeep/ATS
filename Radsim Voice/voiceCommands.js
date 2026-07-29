/*****voiceCommands.js script file starts here */


/*******Voice Commands handling */

// Function to handle voice command
function handleVoiceCommand(command) {
    if (!speechActivated) {
        console.log('Speech synthesis not activated');
        return;
    }

    // Step 1: Apply command replacements (e.g., fix common mistakes)
    const replacedCommand = applyReplacements(command.toLowerCase().trim());

    // Step 2: Normalize command input and parse callsign and remaining command
    const input = normalizeCommandInput(replacedCommand);
    const callsign = input.callsign;
    const callsignType = input.callsignType;
    const parsedCommand = parseCommand(input.remainingCommand);

    // Step 3: Check if the individual callsign exists in the allAircraftCallsigns array
    if (callsignType === 'individual') {
        if (allAircraftCallsigns.includes(callsign)) {
            console.log(`Callsign ${callsign} exists`);

            // Step 3.1: Get the blip object using the callsign
            const blip = getBlipByCallsign(callsign);

            if (!blip) {
                console.warn(`Blip details not found for ${callsign}`);
                return;
            }

            //Step 3.2: Execute command for individual aircraft
            console.log(`Command executing for individual aircraft: ${callsign}.`);
            processCommandForBlip(blip, parsedCommand);

            const voiceCallsign = pronounceCallsign(callsign);
            speak(`${voiceCallsign}, ${voiceAction}`);

        } else {
            console.warn(`${callsign} does not exist on radar scope`);
            return;
        }
    }

    // Step 4: Check if the formation callsign exists in the allAircraftCallsigns array
    if (callsignType === 'formation') {
        // Check if any callsign in the array starts with the given callsign
        const formationCallsignExists = allAircraftCallsigns.some(existingCallsign =>
            existingCallsign.startsWith(callsign)
        );

        if (formationCallsignExists) {
            console.log(`Formation callsign ${callsign} exists`);
            // Loop backwards from the last aircraft in the formation to the first (including the leader)
            for (let i = 1; i <= 4; i++) {
                const currentCallsign = `${callsign}-${i}`;
                const currentBlip = aircraftBlips.find(blip => blip.callsign === currentCallsign);

                if (currentBlip) {
                    processCommandForBlip(currentBlip, parsedCommand); // Execute the command for each aircraft
                }
            }
            
            const voiceCallsign = pronounceCallsign(callsign);
            speak(`${voiceCallsign}, ${voiceAction}`);

        } else {
            console.warn(`Formation callsign ${callsign} does not exist on radar scope`);
            speak(`Formation callsign ${callsign} not found. Please check the callsign.`);
            return;
        }
    }

    // Step 5: Clear input after processing
    const inputElement = document.getElementById(`commandInput_${input.callsign}`);
    if (inputElement) {
        inputElement.value = ''; // Clear input field after processing
    }

}

function normalizeCommandInput(command) {
    const phoneticMap = {
        'alpha': 'A', 'bravo': 'B', 'charlie': 'C', 'delta': 'D', 'echo': 'E',
        'foxtrot': 'F', 'golf': 'G', 'hotel': 'H', 'india': 'I', 'juliett': 'J',
        'kilo': 'K', 'lima': 'L', 'mike': 'M', 'november': 'N', 'oscar': 'O',
        'papa': 'P', 'quebec': 'Q', 'romeo': 'R', 'sierra': 'S', 'tango': 'T',
        'uniform': 'U', 'victor': 'V', 'whiskey': 'W', 'x-ray': 'X', 'yankee': 'Y', 'zulu': 'Z',
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
    };

    // Normalize the command to lowercase and split into words
    const words = command.split(/\s+/);

    let callsign = '';
    let remainingCommand = '';
    let callsignType = '';

    // Step 1: Check if the first word exists in the phonetic map or is a number/letters-based callsign
    if (phoneticMap[words[0]] || isNumeric(words[0])) {
        // If the first word is a phonetic map value or a number (like '1', '2', etc.)
        callsign = phoneticMap[words[0]] || words[0]; // Use phonetic number or digit itself

        let nextWord = 1;
        // Loop through the next two words and add them to the callsign if they match the phonetic map or are numeric
        while (nextWord < 3 && (phoneticMap[words[nextWord]] || isNumeric(words[nextWord]))) {
            callsign += phoneticMap[words[nextWord]] || words[nextWord].substring(0, 1); // Limit numeric part to first 1 digit or letter
            nextWord++;
        }

        // Now, we extract the remaining part of the input (which could be a command) after the callsign
        remainingCommand = words.slice(nextWord).join(' '); // The rest is the command to execute

        // Ensure the callsign does not exceed 3 characters (if numeric, limit to 3 digits)
        if (isNumeric(callsign) && callsign.length > 3) {
            additionalCommandInCallsign = callsign.substring(3, callsign.length); // extract the remaining digits as part of command
            callsign = callsign.substring(0, 3); // Limit to first 3 digits
            remainingCommand = additionalCommandInCallsign + ' ' + remainingCommand; // Add the remaining digits to the command
        }
        callsignType = 'individual';
    }

    //Step 2: Check it its a formation callsign
    else if (!isNumeric(words[0])) {
        // Step 2: If the first word is a formation prefix, check the second word
        if (phoneticMap[words[1]] || ['1', '2', '3', '4'].includes(words[1])) {
            // If the second word is a phonetic number or a digit from 1 to 4
            const number = phoneticMap[words[1]] || words[1]; // Use phonetic number or the digit itself
            callsign = words[0].charAt(0).toUpperCase() + words[0].slice(1) + '-' + number;
            remainingCommand = words.slice(2).join(' '); // The rest is the command to execute
            callsignType = 'individual';
        } else {
            // No valid number or phonetic map after formation callsign, treat as a formation callsign without a suffix
            callsign = words[0].charAt(0).toUpperCase() + words[0].slice(1); // Capitalize and use as the callsign without a suffix
            remainingCommand = words.slice(1).join(' '); // The rest is the command to execute
            callsignType = 'formation';
        }
    }

    // Return the result as an object
    return {
        callsignType: callsignType,
        callsign: callsign,
        remainingCommand: remainingCommand
    };
}

function parseCommand(remainingCommand) {
    // Define phonetic map for numbers (this will be used for "Turn" commands)
    const phoneticMap = {
        'alpha': 'A', 'bravo': 'B', 'charlie': 'C', 'delta': 'D', 'echo': 'E',
        'foxtrot': 'F', 'golf': 'G', 'hotel': 'H', 'india': 'I', 'juliett': 'J',
        'kilo': 'K', 'lima': 'L', 'mike': 'M', 'november': 'N', 'oscar': 'O',
        'papa': 'P', 'quebec': 'Q', 'romeo': 'R', 'sierra': 'S', 'tango': 'T',
        'uniform': 'U', 'victor': 'V', 'whiskey': 'W', 'x-ray': 'X', 'yankee': 'Y', 'zulu': 'Z',
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
    };

    // Normalize the remaining command to lowercase and split it into words
    const words = remainingCommand.toLowerCase().split(/\s+/);

    let parsedCommand = '';

    // Check if it's a known command
    switch (words[0]) {
        case 'report':
            if (words[1] === 'heading') {
                parsedCommand = 'RH'; // "report heading" → "RH"
            }
            break;

        case 'orbit':
            if (words[1] === 'left') {
                parsedCommand = 'OL'; // "Orbit Left" → "OL"
            } else if (words[1] === 'right') {
                parsedCommand = 'OR'; // "Orbit Right" → "OR"
            }
            break;

        case 'turn':
            if (words[1] === 'right' && words[2] === 'heading') {
                // Extract 3-digit number or phonetic number
                const number = getNumber(words[3], phoneticMap);
                if (number) {
                    parsedCommand = `R${number}`; // "Turn right heading <number>" → "R<number>"
                }
            } else if (words[1] === 'left' && words[2] === 'heading') {
                // Extract 3-digit number or phonetic number
                const number = getNumber(words[3], phoneticMap);
                if (number) {
                    parsedCommand = `L${number}`; // "Turn left heading <number>" → "L<number>"
                }
            }
            break;

        case 'climb':
            if (words[1] === 'to' && words[3] === 'thousand' && words[4] === 'feet') {
                const number = getNumber(words[2], phoneticMap);
                if (number) {
                    parsedCommand = `H${number * 10}`; // "Climb to <number> thousand feet" → "H<number*10>"
                }
            }
            break;

        case 'descend':
            if (words[1] === 'to' && words[3] === 'thousand' && words[4] === 'feet') {
                const number = getNumber(words[2], phoneticMap);
                if (number) {
                    parsedCommand = `H${number * 10}`; // "Descend to <number> thousand feet" → "H<number*10>"
                }
            }
            break;

        default:
            parsedCommand = ''; // If no valid command is found
    }

    return parsedCommand || 'Invalid Command'; // Return the parsed command or an error message
}

//Function to extract the blip object by the help of callsign
function getBlipByCallsign(callsign) {
    return aircraftBlips.find(blip => blip.callsign === callsign);
}

// Helper function to parse a number from a word (either digit or phonetic)
function getNumber(input, phoneticMap) {
    if (!isNaN(input)) {
        return input.length === 3 ? input : null; // Must be a 3-digit number
    }

    const phoneticNumber = phoneticMap[input.toLowerCase()];
    return phoneticNumber ? phoneticNumber : null; // Return the phonetic number if valid, else null
}

// Helper function to check if the input is a numeric value
function isNumeric(value) {
    return !isNaN(value) && !isNaN(parseFloat(value));
}

// Normalize to handle common mispronunciations
function applyReplacements(command) {
    // Replace common misrecognitions
    const replacements = {
        'handing': 'heading',
        'taskar': 'tusker',
        'tasker': 'tusker',
        'kanjar': 'khanjar',
        'myka': 'mica',
        'mika': 'mica',
        'myca': 'mica',
        'kola': 'cola',
        'maja': 'maza',
        'maaza': 'maza',
        'majha': 'maza',
        'van': 'one',
        'into': 'heading', // Replacing into  as heading
        'in': 'heading' // replacing in as heading
    };
    for (let [incorrect, correct] of Object.entries(replacements)) {
        command = command.replace(new RegExp(`\\b${incorrect}\\b`, 'g'), correct);
    }
    return command.trim();
}


/********* voiceCommands.js script file ends here */