import {BigNumber, BigNumberish} from 'ethers'
import {OrderBook, SmartWallet} from 'typechain-types'

async function prepareOrders(
  orderBook: OrderBook,
  orders: {
    amount0: BigNumber
    price: BigNumber
    isAsk: boolean
    hintId: number
  }[]
) {
  const sizeTick = await orderBook.sizeTick()
  const priceTick = await orderBook.priceTick()
  let amount0Base = []
  let priceBase = []
  let isAsk = []
  let hintId = []
  for (const order of orders) {
    amount0Base.push(order.amount0.div(sizeTick))
    priceBase.push(order.price.div(priceTick))
    isAsk.push(order.isAsk)
    hintId.push(order.hintId)
  }
  return {
    orderBookId: await orderBook.orderBookId(),
    length: orders.length,
    amount0Base,
    priceBase,
    isAsk,
    hintId,
  }
}

export async function CreateLimitOrder(
  wallet: SmartWallet,
  orderBook: OrderBook,
  orders: {
    amount0: BigNumber
    price: BigNumber
    isAsk: boolean
    hintId: number
  }[]
) {
  const s = await prepareOrders(orderBook, orders)
  return wallet.createLimitOrder(s.orderBookId, s.length, s.amount0Base, s.priceBase, s.isAsk, s.hintId)
}

export async function CreatePerformanceLimitOrder(
  wallet: SmartWallet,
  orderBook: OrderBook,
  orders: {
    amount0: BigNumber
    price: BigNumber
    isAsk: boolean
    hintId: number
  }[]
) {
  const s = await prepareOrders(orderBook, orders)
  return wallet.createPerformanceLimitOrder(s.orderBookId, s.length, s.amount0Base, s.priceBase, s.isAsk, s.hintId)
}

export async function CreateFoKOrder(
  wallet: SmartWallet,
  orderBook: OrderBook,
  orders: {
    amount0: BigNumber
    price: BigNumber
    isAsk: boolean
  }
) {
  const s = await prepareOrders(orderBook, [{...orders, hintId: 0}])
  return wallet.createFoKOrder(s.orderBookId, s.amount0Base[0], s.priceBase[0], s.isAsk[0])
}

export async function CreateIoCOrder(
  wallet: SmartWallet,
  orderBook: OrderBook,
  orders: {
    amount0: BigNumber
    price: BigNumber
    isAsk: boolean
  }
) {
  const s = await prepareOrders(orderBook, [{...orders, hintId: 0}])
  return wallet.createIoCOrder(s.orderBookId, s.amount0Base[0], s.priceBase[0], s.isAsk[0])
}

export async function CancelLimitOrder(wallet: SmartWallet, orderBook: OrderBook, orderIDs: BigNumberish[]) {
  return wallet.cancelLimitOrder(await orderBook.orderBookId(), orderIDs.length, orderIDs)
}
