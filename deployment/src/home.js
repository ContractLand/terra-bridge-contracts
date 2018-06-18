const Web3Utils = require('web3-utils')
require('dotenv').config({
  path: __dirname + '/../.env'
});

const assert = require('assert');

const {deployContract, sendRawTx} = require('./deploymentUtils');
const {web3Home, deploymentPrivateKey, HOME_RPC_URL} = require('./web3');

const Proxy = require('../../build/contracts/AdminUpgradeabilityProxy.json');
const BridgeValidators = require('../../build/contracts/BridgeValidators.json')
const HomeBridge = require('../../build/contracts/HomeBridge.json')

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
} = process.env;

async function deployHome()
{
  const admin_storage_slot = '0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b'
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
  const newProxyOwner = await web3Home.eth.getStorageAt(bridgeValidatorsHomeProxy.options.address, web3Home.utils.toBN(admin_storage_slot))
  assert.equal(newProxyOwner.toLocaleLowerCase(), HOME_UPGRADEABLE_ADMIN_VALIDATORS.toLocaleLowerCase());
  homeNonce++;

  console.log('\n[Home] initializing Home Bridge Validators with following parameters:')
  console.log(`REQUIRED_NUMBER_OF_VALIDATORS: ${REQUIRED_NUMBER_OF_VALIDATORS}, VALIDATORS: ${VALIDATORS}`)
  bridgeValidatorsHome.options.address = bridgeValidatorsHomeProxy.options.address
  const initializeData = await bridgeValidatorsHome.methods.initialize(
    REQUIRED_NUMBER_OF_VALIDATORS, VALIDATORS, HOME_OWNER_MULTISIG
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
  assert.equal(validatorOwner.toLocaleLowerCase(), HOME_OWNER_MULTISIG.toLocaleLowerCase());
  homeNonce++;


  /*** Deploying HomeBridge ***/
  console.log('\n[Home] deploying homeBridge implementation:')
  const homeBridgeImplementation = await deployContract(HomeBridge, [], {from: DEPLOYMENT_ACCOUNT_ADDRESS, nonce: homeNonce})
  homeNonce++;
  console.log('[Home] HomeBridge Implementation: ', homeBridgeImplementation.options.address)

  console.log('\n[Home] deploying proxy for homeBridge:')
  let homeBridgeProxy = await deployContract(Proxy, [homeBridgeImplementation.options.address], {from: DEPLOYMENT_ACCOUNT_ADDRESS, nonce: homeNonce})
  console.log('[Home] BridgeValidators Proxy: ', homeBridgeProxy.options.address)
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
  const newProxyBridgeOwner = await web3Home.eth.getStorageAt(homeBridgeProxy.options.address, web3Home.utils.toBN(admin_storage_slot))
  assert.equal(newProxyBridgeOwner.toLocaleLowerCase(), HOME_UPGRADEABLE_ADMIN_BRIDGE.toLocaleLowerCase());
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

  console.log('\n***Home Bridge Deployment is complete***\n')

  return {
    bridgeValidatorsAddress: bridgeValidatorsHome.options.address,
    bridgeAddress: homeBridgeImplementation.options.address,
    bridgeDeployedBlockNumber: Web3Utils.hexToNumber(homeBridgeImplementation.deployedBlockNumber)
  }
}

module.exports = deployHome;
