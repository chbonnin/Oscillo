/*
╔══════════════════════════════════════════════════════╗
║            GLOBAL VARIABLES DECLARATIONS             ║
╚══════════════════════════════════════════════════════╝
*/

let config = {//Used to handle the configuration of the server, in case it changes we can update it here
    numChannels: null,  // How many channels are expected. update if server configuration changes
    frequency: null,
    samplesPerFrame: null,
    voltage: null,
    bitsPerSample: null,
    verticalDivisions: 16,
    horizontalDivisions: 20,
    mode: null,
    maxSampleValue: null,
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
};

let cursorOptions = {
    isVerticalCursorOn: "false",
    isHorizontalCursorOn: "false",
    cursorsValueDisplay: "oncursor", // oncursor (default) / indisplay
    horizontalAPosition: 266,//value in pixels
    horizontalBPosition: 533,//value in pixels
    verticalAPosition: 400,//value in pixels
    verticalBPosition: 800,//value in pixels
};

let autoMeasureOptions = {
    //each option has a boolean associated representing whether or not the measure is to be made depending on the user selection
    associatedChannel: "CH1", //null / CH1 (default) / CH2 / CH3, etc etc..
    min: {set: false}, //Min value in channel (mV)
    max: {set: false}, //Max value in channel (mV)
    vpp: {set: false}, //Value from highest to lowest point (mV)
    mean: {set: false}, //Average of all values (mV)
    rms: {set: false}, //Root Mean Square (mV)
    freq: {set: false}, //Avg frequency throughout signal (Hz)
    highFreq: {set: false}, //Highest freq throughout signal (Hz)
    lowFreq: {set: false}, //Lowest freq throughout signal (Hz)
    mid: {set: false},// middle Value of the signal (mV)
};

let channelData = {}; //This dictionnary holds the data for each channel including points, status, color, etc..

let horizontalOffset = 0;
let horizontalScale = 50;

let loopDelay = 300//ms
let isRunning = false;
let triggered = false;
let triggerClock = 0;

//these lines below only serves in the case of a file mode.
let currentFilePosition = 0;
let fileName = "NA";

const autoMeasures = calculateAutoMeasures();

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

/*
╔══════════════════════════════════════════════════════╗
║              DATA FETCHING & SETTINGS                ║
╚══════════════════════════════════════════════════════╝
*/

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
        config.voltage = parseFloat(settings.voltage);
        config.bitsPerSample = settings.bits;

        if (config.mode == "FILE"){
            config.maxSampleValue = 16383;
            fileName = settings.file_path
            currentFilePosition = parseInt(settings.file_position, 10);
        }else if(config.mode == "REAL-TIME"){
            config.maxSampleValue = 65535;
        }else if(config.mode == "FAKE-STARE"){
            config.maxSampleValue = 16383;
        }

        console.log("Updated config:", config);

        // update the channelData object now that we know the number of channels

        for (let ch = 1; ch <= config.numChannels; ch++) {
            channelData['CH' + ch] = {
                points: [],
                display: true,
                type: 'baseData',
                focused: false,
                colorDark: channelsMetaData['CH' + ch].colorDark, //channelsMetaData is passed from the backend to here via the html page
                colorLight: channelsMetaData['CH' + ch].colorLight,
                verticalOffset: 0,
                verticalScale: 1, //default value
                verticalOffsetRelativeCursorPosition: 395,
            };

            channel_button = document.getElementById('CH' + ch);
            
            channel_button.classList.remove("channel-not-displayed");
            channel_button.classList.add("channel-displayed");
            channel_button.classList.add(channelData['CH' + ch].colorDark);
        }
    }
};

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
            Object.keys(channelData).forEach(key => {
                channelData[key].points = [];
            });
        
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
                    if (channelData[key].type == "generatedData" && channelData[key].operation == "fft"){
                        drawFFT(key);
                    } else {
                        drawSignal(key);
                    }
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
};

function fetchDataFromFile(){
    // console.log("fetchDataFromFile starts");
    const Http = new XMLHttpRequest();

    const fileNameOnly = fileName.split("/").pop();

    const url = `/oscillo/dataFL/${currentFilePosition}/${fileNameOnly}/`;
    Http.open("GET", url, true);
    Http.responseType = 'json';

    Http.onload = function() {
        if (Http.status === 200) {
            console.log("JSON data received : ");
            console.log(Http.response);

            //Here we now populate the channel data arrays with the data received
            //We know .osc files take a max amount of 4 channels
            Object.keys(channelData).forEach(key => {
                let channelNumber = parseInt(key.substring(2), 10)
                channelData[key].points = Http.response[0][channelNumber + 1];
                currentFilePosition = parseInt(Http.response[1]);
            });

            clearCanvas();
            drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);
            if (cursorOptions.isVerticalCursorOn == "true" || cursorOptions.isHorizontalCursorOn == "true"){
                drawCursors();
            }

            Object.keys(channelData).forEach(key => {
                //We start by checking wether or not the trigger is set and if so we check the trigger conditions to freeze or not this part of the signal.
                if (triggerOptions.isTriggerOn == "on"){
                    if (triggerOptions.triggerChannel == key){//we check the trigger options only for the channel specified in the settings.
                        triggered = triggerCheck(channelData[key].points);
                    };
                };

                //Here we generate the points array for the math signals
                if (channelData[key].type == "generatedData"){
                    generatePoints(key);
                }

                // Here we display the signal on the screen (if the button for this channel is active)
                if (channelData[key].display === true){
                    if (channelData[key].type == "generatedData" && channelData[key].operation == "fft"){
                        drawFFT(key);
                    } else {
                        drawSignalFromFile(key);
                    }
                }
            });
            //console.log(channelData);
        } else if (Http.status === 408){
            console.error("Backend Error" + Http.status)
        } else {
            console.error("Failed to load data, status: " + Http.status);
        }
    }

    Http.onerror = function() {
        console.error("There was a network error.");
    };

    Http.send();
    // console.log("fetchDataFromFile ends");
};

function fetchRawData(){
    const Http = new XMLHttpRequest();
    Http.responseType = 'arraybuffer';

    Http.open("GET", '/oscillo/dataR/', true);

    Http.onload = function(event) {
        if (Http.status === 200) {
            const buffer = Http.response;
            const dataView = new DataView(buffer);
            const bytesPerSample = 2; // Each sample is 2 bytes (Uint16) altough this may change depending on the server's settings !!
            const totalSamples = dataView.byteLength / bytesPerSample; // Total samples in all channels
    
            // console.log(`THis data is made up of ${totalSamples} samples`);
            // console.log("Here below should be the dataView created from the received data : ");
            // console.log(dataView);

            clearCanvas();
            drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);
            if (cursorOptions.isVerticalCursorOn == "true" || cursorOptions.isHorizontalCursorOn == "true"){
                drawCursors();
            }

            // Clear the channel data before parsing the new data
            Object.keys(channelData).forEach(key => {
                channelData[key].points = [];
            });

            // Parse buffer into channel data
            for (let i = 0; i < totalSamples; i++) {
                let channelNum = (i % config.numChannels) + 1;
                let channelKey = 'CH' + channelNum;
                let pointIndex = i * bytesPerSample;
                let point = dataView.getUint16(pointIndex, true);
                channelData[channelKey].points.push(point);
            }

            Object.keys(channelData).forEach(key => {
                //we have to use some sort of a filter to remove the trigger points or whatever is causing these massive spikes.
                const thresholdRatio = 3;
                channelData[key].points = removeSpikes(channelData[key].points, thresholdRatio);

                //Here we generate the points array for the math signals
                if (channelData[key].type == "generatedData"){
                    generatePoints(key);
                }

                // Here we display the signal on the screen (if the button for this channel is active)
                if (channelData[key].display === true){
                    if (channelData[key].type == "generatedData" && channelData[key].operation == "fft"){
                        drawFFT(key);
                    } else {
                        drawSignalFromFile(key);
                    }
                }
            });


        } else {
            console.error("The request failed unexpectedly ->", Http.statusText);
        }
    }

    Http.onerror = function() {
        console.log("An error occured while fetching the data");
    }

    Http.send();
};

/*
╔══════════════════════════════════════════════════════╗
║        CODE FLOW (START - LOOP - EVENTS)             ║
╚══════════════════════════════════════════════════════╝
*/

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
        Object.keys(channelData).forEach(key => {
            if (channelData[key].focused) {
                channelData[key].verticalOffset = verticalOffset;
            }
        });
    };

    function onMouseUp(event) {
        isDragging = false;

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        //Here below we save the cursor position for that channel to restore it when the user clicks on the channel again

        let newY = event.clientY - startY;
        newY = Math.max(newY, 0);
        newY = Math.min(newY, scrollBar.clientHeight - scroller.clientHeight);

        Object.keys(channelData).forEach(key => {
            if (channelData[key].focused) {
                channelData[key].verticalOffsetRelativeCursorPosition = newY;
            }
        });
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
        Object.keys(channelData).forEach(key => {
            if (channelData[key].focused) {
                channelData[key].verticalScale = parseFloat(this.value);//convert from str to int (base10)
            }
        });
    });

    verticalScalingKnob.addEventListener("mousedown", function() {
        isDragging = false;
    });

    //Setup listener to detect a click on the knob and reinitialize the vertical scale to the default value.
    verticalScalingKnob.addEventListener("mouseup", function(){
        Object.keys(channelData).forEach(key => {
            if (channelData[key].focused && !isDragging) {
                verticalScalingKnob.value = 1;
                channelData[key].verticalScale = 1;//convert from str to int (base10)
            }
        });
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
        populateModalForMeasure_MATHS();
        displayBaseModal();
    });


    //===================== TRIGGER BUTTON INTERACTIONS =====================

    TRIGGER.addEventListener("click", function(){
        console.log("Trigger button clicked");
        if (triggered){
            triggered = false;
        }else{
            populateModalForTrigger();
            displayBaseModal();
        }
    });

    //===================== AUTOSET BUTTON INTERACTIONS =====================

    AUTOSET.addEventListener("click", autoset);

    //===================== CURSORS BUTTON INTERACTIONS =====================

    CURSORS.addEventListener("click", function(){
        console.log("Cursors Button clicked ! ");
        populateModalForCursors();
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
                    fetchDataFromFile();
                }else if(config.mode == "FAKE-STARE"){
                    fetchData();
                }else if (config.mode == "REAL-TIME"){
                    fetchRawData();
                }
                setScreenInformation();
            }else if(triggered){
                clearCanvas();
                drawGrid('rgba(128, 128, 128, 0.5)', 0.5, 3);
                Object.keys(channelData).forEach(key => {
                    //We check here wether there could be a signal to generate from a math function that has been set during a trigger.
                    //In which case it wouldn't be drawn directly because the 'generatepoints' function is called when fetching data which we aren't when triggered.
                    if (channelData[key].type == "generatedData" && channelData[key].points.length == 0){
                        generatePoints(key);
                    };

                    if (channelData[key].display === true){
                        if (channelData[key].type == "generatedData" && channelData[key].operation == "fft"){
                            drawFFT(key);
                        }else{
                            drawSignalFromFile(key);
                            setScreenInformation();
                        }
                    };
                });
                if (cursorOptions.isVerticalCursorOn == "true" || cursorOptions.isHorizontalCursorOn == "true"){
                    drawCursors();
                }
                if ((triggerClock / 1000) > triggerOptions.holdOff){
                    triggerClock = 0;
                    triggered = false;
                }else{
                    triggerClock = triggerClock + loopDelay;
                }
            }
        }else{
            console.log("Still waiting on settings retrieval");
        }
    }, loopDelay)

}

document.addEventListener('DOMContentLoaded', function() {
    environmentSetup();//we load all the necessary event listeners for the oscilloscope

    MAINLOOP();
});

/*
╔══════════════════════════════════════════════════════╗
║              CANVAS DRAWINGS & RELATED               ║
╚══════════════════════════════════════════════════════╝
*/

function clearCanvas(){
    let ctx = CANVAS.getContext('2d');
    ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
};

function drawCursors(){
    const ctx = CANVAS.getContext('2d');

    if (cursorOptions.isVerticalCursorOn == "true"){
        ctx.setLineDash([12, 8]);/*dashes are 12px and spaces are 8px*/
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = 'red';
    
        //draw first line
        ctx.beginPath();
        ctx.moveTo(cursorOptions.verticalAPosition, 0);
        ctx.lineTo(cursorOptions.verticalAPosition, CANVAS.height);
        const cursorATime = getTimeForACursor(cursorOptions.verticalAPosition)
        const text = `${cursorATime.value} ${cursorATime.scale}`;
        ctx.fillText(text, cursorOptions.verticalAPosition + 10, 50);
        ctx.stroke();
    
        ctx.strokeStyle = 'crimson';
        ctx.fillStyle = 'crimson';

        //draw second line
        ctx.beginPath();
        ctx.moveTo(cursorOptions.verticalBPosition, 0);
        ctx.lineTo(cursorOptions.verticalBPosition, CANVAS.height);
        const cursorBTime = getTimeForACursor(cursorOptions.verticalBPosition)
        const text2 = `${cursorBTime.value} ${cursorBTime.scale}`;
        ctx.fillText(text2, cursorOptions.verticalBPosition - 70, 50);
        ctx.stroke();
    
        //draw perpendicular line
        ctx.beginPath();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'white';
        
    
    
        let pixelsBetweenCursors;
        if (cursorOptions.verticalAPosition > cursorOptions.verticalBPosition){
            pixelsBetweenCursors = cursorOptions.verticalAPosition - cursorOptions.verticalBPosition;
        }else{
            pixelsBetweenCursors = cursorOptions.verticalBPosition - cursorOptions.verticalAPosition;
        }
        const timeBetweenCursors = getTimeBetweenCursors(pixelsBetweenCursors);
    
        const text3 = `Δ ${timeBetweenCursors.value} ${timeBetweenCursors.scale}`;
        let X = (cursorOptions.verticalAPosition + cursorOptions.verticalBPosition) / 2;
        let Y = CANVAS.height * 0.80 - 10;
        ctx.fillText(text3, X -80, Y);
        
        ctx.setLineDash([8, 4]);
        ctx.moveTo(Math.min(cursorOptions.verticalAPosition, cursorOptions.verticalBPosition), CANVAS.height * 0.80);
        ctx.lineTo(Math.max(cursorOptions.verticalAPosition, cursorOptions.verticalBPosition), CANVAS.height * 0.80);
        ctx.stroke();
    
        ctx.setLineDash([]);
    };

    if (cursorOptions.isHorizontalCursorOn == "true"){
        ctx.setLineDash([12, 8]);
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = 'orange';

        //draw first line
        ctx.beginPath();
        ctx.moveTo(0, cursorOptions.horizontalAPosition); // Move to the left edge of the canvas at a specific horizontal position
        ctx.lineTo(CANVAS.width, cursorOptions.horizontalAPosition); // Draw line to the right edge of the canvas
        const MvCursorA = getMilliVoltForACursor(cursorOptions.horizontalAPosition);
        const text = `${MvCursorA.value} ${MvCursorA.scale}`;
        ctx.fillText(text, CANVAS.width - 100, cursorOptions.horizontalAPosition -10); // Adjust text position to follow the line
        ctx.stroke();
    
        ctx.strokeStyle = 'darkorange';
        ctx.fillStyle = 'darkorange';

        //draw second line
        ctx.beginPath();
        ctx.moveTo(0, cursorOptions.horizontalBPosition); // Move to the left edge of the canvas at another specific horizontal position
        ctx.lineTo(CANVAS.width, cursorOptions.horizontalBPosition); // Draw line to the right edge of the canvas
        const MvCursorB = getMilliVoltForACursor(cursorOptions.horizontalBPosition);
        const text2 = `${MvCursorB.value} ${MvCursorB.scale}`;
        ctx.fillText(text2, CANVAS.width - 100, cursorOptions.horizontalBPosition + 22); // Adjust text position to follow the line, slightly offset vertically
        ctx.stroke();


        // Draw perpendicular line
        ctx.beginPath();
        ctx.strokeStyle = 'whitesmoke';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'whitesmoke';

        let pixelsBetweenCursors;
        if (cursorOptions.horizontalAPosition > cursorOptions.horizontalBPosition){
            pixelsBetweenCursors = cursorOptions.horizontalAPosition - cursorOptions.horizontalBPosition;
        }else{
            pixelsBetweenCursors = cursorOptions.horizontalBPosition - cursorOptions.horizontalAPosition;
        }

        const milliVoltsBetweenCursors = getMillivoltsBetweenCursors(pixelsBetweenCursors);

        const text3 = `Δ ${milliVoltsBetweenCursors.value} ${milliVoltsBetweenCursors.scale}`;
        let Y = (cursorOptions.horizontalAPosition + cursorOptions.horizontalBPosition) / 2;
        let X = CANVAS.width * 0.10 + 10;
        ctx.fillText(text3, X, Y);

        ctx.setLineDash([8, 4]);
        ctx.moveTo(CANVAS.width * 0.10, Math.min(cursorOptions.horizontalAPosition, cursorOptions.horizontalBPosition));
        ctx.lineTo(CANVAS.width * 0.10, Math.max(cursorOptions.horizontalAPosition, cursorOptions.horizontalBPosition));
        ctx.stroke();

        ctx.setLineDash([]);
    };
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

    const maxSignalValue = config.maxSampleValue;  // Max value of the signal

    // Calculate the scaling factors
    const verticalScale = height / maxSignalValue * channel.verticalScale;
    const horizontalScaleFactor = width / points.length * (horizontalScale / 50);

    const baselineY = height / 2  

    // Start drawing the waveform
    ctx.beginPath();

    // Draw each point on the canvas
    points.forEach((point, index) => {
        const x = (index * horizontalScaleFactor) + horizontalOffset;
        const y = baselineY - ((point - maxSignalValue / 2) * verticalScale) + channel.verticalOffset;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.strokeStyle = channel.colorDark;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
};

function drawFFT(channelKey) {
    const channel = channelData[channelKey];
    const points = channel.points;
    const ctx = CANVAS.getContext('2d');
    const width = CANVAS.width;
    const height = CANVAS.height;
    
    //Enable access for the user to the RATE variable so they can choose the rate themselves.
    const RATE = 1; // how many points to skip when drawing the FFT (min=1)

    const validPoints = points.filter(p => p.magnitude !== null);

    if (validPoints.length > 10) {
        const maxFrequency = validPoints[validPoints.length / 2 - 1].frequency;
        const maxMagnitude = Math.max(...validPoints.map(p => p.magnitude));

        const verticalOffset = channel.verticalOffset;
        const verticalScale = channel.verticalScale;

        ctx.beginPath();
        ctx.strokeStyle = 'purple';
        ctx.lineWidth = 1;
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = 'purple';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1.0;

        let previousX = 0; // Initial value to compare against

        validPoints.slice(0, validPoints.length / 2).forEach((point, index) => {
            if (index % RATE === 0) { // draw only every RATE-th point
                const x = (point.frequency / maxFrequency) * width + horizontalOffset ;
                const y = height * (1 - Math.log10(point.magnitude + 1) / (Math.log10(maxMagnitude + 1) * verticalScale)) + verticalOffset;

                if (index === 0) {
                    ctx.moveTo(0, 500); // Move to initial x, y (possibly needs adjustment)
                } else {
                    ctx.lineTo(x, y);
                }

                if (x >= previousX + 200) {
                    previousX = x;
                    const text = formatFrequency(point.frequency);
                    ctx.fillText(text, x, y - 60);
                }
            }
        });
        ctx.stroke();
    } else {
        console.log("Not enough valid data to display.");
    }
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

function removeSpikes(points, thresholdRatio) {
    const pointsAverage = points.reduce((a, b) => a + b, 0) / points.length;

    function isSpike(point, index) {
        let prev = points[index - 1] || pointsAverage;
        let next = points[index + 1] || pointsAverage;
        let localAverage = (prev + next) / 2;
        let deviationFromLocalAverage = Math.abs(point - localAverage);
        return deviationFromLocalAverage > thresholdRatio * Math.abs(localAverage - pointsAverage);
    }

    // Replace spikes with the average of their neighboring points
    for (let i = 0; i < points.length; i++) {
        if (isSpike(points[i], i)) {
            let prev = points[i - 1] || pointsAverage;
            let next = points[i + 1] || pointsAverage;
            points[i] = (prev + next) / 2;
        }
    }

    return points;
}

/*
╔══════════════════════════════════════════════════════╗
║              MODAL GENERATION & FILLING              ║
╚══════════════════════════════════════════════════════╝
*/

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

function populateModalForMeasure_AUTO(){
    let modalContentDiv = document.getElementById("modal-generated-content");

    const channelOptions = [];
    Object.keys(channelData).forEach(key => {
        let channelNumber = parseInt(key.substring(2), 10)
        channelOptions.push({value: key, text: "Channel " + channelNumber});
    });

    const measureOptions = [
        {text: "Min", varKey: "min", id: "minButton", onClick: () => { toggleMeasurement('min', "minButton"); }},
        {text: "Max", varKey: "max", id: "maxButton", onClick: () => { toggleMeasurement('max', "maxButton") }},
        {text: "Vpp", varKey: "vpp", id: "vppButton", onClick: () => { toggleMeasurement('vpp', "vppButton") }},
        {text: "Avg", varKey: "mean", id: "avgButton", onClick: () => { toggleMeasurement('mean', "avgButton") }},
        {text: "RMS", varKey: "rms", id: "rmsButton", onClick: () => { toggleMeasurement('rms', "rmsButton") }},
        {text: "F Avg", varKey: "freq", id: "freqButton", onClick: () => { toggleMeasurement('freq', "freqButton") }},
        {text: "High", varKey: "highFreq", id: "highButton", onClick: () => { toggleMeasurement('highFreq', "highButton") }},
        {text: "Low", varKey: "lowFreq", id: "lowButton", onClick: () => { toggleMeasurement('lowFreq', "lowButton") }},
        {text: "Mid", varKey: "mid", id: "midButton", onClick: () => { toggleMeasurement('mid', "midButton") }},
    ];

    const title = document.createElement("h5");
    title.innerHTML = "Auto Measurements";
    modalContentDiv.appendChild(title);

    const container1 = document.createElement("span");

    const label1 = document.createElement("label");
    label1.textContent = "Channel : ";
    container1.appendChild(label1);

    const selectChannel = createSelect(channelOptions);
    selectChannel.id = "selectChannel";
    selectChannel.value = autoMeasureOptions.associatedChannel;
    container1.appendChild(selectChannel);

    selectChannel.addEventListener("change", function(){
        autoMeasureOptions.associatedChannel = selectChannel.value;
    });

    modalContentDiv.appendChild(container1);

    const buttonContainer = document.createElement("span");
    buttonContainer.id = "buttonContainer";

    measureOptions.forEach(option => {
        const button = document.createElement("button");
        button.textContent = option.text;
        button.id = option.id;
        button.classList.add("modal-measure-button");
        button.addEventListener("click", option.onClick);
        buttonContainer.appendChild(button);

        //set the buttons green if this measure is set
        if (autoMeasureOptions[option.varKey].set) {
            button.className = 'modal-measure-button active-measure-button';
        }else{
            button.className = 'modal-measure-button inactive-measure-button';
        }
    });

    modalContentDiv.appendChild(buttonContainer);

    const resetButton = document.createElement("button");
    resetButton.textContent = "RESET";
    resetButton.id = "resetButton";
    resetButton.classList.add("modal-measure-button");

    resetButton.addEventListener("click", function(){
        resetMeasurements();
    });

    const autoSwitchButton = document.createElement("button");
    autoSwitchButton.textContent = "← Math Functions";
    autoSwitchButton.id = "autoSwitchButton";
    autoSwitchButton.classList.add("modal-measure-button");

    autoSwitchButton.addEventListener("click", function(){
        console.log("switch to Math functions")
        clearModal();
        populateModalForMeasure_MATHS();
    });

    modalContentDiv.appendChild(resetButton);
    modalContentDiv.appendChild(autoSwitchButton);
};

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

function populateModalForMeasure_MATHS(){
    let modalContentDiv = document.getElementById("modal-generated-content");

    const emptySlotOptions = [];
    for (let i = 1; i < 11; i++){
        if (channelData["CH" + i] == undefined){//this condition is to avoid overwriting a maths channel that is already in use
            emptySlotOptions.push({value: "CH" + i, text: "Channel " + i});
        }; 
    }

    const channelOptions = [];
    Object.keys(channelData).forEach(key => {
        channelOptions.push({value: key, text: key});
    });

    const operationOptions = [
        {value: "none", text: "None"},
        {value: "add", text: "+"},
        {value: "sub", text: "-"},
        {value: "mult", text: "*"},
        {value: "div", text: "/"},
        {value: "squared", text: "²"},
        {value: "deriv", text: "derivative"},
        {value: "integral", text: "integral"},
        {value: "fft", text: "FFT"},
    ];

    const title = document.createElement("h5");
    title.innerHTML = "Math functions";
    modalContentDiv.appendChild(title);

    const container1 = document.createElement("span");

    const label1 = document.createElement("label");
    label1.textContent = "Channel slot : ";
    container1.appendChild(label1);

    const selectSlotChannel = createSelect(emptySlotOptions);
    selectSlotChannel.id = "selectSlotChannel";
    container1.appendChild(selectSlotChannel);

    modalContentDiv.appendChild(container1);
    const container2 = document.createElement("span");

    const label2 = document.createElement("label");
    label2.textContent = "Channel : ";
    container2.appendChild(label2);

    const selectChannel = createSelect(channelOptions);
    selectChannel.id = "selectChannel";
    container2.appendChild(selectChannel);

    modalContentDiv.appendChild(container2);
    const container3 = document.createElement("span");

    const label3 = document.createElement("label");
    label3.textContent = "Operation : ";
    container3.appendChild(label3);

    const selectOperation = createSelect(operationOptions);
    selectOperation.id = "selectOperation";
    container3.appendChild(selectOperation);

    modalContentDiv.appendChild(container3);

    const container4 = document.createElement("span");

    const label4 = document.createElement("label");
    label4.textContent = "Channel 2 : ";
    container4.appendChild(label4);

    const selectSecondChannel = createSelect(channelOptions);
    selectSecondChannel.id = "selectSecondChannel";
    selectSecondChannel.value = "none";
    container4.style.display = "none";//hidden by default until user chooses an operation requiring a 2nd channel
    container4.appendChild(selectSecondChannel);

    modalContentDiv.appendChild(container4);

    selectOperation.addEventListener("change", function(){
        console.log("Operation change ! ")
        const value = selectOperation.value;
        if (value == "add" || value == "sub" || value == "mult" || value == "div"){
            container4.style.display = "block";
        }else{
            container4.style.display = "none";
        }
    });

    const saveButton = document.createElement("button");
    saveButton.textContent = "SAVE";
    saveButton.id = "saveButton";
    saveButton.classList.add("modal-measure-button");

    const autoSwitchButton = document.createElement("button");
    autoSwitchButton.textContent = "Auto-Measures →";
    autoSwitchButton.id = "autoSwitchButton";
    autoSwitchButton.classList.add("modal-measure-button");

    //function to check wether we can indeed generate the math signal
    //and then include it in a channel object
    saveButton.addEventListener("click", function(){
        let slotChannel = selectSlotChannel.value;
        let channel1 = selectChannel.value;
        let channel2 = selectSecondChannel.value;
        let operation = selectOperation.value;

        if (operation == "none"){
            showToast("Please select an operation", "toast-error");
        }else{
            if (channel1 == channel2){
                if (operation == "add" || operation == "sub" || operation == "mult" || operation == "div"){
                    showToast("Please select two different channels", "toast-error");
                }else{
                    updateGeneratedMathSignalsData(slotChannel, channel1, channel2, operation);
                    clearModal();
                    populateModalForMeasure_MATHS();
                }
            }else{
                updateGeneratedMathSignalsData(slotChannel, channel1, channel2, operation);
                clearModal();
                populateModalForMeasure_MATHS();
            }
        };
    });
    
    //this section is to display the currently generated math signals
    //and offer the opportunity to the user delete one if he wants to
    const generatedSignalsDiv = document.createElement("div");

    const generatedSignals = []
    Object.keys(channelData).forEach(key => {
        if (channelData[key].type == "generatedData"){
            generatedSignals.push(key);
        }
    });

    if (generatedSignals.length != 0){
        const generatedSignalsTitle = document.createElement("h6");
        generatedSignalsTitle.textContent = "Maths Channels in-use : ";
        generatedSignalsDiv.appendChild(generatedSignalsTitle);

        generatedSignals.forEach(signal => {
            const signalSpan = document.createElement("span");
            const signalText = document.createElement("p");
            const deleteButton = document.createElement("button");

            signalSpan.classList.add("generated-signal");
            signalText.textContent = signal + " → ";
            deleteButton.textContent = "X";
            deleteButton.classList.add("delete-button");

            signalSpan.appendChild(signalText);
            signalSpan.appendChild(deleteButton);
            generatedSignalsDiv.appendChild(signalSpan);

            deleteButton.addEventListener("click", function(){
                delete channelData[signal];
                signalSpan.remove();

                channelButton = document.getElementById(signal);

                channelButton.className = "channel-not-displayed";
                config.numChannels -= 1;

                clearModal();
                populateModalForMeasure_MATHS();
            });
        });
    };

    autoSwitchButton.addEventListener("click", function(){
        console.log("switch to auto-measurements")
        clearModal();
        populateModalForMeasure_AUTO();
    });

    modalContentDiv.appendChild(saveButton);
    if (generatedSignals.length != 0){modalContentDiv.appendChild(generatedSignalsDiv);};
    modalContentDiv.appendChild(autoSwitchButton);
};

function populateModalForTrigger(){
    console.log("Trigger settings : ", triggerOptions);
    let modalContentDiv = document.getElementById("modal-generated-content");

    const triggerOnOffOptions = [
        {value: "off", text: "Off"},
        {value: "on", text: "On"},
    ]

    const triggerModeOptions = [
        {value: "edge", text: "Edge-Trigger"},
        {value: "window", text: "Window-Trigger"},
    ]

    const triggerChannelOptions = [];
    Object.keys(channelData).forEach(key => {
        let channelNumber = parseInt(key.substring(2), 10)
        triggerChannelOptions.push({value: key, text: "Channel " + channelNumber});
    });

    const triggerSlopeOptions = [
        {value: "both", text: "Both"},
        {value: "rising", text: "Rising"},
        {value: "falling", text: "Falling"},
    ]

    const title = document.createElement("h5");
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
    WindowLevelMaxInput.classList.add("modal-select-trigger");
    WindowLevelMaxInput.id = "WindowLevelMaxInput";
    modalContentDiv.appendChild(WindowLevelMaxInput);

    if (triggerOptions.triggerMode == "edge"){
        WindowLevelMinInput.disabled = true;
        WindowLevelMaxInput.disabled = true;
        TriggerLevelInput.disabled = false;
    }else{
        WindowLevelMinInput.disabled = false;
        WindowLevelMaxInput.disabled = false;
        TriggerLevelInput.disabled = true;
    }

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

function populateModalForCursors(){
    console.log("Setting up the modal for the cursors options");
    let modalContentDiv = document.getElementById("modal-generated-content");

    const horizontalOptions = [
        {text: "On", value: "true"},
        {text: "Off", value: "false"}
    ];

    const verticalOptions = [
        {text: "On", value: "true"},
        {text: "Off", value: "false"}
    ];

    const valueOptions = [
        {text: "On cursor", value: "oncursor"},
        {text: "In display", value: "indisplay"}
    ];

    const title = document.createElement("h5");
    title.innerHTML = "Cursor Options";
    modalContentDiv.appendChild(title);

    const container1 = document.createElement("span");

    const label1 = document.createElement("label");
    label1.textContent = "Horizontal : ";
    container1.appendChild(label1);

    const selectHorizontal = createSelect(horizontalOptions);
    selectHorizontal.id = "selectHorizontal";
    selectHorizontal.value = cursorOptions.isHorizontalCursorOn;
    container1.appendChild(selectHorizontal);

    selectHorizontal.addEventListener("change", function(){
        cursorOptions.isHorizontalCursorOn = this.value;
        toggleDisplayForHorizontalCursorScrollers();
    });

    modalContentDiv.appendChild(container1);
    const container2 = document.createElement("span");

    const label2 = document.createElement("label");
    label2.textContent = "Vertical : ";
    container2.appendChild(label2);

    const selectVertical = createSelect(verticalOptions);
    selectVertical.id = "selectVertical";
    selectVertical.value = cursorOptions.isVerticalCursorOn;
    container2.appendChild(selectVertical);

    selectVertical.addEventListener("change", function(){
        cursorOptions.isVerticalCursorOn = this.value;
        toggleDisplayForVerticalCursorScrollers();
    });

    modalContentDiv.appendChild(container2);
    const container3 = document.createElement("span");

    const label3 = document.createElement("label");
    label3.textContent = "Value : ";
    container3.appendChild(label3);

    const selectValue = createSelect(valueOptions);
    selectValue.id = "selectValue";
    selectValue.value = cursorOptions.cursorsValueDisplay;
    container3.appendChild(selectValue);

    selectValue.addEventListener("change", function(){
        cursorOptions.cursorsValueDisplay = this.value;
    });

    modalContentDiv.appendChild(container3);

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset Cursors";
    resetButton.id = "resetButton";
    resetButton.classList.add("modal-measure-button");

    modalContentDiv.appendChild(resetButton);

    resetButton.addEventListener("click", function(){
        console.log("Reset the cursors.");
        cursorOptions.isVerticalCursorOn = "false";
        cursorOptions.isHorizontalCursorOn = "false";
        cursorOptions.cursorsValueDisplay = "oncursor";
        cursorOptions.horizontalAPoistion = 266;
        cursorOptions.horizontalBPosition = 533;
        cursorOptions.verticalAPosition = 400;
        cursorOptions.verticalBPosition = 800;
    });
};

/*
╔══════════════════════════════════════════════════════╗
║                UI INTERACTIONS HANDLERS              ║
╚══════════════════════════════════════════════════════╝
*/

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

                document.getElementById('scroller').style.top = '395px';
                document.getElementById('scroller').style.backgroundColor = "gray";
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

let isVerticalMouseDownListenerSet = false;
let isHorizontalMouseDownListenerSet = false;

function toggleDisplayForVerticalCursorScrollers(){
    console.log(`Current value for 'cursorOptions.isVerticalCursorOn' : ${cursorOptions.isVerticalCursorOn} | Type : ${typeof cursorOptions.isVerticalCursorOn}`);

    const scrollerA = document.getElementById("vertical-scroller-A");
    const scrollerB = document.getElementById("vertical-scroller-B");
    const scrollBar = document.getElementById("scrollbar-horizontal");
    let isDragging = false;
    let currentMoveListener = null;
    let currentUpListener = null;

    function onMouseMoveScrollerVertical(scroller, startX, whichCursor){
        return function(event) {
            let newX = event.clientX - startX;
            newX = Math.max(newX, 0);
            newX = Math.min(newX, scrollBar.clientWidth - scroller.clientWidth);
            scroller.style.left = newX + 'px';
            if (whichCursor == "A"){
                cursorOptions.verticalAPosition = newX + ((parseInt(window.getComputedStyle(scrollerA).width)) / 2);
            }else{
                cursorOptions.verticalBPosition = newX + ((parseInt(window.getComputedStyle(scrollerB).width)) / 2);
            }
        };
    }

    function onMouseUpScrollerVertical(){
        if (!isDragging) return;
        isDragging = false;
        console.log("Mouse released");

        document.removeEventListener('mousemove', currentMoveListener);
        document.removeEventListener('mouseup', currentUpListener);
        currentMoveListener = null;
        currentUpListener = null;
    }

    function setupDragListeners(scroller, whichCursor) {
        scroller.addEventListener('mousedown', function(event) {
            if (isDragging) return; // Prevents adding multiple listeners during an active drag
            console.log("Mouse click on scroller", scroller.id);
            isDragging = true;
            let startX = event.clientX - scroller.getBoundingClientRect().left + scrollBar.getBoundingClientRect().left;

            currentMoveListener = onMouseMoveScrollerVertical(scroller, startX, whichCursor);
            currentUpListener = onMouseUpScrollerVertical;

            document.addEventListener('mousemove', currentMoveListener);
            document.addEventListener('mouseup', currentUpListener);
        });
    }

    if (cursorOptions.isVerticalCursorOn === "true"){
        console.log("Show the scrollers for the vertical cursors");
        scrollerA.style.display = "block";
        scrollerA.style.left = (cursorOptions.verticalAPosition - (parseInt(window.getComputedStyle(scrollerA).width)) / 2) + "px";
    
        scrollerB.style.display = "block";
        scrollerB.style.left = (cursorOptions.verticalBPosition - (parseInt(window.getComputedStyle(scrollerB).width)) / 2) + "px";

        if (!isVerticalMouseDownListenerSet){
            setupDragListeners(scrollerA, "A");
            setupDragListeners(scrollerB, "B");
        }

        isVerticalMouseDownListenerSet = true;
    } else {
        console.log("Hide the scrollers for the vertical cursors");
        // Hide scrollers (A & B)
        scrollerA.style.display = "none";
        scrollerB.style.display = "none";
    }
};

function toggleDisplayForHorizontalCursorScrollers(){
    console.log(`Current value for 'cursorOptions.isHorizontalCursorOn' : ${cursorOptions.isHorizontalCursorOn} | Type : ${typeof cursorOptions.isHorizontalCursorOn}`);

    const scrollerA = document.getElementById("scroller-horizontal-A");
    const scrollerB = document.getElementById("scroller-horizontal-B");
    const scrollBar = document.getElementById("scroll-bar-horizontal-cursors");
    let isDragging = false;
    let currentMoveListener = null;
    let currentUpListener = null;

    function onMouseMoveScrollerHorizontal(scroller, startY, whichCursor){
        return function(event) {
            let newY = event.clientY - startY;
            newY = Math.max(newY, 0);
            newY = Math.min(newY, scrollBar.clientHeight - scroller.clientHeight);
            scroller.style.top = newY + 'px';
            if (whichCursor == "A"){
                cursorOptions.horizontalAPosition = newY + ((parseInt(window.getComputedStyle(scrollerA).height)) / 2);
            }else{
                cursorOptions.horizontalBPosition = newY + ((parseInt(window.getComputedStyle(scrollerA).height)) / 2);
            }
        };
    };

    function onMouseUpScrollerHorizontal(){
        if (!isDragging) return;
        isDragging = false;
        console.log("Mouse released");

        document.removeEventListener('mousemove', currentMoveListener);
        document.removeEventListener('mouseup', currentUpListener);
        currentMoveListener = null;
        currentUpListener = null;
    };

    function setupDragListeners(scroller, whichCursor) {
        scroller.addEventListener('mousedown', function(event) {
            if (isDragging) return; // Prevents adding multiple listeners during an active drag
            console.log("Mouse click on scroller", scroller.id);
            isDragging = true;
            let startY = event.clientY - scroller.getBoundingClientRect().top + scrollBar.getBoundingClientRect().top;

            currentMoveListener = onMouseMoveScrollerHorizontal(scroller, startY, whichCursor);
            currentUpListener = onMouseUpScrollerHorizontal;

            document.addEventListener('mousemove', currentMoveListener);
            document.addEventListener('mouseup', currentUpListener);
        });
    }

    if (cursorOptions.isHorizontalCursorOn === "true"){
        console.log("Show the scrollers for the horizontal cursors");
        scrollerA.style.display = "block";
        scrollerA.style.top = (cursorOptions.horizontalAPosition - (parseInt(window.getComputedStyle(scrollerA).height)) / 2) + "px";
    
        scrollerB.style.display = "block";
        scrollerB.style.top = (cursorOptions.horizontalBPosition - (parseInt(window.getComputedStyle(scrollerB).height)) / 2) + "px";

        if (!isHorizontalMouseDownListenerSet){
            setupDragListeners(scrollerA, "A");
            setupDragListeners(scrollerB, "B");
        }

        isHorizontalMouseDownListenerSet = true;
    } else {
        console.log("Hide the scrollers for the horizontal cursors");
        // Hide scrollers (A & B)
        scrollerA.style.display = "none";
        scrollerB.style.display = "none";
    }
};

/*
╔══════════════════════════════════════════════════════╗
║           INFORMATION COMPUTING & DISPLAY            ║
╚══════════════════════════════════════════════════════╝
*/

function getTimeScale(timeInSeconds){
    let scale;
    let value;

    //convert timeInSeconds to ms as a base unit to simplify the logic of the function
    const microseconds = timeInSeconds * 1e6;

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

function getTimePerDiv() { 
    const totalSamplingTime = config.samplesPerFrame * 1e-8;
    const timePerDivision = (totalSamplingTime / config.horizontalDivisions) * (horizontalScale / 50);//we have to divide by 50 because the default value of the input is 50 which corresponds to 1 : no scaling
    
    const resultScaled = getTimeScale(timePerDivision);
    return resultScaled;
};

//converts a voltage to the equivalent absolute raw value of a 14-bit ADC
function mapVoltageToRaw(voltage) {
    return (voltage + (config.voltage / 2)) / config.voltage * config.maxSampleValue;
};

function getTimeBetweenCursors(pixelsBetweenCursors){
    const totalSamplingTime = config.samplesPerFrame * 1e-8;
    const sizeOfOneDivisionInPixels = CANVAS.width / config.horizontalDivisions;
    const DivisionsBetweenCursors = pixelsBetweenCursors / sizeOfOneDivisionInPixels;
    
    const TimeBetweenCursors = totalSamplingTime * (DivisionsBetweenCursors / config.horizontalDivisions) * (horizontalScale / 50);

    const resultScaled = getTimeScale(TimeBetweenCursors);
    return resultScaled;
};

function getMillivoltsBetweenCursors(pixelsBetweenCursors){
    //If a channel is focused then we get the mv/div of this one.
    let result = {value: "No channel", scale: "selected"};

    Object.keys(channelData).forEach(key => {
        if(channelData[key].focused){
            const sizeOfOneDivisionInPixels = CANVAS.height / config.verticalDivisions;
            const milliVoltsPerDivision = getMilliVoltsPerDiv(channelData[key].verticalScale);
            const milliVoltsBetweenCursors = (pixelsBetweenCursors / sizeOfOneDivisionInPixels) * milliVoltsPerDivision;
            result =  {value: milliVoltsBetweenCursors.toFixed(1), scale: "mV"};
        }
    });
    //If not, we just return "NA" until the user selects a certain channel. 
    return result;
};

function getMilliVoltForACursor(cursorPosition){
    let result = {value: "No channel", scale: "selected"};

    Object.keys(channelData).forEach(key => {
        if(channelData[key].focused){
            const sizeOfOneDivisionInPixels = CANVAS.height / config.verticalDivisions;
            const milliVoltsPerDivision = getMilliVoltsPerDiv(channelData[key].verticalScale);
            if (cursorPosition == (CANVAS.height / 2)){
                result = {value: "0", scale: "mV"};
            }else if (cursorPosition > (CANVAS.height / 2)){//negative values
                const cursorValue = ((cursorPosition - (CANVAS.height / 2)) / sizeOfOneDivisionInPixels) * milliVoltsPerDivision;
                result = {value: -cursorValue.toFixed(1), scale: "mV"}
            }else if (cursorPosition < (CANVAS.height / 2)){//positive values
                const cursorValue = (((CANVAS.height / 2) - cursorPosition) / sizeOfOneDivisionInPixels) * milliVoltsPerDivision;
                result = {value: cursorValue.toFixed(1), scale: "mV"}
            }
        }
    });

    return result;
};

function getTimeForACursor(cursorPosition){
    const totalSamplingTime = config.samplesPerFrame * 1e-8; // Total time for all divisions.
    const sizeOfOneDivisionInPixels = CANVAS.width / config.horizontalDivisions; // Pixel width of one division.

    // Calculate how many divisions the cursor is from the left of the canvas.
    const divisionsFromLeft = cursorPosition / sizeOfOneDivisionInPixels;

    // Calculate the time at the cursor position using the proportion of the total time.
    const timeAtCursor = totalSamplingTime * (divisionsFromLeft / config.horizontalDivisions) * (horizontalScale / 50);

    const resultScaled = getTimeScale(timeAtCursor);
    return resultScaled;
};

function setScreenInformation(){
    //insert time scale to the screen
    const timePerDiv = getTimePerDiv();
    document.getElementById('tpdiv-value').innerHTML = timePerDiv.value + ' ' + timePerDiv.scale + '/div';
    //console.log(`Time per division is : ${timePerDiv.value} ${timePerDiv.scale}`);

    Object.keys(channelData).forEach(key => {
        const voltsPerDiv = getMilliVoltsPerDiv(channelData[key].verticalScale);
        let channelNumber = parseInt(key.substring(2), 10);
        if (voltsPerDiv > 1000){
            document.getElementById('mes-CH' + channelNumber).innerHTML = (voltsPerDiv / 1000).toFixed(2) + ' V/dv';
        }else{
            document.getElementById('mes-CH' + channelNumber).innerHTML = voltsPerDiv + ' mv/dv';
        }
        document.getElementById('mes-CH' + channelNumber).style.color = channelData[key].colorDark;
    });

    if (triggerOptions.isTriggerOn == "on"){
        if (triggered){
            TRIGGER.style.color = "lightgreen"
        }else{
            TRIGGER.style.color = "chocolate"
        }
    }else{
        TRIGGER.style.color = "#e2e2e2"//white
    }

    //This section is about the auto-measures display.
    //These are put on screen below the voltages display.
    valuesToDisplay = []; // format inside : {text: "textToDisplay", color: "colorOfTheChannel", value: "valueToDisplay"}

    let min, max//we declare them here to reuse in case vpp and either min or max are set, it prevent another call to the function.
    
    
    if (autoMeasureOptions.vpp.set){// get min, max, vpp
        min = autoMeasures.getMinValue(channelData[autoMeasureOptions.associatedChannel].points);
        max = autoMeasures.getMaxValue(channelData[autoMeasureOptions.associatedChannel].points);
        let vpp = autoMeasures.getVppValue(channelData[autoMeasureOptions.associatedChannel].points);

        valuesToDisplay.push({
            text: "Vpp", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: vpp.toFixed(1) + "mV",
            id: "vpp-measure",
        });
    };

    if (autoMeasureOptions.min.set){// get only min
        if (min == undefined){
            min = autoMeasures.getMinValue(channelData[autoMeasureOptions.associatedChannel].points);
        }
        valuesToDisplay.push({
            text: "Min", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: min.toFixed(1) + "mV",
            id: "min-measure",
        });
    };

    if (autoMeasureOptions.max.set){// get only max
        if (max == undefined){
            max = autoMeasures.getMaxValue(channelData[autoMeasureOptions.associatedChannel].points);
        }
        valuesToDisplay.push({
            text: "Max", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: max.toFixed(1) + "mV",
            id: "max-measure",
        });
    };

    if (autoMeasureOptions.mean.set){// get avg value
        let mean = autoMeasures.getMeanValue(channelData[autoMeasureOptions.associatedChannel].points);
        valuesToDisplay.push({
            text: "Avg", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: mean.toFixed(1) + "mV",
            id: "avg-measure",
        });
    };

    if (autoMeasureOptions.mid.set){// get middle value
        let middle = autoMeasures.getMiddleValue(channelData[autoMeasureOptions.associatedChannel].points);
        valuesToDisplay.push({
            text: "Mid", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: middle.toFixed(1) + "mV",
            id: "mid-measure",
        });
    };

    if (autoMeasureOptions.rms.set){// get rms value
        let rms = autoMeasures.getRMS(channelData[autoMeasureOptions.associatedChannel].points);
        valuesToDisplay.push({
            text: "RMS", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: rms.toFixed(1) + "mV",
            id: "rms-measure",
        });
    };

    function formatFrequency(frequency) {
        if (frequency >= 1e9) {  // gte to 1 Gigahertz
            return (frequency / 1e9).toFixed(1) + " GHz";
        } else if (frequency >= 1e6) {  // gte to 1 Megahertz
            return (frequency / 1e6).toFixed(1) + " MHz";
        } else if (frequency >= 1e3) {  // gte to 1 Kilohertz
            return (frequency / 1e3).toFixed(1) + " kHz";
        } else {
            return frequency.toFixed(1) + " Hz";  // lt 1 Kilohertz, display in Hertz (Very very very unlikely but still, we never know)
        }
    }

    if (autoMeasureOptions.freq.set){// get avg frequency
        let freq = autoMeasures.getAverageFrequency(channelData[autoMeasureOptions.associatedChannel].points, config.frequency);
        valuesToDisplay.push({
            text: "Freq", 
            color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
            value: formatFrequency(freq),
            id: "avg-freq-measure",
        });
    };

    if (autoMeasureOptions.highFreq.set || autoMeasureOptions.lowFreq.set){// get min and max frequencies
        let freqs = autoMeasures.getFrequenciesMaxMin(channelData[autoMeasureOptions.associatedChannel].points, config.frequency);
        if (autoMeasureOptions.highFreq.set){// high freq
            valuesToDisplay.push({
                text: "Max Freq", 
                color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
                value: formatFrequency(freqs.highestFrequency),
                id: "max-freq-measure",
            });
        };

        if (autoMeasureOptions.lowFreq.set){//low freq
            valuesToDisplay.push({
                text: "Min Freq", 
                color: channelData[autoMeasureOptions.associatedChannel].colorDark, 
                value: formatFrequency(freqs.lowestFrequency),
                id: "min-freq-measure",
            });
        };
    };

    //now we inject the calculated values to the html page.
    const valuesContainer = document.getElementById('auto-measures-display');
    valuesContainer.querySelectorAll('p').forEach(p => p.style.display = 'none');
    for (let i = 0; i < valuesToDisplay.length; i++) {
        let paragraph = document.getElementById(valuesToDisplay[i].id);
        paragraph.style.display = 'block';
        paragraph.style.color = valuesToDisplay[i].color;
        paragraph.style.borderColor = valuesToDisplay[i].color;
        paragraph.textContent = valuesToDisplay[i].text + " : " + valuesToDisplay[i].value;
    };
};

function generatePoints(channelKey){
    const originChannel1 = channelData[channelKey].originChannel1;
    const originChannel2 = channelData[channelKey].originChannel2;
    const operation = channelData[channelKey].operation;

    if (operation == "squared"){
        const pointsSquared = channelData[originChannel1].points.map(point => {
            const voltage = autoMeasures.voltage_from_raw(point);
            const squaredVoltage = voltage * voltage;
            return mapVoltageToRaw(squaredVoltage);
        });

        channelData[channelKey].points = pointsSquared;
        return
    };

    if (operation == "deriv"){
        function getDerivative(points) {
            let derivative = [];
            for (let i = 0; i < points.length - 1; i++) {
                difference = points[i + 1] - points[i];
                //Since the derivative show the difference between two points on the graph we need to add the equivalent of 1/2 the height of the graph 
                //so that it doesn't start being drawn at the bottom of the screen.
                derivative[i] = difference + 8191;
            }
            return derivative;
        };
        
        channelData[channelKey].points = getDerivative(channelData[originChannel1].points);
        return
    }

    if (operation == "integral"){
    
        function getIntegral(points) {
            const scale = 1e5; //arbitratry scaling factor which has to be added in order to work with the types of values we have. Without it the integral curve will never display any real variations unless we're talking spikes from -1 to +1 V on the data..
            const deltaTime = 10e-9 * scale;
            let integralValues = [];
            let currentIntegral = 8192;
        
            for (let i = 0; i < points.length - 1; i++) {
                let voltage1 = points[i];
                let voltage2 = points[i+1];
                currentIntegral += (voltage2 + voltage1) / 2 * deltaTime;
                integralValues.push(currentIntegral);
            }
            return integralValues;
        }
        
        channelData[channelKey].points = getIntegral(channelData[originChannel1].points);
        return
    };

    if (operation == "fft") {
        function fillArrayToNextPowerOfTwo(array) {
            // check if the length of the array is already a power of two
            function isPowerOfTwo(n) {
                return n && (n & (n - 1)) === 0;
            }
        
            let targetLength = array.length;
            if (!isPowerOfTwo(targetLength)) {
                // if not a power of two, find the next power of two
                targetLength = Math.pow(2, Math.ceil(Math.log2(targetLength)));
                // fill the array with zeros until it reaches the target length
                while (array.length < targetLength) {
                    array.push(0);
                }
            }
        
            return array;
        }

        function calculateFFT(points, sampleRate) {
            //===============================================================
            // FFT calculation - credit : https://github.com/indutny/fft.js/
            //===============================================================
            const fft = new FFT(points.length);
        
            const complexInput = fft.toComplexArray(points);
            const complexOutput = fft.createComplexArray();
        
            fft.realTransform(complexOutput, complexInput);
            fft.completeSpectrum(complexOutput);
        
            const magnitudes = complexOutput.map((value, index) => {
                if (index % 2 === 0) {
                    // even index, real part
                    const re = value;
                    // odd index, imaginary part (since the array is [re, im, re, im, ...]) => see fft.js doc
                    const im = complexOutput[index + 1];
                    return Math.sqrt(re * re + im * im);
                }
                return null;
            })

            const displayData = magnitudes.map((magnitude, index) => {
                const frequency = index * sampleRate / points.length;
                return { frequency: frequency, magnitude: magnitude };
            });
        
            const halfDisplayData = displayData.slice(0, displayData.length / 2);
            return halfDisplayData;
        }
        //we have to fill the gaps in the array until the next power of 2 (required by the library)
        let tempOriginChannel = channelData[originChannel1];
        channelData[channelKey].points = fillArrayToNextPowerOfTwo(tempOriginChannel.points);
        channelData[channelKey].points = calculateFFT(channelData[channelKey].points, config.frequency);

        channelData[channelKey].verticalScale = 2.5; // We set the vertical scale to 2.5 to make the fft thinner than other signals. This can still be modified by the user oc.
        return
    };

    if (operation == "add"){
        const points1 = channelData[originChannel1].points;
        const points2 = channelData[originChannel2].points;
        const pointsAdded = points1.map((point, index) => {
            point = autoMeasures.voltage_from_raw(point);
            let point2 = autoMeasures.voltage_from_raw(points2[index]);
            return mapVoltageToRaw(point + point2).toFixed(0);
        });
        channelData[channelKey].points = pointsAdded;
    };

    if (operation == "mult"){
        const points1 = channelData[originChannel1].points;
        const points2 = channelData[originChannel2].points;
        const pointsMultiplied = points1.map((point, index) => {
            point = autoMeasures.voltage_from_raw(point);
            let point2 = autoMeasures.voltage_from_raw(points2[index]);
            return mapVoltageToRaw(point * point2).toFixed(0);
        });
        channelData[channelKey].points = pointsMultiplied;
    };

    if (operation == "sub"){
        const points1 = channelData[originChannel1].points;
        const points2 = channelData[originChannel2].points;
        const pointsSubtracted = points1.map((point, index) => {
            point = autoMeasures.voltage_from_raw(point);
            let point2 = autoMeasures.voltage_from_raw(points2[index]);
            return mapVoltageToRaw(point - point2).toFixed(0);
        });
        channelData[channelKey].points = pointsSubtracted;
    };

    if (operation == "div"){
        const points1 = channelData[originChannel1].points;
        const points2 = channelData[originChannel2].points;
        const pointsDivided = points1.map((point, index) => {
            point = autoMeasures.voltage_from_raw(point);
            let point2 = autoMeasures.voltage_from_raw(points2[index]);
            if (point2 === 0){
                return 8192;// = 0V 
            }else{
                return mapVoltageToRaw(point / point2).toFixed(0);
            }
        });
        channelData[channelKey].points = pointsDivided;
    };
};

function calculateAutoMeasures(){
    //converts an absolute value (from 0 to 16383) to the corresponding voltage value (-1.1 to +1.1v or else if the config changes).
    function voltage_from_raw(raw_value, max_raw=config.maxSampleValue){
        let voltage_range = [-(config.voltage/2), config.voltage/2]
        let span = voltage_range[1] - voltage_range[0]
        normalized = raw_value / max_raw
        return voltage_range[0] + (normalized * span)
    };

    function getMinValue(points){
        let minAbsValue = Math.min(...points); // get smallest value from array
        minAbsValue = voltage_from_raw(minAbsValue); //convert abs value to V
        return minAbsValue * 1000;//convert V to mV
    }

    function getMaxValue(points){
        let maxAbsValue = Math.max(...points); // get biggest value from array
        maxAbsValue = voltage_from_raw(maxAbsValue); //convert abs value to V
        return maxAbsValue * 1000;//convert V to mV
    }

    function getVppValue(points){
        const maxVoltage = getMinValue(points);//mV
        const minVoltage = getMaxValue(points);//mV
        const vpp = maxVoltage - minVoltage;//mV
        return vpp;
    }

    function getMeanValue(points){
        const average = getMedian(points);//Get the average abs value of the array
        const averageInVolts = voltage_from_raw(average); //convert abs value to V
        return averageInVolts * 1000;//convert V to mV
    }

    function getMiddleValue(points){
        let middleAbs = Math.round(points.length / 2); //get the middle of the point array
        middleInVolts = voltage_from_raw(points[middleAbs]);//convert the value in volts
        return middleInVolts * 1000; //convert V to mV
    }

    function getRMS(points){
        let sum = 0;
        points.forEach(point => {//add each point squared to the total sum
            sum += point * point;
        });
        const rmsAbs = Math.sqrt(sum / points.length);//take the square root of the average of the points
        const rmsInVolts = voltage_from_raw(rmsAbs);//convert the value in volts
        return rmsInVolts * 1000;//convert final value to mV
    }

    function getAverageFrequency(points, sampleRate) {
        const threshold = calculateThreshold(points); // Define a suitable threshold
        let cycleCount = 0;
        let isInCycle = false;
    
        for (let i = 0; i < points.length; i++) {
            if (points[i] > threshold && !isInCycle) {
                cycleCount++;  // start of a new cycle
                isInCycle = true;
            } else if (points[i] < threshold && isInCycle) {
                isInCycle = false;  // end of a cycle
            }
        }
        const totalDuration = points.length / sampleRate;  // total duration in seconds (sample rate will be at 1e8 Hz since agata has a sampling period of 10ns)
        return cycleCount / totalDuration;  // average frequency in Hz
    }
    
    function calculateThreshold(points) {
        let mean = points.reduce((acc, val) => acc + val, 0) / points.length;
        let sumOfSquares = points.reduce((acc, val) => acc + (val - mean) ** 2, 0);
        let standardDeviation = Math.sqrt(sumOfSquares / points.length);
        return mean + standardDeviation;  // Threshold at mean + 1 SD
    }

    function getFrequenciesMaxMin(points, sampleRate) {
        const threshold = calculateThreshold(points);
        let cycleStart = null;
        let frequencies = [];
    
        for (let i = 0; i < points.length; i++) {
            if (points[i] > threshold && cycleStart === null) {
                cycleStart = i;  //new cycle
            } else if ((points[i] < threshold || i === points.length - 1) && cycleStart !== null) {
                const cycleEnd = i;
                const cycleDuration = (cycleEnd - cycleStart) / sampleRate;  // one cycle in seconds
                if (cycleDuration > 0) {  // avoid division by zero
                    const frequency = 1 / cycleDuration;
                    frequencies.push(frequency);
                }
                cycleStart = null;  // look for new cycle in the next loop
            }
        }
    
        if (frequencies.length === 0) {
            return {lowestFrequency: 0, highestFrequency: 0};  // no cycles found
        }
    
        const lowestFrequency = Math.min(...frequencies);
        const highestFrequency = Math.max(...frequencies);
    
        return {
            lowestFrequency: lowestFrequency,
            highestFrequency: highestFrequency
        };
    }

    return {getMinValue, getMaxValue, getVppValue, getMeanValue, getMiddleValue, getRMS, getAverageFrequency, getFrequenciesMaxMin, voltage_from_raw};
};

function getMilliVoltsPerDiv(channelVerticalScale) {
    const totalVoltageRange = config.voltage; //voltage range we get from the settings (-V to +V)
    const verticalDivisions = config.verticalDivisions;

    const voltsPerDivision = totalVoltageRange / (verticalDivisions * channelVerticalScale); 

    return (voltsPerDivision * 1000).toFixed(1);
};

function updateGeneratedMathSignalsData(slotChannel, channel1, channel2, operation){
    //console.log(`Updating math signal in slot ${slotChannel} for the operation : ${operation} between ${channel1} and ${channel2}`);

    channelData[slotChannel] = {
        points: [],
        display: true,
        type: "generatedData",
        focused: false,
        colorDark: channelsMetaData[slotChannel].colorDark,
        colorLight: channelsMetaData[slotChannel].colorLight,
        verticalOffset: 0,
        verticalScale: 1,
        verticalOffsetRelativeCursorPosition: 395,
        //these attributes are specific to generated signals from a function
        originChannel1: channel1,
        originChannel2: channel2,//none if operation does not require 2 channels
        operation: operation,
    };

    //Here we set the button styles to make it show up as available
    channelButton = document.getElementById(slotChannel);

    channelButton.classList.remove("channel-not-displayed");
    channelButton.classList.add("channel-displayed");
    channelButton.classList.add(channelData[slotChannel].colorDark);

    //we update the global config to reflect the new channel
    config.numChannels += 1;
};

function toggleMeasurement(measureKey, buttonId) {
    let measure = autoMeasureOptions[measureKey];
    if (measure) {
        measure.set = !measure.set; // Toggle the 'set' value
        //change button class depending on wether the measure is set or not
        document.getElementById(buttonId).className = measure.set ? 'modal-measure-button active-measure-button' : 'modal-measure-button inactive-measure-button';
        console.log(`${measureKey} set to ${measure.set}`);
    }
};

function resetMeasurements(){
    try{
        autoMeasureOptions.associatedChannel = "CH1";
        Object.keys(autoMeasureOptions).forEach(key => {
            if (key !== "associatedChannel") {
                autoMeasureOptions[key].set = false;
                autoMeasureOptions[key].value = null;
                document.querySelectorAll('.modal-measure-button').forEach(button => {
                    button.className = 'modal-measure-button inactive-measure-button';
                });
            }
        });
        document.getElementById("selectChannel").value = "CH1";
    
        showToast("Auto Measurements values reset !", "toast-info");
    } catch (error) {
        console.error('Failed to reset measurements', error);
        showToast("Error while resetting the measurements..", "toast-error");
    }
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

/*
╔══════════════════════════════════════════════════════╗
║                  INFORMATION EXPORT                  ║
╚══════════════════════════════════════════════════════╝
*/

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

/*
╔══════════════════════════════════════════════════════╗
║                    TRIGGER FUNCTION                  ║
╚══════════════════════════════════════════════════════╝
*/

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
                    //console.log("Point Value exceeds trigger level ! ");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                };
            }else{ //if the trigLevel is negative
                if (channelPoints[i] < trigLevelEdge){
                    //console.log("Point Value exceeds trigger level ! ");
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
                    //console.log("Point value is within the trigger window !");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                }
            }else{
                if (channelPoints[i] < trigLevelWindowMin && channelPoints[i] > trigLevelWindowMax){
                    //console.log("Point value is within the trigger window !");
                    isTriggerValueReached = true;
                    triggerValueIndex = i;
                    break
                }
            }
        };
    };

    //Now if the triggerLevel has been exceeded, we check if the slope is in accord with what the user selected.

    if (!isTriggerValueReached){//no need to check the slope type if the value hasn't been exceeded.
        return false;
    }
    
    function getHundredItemsBeforeAfter(array, index) {
        let before = [];
        let after = [];
        for (let j = index - 1; j >= Math.max(0, index - 100); j--) {
            before.push(array[j]);
        }
        for (let j = index + 1; j <= Math.min(array.length - 1, index + 100); j++) {
            after.push(array[j]);
        }
        return { before, after };
    }

    let medians = getHundredItemsBeforeAfter(channelPoints, triggerValueIndex);
    let medianBeforeTriggerPoint = getMedian(medians['before']);
    let medianAfterTriggerPoint = getMedian(medians['after']);

    if (triggerOptions.triggerSlope != "both"){
        if (medianBeforeTriggerPoint > medianAfterTriggerPoint){
            currentSlope = "falling"
        }else if (medianBeforeTriggerPoint < medianAfterTriggerPoint){
            currentSlope = "rising"
        }
    }else{
        currentSlope = "both"
    }

    //finally we return the boolean to state wether or not to stop the image according to the checks we did.
    if (isTriggerValueReached && currentSlope == triggerOptions.triggerSlope){
        return true;
    }else{
        return false;
    }
};

/*
╔══════════════════════════════════════════════════════╗
║                    AUTOSET FUNCTION                  ║
╚══════════════════════════════════════════════════════╝
*/

function autoset(){
    function updateCursorPosition(channel) {
        let totalHeight = document.getElementById("scroll-bar").clientHeight - scroller.clientHeight;
        let percent = (channel.verticalOffset / 1000) + 0.5; // reverse offset mapping
        let newY = percent * totalHeight;
    
        newY = Math.max(newY, 0);
        newY = Math.min(newY, totalHeight);
    
        if (channel.focused){document.getElementById("scroller").style.top = newY + 'px';};
        channel.verticalOffsetRelativeCursorPosition = newY;
    }

    //We start by making sure everything is horizontally aligned.
    if (horizontalOffset != 0){
        horizontalOffset = 0;
        document.getElementById("scroller-Horizontal").style.left = ((CANVAS.width / 2) - 10) + 'px';
    };
    if (horizontalScale != 50){
        horizontalScale = 50;
        document.getElementById("horizontal-scaling").value = 50;
    };

    //Now we check every single channel to see if it is fitted within the window or not.
    Object.keys(channelData).forEach(key => {
        if (channelData[key].display == true && channelData[key].operation != "fft"){
            // console.log(`Autosetting this channel [${key}], is displayed and no fft`);

            const channel = channelData[key];
            const highestValuePoint = Math.max(...channel.points);
            const lowestValuePoint = Math.min(...channel.points);

            isSignalClipping = true;
            adjustementsCounter = 0;

            while (isSignalClipping && adjustementsCounter < 15) { //This gives a max of 5 offset adjustements and 10 scaling adjsutements. After which there's no point in trying to autoset.
                previewedYPositionHighestPoint = ((CANVAS.height / 2) - ((highestValuePoint - config.maxSampleValue / 2) * (CANVAS.height / config.maxSampleValue * channel.verticalScale))) + channel.verticalOffset;
                previewedYPositionLowestPoint = ((CANVAS.height / 2) - ((lowestValuePoint - config.maxSampleValue / 2) * (CANVAS.height / config.maxSampleValue * channel.verticalScale))) + channel.verticalOffset;

                //check wether the signal is clipping or not
                if (previewedYPositionHighestPoint < 0 || previewedYPositionLowestPoint > CANVAS.height){
                    // console.log("Signal is clipping ! ");
                    
                    //See if it is possible to simply adjust the offset to make the signal fit
                    if (previewedYPositionHighestPoint < 0 && previewedYPositionLowestPoint > CANVAS.height){
                        // console.log("Can't simply adjust the offset, signal is clipping through both ends !");
                        if (channel.verticalScale > 1){
                            channel.verticalScale = channel.verticalScale - 1;
                        }else{
                            channel.verticalScale = channel.verticalScale / 2;
                        }
                        if (channel.focused){
                            document.getElementById("vertical-scaling").value = channel.verticalScale;
                        }
                    //If the signal is clipping through the top of the screen
                    }else if (previewedYPositionHighestPoint < 0){
                        // console.log("Signal is clipping through the top of the screen.")
                        if (channel.verticalOffset != 0 && adjustementsCounter < 3){//CHANGE 3 TO 5 ONCE SCALING IS FUNCTIONNAL
                            //We first try to offset the signal to make it fit
                            // we add 100 px to the offset every loop max 5 times
                            // console.log("Adding 100 px to offset");
                            channel.verticalOffset += 100;
                            updateCursorPosition(channel);
                        }else {
                            //If the signal is already without any offset, we scale it back
                            if (channel.verticalScale > 1){
                                channel.verticalScale = channel.verticalScale - 1;
                            }else{
                                channel.verticalScale = channel.verticalScale / 2;
                            }
                            if (channel.focused){
                                document.getElementById("vertical-scaling").value = channel.verticalScale;
                            }
                        }
                    //If the signal is clipping through the bottom of the screen
                    }else if (previewedYPositionLowestPoint > CANVAS.height){
                        // console.log("Signal is clipping through the bottom of the screen.")
                        if (channel.verticalOffset != 0 && adjustementsCounter < 3){//CHANGE 3 TO 5 ONCE SCALING IS FUNCTIONNAL
                            //We first try to offset the signal to make it fit
                            // we remove 100 px to the offset every loop max 5 times
                            // console.log("Removing 100 px to offset");
                            channel.verticalOffset -= 100;
                            updateCursorPosition(channel);
                        }else {
                            //If the signal is already without any offset, we scale it back
                            // console.log("Changing the offset did not work, scaling back..");
                            if (channel.verticalScale > 1){
                                channel.verticalScale = channel.verticalScale - 1;
                            }else{
                                channel.verticalScale = channel.verticalScale / 2;
                            }
                            if (channel.focused){
                                document.getElementById("vertical-scaling").value = channel.verticalScale;
                            }
                        }
                    }
                }else{
                    // console.log("No clipping detected.")
                    isSignalClipping = false;
                    break;
                }
                adjustementsCounter += 1;
            }
        };
    });
};

/*
╔══════════════════════════════════════════════════════╗
║                     MISC / GENERAL                   ║
╚══════════════════════════════════════════════════════╝
*/
function showToast(message, status) {
    let toast = document.getElementById("toast");
    toast.innerHTML = message;
    toast.className = "";
    toast.classList.add("show", status);
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
};

function getMedian(array){
    let total = 0;
    for (let i = 0; i < array.length; i++){
        total = total + array[i];
    }
    return total / array.length
};

function formatFrequency(hertz) {
    if (hertz < 1e3) {
        return `${hertz} Hz`;
    } else if (hertz < 1e6) {
        return `${(hertz / 1e3).toFixed(1)} kHz`;
    } else if (hertz < 1e9) {
        return `${(hertz / 1e6).toFixed(1)} MHz`;
    }
}

