pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC827/ERC827Token.sol";
import "./interfaces/IBurnableMintableToken.sol";

contract HomeToken is IBurnableMintableToken, ERC827Token, DetailedERC20, BurnableToken, MintableToken {

  constructor (string _name, string _symbol, uint8 _decimals)
  DetailedERC20(_name, _symbol, _decimals)
  public {

  }

  function finishMinting() public returns (bool) {
    revert();
  }

  function claimTokens(address _token, address _to) public onlyOwner {
    require(_to != address(0));
    if (_token == address(0)) {
        _to.transfer(address(this).balance);
        return;
    }

    DetailedERC20 token = DetailedERC20(_token);
    uint256 balance = token.balanceOf(address(this));
    require(token.transfer(_to, balance));
  }
}
