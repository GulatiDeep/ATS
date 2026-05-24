//************Functions related to aircraft blip, leading line and associated labels ***********/

//Log display initialisation
let commandLogs = document.getElementById('commandLogs');

/********** Functions to create Initial Aircraft on Page load  *****/
//Function to open initial dialog box for exercise settings
function openInitialAircraftDialog() {
    const dialog = document.getElementById('initialAircraftDialog');
    dialog.style.display = 'block';
    dialog.style.top = `50%`;  // Center the dialog
    dialog.style.left = `50%`;
    dialog.style.transform = `translate(-50%, -50%)`;

}

//Function to Close Initial aircraft dialog box
function closeInitialAircraftDialog() {
    const dialog = document.getElementById('initialAircraftDialog');
    dialog.style.display = 'none';
    resetInitialDialogFields();
}

// Reset form fields to their default values
function resetInitialDialogFields() {
    const individualFighterInput = document.getElementById('individualFighterInput');
    const individualTransportInput = document.getElementById('individualTransportInput');
    const fighterFormation2acInput = document.getElementById('fighterFormation2acInput');
    const fighterFormation3acInput = document.getElementById('fighterFormation3acInput');
    const fighterFormation4acInput = document.getElementById('fighterFormation4acInput');


    individualFighterInput.value = '0';
    individualFighterInput.style.backgroundColor = '';

    individualTransportInput.value = '0';
    individualTransportInput.style.backgroundColor = '';

    fighterFormation2acInput.value = '0';
    fighterFormation2acInput.style.backgroundColor = '';

    fighterFormation3acInput.value = '0';
    fighterFormation3acInput.style.backgroundColor = '';

    fighterFormation4acInput.value = '0';
    fighterFormation4acInput.style.backgroundColor = '';

}

/********** Functions to create Additional Aircraft manually on right click  *****/
// Open create aircraft dialog box
function openAircraftCreationDialog() {
    const dialog = document.getElementById('aircraftDialog');
    dialog.style.display = 'block';
    dialog.style.top = `50%`;  // Center the dialog
    dialog.style.left = `50%`;
    dialog.style.transform = `translate(-50%, -50%)`;
}

// Close create aircraft dialog box
function closeAircraftCreationDialog() {
    const dialog = document.getElementById('aircraftDialog');
    dialog.style.display = 'none';
    resetAircraftCreationDialogFields();
}

// Reset form fields to their default values
function resetAircraftCreationDialogFields() {
    const headingInput = document.getElementById('headingInput');
    const aircraftTypeInput = document.getElementById('aircraftTypeInput');

    headingInput.value = '001';
    headingInput.style.backgroundColor = '';

    aircraftTypeInput.value = "individualTransport";
    aircraftTypeInput.style.backgroundColor = '';

}


//*******Function related to aircraft blip *********/

//for checking whether initial creation or manual for executing orbit command on initial creation
let isManualCreation = false;

// Function to Create Initial Aircraft blip(s) after validating inputs from Dialog Box
function createInitialAircraftBlip() {
    // Get selected values from the dropdowns in the dialog
    const numIndividualFighters = parseInt(document.getElementById('individualFighterInput').value, 10);
    const numTransportAc = parseInt(document.getElementById('individualTransportInput').value, 10);
    const num2AcFormation = parseInt(document.getElementById('fighterFormation2acInput').value, 10);
    const num3AcFormation = parseInt(document.getElementById('fighterFormation3acInput').value, 10);
    const num4AcFormation = parseInt(document.getElementById('fighterFormation4acInput').value, 10);

    if (validateInputs()) {
        // Ensure we create the appropriate number of each aircraft type
        isManualCreation = false;
        const success = createIndividualAircraft(numIndividualFighters) &&
            createTransportAircraft(numTransportAc) &&
            createFormationAircraft(num2AcFormation, 2) &&
            createFormationAircraft(num3AcFormation, 3) &&
            createFormationAircraft(num4AcFormation, 4);

        if (success) {
            closeInitialAircraftDialog();  // Close the dialog box after creating aircraft

            //Logging into console
            console.log(`→ Exercise started with total ${totalAircraftCount} aircraft as follows:\n` +
                `${allAircraftCallsigns.map(callsign => `  - ${callsign}`).join('\n')}`);

            //Logging into Command Log
            commandLogs.innerHTML += `→ Exercise started with total ${totalAircraftCount} aircraft as follows:<br>
            <i style="color: green">${allAircraftCallsigns.map(callsign => `&nbsp;&nbsp;&nbsp;&nbsp;- ${callsign}`).join('<br>')}</i>`;

        } else {
            // If any creation failed (due to duplicate callsign), don't proceed
            console.error("Error: Could not create aircraft due to duplicate callsign.");
        }
        return success;
    } else {
        return false;
    }
}

// Function to Create Initial Aircraft blip(s) after validating inputs from Dialog Box
function createManualAircraftBlip() {
    // Retrieve user inputs
    const acftType = document.getElementById('aircraftTypeInput').value;
    const manualHeading = parseInt(document.getElementById('headingInput').value, 10);
    const position = { x: selectedPosition.x, y: selectedPosition.y };

    // Validate heading
    if (isNaN(manualHeading) || manualHeading < 0 || manualHeading > 360) {
        alert("Heading must be a valid number between 000 and 360.");
        return false;
    }

    // Determine the total number of aircraft requested based on the type
    let totalRequestedAircraft = 1; // Default for individual aircraft
    let formationSize = 0;

    switch (acftType) {
        case "individualTransport":
        case "individualFighter":
            totalRequestedAircraft = 1;
            break;

        case "fighterFormation2ac":
            formationSize = 2;
            totalRequestedAircraft = 2;
            break;

        case "fighterFormation3ac":
            formationSize = 3;
            totalRequestedAircraft = 3;
            break;

        case "fighterFormation4ac":
            formationSize = 4;
            totalRequestedAircraft = 4;
            break;

        default:
            alert("Invalid aircraft type selected.");
            return false;
    }

    // Check total aircraft limits
    if (!validateTotalAircraft(totalRequestedAircraft)) {
        return false; // Exceeds aircraft limit
    }

    // Handle creation based on type
    let success = false;

    if (acftType === "individualTransport") {
        // Create a single individual aircraft
        isManualCreation = true;
        success = createTransportAircraft(1, manualHeading, position);
    } else if (acftType === "individualFighter") {
        // Create a single individual aircraft
        isManualCreation = true;
        success = createIndividualAircraft(1, manualHeading, position);
    }
    else if (formationSize > 0) {
        // Create a formation of aircraft
        isManualCreation = true;
        success = createFormationAircraft(1, formationSize, manualHeading, position);
    }

    if (success) {
        closeAircraftCreationDialog(); // Close the dialog box after successful creation

    } else {
        // Log the error if creation fails
        console.error("Error: Could not create aircraft or formation due to duplicate callsign or other issue.");
    }

    return success;
}

// Function to create aircraft blip for individual aircraft
function createIndividualAircraft(num, heading, position) {
    for (let i = 0; i < num; i++) {
        const callsign = getRandomIndividualCallsign();
        if (!callsign) return false; // Stop creation if any error occurs

        // Generate unique position and heading for each individual fighter
        const currentPosition = position || getRandomPosition(); // Use provided position or generate one
        const currentHeading = heading || getInitialHeading(currentPosition.x, currentPosition.y); // Use provided heading or calculate one
        const speed = 300;
        const altitude = getRandomAltitude(6000, 20000); // Generate unique altitude

        const blip = new AircraftBlip(
            callsign,
            currentHeading,
            speed,
            altitude,
            currentPosition.x,
            currentPosition.y,
            '0000'
        );
        blip.role = 'Individual';
        aircraftBlips.push(blip);
        totalAircraftCount++;

        if (!isManualCreation) {
            //processCommandForBlip(blip, 'OR'); // Assign initial orbit
            blip.startOrbitRight();
        } else {
            //Logging into console
            console.log(`→ Individual Aircraft created:\n  - ${blip.callsign}`);

            //Logging into Command Log
            commandLogs.innerHTML += `<br><br>→ Individual Aircraft created:<br>
        <i style="color: green"> &nbsp;&nbsp;&nbsp;&nbsp;- ${blip.callsign}</i>`;
        }
        
        createControlBox(blip, 1, 1);
    }
    displayAircraftCounts();
    return true;
}

// Function to create aircraft blip for transport aircraft
function createTransportAircraft(num, heading, position) {
    for (let i = 0; i < num; i++) {
        const callsign = getRandomTransportCallsign();
        if (!callsign) return false; // Stop creation if any error occurs

        // Generate unique heading and position for each aircraft
        const currentPosition = position || getRandomPosition(); // Use provided position or generate one
        const currentHeading = heading || getInitialHeading(currentPosition.x, currentPosition.y); // Use provided heading or calculate one
        const ssrCode = getRandomSSRCode();
        const speed = 250;
        const altitude = getRandomAltitude(10000, 20000); // Generate a new altitude for each aircraft

        // Create the aircraft blip
        const blip = new AircraftBlip(
            callsign,
            currentHeading,
            speed,
            altitude,
            currentPosition.x,
            currentPosition.y,
            ssrCode
        );
        blip.role = 'Individual';
        aircraftBlips.push(blip);

        totalAircraftCount++;

        if (isManualCreation) {
            //Logging into console
            console.log(`→ Transport Aircraft created:\n  - ${blip.callsign}`);

            //Logging into Command Log
            commandLogs.innerHTML += `<br><br>→ Transport Aircraft created:<br>
        <i style="color: green"> &nbsp;&nbsp;&nbsp;&nbsp;- ${blip.callsign}</i>`;
        }

        // Create a control box for the aircraft
        createControlBox(blip, 1, 1);
    }
    displayAircraftCounts();
    return true;
}

// Function to create aircraft blip for formation aircraft
function createFormationAircraft(num, formationSize, heading, position) {
    for (let i = 0; i < num; i++) {
        const formationCallsign = getRandomFormationCallsign(); // Get unique base callsign
        if (!formationCallsign) return false; // Stop creation if any error occurs

        // Generate unique position and heading for the formation leader
        const leaderPosition = position || getRandomPosition(); // Use provided position or generate one
        const leaderHeading = heading || getInitialHeading(leaderPosition.x, leaderPosition.y); // Use provided heading or calculate one
        const speed = 300;
        const altitude = getRandomAltitude(8000, 20000); // Generate altitude for the leader

        // Create all members of the formation
        for (let j = formationSize; j >= 1; j--) {
            const callsign = `${formationCallsign}-${j}`;
            const memberPosition = leaderPosition; // Formation members share the same position initially
            const memberHeading = leaderHeading; // Formation members share the same heading initially
            const memberAltitude = altitude; // Formation members share the same altitude initially

            const blip = new AircraftBlip(
                callsign,
                memberHeading,
                speed,
                memberAltitude,
                memberPosition.x,
                memberPosition.y,
                '0000'
            );
            blip.role = j === 1 ? 'Leader' : 'Member'; // Assign roles

            // Store the formation size in the leader
            if (j === 1) blip.formationSize = formationSize;

            aircraftBlips.push(blip);
            totalAircraftCount++;
            allAircraftCallsigns.push(callsign);
            if (!isManualCreation) {
                //processCommandForBlip(blip, 'OR'); // Assign initial orbit
                blip.startOrbitRight();
            } 
            
        }

        if (isManualCreation) {
            //Logging into console
            console.log(`→ Formation Aircraft created:`);
    
            //Logging into Command Log
            commandLogs.innerHTML += `<br><br>→ Formation Aircraft created:`;
        }

        // Create control boxes for all formation members
        for (let j = 1; j <= formationSize; j++) {
            const callsign = `${formationCallsign}-${j}`;
            const blip = aircraftBlips.find(b => b.callsign === callsign);
            createControlBox(blip, formationSize, j);
            if (isManualCreation) {
                //Logging into console
                console.log(`\n  - ${blip.callsign}`);
        
                //Logging into Command Log
                commandLogs.innerHTML += `<br> <i style="color: green"> &nbsp;&nbsp;&nbsp;&nbsp;- ${blip.callsign}</i>`;
            }
        }
        
    }

    
    displayAircraftCounts();
    return true;
}

//Funtion to validate inputs
function validateInputs() {
    // Get the values of all input fields
    let individualFighter = document.getElementById('individualFighterInput').value;
    let individualTransport = document.getElementById('individualTransportInput').value;
    let fighterFormation2ac = document.getElementById('fighterFormation2acInput').value;
    let fighterFormation3ac = document.getElementById('fighterFormation3acInput').value;
    let fighterFormation4ac = document.getElementById('fighterFormation4acInput').value;

    // Convert the values to numbers
    individualFighter = parseInt(individualFighter);
    individualTransport = parseInt(individualTransport);
    fighterFormation2ac = parseInt(fighterFormation2ac);
    fighterFormation3ac = parseInt(fighterFormation3ac);
    fighterFormation4ac = parseInt(fighterFormation4ac);

    // Validate the total number of aircraft
    const totalRequestedAircraft =
        individualFighter +
        individualTransport +
        fighterFormation2ac * 2 +
        fighterFormation3ac * 3 +
        fighterFormation4ac * 4;

    if (!validateTotalAircraft(totalRequestedAircraft)) {
        return false; // Invalid input due to exceeding aircraft limit
    }

    // Validate the total number of available formations
    const requestedFormations = fighterFormation2ac + fighterFormation3ac + fighterFormation4ac;
    if (!validateAvailableFormations(requestedFormations)) {
        return false; // Invalid formation input
    }

    // Validate each individual input
    if (individualFighter < 0 || individualFighter > 10 || isNaN(individualFighter)) {
        alert("Individual Fighter AC must be between 0 and 10.");
        return false; // Invalid input
    }
    if (individualTransport < 0 || individualTransport > 10 || isNaN(individualTransport)) {
        alert("Individual Transport AC must be between 0 and 10.");
        return false; // Invalid input
    }
    if (fighterFormation2ac < 0 || fighterFormation2ac > 5 || isNaN(fighterFormation2ac)) {
        alert("Fighter Formation (2AC) must be between 0 and 5.");
        return false; // Invalid input
    }
    if (fighterFormation3ac < 0 || fighterFormation3ac > 5 || isNaN(fighterFormation3ac)) {
        alert("Fighter Formation (3AC) must be between 0 and 5.");
        return false; // Invalid input
    }
    if (fighterFormation4ac < 0 || fighterFormation4ac > 5 || isNaN(fighterFormation4ac)) {
        alert("Fighter Formation (4AC) must be between 0 and 5.");
        return false; // Invalid input
    }

    // If all inputs are valid, return true
    return true;
}

function validateAvailableFormations(requestedFormations) {
    // Calculate the total number of unique base callsigns in the existing array
    const existingFormationCallsigns = new Set();
    for (const callsign of allAircraftCallsigns) {
        const formationCallsign = getFormationCallsign(callsign); // Extract the base callsign (e.g., "Cola" from "Cola-1")
        existingFormationCallsigns.add(formationCallsign);
    }

    const totalFormationCallsigns = existingFormationCallsigns.size;
    const availableFormations = 11 - totalFormationCallsigns;

    if (totalFormationCallsigns >= 11) {
        alert("Cannot create more formations. Maximum number of formations (11) reached.");
        return false; // Too many existing formations
    }

    if (requestedFormations > availableFormations) {
        alert(`You can create only ${availableFormations} more formations. Please adjust your inputs.`);
        return false; // Too many requested formations
    }

    return true; // Valid formations
}

function validateTotalAircraft(totalRequestedAircraft) {
    // Calculate the total number of existing aircraft
    const existingAircraftCount = allAircraftCallsigns.length;
    const totalAircraft = existingAircraftCount + totalRequestedAircraft;

    if (totalAircraft > 20) {
        alert(`Total number of aircraft exceeds the limit (20). Current aircraft on radar scope: ${existingAircraftCount}, requested: ${totalRequestedAircraft}.`);
        return false; // Too many aircraft
    }

    return true; // Valid aircraft count
}

function validateHeading(heading) {
    if (isNaN(heading) || heading < 0 || heading > 360) {
        headingInput.style.backgroundColor = '#f8d7da'; // Light red color
        alert("Heading must be between 000 and 360.");
        return false;
    }

    headingInput.style.backgroundColor = ''; // Reset to default
    return true;
}

// Function to create a unique individual aircraft callsign
function getRandomIndividualCallsign() {
    const hundreds = [100, 200, 300, 400, 500, 600, 700];
    let callsign;
    let attempts = 0;
    const maxAttempts = 100;  // Limit to avoid infinite loop

    do {
        const base = hundreds[Math.floor(Math.random() * hundreds.length)];
        callsign = (base + Math.floor(Math.random() * 100)).toString();
        attempts++;
        if (attempts >= maxAttempts) {
            showError("No unique individual callsign could be generated.");
            return null; // If too many attempts, return null to indicate failure
        }
    } while (allAircraftCallsigns.includes(callsign)); // Ensure it's unique

    allAircraftCallsigns.push(callsign); // Store the full generated callsign
    return callsign;
}

// Function to create a unique transport aircraft callsign
function getRandomTransportCallsign() {
    const prefixes = ["VC", "VG", "VH", "VK"];
    const maxAttempts = 50; // Limit to avoid infinite loop
    let callsign;
    let attempts = 0;

    do {
        // Pick a random prefix
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        // Generate a random third letter
        const thirdLetter = String.fromCharCode(Math.floor(Math.random() * 26) + 65);
        // Combine to form the callsign
        callsign = prefix + thirdLetter;
        attempts++;

        if (attempts >= maxAttempts) {
            showError("No unique transport callsign could be generated.");
            return null; // If too many attempts, return null to indicate failure
        }
    } while (allAircraftCallsigns.includes(callsign)); // Ensure it's unique

    allAircraftCallsigns.push(callsign); // Store the generated callsign
    return callsign;
}

// Function to create a unique formation callsign
function getRandomFormationCallsign() {

    let formationCallsign;
    let attempts = 0;
    const maxAttempts = 100;  // Limit to avoid infinite loop

    do {
        const randomIndex = Math.floor(Math.random() * formationCallsigns.length);
        formationCallsign = formationCallsigns[randomIndex];
        attempts++;
        if (attempts >= maxAttempts) {
            showError("No unique formation callsign could be generated.");
            return null; // If too many attempts, return null to indicate failure
        }
    } while (allAircraftCallsigns.some(callsign => callsign.startsWith(formationCallsign))); // Ensure base callsign is unique

    return formationCallsign;
}

// Function to display error message
function showError(message) {
    alert(message);  // You can replace this with any other error display method like a custom modal
}

/********Functions to generate random values like Position, hdg, Altitude, SSR code etc for aircraft creation */
function getRandomPosition() {
    let distance, heading, x, y;
    let isValidPosition = false;

    // Repeat the process until a valid position (at least 10-20 nautical miles apart) is found
    while (!isValidPosition) {
        // Random distance between 20 and 60 nautical miles
        distance = Math.random() * (60 - 20) + 20;

        // Random heading between 0 and 360 degrees
        heading = Math.random() * 360;

        // Convert polar coordinates (distance, heading) to cartesian coordinates (x, y)
        x = distance * Math.cos(heading * Math.PI / 180); // x is the distance projected along the x-axis
        y = distance * Math.sin(heading * Math.PI / 180); // y is the distance projected along the y-axis

        // Check if the new position is at least 10-20 nautical miles away from any previous position
        isValidPosition = true;
        for (let pos of previousPositions) {
            let dx = x - pos.x;
            let dy = y - pos.y;
            let distanceBetween = Math.sqrt(dx * dx + dy * dy); // Calculate the distance between two points

            // If the new position is too close to any previous position, mark it as invalid
            if (distanceBetween < 20) {
                isValidPosition = false;
                break; // Exit the loop and try generating a new position
            }
        }
    }

    // Store the new position
    previousPositions.push({ x, y });

    // Return the valid position
    return { x, y };
}

function getRandomHeading() {
    return Math.floor(Math.random() * 36) * 10;  // Generates multiples of 10 from 0 to 350
}

function getInitialHeading(x, y) {
    const brg = (Math.atan2(x * zoomLevel, y * zoomLevel) * (180 / Math.PI) + 360) % 360;
    const hdg = (brg + 180) % 360; // Opposite direction
    return Math.floor(hdg); // Returns the opposite heading as an integer
}

function getRandomAltitude(min, max) {
    // Generate a random altitude between min and max, and round it to the nearest multiple of 100
    return Math.floor(Math.random() * ((max - min) / 1000)) * 1000 + min;
}

function getRandomSSRCode() {
    // Define a list of valid 4-digit octal codes (in string format)
    const validSSRCodes = [];

    // Loop through all 4-digit octal numbers (from 0000 to 7777)
    for (let i = 0; i < 4096; i++) {
        // Convert the number to a 4-digit octal string (pad with leading zeros if needed)
        let octalCode = i.toString(8).padStart(4, '0');

        // Exclude codes where the last two digits are '00'
        if (octalCode.slice(2) !== '00') {
            validSSRCodes.push(octalCode);
        }
    }

    // Randomly select a SSR code from the valid list
    const randomIndex = Math.floor(Math.random() * validSSRCodes.length);
    return validSSRCodes[randomIndex];
}

// Function to update aircraft counts in the display element
function displayAircraftCounts() {

    const aircraftCountDisplay = document.getElementById('aircraftCountDisplay');
    // Ensure the element exists before updating
    if (aircraftCountDisplay) {
        aircraftCountDisplay.innerHTML = `Total Aircraft: ${totalAircraftCount}`;
    }
}


// Function to remove trailing numbers from a callsign to get formation callsign (e.g., "Cola-1" -> "Cola")
function getFormationCallsign(callsign) {
    const parts = callsign.split('-');
    return parts[0]; // Return the base part of the callsign (e.g., Cola from Cola-1, Cola-2)
}

/*********Event listeners for creation of aircraft */

//To open the initial exercise settings dialog box on page load
document.addEventListener('DOMContentLoaded', () => {
    // Automatically open the aircraft creation dialog when the page loads
    openInitialAircraftDialog();
});

// Event listener to Show the custom context menu on right-click
radarScope.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    clickedPosition = calculatePosition(event.clientX, event.clientY);
    radarContextMenu.style.top = `${event.clientY}px`;
    radarContextMenu.style.left = `${event.clientX}px`;
    radarContextMenu.style.display = 'block';
});

// Hide context menu when clicking elsewhere on radar screen
document.addEventListener('click', () => {
    radarContextMenu.style.display = 'none';
});

// Right Click Context menu for creating additional aircraft
// To Handle "Create Aircraft" manually from context menu
document.getElementById('createAircraftContextMenu').addEventListener('click', () => {
    selectedPosition = { ...clickedPosition };
    openAircraftCreationDialog();
    radarContextMenu.style.display = 'none';
});

// Event listener for creating aircraft manually from click on "Create" Button on dialog box
document.getElementById('createAircraftButton').addEventListener('click', () => {
    if (createManualAircraftBlip()) {  // Attempt to create aircraft blip
        closeAircraftCreationDialog();   // Close dialog if creation was successful
    }
});

// Event listener for creating aircraft manually from "enter key" on dialog box
document.getElementById('aircraftDialog').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        if (createManualAircraftBlip()) {
            closeAircraftCreationDialog();
        }
    }
});

// Event listener for "Cancel" button for closing manual aircraft creation dialog box without making any changes
document.getElementById('cancelAircraftButton').addEventListener('click', closeAircraftCreationDialog);

// Event listener for closing manual aircraft dialog through "escape key" without making any changes
document.getElementById('aircraftDialog').addEventListener('keypress', (event) => {
    if (event.key === 'Escape') {
        closeAircraftCreationDialog(); // Close the dialog when "Esc" is pressed
    }
});

// Event listener for creating Initial aircraft settings from "enter key" on dialog box
document.getElementById('initialAircraftDialog').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        openFullscreen();
        speechActivated = true;
        if (createInitialAircraftBlip()) {
            closeInitialAircraftDialog();
        }
    }
});

// Event listener for creating Initial aircraft settings from click on "Create" Button
document.getElementById('createInitialAircraftButton').addEventListener('click', () => {
    openFullscreen();
    if (createInitialAircraftBlip()) {  // Attempt to create aircraft blip
        closeInitialAircraftDialog();   // Close dialog if creation was successful
    }
});

// Event listener for "Cancel" button for closing Initial aircraft dialog box without making any changes
document.getElementById('cancelInitialAircraftButton').addEventListener('click', () => {
    openFullscreen();
    closeInitialAircraftDialog();
});

//document.getElementById('cancelInitialAircraftButton').addEventListener('click', closeInitialAircraftDialog);

// Event listener for closing Initial aircraft dialog through "escape key" without making any changes
document.getElementById('initialAircraftDialog').addEventListener('keypress', (event) => {
    if (event.key === 'Escape') {
        openFullscreen();
        closeInitialAircraftDialog(); // Close the dialog when "Esc" is pressed
    }
});