"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bitcoin = void 0;
const bitcoin = __importStar(require("bitcoinjs-lib"));
const ecc = __importStar(require("tiny-secp256k1"));
const ecpair_1 = require("ecpair");
const bchaddrjs_1 = __importDefault(require("bchaddrjs"));
const axios_1 = __importDefault(require("axios"));
bitcoin.initEccLib(ecc);
class Bitcoin {
    constructor(rpc, networkName) {
        this.networks = bitcoin.networks;
        this.network = bitcoin.networks.bitcoin;
        this.ECPair = (0, ecpair_1.ECPairFactory)(ecc);
        this.bufferToUint8Array = (b) => b instanceof Buffer ? new Uint8Array(b) : b;
        this.safeVerify = (pubkey, msgHash, signature) => {
            if (msgHash.length !== 32)
                return false;
            return ecc.verify(this.bufferToUint8Array(msgHash), this.bufferToUint8Array(pubkey), this.bufferToUint8Array(signature));
        };
        this.rpc = rpc;
        this.networkName = networkName;
        this.network = networkName == "mainnet" ?
            bitcoin.networks.bitcoin :
            networkName == "testnet" ? bitcoin.networks.testnet
                : bitcoin.networks.regtest;
    }
    static generateAddress(networkName, type) {
        const ECPair = (0, ecpair_1.ECPairFactory)(ecc);
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
        });
        let bchaddr = bchaddrjs_1.default.toCashAddress(bchHash.address || "");
        return { address: hash.address || "", bchAddress: bchaddr, privateKey };
    }
    sendBitcoinSegWit(vout, outputs, privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const keyPair = this.ECPair.fromWIF(privateKey);
            const signer = {
                publicKey: Buffer.from(keyPair.publicKey), // fixes the type issue
                sign: (hash) => Buffer.from(keyPair.sign(hash)),
                signSchnorr: keyPair.signSchnorr ? (hash) => {
                    const sig = keyPair.signSchnorr(hash); // safe to use non-null assertion
                    return Buffer.from(sig); // convert to Buffer
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
                    script: p2wpkh.output,
                    value: Math.floor(vout.amount * 1e8),
                },
            });
            let total = 0;
            for (let output of outputs) {
                const outputLength = psbt.txOutputs.length;
                const inputLength = psbt.inputCount;
                // const fee = psbt.getFee();
                // const dataBytes = 148 * inputLength + 34 * outputLength
                const feesPerVByte = yield this.fetchFeePerVbyte();
                const dataBytes = 10 + (68 * inputLength) + (31 * (outputLength + 1));
                const fee = Math.ceil(feesPerVByte * dataBytes);
                console.log("fee", dataBytes, fee, feesPerVByte);
                if (output.amount) {
                    total += output.amount;
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
        });
    }
    sendBitcoin(rawtx, vout, outputs, privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const keyPair = this.ECPair.fromWIF(privateKey);
            // const address = bitcoin.payments.p2pkh({
            //     pubkey: Buffer.from(keyPair.publicKey),
            //     network: this.network
            // }).address!; // or p2wpkh, depending on key usage
            const signer = {
                publicKey: Buffer.from(keyPair.publicKey), // fixes the type issue
                sign: (hash) => Buffer.from(keyPair.sign(hash)),
                signSchnorr: keyPair.signSchnorr ? (hash) => {
                    const sig = keyPair.signSchnorr(hash); // safe to use non-null assertion
                    return Buffer.from(sig); // convert to Buffer
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
                nonWitnessUtxo: Buffer.from(rawtx, // REQUIRED for p2pkh!
                "hex"),
            });
            let total = 0;
            for (let output of outputs) {
                const outputLength = psbt.txOutputs.length;
                const inputLength = psbt.inputCount;
                // const fee = psbt.getFee();
                const dataBytes = 10 + (148 * inputLength) + (34 * (outputLength + 1));
                const fee = Number((Math.ceil((yield this.fetchFeePerVbyte()) * (10 ** 8) * dataBytes) / (10 ** 18)).toFixed(8));
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
        });
    }
    broadcastTransaction(tx) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = {
                    jsonrpc: "1.0",
                    id: "curltest",
                    method: "sendrawtransaction",
                    params: [tx]
                };
                const response = yield axios_1.default.post(this.rpc, JSON.stringify(data));
                if (response.status == 200) {
                    console.log(response.data);
                    return response.data;
                }
                throw new Error("Transaction Invalid");
            }
            catch (error) {
                console.log("Broadcast Transaction Failed");
                throw error;
            }
        });
    }
    fetchFeePerVbyte() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const data = {
                    jsonrpc: "1.0",
                    id: "curltest",
                    method: "estimatesmartfee",
                    params: [6]
                };
                const response = yield axios_1.default.post(this.rpc, JSON.stringify(data));
                if (response.status == 200) {
                    console.log(response.data);
                    return ((_a = response.data.result) === null || _a === void 0 ? void 0 : _a.feerate) * 1e5;
                }
                throw new Error("Transaction Invalid");
            }
            catch (error) {
                console.log("Broadcast Transaction Failed");
                // throw error
                if (this.networkName == "mainnet") {
                    return 20;
                }
                else {
                    return 1.2;
                }
            }
            // if (this.networkName == "mainnet") {
            //     estimatesmartfee
            //     return 1.2
            // } else {
            //     return 1.2
            // }
        });
    }
}
exports.Bitcoin = Bitcoin;
