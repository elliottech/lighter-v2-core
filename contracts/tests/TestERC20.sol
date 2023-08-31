// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestERC20
 * @dev A simple ERC20 token contract used for testing purposes.
 * The contract extends the ERC20 standard and allows for easy minting and decimals configuration.
 */
contract TestERC20 is ERC20 {
    // Internal variable to store decimals configuration
    uint8 _decimals;

    /**
     * @dev Constructor initializes the token with a name and symbol, and sets the default decimals.
     * @param name_ The name of the token.
     * @param symbol_ The symbol of the token.
     */
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _decimals = 3;
    }

    /**
     * @dev Returns the number of decimals used by the token.
     * @return The number of decimals.
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mints new tokens and assigns them to the specified account.
     * @param account The account to receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    /**
     * @dev Sets the number of decimals used by the token.
     * Only the contract owner can call this function.
     * @param decimals_ The new number of decimals.
     */
    function setDecimals(uint8 decimals_) public {
        _decimals = decimals_;
    }
}
