// const btc = new Bitcoin();

// const addressObject = {
//     address: 'mnUVDize2xtFDvrHrbn3j2mEVMo5YxVABQ',
//     bchAddress: 'bchtest:qpx9zu4zd262vt2rvkvc5w2dmr2hfe0m9scyxv5ued',
//     privateKey: 'L2T7UtdABsezrqjv3razhvfiDNBXgaezu9RRv3C6sYULAgWWcW5g'
// }
// https://blockexplorer.one/bitcoin/testnet/tx/85a5f23220cc7c19eb86d0c61342611f5fcfc2dbd96f5cce09ea42c5e08658c1
// https://blockexplorer.one/bitcoin/testnet/tx/9e171929820f74b4ea62543c278161003dc2475a144afa36c6caf8e3fb8981c9
// https://blockexplorer.one/bitcoin/testnet/tx/1ce16435561c7d3b9aa3eb99165af655528315df2e1c4c8aeb6824e8b03e8b5f
const utxo = {
    amount: 0.00117331, // value
    vout: 0, // n
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
const rawTx = "02000000000101c98189fbe3f8cac636fa4a145a47c23d006181273c5462eab4740f822919179e0000000000ffffffff0153ca0100000000001600141468947182f1439c925c6dd0af0fd89525fcc6e002473044022068b4bb1cbd8fac07db8843036cba4afb87da84bf4db6f7a840d72a022cb78bca0220206ef90b92fca7329eb84f42c45d68f081cfc56a72c75051ecc6f94f8c420b1f0121034dbdd80abed7bc8ab7119ecf8f1c61e10d84832440ddbf5ed0e7266c26d1d00000000000";

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
btc.sendBitcoinSegWit(utxo, 
    [{ 
        address: toAddress.address,
        amount: 0.001 
    },
    { 
        address: toAddress.address,
        sendRemaining: true 
    }], 
    addressObject.privateKey)
// CMA
// Fees Wallet
// Public Key Hash
// const tx = btc.sendBitcoin(rawTx, utxo, [{ address: toAddress.address, amount: 0.0012 }], addressObject.privateKey)

.then(tx=>{
    console.log("Raw Transaction:", tx);
    btc.broadcastTransaction(tx)
    .then(response=>{console.log("Broadcast Response",response)})
    .catch(err=>console.log(err));
}).catch(console.error);


