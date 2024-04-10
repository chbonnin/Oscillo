let current_signals = {};
let current_signals_displayed = 0;
let phase = 0; // Phase shift in radians

let RUNNING = false;
let intervalId = null;//we need this to keep the same interval for the animation of the screen when we start/stop/restart it !

const CANVAS = document.getElementById('oscilloscope_screen');

const RUNSTOP = document.getElementById('run-stop');
const CURSORS = document.getElementById('cursors');
const DISPLAY = document.getElementById('display');
const TRIGGER = document.getElementById('trigger');
const SAVE = document.getElementById('save');
const AUTOSET = document.getElementById('autoset');
const MEASURE = document.getElementById('measure');
const PRINT = document.getElementById('print');
const SETUP = document.getElementById('setup');
const SIZE = document.getElementById('size');



function environmentSetup(){//This function sets up anything necessary for interacting with the oscilloscope (EVentlisteners, etc)
    
    for (let i = 1; i < 11; i++) {//setup listeners for channel buttons
        let channel = "CH" + i;
        //console.log("Setting listener for " + channel)
        document.getElementById(channel).addEventListener("click", function() {
            console.log(channel + " clicked");
        });
    }

    RUNSTOP.addEventListener("click", function() {
        changeCurrentAnimationState();
    });

    //This part is not absolutely necessary, it justs show the grid of the screen before the oscillo has been started.
    drawGrid(50, 'rgba(128, 128, 128, 0.5)', 0.5, 3);
}


function changeCurrentAnimationState(){
    RUNNING = !RUNNING;//if it's running we stop it, if it's stopped we start it
    Run_Main_Screen(channelsData);
}

function getCurrentVerticalOffset(){//This function will return the current value of the input 'vertical-offset'
    const verticalKnob = document.getElementById('vertical-offset');

    let inputValueSTR = verticalKnob.value;

    let inputValueINT = parseInt(inputValueSTR);

    //Value between -500 and 500, the max height of the canvas being 800 there's no need to go further
    return inputValueINT;
}

function getCurrentHorizontalOffset(){//This function will return the current value of the input 'horizontal-offset'
    const horizontalKnob = document.getElementById('horizontal-offset');

    let inputValueSTR = horizontalKnob.value;

    let inputValueINT = parseInt(inputValueSTR);

    //Value between -1000 and 1000, the max width of the canvas being 1100 there's no need to go further
    return inputValueINT;
}

function getCurrentVerticalScale(){//This function will return the current value of the input 'vertical-scale'
    const verticalKnob = document.getElementById('vertical-scaling');

    let inputValueSTR = verticalKnob.value;

    let inputValueINT = parseInt(inputValueSTR);

    //Value between 5 and 500 representing the number of pixels per volt
    return inputValueINT
}

function getCurrentHorizontalScale(){//This function will return the current value of the input 'horizontal-scale'
    const horizontallKnob = document.getElementById('horizontal-scaling');

    let inputValueSTR = horizontallKnob.value;

    let inputValueINT = parseInt(inputValueSTR);

    //Value between 1 and 1000000 representing the number of micro-seconds per pixel
    return inputValueINT
}

function clearCanvas(){
    let ctx = CANVAS.getContext('2d');
    ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
}

// Function to draw a grid composed of full squares on the canvas
function drawGrid(gridSize, gridColor, opacity, thickerLineWidth) {
    let ctx = CANVAS.getContext('2d');
    ctx.globalAlpha = opacity;

    // Draw vertical grid lines
    for (let x = gridSize; x < CANVAS.width; x += gridSize) {
        if (x === CANVAS.width / 2) {
            // Make the central vertical line thicker
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = thickerLineWidth;
        } else {
            // Reset the line width to the default value
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS.height);
        ctx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = gridSize; y < CANVAS.height; y += gridSize) {
        if (y === CANVAS.height / 2) {
            // Make the central horizontal line thicker
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = thickerLineWidth;
        } else {
            // Reset the line width to the default value
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS.width, y);
        ctx.stroke();
    }
}


// Define scaling factors
//const verticalScaleFactor = 50; // 50 pixels per volt
// Define minimum and maximum horizontal scale range in microseconds
//const minHorizontalScaleMicroseconds = 1; // Minimum range: 1 microsecond
//const maxHorizontalScaleMicroseconds = 1000000; // Maximum range: 1 second
//let horizontalScaleMicroseconds = 1; // Correspond à cb de Microsecondes vaut un pixel
                                    // 0.001 = 1 nano-seconde par pixel (utile dans le cas ou on veut voir des details de l'orde de la µs)
                                    // 1 = 1 micro-seconde par pixel
                                    // 1000 = 1 milli-seconde par pixel
                                    // 1000000 = 1 seconde par pixel



// Function to draw the sinusoidal waveform with occasional spikes
function drawSinusoidal(voltage, color, includeSpikes = false) {
    if (CANVAS.getContext) {
        let ctx = CANVAS.getContext('2d');
        ctx.strokeStyle = color; // Set the line color
        ctx.lineWidth = 2; // Set the line width to 2 pixels

        // Determine if we should include a spike
        if (includeSpikes && Math.random() < 0.05) { // ~5% chance to spike
            if (Math.random() < 0.5) {
                voltage = voltage + Math.random();
            }else{
                voltage = voltage - Math.random();
            }
        } else {
            voltage = voltage; // Normal voltage
        }

        // Loop through each pixel across the canvas width
        for (let x = 0; x <= CANVAS.width; x += 1) {
            let offsetV = getCurrentVerticalOffset();
            let offsetH = getCurrentHorizontalOffset();
            let verticalScaleFactor = getCurrentVerticalScale();
            let horizontalScaleFactor = getCurrentHorizontalScale();
            let horizontalScalePixelsPerMicrosecond = CANVAS.width / horizontalScaleFactor;

            let time = (x + offsetH) / horizontalScalePixelsPerMicrosecond;
            let y = CANVAS.height / 2;

            let amplitude = voltage * verticalScaleFactor / 2; // Adjust for centering
            y += amplitude * Math.sin(2 * Math.PI * (time - phase)) + offsetV;

            // Draw the point
            if (x === 0) {
                ctx.beginPath();
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke(); // Apply the stroke to the path
    }
}


function Run_Main_Screen() {
    if (RUNNING && intervalId === null) {
        intervalId = setInterval(function() {
            clearCanvas();
            drawGrid(50, 'rgba(128, 128, 128, 0.5)', 0.5, 3);

            phase += 0.01;
            if (phase > 1) phase = 0;

            // Toggle includeSpikes based on your condition for testing
            drawSinusoidal(3.3, "red", true); // Now passing true to include spikes
            drawSinusoidal(1.76, "cyan", true); // Now passing true to include spikes
            drawSinusoidal(5.42, "pink", true); // Now passing true to include spikes
            drawSinusoidal(6.98, "purple", true); // Now passing true to include spikes
        }, 50);
    } else if (!RUNNING && intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        clearCanvas();
        drawGrid(50, 'rgba(128, 128, 128, 0.5)', 0.5, 3);
    }
}



document.addEventListener('DOMContentLoaded', function() {
    environmentSetup();//we load all the necessary event listeners for the oscilloscope

    console.log(channelsData);//checking if we got data or not

    Run_Main_Screen();
});



