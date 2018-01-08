'use strict';

const Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    path = require('path'),
    http = require('http'),
    os = require('os'),
    ffmpeg = require('fluent-ffmpeg');
// require driver FFmpeg
if ('darwin' === os.platform()) {
    ffmpeg.setFfmpegPath(path.join(__dirname, './driverFFmpeg/macos/ffmpeg'));
    ffmpeg.setFfprobePath(path.join(__dirname, './driverFFmpeg/macos/ffprobe'));
} else if ('linux' === os.platform()) {
    ffmpeg.setFfmpegPath(path.join(__dirname, './driverFFmpeg/linux/ffmpeg'));
    ffmpeg.setFfprobePath(path.join(__dirname, './driverFFmpeg/linux/ffprobe'));
} else if ('win32' === os.platform()) {
    ffmpeg.setFfmpegPath(path.join(__dirname, './driverFFmpeg/win/ffmpeg.exe'));
    ffmpeg.setFfprobePath(path.join(__dirname, './driverFFmpeg/win/ffprobe.exe'));
} else {
    console.error('driverFFmpeg is not support this system');
    process.exit(100);
}
// require driver FFmpeg

const WebSocketServer = require('websocket').server;
const _dt = '[VideoStreem] {debug} ->';

const str2json = require('./lib/str2json');
const _error = require('./lib/error');
const AWS_S3 = require('./aws-amazon-s3');
const s3 = new AWS_S3({
    key: 'AKIAIIKWOM2TDQFJTLVA',
    secret: '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',
    bucket: 'solusse2',
    region: 'us-west-2',
    dir: 'video'
});

class VideoStreem {
    constructor(port_ws, options) {
        if (!port_ws || isNaN(+port_ws) || +port_ws > 99999 || +port_ws < 1000) port_ws = 3000;   // 1000 < port_ws < 99999
        this.clients = []; //array clients
        this.debug = false;
        this.p = 360;
        this.fps = 30;
        this.first_binnary = {};

        this.app = http.createServer();
        this._webSocketServer = new WebSocketServer({
            httpServer: this.app, // http server attached ws
            autoAcceptConnections: false,
            perMessageDeflate: false,
            maxReceivedFrameSize: 1024 * 256, //512 kb max
            maxReceivedMessageSize: 5 * 1024 * 1024, // 5mb max
        });
        this._webSocketServer.on('request', this.req.bind(this));

        this.app.listen(port_ws); // http server start in the port_ws const

        if (options && options.debug) this.debug = true;

        if (this.debug) console.log(_dt, 'Start Port: ' + port_ws);
    }

    req(socket) {
        let stream_file = null;
        let protocol = null;
        if (socket.resourceURL.query.mpeg === 't') protocol = 'chat';
        let _client = {
            recived_stream: 0,
            file: stream_file,
            ws: socket.accept(protocol, socket.origin + socket.resource), // websocket client
            param_connect: socket.resourceURL.query, // get param connect socket
            cookies: socket.cookies // cookies
        };


        // wait data only stream=live write stream
        _client.ws.on('message', message => {
            if (this.debug) console.log(_dt, 'clients count:', this.clients.length, message.type, message);

            if (message.type === 'utf8') {
                if (message.utf8Data === 'ready') {
                    this.clients.push(_client); // add client to array clients
                }
                else if (message.utf8Data === 'close_stream') {
                    if (_client.file && !_client.file.closed) {
                        _client.file.end(); // close stream file and save
                        this.videoSave(_client.filename);
                    }
                }
                else if (message.utf8Data === 'create_stream') {
                    this.first_binnary[_client.param_connect.stream_name] = [];
                    if (!_client.file || _client.file.closed)
                        _client.filename = 'video-' + (new Date().getTime()) + '.webm';
                    _client.file = fs.createWriteStream(path.join(__dirname, './video_tmp/tmp_stream/' + _client.filename));  //create stream file (video)

                    _client.ws.send('start');
                } else {
                    str2json(message.utf8Data)
                        .then((data) => {
                            if (!data.method) {
                                return Promise.reject('data.method undefined')
                            }
                            if (!data.reqid) {
                                return Promise.reject('data.reqid undefined')
                            }
                            return Promise.resolve(data);
                        })
                        .then((data) => {
                            switch (data.method) {
                                case "getmeta":
                                    if (this.first_binnary.hasOwnProperty(_client.recived_stream)) {
                                        _client.ws.sendBytes(this.first_binnary[_client.recived_stream]);
                                        _client.recived_stream++;
                                    } else {
                                        _client.ws.send(JSON.stringify({
                                            reqid: data.reqid,
                                            method: data.method,
                                            success: false,
                                            error: _error["204"]()
                                        }));
                                    }
                                    break;

                                default:
                                    _client.ws.send(JSON.stringify({
                                        reqid: data.reqid,
                                        method: data.method,
                                        success: false,
                                        error: _error["404"]()
                                    }));
                                    break;
                            }
                        })
                        .catch((err) => {
                            _client.ws.send('Error you data');
                            if (this.debug) console.log(_dt, 'str2json Error:\n\t', err);
                        });


                }

                // this.clients[index].ws.sendUTF(message.utf8Data);
            }
            if (_client.param_connect.stream === 'live') {
                if(!this.first_binnary[_client.param_connect.stream_name]) this.first_binnary[_client.param_connect.stream_name] = [];
                if (message.type === 'binary') {
                    if (this.first_binnary[_client.param_connect.stream_name].length < 5) this.first_binnary[_client.param_connect.stream_name].push(message.binaryData);
                    if (_client.file && !_client.file.closed)
                        _client.file.write(message.binaryData); //write to file data
                }
                for (let index in this.clients) {
                    if (this.clients.hasOwnProperty(index) && this.clients[index] !== _client && this.clients[index].param_connect.stream === 'get') { // steam=get waiting data
                        if (message.type === 'binary') {
                            this.clients[index].ws.sendBytes(message.binaryData); // send binary video data
                            this.clients[index].recived_stream++;
                        }
                    }
                }
            }

        });
        _client.ws.on('close', () => this.removeUser.bind(this)(_client));  // close stream and remove client ws

    }

    removeUser(ws) {
        if (ws.param_connect.stream === 'live') {
            if (ws.file && !ws.file.closed)
                ws.file.end(); // close stream file and save
        }
        let newClientsArray = [];
        for (let i = 0; i < this.clients.length; i++)
            if (this.clients[i] !== ws) newClientsArray.push(this.clients[i]);

        this.clients = newClientsArray;
    }

    renderVideo(opt) {

        if (!opt || typeof opt !== 'object') return Promise.reject('options in not object');
        if (!opt && !opt.filename) return Promise.reject('options.filename of  undefined');
        if (!opt.p) opt.p = this.p; // 480p 720p 1060p ...
        if (!opt.fps) opt.fps = this.fps; // fps/sec default 30
        let st = new Date().getTime();
        if (this.debug) console.log(_dt, 'renderVideo start:', opt.filename);

        return new Promise((resolve, reject) => {
            ffmpeg(path.join(__dirname, './video_tmp/tmp_stream/' + opt.filename))
                .inputFormat('webm')
                // .size('?x' + opt.p)
                .format('webm')
                .videoCodec('libvpx-vp9')
                // .fps(opt.fps)
                // .AudioBitRate(72)
                // .setVideoAspectRatio('16:9')
                .on('error', (err) => {
                    console.error('ffmpeg.on error:', err);
                    return reject(err.message)
                })
                .on('end', () => {
                    resolve({
                        ready_file: path.join(__dirname, './video_tmp/tmp_ready/ready-' + (opt.filename.replace('webm', 'webm'))),
                        readyFileName: 'ready-' + (opt.filename.replace('webm', 'webm')),
                        ...opt
                    });
                    if (this.debug) console.log(_dt, 'renderVideo end:', opt.filename, ((new Date().getTime()) - st) + 'ms');
                })
                .save(path.join(__dirname, './video_tmp/tmp_ready/ready-' + (opt.filename.replace('webm', 'webm'))));
        }).timeout(1000 * 60 * 20, 'render video timeout'); // 20 min timeout
    }

    unlinkFile(opt) {
        return new Promise((resolve, reject) => {
            if (opt && !opt.path_rm && opt.filename) opt.path_rm = path.join(__dirname, './video_tmp/tmp_stream/' + opt.filename);
            else if (!opt || (!opt.filename && !opt.path_rm)) return reject('options.filename and path of undefined');
            if (this.debug) console.log(_dt, 'unlinkFile:', opt.path_rm);


            fs.exists(opt.path_rm, function (exists) {
                if (exists)
                    fs.unlink(opt.path_rm, (err) => {
                        if (err) reject(err);
                        resolve(opt);

                    });
                else return reject('file in not exists' + opt.path_rm);
            });
        })
    }

    videoSave(filename) {
        let st = new Date().getTime();
        if (this.debug) console.log(_dt, 'videoSave start:', filename);
        return this.renderVideo({filename: filename}) // render tmp stream file
            .then(res => {
                return this.unlinkFile({filename: res.filename, ...res}).timeout(1000 * 10, 'unlink timeout'); // remove tmp file stream
            })
            .then(res => {
                return {
                    buffer: fs.readFileSync(res.ready_file),
                    ...res
                }  // read result render file
            })
            .then(res => {
                let st = new Date().getTime();

                if (this.debug) console.log(_dt, 'upload start:', res.readyFileName);

                return s3.upload(res.readyFileName, res.buffer, {dir: 'video'}).then(upload_res => {
                    if (this.debug) console.log(_dt, 'upload end:', res.readyFileName, ((new Date().getTime()) - st) + 'ms');
                    return {...res, ...upload_res};
                }); // upload to s3 server
            })
            .then(res => {
                return this.unlinkFile({...res, path_rm: res.ready_file}).timeout(1000 * 10, 'unlink timeout'); // 10 s // remove result file
            })
            .then((result) => { // maping object
                return {
                    url: result.url,
                    attach_path: result.attach_path,
                    readyFileName: result.readyFileName,
                    fps: result.fps,
                    p: result.p,
                    ETag: result.res.ETag
                }
            })
            .then((result) => {
                if (this.debug) console.log(_dt, 'videoSave end:', filename, ((new Date().getTime()) - st) + 'ms');
                console.log(result);
                return result
            })
            .catch((error) => {
                console.error('videoSave', error, '\n', new Error('videoSave#1').stack); // console.log
                return error
            });
    }
}

if (!module.parent) new VideoStreem(12034, {debug: true}); // dev start service
module.exports = VideoStreem; // exporting video class