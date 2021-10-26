// =============================================================================
//                                  Config
// =============================================================================

let web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");

// Constant we use later
var GENESIS = '0x0000000000000000000000000000000000000000000000000000000000000000';

// This is the ABI for your contract (get it from Remix, in the 'Compile' tab)
// ============================================================
var abi = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "creditor",
				"type": "address"
			},
			{
				"internalType": "uint32",
				"name": "amount",
				"type": "uint32"
			},
			{
				"internalType": "address[]",
				"name": "cycle",
				"type": "address[]"
			},
			{
				"internalType": "uint32",
				"name": "min_debt",
				"type": "uint32"
			}
		],
		"name": "add_IOU",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "debtor",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "creditor",
				"type": "address"
			}
		],
		"name": "lookup",
		"outputs": [
			{
				"internalType": "uint32",
				"name": "",
				"type": "uint32"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "debtor",
				"type": "address"
			}
		],
		"name": "user_IOUs",
		"outputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "creditor",
						"type": "address"
					},
					{
						"internalType": "uint32",
						"name": "amount",
						"type": "uint32"
					}
				],
				"internalType": "struct IOU[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]; // FIXME: fill this in with your contract's ABI //Be sure to only have one array, not two

// ============================================================
abiDecoder.addABI(abi);
// call abiDecoder.decodeMethod to use this - see 'getAllFunctionCalls' for more

var contractAddress = '0xddd4315a9D84c2DAEc804dd71b45DE3DE53e50B9'; // FIXME: fill this in with your contract's address/hash
var BlockchainSplitwise = new web3.eth.Contract(abi, contractAddress, {gas: 220000}); // for super long loop

// =============================================================================
//                            Functions To Implement
// =============================================================================

// TODO: Add any helper functions here!
async function getCreditors(user) {
	let IOUs = await BlockchainSplitwise.methods.user_IOUs(user).call({from:web3.eth.defaultAccount});
	let creditors = IOUs.map((IOU) => { return IOU.creditor; });
	return creditors;
}

// TODO: Return a list of all users (creditors or debtors) in the system
// You can return either:
//   - a list of everyone who has ever sent or received an IOU
// OR
//   - a list of everyone currently owing or being owed money
async function getUsers() {
	let users = new Set();
	let calls = await getAllFunctionCalls(contractAddress, "add_IOU");
	calls.forEach((call) => {
		users.add(call.from);
		users.add(call.args[0]); // creditor
	})
	return Array.from(users);
}

// TODO: Get the total amount owed by the user specified by 'user'
async function getTotalOwed(user) {
	let IOUs = await BlockchainSplitwise.methods.user_IOUs(user).call({from:web3.eth.defaultAccount});
	let debts = IOUs.map((IOU) => { return parseInt(IOU.amount); });
	return debts.reduce((total, debt) => { return total + debt}, 0);
}

// TODO: Get the last time this user has sent or received an IOU, in seconds since Jan. 1, 1970
// Return null if you can't find any activity for the user.
// HINT: Try looking at the way 'getAllFunctionCalls' is written. You can modify it if you'd like.
async function getLastActive(user) {
	user = user.toLowerCase();
	
	let calls = await getAllFunctionCalls(contractAddress, "add_IOU");
	calls = calls.filter((call) => {
		return call.from === user || call.args[0] === user; // sender or creditor
	});
	if (calls.length === 0) { return null; }

	times = calls.map((call) => {
		return call.t; // sender or creditor
	});
	return Math.max(...times);
}

// TODO: add an IOU ('I owe you') to the system
// The person you owe money is passed as 'creditor'
// The amount you owe them is passed as 'amount'
async function add_IOU(creditor, amount) {
	let debtor = web3.eth.defaultAccount; // sender is the debtor
	
	let cycle = await doBFS(creditor, debtor, getCreditors);
	if (cycle === null) { 
		cycle = []; // so we don't send a null argument to the contract
	}
	cycle.unshift(debtor); // insert at front so it can be read as sliding list of debtor/creditor pairs
	
	let min_debt = Number.MAX_SAFE_INTEGER;
	for (let i = 0; i < cycle.length - 1; i++) {
		let debt = await BlockchainSplitwise.methods.lookup(cycle[i], cycle[i+1]).call({from:web3.eth.defaultAccount});
		debt = parseInt(debt, 10);
		if (cycle[i] === debtor && cycle[i+1] === creditor) { // second condition shouldn't be necessary
			debt += amount; // account for the debt that hasn't been added on chain
		}
		console.log("Step " + i + " debt " + debt + " min " + min_debt);
		min_debt = (min_debt > debt) ? debt : min_debt;
	}
	if (min_debt === Number.MAX_SAFE_INTEGER) min_debt = 0;
	
	return BlockchainSplitwise.methods.add_IOU(creditor, amount, cycle, min_debt).send({from:web3.eth.defaultAccount})
}

// =============================================================================
//                              Provided Functions
// =============================================================================
// Reading and understanding these should help you implement the above

// This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
// It returns an array of objects, one for each call, containing the sender ('from'), arguments ('args'), and the timestamp ('t')
async function getAllFunctionCalls(addressOfContract, functionName) {
	var curBlock = await web3.eth.getBlockNumber();
	var function_calls = [];

	while (curBlock !== GENESIS) {
	  var b = await web3.eth.getBlock(curBlock, true);
	  var txns = b.transactions;
	  for (var j = 0; j < txns.length; j++) {
	  	var txn = txns[j];

	  	// check that destination of txn is our contract
			if(txn.to == null){continue;}
	  	if (txn.to.toLowerCase() === addressOfContract.toLowerCase()) {
	  		var func_call = abiDecoder.decodeMethod(txn.input);

				// check that the function getting called in this txn is 'functionName'
				if (func_call && func_call.name === functionName) {
					var time = await web3.eth.getBlock(curBlock);
	  			var args = func_call.params.map(function (x) {return x.value});
	  			function_calls.push({
	  				from: txn.from.toLowerCase(),
	  				args: args,
					t: time.timestamp
	  			})
	  		}
	  	}
	  }
	  curBlock = b.parentHash;
	}
	return function_calls;
}

// We've provided a breadth-first search implementation for you, if that's useful
// It will find a path from start to end (or return null if none exists)
// You just need to pass in a function ('getNeighbors') that takes a node (string) and returns its neighbors (as an array)
async function doBFS(start, end, getNeighbors) {
	var queue = [[start]];
	while (queue.length > 0) {
		var cur = queue.shift();
		var lastNode = cur[cur.length-1]
		if (lastNode === end) {
			return cur;
		} else {
			var neighbors = await getNeighbors(lastNode);
			for (var i = 0; i < neighbors.length; i++) {
				queue.push(cur.concat([neighbors[i]]));
			}
		}
	}
	return null;
}

// =============================================================================
//                                      UI
// =============================================================================

// This sets the default account on load and displays the total owed to that
// account.
web3.eth.getAccounts().then((response)=> {
	web3.eth.defaultAccount = response[0];

	getTotalOwed(web3.eth.defaultAccount).then((response)=>{
		$("#total_owed").html("$"+response);
	});

	getLastActive(web3.eth.defaultAccount).then((response)=>{
		time = timeConverter(response)
		$("#last_active").html(time)
	});
});

// This code updates the 'My Account' UI with the results of your functions
$("#myaccount").change(function() {
	web3.eth.defaultAccount = $(this).val();

	getTotalOwed(web3.eth.defaultAccount).then((response)=>{
		$("#total_owed").html("$"+response);
	})

	getLastActive(web3.eth.defaultAccount).then((response)=>{
		time = timeConverter(response)
		$("#last_active").html(time)
	});
});

// Allows switching between accounts in 'My Account' and the 'fast-copy' in 'Address of person you owe
web3.eth.getAccounts().then((response)=>{
	var opts = response.map(function (a) { return '<option value="'+
			a.toLowerCase()+'">'+a.toLowerCase()+'</option>' });
	$(".account").html(opts);
	$(".wallet_addresses").html(response.map(function (a) { return '<li>'+a.toLowerCase()+'</li>' }));
});

// This code updates the 'Users' list in the UI with the results of your function
getUsers().then((response)=>{
	$("#all_users").html(response.map(function (u,i) { return "<li>"+u+"</li>" }));
});

// This runs the 'add_IOU' function when you click the button
// It passes the values from the two inputs above
$("#addiou").click(function() {
	web3.eth.defaultAccount = $("#myaccount").val(); //sets the default account
  add_IOU($("#creditor").val(), $("#amount").val()).then((response)=>{
		window.location.reload(true); // refreshes the page after add_IOU returns and the promise is unwrapped
	})
});

// This is a log function, provided if you want to display things to the page instead of the JavaScript console
// Pass in a discription of what you're printing, and then the object to print
function log(description, obj) {
	$("#log").html($("#log").html() + description + ": " + JSON.stringify(obj, null, 2) + "\n\n");
}


// =============================================================================
//                                      TESTING
// =============================================================================

// This section contains a sanity check test that you can use to ensure your code
// works. We will be testing your code this way, so make sure you at least pass
// the given test. You are encouraged to write more tests!

// Remember: the tests will assume that each of the four client functions are
// async functions and thus will return a promise. Make sure you understand what this means.

function check(name, condition) {
	if (condition) {
		console.log(name + ": SUCCESS");
		return 3;
	} else {
		console.log(name + ": FAILED");
		return 0;
	}
}

async function sanityCheck() {
	console.log ("\nTEST", "Simplest possible test: only runs one add_IOU; uses all client functions: lookup, getTotalOwed, getUsers, getLastActive");

	var score = 0;

	var accounts = await web3.eth.getAccounts();
	web3.eth.defaultAccount = accounts[0];

	var users = await getUsers();
	score += check("getUsers() initially empty", users.length === 0);

	var owed = await getTotalOwed(accounts[0]);
	score += check("getTotalOwed(0) initially empty", owed === 0);

	var lookup_0_1 = await BlockchainSplitwise.methods.lookup(accounts[0], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("lookup(0,1) initially 0", parseInt(lookup_0_1, 10) === 0);

	var response = await add_IOU(accounts[1], "10");

	users = await getUsers();
	score += check("getUsers() now length 2", users.length === 2);

	owed = await getTotalOwed(accounts[0]);
	score += check("getTotalOwed(0) now 10", owed === 10);

	lookup_0_1 = await BlockchainSplitwise.methods.lookup(accounts[0], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("lookup(0,1) now 10", parseInt(lookup_0_1, 10) === 10);

	var timeLastActive = await getLastActive(accounts[0]);
	var timeNow = Date.now()/1000;
	var difference = timeNow - timeLastActive;
	score += check("getLastActive(0) works", difference <= 60 && difference >= -3); // -3 to 60 seconds

	console.log("Final Score: " + score +"/21");
	return score;
}

async function sanityCheckSimpleCycle() {
	console.log ("\nTEST", "Two People Cycle");

	var score = 0;

	var accounts = await web3.eth.getAccounts();
	web3.eth.defaultAccount = accounts[0];

	var users = await getUsers();
	score += check("getUsers() initially empty", users.length === 0);

	var owed = await getTotalOwed(accounts[0]);
	score += check("getTotalOwed(0) initially empty", owed === 0);

	var lookup_0_1 = await BlockchainSplitwise.methods.lookup(accounts[0], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("lookup(0,1) initially 0", parseInt(lookup_0_1, 10) === 0);

	var response = await add_IOU(accounts[1], "10");
	console.log("attempt to add 0 --> 1 += 10");

	users = await getUsers();
	score += check("getUsers() now length 2", users.length === 2);

	owed = await getTotalOwed(accounts[0]);
	score += check("getTotalOwed(0) now 10", owed === 10);

	lookup_0_1 = await BlockchainSplitwise.methods.lookup(accounts[0], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("lookup(0,1) now 10", parseInt(lookup_0_1, 10) === 10);

	// 1 owes 0 now
	web3.eth.defaultAccount = accounts[1];
	response = await add_IOU(accounts[0], "5");
	console.log("attempt to add 1 --> 0 += 5");

	owed = await getTotalOwed(accounts[0]);
	score += check("getTotalOwed(0) now 5", owed === 5);
	console.log(owed)

	owed = await getTotalOwed(accounts[1]);
	score += check("getTotalOwed(1) now 0", owed === 0);
	console.log(owed)

	lookup_0_1 = await BlockchainSplitwise.methods.lookup(accounts[0], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("lookup(0,1) now 5", parseInt(lookup_0_1, 10) === 5);

	lookup_1_0 = await BlockchainSplitwise.methods.lookup(accounts[1], accounts[0]).call({from:web3.eth.defaultAccount});
	score += check("lookup(1,0) now 0", parseInt(lookup_1_0, 10) === 0);

	console.log("Final Score: " + score +"/30");
	return score;
}

async function sanityCheckCycle() {
	console.log ("\nTEST", "Ten People Cycle");

	var score = 0;

	var accounts = await web3.eth.getAccounts();
	web3.eth.defaultAccount = accounts[0];

	var users = await getUsers();
	score += check("getUsers() initially empty", users.length === 0);

	for (let i = 0; i < 10; i++) {
		var owed = await getTotalOwed(accounts[i]);
		score += check("getTotalOwed(" + i + ") initially empty", owed === 0);
	}

	for (let i = 0; i < 9; i++) {
		web3.eth.defaultAccount = accounts[i];
		response = await add_IOU(accounts[i+1], "10");
		console.log("attempt to add " + i + " --> " + (i + 1) + " += 10");
		lookup = await BlockchainSplitwise.methods.lookup(accounts[i], accounts[i+1]).call({from:web3.eth.defaultAccount});
		score += check("lookup(" + i + "," + (i + 1) + ") now 10", parseInt(lookup, 10) === 10);
	}

	web3.eth.defaultAccount = accounts[9];
	response = await add_IOU(accounts[0], "10");
	console.log("attempt to add 9 --> 0 += 10");

	for (let i = 0; i < 10; i++) {
		lookup = await BlockchainSplitwise.methods.lookup(accounts[i], accounts[(i+1) % 10]).call({from:web3.eth.defaultAccount});
		score += check("lookup(" + i + "," + ((i+1) % 10) + ") now 0", parseInt(lookup, 10) === 0);
	}

	console.log("Final Score: " + score +"/90");
	return score;
}

async function sendHelper(debtor, creditor, amount) {
	web3.eth.defaultAccount = accounts[debtor];
	var response = await add_IOU(accounts[creditor], amount);
}

async function sanityCheckRandom() {
	console.log ("\nTEST", "Just a bunch of stuff");

	var score = 0;

	var accounts = await web3.eth.getAccounts();
	// 0->1: 20
	web3.eth.defaultAccount = accounts[0];
	var response = await add_IOU(accounts[1], "20");

	// 0->1: 20
	// 1->3: 5
	web3.eth.defaultAccount = accounts[1];
	var response = await add_IOU(accounts[3], "5");

	// 0->1: 20
	// 1->3: 5
	// 3->2: 15
	web3.eth.defaultAccount = accounts[3];
	var response = await add_IOU(accounts[2], "15");

	// 0->1: 20
	// 1->3: 5
	// 3->2: 15
	// 4->5: 10
	web3.eth.defaultAccount = accounts[4];
	var response = await add_IOU(accounts[5], "10");

	// 0->1: 20
	// 1->3: 5
	// 3->2: 15
	// 4->5: 10
	// 3->4: 5
	web3.eth.defaultAccount = accounts[3];
	var response = await add_IOU(accounts[4], "5");

	// 0->1: 20
	// 1->3: 5
	// 3->2: 15
	// 4->5: 10
	// 3->4: 5
	// 5->1: 6
	web3.eth.defaultAccount = accounts[5];
	var response = await add_IOU(accounts[1], "6");

	// 0->1: 20
	// 3->2: 15
	// 5->1: 6
	// 1->3: 5
	// 3->4: 5
	// 4->5: 10

	// 0->1: 20
	// 3->2: 15
	// 5->1: 1
	// 1->3: 0
	// 3->4: 0
	// 4->5: 5

	var lookup = await BlockchainSplitwise.methods.lookup(accounts[0], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("0->1: 20", parseInt(lookup, 10) === 20);
	lookup = await BlockchainSplitwise.methods.lookup(accounts[3], accounts[2]).call({from:web3.eth.defaultAccount});
	score += check("3->2: 15", parseInt(lookup, 10) === 15);
	lookup = await BlockchainSplitwise.methods.lookup(accounts[5], accounts[1]).call({from:web3.eth.defaultAccount});
	score += check("5->1: 1", parseInt(lookup, 10) === 1);
	lookup = await BlockchainSplitwise.methods.lookup(accounts[1], accounts[3]).call({from:web3.eth.defaultAccount});
	score += check("1->3: 0", parseInt(lookup, 10) === 0);
	lookup = await BlockchainSplitwise.methods.lookup(accounts[3], accounts[4]).call({from:web3.eth.defaultAccount});
	score += check("3->4: 0", parseInt(lookup, 10) === 0);
	lookup = await BlockchainSplitwise.methods.lookup(accounts[4], accounts[5]).call({from:web3.eth.defaultAccount});
	score += check("4->5: 5", parseInt(lookup, 10) === 5);

	console.log("Final Score: " + score +"/18");
	return score;
}

// sanityCheck() //Uncomment this line to run the sanity check when you first open index.html
// sanityCheckSimpleCycle()
// sanityCheckCycle()
// sanityCheckRandom()