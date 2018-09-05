pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./libraries/Message.sol";
import "./interfaces/IBurnableMintableToken.sol";
import "./BasicBridge.sol";
import "./migrations/Initializable.sol";
import "./interfaces/ERC20Token.sol";

contract HomeBridge is Initializable, BasicBridge {
    using SafeMath for uint256;

    /* --- EVENTS --- */

    event TransferToForeign (address token, address recipient, uint256 value);
    event TransferFromForeign (address token, address recipient, uint256 value, bytes32 transactionHash);
    event SignedForTransferToForeign(address indexed signer, bytes32 messageHash);
    event SignedForTransferFromForeign(address indexed signer, bytes32 transactionHash);
    event CollectedSignatures(address authorityResponsibleForRelay, bytes32 messageHash, uint256 NumberOfCollectedSignatures);

    /* --- FIELDS --- */

    /* Beginning of V1 storage variables */
    // mapping between foreign token addresses to home token addresses
    mapping(address => address) public foreignToHomeTokenMap;
    // mapping between home token addresses to foreign token addresses
    mapping(address => address) public homeToForeignTokenMap;
    // mapping between message hash and transfer message. Message is the hash of (recipientAccount, transferValue, transactionHash)
    mapping(bytes32 => bytes) public messages;
    // mapping between hash of (transfer message hash, validator index) to the validator signature
    mapping(bytes32 => bytes) public signatures;
    // mapping between hash of (validator, transfer message hash) to whether the transfer was signed by the validator
    mapping(bytes32 => bool) public transfersSigned;
    // mapping between the transfer message hash and the number of validator signatures
    mapping(bytes32 => uint256) public numTransfersSigned;
    // mapping between the hash of (validator, transfer message hash) to whether the transfer was signed by the validator
    mapping(bytes32 => bool) public messagesSigned;
    // mapping between the transfer message hash and the number of validator signatures
    mapping(bytes32 => uint256) public numMessagesSigned;
    /* End of V1 storage variables */

    /* --- CONSTRUCTOR / INITIALIZATION --- */

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
        dailyLimit[address(0)] = _dailyLimit;
        maxPerTx[address(0)] = _maxPerTx;
        minPerTx[address(0)] = _minPerTx;
        gasPrice = _homeGasPrice;
        requiredBlockConfirmations = _requiredBlockConfirmations;
    }

    /* --- EXTERNAL / PUBLIC  METHODS --- */

    function registerToken(address foreignAddress, address homeAddress) external onlyOwner {
        require(foreignToHomeTokenMap[foreignAddress] == address(0) && homeToForeignTokenMap[homeAddress] == address(0));
        foreignToHomeTokenMap[foreignAddress] = homeAddress;
        homeToForeignTokenMap[homeAddress] = foreignAddress;
    }
    
    function transferNativeToForeign(address recipient) external payable {
        require(withinLimit(address(0), msg.value));
        totalSpentPerDay[address(0)][getCurrentDay()] = totalSpentPerDay[address(0)][getCurrentDay()].add(msg.value);

        address foreignToken = homeToForeignTokenMap[address(0)];
        require(foreignToken != address(0));

        emit TransferToForeign(foreignToken, recipient, msg.value);
    }

    function transferTokenToForeign(address homeToken, address recipient, uint256 value) external {
        require(withinLimit(homeToken, value));
        totalSpentPerDay[homeToken][getCurrentDay()] = totalSpentPerDay[homeToken][getCurrentDay()].add(value);

        address foreignToken = homeToForeignTokenMap[homeToken];
        require(foreignToHomeTokenMap[foreignToken] == homeToken);

        require(ERC20Token(homeToken).transferFrom(msg.sender, this, value));
        IBurnableMintableToken(homeToken).burn(value);
        emit TransferToForeign(foreignToken, recipient, value);
    }

    function transferFromForeign(address foreignToken, address recipient, uint256 value, bytes32 transactionHash) external onlyValidator {
        address homeToken = foreignToHomeTokenMap[foreignToken];
        require(isRegisterd(foreignToken, homeToken));

        bytes32 hashMsg = keccak256(abi.encodePacked(homeToken, recipient, value, transactionHash));
        bytes32 hashSender = keccak256(abi.encodePacked(msg.sender, hashMsg));
        // Duplicated transfers
        require(!transfersSigned[hashSender]);
        transfersSigned[hashSender] = true;

        uint256 signed = numTransfersSigned[hashMsg];
        require(!isAlreadyProcessed(signed));
        // the check above assumes that the case when the value could be overflew will not happen in the addition operation below
        signed = signed + 1;

        numTransfersSigned[hashMsg] = signed;

        emit SignedForTransferFromForeign(msg.sender, transactionHash);

        if (signed >= requiredSignatures()) {
            // If the bridge contract does not own enough tokens to transfer
            // it will cause funds lock on the home side of the bridge
            numTransfersSigned[hashMsg] = markAsProcessed(signed);

            // Passing the mapped home token address here even when token address is 0x0. This is okay because
            // by default the address mapped to 0x0 will also be 0x0
            performTransfer(homeToken, recipient, value);
            emit TransferFromForeign(homeToken, recipient, value, transactionHash);
        }
    }

    function submitSignature(bytes signature, bytes message) external onlyValidator {
        // ensure that `signature` is really `message` signed by `msg.sender`
        require(Message.isMessageValid(message));
        require(msg.sender == Message.recoverAddressFromSignedMessage(signature, message));
        bytes32 hashMsg = keccak256(message);
        bytes32 hashSender = keccak256(abi.encodePacked(msg.sender, hashMsg));

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

        bytes32 signIdx = keccak256(abi.encodePacked(hashMsg, (signed-1)));
        signatures[signIdx] = signature;

        numMessagesSigned[hashMsg] = signed;

        emit SignedForTransferToForeign(msg.sender, hashMsg);

        uint256 reqSigs = requiredSignatures();
        if (signed >= reqSigs) {
            numMessagesSigned[hashMsg] = markAsProcessed(signed);
            emit CollectedSignatures(msg.sender, hashMsg, reqSigs);
        }
    }

    /* --- INTERNAL / PRIVATE METHODS --- */

    function performTransfer(address token, address recipient, uint256 value) private {
        if (token == address(0)) {
            recipient.transfer(value);
            return;
        }

        IBurnableMintableToken(token).mint(recipient, value);
    }

    function isRegisterd(address foreignToken,  address homeToken) private view returns (bool) {
        if(foreignToken == address(0) && homeToken == address(0)) {
            return false;
        } else {
            return (foreignToHomeTokenMap[foreignToken] == homeToken &&
                    homeToForeignTokenMap[homeToken] == foreignToken);
        }
    }

    function signature(bytes32 _hash, uint256 _index) public view returns (bytes) {
        bytes32 signIdx = keccak256(abi.encodePacked(_hash, _index));
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
