pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./libraries/Message.sol";
import "./BasicBridge.sol";
import "./interfaces/ERC20Token.sol";
import "./migrations/Initializable.sol";

contract ForeignBridge is BasicBridge, Initializable {
    using SafeMath for uint256;

    /* --- EVENTS --- */

    // Triggered when relay of transfer from HomeBridge is complete
    event TransferFromHome(address token, address recipient, uint value, bytes32 indexed transactionHash);
    // Event created on transfer to home.
    event TransferToHome(address token, address recipient, uint256 value);

    /* --- FIELDS --- */

    /* Beginning of V1 storage variables */
    // mapping between the transfer transaction hash from the HomeBridge to whether the transfer has been processed
    mapping(bytes32 => bool) public transfers;
    /* End of V1 storage variables */

    /* --- CONSTRUCTOR / INITIALIZATION --- */

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
        require(_validatorContract != address(0), "Validator contract address cannot be 0x0");
        require(_minPerTx > 0 && _maxPerTx > _minPerTx && _dailyLimit > _maxPerTx, "Tx limits initialization error");
        require(_foreignGasPrice > 0, "ForeignGasPrice should be greater than 0");

        validatorContractAddress = _validatorContract;
        deployedAtBlock = block.number;
        dailyLimit[address(0)] = _dailyLimit;
        maxPerTx[address(0)] = _maxPerTx;
        minPerTx[address(0)] = _minPerTx;
        gasPrice = _foreignGasPrice;
        requiredBlockConfirmations = _requiredBlockConfirmations;
    }

    /* --- EXTERNAL / PUBLIC  METHODS --- */

    function transferNativeToHome(address _recipient) external payable {
        require(withinLimit(address(0), msg.value), "Transfer exceeds limit");
        totalSpentPerDay[address(0)][getCurrentDay()] = totalSpentPerDay[address(0)][getCurrentDay()].add(msg.value);
        emit TransferToHome(address(0), _recipient, msg.value);
    }

    function transferTokenToHome(address _token, address _recipient, uint256 _value) external {
        require(withinLimit(_token, _value), "Transfer exceeds limit");
        totalSpentPerDay[_token][getCurrentDay()] = totalSpentPerDay[_token][getCurrentDay()].add(_value);

        require(ERC20Token(_token).transferFrom(msg.sender, this, _value), "TransferFrom failed for ERC20 Token");
        emit TransferToHome(_token, _recipient, _value);
    }

    function transferFromHome(uint8[] vs, bytes32[] rs, bytes32[] ss, bytes message) external {
        Message.hasEnoughValidSignatures(message, vs, rs, ss, validatorContract());
        address token;
        address recipient;
        uint256 amount;
        bytes32 txHash;
        (token, recipient, amount, txHash) = Message.parseMessage(message);
        require(!transfers[txHash], "Transfer already processed");
        transfers[txHash] = true;

        performTransfer(token, recipient, amount);
        emit TransferFromHome(token, recipient, amount, txHash);
    }

    /* --- INTERNAL / PRIVATE METHODS --- */

    function performTransfer(address tokenAddress, address recipient, uint256 amount) private {
        if (tokenAddress == address(0)) {
            recipient.transfer(amount);
            return;
        }

        ERC20Token token = ERC20Token(tokenAddress);
        require(token.transfer(recipient, amount), "Transfer failed for ERC20 token");
    }
}
