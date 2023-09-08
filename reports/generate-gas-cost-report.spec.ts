import {ethers} from 'hardhat'
import {utils} from 'ethers'
import {reportGasCost} from 'reports/index'

describe('Test GasCostReport ', function () {
  it('simple transfer with no data', async function () {
    const [alice, bob] = await ethers.getSigners()
    const tx = await alice.sendTransaction({
      to: bob.address,
      value: utils.parseEther('0'),
    })

    await reportGasCost('SIMPLE_TRANSFER_NO_DATA', tx)
  })
  it('simple transfer 10 bytes', async function () {
    const [alice, bob] = await ethers.getSigners()
    const tx = await alice.sendTransaction({
      to: bob.address,
      value: utils.parseEther('0'),
      data: '0x0102030405060708090a',
    })

    await reportGasCost('SIMPLE_TRANSFER_10_BYTES', tx)
  })
})
