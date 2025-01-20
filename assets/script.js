// Global variables
const video = document.createElement('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const width = canvas.width;
const height = canvas.height;

let useWebcam = true;
let resolution = 1;
let originalImage = null;

let saturation = 1;
let contrast = 1;
let brightness = 1;
let hue = 0;

// Generate Bayer matrix for dithering
function generateBayerMatrix(size) {
    if (size === 2) {
        return [
            [0, 2],
            [3, 1]
        ];
    }
    const smallerMatrix = generateBayerMatrix(size / 2);
    const newMatrix = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size / 2; y++) {
        for (let x = 0; x < size / 2; x++) {
            newMatrix[y][x] = 4 * smallerMatrix[y][x];
            newMatrix[y][x + size / 2] = 4 * smallerMatrix[y][x] + 2;
            newMatrix[y + size / 2][x] = 4 * smallerMatrix[y][x] + 3;
            newMatrix[y + size / 2][x + size / 2] = 4 * smallerMatrix[y][x] + 1;
        }
    }
    return newMatrix;
}

let thresholdMatrix = generateBayerMatrix(4).map(row => row.map(value => value / 16));

navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
        video.play();
    })
    .catch(err => {
        console.log("Error accessing webcam: ", err);
    });

// Function to apply dithering to the image
function applyDithering(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    let tempData = ctx.createImageData(width, height); // Temporary image data for downsampled version

    // Apply dithering to each pixel in the image
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let idx = (y * width + x) * 4;
            let r = data[idx];
            let g = data[idx + 1];
            let b = data[idx + 2];

            // Apply Bayer dithering
            let redError = applyOrderedDithering(r, x, y);
            let greenError = applyOrderedDithering(g, x, y);
            let blueError = applyOrderedDithering(b, x, y);

            // Assign the dithered color to the pixel
            tempData.data[idx] = redError.threshold;
            tempData.data[idx + 1] = greenError.threshold;
            tempData.data[idx + 2] = blueError.threshold;
            tempData.data[idx + 3] = 255; // Full opacity
        }
    }

    return tempData;
}

// Apply ordered dithering (Bayer matrix)
function applyOrderedDithering(value, x, y) {
    const matrixX = x % 4;
    const matrixY = y % 4;
    const threshold = thresholdMatrix[matrixY][matrixX] * 255;

    let result = value > threshold ? 255 : 0;
    return { threshold: result };
}

// Function to apply adjustments to the image
function applyAdjustments(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Apply brightness
        r = r * brightness;
        g = g * brightness;
        b = b * brightness;

        // Apply contrast
        r = ((r - 128) * contrast + 128);
        g = ((g - 128) * contrast + 128);
        b = ((b - 128) * contrast + 128);

        // Apply saturation
        const avg = (r + g + b) / 3;
        r = avg + (r - avg) * saturation;
        g = avg + (g - avg) * saturation;
        b = avg + (b - avg) * saturation;

        // Apply hue rotation
        const angle = hue * Math.PI / 180;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const newR = (cosA + (1 - cosA) / 3) * r + (1 / 3 * (1 - cosA) - Math.sqrt(1 / 3) * sinA) * g + (1 / 3 * (1 - cosA) + Math.sqrt(1 / 3) * sinA) * b;
        const newG = (1 / 3 * (1 - cosA) + Math.sqrt(1 / 3) * sinA) * r + (cosA + 1 / 3 * (1 - cosA)) * g + (1 / 3 * (1 - cosA) - Math.sqrt(1 / 3) * sinA) * b;
        const newB = (1 / 3 * (1 - cosA) - Math.sqrt(1 / 3) * sinA) * r + (1 / 3 * (1 - cosA) + Math.sqrt(1 / 3) * sinA) * g + (cosA + 1 / 3 * (1 - cosA)) * b;

        data[i] = newR;
        data[i + 1] = newG;
        data[i + 2] = newB;
    }

    return imageData;
}

// Downsample (resize the image) and apply dithering
function downsampleAndDither() {
    let downscaledWidth = Math.floor(width / resolution);
    let downscaledHeight = Math.floor(height / resolution);

    // Create an off-screen canvas for resizing
    const offScreenCanvas = document.createElement('canvas');
    offScreenCanvas.width = downscaledWidth;
    offScreenCanvas.height = downscaledHeight;
    const offScreenCtx = offScreenCanvas.getContext('2d');

    // Set image smoothing to false for sharp pixelated effect
    offScreenCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;

    // Draw the video or image to the off-screen canvas
    if (useWebcam) {
        offScreenCtx.drawImage(video, 0, 0, downscaledWidth, downscaledHeight);
    } else if (originalImage) {
        offScreenCtx.drawImage(originalImage, 0, 0, downscaledWidth, downscaledHeight);
    }

    // Get the image data from the off-screen canvas
    let imageData = offScreenCtx.getImageData(0, 0, downscaledWidth, downscaledHeight);
    imageData = applyAdjustments(imageData); // Apply adjustments
    imageData = applyDithering(imageData);

    // Clear the main canvas and draw the dithered image scaled back to the original size
    ctx.clearRect(0, 0, width, height);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = downscaledWidth;
    tempCanvas.height = downscaledHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
}

// Draw the video or uploaded image with dithering after downsampling
function draw() {
    if (useWebcam) {
        downsampleAndDither();
    } else if (originalImage) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0, width, height);
        downsampleAndDither();
    }

    requestAnimationFrame(draw);
}

// Start drawing once the video is playing
video.addEventListener('play', () => {
    draw();
});

// Control the resolution
document.getElementById('resolution').addEventListener('input', (event) => {
    resolution = parseFloat(event.target.value);
    document.getElementById('resolutionValue').textContent = resolution;
    resetCanvas();  // Apply the new resolution setting
});

// Control the saturation
document.getElementById('saturation').addEventListener('input', (event) => {
    saturation = parseFloat(event.target.value);
    document.getElementById('saturationValue').textContent = saturation;
    resetCanvas();  // Apply the new saturation setting
});

// Control the contrast
document.getElementById('contrast').addEventListener('input', (event) => {
    contrast = parseFloat(event.target.value);
    document.getElementById('contrastValue').textContent = contrast;
    resetCanvas();  // Apply the new contrast setting
});

// Control the brightness
document.getElementById('brightness').addEventListener('input', (event) => {
    brightness = parseFloat(event.target.value);
    document.getElementById('brightnessValue').textContent = brightness;
    resetCanvas();  // Apply the new brightness setting
});

// Control the hue
document.getElementById('hue').addEventListener('input', (event) => {
    hue = parseFloat(event.target.value);
    document.getElementById('hueValue').textContent = hue;
    resetCanvas();  // Apply the new hue setting
});

// Handle file upload
document.getElementById('fileUpload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                useWebcam = false;
                resetCanvas();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Reset canvas and apply dithering with correct resolution
function resetCanvas() {
    if (useWebcam) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, width, height);
    } else if (originalImage) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0, width, height);
        downsampleAndDither();
    }
}

// Switch between webcam and file
document.getElementById('sourceSwitch').addEventListener('change', (event) => {
    useWebcam = event.target.value === 'webcam';
    resetCanvas();
});
