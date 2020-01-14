pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./libraries/Message.sol";
import "./BasicBridge.sol";
import "./interfaces/ERC20Token.sol";
import "./migrations/Initializable.sol";
import "./interfaces/USDT.sol";

contract ForeignBridge is BasicBridge, Initializable {
    using SafeMath for uint256;

    /* --- EVENTS --- */

    // Triggered when relay of transfer from HomeBridge is complete
    event TransferFromHome(address indexed token, address recipient, uint value, bytes32 indexed transactionHash);
    // Event created on transfer to home.
    event TransferToHome(address indexed token, address recipient, uint256 value);

    /* --- FIELDS --- */

    /* Beginning of V1 storage variables */
    // mapping between the transfer transaction hash from the HomeBridge to whether the transfer has been processed
    mapping(bytes32 => bool) public transfers;
    /* End of V1 storage variables */

    address public USDTAddress;
    /* End of V2 storage variables */

    uint256 public transferFee; // static transfer fee. Not set in constructor. Defaults to 0
    uint256 public feeCollected; // amount of currently collected fee in bridge contract.
    /* End of V3 storage variables */

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
        require(msg.value > transferFee, "TransferNativeToHome failed: Insufficient fee");

        uint256 transferAmount = msg.value - transferFee;
        require(withinLimit(address(0), transferAmount), "Transfer exceeds limit");
        totalSpentPerDay[address(0)][getCurrentDay()] = totalSpentPerDay[address(0)][getCurrentDay()].add(transferAmount);

        // collect fee in contract
        feeCollected += transferFee;

        emit TransferToHome(address(0), _recipient, transferAmount);
    }

    function transferTokenToHome(address _token, address _recipient, uint256 _value) external payable {
        require(msg.value == transferFee, "TransferNativeToHome failed: Insufficient fee");

        uint256 castValue18 = castTo18Decimal(_token, _value);
        require(withinLimit(_token, castValue18), "Transfer exceeds limit");
        totalSpentPerDay[_token][getCurrentDay()] = totalSpentPerDay[_token][getCurrentDay()].add(castValue18);

        if (_token == USDTAddress) {
          // Handle USDT special case since it does not have standard erc20 token interface =.=
          uint256 balanceBefore = USDT(_token).balanceOf(this);
          USDT(_token).transferFrom(msg.sender, this, _value);
          // check transfer suceeded
          require(balanceBefore.add(_value) == USDT(_token).balanceOf(this));
        } else {
          require(ERC20Token(_token).transferFrom(msg.sender, this, _value), "TransferFrom failed for ERC20 Token");
        }

        // collect fee in contract
        feeCollected += transferFee;

        emit TransferToHome(_token, _recipient, castValue18);
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

        uint256 castedAmount = castFrom18Decimal(token, amount);
        performTransfer(token, recipient, castedAmount);
        emit TransferFromHome(token, recipient, castedAmount, txHash);
    }

    function setUSDTAddress(address _addr) public onlyOwner {
        USDTAddress = _addr;
    }

    function setTransferFee(uint256 _transferFee) public onlyOwner {
        transferFee = _transferFee;
    }

    function withdrawFee() public onlyOwner {
        // NOTE: currently fees are only given to the validator that withdraws it
        require(feeCollected > 0, "WithdrawFee failed: Fee is 0");
        msg.sender.transfer(feeCollected);
    }

    /* --- INTERNAL / PRIVATE METHODS --- */

    function performTransfer(address tokenAddress, address recipient, uint256 amount) private {
        if (tokenAddress == address(0)) {
            recipient.transfer(amount);
            return;
        }

        if (tokenAddress == USDTAddress) {
            uint256 balanceBefore = USDT(tokenAddress).balanceOf(recipient);
            USDT(tokenAddress).transfer(recipient, amount);
            // check transfer suceeded
            require(balanceBefore.add(amount) == USDT(tokenAddress).balanceOf(recipient));
            return;
        }

        ERC20Token token = ERC20Token(tokenAddress);
        require(token.transfer(recipient, amount), "Transfer failed for ERC20 token");
    }

    function castTo18Decimal(address token, uint256 value) private returns (uint256) {
        return value.mul(getCastScale(token, value));
    }

    function castFrom18Decimal(address token, uint256 value) private returns (uint256) {
        if (token == address(0)) {
            return value;
        }

        return value.div(getCastScale(token, value));
    }

    function getCastScale(address token, uint256 value) private returns (uint256) {
      require(ERC20Token(token).decimals() > 0 && ERC20Token(token).decimals() <= 18);

      if (ERC20Token(token).decimals() == 18) {
          return 1;
      }

      uint256 decimals = uint256(ERC20Token(token).decimals()); // cast to uint256
      return 10**(18 - decimals);
    }
}
