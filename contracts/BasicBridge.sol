pragma solidity 0.4.24;

import "./interfaces/IBridgeValidators.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract BasicBridge {
    using SafeMath for uint256;

    /* --- EVENTS --- */

    event GasPriceChanged(uint256 gasPrice);
    event RequiredBlockConfirmationChanged(uint256 requiredBlockConfirmations);
    event DailyLimit(address token, uint256 newLimit);

    /* --- MODIFIERs --- */

    modifier onlyValidator() {
        require(validatorContract().isValidator(msg.sender));
        _;
    }

    modifier onlyOwner() {
        require(validatorContract().owner() == msg.sender);
        _;
    }

    /* --- FIELDS --- */

    /* Beginning of V1 storage variables */
    address public validatorContractAddress;
    uint256 public gasPrice; // Used by bridge client to determine proper gas price for corresponding chain
    uint256 public requiredBlockConfirmations; // Used by bridge client to determine proper number of blocks to wait before validating transfer
    uint256 public deployedAtBlock; // Used by bridge client to determine initial block number to start listening for transfers
    mapping(address => uint256) public minPerTx;
    mapping(address => uint256) public maxPerTx; // Set to 0 to disable
    mapping(address => uint256) public dailyLimit; // Set to 0 to disable
    mapping(address => mapping(uint256 => uint256)) public totalSpentPerDay;
    /* End of V1 storage variables */

    /* --- EXTERNAL / PUBLIC  METHODS --- */

    function setMaxPerTx(address token, uint256 _maxPerTx) external onlyOwner {
        require(_maxPerTx < dailyLimit[token]);
        maxPerTx[token] = _maxPerTx;
    }

    function setMinPerTx(address token, uint256 _minPerTx) external onlyOwner {
        require(_minPerTx < dailyLimit[token] && _minPerTx < maxPerTx[token]);
        minPerTx[token] = _minPerTx;
    }

    function setGasPrice(uint256 _gasPrice) external onlyOwner {
        require(_gasPrice > 0);
        gasPrice = _gasPrice;
        emit GasPriceChanged(_gasPrice);
    }

    function setRequiredBlockConfirmations(uint256 _blockConfirmations) external onlyOwner {
        require(_blockConfirmations > 0);
        requiredBlockConfirmations = _blockConfirmations;
        emit RequiredBlockConfirmationChanged(_blockConfirmations);
    }

    function setDailyLimit(address token, uint256 _dailyLimit) external onlyOwner {
        dailyLimit[token] = _dailyLimit;
        emit DailyLimit(token, _dailyLimit);
    }

    function withinLimit(address token, uint256 _amount) public view returns(bool) {
        uint256 nextLimit = totalSpentPerDay[token][getCurrentDay()].add(_amount);
        return dailyLimit[token] >= nextLimit && _amount <= maxPerTx[token] && _amount >= minPerTx[token];
    }

    function requiredSignatures() public view returns(uint256) {
        return validatorContract().requiredSignatures();
    }

    function validatorContract() public view returns(IBridgeValidators) {
        return IBridgeValidators(validatorContractAddress);
    }

    function getCurrentDay() public view returns(uint256) {
        return block.timestamp / 1 days;
    }
}
