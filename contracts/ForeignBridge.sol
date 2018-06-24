pragma solidity ^0.4.23;

import "./libraries/SafeMath.sol";
import "./libraries/Message.sol";
import "./BasicBridge.sol";
import "./interfaces/ERC20Token.sol";
import "./migrations/Initializable.sol";

contract ForeignBridge is BasicBridge, Initializable {
    using SafeMath for uint256;

    /* Beginning of V1 storage variables */
    uint256 public gasLimitDepositRelay;
    uint256 public gasLimitWithdrawConfirm;
    // mapping between the deposit transaction hash from the HomeBridge to whether the deposit has been processed
    mapping(bytes32 => bool) public deposits;
    /* End of V1 storage variables */

    // Triggered when relay of deposit from HomeBridge is complete
    event Deposit(address token, address recipient, uint value, bytes32 transactionHash);
    // Event created on money withdraw.
    event Withdraw(address token, address recipient, uint256 value);
    event GasConsumptionLimitsUpdated(uint256 gasLimitDepositRelay, uint256 gasLimitWithdrawConfirm);

    function initialize(
        address _validatorContract,
        uint256 _dailyLimit,
        uint256 _maxPerTx,
        uint256 _minPerTx,
        uint256 _foreignGasPrice,
        uint256 _requiredBlockConfirmations
    ) public
      isInitializer
    {
        require(_validatorContract != address(0));
        require(_minPerTx > 0 && _maxPerTx > _minPerTx && _dailyLimit > _maxPerTx);
        require(_foreignGasPrice > 0);

        validatorContractAddress = _validatorContract;
        deployedAtBlock = block.number;
        dailyLimit = _dailyLimit;
        maxPerTx = _maxPerTx;
        minPerTx = _minPerTx;
        gasPrice = _foreignGasPrice;
        requiredBlockConfirmations = _requiredBlockConfirmations;
    }

    function onTokenTransfer(address _token, address _receipient, uint256 _value, bytes /*_data*/) external {
        require(withinLimit(_value));
        totalSpentPerDay[getCurrentDay()] = totalSpentPerDay[getCurrentDay()].add(_value);

        require(ERC20Token(_token).transferFrom(msg.sender, this, _value));
        emit Withdraw(_token, _receipient, _value);
    }

    function claimTokens(address _token, address _to) external onlyOwner {
        require(_to != address(0));
        if (_token == address(0)) {
            _to.transfer(address(this).balance);
            return;
        }

        ERC20Token token = ERC20Token(_token);
        uint256 balance = token.balanceOf(this);
        require(token.transfer(_to, balance));
    }

    function setGasLimits(uint256 _gasLimitDepositRelay, uint256 _gasLimitWithdrawConfirm) external onlyOwner {
        gasLimitDepositRelay = _gasLimitDepositRelay;
        gasLimitWithdrawConfirm = _gasLimitWithdrawConfirm;
        emit GasConsumptionLimitsUpdated(gasLimitDepositRelay, gasLimitWithdrawConfirm);
    }

    function deposit(uint8[] vs, bytes32[] rs, bytes32[] ss, bytes message) external {
        Message.hasEnoughValidSignatures(message, vs, rs, ss, validatorContract());
        address token;
        address recipient;
        uint256 amount;
        bytes32 txHash;
        (token, recipient, amount, txHash) = Message.parseMessage(message);
        require(!deposits[txHash]);
        deposits[txHash] = true;

        ERC20Token(token).transfer(recipient, amount);
        emit Deposit(token, recipient, amount, txHash);
    }
}
