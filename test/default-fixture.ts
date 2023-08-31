import {Factory, OrderBook, SmartWallet, TestERC20Token} from 'typechain-types'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {ethers} from 'hardhat'
import {ParseUSDC, ParseWETH, CreateLimitOrder, CancelLimitOrder} from './shared'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'

export async function deployFactory(owner: SignerWithAddress) {
  // Deploy heap libraries
  const linkedListLib = await (await ethers.getContractFactory('LinkedListLib')).deploy()

  // Deploy Order Book Deploy Lib
  const orderBookDeployerLibrary = await ethers.getContractFactory('OrderBookDeployerLib', {
    libraries: {
      LinkedListLib: linkedListLib.address,
    },
  })
  const orderBookDeployerLib = await orderBookDeployerLibrary.deploy()

  const Factory = await ethers.getContractFactory('Factory', {
    libraries: {
      OrderBookDeployerLib: orderBookDeployerLib.address,
    },
  })
  const factory = (await Factory.deploy(owner.address)) as Factory

  return {factory, linkedListLib, orderBookDeployerLib}
}

export async function deploySmartWallet(factory: Factory): Promise<SmartWallet> {
  return (await (await ethers.getContractFactory('SmartWallet')).deploy(factory.address)) as SmartWallet
}

export async function deployToken(tokenName: string, tokenSymbol: string, decimals: number): Promise<TestERC20Token> {
  const token_factory = await ethers.getContractFactory('TestERC20Token')
  return (await token_factory.deploy(tokenName, tokenSymbol, decimals)) as TestERC20Token
}

export async function deployMaliciousToken(tokenName: string, tokenSymbol: string, decimals: number) {
  const token_factory = await ethers.getContractFactory('MaliciousTestERC20Token')
  let token = await token_factory.deploy(tokenName, tokenSymbol, decimals)
  await token.deployed()
  return token
}

export async function setupOrderBook(
  factory: any,
  orderBookId: number,
  sizeTick: number,
  priceTick: number,
  minBaseAmount: number,
  minQuoteAmount: number,
  token0: any,
  token1: any
) {
  // Create the order book
  await factory.createOrderBook(token0.address, token1.address, sizeTick, priceTick, minBaseAmount, minQuoteAmount)

  const orderBookAddress = await factory.getOrderBookFromId(orderBookId)
  const orderBookInstance = await ethers.getContractAt('OrderBook', orderBookAddress)

  return {orderBookAddress, orderBookInstance}
}

export async function deployContracts() {
  const token_weth = await deployToken('WETH', 'WETH', 18)
  const token_usdc = await deployToken('USD Coin', 'USDC', 6)
  const token_wbtc = await deployToken('WBTC', 'WBTC', 8)
  const token_link = await deployToken('LINK', 'LINK', 18)

  const [owner] = await ethers.getSigners()

  const Factory = await deployFactory(owner)
  const factory = Factory.factory

  // Create the order book WETH(18) - USDC(6)
  const logSizeTick_weth_usdc = 13 // decimal=14 so multiples of 0.0001 (10^-4)
  const logPriceTick_weth_usdc = 4 // decimal=4 so multiples of 0.01
  const minBaseAmount_weth_usdc: number = 100
  const minQuoteAmount_weth_usdc: number = 1

  let {orderBookAddress, orderBookInstance} = await setupOrderBook(
    factory,
    0,
    logSizeTick_weth_usdc,
    logPriceTick_weth_usdc,
    minBaseAmount_weth_usdc,
    minQuoteAmount_weth_usdc,
    token_weth,
    token_usdc
  )

  const orderBookAddress_weth_usdc = orderBookAddress
  const orderBookInstance_weth_usdc = orderBookInstance as OrderBook

  // WBTC(8) - USDC(6)
  const logSizeTick_wbtc_usdc = 3 // decimal=3 so multiples of 0.000001 = (10^(3-8)) = 10^-5
  const logPriceTick_wbtc_usdc = 5 // decimal=5 so multiples of 0.1 (10^(5-6)) = 10^-1
  const minBaseAmount_wbtc_usdc: number = 100
  const minQuoteAmount_wbtc_usdc: number = 1

  const orderBookSetupRsp_wbtc_usdc = await setupOrderBook(
    factory,
    1,
    logSizeTick_wbtc_usdc,
    logPriceTick_wbtc_usdc,
    minBaseAmount_wbtc_usdc,
    minQuoteAmount_wbtc_usdc,
    token_wbtc,
    token_usdc
  )
  const orderBookAddress_wbtc_usdc = orderBookSetupRsp_wbtc_usdc.orderBookAddress
  const orderBookInstance_wbtc_usdc = orderBookSetupRsp_wbtc_usdc.orderBookInstance as OrderBook

  // WBTC(8) - LINK(18)

  const logSizeTick_wbtc_link = 3 // decimal=5 so multiples of 0.0001 (10^3-8) = 10^-5
  const logPriceTick_wbtc_link = 16 // decimal=2 so multiples of 0.00000000000000001 = (10^(2-18)) = 10^-16
  const minBaseAmount_wbtc_link: number = 100
  const minQuoteAmount_wbtc_link: number = 1

  const orderBookSetupRsp_wbtc_link = await setupOrderBook(
    factory,
    2,
    logSizeTick_wbtc_link,
    logPriceTick_wbtc_link,
    minBaseAmount_wbtc_link,
    minQuoteAmount_wbtc_link,
    token_wbtc,
    token_link
  )
  const orderBookAddress_wbtc_link = orderBookSetupRsp_wbtc_link.orderBookAddress
  const orderBookInstance_wbtc_link = orderBookSetupRsp_wbtc_link.orderBookInstance as OrderBook

  const acc1 = await deploySmartWallet(factory)
  const acc2 = await deploySmartWallet(factory)

  return {
    token_weth,
    token_usdc,
    token_link,
    token_wbtc,
    owner,
    acc1,
    acc2,

    ...Factory,

    wallet: acc1,
    smartWallet: acc1,
    orderBook: orderBookInstance_weth_usdc,
    weth: token_weth,
    usdc: token_usdc,

    orderBookAddress_weth_usdc,
    orderBookInstance_weth_usdc,
    orderBookAddress_wbtc_usdc,
    orderBookInstance_wbtc_usdc,
    orderBookAddress_wbtc_link,
    orderBookInstance_wbtc_link,
  }
}

export async function deployContractsWithMaliciousTokens() {
  const [owner] = await ethers.getSigners()

  const token_weth = await deployMaliciousToken('WETH', 'WETH', 18)
  const token_usdc = await deployMaliciousToken('USD Coin', 'USDC', 6)
  const token_wbtc = await deployMaliciousToken('WBTC', 'WBTC', 8)
  const token_link = await deployMaliciousToken('LINK', 'LINK', 18)

  const Factory = await deployFactory(owner)
  const factory = Factory.factory

  // Create the order book WETH(18) - USDC(6)
  const logSizeTick_weth_usdc = 13 // decimal=14 so multiples of 0.0001 (10^-4)
  const logPriceTick_weth_usdc = 4 // decimal=4 so multiples of 0.01
  const minBaseAmount_weth_usdc: number = 100
  const minQuoteAmount_weth_usdc: number = 1

  let {orderBookAddress, orderBookInstance} = await setupOrderBook(
    factory,
    0,
    logSizeTick_weth_usdc,
    logPriceTick_weth_usdc,
    minBaseAmount_weth_usdc,
    minQuoteAmount_weth_usdc,
    token_weth,
    token_usdc
  )

  const orderBookAddress_weth_usdc = orderBookAddress
  const orderBookInstance_weth_usdc = orderBookInstance as OrderBook

  // WBTC(8) - USDC(6)
  const logSizeTick_wbtc_usdc = 3 // decimal=3 so multiples of 0.000001 = (10^(3-8)) = 10^-5
  const logPriceTick_wbtc_usdc = 5 // decimal=5 so multiples of 0.1 (10^(5-6)) = 10^-1
  const minBaseAmount_wbtc_usdc: number = 100
  const minQuoteAmount_wbtc_usdc: number = 1

  const orderBookSetupRsp_wbtc_usdc = await setupOrderBook(
    factory,
    1,
    logSizeTick_wbtc_usdc,
    logPriceTick_wbtc_usdc,
    minBaseAmount_wbtc_usdc,
    minQuoteAmount_wbtc_usdc,
    token_wbtc,
    token_usdc
  )
  const orderBookAddress_wbtc_usdc = orderBookSetupRsp_wbtc_usdc.orderBookAddress
  const orderBookInstance_wbtc_usdc = orderBookSetupRsp_wbtc_usdc.orderBookInstance as OrderBook

  // WBTC(8) - LINK(18)

  const logSizeTick_wbtc_link = 3 // decimal=5 so multiples of 0.0001 (10^3-8) = 10^-5
  const logPriceTick_wbtc_link = 16 // decimal=2 so multiples of 0.00000000000000001 = (10^(2-18)) = 10^-16
  const minBaseAmount_wbtc_link: number = 100
  const minQuoteAmount_wbtc_link: number = 1

  const orderBookSetupRsp_wbtc_link = await setupOrderBook(
    factory,
    2,
    logSizeTick_wbtc_link,
    logPriceTick_wbtc_link,
    minBaseAmount_wbtc_link,
    minQuoteAmount_wbtc_link,
    token_wbtc,
    token_link
  )
  const orderBookAddress_wbtc_link = orderBookSetupRsp_wbtc_link.orderBookAddress
  const orderBookInstance_wbtc_link = orderBookSetupRsp_wbtc_link.orderBookInstance as OrderBook

  const acc1 = await deploySmartWallet(factory)
  const acc2 = await deploySmartWallet(factory)

  token_weth.setExceptionAddress(acc1.address)
  token_usdc.setExceptionAddress(acc1.address)
  token_wbtc.setExceptionAddress(acc1.address)
  token_link.setExceptionAddress(acc1.address)

  return {
    token_weth,
    token_usdc,
    token_link,
    token_wbtc,
    owner,
    acc1,
    acc2,

    ...Factory,

    wallet: acc1,
    smartWallet: acc1,
    orderBook: orderBookInstance_weth_usdc,
    weth: token_weth,
    usdc: token_usdc,

    orderBookAddress_weth_usdc,
    orderBookInstance_weth_usdc,
    orderBookAddress_wbtc_usdc,
    orderBookInstance_wbtc_usdc,
    orderBookAddress_wbtc_link,
    orderBookInstance_wbtc_link,
  }
}

export async function createOrders(s: any, cancelOrder: boolean) {
  const {acc1, acc2, orderBook} = s

  // create orders
  await CreateLimitOrder(acc2, orderBook, [
    {
      amount0: ParseWETH('1.0'),
      price: ParseUSDC(1500),
      isAsk: true,
      hintId: 0,
    },
    {
      amount0: ParseWETH('1.5'),
      price: ParseUSDC(1450),
      isAsk: true,
      hintId: 0,
    },
    {
      amount0: ParseWETH('1.5'),
      price: ParseUSDC(1400),
      isAsk: false,
      hintId: 0,
    },
    {
      amount0: ParseWETH('1'),
      price: ParseUSDC(1350),
      isAsk: false,
      hintId: 0,
    },
    {
      amount0: ParseWETH('1.25'),
      price: ParseUSDC(1475),
      isAsk: true,
      hintId: 0,
    },
    {
      amount0: ParseWETH('1.25'),
      price: ParseUSDC(1375),
      isAsk: false,
      hintId: 0,
    },
  ])

  // create one order from acc1 and cancel it so we pay the gas to register our customer ID upfront
  await CreateLimitOrder(acc1, orderBook, [
    {
      amount0: ParseWETH('1.0'),
      price: ParseUSDC(1425),
      isAsk: true,
      hintId: 0,
    },
  ])

  if (cancelOrder) {
    await CancelLimitOrder(acc1, orderBook, [8])
  }

  // mint tokens to order books, to pay for storage on ERC20 in advance, in order to optimize swaps & order creations
  for (const token of [s.token_weth, s.token_wbtc, s.token_usdc, s.token_link]) {
    for (const contractAddress of [
      s.orderBookAddress_weth_usdc,
      s.orderBookAddress_wbtc_usdc,
      s.orderBookAddress_wbtc_link,
    ]) {
      await token.mint(contractAddress, 1)
    }
  }
}

export async function fundSmartWallet(s: any, deposit: boolean) {
  for (let wallet of [s.acc1, s.acc2]) {
    // fund the smart wallet
    await s.token_usdc.mint(wallet.address, ParseUSDC('30000'))
    await s.token_weth.mint(wallet.address, ParseWETH('20'))

    if (deposit) {
      // fund book for perf orders
      await wallet.depositToken0(0, ParseWETH('10'))
      await wallet.depositToken1(0, ParseUSDC('15000'))
    }
  }
}

export async function setupFixturesForSmartWallet() {
  const s = await loadFixture(deployContracts)
  await fundSmartWallet(s, true)
  await createOrders(s, true)
  return s
}

export async function setupFixturesForSmartWalletWithMaliciousTokens() {
  const s = await loadFixture(deployContractsWithMaliciousTokens)
  await fundSmartWallet(s, true)
  await createOrders(s, false)
  return s
}

export async function setupEmptyBookFixturesForSmartWallet() {
  const s = await loadFixture(deployContracts)
  await fundSmartWallet(s, false)
  return s
}
