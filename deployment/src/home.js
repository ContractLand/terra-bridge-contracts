const Web3Utils = require('web3-utils')
require('dotenv').config({
  path: __dirname + '/../.env'
});

const assert = require('assert');

const {deployContract, sendRawTx, compareHex} = require('./deploymentUtils');
const {web3Home, deploymentPrivateKey, HOME_RPC_URL, PROXY_ADMIN_ADDRESS_SLOT} = require('./web3');

const Proxy = require('../../build/contracts/AdminUpgradeabilityProxy.json');
const BridgeValidators = require('../../build/contracts/BridgeValidators.json')
const HomeBridge = require('../../build/contracts/HomeBridge.json')
const HomeToken = require('../../build/contracts/HomeToken.json')

const VALIDATORS = process.env.VALIDATORS.split(" ")
const HOME_GAS_PRICE =  Web3Utils.toWei(process.env.HOME_GAS_PRICE, 'gwei');

const {
  DEPLOYMENT_ACCOUNT_ADDRESS,
  REQUIRED_NUMBER_OF_VALIDATORS,
  HOME_OWNER_MULTISIG,
  HOME_UPGRADEABLE_ADMIN_VALIDATORS,
  HOME_UPGRADEABLE_ADMIN_BRIDGE,
  HOME_DAILY_LIMIT,
  HOME_MAX_AMOUNT_PER_TX,
  HOME_MIN_AMOUNT_PER_TX,
  HOME_REQUIRED_BLOCK_CONFIRMATIONS,
  HOME_TOKEN_NAME,
  HOME_TOKEN_SYMBOL,
  HOME_TOKEN_DECIMAL
} = process.env;

async function deployHome(foreignTokenForHomeNative)
{
  let homeNonce = await web3Home.eth.getTransactionCount(DEPLOYMENT_ACCOUNT_ADDRESS);

  console.log('========================================')
  console.log('deploying HomeBridge')
  console.log('========================================\n')

  /*** Deploying BridgeValidators for home ***/
  console.log('\n[Home] deploying implementation for home validators:')
  let bridgeValidatorsHome = await deployContract(BridgeValidators, [], {from: DEPLOYMENT_ACCOUNT_ADDRESS, nonce: homeNonce})
  console.log('[Home] BridgeValidators Implementation: ', bridgeValidatorsHome.options.address)
  homeNonce++;

  console.log('\n[Home] deploying proxy for home validators:')
  let bridgeValidatorsHomeProxy = await deployContract(Proxy, [bridgeValidatorsHome.options.address], {from: DEPLOYMENT_ACCOUNT_ADDRESS, nonce: homeNonce})
  console.log('[Home] BridgeValidators Proxy: ', bridgeValidatorsHomeProxy.options.address)
  homeNonce++;

  console.log('\n[Home] transferring proxy ownership to multisig for Validators Proxy contract:');
  const proxyDataTransfer = await bridgeValidatorsHomeProxy.methods.changeAdmin(HOME_UPGRADEABLE_ADMIN_VALIDATORS).encodeABI();
  const txProxyDataTransfer = await sendRawTx({
    data: proxyDataTransfer,
    nonce: homeNonce,
    to: bridgeValidatorsHomeProxy.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  })
  assert.equal(txProxyDataTransfer.status, '0x1', 'Transaction Failed');
  const newProxyOwner = await web3Home.eth.getStorageAt(bridgeValidatorsHomeProxy.options.address, web3Home.utils.toBN(PROXY_ADMIN_ADDRESS_SLOT))
  assert.ok(compareHex(newProxyOwner.toLocaleLowerCase(), HOME_UPGRADEABLE_ADMIN_VALIDATORS.toLocaleLowerCase()));
  homeNonce++;

  console.log('\n[Home] initializing Home Bridge Validators with following parameters:')
  console.log(`REQUIRED_NUMBER_OF_VALIDATORS: ${REQUIRED_NUMBER_OF_VALIDATORS}, VALIDATORS: ${VALIDATORS}`)
  bridgeValidatorsHome.options.address = bridgeValidatorsHomeProxy.options.address
  const initializeData = await bridgeValidatorsHome.methods.initialize(
    REQUIRED_NUMBER_OF_VALIDATORS, VALIDATORS, DEPLOYMENT_ACCOUNT_ADDRESS
  ).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txInitialize = await sendRawTx({
    data: initializeData,
    nonce: homeNonce,
    to: bridgeValidatorsHome.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  })
  assert.equal(txInitialize.status, '0x1', 'Transaction Failed');
  const validatorOwner = await bridgeValidatorsHome.methods.owner().call();
  assert.ok(compareHex(validatorOwner.toLocaleLowerCase(), DEPLOYMENT_ACCOUNT_ADDRESS.toLocaleLowerCase()));
  homeNonce++;


  /*** Deploying HomeBridge ***/
  console.log('\n[Home] deploying homeBridge implementation:')
  const homeBridgeImplementation = await deployContract(HomeBridge, [], {from: DEPLOYMENT_ACCOUNT_ADDRESS, nonce: homeNonce})
  homeNonce++;
  console.log('[Home] HomeBridge Implementation: ', homeBridgeImplementation.options.address)

  console.log('\n[Home] deploying proxy for homeBridge:')
  let homeBridgeProxy = await deployContract(Proxy, [homeBridgeImplementation.options.address], {from: DEPLOYMENT_ACCOUNT_ADDRESS, nonce: homeNonce})
  console.log('[Home] HomeBridge Proxy: ', homeBridgeProxy.options.address)
  homeNonce++;

  console.log('\n[Home] transferring proxy ownership to multisig for HomeBridge Proxy contract:');
  const homeBridgeProxyTransferData = await homeBridgeProxy.methods.changeAdmin(HOME_UPGRADEABLE_ADMIN_BRIDGE).encodeABI();
  const txHomeBridgeProxyTransferData = await sendRawTx({
    data: homeBridgeProxyTransferData,
    nonce: homeNonce,
    to: homeBridgeProxy.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  })
  assert.equal(txHomeBridgeProxyTransferData.status, '0x1', 'Transaction Failed');
  const newProxyBridgeOwner = await web3Home.eth.getStorageAt(homeBridgeProxy.options.address, web3Home.utils.toBN(PROXY_ADMIN_ADDRESS_SLOT))
  assert.ok(compareHex(newProxyBridgeOwner.toLocaleLowerCase(), HOME_UPGRADEABLE_ADMIN_BRIDGE.toLocaleLowerCase()));
  homeNonce++;

  console.log('\n[Home] initializing Home Bridge with following parameters:')
  console.log(`Home Validators: ${bridgeValidatorsHome.options.address},
  HOME_DAILY_LIMIT : ${HOME_DAILY_LIMIT} which is ${Web3Utils.fromWei(HOME_DAILY_LIMIT)} in eth,
  HOME_MAX_AMOUNT_PER_TX: ${HOME_MAX_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(HOME_MAX_AMOUNT_PER_TX)} in eth,
  HOME_MIN_AMOUNT_PER_TX: ${HOME_MIN_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(HOME_MIN_AMOUNT_PER_TX)} in eth,
  HOME_GAS_PRICE: ${HOME_GAS_PRICE}, HOME_REQUIRED_BLOCK_CONFIRMATIONS : ${HOME_REQUIRED_BLOCK_CONFIRMATIONS}
  `)
  homeBridgeImplementation.options.address = homeBridgeProxy.options.address
  const initializeHomeBridgeData = await homeBridgeImplementation.methods.initialize(
    bridgeValidatorsHome.options.address, HOME_DAILY_LIMIT, HOME_MAX_AMOUNT_PER_TX, HOME_MIN_AMOUNT_PER_TX, HOME_GAS_PRICE, HOME_REQUIRED_BLOCK_CONFIRMATIONS
  ).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS});
  const txInitializeHomeBridge = await sendRawTx({
    data: initializeHomeBridgeData,
    nonce: homeNonce,
    to: homeBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  });
  assert.equal(txInitializeHomeBridge.status, '0x1', 'Transaction Failed');
  homeNonce++;

  console.log('\n[Home] deploying HomeToken version of Foreign-Native token:')
  const homeToken = await deployContract(HomeToken, [HOME_TOKEN_NAME, HOME_TOKEN_SYMBOL, HOME_TOKEN_DECIMAL], {from: DEPLOYMENT_ACCOUNT_ADDRESS, network: 'home', nonce: homeNonce})
  homeNonce++;
  console.log('[Home] Token: ', homeToken.options.address)

  console.log('\n[Home] transferring ownership to homeBridge for HomeToken version of Foreign-Native token:');
  const tokenTransferOwnerData = await homeToken.methods.transferOwnership(homeBridgeImplementation.options.address).encodeABI();
  const txTokenTransferOwnerData = await sendRawTx({
    data: tokenTransferOwnerData,
    nonce: homeNonce,
    to: homeToken.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  })
  assert.equal(txTokenTransferOwnerData.status, '0x1', 'Transaction Failed');
  const newTokenOwner = await homeToken.methods.owner().call();
  assert.ok(compareHex(newTokenOwner.toLowerCase(), homeBridgeImplementation.options.address.toLocaleLowerCase()));
  homeNonce++;

  console.log('\n[Home] setting transfer limits of HomeToken for Foreign-Native with parameters:')
  console.log(`
    HOME_DAILY_LIMIT : ${HOME_DAILY_LIMIT} which is ${Web3Utils.fromWei(HOME_DAILY_LIMIT)} in eth,
    HOME_MAX_AMOUNT_PER_TX: ${HOME_MAX_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(HOME_MAX_AMOUNT_PER_TX)} in eth,
    HOME_MIN_AMOUNT_PER_TX: ${HOME_MIN_AMOUNT_PER_TX} which is ${Web3Utils.fromWei(HOME_MIN_AMOUNT_PER_TX)} in eth
  `)
  const setDailyLimitData = await homeBridgeImplementation.methods.setDailyLimit(homeToken.options.address, HOME_DAILY_LIMIT).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetDailyLimit = await sendRawTx({
    data: setDailyLimitData,
    nonce: homeNonce,
    to: homeBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  });
  assert.equal(txSetDailyLimit.status, '0x1', 'Transaction Failed');
  homeNonce++;
  const setMaxPerTxData = await homeBridgeImplementation.methods.setMaxPerTx(homeToken.options.address, HOME_MAX_AMOUNT_PER_TX).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetMaxPerTxLimit = await sendRawTx({
    data: setMaxPerTxData,
    nonce: homeNonce,
    to: homeBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  });
  assert.equal(txSetMaxPerTxLimit.status, '0x1', 'Transaction Failed');
  homeNonce++;
  const setMinPerTxData = await homeBridgeImplementation.methods.setMinPerTx(homeToken.options.address, HOME_MIN_AMOUNT_PER_TX).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetMinPerTxLimit = await sendRawTx({
    data: setMinPerTxData,
    nonce: homeNonce,
    to: homeBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  });
  assert.equal(txSetMinPerTxLimit.status, '0x1', 'Transaction Failed');
  homeNonce++;

  console.log('\n[Home] register Foreign-Native token mapping to: ', homeToken.options.address)
  const setForeignNativeMapping = await homeBridgeImplementation.methods.registerToken('0x0000000000000000000000000000000000000000', homeToken.options.address).encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetForeignNativeMapping = await sendRawTx({
    data: setForeignNativeMapping,
    nonce: homeNonce,
    to: homeBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  });
  assert.equal(txSetForeignNativeMapping.status, '0x1', 'Transaction Failed');
  homeNonce++;

  console.log('\n[Home] register Home-Native token mapping: ', foreignTokenForHomeNative)
  const setHomeNativeMapping = await homeBridgeImplementation.methods.registerToken(foreignTokenForHomeNative, '0x0000000000000000000000000000000000000000').encodeABI({from: DEPLOYMENT_ACCOUNT_ADDRESS})
  const txSetHomeNativeMapping = await sendRawTx({
    data: setHomeNativeMapping,
    nonce: homeNonce,
    to: homeBridgeImplementation.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  });
  assert.equal(txSetHomeNativeMapping.status, '0x1', 'Transaction Failed');
  homeNonce++;

  console.log('\n[Home] transferring ownership to multisig for HomeBridge validators contract:');
  const validatorsTransferOwnerData = await bridgeValidatorsHome.methods.transferOwnership(HOME_OWNER_MULTISIG).encodeABI();
  const txValidatorsTransferOwnerData = await sendRawTx({
    data: validatorsTransferOwnerData,
    nonce: homeNonce,
    to: bridgeValidatorsHome.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  })
  assert.equal(txValidatorsTransferOwnerData.status, '0x1', 'Transaction Failed');
  const newValidatorOwner = await bridgeValidatorsHome.methods.owner().call();
  assert.ok(compareHex(newValidatorOwner.toLowerCase(), HOME_OWNER_MULTISIG.toLocaleLowerCase()));
  homeNonce++;

  console.log('\n***Home Bridge Deployment is complete***\n')

  return {
    bridgeValidators: bridgeValidatorsHome.options.address,
    bridge: homeBridgeImplementation.options.address,
    bridgeDeployedBlockNumber: Web3Utils.hexToNumber(homeBridgeImplementation.deployedBlockNumber),
    homeTokenForForeignNative: homeToken.options.address
  }
}

module.exports = deployHome;
