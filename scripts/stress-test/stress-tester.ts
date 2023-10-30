import {takeSnapshot} from '@nomicfoundation/hardhat-network-helpers'
import {ethers} from 'hardhat'
import {BigNumber} from 'ethers'
import {JSMatching} from './js-matching'
import {OnChainMatching} from './on-chain-matching'
import {CoreMatchingEngine} from './core-matching-engine'
import {TestERC20Token} from 'typechain-types'
import {deployContracts, deployRouter} from './on-chain-deploy'

function getRandomInt(max: number) {
  return Math.floor(Math.random() * max)
}

function getRandomBN(max: BigNumber) {
  let value = BigNumber.from(0)
  const exp = 1000000
  for (let i = 0; i < 5; i += 1) {
    value = value.mul(exp).add(Math.floor(Math.random() * exp))
  }
  return value.mod(max)
}

class StressTester {
  js: JSMatching
  onChain: OnChainMatching
  users: string[] = []

  sizeTick = BigNumber.from(0)
  priceTick = BigNumber.from(0)

  maxSizeTick = BigNumber.from(10).pow(6)
  maxPriceTick = BigNumber.from(10).pow(6)
  maxSwapToken1 = BigNumber.from(1)

  minSize = BigNumber.from(1)
  minPrice = BigNumber.from(1)

  constructor(js: JSMatching, onChain: OnChainMatching, users: string[]) {
    this.js = js
    this.onChain = onChain
    this.users = users
  }

  async setup() {
    this.sizeTick = await this.onChain.orderBook.sizeTick()
    this.priceTick = await this.onChain.orderBook.priceTick()
    this.minPrice = await this.onChain.orderBook.priceDivider()

    this.maxSwapToken1
      .mul(this.maxSizeTick)
      .mul(this.maxPriceTick)
      .mul(this.sizeTick)
      .mul(this.priceTick)
      .div(this.js.engine?.oneAmount0!)

    // initialize users
    for (const address of this.users) {
      await this.js.ensureUser(address)
      await this.onChain.ensureUser(address)
    }
  }

  async shouldCancel(): Promise<boolean> {
    const total = this.js.activeAsks().length + this.js.activeBids().length
    return total > 20
  }

  async limitOrder() {
    const amount = getRandomBN(this.maxSizeTick)
    const price = getRandomBN(this.maxPriceTick)
    const owner = this.users[getRandomInt(this.users.length)]
    const isAsk = getRandomInt(2)

    console.debug(`creating limit order owner:${owner} amount:${amount} price:${price} isAsk:${isAsk}`)

    const a = amount.add(this.minSize).mul(this.sizeTick)
    const p = price.add(this.minPrice).mul(this.priceTick)

    await this.js.createLimitOrder(owner, isAsk == 1, a, p)
    await this.onChain.createLimitOrder(owner, isAsk == 1, a, p)
  }

  async cancel() {
    const a = this.js.activeAsks()
    const b = this.js.activeBids()
    a.push(...b)
    const ids = a
    if (ids.length == 0) {
      return
    }
    const id = ids[getRandomInt(ids.length)]

    console.debug(`canceling ${id}`)
    await this.js.cancelLimitOrder(id)
    await this.onChain.cancelLimitOrder(id)
  }

  async swapExact() {
    const owner = this.users[getRandomInt(this.users.length)]
    const isAsk = getRandomInt(2)
    const isExactInput = getRandomInt(2)

    let amount = getRandomBN(this.maxSizeTick).mul(this.sizeTick)
    if (isAsk != isExactInput) {
      amount = getRandomBN(this.maxSwapToken1)
    }

    console.debug(`swap exact owner:${owner} amount:${amount} isAsk:${isAsk} isExactInput:${isExactInput}`)

    try {
      // first try to call the onChain swap since it revers in case of not enough liquidity
      const ok = await this.onChain.swapExact(owner, isExactInput == 1, isAsk == 1, amount)
      if (!ok) {
        console.debug('not enough liquidity ...')
        return
      }
    } catch (e) {
      throw e
    }

    await this.js.swapExact(owner, isExactInput == 1, isAsk == 1, amount)
  }

  async performOperation() {
    if (await this.shouldCancel()) {
      return await this.cancel()
    }

    let operation = getRandomInt(100)
    if (operation < 20) {
      await this.cancel()
    } else if (operation < 40) {
      await this.swapExact()
    } else {
      await this.limitOrder()
    }
  }

  async cancelAll() {
    const a = this.js.activeAsks()
    const b = this.js.activeBids()
    a.push(...b)
    for (const id of a) {
      console.debug(`canceling ${id}`)
      await this.js.cancelLimitOrder(id)
      await this.onChain.cancelLimitOrder(id)
    }
  }

  async check() {
    try {
      const askJS = this.js.activeAsks()
      const bidJS = this.js.activeBids()
      const askOnChain = await this.onChain.activeAsks()
      const bidOnChain = await this.onChain.activeBids()
      if (JSON.stringify(askJS) != JSON.stringify(askOnChain)) {
        console.error(`${askJS} ${askOnChain}`)
        throw 'ask not equal'
      }
      if (JSON.stringify(bidJS) != JSON.stringify(bidOnChain)) {
        console.error(`${bidJS} ${bidOnChain}`)
        throw 'bid not equal'
      }

      for (const user of this.users) {
        const wethJS = this.js.wethBalance(user)
        const usdcJS = this.js.usdcBalance(user)
        const wethOnChain = await this.onChain.wethBalance(user)
        const usdcOnChain = await this.onChain.usdcBalance(user)

        if (!wethJS.eq(wethOnChain)) {
          console.error(`weth not equal ${user} ${wethJS.toString()} ${wethOnChain.toString()}`)
          throw 'weth not equal'
        }

        if (!usdcJS.eq(usdcOnChain)) {
          console.error(`usdc not equal ${user} ${usdcJS.toString()} ${usdcOnChain.toString()}`)
          throw 'usdc not equal'
        }
      }

      const onChainOBWETH = await this.onChain.OrderBookWETH()
      const onChainOBUSDC = await this.onChain.OrderBookUSDC()

      const jsOBWETH = this.js.OrderBookWETH()
      const jsOBUSDC = this.js.OrderBookUSDC()

      if (!onChainOBWETH.eq(jsOBWETH)) {
        throw `blocked funds are not equal WETH -- onChain:${onChainOBWETH} js:${jsOBWETH}`
      }
      if (!onChainOBUSDC.eq(jsOBUSDC)) {
        throw `blocked funds are not equal USDC -- onChain:${onChainOBUSDC} js:${jsOBUSDC}`
      }
    } catch (e) {
      await this.debug()
      throw e
    }
  }

  async finalCheck() {
    console.log('performing a final check on the stat of the system')

    const obWETH = this.js.OrderBookWETH()
    const obUSDC = this.js.OrderBookUSDC()

    // token0 needs to be 0 in all order books
    if (!obWETH.eq(0)) {
      throw `at the end of execution token0 must be 0 but is ${obWETH}`
    }
    if (obUSDC.gt(this.js.numSwapsDone)) {
      throw `at the end of execution token1 must be less than the number of swaps ${this.js.numSwapsDone} but is ${obUSDC}`
    }

    console.log(`only ${obUSDC} token1 locked in orderbook at the end of execution`)
  }

  async debug() {
    console.log('~~~~~ JS ASK ~~~~~')
    for (const order of this.js!.engine.ask) {
      console.log(
        `id: ${order.id} price:${order.price} amount0:${order.amount0} owner:${this.js.orderIDToOwner.get(order.id)}`
      )
    }

    console.log('~~~~~ JS BID ~~~~~')
    for (const order of this.js!.engine.bid) {
      console.log(
        `id: ${order.id} price:${order.price} amount0:${order.amount0} owner:${this.js.orderIDToOwner.get(order.id)}`
      )
    }

    console.log(` === JS === `)
    for (const user of this.users) {
      const wethJS = this.js.wethBalance(user)
      const usdcJS = this.js.usdcBalance(user)
      console.log(`${user} weth:${wethJS} usdc:${usdcJS}`)
    }

    console.log(` === On Chain === `)
    for (const user of this.users) {
      const wethJS = await this.onChain.wethBalance(user)
      const usdcJS = await this.onChain.usdcBalance(user)
      console.log(`${user} weth:${wethJS} usdc:${usdcJS}`)
    }
  }
}

export async function main() {
  const contracts = await deployContracts()

  // router deployment might fail if the periphery contracts are not available
  // this is not a problem as the system works fine without them
  const router = await deployRouter(contracts.factory.address)

  const snapshot = await takeSnapshot()

  for (let run = 0; ; run += 1) {
    // select a random order book which will be tested
    const orderBook = contracts.orderBooks[getRandomInt(contracts.orderBooks.length)]

    const weth = (await ethers.getContractAt('TestERC20Token', await orderBook.token0())) as TestERC20Token
    const usdc = (await ethers.getContractAt('TestERC20Token', await orderBook.token1())) as TestERC20Token

    const oneAmount0 = BigNumber.from(10).pow(await weth.decimals())
    const sizeTick = await orderBook.sizeTick()

    const onChain = new OnChainMatching(orderBook, weth, usdc)
    if (router) {
      onChain.quoter = router
    }
    const js = new JSMatching(new CoreMatchingEngine(oneAmount0, sizeTick))

    const tester = new StressTester(js, onChain, contracts.users)
    await tester.setup()

    console.log(`starting #${run}`)

    for (let i = 0; i < 100; i += 1) {
      await tester.performOperation()
      await tester.check()
    }
    await tester.cancelAll()
    await tester.check()
    await tester.finalCheck()

    await snapshot.restore()
  }
}
