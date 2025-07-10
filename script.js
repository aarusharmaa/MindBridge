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

// --- Dummy AI Model (Client-Side JavaScript Version) ---
// This class mimics the functionality of your Python Flask backend's DummySignClassifier.
// All logic is now within the browser.
class DummySignClassifierJS {
    constructor() {
        this.knownSigns = [
            "hello", "thank_you", "yes", "no", "i_love_you", "help",
            "water", "food", "good", "bad", "more", "please", "sorry",
            "name", "home", "friends", "learn"
        ];
        // User profiles are now just for simulation of 'adaptive' behavior.
        // Data is not persistently saved without a backend.
        this.userProfiles = {
            "default": { model_loaded: true, accuracy_bias: 0.0 },
            "user1": { model_loaded: true, accuracy_bias: 0.1 }, // Alex Johnson
            "user2": { model_loaded: true, accuracy_bias: 0.05 }, // Maria Garcia
            "user3": { model_loaded: true, accuracy_bias: 0.15 } // David Chen
        };
    }

    loadUserProfile(userId) {
        // Simulates loading a user profile. In a real app, this might load
        // user-specific model parameters from IndexedDB or a server.
        // For GitHub Pages, we just confirm it exists in our dummy data.
        if (this.userProfiles[userId]) {
            console.log(`DEBUG: Loaded dummy profile for user: ${userId}`);
            return true;
        } else {
            console.warn(`DEBUG: Profile ${userId} not found. Using default behavior.`);
            return false; // Profile not found in our pre-defined list
        }
    }

    // This is a DUMMY prediction based on random choice.
    // In a real application, you would run a pre-trained TensorFlow.js model
    // on the 'left_hand_landmarks' and 'right_hand_landmarks'.
    predict(userId, leftHandLandmarks, rightHandLandmarks) {
        if (!leftHandLandmarks && !rightHandLandmarks) {
            return { sign: "No Hand Detected", confidence: 0, alternatives: [] };
        }

        const userBias = this.userProfiles[userId] ? this.userProfiles[userId].accuracy_bias : 0.0;

        // Simulate a prediction
        const predictedSign = this.knownSigns[Math.floor(Math.random() * this.knownSigns.length)];
        let confidence = Math.random() * (99 - 30) + 30; // Random confidence between 30 and 99
        
        // Apply user-specific "bias" to confidence
        confidence = Math.max(0, confidence - (userBias * 100)); // Lower confidence slightly for higher bias

        const alternatives = [];
        if (confidence < 80) { // If confidence is low, suggest alternatives
            const otherSigns = this.knownSigns.filter(s => s !== predictedSign);
            const numAlternatives = Math.min(Math.floor(Math.random() * 3) + 1, otherSigns.length); // 1 to 3 alternatives
            while (alternatives.length < numAlternatives) {
                const alt = otherSigns[Math.floor(Math.random() * otherSigns.length)];
                if (!alternatives.includes(alt)) {
                    alternatives.push(alt);
                }
            }
        }

        // Simulate context-aware phrase completion
        let phraseCompletion = null;
        if (predictedSign === "thank_you" && Math.random() > 0.7) {
            phraseCompletion = "Thank you very much!";
        } else if (predictedSign === "hello" && Math.random() > 0.7) {
            phraseCompletion = "Hello there!";
        } else if (predictedSign === "yes" && Math.random() > 0.6) {
            phraseCompletion = "Yes, I agree!";
        }

        return {
            sign: predictedSign,
            confidence: parseFloat(confidence.toFixed(2)),
            alternatives: alternatives,
            phrase_completion: phraseCompletion
        };
    }

    getSignGuide(signText) {
        // Dummy skeleton data for 21 landmarks (e.g., for one hand)
        // These are normalized coordinates (0.0 to 1.0)
        const dummySkeleton = [
            [0.5, 0.5, 0.0], // Wrist
            [0.4, 0.6, -0.1], [0.35, 0.65, -0.15], [0.3, 0.7, -0.2], [0.25, 0.75, -0.25], // Thumb
            [0.6, 0.4, -0.05], [0.65, 0.3, -0.1], [0.7, 0.2, -0.15], [0.75, 0.1, -0.2], // Index
            [0.55, 0.45, -0.05], [0.55, 0.35, -0.1], [0.55, 0.25, -0.15], [0.55, 0.15, -0.2], // Middle
            [0.5, 0.4, -0.05], [0.45, 0.3, -0.1], [0.4, 0.2, -0.15], [0.35, 0.1, -0.2], // Ring
            [0.45, 0.5, -0.05], [0.4, 0.4, -0.1], [0.35, 0.3, -0.15], [0.3, 0.2, -0.2]  // Pinky
        ];

        if (this.knownSigns.includes(signText.toLowerCase().replace(/\s+/g, '_'))) {
            return {
                success: true,
                description: `This is a placeholder guide for '${signText}'. In a full implementation, you'd see a detailed visual animation or step-by-step instructions on how to perform this sign. Practice slowly!`,
                skeleton_data: dummySkeleton
            };
        } else {
            return {
                success: false,
                message: `Sign '${signText}' not found in our current dataset. Try 'hello' or 'thank you' (case-insensitive)!`,
                skeleton_data: []
            };
        }
    }
}

// Instantiate our client-side dummy model
const aiModelInstance = new DummySignClassifierJS();
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

    if (isSpeaking && text === lastSpokenText) {
        return;
    }

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

        if (!isSpeaking || text !== lastSpokenText) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
            lastSpokenText = text;
        } else {
            speechQueue.push(text);
        }
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
}

function updateResultCard(signText, confidence, alternatives = [], phraseCompletion = null) {
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

// --- Client-Side AI Logic (MediaPipe Processing & Dummy Prediction) ---
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

    drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
    drawLandmarks(canvasCtx, results.leftHandLandmarks, { color: '#FF0000', lineWidth: 2 });
    drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
    drawLandmarks(canvasCtx, results.rightHandLandmarks, { color: '#FF0000', lineWidth: 2 });

    // Use the client-side dummy AI model for prediction
    // MediaPipe landmarks are already in the format needed [x, y, z] for each landmark
    // so no need for .map(l => [l.x, l.y, l.z])
    const prediction = aiModelInstance.predict(currentUserId, results.leftHandLandmarks, results.rightHandLandmarks);

    if (prediction.sign) {
        updateResultCard(prediction.sign.replace(/_/g, ' '), prediction.confidence, prediction.alternatives, prediction.phrase_completion);

        const textToSpeak = prediction.phrase_completion || prediction.sign.replace(/_/g, ' ');

        if (textToSpeak && textToSpeak !== lastSpokenText && prediction.confidence > 60) {
            speakText(textToSpeak);
            lastSpokenText = textToSpeak;
        }

        if (prediction.sign !== 'No Hand Detected' && prediction.sign !== 'Ready to start...' && prediction.sign !== currentSign) {
            signsDetectedCount++;
            totalConfidenceSum += prediction.confidence;
            if (prediction.phrase_completion) {
                phrasesCompletedCount++;
            }
            updateSessionStats();
        }
        currentSign = prediction.sign;
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
    updateResultCard("Ready to start...", 0);
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
                    practiceCanvas.width = videoElement.videoWidth > 0 ? videoElement.videoWidth : 640;
                    practiceCanvas.height = videoElement.videoHeight > 0 ? videoElement.videoHeight : 480;
                    const ctx = practiceCanvas.getContext('2d');
                    ctx.translate(practiceCanvas.width, 0);
                    ctx.scale(-1, 1);
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

    const points = landmarks.map(lm => ({ x: lm[0] * width, y: lm[1] * height }));

    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
        [9, 10], [10, 11], [11, 12],     // Middle finger
        [13, 14], [14, 15], [15, 16],    // Ring finger
        [17, 18], [18, 19], [19, 20],    // Pinky finger
        [0, 9], [9, 13], [13, 17], [0, 17] // Palm base connections
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
            practiceBtn.click();
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
