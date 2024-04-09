console.log("Start index.js!");

let current_signals = {};
let current_signals_displayed = 0;
let phase = 0;

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

    return inputValueINT;
}


// Define scaling factors
const verticalScaleFactor = 50; // 50 pixels per volt

// Define minimum and maximum horizontal scale range in microseconds
//const minHorizontalScaleMicroseconds = 1; // Minimum range: 1 microsecond
//const maxHorizontalScaleMicroseconds = 1000000; // Maximum range: 1 second

let horizontalScaleMicroseconds = 1; // Correspond à cb de Microsecondes vaut un pixel
                                    // 0.001 = 1 nano-seconde par pixel (utile dans le cas ou on veut voir des details de l'orde de la µs)
                                    // 1 = 1 micro-seconde par pixel
                                    // 1000 = 1 milli-seconde par pixel
                                    // 1000000 = 1 seconde par pixel



// Function to draw the sinusoidal waveform
function drawSinusoidal(voltage, color) {
    // Convert voltage to pixels
    let amplitude = voltage * verticalScaleFactor;

    // Get the canvas element
    let canvas = document.getElementById('oscilloscope_screen');
    if (canvas.getContext) {
        let ctx = canvas.getContext('2d');

        // Clear the canvas
        //ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Set the line color
        ctx.strokeStyle = color;
        ctx.lineWidth = 2; // Set the line width to 2 pixels

        // Calculate horizontal scale factor (pixels per microsecond)
        let horizontalScalePixelsPerMicrosecond = canvas.width / horizontalScaleMicroseconds;

        // Here we actually draw the sinusoidal
        ctx.beginPath();
        let x = 0;
        let y = canvas.height / 2;
        ctx.moveTo(x, y);


        offset_to_use = getCurrentVerticalOffset();

        // Adjust amplitude based on the scaling factor
        amplitude /= 2; // Adjust for centering the waveform

        for (x = 0; x <= canvas.width; x += 1) {
            let time = x / horizontalScalePixelsPerMicrosecond;
            y = canvas.height / 2 + amplitude * Math.sin(2 * Math.PI * (time - phase)) + offset_to_use;
            ctx.lineTo(x, y);
        }
        ctx.stroke();

        let signal = { voltage: voltage, color: color };

        current_signals_displayed += 1;
        current_signals["signal" + current_signals_displayed] = signal;
    }
}

// Function to handle changes in the horizontal scale range
function handleHorizontalScaleChange(valueMicroseconds) {
    horizontalScaleMicroseconds = valueMicroseconds;
    // Redraw the waveform with the updated horizontal scale

}


document.addEventListener('DOMContentLoaded', function() {
    setInterval(function() { //MAIN LOOP OF THE SCREEN
        let canvas = document.getElementById('oscilloscope_screen');
        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        phase += 0.01;
        if (phase > 1) phase = 0;

        //drawSinusoidal(50, "white");
        //drawSinusoidal(100, "red");
        //drawSinusoidal(150, "green");
        drawSinusoidal(8, "violet");
        //drawSinusoidal(12, "cyan");
        //drawSinusoidal(350, "pink");
        //drawSinusoidal(300, "aqua");
    }, 50);
});


console.log("End index.js!")

