export declare type Address = string;
export declare type Port = number;
export declare type Host = string;
export interface RemoteSender {
    address: string | undefined;
    port: number | undefined;
}
export declare type LowLevelListener = (augDataStr: string, remote: RemoteSender) => void;
export declare function send(port: Port, address: Address, dataString: string): Promise<void>;
export declare function listen(port: Port, address: Address, handleData: LowLevelListener): Promise<unknown>;
export declare function stopListening(server: {
    close: (arg0: (e: any) => void) => void;
}): Promise<unknown>;
declare const _default: {
    listen: typeof listen;
    send: typeof send;
    stopListening: typeof stopListening;
};
export default _default;
