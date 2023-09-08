// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "../interfaces/ILighterV2FlashCallback.sol";
import "../interfaces/IOrderBook.sol";

/// @title TestFlashLoanBadCallee
/// @dev A contract used for testing flash loans with a bad callee implementation.
/// The contract implements the ILighterV2FlashCallback interface and simulates a bad flash loan callback by not refunding loaned amounts.
contract TestFlashLoanBadCallee is ILighterV2FlashCallback {
    /// @dev Initiates a flash loan from the provided order book.
    /// This function calls the flashLoan function in the order book contract.
    /// @param orderBook The address of the order book contract.
    /// @param amount0 The amount of token0 to borrow in the flash loan.
    /// @param amount1 The amount of token1 to borrow in the flash loan.
    function flash(address orderBook, uint256 amount0, uint256 amount1) external {
        IOrderBook(orderBook).flashLoan(address(this), amount0, amount1, abi.encode(orderBook, amount0, amount1));
    }

    /// @dev Flash loan callback function.
    /// This function is called by the order book contract after a flash loan.
    /// The implementation simulates a bad callee that does not refund the loaned amounts.
    /// @param data The data passed by the order book contract to the callback function.
    function flashLoanCallback(bytes calldata data) external override {}
}
