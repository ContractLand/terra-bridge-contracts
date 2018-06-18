const fs = require('fs');

const deployHome = require('./src/home');
const deployForeign = require('./src/foreign');

async function main() {
  // const homeBridge = await deployHome()
  const {foreignBridge, erc20} = await deployForeign();
  console.log("\n==========Deployment has been completed.==========\n\n")
  // console.log(`[   Home  ] HomeBridge: ${homeBridge.bridgeAddress} at block ${homeBridge.bridgeDeployedBlockNumber}`)
  console.log(`[ Foreign ] ForeignBridge: ${foreignBridge.address} at block ${foreignBridge.deployedBlockNumber}`)
  console.log(`[ Foreign ] ERC20: ${erc20.address}`)
  fs.writeFileSync('./bridgeDeploymentResults.json', JSON.stringify({
    // home: {
      // ...homeBridge,
    // },
    foreignBridge: {
      ...foreignBridge,
    },
    erc20
  },null,4));
  console.log('Contracts Deployment have been saved to `bridgeDeploymentResults.json`')
}
main()
