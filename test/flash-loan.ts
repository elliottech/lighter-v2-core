import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {ethers} from 'hardhat'
import {reportGasCost} from 'reports'
import {setupFixturesForSmartWallet} from './default-fixture'
import {expect, ParseUSDC, ParseWETH} from './shared'
import {TestFlashLoanBadCallee, TestFlashLoanCallee, TestFlashLoanReentrantCallee} from 'typechain-types'

describe('flash-loan', function () {
  it('successful loan', async function () {
    const {orderBook, weth, usdc} = await loadFixture(setupFixturesForSmartWallet)

    const callee = (await (await ethers.getContractFactory('TestFlashLoanCallee')).deploy()) as TestFlashLoanCallee

    const tx = await callee.flash(orderBook.address, ParseWETH('1.0'), ParseUSDC('25.0'))
    await expect(tx)
      .to.changeTokenBalance(weth, callee.address, 0)
      .to.changeTokenBalance(weth, callee.address, 0)
      .to.changeTokenBalance(usdc, orderBook.address, 0)
      .to.changeTokenBalance(usdc, orderBook.address, 0)

    await reportGasCost('FLASH_LOAN', tx)
  })
  it('reverts when funds are not returned', async function () {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const callee = (await (
      await ethers.getContractFactory('TestFlashLoanBadCallee')
    ).deploy()) as TestFlashLoanBadCallee

    const tx = callee.flash(orderBook.address, ParseWETH('1.0'), ParseUSDC('25.0'))
    await expect(tx).to.be.revertedWithCustomError(orderBook, 'LighterV2FlashLoan_InsufficentCallbackTransfer')
  })
  it('reverts when caller tries reentrancy', async function () {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const callee = (await (
      await ethers.getContractFactory('TestFlashLoanReentrantCallee')
    ).deploy()) as TestFlashLoanReentrantCallee

    const tx = callee.flash(orderBook.address, ParseWETH('1.0'), ParseUSDC('25.0'))

    await expect(tx).to.be.revertedWith('ReentrancyGuard: reentrant call')
  })

  it('reverts when requesting too much', async function () {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const callee = (await (await ethers.getContractFactory('TestFlashLoanCallee')).deploy()) as TestFlashLoanCallee
    let tx

    tx = callee.flash(orderBook.address, ParseWETH('100.0'), ParseUSDC('25.0'))
    await expect(tx).to.be.revertedWithCustomError(orderBook, 'LighterV2TokenTransfer_Failed')

    tx = callee.flash(orderBook.address, ParseWETH('1.0'), ParseUSDC('250000.0'))
    await expect(tx).to.be.revertedWithCustomError(orderBook, 'LighterV2TokenTransfer_Failed')
  })
})
