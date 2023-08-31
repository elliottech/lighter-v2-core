// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "./libraries/Errors.sol";
import "./libraries/OrderBookDeployerLib.sol";
import "./interfaces/IFactory.sol";

/// @title Factory
/// @notice Manages the creation of order books and view of order book details
contract Factory is IFactory {
    uint256 public constant override ORDERBOOK_ID_THRESHOLD = (1 << 7) - 1;
    address public override owner;
    uint8 public override orderBookIdCounter;

    mapping(address => mapping(address => address)) private _orderBooksByTokenPair;
    mapping(uint8 => address) private _orderBooksById;

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Errors.LighterV2Factory_CallerNotOwner();
        }
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) {
            revert Errors.LighterV2Factory_OwnerCannotBeZero();
        }
        owner = _owner;
    }

    // @inheritdoc IFactory
    function createOrderBook(
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick,
        uint64 minToken0BaseAmount,
        uint128 minToken1BaseAmount
    ) external override onlyOwner returns (address orderBookAddress) {
        if (token0 == token1 || token0 == address(0) || token1 == address(0)) {
            revert Errors.LighterV2CreateOrderBook_InvalidTokenPair();
        }

        if (
            _orderBooksByTokenPair[token0][token1] != address(0) || _orderBooksByTokenPair[token1][token0] != address(0)
        ) {
            revert Errors.LighterV2CreateOrderBook_OrderBookAlreadyExists();
        }

        uint8 orderBookId = orderBookIdCounter;
        if (orderBookId >= ORDERBOOK_ID_THRESHOLD) {
            revert Errors.LighterV2CreateOrderBook_OrderBookIdExceedsLimit();
        }
        orderBookIdCounter = orderBookId + 1;

        orderBookAddress = OrderBookDeployerLib.deployOrderBook(
            orderBookId,
            token0,
            token1,
            logSizeTick,
            logPriceTick,
            minToken0BaseAmount,
            minToken1BaseAmount
        );

        _orderBooksByTokenPair[token0][token1] = orderBookAddress;
        _orderBooksById[orderBookId] = orderBookAddress;

        emit OrderBookCreated(
            orderBookAddress,
            orderBookId,
            token0,
            token1,
            logSizeTick,
            logPriceTick,
            minToken0BaseAmount,
            minToken1BaseAmount
        );
    }

    /// @inheritdoc IFactory
    function setOwner(address newOwner) external override onlyOwner {
        if (newOwner == address(0)) {
            revert Errors.LighterV2Factory_OwnerCannotBeZero();
        }
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    /// @inheritdoc IFactory
    function getAllOrderBooksDetails() external view override returns (OrderBookDetails[] memory) {
        uint8 size = orderBookIdCounter;
        OrderBookDetails[] memory allOrderBookDetails = new OrderBookDetails[](size);
        for (uint8 index = 0; index < size; index++) {
            allOrderBookDetails[index] = getOrderBookDetailsFromId(index);
        }
        return allOrderBookDetails;
    }

    /// @inheritdoc IFactory
    function getOrderBookFromTokenPair(address token0, address token1) external view override returns (address) {
        return _orderBooksByTokenPair[token0][token1];
    }

    /// @inheritdoc IFactory
    function getOrderBookFromId(uint8 orderBookId) external view override returns (address) {
        return _orderBooksById[orderBookId];
    }

    /// @inheritdoc IFactory
    function getOrderBookDetailsFromTokenPair(
        address token0,
        address token1
    ) external view override returns (OrderBookDetails memory orderBookDetails) {
        address orderBookAddress = _orderBooksByTokenPair[token0][token1];
        if (orderBookAddress != address(0)) {
            IOrderBook orderBook = IOrderBook(orderBookAddress);
            orderBookDetails.orderBookAddress = orderBookAddress;
            orderBookDetails.orderBookId = orderBook.orderBookId();
            orderBookDetails.token0 = token0;
            orderBookDetails.token1 = token1;
            orderBookDetails.sizeTick = orderBook.sizeTick();
            orderBookDetails.priceMultiplier = orderBook.priceMultiplier();
            orderBookDetails.priceDivider = orderBook.priceDivider();
            orderBookDetails.minToken0BaseAmount = orderBook.minToken0BaseAmount();
            orderBookDetails.minToken1BaseAmount = orderBook.minToken1BaseAmount();
        }
    }

    /// @inheritdoc IFactory
    function getOrderBookDetailsFromId(
        uint8 orderBookId
    ) public view override returns (OrderBookDetails memory orderBookDetails) {
        address orderBookAddress = _orderBooksById[orderBookId];
        if (orderBookAddress != address(0)) {
            IOrderBook orderBook = IOrderBook(orderBookAddress);
            orderBookDetails.orderBookAddress = orderBookAddress;
            orderBookDetails.orderBookId = orderBook.orderBookId();
            orderBookDetails.token0 = address(orderBook.token0());
            orderBookDetails.token1 = address(orderBook.token1());
            orderBookDetails.sizeTick = orderBook.sizeTick();
            orderBookDetails.priceMultiplier = orderBook.priceMultiplier();
            orderBookDetails.priceDivider = orderBook.priceDivider();
            orderBookDetails.minToken0BaseAmount = orderBook.minToken0BaseAmount();
            orderBookDetails.minToken1BaseAmount = orderBook.minToken1BaseAmount();
        }
    }
}
