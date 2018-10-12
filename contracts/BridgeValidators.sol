pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./migrations/Initializable.sol";

contract BridgeValidators is Ownable, Initializable {
    using SafeMath for uint256;

    /* --- EVENTS --- */

    event ValidatorAdded (address validator);
    event ValidatorRemoved (address validator);
    event RequiredSignaturesChanged (uint256 requiredSignatures);

    /* --- FIELDS --- */

    /* Beginning of V1 storage variables */
    mapping(address => bool) internal validators;
    uint256 public validatorCount;
    uint256 public requiredSignatures;
    /* End of V1 storage variables */

    /* --- CONSTRUCTOR / INITIALIZATION --- */

    function initialize(uint256 _requiredSignatures, address[] _initialValidators, address _owner)
      public isInitializer
    {
        setOwner(_owner);
        require(_requiredSignatures != 0, "RequiredSignatures should be greater than 0");
        require(_initialValidators.length >= _requiredSignatures, "Number of proposed validators should be greater than requiredSignatures");
        for (uint256 i = 0; i < _initialValidators.length; i++) {
            require(_initialValidators[i] != address(0), "Validator address should not be 0x0");
            assert(!isValidator(_initialValidators[i]));
            validatorCount = validatorCount.add(1);
            validators[_initialValidators[i]] = true;
            emit ValidatorAdded(_initialValidators[i]);
        }
        require(validatorCount >= _requiredSignatures, "Number of confirmed validators should be greater than requiredSignatures");
        requiredSignatures = _requiredSignatures;
    }

    /* --- EXTERNAL / PUBLIC  METHODS --- */

    function addValidator(address _validator) external onlyOwner {
        require(_validator != address(0), "Validator address should not be 0x0");
        require(!isValidator(_validator), "New validator should be an existing validator");
        validatorCount = validatorCount.add(1);
        validators[_validator] = true;
        emit ValidatorAdded(_validator);
    }

    function removeValidator(address _validator) external onlyOwner {
        require(validatorCount > requiredSignatures, "Removing validator should not make validator count be < requiredSignatures");
        require(isValidator(_validator), "Cannot remove address that is not a validator");
        validators[_validator] = false;
        validatorCount = validatorCount.sub(1);
        emit ValidatorRemoved(_validator);
    }

    function setRequiredSignatures(uint256 _requiredSignatures) external onlyOwner {
        require(validatorCount >= _requiredSignatures, "New requiredSignatures should be greater than num of validators");
        require(_requiredSignatures != 0, "New requiredSignatures should be > than 0");
        requiredSignatures = _requiredSignatures;
        emit RequiredSignaturesChanged(_requiredSignatures);
    }

    function isValidator(address _validator) public view returns(bool) {
        return validators[_validator] == true;
    }

    /* --- INTERNAL / PRIVATE METHODS --- */

    function setOwner(address _owner) private {
        require(_owner != address(0), "New owner cannot be 0x0");
        owner = _owner;
    }
}
