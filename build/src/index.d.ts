import * as net from './net';
export interface AugmentedData {
    data: unknown;
    UUID: string;
    PORT: net.Port;
    ADDRESS?: net.Address;
}
export interface RemoteSender {
    port: number | undefined;
    address: string | undefined;
}
export declare type ResponseCallback = (data?: unknown) => void;
export declare type TimeoutCallback = () => void;
export declare type ListenCallback = (data: unknown, remote: net.RemoteSender, respond: ResponseCallback) => void;
declare const Sn: (opts: {
    port: number;
    address: string;
}) => {
    send: (port: number, address: string, data: unknown, timeout?: number, onResponse?: ResponseCallback, onTimeout?: TimeoutCallback) => Promise<void>;
    listen: (handleData: (data: unknown, remote: RemoteSender, respond: ResponseCallback) => void) => Promise<unknown>;
    stopListening: (server: any) => Promise<unknown>;
};
export default Sn;
