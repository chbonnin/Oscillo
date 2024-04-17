
let config = {//Used to handle the configuration of the server, in case it changes we can update it here
    numChannels: null,  // How many channels are expected. update if server configuration changes
    frequency: null,
    samplesPerFrame: null,
    voltage: null,
    bitsPerSample: null,
    verticalDivisions: 20,
    horizontalDivisions: 16,
};

let channelData = {}; //This dictionnary holds the data for each channel including points, status, color, etc..

let horizontalOffset = 0;

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


function getCurrentSettings(){
    const Http = new XMLHttpRequest();
    Http.responseType = 'text';
    let frm = new FormData();

    frm.append("csrfmiddlewaretoken", document.getElementsByName("csrfmiddlewaretoken")[0].value);

    console.log("Getting current settings");

    Http.open("POST", '/oscillo/settings/');
    Http.send(frm);
    Http.onload = function() {
        console.log(Http.responseText);

        const settings = JSON.parse(Http.responseText);

        // update the numChannels in config
        config.numChannels = settings.channels;
        config.frequency = settings.freq;
        config.samplesPerFrame = settings.nb;
        config.voltage = settings.voltage;
        config.bitsPerSample = settings.bits;

        console.log("Updated config:", config);

        // update the channelData object now that we know the number of channels

        for (let ch = 1; ch <= config.numChannels; ch++) {
            channelData['CH' + ch] = {
                points: [],
                display: true,
                focused: false,
                colorDark: channelsMetaData['CH' + ch].colorDark, //channelsMetaData is passed from the backend to here via the html page
                colorLight: channelsMetaData['CH' + ch].colorLight,
                verticalOffset: 0,
                verticalScale: 25, //50px per volt (default value)
                verticalOffsetRelativeCursorPosition: 395,
            };

            channel_button = document.getElementById('CH' + ch);
            
            channel_button.classList.remove("channel-not-displayed");
            channel_button.classList.add("channel-displayed");
            channel_button.classList.add(channelData['CH' + ch].colorDark);
        }
    }
}

function fetchData(){
    const Http = new XMLHttpRequest();
    Http.responseType = 'arraybuffer';

    Http.open("GET", '/oscillo/data/', true);

    Http.onload = function(event) {
        if (Http.status === 200) {
            console.log("Data received");

            const buffer = Http.response;
            const dataView = new DataView(buffer);
            const bytesPerSample = 2; // Each sample is 2 bytes (Uint16) altough this may change depending on the server's settings !!
            const totalSamples = dataView.byteLength / bytesPerSample; // Total samples in all channels

            console.log(`THis data is made up of ${totalSamples} samples`);
            console.log("Here below should be the dataView created from the received data : ");
            console.log(dataView);

            // Clear the channel data before parsing the new data
            for (let i = 1; i <= config.numChannels; i++) {
                let channelKey = 'CH' + i;
                channelData[channelKey].points = [];
            }
        
            // Parse buffer into channel data
            for (let i = 0; i < totalSamples; i++) {
                let channelNum = (i % config.numChannels) + 1;
                let channelKey = 'CH' + channelNum;
                let pointIndex = i * bytesPerSample;
                let point = dataView.getUint16(pointIndex, true);
                channelData[channelKey].points.push(point);
            }

            clearCanvas();
            drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);

            Object.keys(channelData).forEach(key => {
                // console.log(key, channelData[key].points);
                if (channelData[key].display === true){
                    drawSignal(key);
                }
            });

            console.log(channelData);


        } else if (Http.status === 408) {
            alert('Backend has no data to forward');
        } else {
            console.error("The request failed unexpectedly ->", Http.statusText);
        }
    }

    Http.onerror = function() {
        console.log("An error occured while fetching the data");
    }

    Http.send();
}

function environmentSetup(){//This function sets up anything necessary for interacting with the oscilloscope (EVentlisteners, etc)
    let isDragging = false;
    
    const verticalScalingKnob = document.getElementById("vertical-scaling");
    
    const scrollBar = document.getElementById("scroll-bar");
    const scroller = document.getElementById("scroller");
    let startY;

    const scrollBarHorizontal = document.getElementById("scrollbar-horizontal");
    const scrollerHorizontal = document.getElementById("scroller-Horizontal");
    let startX;


    for (let i = 1; i < 11; i++) {//Setup listeners to change a button's aspect when clicked
        let channel = "CH" + i;
        document.getElementById(channel).addEventListener("click", function() {
            console.log(`Channel ${channel} clicked!`);
            changeChannelButtonStatus(channel);
        });
    };


    //===================== VERTICAL OFFSET INTERACTIONS (MOUSE) =====================
    scroller.addEventListener('mousedown', function(event) {
        isDragging = true;
        startY = event.clientY - scroller.getBoundingClientRect().top + scrollBar.getBoundingClientRect().top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(event) {
        if (!isDragging) return;

        //this part handles the actual movement of the element on the screen
        let newY = event.clientY - startY;
        newY = Math.max(newY, 0);
        newY = Math.min(newY, scrollBar.clientHeight - scroller.clientHeight);

        scroller.style.top = newY + 'px';
        // console.log("Curser is being dragged");

        //this part maps the relative position of the scroller to the offset of the signal
        let percent = newY / (scrollBar.clientHeight - scroller.clientHeight);
        let verticalOffset = (percent - 0.5) * 1000;
        verticalOffset = Math.round(verticalOffset);

        //and now we actually update the vertical offset of the focused channel
        for (let i = 1; i < config.numChannels + 1; i++) {
            if (channelData['CH' + i].focused) {
                channelData['CH' + i].verticalOffset = verticalOffset;
            }
        }
    };

    function onMouseUp(event) {
        isDragging = false;

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        //Here below we save the cursor position for that channel to restore it when the user clicks on the channel again

        let newY = event.clientY - startY;
        newY = Math.max(newY, 0);
        newY = Math.min(newY, scrollBar.clientHeight - scroller.clientHeight);

        for (let i = 1; i < config.numChannels + 1; i++) {
            if (channelData['CH' + i].focused) {
                channelData['CH' + i].verticalOffsetRelativeCursorPosition = newY;
            }
        }   
    };

    //===================== HORIZONTAL OFFSET INTERACTIONS (MOUSE) =====================

    scrollerHorizontal.addEventListener('mousedown', function(event) {
        isDragging = true;
        startX = event.clientX - scrollerHorizontal.getBoundingClientRect().left + scrollBarHorizontal.getBoundingClientRect().left;
        document.addEventListener('mousemove', onMouseMoveHorizontal);
        document.addEventListener('mouseup', onMouseUpHorizontal);
    });

    function onMouseMoveHorizontal(event) {
        if (!isDragging) return;
        console.log("Curser is being dragged");

        let newX = event.clientX - startX;
        newX = Math.max(newX, 0);
        newX = Math.min(newX, scrollBarHorizontal.clientWidth - scrollerHorizontal.clientWidth);

        scrollerHorizontal.style.left = newX + 'px';

        let percent = newX / (scrollBarHorizontal.clientWidth - scrollerHorizontal.clientWidth);
        horizontalOffset = (percent - 0.5) * 1000;
        horizontalOffset = Math.round(horizontalOffset);
    };

    function onMouseUpHorizontal(event) {
        isDragging = false;

        document.removeEventListener('mousemove', onMouseMoveHorizontal);
        document.removeEventListener('mouseup', onMouseUpHorizontal);
    };

    //===================== VERTICAL SCALING INTERACTIONS (KNOB) =====================
    verticalScalingKnob.addEventListener("input", function() {
        isDragging = true;
        for (let i = 1; i < config.numChannels + 1; i++) {
            if (channelData['CH' + i].focused) {
                channelData['CH' + i].verticalScale = parseInt(this.value, 10);//convert from str to int (base10)
            }
        }
    });

    verticalScalingKnob.addEventListener("mousedown", function() {
        isDragging = false;
    });

    //Setup listener to detect a click on the knob and reinitialize the vertical scale to the default value.
    verticalScalingKnob.addEventListener("mouseup", function(){
        for (let i = 1; i < config.numChannels + 1; i++) {
            if (channelData['CH' + i].focused && !isDragging) {
                verticalScalingKnob.value = 25;
                channelData['CH' + i].verticalScale = 25;//convert from str to int (base10)
            }
        }
        isDragging = false;
    });

    //This part is not absolutely necessary, it justs show the grid of the screen before the oscillo has been started.
    drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);

    getCurrentSettings();
}


function MAINLOOP(){
    
    LOOP = setInterval(function() {
        if (config.numChannels != null) {
            fetchData();
            setScreenInformation();
        }else{
            console.log("Waiting for settings retrieval...");
        }
   }, 1000);
}


document.addEventListener('DOMContentLoaded', function() {
    environmentSetup();//we load all the necessary event listeners for the oscilloscope

    MAINLOOP();
});

function showToast(message) {
    let toast = document.getElementById("toast");
    toast.innerHTML = message;
    toast.className = "show";
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
};

function getCurrentHorizontalScale(){//This function will return the current value of the input 'horizontal-scale'
    const horizontallKnob = document.getElementById('horizontal-scaling');
    //Value between 1 and 1000000 representing the number of micro-seconds per pixel
    return parseInt(horizontallKnob.value);
};

function clearCanvas(){
    let ctx = CANVAS.getContext('2d');
    ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
};

function changeChannelButtonStatus(channelKey) {
    let button = document.getElementById(channelKey);

    // Here we make sure only one button can be focused
    Object.keys(channelData).forEach(key => {
        let otherButton = document.getElementById(key);
        otherButton.classList.remove('button-focused');
        
        if (key !== channelKey) {
            channelData[key].focused = false;
        }
    });


    try {//in case the channel clicked is not active (= not in the channelData dictionnary)
        if (!channelData[channelKey].focused) {//if channel is not focused, then
            // console.log("Focusing on channel:", channelKey);
            button.classList.add('button-focused');
            channelData[channelKey].focused = true;

            //Here we also set the correct values for the vertical scaling of this channel to the knob of the html page
            document.getElementById('vertical-scaling').value = channelData[channelKey].verticalScale;
            //And we do the same for the vertical offset (little cursor)
            document.getElementById('scroller').style.top = channelData[channelKey].verticalOffsetRelativeCursorPosition + 'px';
            document.getElementById('scroller').style.backgroundColor = channelData[channelKey].colorDark;

            // If channel is not displayed, display it
            if (!channelData[channelKey].display) {
                // console.log("Displaying channel:", channelKey);
                button.classList.remove("channel-not-displayed");
                button.classList.add("channel-displayed");
                button.classList.add(channelData[channelKey].colorDark);
                channelData[channelKey].display = true;
            }
        } else {
            if (channelData[channelKey].display) {//if channel is focused, then
                // console.log("Hiding channel:", channelKey);
                button.classList.remove("channel-displayed");
                button.classList.add("channel-not-displayed");
                button.classList.remove(channelData[channelKey].colorDark);
                channelData[channelKey].display = false;
            }
            // remove the focus since the button was clicked a second time
            button.classList.remove('button-focused');
            channelData[channelKey].focused = false;
        }
    } catch (error) {
        if (error instanceof TypeError) {//Button not linked to an active channel
            let text = "This channel is not active.";
            showToast(text);
        } else {
            alert("An unknown error occured, please look at the console.")
            console.error(error);
        }
    }
    

    // console.log(channelData);
};


// Function to draw a grid composed of full squares on the canvas
function drawGrid(gridColor, opacity, thickerLineWidth) {
    let ctx = CANVAS.getContext('2d');
    ctx.globalAlpha = opacity;

    const gridSizeVertical = CANVAS.width / config.verticalDivisions;
    const gridSizeHorizontal = CANVAS.height / config.horizontalDivisions;
    const centerVertical = CANVAS.width / 2;
    const centerHorizontal = CANVAS.height / 2;
    //We need the tolerance for a little wiggle room when detecting the two central lines.
    //Otherwise we might not get a perfect == when checking the position of the drawer compared to CANVAS.width/2 or CANVAS.height/2.
    const tolerance = 0.5;

    // Draw vertical grid lines
    for (let x = gridSizeVertical; x < CANVAS.width; x += gridSizeVertical) {
        if (Math.abs(x - centerVertical) <= tolerance) {
            // Make the central vertical line thicker
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = thickerLineWidth;
            console.log("Central line");
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
    for (let y = gridSizeHorizontal; y < CANVAS.height; y += gridSizeHorizontal) {
        if (Math.abs(y - centerHorizontal) <= tolerance) {
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
};

function drawSignal(channelKey) {
    const channel = channelData[channelKey];
    const points = channel.points;

    const ctx = CANVAS.getContext('2d');
    const width = CANVAS.width;
    const height = CANVAS.height;

    // Find the max and min values in the points array
    const maxValue = Math.max(...points);
    const minValue = Math.min(...points);
    const amplitudeRange = maxValue - minValue;

    const verticalScalingFactor = channel.verticalScale / 50; 
    const horizontalScalingFactor = getCurrentHorizontalScale() / 50;//we have to divide by 50 because the default value of the input is 50 which corresponds to 1 : no scaling

    const verticalOffset = channel.verticalOffset;

    // Calculate the scaling factors based on actual data range
    const verticalScale = (height / amplitudeRange) * verticalScalingFactor;
    const horizontalScale = (width / points.length) * horizontalScalingFactor;

    // Start drawing the waveform
    ctx.beginPath();

    // Adjust the waveform to be centered vertically
    points.forEach((point, index) => {
        const x = (index * (width / points.length) / horizontalScale) + horizontalOffset;//horizontalOffset is init at the start of the script and modified by an eventlistener (cursor)
        // Rescale and center the signal around the middle of the canvas
        const y = ((height / 2) - ((point - minValue) - (amplitudeRange / 2)) * verticalScale) + verticalOffset;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.strokeStyle = channel.colorDark;  // Color of the waveform
    ctx.lineWidth = 2;
    ctx.stroke();
};

function setScreenInformation(){
    //insert time scale to the screen
    const timePerDiv = getTimePerDiv();
    document.getElementById('tpdiv-value').innerHTML = timePerDiv.value + ' ' + timePerDiv.scale + '/div';
    console.log(`Time per division is : ${timePerDiv.value} ${timePerDiv.scale}`);
};


function getTimePerDiv() {
    const horizontalScale = getCurrentHorizontalScale() / 50; //we have to divide by 50 because the default value of the input is 50 which corresponds to 1 : no scaling
    const totalSamplingTime = config.samplesPerFrame / config.frequency;
    const timePerDivision = (totalSamplingTime / config.horizontalDivisions) * horizontalScale;
    let scale;
    let value;

    //convert timePerDivision to ms as a base unit to simplify the logic of the function
    const microseconds = timePerDivision * 1e6;

    if (microseconds < 1) {// nanoseconds
        scale = 'ns'; 
        value = (microseconds * 1000).toFixed(2); // convert to nanoseconds
    } else if (microseconds < 1000) {// microseconds
        scale = 'µs'; 
        value = microseconds.toFixed(2);
    } else if (microseconds < 1e6) {// Milliseconds
        scale = 'ms'; 
        value = (microseconds / 1000).toFixed(2); // convert microseconds to milliseconds
    } else { // Seconds
        scale = 's';
        value = (microseconds / 1e6).toFixed(2); // convert microseconds to seconds
    }

    return { value: parseFloat(value), scale: scale };
}
