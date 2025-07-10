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
    if (!handLandmarks || handLandmarks.length === 0) {
        // console.log("Hello Check: No hand landmarks.");
        return false;
    }

    const wrist = handLandmarks[0];
    const indexTip = handLandmarks[8];
    const middleTip = handLandmarks[12];
    const ringTip = handLandmarks[16];
    const pinkyTip = handLandmarks[20];
    const thumbTip = handLandmarks[4];

    // 1. Check if fingers are relatively straight and extended
    // We use a small Y-difference threshold for tips to indicate they are aligned horizontally (straight)
    const finger_tip_y_diff_threshold = 0.08;
    const index_middle_y_diff = Math.abs(indexTip.y - middleTip.y);
    const middle_ring_y_diff = Math.abs(middleTip.y - ringTip.y);
    const ring_pinky_y_diff = Math.abs(ringTip.y - pinkyTip.y);

    const fingers_straight = (
        index_middle_y_diff < finger_tip_y_diff_threshold &&
        middle_ring_y_diff < finger_tip_y_diff_threshold &&
        ring_pinky_y_diff < finger_tip_y_diff_threshold
    );
    // console.log("Hello Check: Fingers straight:", fingers_straight, "Diffs:", index_middle_y_diff.toFixed(3), middle_ring_y_diff.toFixed(3), ring_pinky_y_diff.toFixed(3));


    // 2. Check if fingers are generally above wrist (open hand gesture, palm facing out typically)
    // This assumes the hand is upright, not upside down.
    const fingers_above_wrist = (
        indexTip.y < wrist.y && middleTip.y < wrist.y &&
        ringTip.y < wrist.y && pinkyTip.y < wrist.y
    );
    // console.log("Hello Check: Fingers above wrist:", fingers_above_wrist);

    // 3. Check thumb extension relative to palm/index finger
    // Thumb should be out and relatively straight, not tucked in.
    const thumb_ip_dist = calculateDistance(handLandmarks[2], handLandmarks[3]); // Distance from thumb base to next joint
    const thumb_mp_dist = calculateDistance(handLandmarks[3], handLandmarks[4]); // Distance from next joint to thumb tip

    // Check if thumb is open (straight)
    const thumb_straight = thumb_ip_dist + thumb_mp_dist > calculateDistance(handLandmarks[2], handLandmarks[4]) * 0.9; // Sum of segments roughly equals direct distance
    // console.log("Hello Check: Thumb straight:", thumb_straight);

    // Check if thumb tip is roughly aligned with or slightly outside the palm area (for an open hand)
    // This is a rough X-axis check for right hand (thumb.x < indexBase.x means it's usually extended left for a right hand)
    // For left hand, it would be thumb.x > indexBase.x
    // Let's make it general: thumb x should be further from wrist x than index tip x.
    const thumb_extended_outwards = Math.abs(thumbTip.x - wrist.x) > Math.abs(indexTip.x - wrist.x) * 0.5; // Heuristic
    // console.log("Hello Check: Thumb extended outwards (relative to wrist):", thumb_extended_outwards);


    const isHello = fingers_straight && fingers_above_wrist && thumb_straight && thumb_extended_outwards;
    if(isHello) console.log("HELLO DETECTED!");
    return isHello;
}

function detectYes(handLandmarks) {
    if (!handLandmarks || handLandmarks.length === 0) {
        // console.log("Yes Check: No hand landmarks.");
        return false;
    }

    const thumbTip = handLandmarks[4];
    const thumbBase = handLandmarks[3];
    const indexKnuckle = handLandmarks[5]; // Base of index finger

    // 1. Thumb extended upwards
    const isThumbUp = thumbTip.y < thumbBase.y && thumbTip.y < indexKnuckle.y;
    // console.log("Yes Check: Is thumb up:", isThumbUp);

    // 2. Other fingers curled (simplified: their tips are below their respective knuckles)
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
    // console.log("Yes Check: Fingers curled:", fingersCurled);

    // 3. Check if thumb is sufficiently separated from other fingers
    const thumbSeparation = calculateDistance(thumbTip, indexKnuckle);
    const wrist_to_index_knuckle_dist = calculateDistance(handLandmarks[0], indexKnuckle);
    const thumbIsOut = thumbSeparation > wrist_to_index_knuckle_dist * 0.5; // Heuristic for thumb being out
    // console.log("Yes Check: Thumb is out:", thumbIsOut);

    const isYes = isThumbUp && fingersCurled && thumbIsOut;
    if(isYes) console.log("YES DETECTED!");
    return isYes;
}

function detectNo(handLandmarks) {
    if (!handLandmarks || handLandmarks.length === 0) {
        // console.log("No Check: No hand landmarks.");
        return false;
    }

    const thumbTip = handLandmarks[4];
    const thumbBase = handLandmarks[3];
    const wrist = handLandmarks[0];

    // 1. Thumb extended downwards
    const isThumbDown = thumbTip.y > thumbBase.y && thumbTip.y > wrist.y;
    // console.log("No Check: Is thumb down:", isThumbDown);

    // 2. Other fingers curled (same logic as 'yes')
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
    // console.log("No Check: Fingers curled:", fingersCurled);

    // 3. Check if thumb is sufficiently separated from other fingers (similar to 'yes')
    const thumbSeparation = calculateDistance(thumbTip, handLandmarks[5]); // Dist to index base
    const wrist_to_index_knuckle_dist = calculateDistance(wrist, handLandmarks[5]);
    const thumbIsOut = thumbSeparation > wrist_to_index_knuckle_dist * 0.5;
    // console.log("No Check: Thumb is out:", thumbIsOut);

    const isNo = isThumbDown && fingersCurled && thumbIsOut;
    if(isNo) console.log("NO DETECTED!");
    return isNo;
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
        // NOTE: The MediaPipe webcam mirror means your right hand appears on the left side of the video,
        // and its landmarks will be in `results.leftHandLandmarks`.
        // So, if you're signing with your physical right hand, use `results.leftHandLandmarks`.
        const activeHand = rightHandLandmarks && rightHandLandmarks.length > 0 ? rightHandLandmarks : leftHandLandmarks; // Use either hand if available

        let handToAnalyze = null;
        if (rightHandLandmarks && rightHandLandmarks.length > 0) {
            handToAnalyze = rightHandLandmarks;
            // console.log("Analyzing right hand landmarks.");
        } else if (leftHandLandmarks && leftHandLandmarks.length > 0) {
            handToAnalyze = leftHandLandmarks;
            // console.log("Analyzing left hand landmarks.");
        }

        if (handToAnalyze) {
            if (detectHello(handToAnalyze)) {
                recognizedSign = "hello";
                confidence = 95; // High confidence for rule-based match
            } else if (detectYes(handToAnalyze)) {
                recognizedSign = "yes";
                confidence = 95;
            } else if (detectNo(handToAnalyze)) {
                recognizedSign = "no";
                confidence = 95;
            }
        }

        // --- Priority 2: Fallback to Random Prediction for other signs ---
        // If no specific rule-based sign was detected, use the old random logic
        if (recognizedSign === "No Hand Detected") { // Check if it's still the default state
            const userBias = this.userProfiles[userId] ? this.userProfiles[userId].accuracy_bias : 0.0;
            const predictedRandomSign = this.knownSigns[Math.floor(Math.random() * this.knownSigns.length)];
            let randomConfidence = Math.random() * (99 - 30) + 30; // Random confidence between 30 and 99
            randomConfidence = Math.max(0, randomConfidence - (userBias * 100)); // Adjust by user bias

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
    // The previous condition `signText === currentSign && Math.abs(confidence - currentConfidence) < 5 && !phraseCompletion`
    // was too restrictive and might prevent updates even when a new confidence for the same sign is calculated.
    // Let's simplify: always update the card, but maybe only speak if it's a "new" sign or higher confidence.

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
    
    // update currentSign and currentConfidence for the next loop's comparison (for speaking logic)
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
    // MediaPipe's output might be results.rightHandLandmarks for your physical left hand if mirrored, and vice versa.
    // We'll draw both if present.
    if (results.leftHandLandmarks) {
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        drawLandmarks(canvasCtx, results.leftHandLandmarks, { color: '#FF0000', lineWidth: 2 });
    }
    if (results.rightHandLandmarks) {
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        drawLandmarks(canvasCtx, results.rightHandLandmarks, { color: '#FF0000', lineWidth: 2 });
    }

    // Use our SignRecognizer (hybrid model) for prediction
    // Pass both hands to the predictor
    const prediction = aiModelInstance.predict(currentUserId, results.leftHandLandmarks, results.rightHandLandmarks);

    if (prediction.sign) {
        // Update the display card. We always update it for real-time feedback.
        updateResultCard(prediction.sign.replace(/_/g, ' '), prediction.confidence, prediction.alternatives, prediction.phrase_completion);

        const textToSpeak = prediction.phrase_completion || prediction.sign.replace(/_/g, ' ');

        // Only speak if confidence is reasonable (>60%) and it's a *new* detected sign or phrase.
        // We avoid speaking "No Hand Detected" or "Ready to start..."
        // Also avoid speaking the same sign repeatedly without a significant change.
        if (textToSpeak && textToSpeak !== 'Ready to start...' && textToSpeak !== 'No Hand Detected' && prediction.confidence > 60) {
            if (prediction.sign !== currentSign || prediction.confidence > currentConfidence + 5 || prediction.phrase_completion) {
                // If it's a new sign, or significantly higher confidence for the same sign, or a phrase, then speak.
                 speakText(textToSpeak);
            }
        }

        // Update stats only for meaningful detections
        // Only increment if the sign is new and not "No Hand Detected" or "Ready to start..."
        if (prediction.sign !== 'No Hand Detected' && prediction.sign !== 'Ready to start...' && prediction.sign !== currentSign) {
            signsDetectedCount++;
            totalConfidenceSum += prediction.confidence;
            if (prediction.phrase_completion) {
                phrasesCompletedCount++;
            }
            updateSessionStats();
        }
        // currentSign and currentConfidence are already updated by updateResultCard
    }
});


// --- Webcam Control ---
async function startWebcam() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = mediaStream;
        videoElement.play();
        videoElement.onloadedmetadata = () => {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        };

        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await holistic.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });
        camera.start();

        sessionStartTime = Date.now();
        sessionTimerInterval = setInterval(updateSessionStats, 1000);

        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(true);
    } catch (err) {
        console.error("Error accessing webcam:", err);
        updateStatus(false);
        alert("Could not access webcam. Please ensure it's connected and permissions are granted. Error: " + err.message);
    }
}

function stopWebcam() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        mediaStream = null;
    }
    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
    }
    sessionStartTime = null;
    signsDetectedCount = 0;
    totalConfidenceSum = 0;
    phrasesCompletedCount = 0;
    updateSessionStats();

    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(false);
    updateResultCard("Ready to start...", 0); // Reset result card to initial state
}

// --- Event Listeners ---
startBtn.addEventListener('click', startWebcam);
stopBtn.addEventListener('click', stopWebcam);
speakBtn.addEventListener('click', () => {
    const textToSpeak = currentSign;
    if (textToSpeak && textToSpeak !== 'Ready to start...' && textToSpeak !== 'No Hand Detected') {
        speakText(textToSpeak);
    }
});

audioBtn.addEventListener('click', () => {
    const textToSpeak = currentSign;
    if (textToSpeak && textToSpeak !== 'Ready to start...' && textToSpeak !== 'No Hand Detected') {
        speakText(textToSpeak);
    }
});

volumeSlider.addEventListener('input', (e) => {
    console.log('Volume set to:', e.target.value);
});

userSelect.addEventListener('change', (event) => {
    currentUserId = event.target.value;
    // Client-side simulation of user profile loading
    const success = aiModelInstance.loadUserProfile(currentUserId);
    if (success) {
        console.log(`Client-side: Switched to user: ${currentUserId}`);
        updateResultCard(`Switched to ${userSelect.options[userSelect.selectedIndex].text} profile.`, 0);
    } else {
        console.warn(`Client-side: Profile ${currentUserId} not found. Using default simulation.`);
        updateResultCard(`Profile for ${userSelect.options[userSelect.selectedIndex].text} not found. Using default simulation.`, 0);
    }
});


// --- Practice Mode Logic ---
practiceBtn.addEventListener('click', () => {
    const textToGuide = practiceInput.value.trim();
    if (textToGuide) {
        // Call the client-side dummy model for guide data
        const guideData = aiModelInstance.getSignGuide(textToGuide);
        
        if (guideData.success) {
            practiceResults.innerHTML = `
                <div class="practice-guide">
                    <div class="guide-title">Guide for: "${textToGuide}"</div>
                    <div class="guide-description">${guideData.description}</div>
                    ${guideData.skeleton_data && guideData.skeleton_data.length > 0 ? `
                        <div class="hand-skeleton" id="livePracticeSkeleton">
                            <div class="skeleton-overlay"></div>
                            <canvas id="practiceCanvas" style="position:absolute; top:0; left:0;"></canvas>
                        </div>
                    ` : ''}
                </div>
            `;

            if (guideData.skeleton_data && guideData.skeleton_data.length > 0) {
                const practiceCanvas = document.getElementById('practiceCanvas');
                if (practiceCanvas) {
                    // Set canvas size to match parent container for proper display
                    const parentDiv = practiceCanvas.parentElement;
                    practiceCanvas.width = parentDiv.offsetWidth;
                    practiceCanvas.height = parentDiv.offsetHeight;
                    
                    const ctx = practiceCanvas.getContext('2d');
                    ctx.translate(practiceCanvas.width, 0); // Mirror horizontally for display consistency
                    ctx.scale(-1, 1); // Mirror horizontally for display consistency
                    // Draw the skeleton, adjusting coordinates if necessary for new canvas size
                    drawSkeletonOnCanvas(ctx, guideData.skeleton_data, practiceCanvas.width, practiceCanvas.height);
                }
            }
        } else {
            practiceResults.innerHTML = `<div class="result-card" style="border-left-color: orange;">${guideData.message}</div>`;
        }
    } else {
        practiceResults.innerHTML = `<div class="result-card" style="border-left-color: orange;">Please enter text to get a sign guide.</div>`;
    }
});

// Function to draw a hand skeleton on a canvas (for practice guide)
function drawSkeletonOnCanvas(ctx, landmarks, width, height) {
    if (!landmarks || landmarks.length === 0) return;

    // Scale landmarks to the new canvas size
    // landmarks are normalized (0-1), so multiply by width/height
    const points = landmarks.map(lm => ({ x: lm[0] * width, y: lm[1] * height }));

    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
        [9, 10], [10, 11], [11, 12],     // Middle finger
        [13, 14], [14, 15], [15, 16],    // Ring finger
        [17, 18], [18, 19], [19, 20],    // Pinky finger
        [0, 9], [9, 13], [13, 17], [0, 17] // Palm base connections (connecting knuckles and wrist)
    ];

    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    connections.forEach(conn => {
        const p1 = points[conn[0]];
        const p2 = points[conn[1]];
        if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    });

    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
    });
}


// --- Dataset Population (Dummy) ---
const dummySigns = [
    { name: "Hello", emoji: "👋" },
    { name: "Thank You", emoji: "🙏" },
    { name: "Yes", emoji: "👍" },
    { name: "No", emoji: "👎" },
    { name: "I Love You", emoji: "🤟" },
    { name: "Help", emoji: "🆘" },
    { name: "Water", emoji: "💧" },
    { name: "Food", emoji: "🍔" },
    { name: "Good", emoji: "✅" },
    { name: "Bad", emoji: "❌" },
    { name: "More", emoji: "➕" },
    { name: "Please", emoji: "🥺" },
    { name: "Sorry", emoji: "😔" },
    { name: "Name", emoji: "🏷️" },
    { name: "Home", emoji: "🏠" },
    { name: "Friends", emoji: "🤝" },
    { name: "Learn", emoji: "📚" }
];

function populateDatasetGrid() {
    datasetGrid.innerHTML = '';
    dummySigns.forEach(sign => {
        const signCard = document.createElement('div');
        signCard.className = 'sign-card';
        signCard.innerHTML = `
            <div class="sign-emoji">${sign.emoji}</div>
            <div class="sign-name">${sign.name}</div>
        `;
        signCard.addEventListener('click', () => {
            practiceInput.value = sign.name;
            practiceBtn.click(); // Simulate click on the practice button
        });
        datasetGrid.appendChild(signCard);
    });
}

// --- Floating Particles Effect ---
function createParticles() {
    const container = document.querySelector('.floating-particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 15 + 5;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${Math.random() * 10 + 5}s`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(particle);
    }
}

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    updateStatus(false);
    populateDatasetGrid();
    createParticles();
    holistic.initialize();
    updateSessionStats();
});
