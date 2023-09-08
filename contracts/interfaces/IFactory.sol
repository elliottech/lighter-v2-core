// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

/// @title Factory Interface
/// @notice The Factory facilitates creation of order books
interface IFactory {
    struct OrderBookDetails {
        address orderBookAddress;
        uint8 orderBookId;
        address token0;
        address token1;
        uint128 sizeTick;
        uint128 priceMultiplier;
        uint128 priceDivider;
        uint64 minToken0BaseAmount;
        uint128 minToken1BaseAmount;
    }

    /// @notice Event emitted when a new order book is created
    /// @param orderBookAddress The address of the new order book
    /// @param orderBookId The id of the new order book
    /// @param token0 The base token of the new order book
    /// @param token1 The quote token of the new order book
    /// @param logSizeTick log10 of base token tick, size of the base token
    /// should be multiples of 10**logSizeTick for limit orders
    /// @param logPriceTick log10 of price tick, price of unit base token
    /// should be multiples of 10**logPriceTick for limit orders
    /// @param minToken0BaseAmount minimum token0Base amount for limit orders
    /// @param minToken1BaseAmount minimum token1Base amount (token0Base * priceBase) for limit orders
    event OrderBookCreated(
        address orderBookAddress,
        uint8 orderBookId,
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick,
        uint64 minToken0BaseAmount,
        uint128 minToken1BaseAmount
    );

    /// @notice Event emitted when the owner is changed
    /// @param owner Address of the new owner
    event OwnerChanged(address owner);

    /// @notice Creates a new orderBook
    /// @param token0 The contract address of the base token
    /// @param token1 The contract address of the quote token
    /// @param logSizeTick log10 of the base token size tick
    /// @param logPriceTick log10 of the price tick
    /// @param minToken0BaseAmount minimum token0Base amount for limit order
    /// @param minToken1BaseAmount minimum token1Base amount (token0Base * priceBase) for limit order
    /// @return orderBookAddress The address of the deployed order book
    function createOrderBook(
        address token0,
        address token1,
        uint8 logSizeTick,
        uint8 logPriceTick,
        uint64 minToken0BaseAmount,
        uint128 minToken1BaseAmount
    ) external returns (address);

    /// @notice Sets the owner of the factory
    /// @param newOwner The address of the new owner
    function setOwner(address newOwner) external;

    /// @notice Get the details of all order books
    /// @return orderBooksDetails OrderBookDetails[] array containing the details for all order books
    function getAllOrderBooksDetails() external view returns (OrderBookDetails[] memory);

    /// @notice Returns the address of the order book for a given token pair, or address 0 if it does not exist
    /// @param token0 The contract address the first token
    /// @param token1 The contract address the second token
    /// @return orderBookAddress The address of the order book
    function getOrderBookFromTokenPair(address token0, address token1) external view returns (address);

    /// @notice Returns the address of the order book for the given order book id
    /// @param orderBookId The id of the order book to lookup
    /// @return orderBookAddress The address of the order book
    function getOrderBookFromId(uint8 orderBookId) external view returns (address);

    /// @notice Returns the details of the order book for a given token pair
    /// @param token0 The first token of the order book
    /// @param token1 The second token of the order book
    /// @return orderBookDetails the details of the order book
    function getOrderBookDetailsFromTokenPair(
        address token0,
        address token1
    ) external view returns (OrderBookDetails memory);

    /// @notice Returns the details of the order book for a given order book id
    /// @param orderBookId The id of the order book to lookup
    /// @return orderBookDetails the details of the order book
    function getOrderBookDetailsFromId(uint8 orderBookId) external view returns (OrderBookDetails memory);

    /// @notice Returns the constant value of the order book capacity
    /// @return ORDERBOOK_ID_THRESHOLD capacity of order books
    function ORDERBOOK_ID_THRESHOLD() external view returns (uint256);

    /// @notice Returns the current owner of the factory
    /// @return owner The address of the factory owner
    function owner() external view returns (address);

    /// @notice Returns the id of the next order book to create
    /// @return orderBookIdCounter id of the next order book
    function orderBookIdCounter() external view returns (uint8);
}
