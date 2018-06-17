const fs = require('fs');

const deployHome = require('./src/home');
// const deployForeign = require('./src/foreign');

async function main() {
  const homeBridge = await deployHome()
  // const {foreignBridge, erc677} = await deployForeign();
  console.log("\n==========Deployment has been completed.==========\n\n")
  console.log(`[   Home  ] HomeBridge: ${homeBridge.bridgeAddress} at block ${homeBridge.bridgeDeployedBlockNumber}`)
  // console.log(`[ Foreign ] ForeignBridge: ${foreignBridge.address} at block ${foreignBridge.deployedBlockNumber}`)
  // console.log(`[ Foreign ] POA20: ${erc677.address}`)
  fs.writeFileSync('./bridgeDeploymentResults.json', JSON.stringify({
    home: {
      ...homeBridge,
    }
    // },foreignBridge: {
    //   ...foreignBridge,
    // },erc677
  },null,4));
  console.log('Contracts Deployment have been saved to `bridgeDeploymentResults.json`')
}
main()
