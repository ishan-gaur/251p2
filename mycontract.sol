// Please paste your contract's solidity code here
// Note that writing a contract here WILL NOT deploy it and allow you to access it from your client
// You should write and develop your contract in Remix and then, before submitting, copy and paste it here
// 
pragma solidity >=0.8.9 <0.9.0;

struct IOU {
    address creditor;
    uint32 amount;
}

contract BlockchainSplitwise {
    mapping (address => IOU[]) balances; // list instead of map so it can be used for bfs to get neighbors
    
    function lookup(address debtor, address creditor) public view returns (uint32) {
        int32 index = lookup_IOU(debtor, creditor);
        uint32 balance = (index < 0) ? 0 : balances[debtor][uint32(index)].amount;
        return balance;
    }
    
    // add_IOU(address creditor, uint32 amount, (list) cycle, uint32 minAmount):
    function add_IOU(address creditor, uint32 amount, address[] calldata cycle, uint32 min_debt) external {
        // amount > 0 but uint so fine? unless positive != non-negative
        require(amount > 0);
        
        address debtor = msg.sender;
        int32 index = lookup_IOU(debtor, creditor);
        // uint32 min_debt = type(uint32).max;
        
        if (index < 0) {
            balances[debtor].push(IOU({creditor: creditor, amount: amount}));
        } else {
            balances[debtor][uint32(index)].amount += amount;
        }
        
        /*
        if (cycle.length > 2) {
            for (uint32 i = 0; i < cycle.length - 1; i++) {
                uint32 debt = lookup(cycle[i], cycle[i+1]);
                min_debt = (min_debt > debt) ? debt : min_debt; //  will end up 0 if they didn't give a real cycle
            }
        }
        
        if (min_debt > 0 && min_debt != type(uint32).max) {    // updated with valid value for a valid cycle
            for (uint32 i = 0; i < cycle.length - 1; i++) {
                index = lookup_IOU(cycle[i], cycle[i+1]);
                assert(index >= 0);
                balances[debtor][uint32(index)].amount -= min_debt;
            }   
        }
        */
        
        if (min_debt > 0) {
            require(cycle.length > 2); // technically this is one more than the real cycle length
            for (uint32 i = 0; i < cycle.length - 1; i++) {
                index = lookup_IOU(cycle[i], cycle[i+1]);
                assert(index >= 0);
                require(balances[cycle[i]][uint32(index)].amount >= min_debt);
                balances[cycle[i]][uint32(index)].amount -= min_debt;
            }
        }
    }
    
    function lookup_IOU(address debtor, address creditor) internal view returns (int32) {
        for (uint32 i = 0; i < balances[debtor].length; i++) {
            if (balances[debtor][i].creditor == creditor) {
                return int32(i);
            }
        }
        return -1; // not found
    }
    
    function user_IOUs(address debtor) external view returns (IOU[] memory) {
        return balances[debtor];
    }
}