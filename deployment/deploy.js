const fs = require('fs');

const deployHome = require('./src/home');
const deployForeign = require('./src/foreign');

async function main() {
  const foreign = await deployForeign();
  const home = await deployHome(foreign.foreignTokenForHomeNative)
  console.log("\n**************************************************")
  console.log("          Deployment has been completed.          ")
  console.log("**************************************************\n\n")
  console.log("Use following variables in your bridge client .env file:")
  console.log(`HOME_RPC_URL=${process.env.HOME_RPC_URL}`)
  console.log(`FOREIGN_RPC_URL=${process.env.FOREIGN_RPC_URL}`)
  console.log(`HOME_BRIDGE_ADDRESS=${home.bridge}`)
  console.log(`HOME_TOKEN_FOR_FOREIGN_NATIVE_ADDRESS=${home.homeTokenForForeignNative}`)
  console.log(`FOREIGN_BRIDGE_ADDRESS=${foreign.bridge}`)
  console.log(`FOREIGN_TOKEN_FOR_HOME_NATIVE_ADDRESS=${foreign.foreignTokenForHomeNative}`)
  console.log(`VALIDATOR_ADDRESS=<ONE OF FOLLOWING: ${process.env.VALIDATORS}>`)
  console.log(`VALIDATOR_ADDRESS_PRIVATE_KEY=<TYPE HERE>`)

  fs.writeFileSync('./bridgeDeploymentResults.json', JSON.stringify({
    home: {
      ...home,
    },
    foreign: {
      ...foreign
    },
  },null,4));
  console.log('Contracts Deployment have been saved to `bridgeDeploymentResults.json`')
}
main()
