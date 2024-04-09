console.log("Start index.js!");

let current_signals = {};
let current_signals_displayed = 0;
let phase = 0;

function drawSinusoidal(amplitude, color) {
    // Get the canvas element
    let canvas = document.getElementById('oscilloscope_screen');
    if (canvas.getContext) {
        let ctx = canvas.getContext('2d');

        // clear the canvas
        //ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Set the line color
        ctx.strokeStyle = color;
        ctx.lineWidth = 2; // Set the line width to 2 pixels

        // Here we actually draw the sinusoidal
        ctx.beginPath();
        let x = 0;
        let y = canvas.height / 2;
        ctx.moveTo(x, y);

        offset_to_use = getCurrentVerticalOffset();
        //console.log("Offset to use: " + offset_to_use);
        //console.log("Offset to use type: " + typeof(offset_to_use));

        for (x = 0; x <= canvas.width; x += 0.1) {
            y = canvas.height / 2 + amplitude * Math.sin(2 * Math.PI * (x / canvas.width - phase)) + offset_to_use;
            ctx.lineTo(x, y);
        }
        ctx.stroke();

        let signal = { amplitude: amplitude, color: color};

        current_signals_displayed += 1;
        current_signals["signal" + current_signals_displayed] = signal;
    }
}

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
        drawSinusoidal(250, "violet");
        //drawSinusoidal(300, "cyan");
        //drawSinusoidal(350, "pink");
        //drawSinusoidal(300, "aqua");
    }, 50);
});


console.log("End index.js!")

