import {BigNumber} from 'ethers'
import {CoreMatchingEngine, Order, Swap} from './core-matching-engine'

// JSMatching extends CoreMatchingEngine by adding balance & keeping track of IDs
export class JSMatching {
  nextID = 2
  weth = new Map<string, BigNumber>()
  usdc = new Map<string, BigNumber>()
  locked_weth = new Map<string, BigNumber>()
  locked_usdc = new Map<string, BigNumber>()
  orderIDToOwner = new Map<number, string>()
  engine: CoreMatchingEngine
  numSwapsDone = 0

  constructor(engine: CoreMatchingEngine) {
    this.engine = engine
    this.engine.onSwapCallback = this.onSwapCallback.bind(this)
  }

  ensureUser(owner: string) {
    const tokens = [this.weth, this.usdc, this.locked_usdc, this.locked_weth]
    for (const token of tokens) {
      const amount = token.get(owner) || BigNumber.from(0)
      token.set(owner, amount.add(0))
    }
  }

  createLimitOrder(owner: string, isAsk: boolean, amount0: BigNumber, price: BigNumber): void {
    this.ensureUser(owner)
    this.orderIDToOwner.set(this.nextID, owner)
    const order = {
      id: this.nextID++,
      isAsk,
      amount0,
      price,
    }

    const remaining = this.engine.match(order) as Order

    if (remaining.amount0.gt(0)) {
      this.engine.insert(remaining)
      // lock funds in OrderBook
      if (remaining.isAsk) {
        this.weth.set(owner, this.weth.get(owner)!.sub(remaining.amount0))
        this.locked_weth.set(owner, this.locked_weth.get(owner)!.add(remaining.amount0))
      } else {
        const amount1 = remaining.price.mul(remaining.amount0).div(this.engine.oneAmount0)
        this.usdc.set(owner, this.usdc.get(owner)!.sub(amount1))
        this.locked_usdc.set(owner, this.locked_usdc.get(owner)!.add(amount1))
      }
    }
    return
  }

  cancelLimitOrder(id: number): void {
    const order = this.engine.cancel(id)
    if (order == null) {
      return
    }
    const owner = this.orderIDToOwner.get(order.id)!

    if (order.isAsk) {
      this.locked_weth.set(owner, this.locked_weth.get(owner)!.sub(order.amount0))
      this.weth.set(owner, this.weth.get(owner)!.add(order.amount0))
    } else {
      const amount1 = order.price.mul(order.amount0).div(this.engine.oneAmount0)
      this.locked_usdc.set(owner, this.locked_usdc.get(owner)!.sub(amount1))
      this.usdc.set(owner, this.usdc.get(owner)!.add(amount1))
    }
  }

  swapExact(owner: string, isExactInput: boolean, isAsk: boolean, amount: BigNumber): void {
    this.orderIDToOwner.set(0, owner)
    let isExactToken0 = isExactInput == isAsk
    let price = isAsk ? BigNumber.from(0) : BigNumber.from(10).pow(50)

    this.engine.match({
      id: 0,
      isAsk: isAsk,
      price,
      amount0: isExactToken0 ? amount : undefined,
      amount1: !isExactToken0 ? amount : undefined,
    })

    return
  }

  onSwapCallback(swap: Swap) {
    this.numSwapsDone += 1

    const askOwner = this.orderIDToOwner.get(swap.askID)!
    const bidOwner = this.orderIDToOwner.get(swap.bidID)!

    this.weth.set(bidOwner, this.weth.get(bidOwner)!.add(swap.amount0))
    this.usdc.set(askOwner, this.usdc.get(askOwner)!.add(swap.amount1))

    // ask is taker
    if ((swap.askID > swap.bidID || swap.askID == 0) && swap.bidID != 0) {
      this.weth.set(askOwner, this.weth.get(askOwner)!.sub(swap.amount0))
      this.locked_usdc.set(bidOwner, this.locked_usdc.get(bidOwner)!.sub(swap.amount1))
    } else {
      this.locked_weth.set(askOwner, this.locked_weth.get(askOwner)!.sub(swap.amount0))
      this.usdc.set(bidOwner, this.usdc.get(bidOwner)!.sub(swap.amount1))
    }
  }

  wethBalance(address: string): BigNumber {
    return this.weth.get(address)!
  }

  usdcBalance(address: string): BigNumber {
    return this.usdc.get(address)!
  }

  OrderBookWETH(): BigNumber {
    let jsOBWETH = BigNumber.from(0)
    this.locked_weth.forEach((amount) => {
      jsOBWETH = jsOBWETH.add(amount)
    })
    return jsOBWETH
  }

  OrderBookUSDC(): BigNumber {
    let jsOBUSDC = BigNumber.from(0)
    this.locked_usdc.forEach((amount) => {
      jsOBUSDC = jsOBUSDC.add(amount)
    })
    return jsOBUSDC
  }

  activeAsks(): number[] {
    return this.engine.ask.map((order) => {
      return order.id
    })
  }

  activeBids(): number[] {
    return this.engine.bid.map((order) => {
      return order.id
    })
  }
}
