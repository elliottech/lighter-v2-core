// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "./Errors.sol";
import "../interfaces/IOrderBook.sol";

/// @title LinkedList
/// @notice Struct to use for storing sorted linked lists of ask and bid orders
struct LinkedList {
    mapping(uint32 => IOrderBook.LimitOrder) asks;
    mapping(uint32 => IOrderBook.LimitOrder) bids;
}

/// @title LinkedListLib
/// @notice Implements a sorted linked list of limit orders and provides necessary functions for order management
/// @dev Head is represented by order id 0, tail is represented by order id 1
library LinkedListLib {
    /// @notice Inserts an order into the respective linked list and keeps sorted order
    /// @param orderId id of the order to insert
    /// @param isAsk true if the order is an ask order, false if the order is a bid order
    /// @param hintId hint id of the order where the new order should be inserted to the right of
    function insert(LinkedList storage self, uint32 orderId, bool isAsk, uint32 hintId) internal {
        mapping(uint32 => IOrderBook.LimitOrder) storage orders = isAsk ? self.asks : self.bids;
        IOrderBook.LimitOrder storage order = orders[orderId];

        if (orders[hintId].next == 0) {
            revert Errors.LighterV2Order_InvalidHintId();
        }

        while (orders[hintId].ownerId == 0) {
            hintId = orders[hintId].next;
        }

        // After the search, hintId will be where the new order should be inserted to the right of
        IOrderBook.LimitOrder memory hintOrder = orders[hintId];
        while (hintId != 1) {
            IOrderBook.LimitOrder memory nextOrder = orders[hintOrder.next];
            if (isAsk ? (order.priceBase < nextOrder.priceBase) : (order.priceBase > nextOrder.priceBase)) break;
            hintId = hintOrder.next;
            hintOrder = nextOrder;
        }
        while (hintId != 0) {
            if (isAsk ? (order.priceBase >= hintOrder.priceBase) : (order.priceBase <= hintOrder.priceBase)) break;
            hintId = hintOrder.prev;
            hintOrder = orders[hintId];
        }

        order.prev = hintId;
        order.next = orders[hintId].next;
        orders[order.prev].next = orderId;
        orders[order.next].prev = orderId;
    }

    /// @notice Removes given order id from the respective linked list
    /// @dev Updates the respective linked list but does not delete the order, sets the ownerId to 0 instead
    /// @param orderId The order id to remove
    /// @param isAsk true if the order is an ask order, false if the order is a bid order
    function erase(LinkedList storage self, uint32 orderId, bool isAsk) internal {
        if (orderId <= 1) {
            revert Errors.LighterV2Order_CannotEraseHeadOrTailOrders();
        }

        mapping(uint32 => IOrderBook.LimitOrder) storage orders = isAsk ? self.asks : self.bids;

        if (orders[orderId].ownerId == 0) {
            revert Errors.LighterV2Order_CannotCancelInactiveOrders();
        }
        IOrderBook.LimitOrder storage order = orders[orderId];
        order.ownerId = 0;

        uint32 prev = order.prev;
        uint32 next = order.next;
        orders[prev].next = next;
        orders[next].prev = prev;
    }

    /// @notice Returns a struct that represents order page with given parameters
    /// @param startOrderId The order id to start the pagination from (not inclusive)
    /// @param isAsk true if the paginated orders are ask orders, false if bid orders
    /// @param limit The number of orders to return
    /// @param ownerIdToAddress Mapping from owner id to owner address
    /// @param sizeTick The size tick of the order book
    /// @param priceTick The price tick of the order book
    function getPaginatedOrders(
        LinkedList storage self,
        uint32 startOrderId,
        bool isAsk,
        uint32 limit,
        mapping(uint32 => address) storage ownerIdToAddress,
        uint128 sizeTick,
        uint128 priceTick
    ) public view returns (IOrderBook.OrderQueryItem memory paginatedOrders) {
        mapping(uint32 => IOrderBook.LimitOrder) storage orders = isAsk ? self.asks : self.bids;

        if (orders[startOrderId].ownerId == 0) {
            revert Errors.LighterV2Order_CannotQueryFromInactiveOrder();
        }
        uint32 i = 0;
        paginatedOrders.ids = new uint32[](limit);
        paginatedOrders.owners = new address[](limit);
        paginatedOrders.amount0s = new uint256[](limit);
        paginatedOrders.prices = new uint256[](limit);
        for (uint32 pointer = orders[startOrderId].next; pointer != 1 && i < limit; pointer = orders[pointer].next) {
            IOrderBook.LimitOrder memory order = orders[pointer];
            paginatedOrders.ids[i] = pointer;
            paginatedOrders.owners[i] = ownerIdToAddress[order.ownerId];
            paginatedOrders.amount0s[i] = uint256(order.amount0Base) * sizeTick;
            paginatedOrders.prices[i] = order.priceBase * priceTick;
            unchecked {
                ++i;
            }
        }
        paginatedOrders.isAsk = isAsk;
    }

    /// @notice Find the order id to the right of where an order with given priceBase should be inserted.
    /// @param priceBase The priceBase to suggest the hintId for
    function suggestHintId(LinkedList storage self, uint64 priceBase, bool isAsk) public view returns (uint32) {
        mapping(uint32 => IOrderBook.LimitOrder) storage orders = isAsk ? self.asks : self.bids;
        // left of where the new order should be inserted.
        uint32 hintOrderId = 0;
        IOrderBook.LimitOrder memory hintOrder = orders[hintOrderId];
        while (hintOrderId != 1) {
            IOrderBook.LimitOrder memory nextOrder = orders[hintOrder.next];
            if (isAsk ? (priceBase < nextOrder.priceBase) : (priceBase > nextOrder.priceBase)) break;
            hintOrderId = hintOrder.next;
            hintOrder = nextOrder;
        }
        return hintOrderId;
    }
}
