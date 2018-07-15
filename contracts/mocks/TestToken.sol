pragma solidity ^0.4.18;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract TestToken is StandardToken {

  string public name = "TestToken";
  string public symbol = "ERC20";
  uint8 public constant decimals = 18;

  uint256 public constant INITIAL_SUPPLY = 1000000 * (10 ** uint256(decimals));

  constructor(string _name, string _symbol, uint256 _initialSupply) public {
    name = _name;
    symbol = _symbol;
    totalSupply_ = _initialSupply;
    balances[msg.sender] = _initialSupply;
  }
}
