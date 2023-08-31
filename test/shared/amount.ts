import {BigNumber, BigNumberish, utils} from 'ethers'

export function ParseWETH(value: BigNumberish): BigNumber {
  if (typeof value == 'string') {
    return utils.parseUnits(value, 18)
  }
  if (typeof value == 'number') {
    return BigNumber.from(value * 1000000000).mul(BigNumber.from(10).pow(9))
  }
  return BigNumber.from(value).mul(BigNumber.from(10).pow(18))
}

export function ParseWETHBase(value: BigNumberish): BigNumber {
  if (typeof value == 'string') {
    return utils.parseUnits(value, 13)
  }
  if (typeof value == 'number') {
    return BigNumber.from(Math.round(value * 1000000000)).mul(BigNumber.from(10).pow(4))
  }
  return BigNumber.from(value).mul(BigNumber.from(10).pow(13))
}

export function ParseUSDC(value: BigNumberish): BigNumber {
  if (typeof value == 'string') {
    return utils.parseUnits(value, 6)
  }
  if (typeof value == 'number') {
    return BigNumber.from(value * 10000).mul(BigNumber.from(10).pow(2))
  }
  return BigNumber.from(value).mul(BigNumber.from(10).pow(6))
}
