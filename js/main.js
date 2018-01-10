'use strict';

// --------------- ORIGIN ----------------

// window.isSecureContext could be used for Chrome
var isSecureOrigin = location.protocol === 'https:' ||
    location.hostname === 'localhost';
if (!isSecureOrigin) {
    alert('getUserMedia() must be run from a secure origin: HTTPS or localhost.' +
        '\n\nChanging protocol to HTTPS');
    location.protocol = 'HTTPS';
}

// --------------- DOM OBJECTS ----------------
var recordButton = document.querySelector('button#record');
recordButton.onclick = toggleRecording;

// --------------- GUM VIDEO ----------------
var gumVideo = document.querySelector('video#gum');
var stream_name = getAllUrlParams().stream_name;
var constraints = {
    audio: true,
    video: {width: 352, height: 240, frameRate: 30}
};
var ready_stream = false;

function handleSuccess(stream) {
    recordButton.disabled = false;
    console.log('getUserMedia() got stream: ', stream);
    window.stream = stream;
    gumVideo.srcObject = stream;
}

function handleError(error) {
    console.log('navigator.getUserMedia error: ', error);
}

if (!stream_name) {
    stream_name = (new Date()).getTime();

    navigator.mediaDevices.getUserMedia(constraints)
        .then(handleSuccess)
        .catch(handleError);
} else {
    console.warn('SEE stream getAllUrlParams().stream_name:', stream_name);
    recordButton.textContent = 'SEE STREAM ' + stream_name;
}
if (getAllUrlParams().stream_name)
    document.getElementById('link').innerHTML = location.href;
else
    document.getElementById('link').innerHTML = location.href + '&stream_name=' + stream_name;

// --------------- GUM WEBSOCKET ----------------
var ws;

ws = new WebSocket('ws://localhost:12034/?stream=live&stream_name=' + stream_name);
ws.binaryType = "arraybuffer";

ws.onmessage = function (event) {
    if (typeof event.data === 'string' && event.data === 'start') {
        if (mediaRecorder !== undefined) {
            mediaRecorder.start(10);
        }
    }
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
}

function getStream() {
    return new Promise((resolve, reject) => {
        if (ws.readyState === ws.OPEN) {
            resolve(ws);
        } else if (ws.readyState === ws.CLOSING || ws.readyState == ws.CLOSED) {
            reject(null);
        }
    });
}

// --------------- RECORDING ----------------
var mediaRecorder;

var types = [
    'video/webm; codecs="opus, vp9"',
    'video/webm;codecs=vp8',
    'video/webm',
];

function toggleRecording() {
    if (!getAllUrlParams().stream_name) {
        if (recordButton.textContent === 'Start test') {
            startRecording();
        } else {
            stopRecording();
            recordButton.textContent = 'Start test';
        }
    }
}

function startRecording() {
    var options = {};
    for (var i in types) {
        if (MediaRecorder.isTypeSupported(types[i])) {
            console.log('Supported type: ', types[i]);
            options.mimeType = types[i];
            break;
        }
    }

    if (options.mimeType === undefined) {
        console.error('No supported mime types found');
        return;
    }

    if (mediaRecorder === undefined) {
        try {
            mediaRecorder = new MediaRecorder(window.stream, options);
            console.log('Created MediaRecorder', mediaRecorder,
                'with options', options);

            mediaRecorder.onstart = function (event) {
                recordButton.textContent = 'Stop test';
                console.log('MediaRecorder started: ', event);
            };

            mediaRecorder.onstop = function (event) {
                getStream()
                    .then(ws => {
                        ws.send('close_stream');
                    })
                    .catch(() => console.log('close_stream failed'));
                recordButton.textContent = 'Start test';
                console.log('MediaRecorder stopped: ', event);
            };

            mediaRecorder.ondataavailable = function (event) {
                if (event.data && event.data.size > 0) {
                    getStream()
                        .then(ws => {
                            ws.send(event.data);
                        })
                        .catch(() => console.log('Data send failure'));
                }
            }

            mediaRecorder.onerror = function (event) {
                console.error('MediaRecorder error:'.event.error);
            }

        } catch (e) {
            console.error('Exception while creating MediaRecorder: ' + e);
            alert('Exception while creating MediaRecorder: '
                + e + '. mimeType: ' + options.mimeType);
            return;
        }
    }

    getStream()
        .then(ws => {
            ws.send('create_stream');
            console.log('create_stream sent');
        })
        .catch(() => console.log('create_stream failed'));
}

function stopRecording() {
    if (mediaRecorder !== undefined) {
        mediaRecorder.stop();
        getStream()
            .then(ws => {
                ws.send('end_stream');
                console.log('end_stream sent');
            })
            .catch(() => console.log('end_stream failed'));
    }
}

// --------------- PLAYBACK ----------------
var mediaSource_1 = new MediaSource();
var buffer;
var video = document.getElementById('video');
var segments = [];

video.src = window.URL.createObjectURL(mediaSource_1);
video.type = 'video/webm; codecs="opus, vp9"';
video.crossOrigin = 'anonymous';

video.addEventListener('loadedmetadata', function (event) {
    console.log('----- loadedmetadata');
});

video.addEventListener('canplay', function (event) {
    console.log('Playback can begin');
    video.play()
        .then(() => {
            console.log('Playback has started');
        })
        .catch((e) => {
            console.log('Playback can\'t start', e)
        });
});

video.addEventListener('readystatechange', function (event) {
    switch (video.readyState) {
        case video.HAVE_ENOUGH_DATA:
            video.currentTime = 1e9;
            video.play();
            break;
        case video.HAVE_NOTHING:
        case video.HAVE_METADATA:
        case video.HAVE_CURRENT_DATA:
            video.currentTime = 1e9;
        default:
            video.pause();
    }

    console.log('Playback can begin');
    video.play()
        .then(() => {
            console.log('Playback has started');
        })
        .catch((e) => {
            console.log('Playback can\'t start', e)
        });
});

mediaSource_1.onsourceopen = function (event) {
    console.log('Playback media source opened');
    try {
        buffer = mediaSource_1.addSourceBuffer('video/webm; codecs="opus, vp9"');

        buffer.onupdateend = function (event) {
            console.log('Chunks in buffer: ', segments.length);
            if (segments.length > 0) {
                try {
                    buffer.appendBuffer(segments.shift());
                } catch (e) {
                }
            }
        }

        start();
    } catch (e) {
        console.log(e);
    }
}

mediaSource_1.onsourceended = function (event) {
    console.log('Playback media source ended');
}

mediaSource_1.onsourceclose = function (event) {
    console.log('Playback media source closed');
}

var playbackWebsocket;

function start() {
    playbackWebsocket =
        new WebSocket('ws://localhost:12034/?stream=get&stream_name=' + stream_name);
    playbackWebsocket.binaryType = "arraybuffer";

    playbackWebsocket.onopen = function () {
        if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
            console.log('Requesting meta');
            playbackWebsocket.send(JSON.stringify({
                method: 'getmeta',
                reqid: (new Date()).getTime(),
            }));
        }
    }

    playbackWebsocket.onclose = function (event) {
        console.log('Playback websocket is closed');
    }

    playbackWebsocket.onerror = function (event) {
        console.error(event.error);
    }

    playbackWebsocket.onmessage = function (event) {
        if (typeof event.data !== 'string') {
            console.log('Chunk received',);
            try {
                if (segments.length === 0) {
                    buffer.appendBuffer(event.data);
                } else {
                    segments.push(event.data);
                }
            } catch (e) {
                segments.push(event.data);
            }
            if (!ready_stream) {
                playbackWebsocket.send(JSON.stringify({
                    method: 'getmeta',
                    reqid: (new Date()).getTime(),
                }));
            }
        } else {
            try {
                let json = JSON.parse(event.data);
                if (json.method && json.method === 'getmeta') {
                    if (json.error.code === 204) {
                        ready_stream = true;
                        playbackWebsocket.send('ready');
                        console.log('Ready to accept media data');
                    }
                }
            } catch (e) {
                console.error('playbackWebsocket send error:', e);
            }
        }
    };

    /*
    function start() {
        websocket2.onmessage = function (event) {
              if (!buffer.updating) {
                buffer.appendBuffer(event.data);
              }

                // if (recordedBlobs.length > 40 && !play) {
                //     play = true;
                //     video.currentTime = 1e9;
                // }
                // recordedBlobs.push(event.data);
                // if (buffer.updating || queue.length > 0) {
                //     queue.push(event.data);
                // } else {
                //   try {
                //     buffer.appendBuffer(event.data);
                //   } catch (e) {
                //     if (video.error.code === 3) {
                //       play = true;
                //       video.currentTime = 1e9;
                //     }
                //   }
                // }

            } else {
            }
        };

    */
}


/*
// var channel = 'can01'; // Unused
var queue = [];
// var canvas = document.querySelector('canvas'); // Unused

mediaSource_1.addEventListener('sourceopen', (e) => {
    console.log('sourceopen mediaSource_1');
    // mediaSource_1.duration = 0;
    buffer = mediaSource_1.addSourceBuffer('video/webm; codecs="opus, vp9"');

    buffer.onupdate = function () {
    };

    // buffer.onupdateend = function () { // Note: Have tried 'updateend'
    //     while (queue.length > 0) {
    //       if (!buffer.updating) {
    //         buffer.appendBuffer(queue.shift());
    //       } else {
    //         video.currentTime = 1e9;
    //         break;
    //       }
    //     }
    //     // console.log('updateend');
    // };
    buffer.addEventListener('sourceclose', function (_) {
        console.log('sourceclose');
    });
    buffer.addEventListener('sourceended', function (_) {
        console.log('sourceclose');
    });
    buffer.addEventListener('error', function (error) {
      console.log('error', error.error);
    });
    mediaSource_1.addEventListener('error', function (error) {
        console.log('mediaSource_1 error', error);
    });
    mediaSource_1.addEventListener('updateend', function (_) {
        console.log('mediaSource_1 updateend');
    });
    start();
}, false);

var mediaSource = new MediaSource();
mediaSource.addEventListener('sourceopen', handleSourceOpen, false);
var recordedBlobs = [];
var waitStream = true;
var play = false;
var sourceBuffer;




}

// websocket.onopen = function () {
//     websocket.push(JSON.stringify({
//         open: true,
//         channel: channel
//     }));
// };
// websocket.push = ws.send;
var ff = null;





function handleSourceOpen(event) {
    console.log('MediaSource opened');
    sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="opus, vp9"');
    console.log('Source buffer: ', sourceBuffer);
}









*/
