/****Functions to pronounce callsign and heading for acknowledgement of commands */
function pronounceCallsign1(callsign) {
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

function pronounceCallsign(callsign) {
    const phoneticAlphabet = {
        'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo', 'F': 'Foxtrot', 'G': 'Golf',
        'H': 'Hotel', 'I': 'India', 'J': 'Juliett', 'K': 'Kilo', 'L': 'Lima', 'M': 'Mike', 'N': 'November',
        'O': 'Oscar', 'P': 'Papa', 'Q': 'Quebec', 'R': 'Romeo', 'S': 'Sierra', 'T': 'Tango', 'U': 'Uniform',
        'V': 'Victor', 'W': 'Whiskey', 'X': 'X-ray', 'Y': 'Yankee', 'Z': 'Zulu',
        '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
        '8': 'Eight', '9': 'Nine'
    };

    const formationCallsigns = [
        "Limca", "Rhino", "Spider", "Thunder", "Maza", "Cobra", 
        "Cola", "Khanjar", "Mica", "Loki", "Tusker"
    ];

    // Check if callsign matches the pattern for a formation member (e.g., Cola-1, Limca-3)
    const formationMatch = callsign.match(/^([A-Za-z]+)-([1-4])$/);
    if (formationMatch) {
        const baseName = formationMatch[1];
        const memberNumber = formationMatch[2];
        if (formationCallsigns.includes(baseName)) {
            return `${baseName} ${phoneticAlphabet[memberNumber]}`;
        }
    }

    // Check if callsign is a formation base name
    if (formationCallsigns.includes(callsign)) {
        return callsign; // Return the callsign as is for formation names
    }

    // Default: Convert all characters in the callsign using the phonetic alphabet
    return callsign
        .split('')
        .map(char => phoneticAlphabet[char.toUpperCase()] || char) // Convert letters and digits
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
    return String(number) // Convert number to string
        .split('')        // Split the string into individual characters
        .map(digit => ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][parseInt(digit)]) // Map digits to words
        .join(' ');       // Join the words with a space
}


//Function to Pronounce Altitudes
function pronounceAlt(number) {
    const digitsToWords = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

    // Convert number to string for processing
    const numStr = String(number);

    if (numStr.length === 4 && numStr[1] === '0' && numStr[2] === '0' && numStr[3] === '0') {
        // Whole thousands (e.g., 1000 -> "One Thousand")
        return `${digitsToWords[parseInt(numStr[0])]} Thousand`;
    } else if (numStr.length === 4 && numStr[2] === '0' && numStr[3] === '0') {
        // Thousands and hundreds (e.g., 1100 -> "One Thousand One Hundred")
        return `${digitsToWords[parseInt(numStr[0])]} Thousand ${digitsToWords[parseInt(numStr[1])]} Hundred`;
    } else if (numStr.length === 3 && numStr[1] === '0' && numStr[2] === '0') {
        // Whole hundreds (e.g., 200 -> "Two Hundred")
        return `${digitsToWords[parseInt(numStr[0])]} Hundred`;
    } else {
        // Default: Announce digit by digit
        return numStr
            .split('')
            .map(digit => digitsToWords[parseInt(digit)])
            .join(' ');
    }
}

//Function to pronounce SSR codes
function pronounceSSR(number) {
    const digitsToWords = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

    // Convert number to string for processing
    const numStr = String(number);

    if (numStr.length === 4 && numStr[1] === '0' && numStr[2] === '0' && numStr[3] === '0') {
        // Full thousands (e.g., 1000 -> "One Thousand")
        return `${digitsToWords[parseInt(numStr[0])]} Thousand`;
    } else {
        // Default: Announce digit by digit
        return numStr
            .split('')
            .map(digit => digitsToWords[parseInt(digit)])
            .join(' ');
    }
}



