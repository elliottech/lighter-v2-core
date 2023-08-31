import {getDataGasCost} from './L1GasEstimator'

it('getDataGasCost helper', () => {
  {
    let {gas, zeroBytes, nonZeroBytes} = getDataGasCost('0x0100022537422345000040684342d63b014051b0')
    console.log(`gas: ${gas} zeroBytes:${zeroBytes} nonZeroBytes:${nonZeroBytes}`)
  }
})
