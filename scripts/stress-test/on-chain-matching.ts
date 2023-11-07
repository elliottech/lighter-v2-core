import {OrderBook, SmartWallet, TestERC20Token} from 'typechain-types'
import {ethers} from 'hardhat'
import {BigNumber, BigNumberish} from 'ethers'

// A subset of the quoter interface is defined here so the OnChainMatching does not depend directly on the periphery
// contracts. The Router (which provides the quote functionality) can be plugged in as this simple quoter interface.
export interface Quoter {
  getQuoteForExactInput(
    orderBookId: BigNumberish,
    isAsk: boolean,
    amount: BigNumberish
  ): Promise<{
    quotedInput: BigNumber
    quotedOutput: BigNumber
  }>

  getQuoteForExactOutput(
    orderBookId: BigNumberish,
    isAsk: boolean,
    amount: BigNumberish
  ): Promise<{
    quotedInput: BigNumber
    quotedOutput: BigNumber
  }>
}

export class OnChainMatching {
  orderBook: OrderBook
  orderBookId: Promise<number>
  amountDivider: Promise<BigNumber>
  priceDivider: Promise<BigNumber>
  weth: TestERC20Token
  usdc: TestERC20Token
  ensured = new Set<string>()
  wallets = new Map<string, SmartWallet>()
  quoter?: Quoter

  initialBalance = BigNumber.from(2).pow(250)

  constructor(orderBook: OrderBook, weth: TestERC20Token, usdc: TestERC20Token) {
    this.orderBook = orderBook
    this.orderBookId = this.orderBook.orderBookId()
    this.weth = weth
    this.usdc = usdc

    this.amountDivider = this.orderBook.sizeTick()
    this.priceDivider = this.orderBook.priceTick()
  }

  async ensureUser(address: string) {
    if (this.ensured.has(address)) {
      return
    }
    this.ensured.add(address)

    const wallet = (await ethers.getContractAt('SmartWallet', address)) as SmartWallet
    this.wallets.set(address, wallet)

    for (const token of [this.weth, this.usdc]) {
      await token.mint(address, this.initialBalance)
    }

    await wallet.depositToken0(this.orderBookId, BigNumber.from(2).pow(249))
    await wallet.depositToken1(this.orderBookId, BigNumber.from(2).pow(249))
  }

  async createPerformanceLimitOrder(walletAddress: string, isAsk: boolean, amount0: BigNumber, price: BigNumber) {
    console.log('creating Performance order!')
    const wallet = this.wallets.get(walletAddress)!
    await wallet.createPerformanceLimitOrder(
      this.orderBookId,
      1,
      [amount0.div(await this.amountDivider)],
      [price.div(await this.priceDivider)],
      [isAsk],
      [0]
    )
  }

  async createLimitOrder(walletAddress: string, isAsk: boolean, amount0: BigNumber, price: BigNumber) {
    // with a small chance, use performance orders
    if (Math.random() < 0.3) {
      await this.createPerformanceLimitOrder(walletAddress, isAsk, amount0, price)
      return
    }

    const wallet = this.wallets.get(walletAddress)!
    await wallet.createLimitOrder(
      this.orderBookId,
      1,
      [amount0.div(await this.amountDivider)],
      [price.div(await this.priceDivider)],
      [isAsk],
      [0]
    )
  }

  async cancelLimitOrder(id: number): Promise<void> {
    const isAsk = await this.orderBook.isAskOrder(id)
    const order = await this.orderBook.getLimitOrder(isAsk, id)
    const walletAddress = await this.orderBook.ownerIdToAddress(order.ownerId)

    const wallet = this.wallets.get(walletAddress)!
    await wallet.cancelLimitOrder(this.orderBookId, 1, [id])
  }

  async hasActiveOrders(walletAddress: string): Promise<boolean> {
    let ask = await this.orderBook.getPaginatedOrders(0, true, 25)
    let bids = await this.orderBook.getPaginatedOrders(0, false, 25)
    let list = [...ask.owners, ...bids.owners]
    for (const owner of list) {
      if (walletAddress == owner) {
        return true
      }
    }
    return false
  }

  async swapExact(walletAddress: string, isExactInput: boolean, isAsk: boolean, amount: BigNumber): Promise<boolean> {
    // do not use quoter if user has active order as it can match against itself
    // in that case, the difference in tokens resulted after the swap will not match the quoted amount
    // and this will result in a false positive
    if (this.quoter && !(await this.hasActiveOrders(walletAddress))) {
      return this.swapExactWithQuoter(walletAddress, isExactInput, isAsk, amount)
    }

    try {
      const wallet = this.wallets.get(walletAddress)!
      if (isExactInput) {
        await wallet.swapExactInput(this.orderBookId, isAsk, amount, BigNumber.from(0), walletAddress)
      } else {
        await wallet.swapExactOutput(this.orderBookId, isAsk, amount, BigNumber.from(10).pow(25), walletAddress)
      }
    } catch (e) {
      return false
    }

    return true
  }

  async swapExactWithQuoter(
    walletAddress: string,
    isExactInput: boolean,
    isAsk: boolean,
    amount: BigNumber
  ): Promise<boolean> {
    const quoter = this.quoter!
    const wallet = this.wallets.get(walletAddress)!
    let quotedInput, quotedOutput

    console.log(`using quoter in swapExact`)

    try {
      if (isExactInput) {
        ;({quotedInput, quotedOutput} = await quoter.getQuoteForExactInput(await this.orderBookId, isAsk, amount))
      } else {
        ;({quotedInput, quotedOutput} = await quoter.getQuoteForExactOutput(await this.orderBookId, isAsk, amount))
      }
    } catch (e) {
      return false
    }

    let [initialInput, initialOutput] = isAsk
      ? [await this.wethBalance(walletAddress), await this.usdcBalance(walletAddress)]
      : [await this.usdcBalance(walletAddress), await this.wethBalance(walletAddress)]

    if (isExactInput) {
      await wallet.swapExactInput(this.orderBookId, isAsk, amount, BigNumber.from(0), walletAddress)
    } else {
      await wallet.swapExactOutput(this.orderBookId, isAsk, amount, BigNumber.from(10).pow(25), walletAddress)
    }

    let [finalInput, finalOutput] = isAsk
      ? [await this.wethBalance(walletAddress), await this.usdcBalance(walletAddress)]
      : [await this.usdcBalance(walletAddress), await this.wethBalance(walletAddress)]

    if (!initialInput.sub(quotedInput).eq(finalInput) || !initialOutput.add(quotedOutput).eq(finalOutput)) {
      console.error(`quoter gave different results`)
      console.error(`quotedInput:${quotedInput} initialInput:${initialInput} finalInput:${finalInput}`)
      console.error(`quotedOutput:${quotedOutput} initialOutput:${initialOutput} finalOutput:${finalOutput}`)
      throw 'quoter gave different results'
    }

    return true
  }

  async wethBalance(address: string): Promise<BigNumber> {
    let balance = await this.weth.balanceOf(address)
    balance = balance.add(await this.orderBook.claimableToken0Balance(address))
    return balance!.sub(this.initialBalance)
  }

  async usdcBalance(address: string): Promise<BigNumber> {
    let balance = await this.usdc.balanceOf(address)
    balance = balance.add(await this.orderBook.claimableToken1Balance(address))
    return balance!.sub(this.initialBalance)
  }

  async OrderBookWETH(): Promise<BigNumber> {
    let balance = await this.weth.balanceOf(this.orderBook.address)
    for (const wallet of this.wallets.values()) {
      balance = balance.sub(await this.orderBook.claimableToken0Balance(wallet.address))
    }
    return balance
  }

  async OrderBookUSDC(): Promise<BigNumber> {
    let balance = await this.usdc.balanceOf(this.orderBook.address)
    for (const wallet of this.wallets.values()) {
      balance = balance.sub(await this.orderBook.claimableToken1Balance(wallet.address))
    }
    return balance
  }

  async activeAsks(): Promise<number[]> {
    let ask = await this.orderBook.getPaginatedOrders(0, true, 25)
    let list = [...ask.ids]
    for (let index = 0; ; index += 1) {
      if (list[index] == 0) {
        return list.slice(0, index)
      }
    }
  }

  async activeBids(): Promise<number[]> {
    let bids = await this.orderBook.getPaginatedOrders(0, false, 25)
    let list = bids.ids
    for (let index = 0; ; index += 1) {
      if (list[index] == 0) {
        return list.slice(0, index)
      }
    }
  }
}
