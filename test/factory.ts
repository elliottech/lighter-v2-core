import {Factory} from 'typechain-types'
import {Contract} from 'ethers'
import {ethers} from 'hardhat'
import {deployFactory} from './default-fixture'
import {expect} from 'chai'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'

describe('Factory contract', function () {
  let factory: Factory

  let owner: SignerWithAddress
  let acc1: SignerWithAddress

  const zeroAddress = ethers.constants.AddressZero

  let WETH: Contract
  let WBTC: Contract
  let USDC: Contract
  let DAI: Contract

  async function deploy() {
    let testERC20_factory = await ethers.getContractFactory('TestERC20Token')

    WETH = await testERC20_factory.deploy('WETH token', 'WETH', 18)
    WBTC = await testERC20_factory.deploy('WBTC token', 'WBTC', 8)
    USDC = await testERC20_factory.deploy('USDC token', 'USDC', 6)
    DAI = await testERC20_factory.deploy('DAI token', 'DAI', 18)
    ;[owner, acc1] = await ethers.getSigners()
    ;({factory} = await deployFactory(owner))
  }

  beforeEach(async function () {
    await loadFixture(deploy)
  })

  describe('CreateOrderBook', function () {
    it('creates order book successfully', async function () {
      expect(await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)).to.not.be.reverted
    })

    it("can't have equal tokens", async function () {
      try {
        await factory.createOrderBook(WETH.address, WETH.address, 2, 2, 10, 10)
      } catch (error: any) {
        expect(error.message).to.include('LighterV2CreateOrderBook_InvalidTokenPair')
      }
    })

    it("can't have token0 equal to zero", async function () {
      try {
        await factory.createOrderBook(zeroAddress, WBTC.address, 2, 2, 10, 10)
      } catch (error: any) {
        expect(error.message).to.include('LighterV2CreateOrderBook_InvalidTokenPair')
      }
    })

    it("can't have token1 equal to zero", async function () {
      try {
        await factory.createOrderBook(WETH.address, zeroAddress, 2, 2, 10, 10)
      } catch (error: any) {
        expect(error.message).to.include('LighterV2CreateOrderBook_InvalidTokenPair')
      }
    })

    it("can't have duplicate order book", async function () {
      // Create the order book
      await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)

      try {
        await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)
      } catch (error: any) {
        expect(error.message).to.include('LighterV2CreateOrderBook_OrderBookAlreadyExists')
      }
    })

    it("can't have two order books with tokens in reverse order", async function () {
      // Create the order book
      await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)

      try {
        await factory.createOrderBook(WBTC.address, WETH.address, 2, 2, 10, 10)
      } catch (error: any) {
        expect(error.message).to.include('LighterV2CreateOrderBook_OrderBookAlreadyExists')
      }
    })

    it('creates two order books successfully', async function () {
      // Create the first order book
      let orderBookAddress = await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)
      await expect(orderBookAddress).to.not.equal(zeroAddress)

      // Create the second order book
      let orderBookAddress2 = await factory.createOrderBook(USDC.address, DAI.address, 2, 2, 10, 10)
      expect(orderBookAddress2).to.not.equal(zeroAddress)
    })

    it('reverts if size ticks are invalid', async function () {
      const tx = factory.createOrderBook(USDC.address, DAI.address, 30, 30, 10, 10)
      await expect(tx).to.be.revertedWith('LighterV2CreateOrderBook_InvalidTickCombination')
    })

    it('reverts if minToken0BaseAmount amount or minToken1BaseAmount is zero', async function () {
      let tx = factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 0, 10)
      await expect(tx).to.be.revertedWith('LighterV2CreateOrderBook_InvalidMinAmount')

      tx = factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 0)
      await expect(tx).to.be.revertedWith('LighterV2CreateOrderBook_InvalidMinAmount')
    })
  })

  it('gets the order book address from a given id successfully', async function () {
    const orderBookAddressTX = await (await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)).wait()
    const orderBookAddress = orderBookAddressTX.events![0].args!.orderBookAddress

    await expect(await factory.getOrderBookFromId(0)).to.equal(orderBookAddress)
  })

  it('gets the order book address from a given token pair successfully', async function () {
    const orderBookAddressTX = await (await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)).wait()
    const orderBookAddress = orderBookAddressTX.events![0].args!.orderBookAddress

    await expect(await factory.getOrderBookFromTokenPair(WETH.address, WBTC.address)).to.equal(orderBookAddress)
  })

  it('gets the order book details from a given id successfully', async function () {
    const orderBookAddressTX = await (await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)).wait()
    const orderBookArguments = orderBookAddressTX.events![0].args!

    let details = await factory.getOrderBookDetailsFromId(0)

    expect(details.orderBookAddress).to.equal(orderBookArguments.orderBookAddress)
    expect(details.token0).to.equal(orderBookArguments.token0)
    expect(details.token1).to.equal(orderBookArguments.token1)
    expect(details.sizeTick).to.equal(10 ** orderBookArguments.logSizeTick)
  })

  it('gets the order book details from a given token pair successfully', async function () {
    const orderBookAddressTX = await (await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)).wait()
    const orderBookArguments = orderBookAddressTX.events![0].args!

    let details = await factory.getOrderBookDetailsFromTokenPair(WETH.address, WBTC.address)

    expect(details.orderBookAddress).to.equal(orderBookArguments.orderBookAddress)
    expect(details.token0).to.equal(orderBookArguments.token0)
    expect(details.token1).to.equal(orderBookArguments.token1)
    expect(details.sizeTick).to.equal(10 ** orderBookArguments.logSizeTick)
  })

  it('gets all order book details', async function () {
    const orderBookAddressTX = await (await factory.createOrderBook(WETH.address, WBTC.address, 2, 2, 10, 10)).wait()
    const orderBookArguments = orderBookAddressTX.events![0].args!

    const orderBookAddressTX2 = await (await factory.createOrderBook(DAI.address, USDC.address, 2, 2, 10, 10)).wait()
    const orderBookArguments2 = orderBookAddressTX2.events![0].args!

    let allDetails = await factory.getAllOrderBooksDetails()

    expect(allDetails[0].orderBookAddress).to.equal(orderBookArguments.orderBookAddress)
    expect(allDetails[0].token0).to.equal(orderBookArguments.token0)
    expect(allDetails[0].token1).to.equal(orderBookArguments.token1)
    expect(allDetails[0].sizeTick).to.equal(10 ** orderBookArguments.logSizeTick)

    expect(allDetails[1].orderBookAddress).to.equal(orderBookArguments2.orderBookAddress)
    expect(allDetails[1].token0).to.equal(orderBookArguments2.token0)
    expect(allDetails[1].token1).to.equal(orderBookArguments2.token1)
    expect(allDetails[1].sizeTick).to.equal(10 ** orderBookArguments2.logSizeTick)
  })

  it('does not get any details when there is no order book', async function () {
    let allDetails = await factory.getAllOrderBooksDetails()
    expect(allDetails).to.be.empty
  })

  it('reverts with the correct error codes for incorrect owner operations', async function () {
    await expect(factory.connect(acc1).setOwner(acc1.address)).to.be.revertedWithCustomError(
      factory,
      'LighterV2Factory_CallerNotOwner'
    )
    await expect(factory.connect(owner).setOwner(zeroAddress)).to.be.revertedWithCustomError(
      factory,
      'LighterV2Factory_OwnerCannotBeZero'
    )
  })
})
