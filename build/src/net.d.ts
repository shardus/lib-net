export declare type Port = number;
export declare type Address = string;
declare const _default: {
    listen: (port: number, address: string, handleData: (handle: string, remote: {
        port: number | undefined;
        address: string | undefined;
    }) => void) => Promise<unknown>;
    send: (port: number, address: string, dataString: string) => Promise<unknown>;
    stopListening: (server: any) => Promise<unknown>;
};
export default _default;
