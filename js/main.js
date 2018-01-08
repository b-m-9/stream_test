'use strict';


var channel = 'can01';
var ws;

var mediaSource_1 = new MediaSource();
var buffer;
var queue = [];
var canvas = document.querySelector('canvas');

var video = document.getElementById('video');
video.src = window.URL.createObjectURL(mediaSource_1);
video.type = 'video/webm; codecs="opus, vp9"';
video.crossOrigin = 'anonymous';
video.addEventListener('loadedmetadata', () => {
    console.log('----- loadedmetadata');
    if (video.duration === Infinity) {
        video.currentTime = 1e101;
        video.ontimeupdate = function () {
            // video.currentTime = 0;
            video.ontimeupdate = function () {
                // delete video.ontimeupdate;
                // video.play();
            };
        };
    }
});
mediaSource_1.addEventListener('sourceopen', (e) => {

    // mediaSource_1.duration = 0;
    buffer = mediaSource_1.addSourceBuffer('video/webm; codecs="opus, vp9"');

    buffer.onupdateend = function () { // Note: Have tried 'updateend'
        if (queue.length > 0 && !buffer.updating) {
            buffer.appendBuffer(queue.shift());
        }
        console.log('updateend');
    };
    buffer.addEventListener('sourceclose', function (_) {
        console.log('sourceclose');
    });
    buffer.addEventListener('sourceended', function (_) {
        console.log('sourceclose');
    });
    // buffer.addEventListener('updateend', function (_) {
    //
    // });
    buffer.addEventListener('error', function (error) {
        console.log('error', error);
    });
    mediaSource_1.addEventListener('sourceclose', function (_) {
        console.log('mediaSource_1 sourceclose');
    });
    mediaSource_1.addEventListener('sourceended', function (_) {
        console.log('mediaSource_1 sourceended');
    });
    mediaSource_1.addEventListener('error', function (error) {
        console.log('mediaSource_1 error', error);
    });
    mediaSource_1.addEventListener('updateend', function (_) {
        console.log('mediaSource_1 updateend');
    });

    setTimeout(function () {

        start('ws://localhost:12034/?stream=live');
    }, 1000)

}, false);


var mediaSource = new MediaSource();
mediaSource.addEventListener('sourceopen', handleSourceOpen, false);
var mediaRecorder;
var recordedBlobs = [];
var waitStream = true;
var play = false;
var sourceBuffer;

function start(websocketServerLocation) {
    ws = new WebSocket(websocketServerLocation);
    ws.onmessage = function (evt) {
        if (typeof evt.data === 'string' && evt.data === 'start')
            mediaRecorder.start(20);
    };

    ws.onclose = function (event) {
        // Try to reconnect in 5 seconds
        let reason;
        // See http://tools.ietf.org/html/rfc6455#section-7.4.1
        if (event.code === 1000)
            reason = "Normal closure, meaning that the purpose for which the connection was established has been fulfilled.";
        else if (event.code === 1001)
            reason = "An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page.";
        else if (event.code === 1002)
            reason = "An endpoint is terminating the connection due to a protocol error";
        else if (event.code === 1003)
            reason = "An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).";
        else if (event.code === 1004)
            reason = "Reserved. The specific meaning might be defined in the future.";
        else if (event.code === 1005)
            reason = "No status code was actually present.";
        else if (event.code === 1006)
            reason = "The connection was closed abnormally, e.g., without sending or receiving a Close control frame";
        else if (event.code === 1007)
            reason = "An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [http://tools.ietf.org/html/rfc3629] data within a text message).";
        else if (event.code === 1008)
            reason = "An endpoint is terminating the connection because it has received a message that \"violates its policy\". This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy.";
        else if (event.code === 1009)
            reason = "An endpoint is terminating the connection because it has received a message that is too big for it to process.";
        else if (event.code === 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
            reason = "An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn't return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: " + event.reason;
        else if (event.code === 1011)
            reason = "A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.";
        else if (event.code === 1015)
            reason = "The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified).";
        else
            reason = "Unknown reason";
        console.error('ws:', reason);
        console.error('ws:', event);

        setTimeout(function () {
            start(websocketServerLocation)
        }, 5000);
    };
    ws.binaryType = "arraybuffer";
    var websocket2 = new WebSocket('ws://localhost:12034/?stream=get');
    websocket2.binaryType = "arraybuffer";
    websocket2.onopen = function () {
        websocket2.send(JSON.stringify({method: "getmeta", reqid: (new Date()).getTime()}));

    };
    websocket2.onmessage = function (event) {
        if (typeof event.data !== 'string') {
            if (recordedBlobs.length > 40 && !play) {
                play = true;

                setTimeout(function () {
                    video.currentTime = 86400*2;
                    setTimeout(function () {
                        video.currentTime = 86400*3;
                        setTimeout(function () {
                            video.currentTime = 86400*4

                        }, 400);
                    }, 800);
                }, 300);
            }
            recordedBlobs.push(event.data);
            if (buffer.updating || queue.length > 0) {
                queue.push(event.data);
            } else {
                buffer.appendBuffer(event.data);
            }

            if (waitStream) websocket2.send(JSON.stringify({
                method: "getmeta",
                reqid: (new Date()).getTime()
            }));

        } else {
            try {
                let json = JSON.parse(event.data);
                if (json.method && json.method === 'getmeta') {
                    if (json.error.code === 204) {
                        waitStream = false;
                        setTimeout(function () {
                            websocket2.send('ready');
                        }, 1)
                    }
                }
            } catch (e) {
                console.error('ws err:', e);
            }
        }
    };

}

// websocket.onopen = function () {
//     websocket.push(JSON.stringify({
//         open: true,
//         channel: channel
//     }));
// };
// websocket.push = ws.send;
var ff = null;

var gumVideo = document.querySelector('video#gum');

var recordButton = document.querySelector('button#record');
recordButton.onclick = toggleRecording;

// window.isSecureContext could be used for Chrome
var isSecureOrigin = location.protocol === 'https:' ||
    location.hostname === 'localhost';
if (!isSecureOrigin) {
    alert('getUserMedia() must be run from a secure origin: HTTPS or localhost.' +
        '\n\nChanging protocol to HTTPS');
    location.protocol = 'HTTPS';
}

var constraints = {
    audio: true,
    video: {width: 352, height: 240, frameRate: 30}
};

function handleSuccess(stream) {
    recordButton.disabled = false;
    console.log('getUserMedia() got stream: ', stream);
    window.stream = stream;
    gumVideo.srcObject = stream;
}

function handleError(error) {
    console.log('navigator.getUserMedia error: ', error);
}

navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(handleError);

function handleSourceOpen(event) {
    console.log('MediaSource opened');
    sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="opus, vp9"');
    console.log('Source buffer: ', sourceBuffer);
}


function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        ws.send(event.data);
    }
}

function handleStop(event) {
    ws.send('close_stream');
    console.log('Recorder stopped: ', event);
}

function toggleRecording() {
    if (recordButton.textContent === 'Start test') {
        startRecording();
    } else {
        stopRecording();
        recordButton.textContent = 'Start test';

    }
}

function startRecording() {

    var options = {mimeType: 'video/webm; codecs="opus, vp9"'};
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log(options.mimeType + ' is not Supported');
        options = {mimeType: 'video/webm;codecs=vp8'};
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.log(options.mimeType + ' is not Supported');
            options = {mimeType: 'video/webm'};
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.log(options.mimeType + ' is not Supported');
                options = {mimeType: ''};
            }
        }
    }
    try {
        mediaRecorder = new MediaRecorder(window.stream, options);
    } catch (e) {
        console.error('Exception while creating MediaRecorder: ' + e);
        alert('Exception while creating MediaRecorder: '
            + e + '. mimeType: ' + options.mimeType);
        return;
    }
    console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
    recordButton.textContent = 'Stop test';

    mediaRecorder.onstop = handleStop;
    mediaRecorder.ondataavailable = handleDataAvailable;
    ws.send('create_stream');

    console.log('MediaRecorder started', mediaRecorder);
}

function stopRecording() {
    mediaRecorder.stop();
    console.log('Recorded Blobs: ', recordedBlobs);
}