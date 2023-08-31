// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/// @title Minimal ERC20 interface for lighter
/// @notice Contains a subset of the full ERC20 interface that is used in lighter
interface IERC20Minimal {
    /// @notice Returns the balance of the account provided
    /// @param account The account to get the balance of
    /// @return balance The balance of the account
    function balanceOf(address account) external view returns (uint256);

    /// @notice Transfers given amount of tokens from caller to the recipient
    /// @param recipient The recipient of the transfer
    /// @param amount The amount of the transfer
    /// @return success Returns true for a successful transfer, false for unsuccessful
    function transfer(address recipient, uint256 amount) external returns (bool);

    /// @notice Transfers given amount of tokens from the sender to the recipient
    /// @param sender The sender of the transfer
    /// @param recipient The recipient of the transfer
    /// @param amount The amount of the transfer
    /// @return success Returns true for a successful transfer, false for unsuccessful
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /// @return decimals Returns the decimals of the token
    function decimals() external returns (uint8);
}
