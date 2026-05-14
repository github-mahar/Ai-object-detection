document.getElementById("ai").addEventListener("change", toggleAi)
document.getElementById("fps").addEventListener("input", changeFps)

const video = document.getElementById("video");
const c1 = document.getElementById('c1');
const ctx1 = c1.getContext('2d');
const loadingText = document.getElementById("loadingText");
const fpsValueText = document.getElementById("fpsValue");
const announceText = document.getElementById("announceText");
const emotionText = document.getElementById("emotionText");
const emotionModelUrl = "https://justadudewhohacks.github.io/face-api.js/models";
var cameraAvailable = false;
var aiEnabled = false;
var fps = 16;
let detectionInProgress = false;
let emotionDetectionInProgress = false;
let emotionTick = 0;
const speechSupported = "speechSynthesis" in window;
const speechConfidenceThreshold = 0.6;
const speechRepeatCooldownMs = 3000;
const emotionSpeechCooldownMs = 5000;
const emotionDetectionStride = 12;
const drawConfidenceThreshold = 0.55;
const stableConfidenceThreshold = 0.7;
const requiredStableFrames = 2;
const lastSpokenLabelAt = {};
const lastSpokenEmotionAt = {};
const labelStreakCount = {};
let emotionModelIsLoaded = false;

if (fpsValueText) {
    fpsValueText.innerText = document.getElementById("fps").value;
}

loadEmotionModels();

/* Setting up the constraint */
var facingMode = "environment"; // Can be 'user' or 'environment' to access back or front camera (NEAT!)
var constraints = {
    audio: false,
    video: {
        facingMode: facingMode
    }
};

/* Stream it to video element */
camera();
function camera() {
    if (!cameraAvailable) {
        console.log("camera")
        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            cameraAvailable = true;
            video.srcObject = stream;
        }).catch(function (err) {
            cameraAvailable = false;
            if (modelIsLoaded) {
                if (err.name === "NotAllowedError") {
                    loadingText.innerText = "Waiting for camera permission";
                    loadingText.classList.add("warning");
                    updateAnnouncement("Camera permission is required.");
                }
            }
            setTimeout(camera, 1000);
        });
    }
}

window.onload = function () {
    timerCallback();
}

function timerCallback() {
    if (isReady()) {
        setResolution();
        ctx1.drawImage(video, 0, 0, c1.width, c1.height);
        if (aiEnabled) {
            ai();
            emotionTick += 1;
            if (emotionModelIsLoaded && emotionTick >= emotionDetectionStride) {
                emotionTick = 0;
                detectEmotion();
            }
        }
    }
    setTimeout(timerCallback, fps);
}

function isReady() {
    if (modelIsLoaded && cameraAvailable) {
        loadingText.innerText = emotionModelIsLoaded ? "Ready" : "Ready - emotion model loading";
        loadingText.classList.add("ready");
        loadingText.classList.remove("warning");
        document.getElementById("ai").disabled = false;
        return true;
    } else {
        loadingText.classList.remove("ready");
        return false;
    }
}

function setResolution() {
    if (window.screen.width < video.videoWidth) {
        c1.width = window.screen.width * 0.9;
        let factor = c1.width / video.videoWidth;
        c1.height = video.videoHeight * factor;
    } else if (window.screen.height < video.videoHeight) {
        c1.height = window.screen.height * 0.50;
        let factor = c1.height / video.videoHeight;
        c1.width = video.videoWidth * factor;
    }
    else {
        c1.width = video.videoWidth;
        c1.height = video.videoHeight;
    }
};

function toggleAi() {
    aiEnabled = document.getElementById("ai").checked;
    if (!aiEnabled && speechSupported) {
        window.speechSynthesis.cancel();
        updateAnnouncement("Detection paused.");
        updateEmotionStatus("Emotion detection paused.", "warning");
    } else if (aiEnabled) {
        updateAnnouncement("Detection started.");
        if (emotionModelIsLoaded) {
            updateEmotionStatus("Waiting for a face...", "warning");
        }
    }
}

function changeFps() {
    const sliderValue = document.getElementById("fps").value;
    fps = 1000 / sliderValue;
    if (fpsValueText) {
        fpsValueText.innerText = sliderValue;
    }
}

function ai() {
    if (detectionInProgress) {
        return;
    }

    detectionInProgress = true;

    // Detect objects in the image element
    objectDetector.detect(c1, (err, results) => {
        detectionInProgress = false;

        if (err) {
            console.error(err);
            return;
        }

        const filteredDetections = getBestDetectionsByLabel(results, drawConfidenceThreshold);
        const stableDetections = getStableDetections(filteredDetections);

        console.log(stableDetections);
        for (let index = 0; index < stableDetections.length; index++) {
            const element = stableDetections[index];
            ctx1.font = "15px Arial";
            ctx1.fillStyle = "red";
            ctx1.fillText(element.label + " - " + (element.confidence * 100).toFixed(2) + "%", element.x + 10, element.y + 15);
            ctx1.beginPath();
            ctx1.strokeStyle = "red";
            ctx1.rect(element.x, element.y, element.width, element.height);
            ctx1.stroke();
            console.log(element.label);
        }

        speakBestDetectedObject(stableDetections);
    });
}

function getBestDetectionsByLabel(results, minConfidence) {
    const bestByLabel = {};

    for (let index = 0; index < results.length; index++) {
        const candidate = results[index];
        if (!candidate || candidate.confidence < minConfidence) {
            continue;
        }

        const currentBest = bestByLabel[candidate.label];
        if (!currentBest || candidate.confidence > currentBest.confidence) {
            bestByLabel[candidate.label] = candidate;
        }
    }

    return Object.values(bestByLabel);
}

function getStableDetections(detections) {
    const seenLabels = {};
    for (let index = 0; index < detections.length; index++) {
        const detection = detections[index];
        seenLabels[detection.label] = true;

        if (detection.confidence >= stableConfidenceThreshold) {
            labelStreakCount[detection.label] = (labelStreakCount[detection.label] || 0) + 1;
        } else {
            labelStreakCount[detection.label] = 0;
        }
    }

    const trackedLabels = Object.keys(labelStreakCount);
    for (let index = 0; index < trackedLabels.length; index++) {
        const label = trackedLabels[index];
        if (!seenLabels[label]) {
            labelStreakCount[label] = 0;
        }
    }

    const stable = [];
    for (let index = 0; index < detections.length; index++) {
        const detection = detections[index];
        if ((labelStreakCount[detection.label] || 0) >= requiredStableFrames) {
            stable.push(detection);
        }
    }

    return stable;
}

function speakBestDetectedObject(results) {
    if (!speechSupported || !aiEnabled || window.speechSynthesis.speaking || !Array.isArray(results)) {
        return;
    }

    const now = Date.now();
    let bestMatch = null;

    for (let index = 0; index < results.length; index++) {
        const candidate = results[index];
        if (!candidate || candidate.confidence < speechConfidenceThreshold) {
            continue;
        }

        const label = candidate.label;
        const lastSpokenAt = lastSpokenLabelAt[label] || 0;
        if (now - lastSpokenAt < speechRepeatCooldownMs) {
            continue;
        }

        if (!bestMatch || candidate.confidence > bestMatch.confidence) {
            bestMatch = candidate;
        }
    }

    if (!bestMatch) {
        return;
    }

    const message = bestMatch.label;

    lastSpokenLabelAt[bestMatch.label] = now;
    updateAnnouncement("Detected: " + message);
    speakMessage(message, false);

    if ("vibrate" in navigator) {
        navigator.vibrate(90);
    }
}

function speakMessage(message, interrupt) {
    if (!speechSupported || !message) {
        return;
    }

    if (interrupt) {
        window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 0.98;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

async function loadEmotionModels() {
    if (typeof faceapi === "undefined") {
        updateEmotionStatus("Emotion detection unavailable.", "warning");
        return;
    }

    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(emotionModelUrl),
            faceapi.nets.faceExpressionNet.loadFromUri(emotionModelUrl)
        ]);
        emotionModelIsLoaded = true;
        updateEmotionStatus("Emotion model ready.", "ready");
    } catch (error) {
        console.error(error);
        updateEmotionStatus("Emotion model failed to load.", "warning");
    }
}

function detectEmotion() {
    if (!emotionModelIsLoaded || emotionDetectionInProgress) {
        return;
    }

    emotionDetectionInProgress = true;

    faceapi.detectAllFaces(c1, new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5
    })).withFaceExpressions().then(function (results) {
        emotionDetectionInProgress = false;

        if (!Array.isArray(results) || results.length === 0) {
            updateEmotionStatus("No face detected.", "warning");
            return;
        }

        const bestFace = getBestFaceDetection(results);
        const topEmotion = getTopEmotion(bestFace.expressions);

        if (!bestFace || !topEmotion) {
            updateEmotionStatus("No clear emotion detected.", "warning");
            return;
        }

        const emotionLabel = formatEmotionLabel(topEmotion.label);
        const emotionScore = (topEmotion.score * 100).toFixed(0);
        updateEmotionStatus("Emotion: " + emotionLabel + " (" + emotionScore + "%)", "ready");
        drawEmotionDetection(bestFace, emotionLabel, topEmotion.score);
        speakDetectedEmotion(emotionLabel);
    }).catch(function (error) {
        emotionDetectionInProgress = false;
        console.error(error);
        updateEmotionStatus("Emotion detection error.", "warning");
    });
}

function getBestFaceDetection(results) {
    let bestFace = results[0];

    for (let index = 1; index < results.length; index++) {
        const candidate = results[index];
        if (candidate.detection.score > bestFace.detection.score) {
            bestFace = candidate;
        }
    }

    return bestFace;
}

function getTopEmotion(expressions) {
    if (!expressions) {
        return null;
    }

    let bestEmotion = null;
    const emotionKeys = Object.keys(expressions);

    for (let index = 0; index < emotionKeys.length; index++) {
        const label = emotionKeys[index];
        const score = expressions[label];
        if (!bestEmotion || score > bestEmotion.score) {
            bestEmotion = { label: label, score: score };
        }
    }

    return bestEmotion;
}

function formatEmotionLabel(label) {
    if (!label) {
        return "unknown";
    }

    return label.charAt(0).toUpperCase() + label.slice(1);
}

function drawEmotionDetection(face, label, confidence) {
    if (!face || !face.detection || !face.detection.box) {
        return;
    }

    const box = face.detection.box;
    const text = label + " - " + (confidence * 100).toFixed(0) + "%";

    ctx1.beginPath();
    ctx1.lineWidth = 3;
    ctx1.strokeStyle = "#2d78f3";
    ctx1.rect(box.x, box.y, box.width, box.height);
    ctx1.stroke();

    ctx1.font = "15px Arial";
    const textWidth = ctx1.measureText(text).width;
    const textX = box.x;
    const textY = box.y > 24 ? box.y - 8 : box.y + box.height + 18;

    ctx1.fillStyle = "rgba(45, 120, 243, 0.9)";
    ctx1.fillRect(textX - 2, textY - 16, textWidth + 12, 22);
    ctx1.fillStyle = "#ffffff";
    ctx1.fillText(text, textX + 4, textY);
}

function speakDetectedEmotion(label) {
    if (!speechSupported || !aiEnabled || window.speechSynthesis.speaking) {
        return;
    }

    const now = Date.now();
    const lastSpokenAt = lastSpokenEmotionAt[label] || 0;
    if (now - lastSpokenAt < emotionSpeechCooldownMs) {
        return;
    }

    lastSpokenEmotionAt[label] = now;
    speakMessage("Emotion detected: " + label, false);
}

function updateEmotionStatus(message, tone) {
    if (!emotionText) {
        return;
    }

    emotionText.innerText = message;
    emotionText.classList.remove("ready", "warning");

    if (tone === "ready") {
        emotionText.classList.add("ready");
    } else if (tone === "warning") {
        emotionText.classList.add("warning");
    }
}

function updateAnnouncement(message) {
    if (announceText) {
        announceText.innerText = message;
    }
}