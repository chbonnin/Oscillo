console.log("Start index.js!");

current_signals = {};
current_signals_displayed = 0;


function drawSinusoidal(amplitude, color) {
    // Get the canvas element
    let canvas = document.getElementById('oscilloscope_screen');
    if (canvas.getContext) {
        let ctx = canvas.getContext('2d');

        // clear the canvas
        // ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Set the line color
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        // Here we actually draw the sinusoidal
        ctx.beginPath();
        let x = 0;
        let y = canvas.height / 2;
        ctx.moveTo(x, y);
        for (x = 0; x <= canvas.width; x += 1) {
            y = canvas.height / 2 + amplitude * Math.sin(2 * Math.PI * x / canvas.width);
            ctx.lineTo(x, y);
        }
        ctx.stroke();

        let signal = { amplitude: amplitude, color: color};

        current_signals_displayed += 1;
        current_signals["signal" + current_signals_displayed] = signal;
    }
}


document.addEventListener('DOMContentLoaded', function() {
    drawSinusoidal(50, "white");
    drawSinusoidal(100, "red");
    drawSinusoidal(150, "green");
    drawSinusoidal(200, "purple");
    drawSinusoidal(250, "cyan");
});