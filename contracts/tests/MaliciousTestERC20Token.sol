// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "./TestERC20Token.sol";

/// @title MaliciousTestERC20Token
/// @notice ERC20Token with malicious logic in transfer function
/// @dev transfer function increments the the actual amount by 10 if recipient is the malicious address
contract MaliciousTestERC20Token is TestERC20Token {
    address exception = address(0);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) TestERC20Token(name_, symbol_, decimals_) {}

    /// @dev transfer the tokens to the specified account.
    /// @param to The account to receive the tokens
    /// @param amount The amount of tokens to be transfered.
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        if (exception != to) {
            _transfer(owner, to, amount);
        } else {
            _transfer(owner, to, amount + 10);
        }
        return true;
    }

    /// @dev set the exceptionAddress to malicious token contract
    /// @param _exception The address of malicious account to steal tokens
    function setExceptionAddress(address _exception) public {
        exception = _exception;
    }
}
