document.getElementById("ai").addEventListener("change", toggleAi)
document.getElementById("fps").addEventListener("input", changeFps)

const video = document.getElementById("video");
const c1 = document.getElementById('c1');
const ctx1 = c1.getContext('2d');
const loadingText = document.getElementById("loadingText");
const fpsValueText = document.getElementById("fpsValue");
const announceText = document.getElementById("announceText");
var cameraAvailable = false;
var aiEnabled = false;
var fps = 16;
const speechSupported = "speechSynthesis" in window;
const speechConfidenceThreshold = 0.6;
const speechRepeatCooldownMs = 3000;
const lastSpokenLabelAt = {};

if (fpsValueText) {
    fpsValueText.innerText = document.getElementById("fps").value;
}

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
        }
    }
    setTimeout(timerCallback, fps);
}

function isReady() {
    if (modelIsLoaded && cameraAvailable) {
        loadingText.innerText = "Ready";
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
    } else if (aiEnabled) {
        updateAnnouncement("Detection started.");
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
    // Detect objects in the image element
    objectDetector.detect(c1, (err, results) => {
        if (err) {
            console.error(err);
            return;
        }

        console.log(results); // Will output bounding boxes of detected objects
        for (let index = 0; index < results.length; index++) {
            const element = results[index];
            ctx1.font = "15px Arial";
            ctx1.fillStyle = "red";
            ctx1.fillText(element.label + " - " + (element.confidence * 100).toFixed(2) + "%", element.x + 10, element.y + 15);
            ctx1.beginPath();
            ctx1.strokeStyle = "red";
            ctx1.rect(element.x, element.y, element.width, element.height);
            ctx1.stroke();
            console.log(element.label);
        }

        speakBestDetectedObject(results);
    });
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

function updateAnnouncement(message) {
    if (announceText) {
        announceText.innerText = message;
    }
}