import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory, ECPairInterface } from "ecpair";
import bchaddrjs from "bchaddrjs";
import axios from "axios";
bitcoin.initEccLib(ecc);

export interface Vout {
    txid: string,
    vout: number,
    amount: number
}
export interface TxInput {
    txid: string,
    vout: number,
    amount: number,
    privateKey: string,
    addressType: "p2tr" | "p2wpkh" | "p2pkh"
    hex?: string
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
    constructor(rpc?: string, networkName: 'mainnet' | 'testnet' | 'regtest' = "mainnet", private apiKey?: string) {
        this.rpc = rpc || "";
        this.networkName = networkName;
        this.network = networkName == "mainnet" ?
            bitcoin.networks.bitcoin :
            networkName == "testnet" ? bitcoin.networks.testnet
                : bitcoin.networks.regtest;
    }

    toXOnly(pubkey: Buffer): Buffer {
        return pubkey.length === 32 ? pubkey : pubkey.subarray(1, 33);
    }

    static generateAddress(networkName: 'mainnet' | 'testnet' | 'regtest', type: "segwit" | "keyhash" | "taproot") {
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
        }) : type == "taproot" ?
            bitcoin.payments.p2tr({
                internalPubkey: Buffer.from(pubKey).subarray(1, 33),
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

    getSigner(keyPair: ECPairInterface, isTaproot: boolean = false): bitcoin.Signer {
        return {
            publicKey: isTaproot
                ? Buffer.from(keyPair.publicKey).subarray(1, 33) // x-only pubkey
                : Buffer.from(keyPair.publicKey),
            sign: (hash: Buffer) => {
                const sig = keyPair.sign(hash);
                return Buffer.isBuffer(sig) ? sig : Buffer.from(sig);
            },
            signSchnorr: isTaproot && keyPair.signSchnorr
                ? (hash: Buffer): Buffer => {
                    const sig = keyPair.signSchnorr!(hash);
                    return Buffer.isBuffer(sig) ? sig : Buffer.from(sig);
                }
                : undefined,
        };
    }

    async sendBitcoin(inputs: TxInput[], outputs: TxOutput[]) {
        // Create payment object
        const inputs_ = inputs.map(input => {
            const keyPair = this.ECPair.fromWIF(input.privateKey);
            const signer = this.getSigner(keyPair, input.addressType == "p2tr");
            return {
                ...input,
                keyPair,
                signer
            }
        })
        const psbt = new bitcoin.Psbt({ network: this.network });
        let totalAmount = 0;
        for (let input of inputs_) {
            if (input.addressType == "p2tr") {
                const xOnlyPubkey = this.toXOnly(Buffer.from(input.keyPair.publicKey))
                const { address, output } = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: this.network });
                psbt.addInput({
                    hash: input.txid,
                    index: input.vout,
                    witnessUtxo: {
                        script: output!,
                        value: Math.floor(input.amount * 1e8),
                    },
                    tapInternalKey: xOnlyPubkey,
                    sequence: 4294967293
                });
            } else if (input.addressType == "p2wpkh") {
                const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(input.keyPair.publicKey), network: this.network });
                psbt.addInput({
                    hash: input.txid,
                    index: input.vout,
                    witnessUtxo: {
                        script: p2wpkh.output!,
                        value: Math.floor(input.amount * 1e8),
                    },
                    sequence: 4294967293
                });
            } else {
                if (!input.hex) {
                    throw new Error("Hex is not supplied for p2pkh");
                }
                psbt.addInput({
                    hash: input.txid,
                    index: input.vout,
                    nonWitnessUtxo: Buffer.from(
                        input.hex, // REQUIRED for p2pkh!
                        "hex"
                    ),
                });
            }
            totalAmount += input.amount;
        }

        let totalFixedOutputAmount = 0;
        let totalFixedOutputLength = 0;

        for (let output of outputs) {
            if (output.amount && !output.sendRemaining) {
                psbt.addOutput({
                    address: output.address,
                    value: Math.floor(output.amount * 1e8),
                });
                totalFixedOutputAmount += output.amount;
                totalFixedOutputLength = 0;
                psbt.txOutputs.forEach(value => {
                    totalFixedOutputLength += value.script.byteLength
                })
            }
        }
        let totalInputBytes = 0;
        inputs.forEach(input => {
            if (input.addressType == "p2pkh") {
                totalInputBytes += input.hex!.length / 2;
            } else if (input.addressType == "p2wpkh") {
                totalInputBytes += 64;
            } else if (input.addressType == "p2tr") {
                totalInputBytes += 57.5;
            }
        })
        const remainingOutput = outputs.find(o => o.sendRemaining);
        const totalBytes = 10.5 + totalInputBytes + totalFixedOutputLength + (remainingOutput ? 43 : 0);
        const feesPerVByte = await this.fetchFeePerVbyte();
        const fee = feesPerVByte * totalBytes;
        const remainingAmount = Math.floor(((totalAmount - totalFixedOutputAmount) * 1e8) - fee);
        if (remainingOutput && remainingAmount > 547) {
            psbt.addOutput({
                address: remainingOutput.address,
                value: remainingAmount,
            });
        }
        console.log(remainingAmount, totalAmount);
        // 2. Sign inputs
        for (let i = 0; i < inputs_.length; i++) {
            if (inputs_[i].addressType == "p2tr") {
                const tweakedSigner = inputs_[i].keyPair.tweak(
                    bitcoin.crypto.taggedHash('TapTweak', this.toXOnly(inputs_[i].keyPair.publicKey)),
                );
                psbt.signInput(i, tweakedSigner);
            } else {
                psbt.signInput(i, inputs_[i].keyPair);
                psbt.validateSignaturesOfInput(i, this.safeVerify, Buffer.from(inputs_[i].keyPair.publicKey));
            }
        }
        // 5. Finalize & extract final tx
        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        return tx.toHex();
    }
    async sendBitcoinTaproot(input: TxInput, outputs: TxOutput[]) {
        const keyPair = this.ECPair.fromWIF(input.privateKey);
        const XOnlyPubkey = this.toXOnly(Buffer.from(keyPair.publicKey))
        const p2wtr = bitcoin.payments.p2tr({
            internalPubkey: XOnlyPubkey,
            network: this.network
        })
        const p2wtr_main = bitcoin.payments.p2tr({
            internalPubkey: XOnlyPubkey,
            network: bitcoin.networks.bitcoin
        })
        console.log(p2wtr.address, p2wtr_main.address);
        const tweakedChildNode = keyPair.tweak(
            bitcoin.crypto.taggedHash('TapTweak', XOnlyPubkey),
        );

        const psbt = new bitcoin.Psbt({ network: this.network });
        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            witnessUtxo: {
                value: (input.amount * 1e8),
                script: p2wtr.output!
            },
            tapInternalKey: XOnlyPubkey,
            sequence: 4294967293
        })
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
                value: output.amount ? Math.floor(output.amount * 1e8) : (output.sendRemaining ? Math.floor(((input.amount - total) * 1e8) - fee) : 0), // subtract fee (e.g., 1000 sats)
            });
        }

        psbt.signInput(0, tweakedChildNode)
        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        // console.log(tx.toHex())
        return tx.toHex();
    }
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
            sequence: 4294967293
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

    async sendBitcoinKeyHash(rawtx: string, vout: Vout, outputs: TxOutput[], privateKey: string) {
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
        if (this.rpc == "") {
            throw new Error("RPC not set. Can\'t broadcast transaction")
        }
        try {
            const data = {
                jsonrpc: "1.0",
                id: "curltest",
                method: "sendrawtransaction",
                params: [tx]
            }
            const response = await axios.post(this.rpc, JSON.stringify(data), this.apiKey ? {
                headers: {
                    'x-api-key': this.apiKey
                }
            } : undefined);
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
            if (this.rpc == "") {
                throw new Error("RPC not set. Can\'t broadcast transaction")
            }
            const data = {
                jsonrpc: "1.0",
                id: "curltest",
                method: "estimatesmartfee",
                params: [6]
            }
            const response = await axios.post(this.rpc, JSON.stringify(data), this.apiKey ? {
                headers: {
                    'x-api-key': this.apiKey
                }
            } : undefined);
            if (response.status == 200) {
                console.log(response.data);
                return response.data.result?.feerate * 1e5;
            }
            throw new Error("Transaction Invalid");
        } catch (error) {
            console.log("Broadcast Transaction Failed");
            // throw error
            if (this.networkName == "mainnet") {
                return 1;
            } else {
                return 1.2;
            }
        }
    }
}
