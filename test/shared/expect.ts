import {expect, use} from 'chai'
import {solidity} from 'ethereum-waffle'
import {jestSnapshotPlugin} from 'mocha-chai-jest-snapshot'

// this is a nasty workaround to stop typescript from throwing errors when the package is imported outside a test
try {
  use(solidity)
  use(jestSnapshotPlugin())
} catch (e) {}

export {expect}
