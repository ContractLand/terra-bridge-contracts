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
    mapping(address => uint256) public minPerTx;
    mapping(address => uint256) public maxPerTx; // Set to 0 to disable
    mapping(address => uint256) public dailyLimit; // Set to 0 to disable
    mapping(address => mapping(uint256 => uint256)) public totalSpentPerDay;
    /* End of V1 storage variables */

    event GasPriceChanged(uint256 gasPrice);
    event RequiredBlockConfirmationChanged(uint256 requiredBlockConfirmations);
    event DailyLimit(address token, uint256 newLimit);

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
    
    function setDailyLimit(address token, uint256 _dailyLimit) public onlyOwner {
        dailyLimit[token] = _dailyLimit;
        emit DailyLimit(token, _dailyLimit);
    }

    function setMaxPerTx(address token, uint256 _maxPerTx) external onlyOwner {
        require(_maxPerTx < dailyLimit[token]);
        maxPerTx[token] = _maxPerTx;
    }

    function setMinPerTx(address token, uint256 _minPerTx) external onlyOwner {
        require(_minPerTx < dailyLimit[token] && _minPerTx < maxPerTx[token]);
        minPerTx[token] = _minPerTx;
    }

    function withinLimit(address token, uint256 _amount) public view returns(bool) {
        uint256 nextLimit = totalSpentPerDay[token][getCurrentDay()].add(_amount);
        return dailyLimit[token] >= nextLimit && _amount <= maxPerTx[token] && _amount >= minPerTx[token];
    }

    function requiredSignatures() public view returns(uint256) {
        return validatorContract().requiredSignatures();
    }
}
