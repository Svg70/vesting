// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestingNative
 * @dev Vesting contract for native currency - ALL AMOUNT AVAILABLE IMMEDIATELY AFTER START
 */
contract VestingNative is Ownable {
    event Released(address indexed beneficiary, uint256 amount);
    event BatchAddBenefitiaries(address indexed beneficiary);
    event Donated(address indexed donor, uint256 amount);
    event DonationRefunded(address indexed donor, uint256 amount);

    mapping(address beneficiary => uint256) private _released;
    mapping(address beneficiary => uint256) private _allocated;
    mapping(address donor => uint256) private _donated;
    uint256 public donatedTotal;
    uint256 public releasedTotal;
    uint64 private immutable _start;
    uint64 private immutable _duration;

    constructor(uint64 startTimestamp, uint64 durationSeconds) payable Ownable() {
        require(startTimestamp > 0, "Start timestamp must be positive");
        require(durationSeconds > 0, "Duration must be positive");
        
        _start = startTimestamp;
        _duration = durationSeconds;
    }

    function batchAddBenefitiaries(
        address[] calldata beneficiaries,
        uint256[] calldata allocatedAmounts
    ) external onlyOwner {
        require(beneficiaries.length == allocatedAmounts.length, "Arrays length mismatch");
        require(beneficiaries.length > 0, "Empty beneficiaries array");
        
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            address beneficiary = beneficiaries[i];
            require(beneficiary != address(0), "Invalid beneficiary address");
            require(_allocated[beneficiary] == 0, "Beneficiary already has allocation");
            require(allocatedAmounts[i] > 0, "Allocation must be positive");
        }
        
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            address beneficiary = beneficiaries[i];
            _allocated[beneficiary] = allocatedAmounts[i];
            emit BatchAddBenefitiaries(beneficiary);
        }
    }

    receive() external payable {
        donate();
    }

    function donate() public payable {
        require(msg.value > 0, "Amount must be positive");
        
        _donated[msg.sender] += msg.value;
        donatedTotal += msg.value;
        
        emit Donated(msg.sender, msg.value);
    }

    function start() public view returns (uint256) {
        return _start;
    }

    function duration() public view returns (uint256) {
        return _duration;
    }

    function end() public view returns (uint256) {
        return start() + duration();
    }

    function released(address beneficiary) public view returns (uint256) {
        return _released[beneficiary];
    }

    function donated(address donor) public view returns (uint256) {
        return _donated[donor];
    }

    function releasable(address beneficiary) public view returns (uint256) {
        uint256 vested = vestedAmount(beneficiary, uint64(block.timestamp));
        uint256 alreadyReleased = released(beneficiary);
        return vested > alreadyReleased ? vested - alreadyReleased : 0;
    }

    function release() public {
        uint256 amount = releasable(msg.sender);
        require(amount > 0, "Nothing to release");
        require(address(this).balance >= amount, "Insufficient contract balance");
        require(releasedTotal + amount <= donatedTotal, "Insufficient donated funds");
        
        _released[msg.sender] += amount;
        releasedTotal += amount;
        
        emit Released(msg.sender, amount);
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Native currency transfer failed");
    }

    function releaseFor(address beneficiary) public {
        require(beneficiary != address(0), "Invalid beneficiary");
        
        uint256 amount = releasable(beneficiary);
        require(amount > 0, "Nothing to release");
        require(address(this).balance >= amount, "Insufficient contract balance");
        require(releasedTotal + amount <= donatedTotal, "Insufficient donated funds");
        
        _released[beneficiary] += amount;
        releasedTotal += amount;
        
        emit Released(beneficiary, amount);
        
        (bool success, ) = beneficiary.call{value: amount}("");
        require(success, "Native currency transfer failed");
    }

    function refundDonation(uint256 amount) public {
        require(amount > 0, "Amount must be positive");
        require(_donated[msg.sender] >= amount, "Amount exceeds donation");
        
        uint256 availableForRefund = donatedTotal - releasedTotal;
        require(availableForRefund >= amount, "Insufficient funds for refund");
        require(address(this).balance >= amount, "Insufficient contract balance");
        
        _donated[msg.sender] -= amount;
        donatedTotal -= amount;
        
        emit DonationRefunded(msg.sender, amount);
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Native currency refund failed");
    }

    function vestedAmount(address beneficiary, uint64 timestamp) public view returns (uint256) {
        return _vestingSchedule(_allocated[beneficiary], timestamp);
    }

    function allocatedAmount(address beneficiary) external view returns (uint256) {
        return _allocated[beneficiary];
    }

    /**
     * БЕЗ ВЕСТИНГА ПО ВРЕМЕНИ - ВСЁ ДОСТУПНО СРАЗУ ПОСЛЕ СТАРТА!
     */
    function _vestingSchedule(uint256 totalAllocation, uint64 timestamp) internal view returns (uint256) {
        if (timestamp < start()) {
            // До старта - ничего
            return 0;
        } else {
            // После старта - ВСЯ СУММА СРАЗУ!
            return totalAllocation;
        }
    }
    
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    function emergencyWithdraw() external onlyOwner {
        require(releasedTotal == 0, "Cannot withdraw after releases started");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        
        donatedTotal = 0;
        
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Withdrawal failed");
    }
}