"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net = require("net");
// Map of port and address to the socket for this IP
// Format: ${address}:${port}
const _socketMap = {};
function _fetchSocket(port, address, errHandler) {
    const host = `${address}:${port}`;
    if (!_socketMap[host]) {
        const socket = new net.Socket();
        socket.connect(port, address);
        socket.on('error', errHandler);
        const destroySocket = () => {
            socket.destroy();
            delete _socketMap[host];
        };
        socket.on('end', () => destroySocket());
        socket.on('close', () => destroySocket());
        // TODO: Implement handling data on client side and passing it back up to higher level data handler
        // socket.on('data', data => {})
        _socketMap[host] = socket;
    }
    return _socketMap[host];
}
function send(port, address, dataString) {
    return new Promise((resolve, reject) => {
        const socket = _fetchSocket(port, address, reject);
        let msgBuffer = Buffer.from(dataString);
        const msgLength = msgBuffer.length;
        const msgLengthBytes = Buffer.allocUnsafe(4);
        msgLengthBytes.writeUInt32BE(msgLength, 0);
        msgBuffer = Buffer.concat([msgLengthBytes, msgBuffer]);
        socket.write(msgBuffer, () => {
            resolve();
        });
    });
}
exports.send = send;
async function listen(port, address, handleData) {
    return new Promise((resolve, reject) => {
        // This will get called on every incoming connection/message
        const onNewSocket = (socket) => {
            socket.on('error', reject);
            let streamBuffer;
            let msgBuffer;
            let msgLength = 0;
            let newMsg = true;
            const readNBytes = (targetBuffer, n) => {
                // Check if we have enough bytes in the stream buffer to actually read n bytes
                if (n > streamBuffer.length) {
                    return false;
                }
                // Copy n bytes into the target buffer
                streamBuffer.copy(targetBuffer, 0, 0, n);
                // Calculate the new length of the stream buffer after subtracting the n bytes
                // and allocate a new buffer of that size
                const newLength = streamBuffer.length - n;
                const newStreamBuffer = Buffer.allocUnsafe(newLength);
                // Copy the remaining bytes in stream buffer to the new stream buffer
                // and then set streamBuffer to point to the new buffer
                streamBuffer.copy(newStreamBuffer, 0, n, streamBuffer.length);
                streamBuffer = newStreamBuffer;
                return true;
            };
            const finishMessage = () => {
                const remote = {
                    address: socket.remoteAddress,
                    port: socket.remotePort,
                };
                // TODO: Give handleData a socket handle so we can write back to the server if we choose to do so
                if (!msgBuffer) {
                    throw new Error('Failed to finishMessage: msgBuffer became falsy before converting to string');
                }
                handleData(msgBuffer.toString(), remote);
                newMsg = true;
                msgBuffer = null;
                parseStream();
            };
            const parseStream = () => {
                if (streamBuffer.length < 1) {
                    // console.log('No bytes left')
                    return;
                }
                if (newMsg) {
                    const msgLengthBytes = Buffer.allocUnsafe(4);
                    const read = readNBytes(msgLengthBytes, 4);
                    if (!read) {
                        throw new Error('Unable to read message length while parsing stream.');
                    }
                    msgLength = msgLengthBytes.readUInt32BE(0);
                    newMsg = false;
                }
                if (!msgBuffer) {
                    msgBuffer = Buffer.allocUnsafe(msgLength);
                }
                const read = readNBytes(msgBuffer, msgLength);
                if (!read) {
                    throw new Error('Failed to read ${msgLength} bytes from streamBuffer into msgBuffer');
                }
                finishMessage();
            };
            socket.on('data', (data) => {
                if (!streamBuffer)
                    streamBuffer = data;
                else
                    streamBuffer = Buffer.concat([streamBuffer, data]);
                try {
                    parseStream();
                }
                catch (e) {
                    // TODO: Add proper error handling
                    console.log(e);
                }
            });
        };
        const server = net.createServer();
        server.on('connection', onNewSocket);
        server.on('listening', () => resolve(server));
        server.on('error', reject);
        server.listen(port, address);
    });
}
exports.listen = listen;
async function stopListening(server) {
    return new Promise((resolve, reject) => {
        for (const socket of Object.values(_socketMap)) {
            socket.end();
        }
        server.close((e) => {
            if (e)
                return reject(e);
            else
                return resolve();
        });
    });
}
exports.stopListening = stopListening;
exports.default = { listen, send, stopListening };
//# sourceMappingURL=net.js.map