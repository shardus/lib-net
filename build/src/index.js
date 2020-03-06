"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid = require("uuid/v1");
const net = require("./net");
const opts_1 = require("./opts");
const DEFAULT_ADDRESS = '0.0.0.0';
const noop = () => { };
// We have to generate a closure so,
// 1) We can test simulated from two isolated environments, and
// 2) Users can use two distinct copies if they want to, for whatever
//    reason.
//
// We need to pass in the port and address to the whole closure so that
// the `send` function can augment its sent data with the port the `listen`
// function will be listening on. This is necessary to simulate "responding"
// to a "request".
exports.Sn = (opts) => {
    opts_1.default(opts);
    const PORT = opts.port;
    const ADDRESS = opts.address || DEFAULT_ADDRESS;
    // we're going to keep track of response IDs here
    const responseUUIDMapping = {};
    const _sendAug = async (port, address, augData, timeout, onResponse, onTimeout) => {
        const stringifiedData = JSON.stringify(augData);
        const promise = net.send(port, address, stringifiedData);
        // a timeout of 0 means no return message is expected.
        if (timeout !== 0) {
            const timer = setTimeout(() => {
                delete responseUUIDMapping[augData.UUID];
                onTimeout();
            }, timeout);
            responseUUIDMapping[augData.UUID] = (data) => {
                clearTimeout(timer);
                onResponse(data);
            };
        }
        return promise;
    };
    const send = async (port, address, data, timeout = 0, onResponse = noop, onTimeout = noop) => {
        const UUID = uuid();
        // Under the hood, sn needs to pass around some extra data for its own internal usage.
        const augData = {
            data,
            UUID,
            PORT,
            ADDRESS,
        };
        return _sendAug(port, address, augData, timeout, onResponse, onTimeout);
    };
    const listen = async (handleData) => {
        // This is a wrapped form of the 'handleData' callback the user supplied.
        // Its job is to determine if the incoming data is a response to a request
        // the user sent. It does this by referencing the UUID map object.
        const extractUUIDHandleData = (augDataStr, remote) => {
            // [TODO] Secure this with validation
            const augData = JSON.parse(augDataStr);
            const { PORT, UUID, data } = augData;
            const address = remote.address;
            // This is the return send function. A user will call this if they want
            // to "reply" or "respond" to an incoming message.
            const respond = (response) => {
                const sendData = { data: response, UUID, PORT };
                //@ts-ignore TODO: FIX THISSSSSS (Remove the ignore flag and make typescript not complain about address being possibly undefined)
                return _sendAug(PORT, address, sendData, 0, noop, noop);
            };
            // If we are expecting a response, go through the respond mechanism.
            // Otherwise, it's a normal incoming message.
            const handle = responseUUIDMapping[UUID]
                ? responseUUIDMapping[UUID]
                : handleData;
            // Clear the respond mechanism.
            delete responseUUIDMapping[UUID];
            return handle(data, remote, respond);
        };
        // TODO these should be spun up in parallel, but that convolutes code
        // and doesn't save hardly any startup time, so skipping for now.
        const server = await net.listen(PORT, ADDRESS, extractUUIDHandleData);
        return server;
    };
    const stopListening = (server) => {
        return net.stopListening(server);
    };
    const returnVal = { send, listen, stopListening };
    return returnVal;
};
//# sourceMappingURL=index.js.map