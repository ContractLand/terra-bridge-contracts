pragma solidity 0.4.24;

contract IBurnableMintableToken {
    function mint(address _to, uint256 _amount) public returns (bool);
    function burn(uint256 _value) public;
}
