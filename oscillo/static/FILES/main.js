let config = {//Used to handle the configuration of the server, in case it changes we can update it here
    numChannels: null,  // How many channels are expected. update if server configuration changes
    frequency: null,
    samplesPerFrame: null,
    voltage: null,
    bitsPerSample: null,
    verticalDivisions: 16,
    horizontalDivisions: 20,
    mode: null,
};

let triggerOptions = {
    isTriggerOn: "off",
    triggerMode: "edge", //edge trigger / window trigger
    triggerChannel: "CH1", //CH1, CH2, CH3, CH4, etc
    triggerLevel: "500", //value in volts from -1 to +1, that map to the values 0-16383 (if triggerMode = edgetrigger)
    windowLevelMin: "500", //value in volts from -1 to +1, that map to the values 0-16383 (if triggerMode = windowtrigger)
    windowLevelMax: "500",//value in volts from -1 to +1, that map to the values 0-16383 (if triggerMode = windowtrigger) + must be higher than windowLevelMin
    triggerSlope: "both", //rising, falling, both
    holdOff: "3600", //default: stop for 1h | value : time in seconds
}

let channelData = {}; //This dictionnary holds the data for each channel including points, status, color, etc..

let horizontalOffset = 0;
let horizontalScale = 50;

let isRunning = false;
let triggered = false;

const CANVAS = document.getElementById('oscilloscope_screen');
const MODAL = document.getElementById('modal');

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
        config.mode = settings.mode
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
                verticalScale: 1, //default value from the knob on the page is 50px p volt so here we set it to 25 so the signals only take half the screen and not the complete height.
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

function fetchDataFromFile(){
    // console.log("fetchDataFromFile starts");
    const Http = new XMLHttpRequest();

    Http.open("GET", '/oscillo/dataF/', true);
    Http.responseType = 'json';

    Http.onload = function() {
        if (Http.status === 200) {
            // console.log("JSON data received : ");
            // console.log(Http.response);

            //Here we now populate the channel data arrays with the data received
            //We know .osc files take a max amount of 4 channels
            for (let i = 1; i <= config.numChannels; i++) {
                let channelKey = 'CH' + i;
                channelData[channelKey].points = Http.response[i + 1];
            }

            config.samplesPerFrame = Http.response[2].length//We take the number of samples for ch.1 bc logically they all have the same amount given the .osc format

            Object.keys(channelData).forEach(key => {
                //We start by checking wether or not the trigger is set and if so we check the trigger conditions to freeze or not this part of the signal.
                if (triggerOptions.isTriggerOn == "on"){
                    if (triggerOptions.triggerChannel == key){//we check the trigger options only for the channel specified in the settings.
                        triggered = triggerCheck(channelData[key].points);
                    };
                };

                // Here we display the signal on the screen (if the button for this channel is active)
                if (channelData[key].display === true){
                    drawSignalFromFile(key);
                }
            });
            //console.log(channelData);
        } else if (Http.status === 408){
            console.error("The server supposed to send the data (Reader_sender) did not send anything" + Http.status)
        } else {
            console.error("Failed to load data, status: " + Http.status);
        }
    }

    Http.onerror = function() {
        console.error("There was a network error.");
    };

    Http.send();
    // console.log("fetchDataFromFile ends");
}

function environmentSetup(){//This function sets up anything necessary for interacting with the oscilloscope (EVentlisteners, etc)
    let isDragging = false;
    
    const verticalScalingKnob = document.getElementById("vertical-scaling");
    const horizontalScalingKnob = document.getElementById("horizontal-scaling");
    
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
                channelData['CH' + i].verticalScale = parseFloat(this.value);//convert from str to int (base10)
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
                verticalScalingKnob.value = 1;
                channelData['CH' + i].verticalScale = 1;//convert from str to int (base10)
            }
        }
        isDragging = false;
    });

    //===================== HORIZONTAL SCALING INTERACTIONS (KNOB) =====================

    horizontalScalingKnob.addEventListener("input", function(){
        isDragging = true;
        horizontalScale = parseInt(this.value);
    });

    horizontalScalingKnob.addEventListener("mousedown", function(){
        isDragging = false;
    });

    horizontalScalingKnob.addEventListener("mouseup", function(){
        if (!isDragging){
            horizontalScalingKnob.value = 50;
            horizontalScale = 50;
        }
        isDragging = false;
    });


    //===================== RUN/STOP BUTTON INTERACTIONS =====================

    RUNSTOP.addEventListener("click", function() {
        if (isRunning) {
            console.log("Stopping the oscilloscope");
            isRunning = false;
            RUNSTOP.innerHTML = "RUN";
            clearCanvas(); //we delete the signals on screen
            drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);//we keep the grid however.
            
        } else {
            console.log("Starting the oscilloscope");
            isRunning = true;
            RUNSTOP.innerHTML = "STOP";
        }
    });

    //===================== PRINT BUTTON INTERACTIONS =====================

    PRINT.addEventListener("click", function(){downloadCanvasAsImage("png")});

    //===================== SAVE BUTTON INTERACTIONS =====================
    
    SAVE.addEventListener("click", function(){
        populateModalForSave();
        displayBaseModal();
    });


    //===================== MEASURE BUTTON INTERACTIONS =====================

    MEASURE.addEventListener("click", function(){
        populateModalForMeasure();
        displayBaseModal();
    });


    //===================== TRIGGER BUTTON INTERACTIONS =====================

    TRIGGER.addEventListener("click", function(){
        console.log("Trigger button clicked");
        populateModalForTrigger();
        displayBaseModal();
    });

    //This part is not absolutely necessary, it justs show the grid of the screen before the oscillo has been started.
    drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);

    getCurrentSettings();
}

function MAINLOOP(){
    LOOP = setInterval(function() {
        if (config.mode != null){
            if (isRunning && !triggered){
                if (config.mode == "FILE"){
                    clearCanvas();
                    drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);
                    fetchDataFromFile();
                    setScreenInformation();
                }else if(config.mode == "FAKE-STARE"){
                    clearCanvas();
                    drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);
                    fetchData();
                    setScreenInformation();
                }
            }else if(triggered){
                clearCanvas();
                drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);
                Object.keys(channelData).forEach(key => {
                    if (channelData[key].display === true){
                        drawSignalFromFile(key);
                        setScreenInformation();
                    }
                });
            }
        }else{
            console.log("Still waiting on settings retrieval");
        }
    }, 150)

}

document.addEventListener('DOMContentLoaded', function() {
    environmentSetup();//we load all the necessary event listeners for the oscilloscope

    MAINLOOP();
});

function showToast(message, status) {
    let toast = document.getElementById("toast");
    toast.innerHTML = message;
    toast.className = "";
    toast.classList.add("show", status);
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
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
            showToast(text, "toast-info");
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

    const gridSizeVertical = CANVAS.width / config.horizontalDivisions;
    const gridSizeHorizontal = CANVAS.height / config.verticalDivisions;
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

    const verticalScalingFactor = channel.verticalScale; 

    const verticalOffset = channel.verticalOffset;

    // Calculate the scaling factors based on actual data range
    const verticalScale = (height / amplitudeRange) * verticalScalingFactor;
    const horizontalScaleFactor = (width / points.length) * (horizontalScale / 50);//we have to divide by 50 because the default value of the input is 50 which corresponds to 1 : no scaling

    // Start drawing the waveform
    ctx.beginPath();

    // Adjust the waveform to be centered vertically
    points.forEach((point, index) => {
        const x = (index * (width / points.length) / horizontalScaleFactor) + horizontalOffset;//horizontalOffset is init at the start of the script and modified by an eventlistener (cursor)
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

function drawSignalFromFile(channelKey){
    const channel = channelData[channelKey];
    const points = channel.points;
    const ctx = CANVAS.getContext('2d');
    const width = CANVAS.width;
    const height = CANVAS.height;

    const maxSignalValue = 16383;  // Max value of the signal
    const verticalScalingFactor = channel.verticalScale; 

    const verticalOffset = channel.verticalOffset;

    // Calculate the scaling factors
    const verticalScale = height / maxSignalValue * verticalScalingFactor;
    const horizontalScaleFactor = width / points.length * (horizontalScale / 50);

    const baselineY = height / 2  

    // Start drawing the waveform
    ctx.beginPath();

    // Draw each point on the canvas
    points.forEach((point, index) => {
        const x = (index * horizontalScaleFactor) + horizontalOffset;
        const y = baselineY - ((point - maxSignalValue / 2) * verticalScale) + verticalOffset;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.strokeStyle = channel.colorDark;
    ctx.lineWidth = 2;
    ctx.stroke();
}

function setScreenInformation(){
    //insert time scale to the screen
    const timePerDiv = getTimePerDiv();
    document.getElementById('tpdiv-value').innerHTML = timePerDiv.value + ' ' + timePerDiv.scale + '/div';
    //console.log(`Time per division is : ${timePerDiv.value} ${timePerDiv.scale}`);

    for (let i = 1; i < config.numChannels + 1; i++) {
        const voltsPerDiv = getVoltsPerDiv(channelData['CH' + i].verticalScale);
        document.getElementById('mes-CH' + i).innerHTML = voltsPerDiv + ' V/div';
        document.getElementById('mes-CH' + i).style.color = channelData['CH' + i].colorDark;
    }
};

function getVoltsPerDiv(channelVerticalScale) {
    const totalVoltageRange = config.voltage; //voltage range we get from the settings (-V to +V)
    const verticalDivisions = config.verticalDivisions;

    const voltsPerDivision = totalVoltageRange / (verticalDivisions * channelVerticalScale); 

    return voltsPerDivision.toFixed(4);//round here to 4 decimals
};

function getTimePerDiv() { 
    const totalSamplingTime = config.samplesPerFrame * 1e-8;
    const timePerDivision = (totalSamplingTime / config.horizontalDivisions) / (horizontalScale / 50);//we have to divide by 50 because the default value of the input is 50 which corresponds to 1 : no scaling
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
};

function downloadCanvasAsImage(imageType) {
    try{
        let imageUrl
        let exportCanvas = document.createElement('canvas');
        exportCanvas.width = CANVAS.width;
        exportCanvas.height = CANVAS.height;
    
        let exportCtx = exportCanvas.getContext('2d');
    
        exportCtx.fillStyle = '#000000';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        exportCtx.drawImage(CANVAS, 0, 0);
    
        if (imageType === "png") {
            imageUrl = exportCanvas.toDataURL("image/png");
        }else if (imageType === "jpeg") {
            imageUrl = exportCanvas.toDataURL("image/jpeg");
        }
        
    
        // Create temporary link element
        let downloadLink = document.createElement('a');
        downloadLink.href = imageUrl;
    
        // set the download filename
        if (imageType === "png") {
            downloadLink.download = "oscilloscope_snapshot.png";
        }else if (imageType === "jpeg") {
            downloadLink.download = "oscilloscope_snapshot.jpeg";
        }
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        showToast("Image downloaded successfully !", "toast-success");
    } catch (error) {
        console.error('Failed to download canvas as image', error);
        showToast("Error while downloading the image..", "toast-error");
        return;
    }
};

function copyCanvasToClipboard() {
    // first we check in case this browser does not have the clipboard API
    if (!navigator.clipboard || !window.ClipboardItem) {
        //console.error('Clipboard API not available');
        showToast("Your browser does not support this feature", "toast-error");
        return;
    }
  
    CANVAS.toBlob(function(blob) {
      try {
        const item = new ClipboardItem({ "image/png": blob });
        navigator.clipboard.write([item]).then(function() {
          console.log('Canvas image copied to clipboard');
          showToast("Image copied to your clipboard !", "toast-success");
        }).catch(function(error) {
          console.error('Copying to clipboard failed', error);
          showToast("Error while copying to the clipboard..", "toast-error");
        });
      } catch (error) {
        console.error('Failed to copy canvas to clipboard', error);
        showToast("Error while copying to the clipboard..", "toast-error");
      }
    }, 'image/png');
};

function downloadDataToCsv() {
    try {
        const channelNames = Object.keys(channelData).sort();//get channel names and sort them
        const csvHeader = channelNames.join(',') + '\n';//set csv header
        const maxPointsLength = Math.max(...channelNames.map(name => channelData[name].points.length));//get each channel max length
      
        let csvRows = [];//create csv rows
        for (let i = 0; i < maxPointsLength; i++) {
          let row = channelNames.map(name => {
            //we leave the row space blank if there are no samples at that index
            return channelData[name].points[i] || '';
          }).join(',');
          csvRows.push(row);
        }
      
        // combine headers w/ rows and create blob for the download
        const csvString = csvHeader + csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      
        //create the link for the download, then trigger it
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'channels_data.csv');
        document.body.appendChild(link); // needed with firefox
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Data downloaded successfully !", "toast-success");
    } catch (error) {
        console.error('Failed to download data to CSV', error);
        showToast("Error while downloading the data..", "toast-error");
    }
};

function displayBaseModal(){
    MODAL.style.display = "block";

    let modalClose = document.getElementsByClassName("close")[0];


    modalClose.onclick = function() {//if user clicks on the close button, we close the modal
        hideModal();
    };

    window.onclick = function(event) {
        if (event.target == MODAL) {
            hideModal();
        }
    };
};

function hideModal() {
    MODAL.style.display = "none"; // Hide the modal by setting display to 'none'
    clearModal(); // Assuming clearModal() is a function to clear the modal content
}

function clearModal(){
    let modalContentDiv = document.getElementById("modal-generated-content");

    //Here instead of just removing the children of this element, we clone it and replace it with the clone
    //This ensures that the event listeners are also removed.
    let modalClone = modalContentDiv.cloneNode(false);
    modalContentDiv.parentNode.replaceChild(modalClone, modalContentDiv);
}

function populateModalForSave(){
    let modalContentDiv = document.getElementById("modal-generated-content");

    title = document.createElement("h5");
    csvButton = document.createElement("button");
    pngButton = document.createElement("button");
    jpegButton = document.createElement("button");
    clipBoardButton = document.createElement("button");

    title.innerHTML = "Choose a saving option";

    csvButton.classList.add("modal-save-button");
    pngButton.classList.add("modal-save-button");
    jpegButton.classList.add("modal-save-button");
    clipBoardButton.classList.add("modal-save-button");

    csvButton.innerHTML = "Save as CSV";
    pngButton.innerHTML = "Save as PNG";
    jpegButton.innerHTML = "Save as JPEG";
    clipBoardButton.innerHTML = "Copy to clipboard";

    modalContentDiv.appendChild(title);
    modalContentDiv.appendChild(csvButton);
    modalContentDiv.appendChild(pngButton);
    modalContentDiv.appendChild(jpegButton);
    modalContentDiv.appendChild(clipBoardButton);


    csvButton.addEventListener("click", downloadDataToCsv);
    pngButton.addEventListener("click", function(){downloadCanvasAsImage("png")});
    jpegButton.addEventListener("click", function(){downloadCanvasAsImage("jpeg")});
    clipBoardButton.addEventListener("click", copyCanvasToClipboard);
};

function populateModalForMeasure(){
    let modalContentDiv = document.getElementById("modal-generated-content");
};

function populateModalForTrigger(){
    console.log("Trigger settings : ", triggerOptions);
    let modalContentDiv = document.getElementById("modal-generated-content");

    function createSelect(options){
        const selectElement = document.createElement("select");
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            selectElement.appendChild(optionElement)
        });
        selectElement.classList.add("modal-select-trigger");
        return selectElement;
    }

    const triggerOnOffOptions = [
        {value: "off", text: "Off"},
        {value: "on", text: "On"},
    ]

    const triggerModeOptions = [
        {value: "edge", text: "Edge-Trigger"},
        {value: "window", text: "Window-Trigger"},
    ]

    const triggerChannelOptions = [];
    for (let i = 1; i < config.numChannels + 1; i++) {
        triggerChannelOptions.push({value: "CH" + i, text: "Channel " + i});
    };

    const triggerSlopeOptions = [
        {value: "both", text: "Both"},
        {value: "rising", text: "Rising"},
        {value: "falling", text: "Falling"},
    ]

    title = document.createElement("h5");
    title.innerHTML = "Trigger options";
    modalContentDiv.appendChild(title);

    const label1 = document.createElement("label"); //Trigger on/off
    label1.textContent = "Trigger on/off";
    modalContentDiv.appendChild(label1);

    const selectOnOffStatus = createSelect(triggerOnOffOptions);
    selectOnOffStatus.id = "selectOnOffStatus";
    selectOnOffStatus.value = triggerOptions.isTriggerOn;
    modalContentDiv.appendChild(selectOnOffStatus);

    const label2 = document.createElement("label"); //Trigger mode
    label2.textContent = "Trigger mode";
    modalContentDiv.appendChild(label2);

    const selectTriggerMode = createSelect(triggerModeOptions);
    selectTriggerMode.id = "selectTriggerMode";
    selectTriggerMode.value = triggerOptions.triggerMode;
    modalContentDiv.appendChild(selectTriggerMode);

    const label3 = document.createElement("label"); //Trigger channel
    label3.textContent = "Trigger channel";
    modalContentDiv.appendChild(label3);

    const selectTriggerChannel = createSelect(triggerChannelOptions);
    selectTriggerChannel.id = "selectTriggerChannel";
    selectTriggerChannel.value = triggerOptions.triggerChannel;
    modalContentDiv.appendChild(selectTriggerChannel);

    const label4 = document.createElement("label"); //Trigger slope
    label4.textContent = "Trigger slope";
    modalContentDiv.appendChild(label4);

    const selectTriggerSlope = createSelect(triggerSlopeOptions);
    selectTriggerSlope.id = "selectTriggerSlope";
    selectTriggerSlope.value = triggerOptions.triggerSlope;
    modalContentDiv.appendChild(selectTriggerSlope);


    const label5 = document.createElement("label"); //Trigger level
    label5.textContent = "Trigger level (mV)";
    modalContentDiv.appendChild(label5);

    const TriggerLevelInput = document.createElement("input");
    TriggerLevelInput.type = "number";
    TriggerLevelInput.min = -(config.voltage / 2) * 1000;
    TriggerLevelInput.max = (config.voltage / 2) * 1000;
    TriggerLevelInput.value = triggerOptions.triggerLevel;
    TriggerLevelInput.classList.add("modal-select-trigger");
    TriggerLevelInput.id = "TriggerLevelInput";
    modalContentDiv.appendChild(TriggerLevelInput);

    const label6 = document.createElement("label"); //Window level min
    label6.textContent = "Window level min (mV)";
    modalContentDiv.appendChild(label6);

    const WindowLevelMinInput = document.createElement("input");
    WindowLevelMinInput.type = "number";
    WindowLevelMinInput.min = -(config.voltage / 2) * 1000;
    WindowLevelMinInput.max = (config.voltage / 2) * 1000;
    WindowLevelMinInput.value = triggerOptions.windowLevelMin;
    WindowLevelMinInput.disabled = true;
    WindowLevelMinInput.classList.add("modal-select-trigger");
    WindowLevelMinInput.id = "WindowLevelMinInput";
    modalContentDiv.appendChild(WindowLevelMinInput);

    const label7 = document.createElement("label"); //Window level max
    label7.textContent = "Window level max (mV)";
    modalContentDiv.appendChild(label7);

    const WindowLevelMaxInput = document.createElement("input");
    WindowLevelMaxInput.type = "number";
    WindowLevelMaxInput.min = -(config.voltage / 2) * 1000;
    WindowLevelMaxInput.max = (config.voltage / 2) * 1000;
    WindowLevelMaxInput.value = triggerOptions.windowLevelMax;
    WindowLevelMaxInput.disabled = true;
    WindowLevelMaxInput.classList.add("modal-select-trigger");
    WindowLevelMaxInput.id = "WindowLevelMaxInput";
    modalContentDiv.appendChild(WindowLevelMaxInput);

    selectTriggerMode.addEventListener("change", function(){
        console.log("Trigger mode changed to : ", selectTriggerMode.value);
        if (selectTriggerMode.value === "edge"){
            WindowLevelMinInput.disabled = true;
            WindowLevelMaxInput.disabled = true;
            TriggerLevelInput.disabled = false;
        } else if (selectTriggerMode.value === "window"){
            WindowLevelMinInput.disabled = false;
            WindowLevelMaxInput.disabled = false;
            TriggerLevelInput.disabled = true;
        }
    });

    const label8 = document.createElement("label"); //Hold off
    label8.textContent = "Hold off (s)";
    modalContentDiv.appendChild(label8);

    const holdOffInput = document.createElement("input");
    holdOffInput.type = "number";
    holdOffInput.min = 0;
    holdOffInput.max = 3600;
    holdOffInput.value = triggerOptions.holdOff;
    holdOffInput.classList.add("modal-select-trigger");
    holdOffInput.id = "holdOffInput";
    modalContentDiv.appendChild(holdOffInput);

    const button = document.createElement("button");// SAVE CHANGES
    button.textContent = "Apply Trigger Settings";
    button.classList.add("modal-trigger-button");
    modalContentDiv.appendChild(button);

    button.addEventListener("click", function(){
        updateTriggerSettings(modalContentDiv);
        hideModal();
    });
};

function updateTriggerSettings(modalElement){
    console.log("Updating trigger settings");
    console.log(modalElement);

    triggerOptions.isTriggerOn = modalElement.querySelector("#selectOnOffStatus").value;
    triggerOptions.triggerMode = modalElement.querySelector("#selectTriggerMode").value;
    triggerOptions.triggerChannel = modalElement.querySelector("#selectTriggerChannel").value;
    triggerOptions.triggerLevel = modalElement.querySelector("#TriggerLevelInput").value;
    triggerOptions.windowLevelMin = modalElement.querySelector("#WindowLevelMinInput").value;
    triggerOptions.windowLevelMax = modalElement.querySelector("#WindowLevelMaxInput").value;
    triggerOptions.triggerSlope = modalElement.querySelector("#selectTriggerSlope").value;
    triggerOptions.holdOff = modalElement.querySelector("#holdOffInput").value;

    showToast("Trigger settings updated !", "toast-info");
};

//converts an absolute value (from 0 to 16383) to the corresponding voltage value (-1.1 to +1.1v or else if the config changes).
function voltage_from_raw(raw_value, max_raw=16383){
    let voltage_range = [-(config.voltage/2), config.voltage/2]
    let span = voltage_range[1] - voltage_range[0]
    normalized = raw_value / max_raw
    return voltage_range[0] + (normalized * span)
};

//converts a voltage to the equivalent absolute raw value of a 14-bit ADC
function mapVoltageToRaw(voltage) {
    return (voltage + 1.1) / 2.2 * 16383;
}

function triggerCheck(channelPoints){
    let isTriggerValueReached = false;
    let triggerValueIndex = 0;//in case isTriggerValueReadched is true, we store the index of the value that triggered the oscilloscope
    let currentSlope = null; //falling | rising | both

    //Here we transform the trigger level(s) from mV to raw values
    let trigLevelEdge = mapVoltageToRaw((triggerOptions.triggerLevel / 1000));//divide by 1000 to convert mV to V
    let trigLevelWindowMin = mapVoltageToRaw((triggerOptions.windowLevelMin / 1000));
    let trigLevelWindowMax = mapVoltageToRaw((triggerOptions.windowLevelMax / 1000));


    //First we check wether or not any of the points exceed the trigger value(s) set up by the user
    if (triggerOptions.triggerMode == "edge"){
        for (let i = 0; i < channelPoints.length - 1; i++){
            if (triggerOptions.triggerLevel >= 0){ //if the trigLevel is positive
                if (channelPoints[i] > trigLevelEdge){
                    console.log("Point Value exceeds trigger level ! ");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                };
            }else{ //if the trigLevel is negative
                if (channelPoints[i] < trigLevelEdge){
                    console.log("Point Value exceeds trigger level ! ");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                };
            };
        };
    }else{
        console.log(`Checking for values between ${trigLevelWindowMin} and ${trigLevelWindowMax}`);
        for (let i = 0; i < channelPoints.length - 1; i++){
            if (trigLevelWindowMin < trigLevelWindowMax){
                if (channelPoints[i] > trigLevelWindowMin && channelPoints[i] < trigLevelWindowMax){
                    console.log("Point value is within the trigger window !");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                }
            }else{
                if (channelPoints[i] < trigLevelWindowMin && channelPoints[i] > trigLevelWindowMax){
                    console.log("Point value is within the trigger window !");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                }
            }
        };
    };

    //Now if the triggerLevel has been exceeded, we check if the slope is in accord with what the user selected.


    
    
    //finally we return the boolean to state wether or not to stop the image according to the checks we did.
    if (isTriggerValueReached){
        return true;
    }
}
