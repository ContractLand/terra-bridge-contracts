pragma solidity ^0.4.23;

import "./interfaces/IBridgeValidators.sol";
import "./libraries/SafeMath.sol";

contract BasicBridge {
    using SafeMath for uint256;

    /* Beginning of V1 storage variables */
    address public validatorContractAddress;
    uint256 public gasPrice;
    uint256 public requiredBlockConfirmations;
    uint256 public deployedAtBlock;
    uint256 public minPerTx;
    uint256 public maxPerTx;
    uint256 public dailyLimit;
    mapping(uint256 => uint256) public totalSpentPerDay;
    /* End of V1 storage variables */

    event GasPriceChanged(uint256 gasPrice);
    event RequiredBlockConfirmationChanged(uint256 requiredBlockConfirmations);
    event DailyLimit(uint256 newLimit);

    function validatorContract() public view returns(IBridgeValidators) {
        return IBridgeValidators(validatorContractAddress);
    }

    modifier onlyValidator() {
        require(validatorContract().isValidator(msg.sender));
        _;
    }

    modifier onlyOwner() {
        require(validatorContract().owner() == msg.sender);
        _;
    }

    function setGasPrice(uint256 _gasPrice) public onlyOwner {
        require(_gasPrice > 0);
        gasPrice = _gasPrice;
        emit GasPriceChanged(_gasPrice);
    }

    function setRequiredBlockConfirmations(uint256 _blockConfirmations) public onlyOwner {
        require(_blockConfirmations > 0);
        requiredBlockConfirmations = _blockConfirmations;
        emit RequiredBlockConfirmationChanged(_blockConfirmations);
    }

    function getCurrentDay() public view returns(uint256) {
        return now / 1 days;
    }

    function setDailyLimit(uint256 _dailyLimit) public onlyOwner {
        dailyLimit = _dailyLimit;
        emit DailyLimit(_dailyLimit);
    }

    function setMaxPerTx(uint256 _maxPerTx) external onlyOwner {
        require(_maxPerTx < dailyLimit);
        maxPerTx = _maxPerTx;
    }

    function setMinPerTx(uint256 _minPerTx) external onlyOwner {
        require(_minPerTx < dailyLimit && _minPerTx < maxPerTx);
        minPerTx = _minPerTx;
    }

    function withinLimit(uint256 _amount) public view returns(bool) {
        uint256 nextLimit = totalSpentPerDay[getCurrentDay()].add(_amount);
        return dailyLimit >= nextLimit && _amount <= maxPerTx && _amount >= minPerTx;
    }

    function requiredSignatures() public view returns(uint256) {
        return validatorContract().requiredSignatures();
    }
}
