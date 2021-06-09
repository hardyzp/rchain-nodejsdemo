var express      = require('express');
var app          = express();
var bodyParser   = require("body-parser");
var http         = require('http');
var keythereum   = require("keythereum");  
var request      = require('request');
var bigInt       = require("big-integer");
const { ec } = require("elliptic");
const secp256k1 = new ec("secp256k1");
const { RClient, VaultAPI ,template} = require(".");
const { getAddrFromPrivateKey, signDeploy } = require("@tgrospic/rnode-grpc-js");
const {
  MAINNET_SERVER,
  READONLY_SERVER,
  TESTNET_OBSERVER,
  TESTNET_SERVER,
} = require("./server");
const logger = log4js.getLogger();
app.listen(8081,'0.0.0.0',()=>console.log('sss'));
app.use(bodyParser.urlencoded({ extended: false }));
var pri = '';
app.post('/v1/createAccount', function(req, res) {
	var params = { keyBytes: 32, ivBytes: 16 };
	var address = '';
	var dk = keythereum.create(params);
	pri    = dk.privateKey.toString('hex');
	address      = getAddrFromPrivateKey(pri).revAddr;		
	res.json({code:200,data:{address:address},messages:'success'});
});
app.get('/v1/balance/:account', function(req, res) {
	let params    = req.params
	let address   = params.account;
	(async () => {
	   const client  = new RClient(READONLY_SERVER[0], 40401);
	   const vault   = new VaultAPI(client);
	   const balance = await vault.getBalance(address);
	   res.json({code:200,data:{balance:balance},messages:'success'});
	})().catch((e) => {
	   console.log(e);
	   res.json({code:500,data:e,messages:'fail'});
	});
});

app.post('/v1/revTransfer', function(req, res) {
	var from         = req.body.from;     
	var to           = req.body.to;
	var phloPrice    = req.body.phloPrice;
	var phloLimit    = req.body.phloLimit;	
	var amount       = req.body.amount;   //十进制
	var privateKey   = pri;
	(async () => {
	   var result       = await transfer(from,to,amount,privateKey,phloPrice,phloLimit);
	   res.json({code:200,data:{result:result},messages:'success'});
	})().catch((e) => {
	   console.log(e);
	   res.json({code:500,data:e,messages:'fail'});
	});
});
app.post('/api/v1/block', function(req, res) {
	var  deployID          = req.body.deployid; 
	const exploratory_term = 'new return in{return!("a")}';
	(async () => {
	    var client = new RClient(READONLY_SERVER[0], 40401);
		var blockInfos = await client.getBlocks(10);
		const latestBlockNumber = blockInfos[0].blockinfo.blocknumber
		const finalized = await client.lastFinalizedBlock()
		var blockByDeployId = await client.findDeploy(deployID)
		var result = await client.exploratoryDeploy(exploratory_term);
		client.closeClient()
		console.log(result.result.block)
		res.json({code:200,data:result,messages:'fail'});
	})().catch((e) => {
	   res.json({code:500,data:e,messages:'fail'});
	});
});

async function transfer(from,to,amount,privateKey,phloPrice,phloLimit){
  var client = new RClient(READONLY_SERVER[0], 40401);
  const lastestBlocks =  await client.getBlocks(1);
  const latestBlock   = lastestBlocks[0];
  const latestBlockNumber = latestBlock.blockinfo.blocknumber;
  const contract = template.TRANSFER_ENSURE_TO_RHO_TPL.replace("$from", from)
    .replace("$toAddr", to)
    .replace("$to", to)
    .replace("$amount", amount);
  const timestamp = Date.now()
  const signedDeploy = signDeploy(privateKey, {
    term: contract,
    phloprice: phloPrice,
    phlolimit: phloLimit,
    validafterblocknumber: latestBlockNumber,
    timestamp: timestamp,
  });
  //console.log(signedDeploy)
  const  Tclient = new RClient(MAINNET_SERVER[0], 40401);
  const resp = await Tclient.deployService.doDeploy(signedDeploy)
  client.closeClient()
  //console.log(resp)
  return resp;
}
