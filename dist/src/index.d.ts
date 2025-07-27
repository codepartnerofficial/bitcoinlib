import * as bitcoin from "bitcoinjs-lib";
import { ECPairInterface } from "ecpair";
export interface Vout {
    txid: string;
    vout: number;
    amount: number;
}
export interface TxInput {
    txid: string;
    vout: number;
    amount: number;
    privateKey: string;
    addressType: "p2tr" | "p2wpkh" | "p2pkh";
    hex?: string;
}
export interface TxOutput {
    address: string;
    amount?: number;
    sendRemaining?: boolean;
}
export declare class Bitcoin {
    private apiKey?;
    networks: typeof bitcoin.networks;
    network: bitcoin.Network;
    private ECPair;
    private rpc;
    private networkName;
    constructor(rpc?: string, networkName?: 'mainnet' | 'testnet' | 'regtest', apiKey?: string | undefined);
    toXOnly(pubkey: Buffer): Buffer;
    static generateAddress(networkName: 'mainnet' | 'testnet' | 'regtest', type: "segwit" | "keyhash" | "taproot"): {
        address: string;
        bchAddress: string;
        privateKey: string;
    };
    bufferToUint8Array: (b: Buffer | Uint8Array) => Uint8Array;
    safeVerify: (pubkey: Buffer, msgHash: Buffer, signature: Buffer) => boolean;
    getSigner(keyPair: ECPairInterface, isTaproot?: boolean): bitcoin.Signer;
    sendBitcoin(inputs: TxInput[], outputs: TxOutput[]): Promise<string>;
    sendBitcoinTaproot(input: TxInput, outputs: TxOutput[]): Promise<string>;
    sendBitcoinSegWit(vout: Vout, outputs: TxOutput[], privateKey: string): Promise<string>;
    sendBitcoinKeyHash(rawtx: string, vout: Vout, outputs: TxOutput[], privateKey: string): Promise<string>;
    broadcastTransaction(tx: string): Promise<any>;
    fetchFeePerVbyte(): Promise<number>;
}
