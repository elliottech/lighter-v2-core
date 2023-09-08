// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./interfaces/IOrderBook.sol";
import "./interfaces/ILighterV2FlashCallback.sol";
import "./interfaces/ILighterV2TransferCallback.sol";

import "./libraries/LinkedList.sol";
import "./libraries/Errors.sol";
import {IERC20Minimal} from "./interfaces/external/IERC20Minimal.sol";

/**
 * @title Order Book
 * @notice Contract representing an order book for trading token pairs. It manages
 * the creation and interaction of orders, and tracks various parameters related
 * to order management.
 * @notice OrderBook can handle different types of orders and order-life-cycle management
 * @notice User can swap tokens in the order book via direct call on orderBook or via router
 * @dev for direct order book interaction of order-creation and token-swap, ensure the caller
 *      has implemented the callback interface to handle payments
 */
contract OrderBook is IOrderBook, ReentrancyGuard {
    /// @dev Limits the value for size and price ticks
    uint8 public constant LOG10_TICK_THRESHOLD = 38;

    /// @dev Limits the total number of orders that can be created
    uint32 public constant ORDER_ID_THRESHOLD = (1 << 32) - 1;

    /// @dev Limits the unique number of creators, which are smart contracts
    /// that call the order book and implements the callback interfaces
    uint32 public constant CREATOR_ID_THRESHOLD = (1 << 31) - 1;

    uint64 public constant MAX_PRICE = type(uint64).max;

    // Using the LinkedListLib for order management
    using LinkedListLib for LinkedList;

    /// @notice The ERC20 token used as token0 in the trading pair
    IERC20Minimal public immutable token0;

    /// @notice The ERC20 token used as token1 in the trading pair
    IERC20Minimal public immutable token1;

    /// @notice The id of the order book
    uint8 public immutable orderBookId;

    /// @notice The minimum base token0 amount required for an order to be valid
    uint64 public immutable minToken0BaseAmount;

    /// @notice The minimum base token1 amount required for an order to be valid (token0Base * priceBase)
    uint128 public immutable minToken1BaseAmount;

    /// @notice The step size for token0 amounts
    uint128 public immutable sizeTick;

    /// @notice The step size for unit token0 price
    uint128 public immutable priceTick;

    /// @notice The multiplier used for calculating the amount1 from priceBase and amount0Base
    uint128 public immutable priceMultiplier;

    /// @notice The divider used for calculating the amount1 from priceBase and amount0Base
    uint128 public immutable priceDivider;

    /// @dev The id of the next order to be created, also used for setting ownerId and creatorId for gas efficiency
    uint32 public orderIdCounter;

    /// @notice The data structure used for storing the active orders
    /// @dev If an ask order, book needs to store at least amount0Base * sizeTick amount of token0. If a bid order,
    /// book needs to store at least amount0Base * priceMultiplier * sizeTick / priceDivider amount of token1
    LinkedList private _orders;

    /// @notice Mapping from address to claimable token0 balance
    mapping(address => uint256) public claimableToken0Balance;

    /// @notice Mapping from address to claimable token1 balance
    mapping(address => uint256) public claimableToken1Balance;

    /// @notice Mapping from ownerId to address
    mapping(uint32 => address) public ownerIdToAddress;

    /// @notice Mapping from address to ownerId
    mapping(address => uint32) public addressToOwnerId;

    /// @notice Mapping from address to creatorId
    mapping(address => uint32) public addressToCreatorId;

    /// @notice Mapping from creatorId to address
    mapping(uint32 => address) public creatorIdToAddress;

    /// @notice A struct containing variables used for order matching.
    struct MatchOrderLocalVars {
        uint32 index; // id of the maker order being matched
        address makerAddress; // owner address of the maker order
        uint256 filledAmount0; // Amount of token0 already filled in the taker order
        uint256 filledAmount1; // Amount of token1 already filled in the taker order
        uint256 amount; // Exact amount of tokens to be sent or received in a swap
        uint64 makerAmount0BaseChange; // Maker order amont0Base change
        uint256 swapAmount0; // Amount of token0 to be swaped with maker order
        uint256 swapAmount1; // Amount of token1 to be swaped with maker order
        uint64 swapAmount0Base; // Base amount of token0 to be swaped with maker order
        uint128 swapAmount1Base; // Base amount of token1 to be swaped with maker order
        bool atLeastOneFullSwap; // Flag indicating if taker took at least one maker order fully
        bool fullTakerFill; // Flag indicating if taker order is fully filled
        uint32 swapCount; // Count of swaps performed
        uint32 swapCapacity; // Capacity swaps array
        SwapData[] swaps; // Array of swap data
    }

    /// @notice A struct containing payment-related data for order and swap operations.
    struct PaymentData {
        bool isAsk; // Flag indicating if the taker order is an ask order
        bool isPerfMode; // Flag indicating if the taker order is a performance limit order
        address recipient; // Recipient address for payments
        uint256 filledAmount0; // Total amount of token0 in the swaps
        uint256 filledAmount1; // Total amount of token1 in the swaps
        uint256 remainingLimitOrderAmount; // Amount taker needs to pay for unmatched part of their limit order
        uint32 swapCount; // Count of swaps performed
        SwapData[] swaps; // Array of swap data
        bytes callbackData; // Additional callback data for payment.
    }

    /// @dev Struct that holds swap data during matching
    struct SwapData {
        address makerAddress; // Address of the owner of the matched order
        uint256 swapAmount; // Amount of tokens matched in the order
        bool isPerfMode; // Flag indicating if the order is in performance mode
    }

    /// @notice Contract constructor
    /// @param _orderBookId The id of the order book
    /// @param _token0Address The base token address
    /// @param _token1Address The quote token address
    /// @param _logSizeTick log10 of base token tick, size of the base token
    /// should be multiples of 10**logSizeTick for limit orders
    /// @param _logPriceTick log10 of price tick, price of unit base token
    /// should be multiples of 10**logPriceTick for limit orders
    /// @param _minToken0BaseAmount minimum token0Base amount for limit orders
    /// @param _minToken1BaseAmount minimum token1Base amount (token0Base * priceBase) for limit orders
    /// @dev Initializes the contract and linked lists with provided parameters
    constructor(
        uint8 _orderBookId,
        address _token0Address,
        address _token1Address,
        uint8 _logSizeTick,
        uint8 _logPriceTick,
        uint64 _minToken0BaseAmount,
        uint128 _minToken1BaseAmount
    ) {
        token0 = IERC20Minimal(_token0Address);
        token1 = IERC20Minimal(_token1Address);
        orderBookId = _orderBookId;
        uint8 token0Decimals = token0.decimals();

        if (_logSizeTick >= LOG10_TICK_THRESHOLD || _logPriceTick >= LOG10_TICK_THRESHOLD) {
            revert Errors.LighterV2CreateOrderBook_InvalidTickCombination();
        }

        sizeTick = uint128(10 ** _logSizeTick);
        priceTick = uint128(10 ** _logPriceTick);
        uint128 priceMultiplierCheck = 1;
        uint128 priceDividerCheck = 1;
        if (_logSizeTick + _logPriceTick >= token0Decimals) {
            if (_logSizeTick + _logPriceTick - token0Decimals >= LOG10_TICK_THRESHOLD) {
                revert Errors.LighterV2CreateOrderBook_InvalidTickCombination();
            }
            priceMultiplierCheck = uint128(10 ** (_logSizeTick + _logPriceTick - token0Decimals));
        } else {
            if (token0Decimals - _logSizeTick - _logPriceTick >= LOG10_TICK_THRESHOLD) {
                revert Errors.LighterV2CreateOrderBook_InvalidTickCombination();
            }
            priceDividerCheck = uint128(10 ** (token0Decimals - _logPriceTick - _logSizeTick));
        }

        priceMultiplier = priceMultiplierCheck;
        priceDivider = priceDividerCheck;

        if (_minToken0BaseAmount == 0 || _minToken1BaseAmount == 0) {
            revert Errors.LighterV2CreateOrderBook_InvalidMinAmount();
        }
        minToken0BaseAmount = _minToken0BaseAmount;
        minToken1BaseAmount = _minToken1BaseAmount;

        // Create the head node for asks linked list, this node can not be deleted
        _orders.asks[0] = LimitOrder({
            prev: 0,
            next: 1,
            perfMode_creatorId: 0,
            ownerId: 1,
            amount0Base: 0,
            priceBase: 0
        });
        // Create the tail node for asks linked list, this node can not be deleted
        _orders.asks[1] = LimitOrder({
            prev: 0,
            next: 1,
            perfMode_creatorId: 0,
            ownerId: 1,
            amount0Base: 0,
            priceBase: MAX_PRICE
        });
        // Create the head node for bids linked list, this node can not be deleted
        _orders.bids[0] = LimitOrder({
            prev: 0,
            next: 1,
            perfMode_creatorId: 0,
            ownerId: 1,
            amount0Base: 0,
            priceBase: MAX_PRICE
        });
        // Create the tail node for bids linked list, this node can not be deleted
        _orders.bids[1] = LimitOrder({
            prev: 0,
            next: 1,
            perfMode_creatorId: 0,
            ownerId: 1,
            amount0Base: 0,
            priceBase: 0
        });
        // Id 0 and 1 are used for heads and tails. Next order should start from id 2
        orderIdCounter = 2;
    }

    /// @inheritdoc IOrderBook
    function createOrder(
        uint64 amount0Base,
        uint64 priceBase,
        bool isAsk,
        address owner,
        uint32 hintId,
        OrderType orderType,
        bytes memory callbackData
    ) external override nonReentrant returns (uint32 newOrderId) {
        newOrderId = orderIdCounter;

        // For every order type, the amount0Base needs to be at least 1
        if (amount0Base == 0) {
            revert Errors.LighterV2Order_AmountTooSmall();
        }

        // priceBase needs to be at least priceDivider
        // this guarantees that any increase of amount0Base will increase amount1 by at least 1
        // as priceDivider is guaranteed to be at least 1, an error is always thrown if priceBase = 0,
        // which is reserved for the dummy order with id 0
        if (priceBase < priceDivider) {
            revert Errors.LighterV2Order_PriceTooSmall();
        }

        // do not allow orders with the max price, as the price is reserved for the big dummy order.
        // this is required so no order is inserted after the dummy order with id 1
        if (priceBase == MAX_PRICE) {
            revert Errors.LighterV2Order_PriceTooBig();
        }

        if (orderType == OrderType.LimitOrder || orderType == OrderType.PerformanceLimitOrder) {
            if (hintId >= newOrderId) {
                revert Errors.LighterV2Order_InvalidHintId();
            }
            if ((amount0Base < minToken0BaseAmount || priceBase * amount0Base < minToken1BaseAmount)) {
                revert Errors.LighterV2Order_AmountTooSmall();
            }
        }

        LimitOrder memory newOrder;

        {
            if (newOrderId >= ORDER_ID_THRESHOLD) {
                revert Errors.LighterV2Order_OrderIdExceedsLimit();
            }

            orderIdCounter = newOrderId + 1;

            newOrder = LimitOrder({
                perfMode_creatorId: 0, // Only set if order needs to be inserted into the order book
                prev: 0, // Only set if order needs to be inserted into the order book
                next: 0, // Only set if order needs to be inserted into the order book
                ownerId: 0, // Only set if order needs to be inserted into the order book
                amount0Base: amount0Base,
                priceBase: priceBase
            });

            emit CreateOrder(owner, newOrderId, amount0Base, priceBase, isAsk, orderType);
        }

        (uint256 filledAmount0, uint256 filledAmount1, uint32 swapCount, SwapData[] memory swaps) = _matchOrder(
            newOrder,
            newOrderId,
            isAsk
        );
        // Short circuit payments if Fill or Kill order is not fully filled and needs to be killed
        if (orderType == OrderType.FoKOrder && newOrder.amount0Base > 0) {
            revert Errors.LighterV2Order_FoKNotFilled();
        }

        // Computes the amount caller needs to pay for remaning part of their limit order
        uint256 remainingLimitOrderAmount = 0;
        if (
            (orderType == OrderType.LimitOrder || orderType == OrderType.PerformanceLimitOrder) &&
            newOrder.amount0Base > 0
        ) {
            remainingLimitOrderAmount = (isAsk)
                ? (uint256(newOrder.amount0Base) * sizeTick)
                : (uint256(newOrder.amount0Base) * newOrder.priceBase * priceMultiplier) / priceDivider;
        }

        // Handle token transfers between makers and takers and for remainingLimitOrderAmount
        if (
            filledAmount0 > 0 ||
            filledAmount1 > 0 ||
            orderType == OrderType.LimitOrder ||
            orderType == OrderType.PerformanceLimitOrder
        ) {
            _handlePayments(
                PaymentData(
                    isAsk,
                    orderType == OrderType.PerformanceLimitOrder,
                    owner,
                    filledAmount0,
                    filledAmount1,
                    remainingLimitOrderAmount,
                    swapCount,
                    swaps,
                    callbackData
                )
            );
        }

        // If the order is not fully filled, set remaining value in newOrder and insert it into respective order book
        if (remainingLimitOrderAmount > 0) {
            // Get the ownerId if exists, otherwise set the ownerId using the from address
            newOrder.ownerId = addressToOwnerId[owner];
            if (newOrder.ownerId == 0) {
                newOrder.ownerId = newOrderId;
                addressToOwnerId[owner] = newOrder.ownerId;
                ownerIdToAddress[newOrderId] = owner;
            }

            // creatorId can only be non-zero if msg.sender different from the owner and order is a limit order
            if (msg.sender != owner) {
                newOrder.perfMode_creatorId = addressToCreatorId[msg.sender];
                if (newOrder.perfMode_creatorId == 0) {
                    // LimitOrder stores 31 bits for the creator id, only allow setting a non-zero creator id if it's below the limit
                    if (newOrderId >= CREATOR_ID_THRESHOLD) {
                        revert Errors.LighterV2Order_CreatorIdExceedsLimit();
                    }
                    newOrder.perfMode_creatorId = newOrderId;
                    addressToCreatorId[msg.sender] = newOrder.perfMode_creatorId;
                    creatorIdToAddress[newOrder.perfMode_creatorId] = msg.sender;
                }
                newOrder.perfMode_creatorId <<= 1;
            }

            if (orderType == OrderType.PerformanceLimitOrder) {
                newOrder.perfMode_creatorId = newOrder.perfMode_creatorId | 1;
            }

            if (isAsk) {
                _orders.asks[newOrderId] = newOrder;
                _orders.insert(newOrderId, isAsk, hintId);
            } else {
                _orders.bids[newOrderId] = newOrder;
                _orders.insert(newOrderId, isAsk, hintId);
            }
        }
    }

    /// @inheritdoc IOrderBook
    function cancelLimitOrder(uint32 id, address owner) external override nonReentrant returns (bool) {
        if (!isOrderActive(id)) {
            return false;
        }

        LimitOrder memory order;

        bool isAsk = isAskOrder(id);
        if (isAsk) {
            order = _orders.asks[id];
        } else {
            order = _orders.bids[id];
        }

        address _owner = ownerIdToAddress[order.ownerId];
        uint32 creatorId = (order.perfMode_creatorId >> 1);
        address creator = _owner;
        if (creatorId != 0) {
            creator = creatorIdToAddress[creatorId];
        }

        // only the creator or the owner can cancel the order
        if ((owner != _owner) || (msg.sender != creator && msg.sender != _owner)) {
            revert Errors.LighterV2Owner_CallerCannotCancel();
        }

        emit CancelLimitOrder(id);

        if (isAsk) {
            uint256 amount0 = uint256(order.amount0Base) * sizeTick;
            bool success = false;
            if ((order.perfMode_creatorId & 1) == 0) {
                success = _sendToken(token0, _owner, amount0);
            }
            if (!success) {
                claimableToken0Balance[_owner] += amount0;
                if ((order.perfMode_creatorId & 1) == 0) {
                    emit ClaimableBalanceIncrease(_owner, amount0, true);
                }
            }
            _orders.erase(id, isAsk);
        } else {
            uint256 amount1 = ((uint256(order.amount0Base) * order.priceBase) * priceMultiplier) / priceDivider;
            bool success = false;
            if ((order.perfMode_creatorId & 1) == 0) {
                success = _sendToken(token1, _owner, amount1);
            }
            if (!success) {
                claimableToken1Balance[_owner] += amount1;
                if ((order.perfMode_creatorId & 1) == 0) {
                    emit ClaimableBalanceIncrease(_owner, amount1, false);
                }
            }
            _orders.erase(id, isAsk);
        }
        return true;
    }

    /// @inheritdoc IOrderBook
    function swapExactSingle(
        bool isAsk,
        bool isExactInput,
        uint256 exactAmount,
        uint256 expectedAmount,
        address recipient,
        bytes memory callbackData
    ) external override nonReentrant returns (uint256, uint256) {
        (uint256 filledAmount0, uint256 filledAmount1, uint32 swapCount, SwapData[] memory swaps) = _matchSwapOrder(
            isAsk,
            isExactInput,
            exactAmount,
            expectedAmount,
            recipient
        );

        _handlePayments(
            PaymentData(isAsk, false, recipient, filledAmount0, filledAmount1, 0, swapCount, swaps, callbackData)
        );

        emit SwapExactAmount(msg.sender, recipient, isExactInput, isAsk, filledAmount0, filledAmount1);

        return (filledAmount0, filledAmount1);
    }

    /// @inheritdoc IOrderBook
    function flashLoan(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata callbackData
    ) external override nonReentrant {
        uint256 orderBookToken0BalanceBeforeLoan = token0.balanceOf(address(this));
        uint256 orderBookToken1BalanceBeforeLoan = token1.balanceOf(address(this));

        if (amount0 > 0 && !_sendToken(token0, recipient, amount0)) {
            revert Errors.LighterV2TokenTransfer_Failed();
        }

        if (amount1 > 0 && !_sendToken(token1, recipient, amount1)) {
            revert Errors.LighterV2TokenTransfer_Failed();
        }

        ILighterV2FlashCallback(msg.sender).flashLoanCallback(callbackData);

        if (token0.balanceOf(address(this)) < orderBookToken0BalanceBeforeLoan) {
            revert Errors.LighterV2FlashLoan_InsufficentCallbackTransfer();
        }

        if (token1.balanceOf(address(this)) < orderBookToken1BalanceBeforeLoan) {
            revert Errors.LighterV2FlashLoan_InsufficentCallbackTransfer();
        }

        emit FlashLoan(msg.sender, recipient, amount0, amount1);
    }

    /// @inheritdoc IOrderBook
    function depositToken(
        uint256 amountToDeposit,
        bool isToken0,
        bytes memory callbackData
    ) external override nonReentrant {
        address owner = msg.sender;
        IERC20Minimal token = isToken0 ? token0 : token1;
        uint256 balanceBefore = token.balanceOf(address(this));

        ILighterV2TransferCallback(owner).lighterV2TransferCallback(amountToDeposit, token, callbackData);

        if (token.balanceOf(address(this)) < balanceBefore + amountToDeposit) {
            revert Errors.LighterV2Vault_InsufficentCallbackTransfer();
        }
        if (isToken0) {
            claimableToken0Balance[owner] += amountToDeposit;
        } else {
            claimableToken1Balance[owner] += amountToDeposit;
        }
        emit ClaimableBalanceIncrease(owner, amountToDeposit, isToken0);
    }

    /// @inheritdoc IOrderBook
    function claimToken(uint256 amountToClaim, bool isToken0) external override nonReentrant {
        address owner = msg.sender;
        uint256 amount = isToken0 ? claimableToken0Balance[owner] : claimableToken1Balance[owner];
        if (amountToClaim > 0 && amountToClaim <= amount) {
            if (isToken0) {
                claimableToken0Balance[owner] -= amountToClaim;
                if (!_sendToken(token0, owner, amountToClaim)) {
                    revert Errors.LighterV2TokenTransfer_Failed();
                }
            } else {
                claimableToken1Balance[owner] -= amountToClaim;
                if (!_sendToken(token1, owner, amountToClaim)) {
                    revert Errors.LighterV2TokenTransfer_Failed();
                }
            }
            emit ClaimableBalanceDecrease(owner, amountToClaim, isToken0);
        } else {
            revert Errors.LighterV2Vault_InvalidClaimAmount();
        }
    }

    /// @dev Matches the given limit order against the available maker orders.
    /// @param order The taker order to be matched
    /// @param orderId The id of the taker order
    /// @param isAsk Indicates whether the taker order is an ask order or not
    /// @return filledAmount0 The total amount of token0 swapped in matching
    /// @return filledAmount1 The total amount of token1 swapped in matching
    /// @return swapCount The count of swaps performed
    /// @return swaps The array that contains data of swaps performed
    function _matchOrder(
        LimitOrder memory order,
        uint32 orderId,
        bool isAsk
    ) internal returns (uint256, uint256, uint32, SwapData[] memory) {
        MatchOrderLocalVars memory matchOrderLocalVars;

        mapping(uint32 => LimitOrder) storage makerOrders = isAsk ? _orders.bids : _orders.asks;

        matchOrderLocalVars.index = makerOrders[0].next;

        while (matchOrderLocalVars.index != 1 && order.amount0Base > 0) {
            LimitOrder storage bestOrder = makerOrders[matchOrderLocalVars.index];
            matchOrderLocalVars.makerAddress = ownerIdToAddress[bestOrder.ownerId];
            (matchOrderLocalVars.swapAmount0Base, matchOrderLocalVars.swapAmount1Base) = getLimitOrderSwapAmounts(
                order.amount0Base,
                order.priceBase,
                bestOrder.amount0Base,
                bestOrder.priceBase,
                isAsk
            );

            if (matchOrderLocalVars.swapAmount0Base == 0 || matchOrderLocalVars.swapAmount1Base == 0) break;

            matchOrderLocalVars.swapAmount0 = uint256(matchOrderLocalVars.swapAmount0Base) * sizeTick;
            matchOrderLocalVars.swapAmount1 =
                (uint256(matchOrderLocalVars.swapAmount1Base) * priceMultiplier) /
                priceDivider;

            if (isAsk) {
                emit Swap(
                    orderId,
                    matchOrderLocalVars.index,
                    msg.sender,
                    matchOrderLocalVars.makerAddress,
                    matchOrderLocalVars.swapAmount0,
                    matchOrderLocalVars.swapAmount1
                );
            } else {
                emit Swap(
                    matchOrderLocalVars.index,
                    orderId,
                    matchOrderLocalVars.makerAddress,
                    msg.sender,
                    matchOrderLocalVars.swapAmount0,
                    matchOrderLocalVars.swapAmount1
                );
            }

            matchOrderLocalVars.filledAmount0 = matchOrderLocalVars.filledAmount0 + matchOrderLocalVars.swapAmount0;
            matchOrderLocalVars.filledAmount1 = matchOrderLocalVars.filledAmount1 + matchOrderLocalVars.swapAmount1;

            // if there are not enough free slots in the matchOrderLocalVars.matchedOrders, increase size to accommodate
            if (matchOrderLocalVars.swapCount == matchOrderLocalVars.swapCapacity) {
                // initial capacity will be 4, and we'll double afterwards
                uint32 newCapacity = 4;
                if (matchOrderLocalVars.swapCapacity != 0) {
                    newCapacity = matchOrderLocalVars.swapCapacity * 2;
                }

                SwapData[] memory newSwaps = new SwapData[](newCapacity);
                for (uint32 i = 0; i < matchOrderLocalVars.swapCapacity; i += 1) {
                    newSwaps[i] = matchOrderLocalVars.swaps[i];
                }

                matchOrderLocalVars.swaps = newSwaps;
                matchOrderLocalVars.swapCapacity = newCapacity;
            }

            matchOrderLocalVars.swaps[matchOrderLocalVars.swapCount++] = SwapData({
                makerAddress: matchOrderLocalVars.makerAddress,
                isPerfMode: (bestOrder.perfMode_creatorId & 1 == 1),
                swapAmount: isAsk ? matchOrderLocalVars.swapAmount0 : matchOrderLocalVars.swapAmount1
            });

            order.amount0Base = order.amount0Base - matchOrderLocalVars.swapAmount0Base;

            if (bestOrder.amount0Base == matchOrderLocalVars.swapAmount0Base) {
                // Remove the best bid from the order book if it is fully filled
                matchOrderLocalVars.atLeastOneFullSwap = true;
                bestOrder.ownerId = 0;
            } else {
                // Update the best bid if it is partially filled
                bestOrder.amount0Base = bestOrder.amount0Base - matchOrderLocalVars.swapAmount0Base;
                break;
            }

            matchOrderLocalVars.index = bestOrder.next;
        }
        if (matchOrderLocalVars.atLeastOneFullSwap) {
            makerOrders[matchOrderLocalVars.index].prev = 0;
            makerOrders[0].next = matchOrderLocalVars.index;
        }

        return (
            matchOrderLocalVars.filledAmount0,
            matchOrderLocalVars.filledAmount1,
            matchOrderLocalVars.swapCount,
            matchOrderLocalVars.swaps
        );
    }

    /// @dev Matches the given swap request (market order) against the available maker orders.
    /// @param isAsk Indicates whether the swap request is an ask order or not
    /// @param isExactInput Indicates whether the swapper indicated exact input or output
    /// @param exactAmount The exact amount swapper wants to receive or send depending on isExactInput
    /// @param thresholdAmount The minimum amount to be received or maximum amount to be sent
    /// @param recipient The recipient address for swaps
    /// @return filledAmount0 The total amount of token0 swapped in matching
    /// @return filledAmount1 The total amount of token1 swapped in matching
    /// @return swapCount The count of swaps performed
    /// @return swaps The array that contains data of swaps performed
    function _matchSwapOrder(
        bool isAsk,
        bool isExactInput,
        uint256 exactAmount,
        uint256 thresholdAmount,
        address recipient
    ) internal returns (uint256, uint256, uint32, SwapData[] memory) {
        MatchOrderLocalVars memory matchOrderLocalVars;
        mapping(uint32 => LimitOrder) storage makerOrders = isAsk ? _orders.bids : _orders.asks;
        matchOrderLocalVars.amount = exactAmount;
        matchOrderLocalVars.index = makerOrders[0].next;
        matchOrderLocalVars.fullTakerFill = exactAmount == 0;

        while (matchOrderLocalVars.index != 1 && !matchOrderLocalVars.fullTakerFill) {
            LimitOrder storage bestMatch = makerOrders[matchOrderLocalVars.index];

            (
                matchOrderLocalVars.swapAmount0,
                matchOrderLocalVars.swapAmount1,
                matchOrderLocalVars.makerAmount0BaseChange,
                matchOrderLocalVars.fullTakerFill
            ) = (isExactInput && isAsk) || (!isExactInput && !isAsk)
                ? getSwapAmountsForToken0(matchOrderLocalVars.amount, isAsk, bestMatch.amount0Base, bestMatch.priceBase)
                : getSwapAmountsForToken1(
                    matchOrderLocalVars.amount,
                    isAsk,
                    bestMatch.amount0Base,
                    bestMatch.priceBase
                );

            // If the swap amount is 0, break the loop since next orders guaranteed to have 0 as well
            if (matchOrderLocalVars.swapAmount0 == 0 || matchOrderLocalVars.swapAmount1 == 0) break;

            if (isAsk) {
                emit Swap(
                    0, // emit 0 id for swap requests (market order)
                    matchOrderLocalVars.index,
                    recipient,
                    ownerIdToAddress[bestMatch.ownerId],
                    matchOrderLocalVars.swapAmount0,
                    matchOrderLocalVars.swapAmount1
                );
            } else {
                emit Swap(
                    matchOrderLocalVars.index,
                    0, // emit 0 id for swap requests (market order)
                    ownerIdToAddress[bestMatch.ownerId],
                    recipient,
                    matchOrderLocalVars.swapAmount0,
                    matchOrderLocalVars.swapAmount1
                );
            }

            matchOrderLocalVars.filledAmount0 += matchOrderLocalVars.swapAmount0;
            matchOrderLocalVars.filledAmount1 += matchOrderLocalVars.swapAmount1;

            // if there are not enough free slots in the matchOrderLocalVars.swaps, increase size to accommodate
            if (matchOrderLocalVars.swapCount == matchOrderLocalVars.swapCapacity) {
                // initial capacity will be 4, and we'll double afterwards
                uint32 newCapacity = 4;
                if (matchOrderLocalVars.swapCapacity != 0) {
                    newCapacity = matchOrderLocalVars.swapCapacity * 2;
                }

                SwapData[] memory newSwaps = new SwapData[](newCapacity);
                for (uint32 i = 0; i < matchOrderLocalVars.swapCapacity; i += 1) {
                    newSwaps[i] = matchOrderLocalVars.swaps[i];
                }

                matchOrderLocalVars.swaps = newSwaps;
                matchOrderLocalVars.swapCapacity = newCapacity;
            }

            matchOrderLocalVars.swaps[matchOrderLocalVars.swapCount++] = SwapData({
                makerAddress: ownerIdToAddress[bestMatch.ownerId],
                isPerfMode: (bestMatch.perfMode_creatorId & 1 == 1),
                swapAmount: isAsk ? matchOrderLocalVars.swapAmount0 : matchOrderLocalVars.swapAmount1
            });

            if (bestMatch.amount0Base == matchOrderLocalVars.makerAmount0BaseChange) {
                // Remove the best bid from the order book if it is fully filled
                matchOrderLocalVars.atLeastOneFullSwap = true;
                bestMatch.ownerId = 0;
            } else {
                // Update the best bid if it is partially filled
                bestMatch.amount0Base -= matchOrderLocalVars.makerAmount0BaseChange;
                break;
            }

            matchOrderLocalVars.index = bestMatch.next;
            if (matchOrderLocalVars.fullTakerFill) {
                // Break before updating the amount, if taker specifies exactOutput taker will receive largest
                // amount of output tokens they can buy with same input needed for exactOutput. Amount can be
                // negative if taker is receiving slightly more than exactOutput (depending on the ticks).
                break;
            }

            if ((isAsk && isExactInput) || (!isAsk && !isExactInput)) {
                matchOrderLocalVars.amount -= matchOrderLocalVars.swapAmount0;
            } else {
                matchOrderLocalVars.amount -= matchOrderLocalVars.swapAmount1;
            }
        }

        if (matchOrderLocalVars.atLeastOneFullSwap) {
            makerOrders[matchOrderLocalVars.index].prev = 0;
            makerOrders[0].next = matchOrderLocalVars.index;
        }

        if (!matchOrderLocalVars.fullTakerFill) {
            revert Errors.LighterV2Swap_NotEnoughLiquidity();
        }

        if (
            isExactInput &&
            ((isAsk && matchOrderLocalVars.filledAmount1 < thresholdAmount) ||
                (!isAsk && matchOrderLocalVars.filledAmount0 < thresholdAmount))
        ) {
            revert Errors.LighterV2Swap_NotEnoughOutput();
        } else if (
            !isExactInput &&
            ((isAsk && matchOrderLocalVars.filledAmount0 > thresholdAmount) ||
                (!isAsk && matchOrderLocalVars.filledAmount1 > thresholdAmount))
        ) {
            revert Errors.LighterV2Swap_TooMuchRequested();
        }

        return (
            matchOrderLocalVars.filledAmount0,
            matchOrderLocalVars.filledAmount1,
            matchOrderLocalVars.swapCount,
            matchOrderLocalVars.swaps
        );
    }

    /// @dev Handles the payment logic for a matched order.
    /// @param paymentData The payment data containing information about the swaps and payments
    function _handlePayments(PaymentData memory paymentData) internal {
        // Determine debit and credit tokens based on the order type
        IERC20Minimal debitToken = paymentData.isAsk ? token0 : token1;
        IERC20Minimal creditToken = paymentData.isAsk ? token1 : token0;

        uint256 debitTokenAmount = (paymentData.isAsk ? paymentData.filledAmount0 : paymentData.filledAmount1) +
            paymentData.remainingLimitOrderAmount;
        uint256 creditTokenAmount = paymentData.isAsk ? paymentData.filledAmount1 : paymentData.filledAmount0;

        if (creditTokenAmount > 0) {
            if (paymentData.isPerfMode) {
                if (paymentData.isAsk) {
                    claimableToken1Balance[paymentData.recipient] += creditTokenAmount;
                } else {
                    claimableToken0Balance[paymentData.recipient] += creditTokenAmount;
                }
                // Omit emitting ClaimableBalanceIncrease for gas savings, can be inferred from swap events
            } else {
                if (!_sendToken(creditToken, paymentData.recipient, creditTokenAmount)) {
                    revert Errors.LighterV2TokenTransfer_Failed();
                }
            }
        }

        if (paymentData.isPerfMode) {
            if (paymentData.isAsk) {
                if (claimableToken0Balance[msg.sender] < debitTokenAmount) {
                    revert Errors.LighterV2Order_InsufficientClaimableBalance();
                }
                claimableToken0Balance[msg.sender] -= debitTokenAmount;
            } else {
                if (claimableToken1Balance[msg.sender] < debitTokenAmount) {
                    revert Errors.LighterV2Order_InsufficientClaimableBalance();
                }
                claimableToken1Balance[msg.sender] -= debitTokenAmount;
            }
            // Omit emitting ClaimableBalanceDecrease for gas savings, can be inferred from swap and order creation events
        } else {
            uint256 debitTokenBalanceBeforeDebit = debitToken.balanceOf(address(this));

            ILighterV2TransferCallback(msg.sender).lighterV2TransferCallback(
                debitTokenAmount,
                debitToken,
                paymentData.callbackData
            );

            if (debitToken.balanceOf(address(this)) < (debitTokenBalanceBeforeDebit + debitTokenAmount)) {
                revert Errors.LighterV2Order_InsufficentCallbackTransfer();
            }
        }

        // Loop through swaps and transfer tokens to the maker order owners
        for (uint32 swapIndex; swapIndex < paymentData.swapCount; ++swapIndex) {
            SwapData memory swapData = paymentData.swaps[swapIndex];
            if (swapData.isPerfMode) {
                if (paymentData.isAsk) {
                    claimableToken0Balance[swapData.makerAddress] += swapData.swapAmount;
                } else {
                    claimableToken1Balance[swapData.makerAddress] += swapData.swapAmount;
                }
                // omit emitting ClaimableBalanceIncrease for gas savings, can be inferred from swap events
            } else {
                bool success = _sendToken(debitToken, swapData.makerAddress, swapData.swapAmount);
                if (!success) {
                    // if transfer to maker fails, mark the amount as claimable for maker
                    if (paymentData.isAsk) {
                        claimableToken0Balance[swapData.makerAddress] += swapData.swapAmount;
                    } else {
                        claimableToken1Balance[swapData.makerAddress] += swapData.swapAmount;
                    }
                    emit ClaimableBalanceIncrease(swapData.makerAddress, swapData.swapAmount, paymentData.isAsk);
                }
            }
        }
    }

    /// @notice Transfer tokens from the order book to the user
    /// @param tokenToTransfer The token to transfer
    /// @param to The address to transfer to
    /// @param amount The amount to transfer
    /// @return success Whether the transfer was successful or not
    function _sendToken(IERC20Minimal tokenToTransfer, address to, uint256 amount) internal returns (bool) {
        uint256 orderBookBalanceBefore = tokenToTransfer.balanceOf(address(this));
        bool success = false;
        try tokenToTransfer.transfer(to, amount) returns (bool ret) {
            success = ret;
        } catch {
            success = false;
        }

        uint256 sentAmount = success ? amount : 0;
        if (tokenToTransfer.balanceOf(address(this)) + sentAmount < orderBookBalanceBefore) {
            revert Errors.LighterV2Base_ContractBalanceDoesNotMatchSentAmount();
        }
        return success;
    }

    /// @inheritdoc IOrderBook
    function suggestHintId(uint64 priceBase, bool isAsk) external view override returns (uint32) {
        return _orders.suggestHintId(priceBase, isAsk);
    }

    /// @inheritdoc IOrderBook
    function getLimitOrderSwapAmounts(
        uint64 takerOrderAmount0Base,
        uint64 takerOrderPriceBase,
        uint64 makerOrderAmount0Base,
        uint64 makerOrderPriceBase,
        bool isTakerAsk
    ) public pure override returns (uint64 amount0BaseReturn, uint128 amount1BaseReturn) {
        // If the takerOrder is an ask, and the makerOrder price is at least
        // the takerOrder's price, then the takerOrder can be filled
        // If the takerOrder is a bid, and the makerOrder price is at most
        // the takerOrder's price, then the takerOrder can be filled
        if (
            (isTakerAsk && makerOrderPriceBase >= takerOrderPriceBase) ||
            (!isTakerAsk && takerOrderPriceBase >= makerOrderPriceBase)
        ) {
            if (takerOrderAmount0Base < makerOrderAmount0Base) {
                amount0BaseReturn = takerOrderAmount0Base;
            } else {
                amount0BaseReturn = makerOrderAmount0Base;
            }
            return (amount0BaseReturn, uint128(amount0BaseReturn * makerOrderPriceBase));
        }

        return (0, 0);
    }

    /// @inheritdoc IOrderBook
    function getSwapAmountsForToken0(
        uint256 amount0,
        bool isAsk,
        uint64 makerAmount0Base,
        uint64 makerPriceBase
    )
        public
        view
        override
        returns (uint256 swapAmount0, uint256 swapAmount1, uint64 amount0BaseDelta, bool fullTakerFill)
    {
        uint256 amount0BaseToTake;
        if (isAsk) {
            amount0BaseToTake = amount0 / sizeTick;
        } else {
            amount0BaseToTake = Math.ceilDiv(amount0, sizeTick);
        }
        if (amount0BaseToTake > makerAmount0Base) {
            amount0BaseToTake = makerAmount0Base;
            fullTakerFill = false;
        } else {
            fullTakerFill = true;
        }
        amount0BaseDelta = uint64(amount0BaseToTake);
        swapAmount0 = uint256(amount0BaseDelta) * sizeTick;
        swapAmount1 = (uint256(amount0BaseDelta) * makerPriceBase * priceMultiplier) / priceDivider;
    }

    /// @inheritdoc IOrderBook
    function getSwapAmountsForToken1(
        uint256 amount1,
        bool isAsk,
        uint64 makerAmount0Base,
        uint64 makerPriceBase
    )
        public
        view
        override
        returns (uint256 swapAmount0, uint256 swapAmount1, uint64 amount0BaseDelta, bool fullTakerFill)
    {
        uint256 amount0BaseToTake = Math.mulDiv(amount1, priceDivider, makerPriceBase * priceMultiplier);
        if (isAsk) {
            swapAmount1 = (amount0BaseToTake * makerPriceBase * priceMultiplier) / priceDivider;
            if (swapAmount1 < amount1) {
                amount0BaseToTake += 1;
            }
        }
        if (amount0BaseToTake > makerAmount0Base) {
            amount0BaseToTake = makerAmount0Base;
            fullTakerFill = false;
        } else {
            fullTakerFill = true;
        }
        amount0BaseDelta = uint64(amount0BaseToTake);
        swapAmount1 = (uint256(amount0BaseDelta) * makerPriceBase * priceMultiplier) / priceDivider;
        swapAmount0 = uint256(amount0BaseDelta) * sizeTick;
    }

    /// @inheritdoc IOrderBook
    function getPaginatedOrders(
        uint32 startOrderId,
        bool isAsk,
        uint32 limit
    ) external view override returns (OrderQueryItem memory) {
        return _orders.getPaginatedOrders(startOrderId, isAsk, limit, ownerIdToAddress, sizeTick, priceTick);
    }

    /// @inheritdoc IOrderBook
    function getLimitOrder(bool isAsk, uint32 id) external view override returns (LimitOrder memory) {
        return isAsk ? _orders.asks[id] : _orders.bids[id];
    }

    /// @inheritdoc IOrderBook
    function isOrderActive(uint32 id) public view override returns (bool) {
        return _orders.asks[id].ownerId != 0 || _orders.bids[id].ownerId != 0;
    }

    /// @inheritdoc IOrderBook
    function isAskOrder(uint32 id) public view override returns (bool) {
        if (!isOrderActive(id)) {
            revert Errors.LighterV2Order_OrderDoesNotExist();
        }

        return _orders.asks[id].ownerId > 1;
    }
}
