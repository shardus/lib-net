declare const generateContext: (opts: {
    port: number;
    address: string;
}) => {
    send: (port: number, address: string, data: any, timeout?: number, onResponse?: () => void, onTimeout?: () => void) => Promise<unknown>;
    listen: (handleData: any) => Promise<unknown>;
    stopListening: (server: any) => Promise<unknown>;
};
export default generateContext;
