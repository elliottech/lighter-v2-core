import {ethers} from 'hardhat'
import {deployFactory, deploySmartWallet, deployToken, setupOrderBook} from 'test/default-fixture'
import {OrderBook} from 'typechain-types'
import {Quoter} from './on-chain-matching'
import {Contract} from "ethers";

export async function deployRouter(factoryAddress: string): Promise<Quoter | null> {
  try {
    const routerFactory = await ethers.getContractFactory('Router')
    const router = (await routerFactory.deploy(factoryAddress, '0x0000000000000000000000000000000000000000')) as Contract
    await router.deployed()
    return router as unknown as Quoter
  } catch (e) {
    console.log(`failed to deploy router ${e}`)
    return null
  }
}

export async function deployContracts() {
  const [owner] = await ethers.getSigners()

  const token_weth = await deployToken('WETH', 'WETH', 18)
  const token_usdc = await deployToken('USD Coin', 'USDC', 6)
  const token_wbtc = await deployToken('WBTC', 'WBTC', 8)
  const token_usdc_e = await deployToken('USDC.e coin', 'USDC.e', 6)

  const {factory} = await deployFactory(owner)

  // divider 10
  let {orderBookInstance} = await setupOrderBook(factory, 0, 13, 4, 1, 1, token_weth, token_usdc)
  const orderBook_weth_usdc = orderBookInstance as OrderBook

  // divider 100
  ;({orderBookInstance} = await setupOrderBook(factory, 1, 2, 4, 1, 1, token_wbtc, token_usdc))
  const orderBook_wbtc_usdc = orderBookInstance as OrderBook

  // multiplier 100
  ;({orderBookInstance} = await setupOrderBook(factory, 2, 6, 2, 1, 1, token_usdc_e, token_usdc))
  const orderBook_usdc_e_usdc = orderBookInstance as OrderBook

  // deploy smart wallets
  let users = []
  for (let i = 0; i < 10; i += 1) {
    let smartWallet = await deploySmartWallet(factory)
    users.push(smartWallet.address)
  }

  return {
    factory,
    orderBooks: [orderBook_weth_usdc, orderBook_wbtc_usdc, orderBook_usdc_e_usdc],
    users,
  }
}
