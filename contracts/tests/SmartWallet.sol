// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "../interfaces/IFactory.sol";
import "../interfaces/IOrderBook.sol";
import "../interfaces/ILighterV2TransferCallback.sol";

/**
 * @title SmartWallet
 * @notice A contract that acts as a smart wallet interacting with an order book contract.
 */
contract SmartWallet is ILighterV2TransferCallback {
    /// @notice address of the owner of smartWallet
    address public immutable owner;

    /// @notice factory instance used to query orderBooks by ID
    IFactory public immutable factory;

    /**
     * @dev Modifier that restricts function execution to the contract owner.
     * The caller must be the owner of the smart wallet.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "caller must be owner");
        _;
    }

    /**
     * @dev Constructor initializes the smart wallet with a factory contract.
     * The owner of the smart wallet is set to the sender of the deployment transaction.
     * @param _factory The address of the factory contract.
     */
    constructor(IFactory _factory) {
        owner = msg.sender;
        factory = _factory;
    }

    /**
     * @dev Callback function called by the `orderBook` contract after a successful transfer.
     * This function is used to handle the transfer of `debitTokenAmount` of the `debitToken`.
     * It ensures that only the `orderBook` contract can call this function.
     * The transferred tokens are then sent back to the sender using the `safeTransfer` function.
     *
     * @param debitTokenAmount The amount of debit tokens to be transferred.
     * @param debitToken The ERC20 token used for the transfer.
     * @param data Additional data that can be provided to the function.
     */
    function lighterV2TransferCallback(
        uint256 debitTokenAmount,
        IERC20Minimal debitToken,
        bytes memory data
    ) external override {
        uint8 orderBookId;
        // unpack data
        assembly {
            orderBookId := mload(add(data, 1))
        }

        address orderBookAddress = factory.getOrderBookFromId(orderBookId);

        require(msg.sender == address(orderBookAddress));

        if (!debitToken.transfer(msg.sender, debitTokenAmount)) {
            revert();
        }
    }

    /**
     * @dev Creates multiple limit orders in the order book. Only the contract owner can call this function.
     * The function processes each order provided in the arrays and creates corresponding limit orders in the order book.
     *
     * @param orderBookId The id of the order book which will be used.
     * @param size The number of orders to create.
     * @param amount0Base An array of amounts denominated in token0 to be used for each order.
     * @param priceBase An array of prices denominated in token1 for each order.
     * @param isAsk An array indicating whether each order is an "ask" order (true) or a "bid" order (false).
     * @param hintId An array of hint IDs to guide order placement in the order book.
     * @return orderId An array containing the order IDs of the created orders.
     */
    function createLimitOrder(
        uint8 orderBookId,
        uint8 size,
        uint64[] memory amount0Base,
        uint64[] memory priceBase,
        bool[] memory isAsk,
        uint32[] memory hintId
    ) public onlyOwner returns (uint32[] memory orderId) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        orderId = new uint32[](size);
        bytes memory callbackData = abi.encodePacked(orderBookId);
        for (uint8 i; i < size; ) {
            orderId[i] = orderBook.createOrder(
                amount0Base[i],
                priceBase[i],
                isAsk[i],
                address(this),
                hintId[i],
                IOrderBook.OrderType.LimitOrder,
                callbackData
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Creates multiple performance limit orders in the order book. Only the contract owner can call this function.
     * The function processes each order provided in the arrays and creates corresponding performance limit orders in the order book.
     *
     * @param orderBookId The id of the order book which will be used.
     * @param size The number of orders to create.
     * @param amount0Base An array of amounts denominated in token0 to be used for each order.
     * @param priceBase An array of prices denominated in token1 for each order.
     * @param isAsk An array indicating whether each order is an "ask" order (true) or a "bid" order (false).
     * @param hintId An array of hint IDs to guide order placement in the order book.
     * @return orderId An array containing the order IDs of the created orders.
     */
    function createPerformanceLimitOrder(
        uint8 orderBookId,
        uint8 size,
        uint64[] memory amount0Base,
        uint64[] memory priceBase,
        bool[] memory isAsk,
        uint32[] memory hintId
    ) public onlyOwner returns (uint32[] memory orderId) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        orderId = new uint32[](size);
        bytes memory callbackData = abi.encodePacked(orderBookId);
        for (uint8 i; i < size; ) {
            orderId[i] = orderBook.createOrder(
                amount0Base[i],
                priceBase[i],
                isAsk[i],
                address(this),
                hintId[i],
                IOrderBook.OrderType.PerformanceLimitOrder,
                callbackData
            );
            unchecked {
                ++i;
            }
        }
    }

    function createFillOrKillOrder(
        uint8 orderBookId,
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk
    ) public onlyOwner returns (uint32) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        bytes memory callbackData = abi.encodePacked(orderBookId);

        return
            orderBook.createOrder(
                amount0Base,
                priceBase,
                isAsk,
                address(this),
                0,
                IOrderBook.OrderType.FoKOrder,
                callbackData
            );
    }

    function createImmediateOrCancelOrder(
        uint8 orderBookId,
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk
    ) public onlyOwner returns (uint32) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        bytes memory callbackData = abi.encodePacked(orderBookId);

        return
            orderBook.createOrder(
                amount0Base,
                priceBase,
                isAsk,
                address(this),
                0,
                IOrderBook.OrderType.IoCOrder,
                callbackData
            );
    }

    /**
     * @dev Cancels multiple limit orders in the order book. Only the contract owner can call this function.
     * The function processes each order ID provided in the array and attempts to cancel the corresponding limit orders.
     *
     * @param orderBookId The id of the order book which will be used.
     * @param size The number of orders to cancel.
     * @param orderId An array containing the order IDs to be canceled.
     * @return isCanceled An array indicating whether each order was successfully canceled.
     */
    function cancelLimitOrder(
        uint8 orderBookId,
        uint8 size,
        uint32[] memory orderId
    ) external onlyOwner returns (bool[] memory isCanceled) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        isCanceled = new bool[](size);
        for (uint256 i; i < size; ) {
            isCanceled[i] = orderBook.cancelLimitOrder(orderId[i], address(this));
            unchecked {
                ++i;
            }
        }
    }

    function swapExactInput(
        uint8 orderBookId,
        bool isAsk,
        uint256 exactInput,
        uint256 minOutput,
        address recipient
    ) external payable returns (uint256, uint256) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        bytes memory callbackData = abi.encodePacked(orderBookId);

        return orderBook.swapExactSingle(isAsk, true, exactInput, minOutput, recipient, callbackData);
    }

    function swapExactOutput(
        uint8 orderBookId,
        bool isAsk,
        uint256 exactOutput,
        uint256 maxInput,
        address recipient
    ) external payable returns (uint256, uint256) {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        bytes memory callbackData = abi.encodePacked(orderBookId);

        return orderBook.swapExactSingle(isAsk, false, exactOutput, maxInput, recipient, callbackData);
    }

    function depositToken0(uint8 orderBookId, uint256 amount) external onlyOwner {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        bytes memory callbackData = abi.encodePacked(orderBookId);
        orderBook.depositToken(amount, true, callbackData);
    }

    function depositToken1(uint8 orderBookId, uint256 amount) external onlyOwner {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        bytes memory callbackData = abi.encodePacked(orderBookId);
        orderBook.depositToken(amount, false, callbackData);
    }

    function claimToken0(uint8 orderBookId, uint256 amount) external onlyOwner {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        orderBook.claimToken(amount, true);
    }

    function claimToken1(uint8 orderBookId, uint256 amount) external onlyOwner {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        orderBook.claimToken(amount, false);
    }

    function claimAll(uint8 orderBookId) external onlyOwner {
        IOrderBook orderBook = IOrderBook(factory.getOrderBookFromId(orderBookId));
        orderBook.claimToken(orderBook.claimableToken0Balance(address(this)), true);
        orderBook.claimToken(orderBook.claimableToken1Balance(address(this)), false);
    }
}
