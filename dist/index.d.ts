import * as bitcoin from "bitcoinjs-lib";
export interface Vout {
    txid: string;
    vout: number;
    amount: number;
}
export interface TxOutput {
    address: string;
    amount?: number;
    sendRemaining?: boolean;
}
export declare class Bitcoin {
    networks: typeof bitcoin.networks;
    network: bitcoin.Network;
    private ECPair;
    private rpc;
    private networkName;
    constructor(rpc: string, networkName: 'mainnet' | 'testnet' | 'regtest');
    static generateAddress(networkName: 'mainnet' | 'testnet' | 'regtest', type: "segwit" | "keyhash"): {
        address: string;
        bchAddress: string;
        privateKey: string;
    };
    bufferToUint8Array: (b: Buffer | Uint8Array) => Uint8Array;
    safeVerify: (pubkey: Buffer, msgHash: Buffer, signature: Buffer) => boolean;
    sendBitcoinSegWit(vout: Vout, outputs: TxOutput[], privateKey: string): Promise<string>;
    sendBitcoin(rawtx: string, vout: Vout, outputs: TxOutput[], privateKey: string): Promise<string>;
    broadcastTransaction(tx: string): Promise<any>;
    fetchFeePerVbyte(): Promise<number>;
}
