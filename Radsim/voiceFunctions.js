// Initialize the SpeechRecognition API
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true; // Keep recognizing as long as the user is speaking
recognition.interimResults = false; // Don't show intermediate results

// Track if speech recognition is running
let isRecognitionActive = false;

// Reference to the button
const pushToTalkButton = document.getElementById('pushToTalk');

// Event listeners for starting and stopping recognition based on button interaction
pushToTalkButton.addEventListener('mousedown', () => {
    if (!isRecognitionActive) {
        recognition.start();
        pushToTalkButton.textContent = 'Listening...'; // Change text to "Listening..."
        pushToTalkButton.classList.remove('inactive');
        pushToTalkButton.classList.add('active');
    }
});

pushToTalkButton.addEventListener('mouseup', () => {
    if (isRecognitionActive) {
        recognition.stop();
        pushToTalkButton.textContent = 'Push to Talk'; // Revert text
        pushToTalkButton.classList.remove('active');
        pushToTalkButton.classList.add('inactive');
    }
});

pushToTalkButton.addEventListener('touchstart', (event) => {
    event.preventDefault(); // Prevent default behavior for mobile
    if (!isRecognitionActive) {
        recognition.start();
        pushToTalkButton.textContent = 'Listening...';
        pushToTalkButton.classList.remove('inactive');
        pushToTalkButton.classList.add('active');
    }
});

pushToTalkButton.addEventListener('touchend', (event) => {
    event.preventDefault(); // Prevent default behavior for mobile
    if (isRecognitionActive) {
        recognition.stop();
        pushToTalkButton.textContent = 'Push to Talk';
        pushToTalkButton.classList.remove('active');
        pushToTalkButton.classList.add('inactive');
    }
});

// Update existing event handlers to ensure recognition state is correctly tracked
recognition.onstart = () => {
    console.log('Speech recognition started');
    isRecognitionActive = true;
};

recognition.onend = () => {
    console.log('Speech recognition ended');
    isRecognitionActive = false;
    // Ensure button state reverts if speech recognition ends unexpectedly
    pushToTalkButton.textContent = 'Push to Talk';
    pushToTalkButton.classList.remove('active');
    pushToTalkButton.classList.add('inactive');
};


// Event handler for when speech is recognized
recognition.onresult = (event) => {
    const results = event.results;
    const voiceCommand = results[results.length - 1][0].transcript.toLowerCase().trim();
    
    // Handle the recognized command
    handleVoiceCommand(voiceCommand);
};

// Event handler for errors
recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    //restartRecognition(); // Restart recognition on error
};



/********Code for Speech Synthesis */
// Flag to track if speech synthesis has been activated
let speechActivated = true;

// Function to speak out a message
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Clear any ongoing speech
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = 'en-US';
        window.speechSynthesis.speak(speech);
    } else {
        console.warn('Speech synthesis not supported in this browser.');
    }
}

// Activate speech synthesis on button click on Initial Aircraft Creation
document.getElementById('createInitialAircraftButton').addEventListener('click', () => {
    speechActivated = true;
    speak('Speech synthesis activated.');
    //document.getElementById('activateSpeech').style.display = 'none'; // Hide button after activation
});

// Activate speech synthesis on button click on Initial Aircraft Creation
document.getElementById('cancelInitialAircraftButton').addEventListener('click', () => {
    speechActivated = true;
    speak('Speech synthesis activated.');
});






