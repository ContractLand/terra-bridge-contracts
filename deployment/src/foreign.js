const Web3Utils = require('web3-utils')
require('dotenv').config({
  path: __dirname + '/../.env'
});

const assert = require('assert');

const {deployContract, sendRawTx, compareHex} = require('./deploymentUtils');
const {web3Foreign, deploymentPrivateKey, FOREIGN_RPC_URL, PROXY_ADMIN_ADDRESS_SLOT} = require('./web3');

const ERC20 = require('../../build/contracts/TestToken.json')
const Proxy = require('../../build/contracts/AdminUpgradeabilityProxy.json');
const BridgeValidators = require('../../build/contracts/BridgeValidators.json')
const ForeignBridge = require('../../build/contracts/ForeignBridge.json')

const VALIDATORS = process.env.VALIDATORS.split(" ")
const FOREIGN_GAS_PRICE =  Web3Utils.toWei(process.env.FOREIGN_GAS_PRICE, 'gwei');

const {
  DEPLOYMENT_ACCOUNT_ADDRESS,
  REQUIRED_NUMBER_OF_VALIDATORS,
  FOREIGN_OWNER_MULTISIG,
  FOREIGN_UPGRADEABLE_ADMIN_VALIDATORS,
  FOREIGN_UPGRADEABLE_ADMIN_BRIDGE,
  FOREIGN_DAILY_LIMIT,
  FOREIGN_MAX_AMOUNT_PER_TX,
  FOREIGN_MIN_AMOUNT_PER_TX,
  FOREIGN_REQUIRED_BLOCK_CONFIRMATIONS,
  FOREIGN_TOKEN_NAME,
  FOREIGN_TOKEN_SYMBOL,
  FOREIGN_TOKEN_TOTAL
} = process.env;

async function deployForeign() {
  assert(!VALIDATORS.includes(FOREIGN_UPGRADEABLE_ADMIN_VALIDATORS), 'FOREIGN_UPGRADEABLE_ADMIN_VALIDATORS cannot be a VALIDATOR');
  assert(!VALIDATORS.includes(FOREIGN_UPGRADEABLE_ADMIN_BRIDGE), 'FOREIGN_UPGRADEABLE_ADMIN_BRIDGE cannot be a VALIDATOR');
  let foreignNonce = await web3Foreign.eth.getTransactionCount(DEPLOYMENT_ACCOUNT_ADDRESS);

  console.log('========================================')
  console.log('deploying ForeignBridge')
  console.log('========================================\n')

  /*** Deploying BridgeValidators for foreign ***/
  console.log('\n[Foreign] deploying implementation for foreign validators:')
  let bridgeValidatorsForeign = await deployContract(BridgeValidators, [], {from: DEPLOYMENT_ACCOUNT_ADDRESS, network: 'foreign', nonce: foreignNonce})
  foreignNonce++;
  console.log('[Foreign] BridgeValidators Implementation: ', bridgeValidatorsForeign.options.address)

  console.log('\n[Foreign] deploying proxy for foreign validators:')
  let bridgeValidatorsForeignProxy = await deployContract(Proxy, [bridgeValidatorsForeign.options.address], {from: DEPLOYMENT_ACCOUNT_ADDRESS, network: 'foreign', nonce: foreignNonce})
  console.log('[Foreign] BridgeValidators Proxy: ', bridgeValidatorsForeignProxy.options.address)
  foreignNonce++;

  console.log('\n[Foreign] transferring proxy ownership to multisig for Validators Proxy contract:');
  const proxyDataTransfer = await bridgeValidatorsForeignProxy.methods.changeAdmin(FOREIGN_UPGRADEABLE_ADMIN_VALIDATORS).encodeABI();
  const txProxyDataTransfer = await sendRawTx({
    data: proxyDataTransfer,
    nonce: foreignNonce,
    to: bridgeValidatorsForeignProxy.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.equal(txProxyDataTransfer.status, '0x1', 'Transaction Failed');
  const newProxyOwner = await web3Foreign.eth.getStorageAt(bridgeValidatorsForeignProxy.options.address, web3Foreign.utils.toBN(PROXY_ADMIN_ADDRESS_SLOT))
  assert.ok(compareHex(newProxyOwner.toLocaleLowerCase(), FOREIGN_UPGRADEABLE_ADMIN_VALIDATORS.toLocaleLowerCase()));
  foreignNonce++;

  console.log('\n[Foreign] initializing Foreign Bridge Validators with following parameters:')
  console.log(`REQUIRED_NUMBER_OF_VALIDATORS: ${REQUIRED_NUMBER_OF_VALIDATORS}, VALIDATORS: ${VALIDATORS}`)
  bridgeValidatorsForeign.options.address = bridgeValidatorsForeignProxy.options.address
  const initializeForeignData = await bridgeValidatorsForeign.methods.initialize(
    REQUIRED_NUMBER_OF_VALIDATORS, VALIDATORS, DEPLOYMENT_ACCOUNT_ADDRESS
  ).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS});
  const txInitializeForeign = await sendRawTx({
    data: initializeForeignData,
    nonce: foreignNonce,
    to: bridgeValidatorsForeign.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  });
  assert.equal(txInitializeForeign.status, '0x1', 'Transaction Failed');
  const validatorOwner = await bridgeValidatorsForeign.methods.owner().call();
  assert.ok(compareHex(validatorOwner.toLowerCase(), DEPLOYMENT_ACCOUNT_ADDRESS.toLocaleLowerCase()));
  foreignNonce++;

  /*** Deploying ForeignBridge ***/
  console.log('\n[Foreign] deploying foreignBridge implementation:')
  const foreignBridgeImplementation = await deployContract(ForeignBridge, [], {from: DEPLOYMENT_ACCOUNT_ADDRESS, network: 'foreign', nonce: foreignNonce})
  foreignNonce++;
  console.log('[Foreign] ForeignBridge Implementation: ', foreignBridgeImplementation.options.address)

  console.log('\n[Foreign] deploying proxy for foreignBridge:')
  let foreignBridgeProxy = await deployContract(Proxy, [foreignBridgeImplementation.options.address], {from: DEPLOYMENT_ACCOUNT_ADDRESS, network: 'foreign', nonce: foreignNonce})
  console.log('[Foreign] ForeignBridge Proxy: ', foreignBridgeProxy.options.address)
  foreignNonce++;

  console.log('\n[Foreign] transferring proxy ownership to multisig for ForeignBridge Proxy contract:');
  const foreignBridgeProxyTransferData = await foreignBridgeProxy.methods.changeAdmin(FOREIGN_UPGRADEABLE_ADMIN_BRIDGE).encodeABI();
  const txForeignBridgeProxyTransferData = await sendRawTx({
    data: foreignBridgeProxyTransferData,
    nonce: foreignNonce,
    to: foreignBridgeProxy.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.equal(txForeignBridgeProxyTransferData.status, '0x1', 'Transaction Failed');
  const newProxyBridgeOwner = await web3Foreign.eth.getStorageAt(foreignBridgeProxy.options.address, web3Foreign.utils.toBN(PROXY_ADMIN_ADDRESS_SLOT))
  assert.ok(compareHex(newProxyBridgeOwner.toLocaleLowerCase(), FOREIGN_UPGRADEABLE_ADMIN_BRIDGE.toLocaleLowerCase()));
  foreignNonce++;

  console.log('\n[Foreign] initializing Foreign Bridge with following parameters:')
  console.log(`Foreign Validators: ${bridgeValidatorsForeign.options.address},
  FOREIGN_DAILY_LIMIT : ${FOREIGN_DAILY_LIMIT} which is ${Web3Utils.fromWei(FOREIGN_DAILY_LIMIT)} in eth,
  FOREIGN_MAX_AMOUNT_PER_TX: ${FOREIGN_MAX_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(FOREIGN_MAX_AMOUNT_PER_TX)} in eth,
  FOREIGN_MIN_AMOUNT_PER_TX: ${FOREIGN_MIN_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(FOREIGN_MIN_AMOUNT_PER_TX)} in eth
  `)
  foreignBridgeImplementation.options.address = foreignBridgeProxy.options.address
  const initializeFBridgeData = await foreignBridgeImplementation.methods.initialize(
    bridgeValidatorsForeign.options.address, FOREIGN_DAILY_LIMIT, FOREIGN_MAX_AMOUNT_PER_TX, FOREIGN_MIN_AMOUNT_PER_TX, FOREIGN_GAS_PRICE, FOREIGN_REQUIRED_BLOCK_CONFIRMATIONS
  ).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS});
  const txInitializeBridge = await sendRawTx({
    data: initializeFBridgeData,
    nonce: foreignNonce,
    to: foreignBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  });
  assert.equal(txInitializeBridge.status, '0x1', 'Transaction Failed');
  foreignNonce++;

  console.log('\n[Foreign] deploying ERC20 version of Home-Native token:')
  const erc20Foreign = await deployContract(ERC20, [FOREIGN_TOKEN_NAME, FOREIGN_TOKEN_SYMBOL, Web3Utils.toWei(FOREIGN_TOKEN_TOTAL)], {from: DEPLOYMENT_ACCOUNT_ADDRESS, network: 'foreign', nonce: foreignNonce})
  foreignNonce++;
  console.log('[Foreign] ERC20: ', erc20Foreign.options.address)

  console.log('\n[Foreign] setting transfer limits of ERC20 for Home-Native with parameters:')
  console.log(`
    FOREIGN_DAILY_LIMIT : ${FOREIGN_DAILY_LIMIT} which is ${Web3Utils.fromWei(FOREIGN_DAILY_LIMIT)} in eth,
    FOREIGN_MAX_AMOUNT_PER_TX: ${FOREIGN_MAX_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(FOREIGN_MAX_AMOUNT_PER_TX)} in eth,
    FOREIGN_MIN_AMOUNT_PER_TX: ${FOREIGN_MIN_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(FOREIGN_MIN_AMOUNT_PER_TX)} in eth
  `)
  const setDailyLimitData = await foreignBridgeImplementation.methods.setDailyLimit(erc20Foreign.options.address, FOREIGN_DAILY_LIMIT).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetDailyLimit = await sendRawTx({
    data: setDailyLimitData,
    nonce: foreignNonce,
    to: foreignBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  });
  assert.equal(txSetDailyLimit.status, '0x1', 'Transaction Failed');
  foreignNonce++;
  const setMaxPerTxData = await foreignBridgeImplementation.methods.setMaxPerTx(erc20Foreign.options.address, FOREIGN_MAX_AMOUNT_PER_TX).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetMaxPerTxLimit = await sendRawTx({
    data: setMaxPerTxData,
    nonce: foreignNonce,
    to: foreignBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  });
  assert.equal(txSetMaxPerTxLimit.status, '0x1', 'Transaction Failed');
  foreignNonce++;
  const setMinPerTxData = await foreignBridgeImplementation.methods.setMinPerTx(erc20Foreign.options.address, FOREIGN_MIN_AMOUNT_PER_TX).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetMinPerTxLimit = await sendRawTx({
    data: setMinPerTxData,
    nonce: foreignNonce,
    to: foreignBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  });
  assert.equal(txSetMinPerTxLimit.status, '0x1', 'Transaction Failed');
  foreignNonce++;

  console.log('\n[Foreign] transfer all created token to foreign bridge contract:')
  const transferData = await erc20Foreign.methods.transfer(
    foreignBridgeImplementation.options.address, Web3Utils.toWei(FOREIGN_TOKEN_TOTAL)
  ).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS});
  const txTransfer = await sendRawTx({
    data: transferData,
    nonce: foreignNonce,
    to: erc20Foreign.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  });
  assert.equal(txTransfer.status, '0x1', 'Transaction Failed');
  const bridgeBalance = await erc20Foreign.methods.balanceOf(foreignBridgeImplementation.options.address).call();
  assert.equal(Web3Utils.fromWei(bridgeBalance), FOREIGN_TOKEN_TOTAL);
  foreignNonce++;

  console.log('\n[Foreign] transferring ownership to multisig for ForeignBridge validators contract:');
  const validatorsTransferOwnerData = await bridgeValidatorsForeign.methods.transferOwnership(FOREIGN_OWNER_MULTISIG).encodeABI();
  const txValidatorsTransferOwnerData = await sendRawTx({
    data: validatorsTransferOwnerData,
    nonce: foreignNonce,
    to: bridgeValidatorsForeign.options.address,
    privateKey: deploymentPrivateKey,
    url: FOREIGN_RPC_URL
  })
  assert.equal(txValidatorsTransferOwnerData.status, '0x1', 'Transaction Failed');
  const newValidatorOwner = await bridgeValidatorsForeign.methods.owner().call();
  assert.ok(compareHex(newValidatorOwner.toLowerCase(), FOREIGN_OWNER_MULTISIG.toLocaleLowerCase()));
  foreignNonce++;

  console.log('\n***Foreign Bridge Deployment is complete***\n')

  return {
    bridgeValidators: bridgeValidatorsForeign.options.address,
    bridge: foreignBridgeImplementation.options.address,
    bridgeDeployedBlockNumber: Web3Utils.hexToNumber(foreignBridgeImplementation.deployedBlockNumber),
    foreignTokenForHomeNative: erc20Foreign.options.address
  }
}

module.exports = deployForeign;
