// script.js

// --- Global Variables ---
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const recordBtn = document.getElementById('recordBtn'); // Placeholder, won't function without backend for saving
const speakBtn = document.getElementById('speakBtn');
const userSelect = document.getElementById('userSelect');
const resultsContainer = document.getElementById('resultsContainer');
const statusIndicator = document.getElementById('statusIndicator');
const practiceInput = document.getElementById('practiceInput');
const practiceBtn = document.getElementById('practiceBtn');
const practiceRecordBtn = document.getElementById('practiceRecordBtn'); // Placeholder
const practiceResults = document.getElementById('practiceResults');
const datasetGrid = document.getElementById('datasetGrid');
const audioBtn = document.getElementById('audioBtn');
const volumeSlider = document.getElementById('volumeSlider');

// Stats elements
const signsDetectedEl = document.getElementById('signsDetected');
const avgConfidenceEl = document.getElementById('avgConfidence');
const phrasesCompletedEl = document.getElementById('phrasesCompleted');
const sessionTimeEl = document.getElementById('sessionTime');

let mediaStream = null;
let intervalId = null;
let currentUserId = 'default'; // Current selected user (client-side only)
let currentSign = 'Ready to start...';
let currentConfidence = 0;
let speakingRate = 1.0;
let speakingPitch = 1.0;
let lastSpokenText = '';
let speechQueue = [];
let isSpeaking = false;

// Session stats
let signsDetectedCount = 0;
let totalConfidenceSum = 0;
let phrasesCompletedCount = 0;
let sessionStartTime = null;
let sessionTimerInterval = null;

// --- Helper Functions for Landmark Analysis ---

// Calculate Euclidean distance between two 3D points
function calculateDistance(p1, p2) {
    if (!p1 || !p2) return Infinity;
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
}

// Calculate the bounding box height of fingers (excluding wrist/palm base)
function getFingerHeight(landmarks) {
    if (!landmarks || landmarks.length < 21) return 0;
    const fingerTips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]; // Index, Middle, Ring, Pinky tips
    const lowestY = Math.max(...fingerTips.map(p => p.y));
    const highestY = Math.min(...fingerTips.map(p => p.y));
    return lowestY - highestY;
}

// --- Rule-Based Sign Recognition Functions ---

function detectHello(handLandmarks) {
    if (!handLandmarks || handLandmarks.length === 0) return false;

    // Check if hand is open (fingers extended)
    const wrist = handLandmarks[0];
    const indexTip = handLandmarks[8];
    const middleTip = handLandmarks[12];
    const ringTip = handLandmarks[16];
    const pinkyTip = handLandmarks[20];
    const thumbTip = handLandmarks[4];

    // Check if fingers are relatively straight and extended
    const finger_tip_y_diff_threshold = 0.08; // Small diff means fingers are aligned
    const index_middle_y_diff = Math.abs(indexTip.y - middleTip.y);
    const middle_ring_y_diff = Math.abs(middleTip.y - ringTip.y);
    const ring_pinky_y_diff = Math.abs(ringTip.y - pinkyTip.y);

    const fingers_straight = (
        index_middle_y_diff < finger_tip_y_diff_threshold &&
        middle_ring_y_diff < finger_tip_y_diff_threshold &&
        ring_pinky_y_diff < finger_tip_y_diff_threshold
    );

    // Check if fingers are generally above wrist (open hand gesture)
    const fingers_above_wrist = (
        indexTip.y < wrist.y && middleTip.y < wrist.y &&
        ringTip.y < wrist.y && pinkyTip.y < wrist.y &&
        thumbTip.y < wrist.y
    );

    // Check thumb extension relative to palm/index finger
    const thumb_dist_to_index_base = calculateDistance(handLandmarks[5], thumbTip);
    const thumb_dist_to_wrist = calculateDistance(wrist, thumbTip);

    // This is a rough heuristic: thumb should be somewhat extended, not tucked in
    const thumb_extended = thumb_dist_to_index_base > calculateDistance(handLandmarks[5], handLandmarks[6]) * 0.8;
    const thumb_not_tucked_in = thumbTip.x > wrist.x; // Simplified: thumb typically to the right for right hand

    return fingers_straight && fingers_above_wrist && thumb_extended && thumb_not_tucked_in;
}

function detectYes(handLandmarks) {
    if (!handLandmarks || handLandmarks.length === 0) return false;

    const thumbTip = handLandmarks[4];
    const thumbBase = handLandmarks[3];
    const indexKnuckle = handLandmarks[5]; // Base of index finger

    // Thumb extended upwards
    const isThumbUp = thumbTip.y < thumbBase.y && thumbTip.y < indexKnuckle.y;

    // Other fingers curled (simplified: their tips are below their respective bases/knuckles)
    const indexTip = handLandmarks[8];
    const middleTip = handLandmarks[12];
    const ringTip = handLandmarks[16];
    const pinkyTip = handLandmarks[20];

    const fingersCurled = (
        indexTip.y > handLandmarks[6].y && // index tip below its knuckle
        middleTip.y > handLandmarks[10].y && // middle tip below its knuckle
        ringTip.y > handLandmarks[14].y && // ring tip below its knuckle
        pinkyTip.y > handLandmarks[18].y   // pinky tip below its knuckle
    );

    // Check if thumb is sufficiently separated from other fingers
    const thumbSeparation = calculateDistance(thumbTip, indexKnuckle);
    const thumbToPalmBase = calculateDistance(handLandmarks[0], indexKnuckle); // Distance from wrist to index knuckle
    const thumbIsOut = thumbSeparation > thumbToPalmBase * 0.5; // Heuristic for thumb being out

    return isThumbUp && fingersCurled && thumbIsOut;
}

function detectNo(handLandmarks) {
    if (!handLandmarks || handLandmarks.length === 0) return false;

    const thumbTip = handLandmarks[4];
    const thumbBase = handLandmarks[3];
    const wrist = handLandmarks[0];

    // Thumb extended downwards
    const isThumbDown = thumbTip.y > thumbBase.y && thumbTip.y > wrist.y;

    // Other fingers curled (same logic as 'yes')
    const indexTip = handLandmarks[8];
    const middleTip = handLandmarks[12];
    const ringTip = handLandmarks[16];
    const pinkyTip = handLandmarks[20];

    const fingersCurled = (
        indexTip.y > handLandmarks[6].y &&
        middleTip.y > handLandmarks[10].y &&
        ringTip.y > handLandmarks[14].y &&
        pinkyTip.y > handLandmarks[18].y
    );

    // Check if thumb is sufficiently separated from other fingers (similar to 'yes')
    const thumbSeparation = calculateDistance(thumbTip, handLandmarks[5]); // Dist to index base
    const thumbToPalmBase = calculateDistance(wrist, handLandmarks[5]);
    const thumbIsOut = thumbSeparation > thumbToPalmBase * 0.5;

    return isThumbDown && fingersCurled && thumbIsOut;
}


// --- Client-Side AI Model (Hybrid: Rule-Based + Dummy) ---
// This class now incorporates rule-based detection for specific signs.
class SignRecognizer {
    constructor() {
        this.knownSigns = [
            "hello", "thank_you", "yes", "no", "i_love_you", "help",
            "water", "food", "good", "bad", "more", "please", "sorry",
            "name", "home", "friends", "learn"
        ];
        this.userProfiles = {
            "default": { model_loaded: true, accuracy_bias: 0.0 },
            "user1": { model_loaded: true, accuracy_bias: 0.1 }, // Alex Johnson
            "user2": { model_loaded: true, accuracy_bias: 0.05 }, // Maria Garcia
            "user3": { model_loaded: true, accuracy_bias: 0.15 } // David Chen
        };
    }

    loadUserProfile(userId) {
        if (this.userProfiles[userId]) {
            console.log(`DEBUG: Loaded dummy profile for user: ${userId}`);
            return true;
        } else {
            console.warn(`DEBUG: Profile ${userId} not found. Using default behavior.`);
            return false;
        }
    }

    predict(userId, leftHandLandmarks, rightHandLandmarks) {
        let recognizedSign = "No Hand Detected";
        let confidence = 0;
        let alternatives = [];
        let phraseCompletion = null;

        // --- Priority 1: Rule-Based Recognition (for specific, distinct signs) ---
        // Prefer right hand if present, otherwise left.
        const activeHand = rightHandLandmarks && rightHandLandmarks.length > 0 ? rightHandLandmarks : leftHandLandmarks;

        if (activeHand && activeHand.length > 0) {
            if (detectHello(activeHand)) {
                recognizedSign = "hello";
                confidence = 95; // High confidence for rule-based match
            } else if (detectYes(activeHand)) {
                recognizedSign = "yes";
                confidence = 95;
            } else if (detectNo(activeHand)) {
                recognizedSign = "no";
                confidence = 95;
            }
        }

        // --- Priority 2: Fallback to Random Prediction for other signs ---
        // If no specific rule-based sign was detected, use the old random logic
        if (recognizedSign === "No Hand Detected" || recognizedSign === "Ready to start...") {
            const userBias = this.userProfiles[userId] ? this.userProfiles[userId].accuracy_bias : 0.0;
            const predictedRandomSign = this.knownSigns[Math.floor(Math.random() * this.knownSigns.length)];
            let randomConfidence = Math.random() * (99 - 30) + 30; // Random confidence between 30 and 99
            randomConfidence = Math.max(0, randomConfidence - (userBias * 100));

            recognizedSign = predictedRandomSign;
            confidence = parseFloat(randomConfidence.toFixed(2));

            if (confidence < 80) {
                const otherSigns = this.knownSigns.filter(s => s !== predictedRandomSign);
                const numAlternatives = Math.min(Math.floor(Math.random() * 3) + 1, otherSigns.length);
                while (alternatives.length < numAlternatives) {
                    const alt = otherSigns[Math.floor(Math.random() * otherSigns.length)];
                    if (!alternatives.includes(alt)) {
                        alternatives.push(alt);
                    }
                }
            }
        }

        // --- Phrase Completion (can apply to both rule-based and random) ---
        if (recognizedSign === "thank_you" && Math.random() > 0.7) {
            phraseCompletion = "Thank you very much!";
        } else if (recognizedSign === "hello" && Math.random() > 0.7) {
            phraseCompletion = "Hello there!";
        } else if (recognizedSign === "yes" && Math.random() > 0.6) {
            phraseCompletion = "Yes, I agree!";
        }

        return {
            sign: recognizedSign,
            confidence: confidence,
            alternatives: alternatives,
            phrase_completion: phraseCompletion
        };
    }

    // Updated getSignGuide for more specific descriptions
    getSignGuide(signText) {
        const lowerSignText = signText.toLowerCase().replace(/\s+/g, '_');
        let description = `This is a placeholder guide for '${signText}'. In a full implementation, you'd see a detailed visual animation or step-by-step instructions. Practice slowly!`;
        const dummySkeleton = [ // Generic hand-open pose for visual reference
            [0.5, 0.5, 0.0], // Wrist
            [0.4, 0.6, -0.1], [0.35, 0.65, -0.15], [0.3, 0.7, -0.2], [0.25, 0.75, -0.25], // Thumb
            [0.6, 0.4, -0.05], [0.65, 0.3, -0.1], [0.7, 0.2, -0.15], [0.75, 0.1, -0.2], // Index
            [0.55, 0.45, -0.05], [0.55, 0.35, -0.1], [0.55, 0.25, -0.15], [0.55, 0.15, -0.2], // Middle
            [0.5, 0.4, -0.05], [0.45, 0.3, -0.1], [0.4, 0.2, -0.15], [0.35, 0.1, -0.2], // Ring
            [0.45, 0.5, -0.05], [0.4, 0.4, -0.1], [0.35, 0.3, -0.15], [0.3, 0.2, -0.2]  // Pinky
        ];

        // Custom descriptions for known signs
        switch (lowerSignText) {
            case "hello":
                description = "For 'Hello', raise an open hand to your side, palm facing forward, and move it slightly side to side as if waving. Ensure your fingers are together and extended.";
                break;
            case "thank_you":
                description = "To sign 'Thank You', touch your fingertips to your chin and then move your hand forward and down in a graceful arc, extending your arm. Keep your palm open and fingers straight.";
                break;
            case "yes":
                description = "To sign 'Yes', form a fist and quickly move your hand up and down, as if nodding your head. Keep your thumb extended upwards.";
                break;
            case "no":
                description = "To sign 'No', form a fist with your thumb extended downwards and quickly move your hand up and down, as if shaking your head. Ensure your other fingers are curled into your palm.";
                break;
            case "i_love_you":
                description = "For 'I Love You', extend your thumb, index finger, and pinky finger, while curling your middle and ring fingers into your palm. This forms a unique shape.";
                break;
            case "help":
                description = "To sign 'Help', place your non-dominant hand flat, palm up. Place your dominant fist on top, thumb up, and lift both hands upwards. This signifies lifting someone up.";
                break;
            // Add more specific descriptions for other signs as desired
        }


        if (this.knownSigns.includes(lowerSignText)) {
            return {
                success: true,
                description: description,
                skeleton_data: dummySkeleton
            };
        } else {
            return {
                success: false,
                message: `Sign '${signText}' not found in our current dataset. Try 'hello', 'yes', or 'thank you'!`,
                skeleton_data: []
            };
        }
    }
}

// Instantiate our client-side hybrid model
const aiModelInstance = new SignRecognizer();
aiModelInstance.loadUserProfile("default"); // Load default profile on startup

// --- Utility Functions ---

function updateStatus(active) {
    if (active) {
        statusIndicator.textContent = '🟢 Camera Active';
        statusIndicator.classList.remove('status-inactive');
        statusIndicator.classList.add('status-active');
    } else {
        statusIndicator.textContent = '📷 Camera Inactive';
        statusIndicator.classList.remove('status-active');
        statusIndicator.classList.add('status-inactive');
    }
}

function speakText(text) {
    if (!text) return;

    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speakingRate;
        utterance.pitch = speakingPitch;
        utterance.volume = volumeSlider.value / 100;
        
        utterance.onstart = () => { isSpeaking = true; };
        utterance.onend = () => {
            isSpeaking = false;
            if (speechQueue.length > 0) {
                const nextText = speechQueue.shift();
                speakText(nextText);
            }
        };
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            isSpeaking = false;
        };

        // If the same text is spoken again, or if it's already speaking something else, queue it.
        // Otherwise, clear current speech and speak immediately.
        if (isSpeaking && text === lastSpokenText) {
             // Do nothing, already speaking this
        } else if (isSpeaking) {
            speechQueue.push(text);
        } else {
            window.speechSynthesis.cancel(); // Stop any current speech
            window.speechSynthesis.speak(utterance);
            lastSpokenText = text;
        }
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
}


function updateResultCard(signText, confidence, alternatives = [], phraseCompletion = null) {
    // Only update if the sign or confidence changed significantly, or if there's a phrase completion
    if (signText === currentSign && Math.abs(confidence - currentConfidence) < 5 && !phraseCompletion) {
        return;
    }

    resultsContainer.innerHTML = `
        <div class="result-card" style="animation-delay: 0s;">
            <div class="result-text">${signText}</div>
            <div class="confidence-section">
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${confidence}%"></div>
                </div>
                <div class="confidence-text">
                    <span>Confidence: ${confidence.toFixed(1)}%</span>
                    <span>${confidence >= 80 ? '✨ High Confidence' : (confidence >= 50 ? '🤖 AI Learning' : '🤔 Needs Clarity')}</span>
                </div>
            </div>
            <div class="audio-controls">
                <button class="audio-btn speak-current-result-btn">🔊</button>
                <div class="volume-control">
                    <input type="range" class="volume-slider" min="0" max="100" value="${volumeSlider.value}">
                </div>
            </div>
            ${alternatives.length > 0 && confidence < 80 ? `
                <div class="alternatives">
                    <div class="alternatives-title">Did you mean?</div>
                    <div class="alternatives-list">${alternatives.map(alt => `<span>${alt.replace(/_/g, ' ')}</span>`).join(', ')}</div>
                </div>
            ` : ''}
            ${phraseCompletion ? `
                <div class="phrase-completion">
                    <div class="phrase-text">"<span>${phraseCompletion}</span>" detected!</div>
                </div>
            ` : ''}
        </div>
    `;
    
    currentSign = signText;
    currentConfidence = confidence;

    const speakCurrentResultBtn = resultsContainer.querySelector('.speak-current-result-btn');
    if (speakCurrentResultBtn) {
        speakCurrentResultBtn.onclick = () => {
            const textToSpeak = phraseCompletion || signText;
            if (textToSpeak && textToSpeak !== 'Ready to start...' && textToSpeak !== 'No Hand Detected') {
                 speakText(textToSpeak);
            }
        };
    }
    const newVolumeSlider = resultsContainer.querySelector('.volume-slider');
    if (newVolumeSlider) {
        newVolumeSlider.oninput = (e) => {
            volumeSlider.value = e.target.value;
        };
    }
}

function updateSessionStats() {
    signsDetectedEl.textContent = signsDetectedCount;
    avgConfidenceEl.textContent = signsDetectedCount > 0 ? `${(totalConfidenceSum / signsDetectedCount).toFixed(0)}%` : '0%';
    phrasesCompletedEl.textContent = phrasesCompletedCount;

    if (sessionStartTime) {
        const elapsedSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        sessionTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// --- MediaPipe Processing & Sign Recognition ---
const holistic = new Holistic({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
    }
});

holistic.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.scale(-1, 1); // Mirror horizontally
    canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // Draw hand landmarks only if they are detected
    if (results.leftHandLandmarks) {
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        drawLandmarks(canvasCtx, results.leftHandLandmarks, { color: '#FF0000', lineWidth: 2 });
    }
    if (results.rightHandLandmarks) {
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        drawLandmarks(canvasCtx, results.rightHandLandmarks, { color: '#FF0000', lineWidth: 2 });
    }

    // Use our SignRecognizer (hybrid model) for prediction
    const prediction = aiModelInstance.predict(currentUserId, results.leftHandLandmarks, results.rightHandLandmarks);

    if (prediction.sign) {
        updateResultCard(prediction.sign.replace(/_/g, ' '), prediction.confidence, prediction.alternatives, prediction.phrase_completion);

        const textToSpeak
