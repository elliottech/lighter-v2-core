import {BigNumber} from 'ethers'
import {ParseWETH} from 'test/shared'

export interface TakerOrder {
  id: number
  isAsk: boolean
  amount0?: BigNumber
  amount1?: BigNumber
  price: BigNumber
}

export interface Order {
  id: number
  isAsk: boolean
  amount0: BigNumber
  price: BigNumber
}

export interface Swap {
  amount0: BigNumber
  amount1: BigNumber
  askID: number
  bidID: number
}

// CoreMatchingEngine keeps track of orders in the OrderBook and performs the matching
// it does not care about owners and balances, to keep things simple
export class CoreMatchingEngine {
  ask: Order[] = []
  bid: Order[] = []
  oneAmount0: BigNumber
  sizeTick: BigNumber

  // callback set by user; used to listen to swaps
  onSwapCallback: (swap: Swap) => void = () => {}

  constructor(
    oneAmount0: BigNumber = ParseWETH(1.0),
    sizeTick: BigNumber = ParseWETH(1.0).div(BigNumber.from(10).pow(5))
  ) {
    this.oneAmount0 = oneAmount0
    this.sizeTick = sizeTick
  }

  onSwap(taker: TakerOrder, maker: Order, amount0: BigNumber, amount1: BigNumber) {
    const isAsk = taker.isAsk
    const swap: Swap = {
      amount0: amount0,
      amount1: amount1,
      askID: isAsk ? taker.id : maker.id,
      bidID: !isAsk ? taker.id : maker.id,
    }
    this.onSwapCallback(swap)
  }

  isBetter(newOrder: TakerOrder, inBook: Order) {
    if (newOrder.isAsk) {
      return newOrder.price.lt(inBook.price)
    } else {
      return newOrder.price.gt(inBook.price)
    }
  }

  insert(newOrder: Order) {
    const isAsk = newOrder.isAsk
    let index = 0
    let arr = isAsk ? this.ask : this.bid
    for (; index < arr.length; index += 1) {
      if (this.isBetter(newOrder, arr[index])) {
        break
      }
    }
    const newArr = [...arr.slice(0, index), newOrder, ...arr.slice(index)]
    if (isAsk) {
      this.ask = newArr
    } else {
      this.bid = newArr
    }
  }

  cancel(id: number): Order | null {
    for (let arrIndex = 0; arrIndex < 2; arrIndex += 1) {
      const arr = [this.ask, this.bid][arrIndex]

      for (let index = 0; index < arr.length; index += 1) {
        const order = arr[index]
        if (order.id != id) {
          continue
        }

        const newArr = [...arr.slice(0, index), ...arr.slice(index + 1)]
        if (arrIndex == 0) {
          this.ask = newArr
        } else {
          this.bid = newArr
        }

        return order
      }
    }

    return null
  }

  canMatch(taker: TakerOrder, maker: Order) {
    if (taker.isAsk) {
      return taker.price.lte(maker.price)
    } else {
      return taker.price.gte(maker.price)
    }
  }

  getSwapSizes(taker: TakerOrder, maker: Order) {
    let amount0
    if (taker.amount0 != undefined) {
      amount0 = taker.amount0!
    } else {
      let roundUp = taker.isAsk
      amount0 = taker.amount1!.mul(this.oneAmount0)
      if (roundUp) {
        amount0 = amount0.add(maker.price.mul(this.sizeTick)).sub(1)
      }
      amount0 = amount0.div(maker.price).div(this.sizeTick).mul(this.sizeTick)
    }

    let allOfMaker = false
    if (amount0.gte(maker.amount0)) {
      amount0 = maker.amount0
      allOfMaker = true
    }

    let amount1 = maker.price.mul(amount0).div(this.oneAmount0)
    return {amount0, amount1, allOfMaker}
  }

  match(taker: TakerOrder) {
    const isAsk = taker.isAsk
    let arr = isAsk ? this.bid : this.ask

    let index = 0
    for (; index < arr.length; index += 1) {
      const maker = arr[index]
      if (!this.canMatch(taker, arr[index])) {
        break
      }

      let {amount0, amount1, allOfMaker} = this.getSwapSizes(taker, maker)

      // call callback before updating orders
      this.onSwap(taker, maker, amount0, amount1)

      // update orders
      if (taker.amount0) {
        taker.amount0 = taker.amount0.sub(amount0)
      }
      if (taker.amount1) {
        taker.amount1 = taker.amount1.sub(amount1)
      }

      if (!allOfMaker) {
        arr[index].amount0 = arr[index].amount0!.sub(amount0)
        break
      }
    }

    // store changes
    if (!isAsk) {
      this.ask = arr.slice(index)
    } else {
      this.bid = arr.slice(index)
    }

    return taker
  }
}
