// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import { UniquePrecompiles } from "@unique-nft/contracts/UniquePrecompiles.sol";
import { CrossAddress, UniqueFungible } from "@unique-nft/solidity-interfaces/contracts/UniqueFungible.sol";

/**
 * @title VestingNative
 * @dev Vesting contract for native currency (UNQ) that supports both Ethereum and Substrate beneficiaries.
 * ALL AMOUNT IS AVAILABLE IMMEDIATELY AFTER THE VESTING PERIOD STARTS.
 */
contract VestingNative is Ownable, UniquePrecompiles {
    event Released(address indexed ethBeneficiary, uint256 indexed subBeneficiary, uint256 amount);
    event BatchAddBenefitiaries(address indexed ethBeneficiary, uint256 indexed subBeneficiary);
    event Donated(address indexed donor, uint256 amount);
    event DonationRefunded(address indexed donor, uint256 amount);

    // Mappings for ETH beneficiaries (keyed by address)
    mapping(address => uint256) private _ethReleased;
    mapping(address => uint256) private _ethAllocated;

    // Mappings for Substrate beneficiaries (keyed by public key)
    mapping(uint256 => uint256) private _subReleased;
    mapping(uint256 => uint256) private _subAllocated;

    mapping(address => uint256) private _donated;
    uint256 public donatedTotal;
    uint256 public releasedTotal;
    uint64 private immutable _start;
    uint64 private immutable _duration;

    UniqueFungible private immutable UNQ;

    constructor(uint64 startTimestamp, uint64 durationSeconds) payable Ownable() {
        require(startTimestamp > block.timestamp, "Start timestamp must be in the future");
        require(durationSeconds > 0, "Duration must be positive");
        
        _start = startTimestamp;
        _duration = durationSeconds;

        // Get the UNQ token contract instance from precompiles
        UNQ = UniqueFungible(COLLECTION_HELPERS.collectionAddress(0));
    }

    function batchAddBenefitiaries(
        CrossAddress[] calldata beneficiaries,
        uint256[] calldata allocatedAmounts
    ) external onlyOwner {
        require(beneficiaries.length == allocatedAmounts.length, "Arrays length mismatch");
        require(beneficiaries.length > 0, "Empty beneficiaries array");
        
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            CrossAddress calldata beneficiary = beneficiaries[i];
            bool isEth = beneficiary.sub == 0;
            
            require(isEth ? beneficiary.eth != address(0) : beneficiary.sub != 0, "Invalid beneficiary address");
            require(allocatedAmounts[i] > 0, "Allocation must be positive");

            if (isEth) {
                require(_ethAllocated[beneficiary.eth] == 0, "ETH Beneficiary already has allocation");
            } else {
                require(_subAllocated[beneficiary.sub] == 0, "Substrate Beneficiary already has allocation");
            }
        }
        
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            CrossAddress calldata beneficiary = beneficiaries[i];
            if (beneficiary.sub == 0) {
                _ethAllocated[beneficiary.eth] = allocatedAmounts[i];
            } else {
                _subAllocated[beneficiary.sub] = allocatedAmounts[i];
            }
            emit BatchAddBenefitiaries(beneficiary.eth, beneficiary.sub);
        }
    }
    
    // --- Getters ---

    function start() public view returns (uint256) { return _start; }
    function duration() public view returns (uint256) { return _duration; }
    function end() public view returns (uint256) { return start() + duration(); }
    function donated(address donor) public view returns (uint256) { return _donated[donor]; }

    function allocatedAmount(CrossAddress calldata beneficiary) external view returns (uint256) {
        return (beneficiary.sub == 0) ? _ethAllocated[beneficiary.eth] : _subAllocated[beneficiary.sub];
    }
    
    function released(CrossAddress calldata beneficiary) public view returns (uint256) {
        return (beneficiary.sub == 0) ? _ethReleased[beneficiary.eth] : _subReleased[beneficiary.sub];
    }

    function vestedAmount(CrossAddress calldata beneficiary, uint64 timestamp) public view returns (uint256) {
        uint256 totalAllocation = (beneficiary.sub == 0) ? _ethAllocated[beneficiary.eth] : _subAllocated[beneficiary.sub];
        return _vestingSchedule(totalAllocation, timestamp);
    }

    function releasable(CrossAddress calldata beneficiary) public view returns (uint256) {
        uint256 vested = vestedAmount(beneficiary, uint64(block.timestamp));
        uint256 alreadyReleased = released(beneficiary);
        return vested > alreadyReleased ? vested - alreadyReleased : 0;
    }

    // --- Core Logic ---

    function releaseFor(CrossAddress calldata beneficiary) public {
        uint256 amount = releasable(beneficiary);
        require(amount > 0, "Nothing to release");
        require(donatedTotal - releasedTotal >= amount, "Insufficient donated funds");

        if (beneficiary.sub == 0) {
            _ethReleased[beneficiary.eth] += amount;
        } else {
            _subReleased[beneficiary.sub] += amount;
        }
        releasedTotal += amount;
        
        emit Released(beneficiary.eth, beneficiary.sub, amount);
        
        (bool success) = UNQ.transferCross(beneficiary, amount);
        require(success, "Native currency transfer failed");
    }

    // --- Donations and Refunds (for ETH addresses only) ---

    receive() external payable { donate(); }

    function donate() public payable {
        require(msg.value > 0, "Amount must be positive");
        _donated[msg.sender] += msg.value;
        donatedTotal += msg.value;
        emit Donated(msg.sender, msg.value);
    }
    
    function refundDonation(uint256 amount) public {
        require(amount > 0, "Amount must be positive");
        require(_donated[msg.sender] >= amount, "Amount exceeds donation");
        
        uint256 availableForRefund = donatedTotal - releasedTotal;
        require(availableForRefund >= amount, "Insufficient funds for refund");
        
        _donated[msg.sender] -= amount;
        donatedTotal -= amount;
        
        emit DonationRefunded(msg.sender, amount);
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Native currency refund failed");
    }

    // --- Vesting Schedule ---
    function _vestingSchedule(uint256 totalAllocation, uint64 timestamp) internal view returns (uint256) {
        if (timestamp < start()) {
            return 0; // Nothing before start
        } else {
            return totalAllocation; // Full amount after start
        }
    }
    
    // --- Utility ---
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