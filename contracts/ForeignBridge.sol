pragma solidity ^0.4.23;

import "./libraries/SafeMath.sol";
import "./libraries/Message.sol";
import "./BasicBridge.sol";
import "./interfaces/ERC20Token.sol";
import "./migrations/Initializable.sol";

contract ForeignBridge is BasicBridge, Initializable {
    using SafeMath for uint256;

    /* Beginning of V1 storage variables */
    // mapping between the deposit transaction hash from the HomeBridge to whether the deposit has been processed
    mapping(bytes32 => bool) public deposits;
    /* End of V1 storage variables */

    // Triggered when relay of transfer from HomeBridge is complete
    event TransferFromHome(address token, address recipient, uint value, bytes32 transactionHash);
    // Event created on transfer to home.
    event TransferToHome(address token, address recipient, uint256 value);
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
        dailyLimit[address(0)] = _dailyLimit;
        maxPerTx[address(0)] = _maxPerTx;
        minPerTx[address(0)] = _minPerTx;
        gasPrice = _foreignGasPrice;
        requiredBlockConfirmations = _requiredBlockConfirmations;
    }

    function transferNativeToHome(address _recipient) external payable {
        require(withinLimit(address(0), msg.value));
        totalSpentPerDay[address(0)][getCurrentDay()] = totalSpentPerDay[address(0)][getCurrentDay()].add(msg.value);
        emit TransferToHome(address(0), _recipient, msg.value);
    }

    function transferTokenToHome(address _token, address _recipient, uint256 _value, bytes /*_data*/) external {
        require(withinLimit(_token, _value));
        totalSpentPerDay[_token][getCurrentDay()] = totalSpentPerDay[_token][getCurrentDay()].add(_value);

        require(ERC20Token(_token).transferFrom(msg.sender, this, _value));
        emit TransferToHome(_token, _recipient, _value);
    }

    function transferFromHome(uint8[] vs, bytes32[] rs, bytes32[] ss, bytes message) external {
        Message.hasEnoughValidSignatures(message, vs, rs, ss, validatorContract());
        address token;
        address recipient;
        uint256 amount;
        bytes32 txHash;
        (token, recipient, amount, txHash) = Message.parseMessage(message);
        require(!deposits[txHash]);
        deposits[txHash] = true;

        performDeposit(token, recipient, amount);
        emit TransferFromHome(token, recipient, amount, txHash);
    }

    function performDeposit(address tokenAddress, address recipient, uint256 amount) private {
        if (tokenAddress == address(0)) {
            recipient.transfer(amount);
            return;
        }

        ERC20Token token = ERC20Token(tokenAddress);
        require(token.transfer(recipient, amount));
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
}
