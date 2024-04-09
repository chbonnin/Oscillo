console.log("Start index.js!");

let current_signals = {};
let current_signals_displayed = 0;
let phase = 0; // Phase shift in radians


//setup listeners for channel buttons
for (let i = 1; i < 11; i++) {
    let channel = "CH" + i;
    //console.log("Setting listener for " + channel)
    document.getElementById(channel).addEventListener("click", function() {
        console.log(channel + " clicked");
    });
}

function getCurrentVerticalOffset(){//This function will return the current value of the input 'vertical-offset'
    verticalKnob = document.getElementById('vertical-offset');

    inputValueSTR = verticalKnob.value;

    inputValueINT = parseInt(inputValueSTR);

    //Value between -500 and 500, the max height of the canvas being 800 there's no need to go further
    return inputValueINT;
}

function getCurrentHorizontalOffset(){//This function will return the current value of the input 'horizontal-offset'
    horizontalKnob = document.getElementById('horizontal-offset');

    inputValueSTR = horizontalKnob.value;

    inputValueINT = parseInt(inputValueSTR);

    //Value between -1000 and 1000, the max width of the canvas being 1100 there's no need to go further
    return inputValueINT;
}

function getCurrentVerticalScale(){//This function will return the current value of the input 'vertical-scale'
    verticalKnob = document.getElementById('vertical-scaling');

    inputValueSTR = verticalKnob.value;

    inputValueINT = parseInt(inputValueSTR);

    //Value between 5 and 500 representing the number of pixels per volt
    return inputValueINT
}

function getCurrentHorizontalScale(){//This function will return the current value of the input 'horizontal-scale'
    horizontallKnob = document.getElementById('horizontal-scaling');

    inputValueSTR = horizontallKnob.value;

    inputValueINT = parseInt(inputValueSTR);

    //Value between 1 and 1000000 representing the number of micro-seconds per pixel
    return inputValueINT
}

function clearCanvas(){
    let canvas = document.getElementById('oscilloscope_screen');
    let ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

}

// Function to draw a grid composed of full squares on the canvas
function drawGrid(canvas, gridSize, gridColor, opacity, thickerLineWidth) {
    let ctx = canvas.getContext('2d');
    ctx.globalAlpha = opacity;

    // Draw vertical grid lines
    for (let x = gridSize; x < canvas.width; x += gridSize) {
        if (x === canvas.width / 2) {
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
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = gridSize; y < canvas.height; y += gridSize) {
        if (y === canvas.height / 2) {
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
        ctx.lineTo(canvas.width, y);
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


// Function to draw the sinusoidal waveform
function drawSinusoidal(voltage, color) {
    // Get the canvas element
    let canvas = document.getElementById('oscilloscope_screen');
    if (canvas.getContext) {
        let offsetV = getCurrentVerticalOffset();
        let offsetH = getCurrentHorizontalOffset();
        let verticalScaleFactor = getCurrentVerticalScale();
        let horizontalScaleFactor = getCurrentHorizontalScale();

        // Convert voltage to pixels
        let amplitude = voltage * verticalScaleFactor;

        // Calculate horizontal scale factor (pixels per microsecond)
        let horizontalScalePixelsPerMicrosecond = canvas.width / horizontalScaleFactor;

        let ctx = canvas.getContext('2d');

        ctx.strokeStyle = color;// Set the line color
        ctx.lineWidth = 2; // Set the line width to 2 pixels

        //Here we set the origin of the graph to the vertical center of the canvas completely left of the canvas.
        ctx.beginPath();
        let x = 0;
        let y = canvas.height / 2;
        ctx.moveTo(x, y);

        // Adjust amplitude based on the scaling factor
        amplitude /= 2; // Adjust for centering the waveform

        for (x = 0; x <= canvas.width; x += 1) {
            let time = (x + offsetH) / horizontalScalePixelsPerMicrosecond;//remplacer 0 par une variable pr l'offset horizontal
            y = canvas.height / 2 + amplitude * Math.sin(2 * Math.PI * (time - phase)) + offsetV;
            ctx.lineTo(x, y);
        }
        ctx.stroke();

        let signal = { voltage: voltage, color: color };

        current_signals_displayed += 1;
        current_signals["signal" + current_signals_displayed] = signal;
    }
}


function Run_Main_Screen(){//this will host the main loop of the screen

}


document.addEventListener('DOMContentLoaded', function() {
    setInterval(function() { //MAIN LOOP OF THE SCREEN
        clearCanvas();

        let canvas = document.getElementById('oscilloscope_screen');
        drawGrid(canvas, 50, 'rgba(128, 128, 128, 0.5)', 0.5, 3);

        phase += 0.01;
        if (phase > 1) phase = 0;

        //drawSinusoidal(50, "white");
        //drawSinusoidal(2.58, "red");
        //drawSinusoidal(150, "green");
        drawSinusoidal(8, "violet");
        //drawSinusoidal(12, "cyan");
        drawSinusoidal(4.62, "pink");
        //drawSinusoidal(300, "aqua");
    }, 50);

    // drawSinusoidal(8, "violet");

    
});


console.log("End index.js!")

