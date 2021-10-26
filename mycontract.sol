pragma solidity >=0.8.9 <0.9.0;

struct IOU {
    address creditor;
    uint32 amount;
}

contract BlockchainSplitwise {
    mapping (address => IOU[]) balances; // list instead of map so it can be used for bfs to get neighbors
    
    // changed public to external as I don't use it in my code
    function lookup(address debtor, address creditor) external view returns (uint32) {
        if (debtor == creditor) { return 0; }
        int32 index = lookup_IOU(debtor, creditor);
        uint32 balance = (index < 0) ? 0 : balances[debtor][uint32(index)].amount;
        return balance;
    }
    
    function add_IOU(address creditor, uint32 amount, address[] calldata cycle, uint32 min_debt) external {
        // since positive != non-negative
        require(amount > 0);
        
        address debtor = msg.sender;
        require(debtor != creditor);
        int32 index = lookup_IOU(debtor, creditor);
        
        if (index < 0) {
            balances[debtor].push(IOU({creditor: creditor, amount: amount}));
        } else {
            balances[debtor][uint32(index)].amount += amount;
        }
        
        if (min_debt > 0) {
            // not a real cycle
            require(cycle.length > 2); // technically this is one more than the real cycle length
            // in case having this loop run for a long time can be used for an attack
            require(cycle.length <= 11); // 11 because we want 10 jumps
            for (uint32 i = 0; i < cycle.length - 1; i++) {
                index = lookup_IOU(cycle[i], cycle[i+1]);
                assert(index >= 0);
                require(balances[cycle[i]][uint32(index)].amount >= min_debt); // to prevent uint underflow wierdness
                balances[cycle[i]][uint32(index)].amount -= min_debt;
            }
        }
    }
    
    // finds IOU for debtor:creditor pair because each debtor's list is only ordered by time added
    function lookup_IOU(address debtor, address creditor) internal view returns (int32) {
        for (uint32 i = 0; i < balances[debtor].length; i++) {
            if (balances[debtor][i].creditor == creditor) { return int32(i); }
        }
        return -1; // not found
    }
    
    // getter so we don't ship off the entire map each time
    function user_IOUs(address debtor) external view returns (IOU[] memory) {
        return balances[debtor];
    }
}
