// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "./external/IERC20Minimal.sol";

/// @title Callback for IOrderBook#swapExactSingle and IOrderBook#createOrder
/// @notice Any contract that calls IOrderBook#swapExactSingle and IOrderBook#createOrder must implement this interface with one exception
/// @dev If orderType is PerformanceLimitOrder, then no need to implement this interface
/// @dev PerformanceLimitOrder handles payments with pre-deposited funds by market-makers
interface ILighterV2TransferCallback {
    /// @notice Called by order book after transferring received assets from IOrderBook#swapExactInput or IOrderBook#swapExactOutput for payments
    /// @dev In the implementation order creator must pay the order book the assets for the order
    /// The caller of this method must be checked to be an order book deployed by the Factory
    /// @param callbackData Data passed through by the caller via the IOrderBook#swapExactSingle or IOrderBook#swapExactOutput call
    function lighterV2TransferCallback(
        uint256 debitTokenAmount,
        IERC20Minimal debitToken,
        bytes calldata callbackData
    ) external;
}
