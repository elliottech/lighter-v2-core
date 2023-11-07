import {main} from './stress-tester'

main()
  .then(() => {
    console.log('done')
  })
  .catch((err) => {
    console.error(`failed with error ${err}`)
  })
