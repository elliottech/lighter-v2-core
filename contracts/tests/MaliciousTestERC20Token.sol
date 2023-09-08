// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "./TestERC20Token.sol";

contract MaliciousTestERC20Token is TestERC20Token {
    address exception = address(0);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) TestERC20Token(name_, symbol_, decimals_) {}

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        if (exception != to) {
            _transfer(owner, to, amount);
        } else {
            _transfer(owner, to, amount + 10);
        }
        return true;
    }

    function setExceptionAddress(address _exception) public {
        exception = _exception;
    }
}
