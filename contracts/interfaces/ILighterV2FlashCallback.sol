// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

/// @title Callback for IOrderBook#flashLoan
/// @notice Any contract that calls IOrderBook#flashLoan must implement this interface
interface ILighterV2FlashCallback {
    /// @notice Called from `msg.sender` after transferring flashLoan to the recipient from IOrderBook#flashLoan
    /// @dev In the implementation you must repay the pool the assets sent by flashLoan.
    /// The caller of this method must be checked to be an order book deployed by the Factory
    /// @param callbackData Data passed through by the caller via the IOrderBook#flashLoan call
    function flashLoanCallback(bytes calldata callbackData) external;
}
