pragma solidity ^0.4.23;

import "./libraries/SafeMath.sol";
import "./libraries/Message.sol";
import "./interfaces/IBurnableMintableToken.sol";
import "./BasicBridge.sol";
import "./migrations/Initializable.sol";

contract HomeBridge is Initializable, BasicBridge {
    using SafeMath for uint256;

    /* Beginning of V1 storage variables */

    // mapping between foreign token addresses to home token addresses
    mapping(address => address) public foreignToHomeTokenMap;
    // mapping between message hash and deposit message. Message is the hash of (recipientAccount, depositValue, transactionHash)
    mapping(bytes32 => bytes) public messages;
    // mapping between hash of (deposit message hash, validator index) to the validator signature
    mapping(bytes32 => bytes) public signatures;
    // mapping between hash of (validator, withdrawl message hash) to whether the withdrawl was signed by the validator
    mapping(bytes32 => bool) public withdrawalsSigned;
    // mapping between the withdrawl message hash and the number of validator signatures
    mapping(bytes32 => uint256) public numWithdrawalsSigned;
    // mapping between the hash of (validator, deposit message hash) to whether the deposit was signed by the validator
    mapping(bytes32 => bool) public messagesSigned;
    // mapping between the deposit message hash and the number of validator signatures
    mapping(bytes32 => uint256) public numMessagesSigned;

    /* End of V1 storage variables */

    event Deposit (address token, address recipient, uint256 value);
    event Withdraw (address token, address recipient, uint256 value, bytes32 transactionHash);
    event SignedForDeposit(address indexed signer, bytes32 messageHash);
    event SignedForWithdraw(address indexed signer, bytes32 transactionHash);
    event CollectedSignatures(address authorityResponsibleForRelay, bytes32 messageHash, uint256 NumberOfCollectedSignatures);

    function initialize (
        address _validatorContract,
        uint256 _dailyLimit,
        uint256 _maxPerTx,
        uint256 _minPerTx,
        uint256 _homeGasPrice,
        uint256 _requiredBlockConfirmations
    ) public
      isInitializer
    {
        require(_validatorContract != address(0));
        require(_homeGasPrice > 0);
        require(_requiredBlockConfirmations > 0);
        require(_minPerTx > 0 && _maxPerTx > _minPerTx && _dailyLimit > _maxPerTx);

        validatorContractAddress = _validatorContract;
        deployedAtBlock = block.number;
        dailyLimit = _dailyLimit;
        maxPerTx = _maxPerTx;
        minPerTx = _minPerTx;
        gasPrice = _homeGasPrice;
        requiredBlockConfirmations = _requiredBlockConfirmations;
    }

    function () public payable {
        require(msg.value > 0);
        require(msg.data.length == 0);
        require(withinLimit(msg.value));
        totalSpentPerDay[getCurrentDay()] = totalSpentPerDay[getCurrentDay()].add(msg.value);
        emit Deposit(address(0), msg.sender, msg.value);
    }

    function withdraw(address foreignToken, address recipient, uint256 value, bytes32 transactionHash) external onlyValidator {
        address homeToken = foreignToHomeTokenMap[foreignToken];
        require(foreignToken == address(0) || homeToken != address(0));

        bytes32 hashMsg = keccak256(homeToken, recipient, value, transactionHash);
        bytes32 hashSender = keccak256(msg.sender, hashMsg);
        // Duplicated deposits
        require(!withdrawalsSigned[hashSender]);
        withdrawalsSigned[hashSender] = true;

        uint256 signed = numWithdrawalsSigned[hashMsg];
        require(!isAlreadyProcessed(signed));
        // the check above assumes that the case when the value could be overflew will not happen in the addition operation below
        signed = signed + 1;

        numWithdrawalsSigned[hashMsg] = signed;

        emit SignedForWithdraw(msg.sender, transactionHash);

        if (signed >= requiredSignatures()) {
            // If the bridge contract does not own enough tokens to transfer
            // it will cause funds lock on the home side of the bridge
            numWithdrawalsSigned[hashMsg] = markAsProcessed(signed);

            // Passing the mapped home token address here even when token address is 0x0. This is okay because
            // by default the address mapped to 0x0 will also be 0x0
            performWithdraw(homeToken, recipient, value);
            emit Withdraw(homeToken, recipient, value, transactionHash);
        }
    }

    function submitSignature(bytes signature, bytes message) external onlyValidator {
        // ensure that `signature` is really `message` signed by `msg.sender`
        require(Message.isMessageValid(message));
        require(msg.sender == Message.recoverAddressFromSignedMessage(signature, message));
        bytes32 hashMsg = keccak256(message);
        bytes32 hashSender = keccak256(msg.sender, hashMsg);

        uint256 signed = numMessagesSigned[hashMsg];
        require(!isAlreadyProcessed(signed));
        // the check above assumes that the case when the value could be overflew will not happen in the addition operation below
        signed = signed + 1;
        if (signed > 1) {
            // Duplicated signatures
            require(!messagesSigned[hashSender]);
        } else {
            messages[hashMsg] = message;
        }
        messagesSigned[hashSender] = true;

        bytes32 signIdx = keccak256(hashMsg, (signed-1));
        signatures[signIdx] = signature;

        numMessagesSigned[hashMsg] = signed;

        emit SignedForDeposit(msg.sender, hashMsg);

        uint256 reqSigs = requiredSignatures();
        if (signed >= reqSigs) {
            numMessagesSigned[hashMsg] = markAsProcessed(signed);
            emit CollectedSignatures(msg.sender, hashMsg, reqSigs);
        }
    }

    // TODO: make this onlyOwner
    function registerToken(address foreignAddress, address homeAddress) public {
      foreignToHomeTokenMap[foreignAddress] = homeAddress;
    }

    function performWithdraw(address token, address recipient, uint256 value) private {
      if (token == address(0)) {
          recipient.transfer(value);
          return;
      }

      IBurnableMintableToken(token).mint(recipient, value);
    }

    function signature(bytes32 _hash, uint256 _index) public view returns (bytes) {
        bytes32 signIdx = keccak256(_hash, _index);
        return signatures[signIdx];
    }

    function message(bytes32 _hash) public view returns (bytes) {
        return messages[_hash];
    }

    function markAsProcessed(uint256 _v) private pure returns(uint256) {
        return _v | 2 ** 255;
    }

    function isAlreadyProcessed(uint256 _number) public pure returns(bool) {
        return _number & 2**255 == 2**255;
    }
}
