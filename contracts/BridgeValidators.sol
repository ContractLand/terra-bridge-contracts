pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./migrations/Initializable.sol";

contract BridgeValidators is Ownable, Initializable {
    using SafeMath for uint256;

    /* Beginning of V1 storage variables */
    mapping(address => bool) internal validators;
    uint256 public validatorCount;
    uint256 public requiredSignatures;
    /* End of V1 storage variables */

    event ValidatorAdded (address validator);
    event ValidatorRemoved (address validator);
    event RequiredSignaturesChanged (uint256 requiredSignatures);

    function initialize(uint256 _requiredSignatures, address[] _initialValidators, address _owner)
      public isInitializer
    {
        setOwner(_owner);
        require(_requiredSignatures != 0);
        require(_initialValidators.length >= _requiredSignatures);
        for (uint256 i = 0; i < _initialValidators.length; i++) {
            require(_initialValidators[i] != address(0));
            assert(!isValidator(_initialValidators[i]));
            validatorCount = validatorCount.add(1);
            validators[_initialValidators[i]] = true;
            emit ValidatorAdded(_initialValidators[i]);
        }
        require(validatorCount >= _requiredSignatures);
        requiredSignatures = _requiredSignatures;
    }

    function setOwner(address _owner) private {
        require(_owner != address(0));
        owner = _owner;
    }

    function addValidator(address _validator) external onlyOwner {
        require(_validator != address(0));
        require(!isValidator(_validator));
        validatorCount = validatorCount.add(1);
        validators[_validator] = true;
        emit ValidatorAdded(_validator);
    }

    function removeValidator(address _validator) external onlyOwner {
        require(validatorCount > requiredSignatures);
        require(isValidator(_validator));
        validators[_validator] = false;
        validatorCount = validatorCount.sub(1);
        emit ValidatorRemoved(_validator);
    }

    function setRequiredSignatures(uint256 _requiredSignatures) external onlyOwner {
        require(validatorCount >= _requiredSignatures);
        require(_requiredSignatures != 0);
        requiredSignatures = _requiredSignatures;
        emit RequiredSignaturesChanged(_requiredSignatures);
    }

    function isValidator(address _validator) public view returns(bool) {
        return validators[_validator] == true;
    }
}
