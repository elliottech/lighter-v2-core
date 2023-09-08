import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {expect, ParseUSDC, ParseWETH, CreateFoKOrder, CreateIoCOrder} from './shared'
import {reportGasCost} from 'reports'
import {setupFixturesForSmartWallet} from './default-fixture'

describe('benchmark IOC & FOK order', () => {
  describe('Ask; 2 full 1 one partial match', () => {
    it('IOC', async () => {
      await test(CreateIoCOrder, 'IOC_ASK_CREATE_2.5_FILLS')
    })
    it('FOK', async () => {
      await test(CreateFoKOrder, 'FOK_ASK_CREATE_2.5_FILLS')
    })

    async function test(f: any, scenario: string) {
      const {acc1, orderBook, usdc} = await loadFixture(setupFixturesForSmartWallet)

      const tx = await f(acc1, orderBook, {
        amount0: ParseWETH('3'),
        price: ParseUSDC('1300'),
        isAsk: true,
      })

      await expect(tx).to.changeTokenBalance(usdc, acc1.address, ParseUSDC(1.5 * 1400 + 1.25 * 1375 + 0.25 * 1350))
      await reportGasCost(scenario, tx)
    }
  })
  describe('Bid; 2 full 1 one partial match', () => {
    it('IOC', async () => {
      await test(CreateIoCOrder, 'IOC_CREATE_2.5_FILLS')
    })
    it('FOK', async () => {
      await test(CreateFoKOrder, 'FOK_CREATE_2.5_FILLS')
    })

    async function test(f: any, scenario: string) {
      const {acc1, orderBook, weth} = await loadFixture(setupFixturesForSmartWallet)

      const tx = await f(acc1, orderBook, {
        amount0: ParseWETH('3.5'),
        price: ParseUSDC('1550'),
        isAsk: false,
      })
      await expect(tx).to.changeTokenBalance(weth, acc1.address, ParseWETH('3.5'))
      await reportGasCost(scenario, tx)
    }
  })
  describe('Bid; 3 full matches and not enough liquidity', () => {
    it('IOC', async () => {
      await test(CreateIoCOrder, 'IOC_CREATE_3_FILLS', false)
    })
    it('FOK revoked', async () => {
      await test(CreateFoKOrder, '', true)
    })

    async function test(f: any, scenario: string, revert: boolean) {
      const {acc1, orderBook, weth} = await loadFixture(setupFixturesForSmartWallet)

      const g = async () => {
        return f(acc1, orderBook, {
          amount0: ParseWETH('4'),
          price: ParseUSDC('1550'),
          isAsk: false,
        })
      }

      if (revert) {
        await expect(g()).to.be.revertedWithCustomError(orderBook, 'LighterV2Order_FoKNotFilled')
      } else {
        const tx = await g()
        await expect(tx).to.changeTokenBalance(weth, acc1.address, ParseWETH('3.75'))
        await reportGasCost(scenario, tx)
      }
    }
  })
  describe('Bid; 2 full matcher; matches on equal price', () => {
    it('IOC', async () => {
      await test(CreateIoCOrder, 'IOC_CREATE_2_FILLS')
    })
    it('FOK', async () => {
      await test(CreateFoKOrder, 'FOK_CREATE_2_FILLS')
    })

    async function test(f: any, scenario: string) {
      const {acc1, orderBook, weth} = await loadFixture(setupFixturesForSmartWallet)

      const tx = await f(acc1, orderBook, {
        amount0: ParseWETH('2.75'),
        price: ParseUSDC('1475'),
        isAsk: false,
      })
      await expect(tx).to.changeTokenBalance(weth, acc1.address, ParseWETH('2.75'))
      await reportGasCost(scenario, tx)
    }
  })
  it('Bid; 1 full match', async () => {
    const {acc1, orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const tx = await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('1.5'),
      price: ParseUSDC('1475'),
      isAsk: false,
    })
    await reportGasCost('IOC_CREATE_1_FILLS', tx)
  })
  it('Bid; 1 partial match', async () => {
    const {acc1, orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const tx = await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('0.5'),
      price: ParseUSDC('1475'),
      isAsk: false,
    })
    await reportGasCost('IOC_CREATE_0.5_FILLS', tx)
  })
  it('Bid; 0 match', async () => {
    const {acc1, orderBook, weth} = await loadFixture(setupFixturesForSmartWallet)

    const tx = await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('3'),
      price: ParseUSDC('1449'),
      isAsk: false,
    })
    await expect(tx).to.changeTokenBalance(weth, acc1.address, ParseWETH('0'))
    await reportGasCost('IOC_CREATE_0_FILLS', tx)
  })
  it('Bid; 1 full match; stops if price is bad', async () => {
    const {acc1, orderBook, weth, usdc} = await loadFixture(setupFixturesForSmartWallet)

    const tx = await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('10'),
      price: ParseUSDC('1460'),
      isAsk: false,
    })
    await expect(tx).to.changeTokenBalance(weth, acc1.address, ParseWETH(1.5))
    await expect(tx).to.changeTokenBalance(usdc, acc1.address, ParseUSDC(-1.5 * 1450))
    await reportGasCost('IOC_CREATE_1_FILLS_STOPS_IF_PRICE_IS_BAD', tx)
  })
})
