var ForeignBridge = artifacts.require('ForeignBridge.sol');

module.exports = function (deployer) {
  deployer.deploy(ForeignBridge)
}
