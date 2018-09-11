pragma solidity 0.4.24;

import "../interfaces/ERC20Token.sol";

contract ApproveAndCallTest {
    address public from;
    uint public value;

    function doSomething(address token, address _from, uint _value) external {
        from = _from;
        value = _value;
        ERC20Token(token).transferFrom(_from, this, _value);
    }
}
