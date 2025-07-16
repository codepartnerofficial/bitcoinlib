import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import bchaddrjs from "bchaddrjs";
import axios from "axios";
bitcoin.initEccLib(ecc);

export interface Vout {
    txid: string,
    vout: number,
    amount: number
}

export interface TxOutput {
    address: string,
    amount?: number,
    sendRemaining?: boolean
}
export class Bitcoin {
    public networks = bitcoin.networks;
    public network: bitcoin.Network = bitcoin.networks.bitcoin;
    private ECPair = ECPairFactory(ecc);
    private rpc: string;
    private networkName: 'mainnet' | 'testnet' | 'regtest';
    constructor(rpc: string, networkName: 'mainnet' | 'testnet' | 'regtest') {
        this.rpc = rpc;
        this.networkName = networkName;
        this.network = networkName == "mainnet" ?
            bitcoin.networks.bitcoin :
            networkName == "testnet" ? bitcoin.networks.testnet
                : bitcoin.networks.regtest;
    }

    static generateAddress(networkName: 'mainnet' | 'testnet' | 'regtest', type: "segwit" | "keyhash") {
        const ECPair = ECPairFactory(ecc);
        const network = networkName == "mainnet" ?
            bitcoin.networks.bitcoin :
            networkName == "testnet" ? bitcoin.networks.testnet
                : bitcoin.networks.regtest;

        const keyPair = ECPair.makeRandom();
        const pubKey = keyPair.publicKey;
        const hash = type == 'segwit' ? bitcoin.payments.p2wpkh({
            pubkey: Buffer.from(pubKey),
            network,
        }) :
            bitcoin.payments.p2pkh({
                pubkey: Buffer.from(pubKey),
                network,
            });
        const privateKey = keyPair.toWIF();
        // console.log(p2wpkh.address,privateKey);
        const bchHash = bitcoin.payments.p2pkh({
            pubkey: Buffer.from(pubKey),
            network,
        })
        let bchaddr = bchaddrjs.toCashAddress(bchHash.address || "");
        return { address: hash.address || "", bchAddress: bchaddr, privateKey }
    }
    bufferToUint8Array = (b: Buffer | Uint8Array): Uint8Array =>
        b instanceof Buffer ? new Uint8Array(b) : b;

    safeVerify = (
        pubkey: Buffer,
        msgHash: Buffer,
        signature: Buffer
    ): boolean => {
        if (msgHash.length !== 32) return false;
        return ecc.verify(
            this.bufferToUint8Array(msgHash),
            this.bufferToUint8Array(pubkey),
            this.bufferToUint8Array(signature)
        );
    };

    async sendBitcoinSegWit(vout: Vout, outputs: TxOutput[], privateKey: string) {
        const keyPair = this.ECPair.fromWIF(privateKey);
        const signer: bitcoin.Signer = {
            publicKey: Buffer.from(keyPair.publicKey), // fixes the type issue
            sign: (hash: Buffer) => Buffer.from(keyPair.sign(hash)),
            signSchnorr: keyPair.signSchnorr ? (hash: Buffer): Buffer => {
                const sig = keyPair.signSchnorr!(hash); // safe to use non-null assertion
                return Buffer.from(sig);               // convert to Buffer
            }
                : undefined,
        };

        // Create payment object
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network: this.network });
        const psbt = new bitcoin.Psbt({ network: this.network });
        psbt.addInput({
            hash: vout.txid,
            index: vout.vout,
            witnessUtxo: {
                script: p2wpkh.output!,
                value: Math.floor(vout.amount * 1e8),
            },
        });
        let total = 0;
        for (let output of outputs) {
            const outputLength = psbt.txOutputs.length;
            const inputLength = psbt.inputCount;
            // const fee = psbt.getFee();
            // const dataBytes = 148 * inputLength + 34 * outputLength
            const feesPerVByte = await this.fetchFeePerVbyte();
            const dataBytes = 10 + (68 * inputLength) + (31 * (outputLength + 1))
            const fee = Math.ceil(feesPerVByte * dataBytes)
            console.log("fee", dataBytes, fee, feesPerVByte)
            if (output.amount) {
                total += output.amount
            }
            psbt.addOutput({
                address: output.address, // your recipient
                value: output.amount ? Math.floor(output.amount * 1e8) : (output.sendRemaining ? Math.floor(((vout.amount - total) * 1e8) - fee) : 0), // subtract fee (e.g., 1000 sats)
            });
        }

        psbt.signInput(0, signer);
        psbt.validateSignaturesOfInput(0, this.safeVerify, Buffer.from(keyPair.publicKey));
        psbt.finalizeAllInputs();

        const tx = psbt.extractTransaction();
        // console.log("P2PKH TX:", tx.toHex());
        return tx.toHex();
    }

    async sendBitcoin(rawtx: string, vout: Vout, outputs: TxOutput[], privateKey: string) {
        const keyPair = this.ECPair.fromWIF(privateKey);
        // const address = bitcoin.payments.p2pkh({
        //     pubkey: Buffer.from(keyPair.publicKey),
        //     network: this.network
        // }).address!; // or p2wpkh, depending on key usage

        const signer: bitcoin.Signer = {
            publicKey: Buffer.from(keyPair.publicKey), // fixes the type issue
            sign: (hash: Buffer) => Buffer.from(keyPair.sign(hash)),
            signSchnorr: keyPair.signSchnorr ? (hash: Buffer): Buffer => {
                const sig = keyPair.signSchnorr!(hash); // safe to use non-null assertion
                return Buffer.from(sig);               // convert to Buffer
            }
                : undefined,
        };
        // Determine network
        // const network = bitcoin.networks.bitcoin; // or testnet

        // Create payment object
        // const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
        // const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
        const psbt = new bitcoin.Psbt({ network: this.network });
        psbt.addInput({
            hash: vout.txid,
            index: vout.vout,
            nonWitnessUtxo: Buffer.from(
                rawtx, // REQUIRED for p2pkh!
                "hex"
            ),
        });
        let total = 0;
        for (let output of outputs) {
            const outputLength = psbt.txOutputs.length;
            const inputLength = psbt.inputCount;
            // const fee = psbt.getFee();
            const dataBytes = 10 + (148 * inputLength) + (34 * (outputLength + 1));
            const fee = Number((Math.ceil(await this.fetchFeePerVbyte() * (10 ** 8) * dataBytes) / (10 ** 18)).toFixed(8))
            // console.log("fee",);
            if (output.amount) {
                total += output.amount;
            }
            psbt.addOutput({
                address: output.address, // your recipient
                value: output.amount ? Math.floor(output.amount * 1e8) : output.sendRemaining ? (vout.amount - total - fee) : 0, // subtract fee (e.g., 1000 sats)
            });
        }

        psbt.signInput(0, signer);
        psbt.validateSignaturesOfInput(0, this.safeVerify, Buffer.from(keyPair.publicKey));
        psbt.finalizeAllInputs();

        const tx = psbt.extractTransaction();
        // console.log("P2PKH TX:", tx.toHex());
        return tx.toHex();
    }

    async broadcastTransaction(tx: string) {
        try {

            const data = {
                jsonrpc: "1.0",
                id: "curltest",
                method: "sendrawtransaction",
                params: [tx]
            }
            const response = await axios.post(this.rpc, JSON.stringify(data));
            if (response.status == 200) {
                console.log(response.data);
                return response.data;
            }
            throw new Error("Transaction Invalid");
        } catch (error) {
            console.log("Broadcast Transaction Failed");
            throw error
        }
    }

    async fetchFeePerVbyte() {
        try {

            const data = {
                jsonrpc: "1.0",
                id: "curltest",
                method: "estimatesmartfee",
                params: [6]
            }
            const response = await axios.post(this.rpc, JSON.stringify(data));
            if (response.status == 200) {
                console.log(response.data);
                return response.data.result?.feerate * 1e5;
            }
            throw new Error("Transaction Invalid");
        } catch (error) {
            console.log("Broadcast Transaction Failed");
            // throw error
            if(this.networkName == "mainnet"){
                return 100;
            }else{
                return 1.2;
            }
        }
        // if (this.networkName == "mainnet") {
        //     estimatesmartfee
        //     return 1.2
        // } else {
        //     return 1.2
        // }
    }
}

// const btc = new Bitcoin();

// const addressObject = {
//     address: 'mnUVDize2xtFDvrHrbn3j2mEVMo5YxVABQ',
//     bchAddress: 'bchtest:qpx9zu4zd262vt2rvkvc5w2dmr2hfe0m9scyxv5ued',
//     privateKey: 'L2T7UtdABsezrqjv3razhvfiDNBXgaezu9RRv3C6sYULAgWWcW5g'
// }
// https://blockexplorer.one/bitcoin/testnet/tx/85a5f23220cc7c19eb86d0c61342611f5fcfc2dbd96f5cce09ea42c5e08658c1
// https://blockexplorer.one/bitcoin/testnet/tx/9e171929820f74b4ea62543c278161003dc2475a144afa36c6caf8e3fb8981c9
// https://blockexplorer.one/bitcoin/testnet/tx/1ce16435561c7d3b9aa3eb99165af655528315df2e1c4c8aeb6824e8b03e8b5f
const vout: Vout = {
    amount: 0.00117331,
    vout: 0,
    txid: "1ce16435561c7d3b9aa3eb99165af655528315df2e1c4c8aeb6824e8b03e8b5f"
}
const addressObject = {
    address: 'tb1qz35fguvz79peeyjudhg27r7cj5jle3hq49jf7u',
    bchAddress: 'bchtest:qq2x39r3stc588yjt3kaptc0mz2jtlxxuqeqpdzyrg',
    privateKey: 'KxKKjBgDnUpYpzFvZHjSNpjZAY7Pqi1k4iMNpE15y1EdFvtTVDBV'
}

const toAddress = {
    address: 'tb1qz35fguvz79peeyjudhg27r7cj5jle3hq49jf7u',
    bchAddress: 'bchtest:qq2x39r3stc588yjt3kaptc0mz2jtlxxuqeqpdzyrg',
    privateKey: 'KxKKjBgDnUpYpzFvZHjSNpjZAY7Pqi1k4iMNpE15y1EdFvtTVDBV'
}
const rawTx = "020000000001011ddcc4d656ca2e11cc2c0cdc987018f7396c9d1dcc12f866800da981c0aec5950100000000fdffffff028dccd046000000001976a914795dfe1c25c1ae9965f45d66383db2bed567ac4c88ac98d50100000000001976a9144c5172a26ab4a62d4365998a394dd8d574e5fb2c88ac01409d3c376c2ef04d134b215e4acd43f383920cc7667c06aceeba7eacfe42c14bb99ae64e572007f5ddbfe568c97bb2351dd97fcb4697a6c98144cd9b9aa722551d95d34500";

// 0.00119868 - 0.00003440
// ===========================
// Generate Address
// ===========================
// console.log("Address: ",Bitcoin.generateAddress('testnet','segwit'))


// ===========================
// Send Transaction
// ===========================
const btc = new Bitcoin("https://bitcoin-testnet.g.alchemy.com/v2/D7iVzbC_LzMwoRzi58DhtYnv_pqG2EEq", "testnet");
// SegWit [p2wpkh]
btc.sendBitcoinSegWit(vout, [{ address: toAddress.address, sendRemaining: true }], addressObject.privateKey)

// Public Key Hash
// const tx = btc.sendBitcoin(rawTx, vout, [{ address: toAddress.address, amount: 0.0012 }], addressObject.privateKey)

.then(tx=>{
    console.log("Raw Transaction:", tx);
    btc.broadcastTransaction(tx)
    .then(response=>{console.log("Broadcast Response",response)})
    .catch(err=>console.log(err));
}).catch(console.error);



