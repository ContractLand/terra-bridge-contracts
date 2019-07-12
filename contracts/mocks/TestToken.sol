pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract TestToken is StandardToken {

  string public name = "TestToken";
  string public symbol = "ERC20";
  uint8 public decimals = 18;

  constructor(string _name, string _symbol, uint256 _initialSupply, uint8 _decimals) public {
    name = _name;
    symbol = _symbol;
    totalSupply_ = _initialSupply;
    balances[msg.sender] = _initialSupply;
    decimals = _decimals;
  }
}
