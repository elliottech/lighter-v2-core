// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "../interfaces/ILighterV2FlashCallback.sol";
import "../interfaces/IOrderBook.sol";

/**
 * @title TestFlashLoanReentrantCallee
 * @dev A contract used for testing flash loans with a reentrant callee implementation.
 * The contract implements the ILighterV2FlashCallback interface and demonstrates a reentrant flash loan callback behavior.
 */
contract TestFlashLoanReentrantCallee is ILighterV2FlashCallback {
    /**
     * @dev Initiates a flash loan from the provided order book.
     * This function calls the flashLoan function in the order book contract.
     * @param orderBook The address of the order book contract.
     * @param amount0 The amount of token0 to borrow in the flash loan.
     * @param amount1 The amount of token1 to borrow in the flash loan.
     */
    function flash(address orderBook, uint256 amount0, uint256 amount1) external {
        IOrderBook(orderBook).flashLoan(address(this), amount0, amount1, abi.encode(orderBook, amount0, amount1));
    }

    /**
     * @dev Flash loan callback function.
     * This function is called by the order book contract after a flash loan.
     * The implementation demonstrates a reentrant flash loan callback behavior by initiating another flash loan.
     * @param data The data passed by the order book contract to the callback function.
     */
    function flashLoanCallback(bytes calldata data) external override {
        // Decode the data to retrieve flash loan details
        (address orderBook, uint256 amount0, uint256 amount1) = abi.decode(data, (address, uint256, uint256));

        // Initiate another flash loan (reentrant call)
        IOrderBook(orderBook).flashLoan(address(this), amount0, amount1, abi.encode(orderBook, amount0, amount1));
    }
}
