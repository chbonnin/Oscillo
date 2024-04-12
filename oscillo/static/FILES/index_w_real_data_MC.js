//Those variables are necessary to handle the current status of the web-socket used to get the data via UDP.

let ws //set globally to access it elswere in the code other than setup
let web_socket_connected = false;
let connectionAttempts = 0;
const maxConnectionAttempts = 50;


let config = {//Used to handle the configuration of the server, in case it changes we can update it here
    numChannels: 4,  // How many channels are expected. update if server configuration changes
    samplesPerFrame: 1024,  // How many samples per frame. update if server configuration changes
    bytesPerPacket: 32768  // Total bytes per packet; update if server configuration changes
};

let channelData = {}; //This dictionnary holds the data for each channel including points, status, color, etc..



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



function connectWebSocket() {
    //This function is here to handle the base connection to the websocket that bridges the stare server and the web-app
    //It also will handle the reconnection if the connection is lost.
    //In case of an error, it will display it. (see in the future to implement error handling)
    ws = new WebSocket('ws://localhost:8080');

    ws.onopen = function() {
        console.log('Connected to the WebSocket server!');
        web_socket_connected = true;
        connectionAttempts = 0; // Reset attempts on successful connection
    };

    ws.onerror = function() {
        console.log('WebSocket connection failed!');
        ws.close(); // Ensure the socket is closed properly
    };

    ws.onclose = function() {
        console.log('WebSocket connection closed!');
        web_socket_connected = false;
        if (connectionAttempts < maxConnectionAttempts) {
            setTimeout(connectWebSocket, 3000); // Try to reconnect after 3 seconds
            connectionAttempts++;
        } else {
            alert('Unable to connect to the server. Please check if the server is running and accessible.');
        }
    };
}


function initializeWebSocketEvents() {
    ws.onmessage = function(event) {
        event.data.arrayBuffer().then((buffer) => {
            let dataView = new DataView(buffer);
            let bytesPerSample = 2; // Each sample is 2 bytes (Uint16)
            let totalSamples = dataView.byteLength / bytesPerSample; // Total samples in all channels
    
            console.log("DATA VIEW : ");
            console.log(dataView);

            colors = ["red", "green", "blue", "yellow"];
    
            // Initialize or reset channel data
            for (let ch = 1; ch <= config.numChannels; ch++) {
                channelData['CH' + ch] = {
                    points: [],
                    display: true,
                    color: colors[ch - 1]
                };
            }
    
            // Parse buffer into channel data
            for (let i = 0; i < totalSamples; i++) {
                let channelNum = (i % config.numChannels) + 1;
                let channelKey = 'CH' + channelNum;
                let pointIndex = (i * bytesPerSample) % dataView.byteLength; // Correct indexing for interlaced data
                let point = dataView.getUint16(pointIndex, true);
                channelData[channelKey].points.push(point);
            }
    
            console.log("Current channel data: ");
            console.log(channelData);
    
            
            clearCanvas();


            // Log and draw each channel's signal
            Object.keys(channelData).forEach(key => {
                console.log(key, channelData[key].points);
                drawSignal(channelData[key].points, channelData[key].color); // Assuming drawSignal can handle channel colors
            });


            //TBD ON MONDAY -> CHECK WHY THE SIGNAL STOPS ABRUPTLY BETWEEN THE INDEX 1000-1099 ON BROWSER SIDE
        });
    };
}




function environmentSetup(){//This function sets up anything necessary for interacting with the oscilloscope (EVentlisteners, etc)
    
    for (let i = 1; i < 11; i++) {//setup listeners for channel buttons
        let channel = "CH" + i;
        //console.log("Setting listener for " + channel)
        document.getElementById(channel).addEventListener("click", function() {
            console.log(`Channel ${channel} clicked!`);
        });
    }

    //This part is not absolutely necessary, it justs show the grid of the screen before the oscillo has been started.
    drawGrid(50, 'rgba(128, 128, 128, 0.5)', 0.5, 3);


    //here we test the connection to the server until we get confirmation we are indeed connected
    connectWebSocket();
    //initializeWebSocketEvents();
    console.log("Environment setup done.");
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


function drawSignal(points, color) {
    const ctx = CANVAS.getContext('2d');
    const width = CANVAS.width;
    const height = CANVAS.height;

    // Find the max and min values in the points array
    const maxValue = Math.max(...points);
    const minValue = Math.min(...points);
    const amplitudeRange = maxValue - minValue;

    const verticalScalingFactor = getCurrentVerticalScale() / 50;
    const horizontalScalingFactor = getCurrentHorizontalScale() / 50;

    const verticalOffset = getCurrentVerticalOffset();
    const horizontalOffset = getCurrentHorizontalOffset();

    // Calculate the scaling factors based on actual data range
    const verticalScale = (height / amplitudeRange) * verticalScalingFactor;
    const horizontalScale = (width / points.length) * horizontalScalingFactor;

    // Start drawing the waveform
    ctx.beginPath();

    // Adjust the waveform to be centered vertically
    points.forEach((point, index) => {
        const x = (index * (width / points.length) / horizontalScale) + horizontalOffset;
        // Rescale and center the signal around the middle of the canvas
        const y = ((height / 2) - ((point - minValue) - (amplitudeRange / 2)) * verticalScale) + verticalOffset;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    console.log("Color : " + color);
    ctx.strokeStyle = color;  // Color of the waveform
    ctx.lineWidth = 2;
    ctx.stroke();
}



document.addEventListener('DOMContentLoaded', function() {
    environmentSetup();//we load all the necessary event listeners for the oscilloscope

    //console.log(channelsData);//checking if we got data or not

    //Run_Main_Screen(channelsData);

    initializeWebSocketEvents();
});


// function changeChannelButtonColor(channelKey) {
//     let button = document.getElementById(channelKey);
//     if (channelsData[channelKey].isShown) {
//         console.log("This button is now shown !");

//         button.classList.remove("channel-not-displayed");
//         button.classList.add("channel-displayed");
//         button.classList.add(channelsData[channelKey].colorLight);
//     } else {
//         console.log("This button should not be shown !");

//         button.classList.remove("channel-displayed");
//         button.classList.add("channel-not-displayed");
//         button.classList.remove(channelsData[channelKey].colorLight);
//     }
// }



