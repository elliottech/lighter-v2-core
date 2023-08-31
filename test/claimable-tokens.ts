import {expect, ParseUSDC, ParseWETH} from 'test/shared'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {setupFixturesForSmartWallet} from './default-fixture'

// TODO: there are some problems when running tests directly with mocha, but it works with npx hardhat test
// the error is `Error: withNamedArgs() must be used after emit()`
// for some reason, it works with `withArgs` and will use that instead

describe('Claimable Tokens', () => {
  describe('deposits', () => {
    it('token0', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      const before = await s.weth.balanceOf(s.acc1.address)

      const tx = await s.acc1.depositToken0(0, ParseWETH('0.5'))
      await expect(tx).emit(s.orderBook, 'ClaimableBalanceIncrease').withArgs(s.acc1.address, ParseWETH('0.5'), true)
      // .withNamedArgs({
      //   owner: s.acc1.address,
      //   amountDelta: ParseWETH('0.5'),
      //   isToken0: true,
      // })

      const after = await s.weth.balanceOf(s.acc1.address)
      expect(before.sub(after)).to.equal(ParseWETH('0.5'))
    })
    it('token1', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      const before = await s.usdc.balanceOf(s.acc1.address)

      const tx = await s.acc1.depositToken1(0, ParseUSDC('1450'))
      await expect(tx)
        .to.emit(s.orderBook, 'ClaimableBalanceIncrease')
        .withArgs(s.acc1.address, ParseUSDC('1450'), false)
      // .withNamedArgs({
      //   owner: s.acc1.address,
      //   amountDelta: ParseUSDC('1450'),
      //   isToken0: false,
      // })

      const after = await s.usdc.balanceOf(s.acc1.address)
      expect(before.sub(after)).to.equal(ParseUSDC('1450'))
    })
  })
  describe('claims', () => {
    it('token0', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      const before = await s.weth.balanceOf(s.acc1.address)

      const tx = await s.acc1.claimToken0(0, ParseWETH('0.5'))
      await expect(tx).to.emit(s.orderBook, 'ClaimableBalanceDecrease').withArgs(s.acc1.address, ParseWETH('0.5'), true)
      // .withNamedArgs({
      //   owner: s.acc1.address,
      //   amountDelta: ParseWETH('0.5'),
      //   isToken0: true,
      // })

      const after = await s.weth.balanceOf(s.acc1.address)
      expect(after.sub(before)).to.equal(ParseWETH('0.5'))
    })
    it('token1', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      const before = await s.usdc.balanceOf(s.acc1.address)

      const tx = await s.acc1.claimToken1(0, ParseUSDC('1450'))
      await expect(tx)
        .to.emit(s.orderBook, 'ClaimableBalanceDecrease')
        .withArgs(s.acc1.address, ParseUSDC('1450'), false)
      // .withNamedArgs({
      //   owner: s.acc1.address,
      //   amountDelta: ParseUSDC('1450'),
      //   isToken0: false,
      // })

      const after = await s.usdc.balanceOf(s.acc1.address)
      expect(after.sub(before)).to.equal(ParseUSDC('1450'))
    })
    it('all', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      const beforeUSDC = await s.usdc.balanceOf(s.acc1.address)
      const beforeWETH = await s.weth.balanceOf(s.acc1.address)

      const tx = await s.acc1.claimAll(0)
      await expect(tx)
        .to.emit(s.orderBook, 'ClaimableBalanceDecrease')
        .withArgs(s.acc1.address, ParseWETH('10'), true)
        // .withNamedArgs({
        //   owner: s.acc1.address,
        //   amountDelta: ParseWETH('10'),
        //   isToken0: true,
        // })
        .to.emit(s.orderBook, 'ClaimableBalanceDecrease')
        .withArgs(s.acc1.address, ParseUSDC('15000'), false)
      // .withNamedArgs({
      //   owner: s.acc1.address,
      //   amountDelta: ParseUSDC('15000'),
      //   isToken0: false,
      // })

      const afterUSDC = await s.usdc.balanceOf(s.acc1.address)
      const afterWETH = await s.weth.balanceOf(s.acc1.address)

      expect(afterWETH.sub(beforeWETH)).to.equal(ParseWETH('10'))
      expect(afterUSDC.sub(beforeUSDC)).to.equal(ParseUSDC('15000'))
    })
    it('revert for invalid claim amount token0', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)
      const tx = s.acc1.claimToken0(0, ParseWETH('15'))
      await expect(tx).to.be.revertedWithCustomError(s.orderBook, 'LighterV2Vault_InvalidClaimAmount')
    })
    it('revert for invalid claim amount token1', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)
      const tx = s.acc1.claimToken1(0, ParseUSDC('15500'))
      await expect(tx).to.be.revertedWithCustomError(s.orderBook, 'LighterV2Vault_InvalidClaimAmount')
    })
  })
})
