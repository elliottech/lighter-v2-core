// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;
import "../OrderBook.sol";

/// @title OrderBookDeployLib
/// @notice Deploys a new order book and initializes it with given arguments
library OrderBookDeployerLib {
    /// @notice Deploys a new order book and initializes it with given arguments
    /// @param orderBookId Id of the order book
    /// @param token0 address of token0 (base token)
    /// @param token1 address of token1 (quote token)
    /// @param logSizeTick log10 of sizeTick
    /// @param logPriceTick log10 of priceTick
    /// @param minToken0BaseAmount minimum token0 base amount for limit order creations
    /// @param minToken1BaseAmount minimum token1 base amount for limit order creations
    /// @return orderBookAddress address of the deployed order book
    function deployOrderBook(
        uint8 orderBookId,
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick,
        uint64 minToken0BaseAmount,
        uint128 minToken1BaseAmount
    ) external returns (address) {
        return
            address(
                new OrderBook(
                    orderBookId,
                    token0,
                    token1,
                    logSizeTick,
                    logPriceTick,
                    minToken0BaseAmount,
                    minToken1BaseAmount
                )
            );
    }
}
