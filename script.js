import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
// face-api.js is assumed to be globally available via CDN script in HTML head
// import * as faceapi from 'face-api.js'; // No longer imported directly in React

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// NOTE: For this React app to run, ensure face-api.js and its models are loaded via CDN in your HTML file's <head>
// Example (add these to your index.html or similar):
// <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
// <script src="https://cdn.tailwindcss.com"></script>
// <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">


// --- Firebase Context and Provider ---
const FirebaseContext = createContext(null);

const FirebaseProvider = ({ children }) => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false); // To ensure Firestore operations wait for auth

    useEffect(() => {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-mindbridge-app-id';
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

            if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
                console.error("Firebase config not found. Please ensure __firebase_config is set.");
                return;
            }

            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            setAuth(firebaseAuth);

            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

            if (initialAuthToken) {
                signInWithCustomToken(firebaseAuth, initialAuthToken)
                    .then((userCredential) => {
                        console.log("Signed in with custom token:", userCredential.user.uid);
                    })
                    .catch((error) => {
                        console.error("Error signing in with custom token:", error);
                        signInAnonymously(firebaseAuth)
                            .then(() => console.log("Signed in anonymously as fallback."))
                            .catch(anonError => console.error("Error signing in anonymously:", anonError));
                    });
            } else {
                signInAnonymously(firebaseAuth)
                    .then(() => console.log("Signed in anonymously."))
                    .catch(error => console.error("Error signing in anonymously:", error));
            }

            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    console.log("Auth state changed, user ID:", user.uid);
                } else {
                    setUserId(null);
                    console.log("User logged out or no user.");
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Error initializing Firebase:", e);
        }
    }, []);

    return (
        <FirebaseContext.Provider value={{ db, auth, userId, isAuthReady }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// --- Custom Hook to use Firebase ---
const useFirebase = () => {
    return useContext(FirebaseContext);
};

// --- Message Box Component ---
const MessageBox = ({ message, type, onClose }) => {
    if (!message) return null;
    const bgColor = type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700';
    const textColor = type === 'success' ? 'text-green-700' : 'text-red-700';

    return (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg border ${bgColor} z-50 flex items-center justify-between animate-fade-in`}>
            <span className={textColor}>{message}</span>
            <button
                onClick={onClose}
                className="ml-4 text-lg font-semibold leading-none text-gray-600 hover:text-gray-800"
                aria-label="Close message"
            >
                &times;
            </button>
        </div>
    );
};

// --- Header Component ---
const Header = ({ currentPage, setCurrentPage, userId }) => {
    return (
        <header className="bg-gradient-to-r from-purple-700 to-indigo-700 shadow-lg py-4 px-6 rounded-b-xl">
            <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
                <h1 className="text-3xl font-extrabold text-white flex items-center mb-4 md:mb-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9 mr-3 text-pink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 20v-3m0 0l.683-.566m-.683.566L11.317 17m0 0L8.683 17m3.317 0V7.5M12 21a9 9 0 110-18 9 9 0 010 18z" />
                    </svg>
                    MindBridge Lite
                </h1>
                <nav className="w-full md:w-auto">
                    <ul className="flex justify-center md:justify-end space-x-4 md:space-x-6">
                        <li><button onClick={() => setCurrentPage('dashboard')} className={`text-white hover:text-pink-200 font-medium transition duration-300 ease-in-out ${currentPage === 'dashboard' ? 'border-b-2 border-pink-300' : ''}`}>Dashboard</button></li>
                        <li><button onClick={() => setCurrentPage('video-coach')} className={`text-white hover:text-pink-200 font-medium transition duration-300 ease-in-out ${currentPage === 'video-coach' ? 'border-b-2 border-pink-300' : ''}`}>Video Coach</button></li>
                        <li><button onClick={() => setCurrentPage('chat-coach')} className={`text-white hover:text-pink-200 font-medium transition duration-300 ease-in-out ${currentPage === 'chat-coach' ? 'border-b-2 border-pink-300' : ''}`}>Chat Coach</button></li>
                        <li><button onClick={() => setCurrentPage('journal')} className={`text-white hover:text-pink-200 font-medium transition duration-300 ease-in-out ${currentPage === 'journal' ? 'border-b-2 border-pink-300' : ''}`}>Emotion Journal</button></li>
                        <li><button onClick={() => setCurrentPage('community')} className={`text-white hover:text-pink-200 font-medium transition duration-300 ease-in-out ${currentPage === 'community' ? 'border-b-2 border-pink-300' : ''}`}>Community</button></li>
                        <li><button onClick={() => setCurrentPage('resources')} className={`text-white hover:text-pink-200 font-medium transition duration-300 ease-in-out ${currentPage === 'resources' ? 'border-b-2 border-pink-300' : ''}`}>Resources</button></li>
                    </ul>
                </nav>
            </div>
            {userId && (
                <div className="container mx-auto text-center md:text-right mt-2 text-pink-100 text-sm">
                    User ID: {userId}
                </div>
            )}
        </header>
    );
};

// --- Footer Component ---
const Footer = () => {
    return (
        <footer className="bg-gray-800 text-white py-6 px-6 rounded-t-xl mt-8">
            <div className="container mx-auto text-center text-sm">
                <p>&copy; {new Date().getFullYear()} MindBridge Lite. All rights reserved.</p>
                <p className="mt-2">Bridging communication gaps with AI empathy.</p>
            </div>
        </footer>
    );
};

// --- Dashboard Component ---
const DashboardPage = ({ userProfile, showMessage }) => {
    const { db, userId, isAuthReady } = useFirebase();
    const [mood, setMood] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const moods = ['Happy', 'Neutral', 'Sad', 'Anxious', 'Excited', 'Calm'];

    const handleMoodCheckIn = async () => {
        if (!mood || !db || !userId || !isAuthReady) {
            showMessage('Please select a mood and ensure you are logged in.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const journalCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/emotionJournal`);
            await addDoc(journalCollectionRef, {
                mood: mood,
                note: note,
                timestamp: new Date().toISOString(),
            });
            showMessage('Mood check-in saved!', 'success');
            setMood('');
            setNote('');
        } catch (error) {
            console.error('Error saving mood check-in:', error);
            showMessage('Failed to save mood check-in.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (!userProfile) {
        return (
            <div className="flex justify-center items-center h-64 text-gray-600 text-xl">
                Loading user profile...
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-4xl mx-auto transform transition-all duration-500 ease-in-out hover:scale-[1.01]">
            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
                Your MindBridge Dashboard
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                {/* Quick Mood Check-in */}
                <div className="bg-purple-50 p-6 rounded-lg shadow-md border border-purple-200">
                    <h3 className="text-2xl font-semibold text-purple-700 mb-4">Quick Mood Check-in</h3>
                    <div className="mb-4">
                        <label htmlFor="moodSelect" className="block text-gray-700 text-lg font-medium mb-2">How are you feeling?</label>
                        <select
                            id="moodSelect"
                            value={mood}
                            onChange={(e) => setMood(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 transition duration-300"
                        >
                            <option value="">Select your mood</option>
                            {moods.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="mb-4">
                        <label htmlFor="moodNote" className="block text-gray-700 text-lg font-medium mb-2">Optional Note:</label>
                        <textarea
                            id="moodNote"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What's on your mind?"
                            rows="3"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 transition duration-300"
                        ></textarea>
                    </div>
                    <button
                        onClick={handleMoodCheckIn}
                        disabled={!mood || isSaving}
                        className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg text-lg font-bold hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center"
                    >
                        {isSaving ? (
                            <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <>
                                Save Mood Check-in
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </>
                        )}
                    </button>
                </div>

                {/* Quick Stats (Conceptual) */}
                <div className="bg-pink-50 p-6 rounded-lg shadow-md border border-pink-200">
                    <h3 className="text-2xl font-semibold text-pink-700 mb-4">Your Progress (Conceptual)</h3>
                    <p className="text-gray-700 text-lg mb-2">
                        This section would show trends from your Emotion Journal over time.
                    </p>
                    <ul className="list-disc list-inside text-gray-600 space-y-1">
                        <li>Most frequent mood: <span className="font-semibold">{userProfile.mostFrequentMood || 'N/A'}</span></li>
                        <li>Longest streak of positive moods: <span className="font-semibold">{userProfile.positiveStreak || 'N/A'}</span> days</li>
                        <li>Conversation Coach usage: <span className="font-semibold">{userProfile.coachSessions || 'N/A'}</span> sessions</li>
                    </ul>
                    <p className="text-sm text-gray-500 mt-4">
                        (These stats are conceptual for the hackathon and would require more complex data processing.)
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Video Coach Component ---
const VideoCoachPage = ({ showMessage }) => {
    const videoRef = useRef(null); // Changed from webcamRef
    const canvasRef = useRef(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [emotion, setEmotion] = useState('Neutral');
    const [emotionScore, setEmotionScore] = useState(0);
    const [isDetecting, setIsDetecting] = useState(false);
    const detectionInterval = useRef(null);

    // Define the base URL for face-api.js models - CORRECTED PATH
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/';

    // Load face-api.js models
    useEffect(() => {
        const loadModels = async () => {
            // Ensure faceapi is globally available (loaded via CDN script tag)
            if (typeof window.faceapi === 'undefined') {
                showMessage('face-api.js not loaded. Please ensure the CDN script is in your HTML head.', 'error');
                return;
            }
            showMessage('Loading AI models for emotion detection...', 'success');
            try {
                await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                await window.faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
                setModelsLoaded(true);
                showMessage('AI models loaded successfully!', 'success');
            } catch (error) {
                console.error("Error loading face-api models:", error);
                showMessage('Failed to load AI models. Please check console and ensure models are accessible.', 'error');
            }
        };
        loadModels();
    }, []);

    // Handle webcam stream
    useEffect(() => {
        const getVideo = async () => {
            if (videoRef.current) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    videoRef.current.srcObject = stream;
                } catch (err) {
                    console.error("Error accessing webcam:", err);
                    showMessage('Failed to access webcam. Please ensure camera permissions are granted.', 'error');
                }
            }
        };
        getVideo();

        // Cleanup stream on unmount
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject;
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
            }
        };
    }, []); // Run once on mount

    const startDetection = () => {
        // Ensure window.faceapi is available before starting detection
        if (typeof window.faceapi === 'undefined') {
            showMessage('face-api.js not loaded. Cannot start detection.', 'error');
            return;
        }

        if (!videoRef.current || !canvasRef.current || !modelsLoaded) {
            showMessage('Webcam or models not ready.', 'error');
            return;
        }
        setIsDetecting(true);
        showMessage('Starting emotion detection...', 'success');

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        window.faceapi.matchDimensions(canvas, displaySize);

        detectionInterval.current = setInterval(async () => {
            if (video.paused || video.ended) {
                clearInterval(detectionInterval.current);
                setIsDetecting(false);
                return;
            }

            const detections = await window.faceapi.detectSingleFace(video, new window.faceapi.TinyFaceDetectorOptions()).withFaceExpressions();

            if (detections) {
                const resizedDetections = window.faceapi.resizeResults(detections, displaySize);
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                // Draw bounding box (optional, can be removed for cleaner UI)
                // window.faceapi.draw.drawDetections(canvas, resizedDetections);

                const expressions = resizedDetections.expressions;
                const sortedExpressions = Object.entries(expressions).sort(([, a], [, b]) => b - a);
                const dominantEmotion = sortedExpressions[0][0];
                const dominantScore = sortedExpressions[0][1];

                setEmotion(dominantEmotion.charAt(0).toUpperCase() + dominantEmotion.slice(1)); // Capitalize
                setEmotionScore(dominantScore);

                // Draw emotion text
                const text = `${dominantEmotion.charAt(0).toUpperCase() + dominantEmotion.slice(1)} (${(dominantScore * 100).toFixed(0)}%)`;
                const box = resizedDetections.detection.box;
                const drawBox = new window.faceapi.draw.DrawBox(box, { label: text, boxColor: '#8B5CF6' });
                drawBox.draw(canvas);

            } else {
                setEmotion('No Face Detected');
                setEmotionScore(0);
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            }
        }, 100); // Run detection every 100ms
    };

    const stopDetection = () => {
        clearInterval(detectionInterval.current);
        setIsDetecting(false);
        setEmotion('Detection Stopped');
        setEmotionScore(0);
        if (canvasRef.current) {
            canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        showMessage('Emotion detection stopped.', 'success');
    };

    useEffect(() => {
        return () => { // Cleanup on unmount
            clearInterval(detectionInterval.current);
        };
    }, []);

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-4xl mx-auto transform transition-all duration-500 ease-in-out hover:scale-[1.01]">
            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
                Live Video Emotion Coach
            </h2>
            <p className="text-gray-600 text-center mb-6 text-lg">
                Understand your own facial expressions in real-time. (Your video is processed locally and not stored.)
            </p>

            <div className="relative w-full aspect-video bg-gray-200 rounded-lg overflow-hidden mb-6 flex justify-center items-center">
                {modelsLoaded ? (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className="absolute w-full h-full object-cover"
                            // onUserMediaError handled in useEffect for getUserMedia
                        />
                        <canvas ref={canvasRef} className="absolute w-full h-full"></canvas>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500">
                        <svg className="animate-spin h-10 w-10 text-purple-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p>Loading AI models...</p>
                    </div>
                )}
            </div>

            <div className="text-center mb-6">
                <p className="text-2xl font-bold text-gray-700">
                    Detected Emotion: <span className="text-purple-600">{emotion}</span>
                </p>
                {emotionScore > 0 && emotion !== 'No Face Detected' && (
                    <p className="text-md text-gray-500">Confidence: {(emotionScore * 100).toFixed(0)}%</p>
                )}
            </div>

            <div className="flex justify-center space-x-4">
                {!isDetecting ? (
                    <button
                        onClick={startDetection}
                        disabled={!modelsLoaded}
                        className="bg-purple-600 text-white py-3 px-8 rounded-lg text-lg font-bold hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Detection
                    </button>
                ) : (
                    <button
                        onClick={stopDetection}
                        className="bg-red-600 text-white py-3 px-8 rounded-lg text-lg font-bold hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                        </svg>
                        Stop Detection
                    </button>
                )}
            </div>
        </div>
    );
};

// --- Chat Coach Component ---
const ChatCoachPage = ({ showMessage }) => {
    const { db, userId, isAuthReady } = useFirebase();
    const [otherPersonMessage, setOtherPersonMessage] = useState('');
    const [aiSuggestion, setAiSuggestion] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [chatHistory, setChatHistory] = useState([]); // Stores { type: 'user'/'ai', text: '...' }
    const chatHistoryRef = useRef(null); // Ref for scrolling chat to bottom

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const synthRef = useRef(window.speechSynthesis);

    const [selectedScenario, setSelectedScenario] = useState('');
    const scenarios = [
        { id: 'gratitude', name: 'Expressing Gratitude', initialPrompt: 'Someone did something kind for you. How would you thank them sincerely and appropriately?' },
        { id: 'disagreement', name: 'Handling Disagreement', initialPrompt: 'You disagree with a friend\'s opinion. How can you express your view respectfully without causing offense?' },
        { id: 'apology', name: 'Making an Apology', initialPrompt: 'You made a mistake and need to apologize. How can you genuinely express regret and offer to make amends?' },
        { id: 'empathy', name: 'Showing Empathy', initialPrompt: 'A friend is feeling sad about a personal loss. How can you show empathy and offer support?' },
    ];

    // Scroll chat history to bottom
    useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // Initialize Speech Recognition
    useEffect(() => {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false; // Listen for a single utterance
            recognitionRef.current.interimResults = false; // Only final results

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                showMessage('Listening for your message...', 'success');
            };

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setOtherPersonMessage(transcript);
                setIsListening(false);
                showMessage('Speech recognized!', 'success');
            };

            recognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                showMessage(`Speech recognition error: ${event.error}`, 'error');
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        } else {
            console.warn('Speech Recognition not supported in this browser.');
            showMessage('Speech Recognition not supported in your browser.', 'error');
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            setOtherPersonMessage(''); // Clear previous input
            recognitionRef.current.start();
        }
    };

    const speakText = (text) => {
        if (synthRef.current && text) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US'; // Set language
            synthRef.current.speak(utterance);
        }
    };

    const handleGetSuggestion = async () => {
        if (!otherPersonMessage.trim() && !selectedScenario) {
            showMessage('Please enter a message or select a scenario.', 'error');
            return;
        }

        setIsGenerating(true);
        setAiSuggestion(''); // Clear previous suggestion

        // Add user message to history
        const currentInput = selectedScenario ? `Scenario selected: ${scenarios.find(s => s.id === selectedScenario).name}` : otherPersonMessage;
        setChatHistory(prev => [...prev, { type: 'user', text: currentInput }]);

        // Prepare context for adaptive feedback
        const recentChatContext = chatHistory.slice(-5).map(msg => `${msg.type === 'user' ? 'Other Person' : 'AI'}: ${msg.text}`).join('\n');
        const basePrompt = selectedScenario
            ? scenarios.find(s => s.id === selectedScenario).initialPrompt
            : `The other person just said: "${otherPersonMessage}".`;

        const fullPrompt = `You are an AI conversation coach for someone who struggles with social cues.
        ${recentChatContext ? `Recent conversation context:\n${recentChatContext}\n` : ''}
        ${basePrompt}
        Suggest a polite, appropriate, and empathetic response. Focus on acknowledging their statement and offering a clear, concise reply. Provide only the suggested response, without any introductory or concluding remarks.`;

        let geminiChatHistory = [];
        geminiChatHistory.push({ role: "user", parts: [{ text: fullPrompt }] });
        const payload = { contents: geminiChatHistory };
        const apiKey = ""; // Canvas will provide this in runtime
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setAiSuggestion(text);
                setChatHistory(prev => [...prev, { type: 'ai', text: text }]);
                showMessage('AI suggestion generated!', 'success');
            } else {
                setAiSuggestion('Could not generate a suggestion. Please try again.');
                showMessage('Failed to generate AI suggestion.', 'error');
            }
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            showMessage('Error generating AI suggestion. Please check your connection.', 'error');
        } finally {
            setIsGenerating(false);
            setOtherPersonMessage(''); // Clear input after getting suggestion
            setSelectedScenario(''); // Clear selected scenario
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-3xl mx-auto transform transition-all duration-500 ease-in-out hover:scale-[1.01]">
            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
                AI Conversation Coach
            </h2>
            <p className="text-gray-600 text-center mb-6 text-lg">
                Practice social responses. Enter what the other person said, or choose a scenario.
            </p>

            {/* Guided Practice Scenarios */}
            <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-2xl font-semibold text-blue-700 mb-4">Guided Practice Scenarios</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {scenarios.map(scenario => (
                        <button
                            key={scenario.id}
                            onClick={() => {
                                setSelectedScenario(scenario.id);
                                setOtherPersonMessage(''); // Clear any manual input
                                showMessage(`Scenario selected: ${scenario.name}`, 'success');
                            }}
                            className={`px-4 py-2 rounded-lg font-medium transition duration-300 ${selectedScenario === scenario.id ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'} shadow-md`}
                        >
                            {scenario.name}
                        </button>
                    ))}
                </div>
                {selectedScenario && (
                    <p className="mt-4 text-gray-700">
                        Selected: <span className="font-semibold">{scenarios.find(s => s.id === selectedScenario)?.name}</span>.
                        Click "Get Suggestion" to start.
                    </p>
                )}
            </div>

            <div ref={chatHistoryRef} className="border border-gray-200 rounded-lg p-4 mb-6 h-80 overflow-y-auto bg-gray-50 shadow-inner">
                {chatHistory.length === 0 ? (
                    <p className="text-gray-400 text-center py-10">Conversation history will appear here.</p>
                ) : (
                    chatHistory.map((msg, index) => (
                        <div key={index} className={`mb-3 p-3 rounded-lg max-w-[80%] ${msg.type === 'user' ? 'bg-indigo-100 ml-auto text-right' : 'bg-purple-100 mr-auto text-left'}`}>
                            <p className={`font-semibold ${msg.type === 'user' ? 'text-indigo-800' : 'text-purple-800'}`}>
                                {msg.type === 'user' ? 'Other Person:' : 'AI Suggestion:'}
                            </p>
                            <p className="text-gray-800">{msg.text}</p>
                            {msg.type === 'ai' && (
                                <button
                                    onClick={() => speakText(msg.text)}
                                    className="mt-2 text-sm text-purple-600 hover:text-purple-800 flex items-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1V9a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.107 12 5v14c0 .893-1.077 1.337-1.707.707L5.586 15z" />
                                    </svg>
                                    Listen
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div className="mb-6">
                <label htmlFor="otherPersonMessage" className="block text-gray-700 text-lg font-medium mb-2">What did the other person say?</label>
                <div className="flex space-x-2">
                    <textarea
                        id="otherPersonMessage"
                        value={otherPersonMessage}
                        onChange={(e) => {
                            setOtherPersonMessage(e.target.value);
                            setSelectedScenario(''); // Clear scenario if user types
                        }}
                        placeholder="e.g., 'I'm feeling a bit down today, my dog is sick.'"
                        rows="3"
                        className="flex-grow px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition duration-300"
                        disabled={isGenerating || isListening}
                    ></textarea>
                    <button
                        onClick={startListening}
                        disabled={isListening || isGenerating}
                        className={`p-3 rounded-lg text-white transition duration-300 ${isListening ? 'bg-red-500' : 'bg-green-500 hover:bg-green-600'} focus:outline-none focus:ring-4 focus:ring-green-300`}
                        title={isListening ? "Stop Listening" : "Start Listening"}
                    >
                        {isListening ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0v-1a7 7 0 0114 0v1z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h4a2 2 0 002-2v-1a2 2 0 00-2-2h-4a2 2 0 00-2 2v1a2 2 0 002 2z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            <button
                onClick={handleGetSuggestion}
                disabled={isGenerating || (!otherPersonMessage.trim() && !selectedScenario)}
                className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg text-lg font-bold hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center"
            >
                {isGenerating ? (
                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <>
                        Get Suggestion
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </>
                )}
            </button>
        </div>
    );
};

// --- Emotion Journal Dashboard Component ---
const EmotionJournalPage = () => {
    const { db, userId, isAuthReady } = useFirebase();
    const [journalEntries, setJournalEntries] = useState([]);
    const [isLoadingJournal, setIsLoadingJournal] = useState(true);

    // Map mood strings to numerical values for charting
    const moodToValue = {
        'Happy': 5,
        'Excited': 4.5,
        'Calm': 4,
        'Neutral': 3,
        'Anxious': 2,
        'Sad': 1,
    };

    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const journalCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/emotionJournal`);
        const q = query(journalCollectionRef, orderBy('timestamp', 'desc'), limit(30)); // Last 30 entries for chart

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEntries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp ? new Date(doc.data().timestamp) : new Date() // Parse to Date object
            }));
            setJournalEntries(fetchedEntries);
            setIsLoadingJournal(false);
        }, (error) => {
            console.error("Error fetching journal entries:", error);
            setIsLoadingJournal(false);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    // Prepare data for Recharts
    const chartData = journalEntries.map(entry => ({
        date: entry.timestamp.toLocaleDateString(), // Format for X-axis
        moodValue: moodToValue[entry.mood] || 3, // Default to Neutral if mood not mapped
        moodLabel: entry.mood,
    })).reverse(); // Reverse to show chronological order on chart

    if (isLoadingJournal) {
        return (
            <div className="flex justify-center items-center h-64 text-gray-600 text-xl">
                Loading journal entries...
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-5xl mx-auto transform transition-all duration-500 ease-in-out hover:scale-[1.01]">
            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
                Your Emotion Journal & Trends
            </h2>

            {journalEntries.length === 0 ? (
                <div className="text-center text-gray-500 text-lg py-10">
                    No journal entries yet. Check in your mood from the Dashboard to see trends!
                </div>
            ) : (
                <>
                    {/* Mood Trend Chart */}
                    <div className="mb-10 p-6 bg-indigo-50 rounded-lg shadow-md border border-indigo-200">
                        <h3 className="text-2xl font-semibold text-indigo-700 mb-4">Mood Trends Over Time</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart
                                data={chartData}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                <XAxis dataKey="date" />
                                <YAxis domain={[0, 5.5]} ticks={[1, 2, 3, 4, 5]} tickFormatter={(value) => Object.keys(moodToValue).find(key => moodToValue[key] === value) || ''} />
                                <Tooltip formatter={(value, name, props) => [props.payload.moodLabel, 'Mood']} />
                                <Line type="monotone" dataKey="moodValue" stroke="#8884d8" activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                        <p className="text-center text-gray-600 text-sm mt-4">
                            (Higher values indicate more positive moods. Y-axis labels are conceptual moods.)
                        </p>
                    </div>

                    {/* Recent Entries List */}
                    <div className="mb-10 p-6 bg-blue-50 rounded-lg shadow-md border border-blue-200">
                        <h3 className="text-2xl font-semibold text-blue-700 mb-4">Recent Entries</h3>
                        <div className="space-y-4">
                            {journalEntries.map(entry => (
                                <div key={entry.id} className="bg-white p-5 rounded-lg shadow-sm border border-blue-100 hover:shadow-md transition-shadow duration-300">
                                    <p className="text-lg font-semibold text-blue-700 mb-1">Mood: {entry.mood}</p>
                                    {entry.note && <p className="text-gray-700 mb-1">Note: {entry.note}</p>}
                                    <p className="text-sm text-gray-500">Time: {entry.timestamp.toLocaleString()}</p> {/* FIX: Convert Date object to string */}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// --- Community Forum Component ---
const CommunityPage = ({ showMessage }) => {
    const { db, userId, isAuthReady } = useFirebase();
    const [posts, setPosts] = useState([]);
    const [newPostContent, setNewPostContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [isLoadingPosts, setIsLoadingPosts] = useState(true);

    useEffect(() => {
        if (!db || !isAuthReady) return;

        const postsCollectionRef = collection(db, `artifacts/${__app_id}/public/data/communityPosts`);
        const q = query(postsCollectionRef, orderBy('timestamp', 'desc'), limit(50)); // Last 50 posts

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPosts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp ? new Date(doc.data().timestamp).toLocaleString() : 'N/A'
            }));
            setPosts(fetchedPosts);
            setIsLoadingPosts(false);
        }, (error) => {
            console.error("Error fetching community posts:", error);
            showMessage('Failed to load community posts.', 'error');
            setIsLoadingPosts(false);
        });

        return () => unsubscribe();
    }, [db, isAuthReady, showMessage]);

    const handleAddPost = async () => {
        if (!newPostContent.trim() || !db || !userId || !isAuthReady) {
            showMessage('Please enter content for your post and ensure you are logged in.', 'error');
            return;
        }

        setIsPosting(true);
        try {
            const postsCollectionRef = collection(db, `artifacts/${__app_id}/public/data/communityPosts`);
            await addDoc(postsCollectionRef, {
                authorId: userId, // Using userId for author
                content: newPostContent,
                timestamp: new Date().toISOString(),
            });
            showMessage('Post added successfully!', 'success');
            setNewPostContent('');
        } catch (error) {
            console.error('Error adding post:', error);
            showMessage('Failed to add post. Please try again.', 'error');
        } finally {
            setIsPosting(false);
        }
    };

    if (isLoadingPosts) {
        return (
            <div className="flex justify-center items-center h-64 text-gray-600 text-xl">
                Loading community forum...
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-4xl mx-auto transform transition-all duration-500 ease-in-out hover:scale-[1.01]">
            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
                Community Forum
            </h2>
            <p className="text-gray-600 text-center mb-6 text-lg">
                Connect with others, share experiences, and offer support.
            </p>

            {/* New Post Section */}
            <div className="mb-8 p-6 bg-green-50 rounded-lg shadow-md border border-green-200">
                <h3 className="text-2xl font-semibold text-green-700 mb-4">Create New Post</h3>
                <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Share your thoughts or ask a question..."
                    rows="4"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 transition duration-300 mb-4"
                    disabled={isPosting}
                ></textarea>
                <button
                    onClick={handleAddPost}
                    disabled={isPosting || !newPostContent.trim()}
                    className="w-full bg-green-600 text-white py-3 px-6 rounded-lg text-lg font-bold hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center"
                >
                    {isPosting ? (
                        <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <>
                            Post to Forum
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </>
                    )}
                </button>
            </div>

            {/* Existing Posts */}
            <div className="space-y-6">
                {posts.length === 0 ? (
                    <div className="text-center text-gray-500 text-lg py-10">
                        No posts yet. Be the first to share!
                    </div>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-300">
                            <p className="text-gray-800 text-lg mb-2 leading-relaxed">{post.content}</p>
                            <p className="text-sm text-gray-500">
                                Posted by: <span className="font-semibold">{post.authorId.substring(0, 8)}...</span> on {post.timestamp}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                (Full User ID: {post.authorId})
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// --- Resources Page (Conceptual Professional Integration) ---
const ResourcesPage = () => {
    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-4xl mx-auto transform transition-all duration-500 ease-in-out hover:scale-[1.01]">
            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
                Professional Resources & Support
            </h2>
            <p className="text-gray-600 text-center mb-6 text-lg">
                MindBridge Lite aims to connect you with professional support when needed.
            </p>

            <div className="space-y-8">
                <div className="bg-red-50 p-6 rounded-lg shadow-md border border-red-200">
                    <h3 className="text-2xl font-semibold text-red-700 mb-4">Connect with a Therapist/Coach (Conceptual)</h3>
                    <p className="text-gray-700 mb-4">
                        In a full version of MindBridge Lite, you would be able to securely connect with licensed therapists or communication coaches. This could include:
                    </p>
                    <ul className="list-disc list-inside text-gray-600 space-y-2">
                        <li>Secure video call scheduling and sessions.</li>
                        <li>Option to share your Emotion Journal trends (with your explicit consent).</li>
                        <li>Direct messaging for quick check-ins.</li>
                        <li>Personalized exercises and homework assigned by your professional.</li>
                    </ul>
                    <button className="mt-6 bg-red-600 text-white py-3 px-6 rounded-lg text-lg font-bold hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 transition duration-300 ease-in-out transform hover:scale-105">
                        Find a Professional (Coming Soon)
                    </button>
                </div>

                <div className="bg-yellow-50 p-6 rounded-lg shadow-md border border-yellow-200">
                    <h3 className="text-2xl font-semibold text-yellow-700 mb-4">Educational Articles & Workshops</h3>
                    <p className="text-gray-700 mb-4">
                        Access curated articles, videos, and online workshops on topics related to neurodiversity, communication skills, emotional regulation, and social interaction.
                    </p>
                    <ul className="list-disc list-inside text-gray-600 space-y-2">
                        <li>Understanding Non-Verbal Cues</li>
                        <li>Active Listening Techniques</li>
                        <li>Managing Social Anxiety</li>
                        <li>Building Meaningful Relationships</li>
                    </ul>
                    <button className="mt-6 bg-yellow-600 text-white py-3 px-6 rounded-lg text-lg font-bold hover:bg-yellow-700 focus:outline-none focus:ring-4 focus:ring-yellow-300 transition duration-300 ease-in-out transform hover:scale-105">
                        Explore Learning Resources (Coming Soon)
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main App Component ---
const App = () => {
    const { db, userId, isAuthReady } = useFirebase();
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [userProfile, setUserProfile] = useState(null);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');

    const showMessage = (msg, type) => {
        setMessage(msg);
        setMessageType(type);
        const timer = setTimeout(() => {
            setMessage('');
            setMessageType('');
        }, 5000);
        return () => clearTimeout(timer);
    };

    // Fetch or create user profile in Firestore
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const userDocRef = doc(db, `artifacts/${__app_id}/users/${userId}/profile/data`);

        const unsubscribe = onSnapshot(userDocRef, async (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data());
                console.log("User profile loaded:", docSnap.data());
            } else {
                const defaultProfile = {
                    username: `User_${userId.substring(0, 6)}`,
                    mostFrequentMood: 'N/A', // Conceptual for hackathon
                    positiveStreak: 0, // Conceptual for hackathon
                    coachSessions: 0, // Conceptual for hackathon
                };
                try {
                    await setDoc(userDocRef, defaultProfile);
                    setUserProfile(defaultProfile);
                    showMessage('Welcome! Your MindBridge Lite profile has been created.', 'success');
                    console.log("New user profile created.");
                } catch (error) {
                    console.error("Error creating user profile:", error);
                    showMessage('Failed to create user profile.', 'error');
                }
            }
        }, (error) => {
            console.error("Error fetching user profile:", error);
            showMessage('Error loading user profile.', 'error');
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 font-inter flex flex-col">
            <Header currentPage={currentPage} setCurrentPage={setCurrentPage} userId={userId} />
            <MessageBox message={message} type={messageType} onClose={() => setMessage('')} />

            <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
                {!isAuthReady ? (
                    <div className="flex justify-center items-center h-64 text-gray-600 text-xl">
                        Initializing MindBridge Lite...
                    </div>
                ) : (
                    <>
                        {currentPage === 'dashboard' && <DashboardPage userProfile={userProfile} showMessage={showMessage} />}
                        {currentPage === 'video-coach' && <VideoCoachPage showMessage={showMessage} />}
                        {currentPage === 'chat-coach' && <ChatCoachPage showMessage={showMessage} />}
                        {currentPage === 'journal' && <EmotionJournalPage />}
                        {currentPage === 'community' && <CommunityPage showMessage={showMessage} />}
                        {currentPage === 'resources' && <ResourcesPage />}
                    </>
                )}
            </main>

            <Footer />
        </div>
    );
};

// Wrap the App component with FirebaseProvider
const RootApp = () => (
    <FirebaseProvider>
        <App />
    </FirebaseProvider>
);

export default RootApp;
