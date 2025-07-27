"use strict";
// const btc = new Bitcoin();
Object.defineProperty(exports, "__esModule", { value: true });
const bitcoin_1 = require("@codepartner/bitcoin");
// const addressObject = {
//     address: 'mnUVDize2xtFDvrHrbn3j2mEVMo5YxVABQ',
//     bchAddress: 'bchtest:qpx9zu4zd262vt2rvkvc5w2dmr2hfe0m9scyxv5ued',
//     privateKey: 'L2T7UtdABsezrqjv3razhvfiDNBXgaezu9RRv3C6sYULAgWWcW5g'
// }
// https://blockexplorer.one/bitcoin/testnet/tx/85a5f23220cc7c19eb86d0c61342611f5fcfc2dbd96f5cce09ea42c5e08658c1
// https://blockexplorer.one/bitcoin/testnet/tx/9e171929820f74b4ea62543c278161003dc2475a144afa36c6caf8e3fb8981c9
// https://blockexplorer.one/bitcoin/testnet/tx/1ce16435561c7d3b9aa3eb99165af655528315df2e1c4c8aeb6824e8b03e8b5f
const utxo = [{
        amount: 0.00157815, // value
        vout: 0, // n
        txid: "b7eb43ac4aff25bd97d146336bbd6c05c7921a1037a85e923947b3d31f26d7ca",
        privateKey: "L4udjVjAohj3d2VtFSueY13txiSAANjgczH7MwStgqUE3mDbestZ",
        addressType: "p2tr"
    }];
const addressObject = {
    address: 'tb1p2tmxleergln09sdgwcynxme840pz0m0rfa4wvjx6h496n9q9rt9s6n0ak8',
    bchAddress: 'bchtest:qqrdh69c3dvdykwx6kfu9n0ffq46kcr5cqyvtgs6j5',
    privateKey: 'L4udjVjAohj3d2VtFSueY13txiSAANjgczH7MwStgqUE3mDbestZ'
};
const toAddress = {
    address: 'tb1pre6t2r0e7swjquzpdg4qyls4rcc94lgydz2cn5jgg9eu9t5kqjuqhrf6j7',
    bchAddress: 'bchtest:qqmqkcdm60y70zux0vuxzeu47gtkfgvrlsva7yc8tl',
    privateKey: 'KyNk9uWsXGdpGcqH9MSTYX2WYt8jfE2KqJ2VCYQseHTX3pCf671X'
};
const rawTx = "02000000000101c98189fbe3f8cac636fa4a145a47c23d006181273c5462eab4740f822919179e0000000000ffffffff0153ca0100000000001600141468947182f1439c925c6dd0af0fd89525fcc6e002473044022068b4bb1cbd8fac07db8843036cba4afb87da84bf4db6f7a840d72a022cb78bca0220206ef90b92fca7329eb84f42c45d68f081cfc56a72c75051ecc6f94f8c420b1f0121034dbdd80abed7bc8ab7119ecf8f1c61e10d84832440ddbf5ed0e7266c26d1d00000000000";
// 0.00119868 - 0.00003440
// ===========================
// Generate Address
// ===========================
// console.log("Address: ", Bitcoin.generateAddress('testnet', 'taproot'))
// ===========================
// Send Transaction
// ===========================
const rpcTestnetV3 = "https://bitcoin-testnet.g.alchemy.com/v2/D7iVzbC_LzMwoRzi58DhtYnv_pqG2EEq";
const rpcTestNetv4 = "https://bitcoin-testnet4.gateway.tatum.io/";
const btc = new bitcoin_1.Bitcoin(rpcTestNetv4, "testnet", 't-6885931e8aee15b442b733e5-a69815617c764589bbdc6a69');
// SegWit [p2wpkh]
// btc.sendBitcoinTaproot(utxo[0],
//     [
//         // {
//         //     address: toAddress.address,
//         //     amount: 0.001
//         // },
//         {
//             address: toAddress.address,
//             sendRemaining: true
//         }
//     ])
btc.sendBitcoin(utxo, [
    // {
    //     address: toAddress.address,
    //     amount: 0.001
    // },
    {
        address: toAddress.address,
        sendRemaining: true
    }
])
    // Public Key Hash
    // const tx = btc.sendBitcoin(rawTx, utxo, [{ address: toAddress.address, amount: 0.0012 }], addressObject.privateKey)
    .then(tx => {
    console.log("Raw Transaction:", tx);
    // btc.broadcastTransaction(tx)
    // .then(response=>{console.log("Broadcast Response",response)})
    // .catch(err=>console.log(err));
}).catch(console.error);
