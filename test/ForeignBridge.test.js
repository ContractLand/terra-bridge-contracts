const ForeignBridge = artifacts.require("ForeignBridge.sol");
const BridgeValidators = artifacts.require("BridgeValidators.sol");
const UpgradeableProxy = artifacts.require("AdminUpgradeabilityProxy.sol");
const StandardERC20Token = artifacts.require("StandardERC20Token.sol");

const {ERROR_MSG, ZERO_ADDRESS, ERROR_MSG_OPCODE} = require('./helpers/setup');
const {createMessage, sign, signatureToVRS, strip0x} = require('./helpers/helpers');
const oneEther = web3.toBigNumber(web3.toWei(1, "ether"));
const halfEther = web3.toBigNumber(web3.toWei(0.5, "ether"));
const minPerTx = web3.toBigNumber(web3.toWei(0.01, "ether"));
const Web3Utils = require('web3-utils');
const requireBlockConfirmations = 8;
const gasPrice = Web3Utils.toWei('1', 'gwei');
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

const getEvents = function(contract, filter) {
  return new Promise((resolve, reject) => {
      var event = contract[filter.event]();
      event.watch();
      event.get((error, logs) => {
        if(logs.length > 0){
          resolve(logs);
        } else {
          throw Error("Failed to find filtered event for " + filter.event);
        }
      });
      event.stopWatching();
  });
}

contract('ForeignBridge', async (accounts) => {
  let homeContract, validatorContract, authorities, owner, erc20token;
  before(async () => {
    validatorContract = await BridgeValidators.new()
    authorities = [accounts[1], accounts[2]];
    owner = accounts[0]
    await validatorContract.initialize(1, authorities, owner, { from: owner })
  })

  describe('#initialize', async () => {
    it('should initialize', async () => {
      let foreignBridge =  await ForeignBridge.new();

      ZERO_ADDRESS.should.be.equal(await foreignBridge.validatorContract())
      '0'.should.be.bignumber.equal(await foreignBridge.deployedAtBlock())
      '0'.should.be.bignumber.equal(await foreignBridge.dailyLimit())
      '0'.should.be.bignumber.equal(await foreignBridge.maxPerTx())
      false.should.be.equal(await foreignBridge.initialized())
      await foreignBridge.initialize(validatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);

      true.should.be.equal(await foreignBridge.initialized())
      validatorContract.address.should.be.equal(await foreignBridge.validatorContract());
      (await foreignBridge.deployedAtBlock()).should.be.bignumber.above(0);
      oneEther.should.be.bignumber.equal(await foreignBridge.dailyLimit())
      halfEther.should.be.bignumber.equal(await foreignBridge.maxPerTx())
      minPerTx.should.be.bignumber.equal(await foreignBridge.minPerTx())
    })
  })

  describe('#deposit', async () => {
    beforeEach(async () => {
      foreignBridge = await ForeignBridge.new()
      erc20token = await StandardERC20Token.new('Test', 'TST', web3.toWei(1, "ether"));
      const oneEther = web3.toBigNumber(web3.toWei(1, "ether"));
      const halfEther = web3.toBigNumber(web3.toWei(0.5, "ether"));
      await foreignBridge.initialize(validatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
      oneEther.should.be.bignumber.equal(await foreignBridge.dailyLimit());
    })

    it('should allow deposit of ether', async () => {
      var recipientAccount = accounts[3];
      const balanceBefore = await web3.eth.getBalance(recipientAccount)
      var value = web3.toBigNumber(web3.toWei(0.25, "ether"));
      var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
      var message = createMessage(ADDRESS_ZERO, recipientAccount, value, transactionHash);
      var signature = await sign(authorities[0], message)
      var vrs = signatureToVRS(signature);

      // Pre-fund the bridge with some ether
      await web3.eth.sendTransaction({from:accounts[0], to:foreignBridge.address, value: value})

      false.should.be.equal(await foreignBridge.deposits(transactionHash))
      const {logs} = await foreignBridge.deposit([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      logs[0].event.should.be.equal("Deposit")
      logs[0].args.token.should.be.equal(ADDRESS_ZERO)
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)
      logs[0].args.transactionHash.should.be.equal(transactionHash);

      const balanceAfter = await web3.eth.getBalance(recipientAccount);
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      true.should.be.equal(await foreignBridge.deposits(transactionHash))
    })

    it('should allow deposit of token', async () => {
      var recipientAccount = accounts[3];
      const balanceBefore = await erc20token.balanceOf(recipientAccount)
      var value = web3.toBigNumber(web3.toWei(0.25, "ether"));
      await erc20token.transfer(foreignBridge.address, value)
      var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
      var message = createMessage(erc20token.address, recipientAccount, value, transactionHash);
      var signature = await sign(authorities[0], message)
      var vrs = signatureToVRS(signature);
      false.should.be.equal(await foreignBridge.deposits(transactionHash))
      const {logs} = await foreignBridge.deposit([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      logs[0].event.should.be.equal("Deposit")
      logs[0].args.token.should.be.equal(erc20token.address)
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)
      logs[0].args.transactionHash.should.be.equal(transactionHash);

      const balanceAfter = await erc20token.balanceOf(recipientAccount);
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      true.should.be.equal(await foreignBridge.deposits(transactionHash))
    })

    it('should allow second deposit with different transactionHash but same recipient and value', async ()=> {
      var recipientAccount = accounts[3];
      const balanceBefore = await erc20token.balanceOf(recipientAccount)
      var value = web3.toBigNumber(web3.toWei(0.25, "ether"));
      await erc20token.transfer(foreignBridge.address, value.mul(2))
      // tx 1
      var transactionHash = "0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121";
      var message = createMessage(erc20token.address, recipientAccount, value, transactionHash);
      var signature = await sign(authorities[0], message)
      var vrs = signatureToVRS(signature);
      false.should.be.equal(await foreignBridge.deposits(transactionHash))
      await foreignBridge.deposit([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      // tx 2
      var transactionHash2 = "0x77a496628a776a03d58d7e6059a5937f04bebd8ba4ff89f76dd4bb8ba7e291ee";
      var message2 = createMessage(erc20token.address, recipientAccount, value, transactionHash2);
      var signature2 = await sign(authorities[0], message2)
      var vrs2 = signatureToVRS(signature2);
      false.should.be.equal(await foreignBridge.deposits(transactionHash2))
      const {logs} = await foreignBridge.deposit([vrs2.v], [vrs2.r], [vrs2.s], message2).should.be.fulfilled

      logs[0].event.should.be.equal("Deposit")
      logs[0].args.token.should.be.equal(erc20token.address)
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)
      logs[0].args.transactionHash.should.be.equal(transactionHash2);
      const balanceAfter = await erc20token.balanceOf(recipientAccount)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value.mul(2)))
      true.should.be.equal(await foreignBridge.deposits(transactionHash))
      true.should.be.equal(await foreignBridge.deposits(transactionHash2))
    })

    it('should not allow second deposit (replay attack) with same transactionHash but different recipient', async () => {
      var recipientAccount = accounts[3];
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      await erc20token.transfer(foreignBridge.address, value.mul(2))
      // tx 1
      var transactionHash = "0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121";
      var message = createMessage(erc20token.address, recipientAccount, value, transactionHash);
      var signature = await sign(authorities[0], message)
      var vrs = signatureToVRS(signature);
      false.should.be.equal(await foreignBridge.deposits(transactionHash))
      await foreignBridge.deposit([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      // tx 2
      var message2 = createMessage(erc20token.address, accounts[4], value, transactionHash);
      var signature2 = await sign(authorities[0], message2)
      var vrs = signatureToVRS(signature2);
      true.should.be.equal(await foreignBridge.deposits(transactionHash))
      await foreignBridge.deposit([vrs.v], [vrs.r], [vrs.s], message2).should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#deposit with 2 minimum signatures', async () => {
    let multisigValidatorContract, twoAuthorities, ownerOfValidatorContract, foreignBridgeWithMultiSignatures
    beforeEach(async () => {
      multisigValidatorContract = await BridgeValidators.new()
      erc20token = await StandardERC20Token.new('Test', 'TST', web3.toWei(1, "ether"));
      twoAuthorities = [accounts[0], accounts[1]];
      ownerOfValidatorContract = accounts[3]
      const halfEther = web3.toBigNumber(web3.toWei(0.5, "ether"));
      await multisigValidatorContract.initialize(2, twoAuthorities, ownerOfValidatorContract, {from: ownerOfValidatorContract})
      foreignBridgeWithMultiSignatures = await ForeignBridge.new()
      const oneEther = web3.toBigNumber(web3.toWei(1, "ether"));
      await foreignBridgeWithMultiSignatures.initialize(multisigValidatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations, {from: ownerOfValidatorContract});
    })

    it('deposit should fail if not enough signatures are provided', async () => {
      var recipientAccount = accounts[4];
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      await erc20token.transfer(foreignBridgeWithMultiSignatures.address, value)
      // msg 1
      var transactionHash = "0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121";
      var message = createMessage(erc20token.address, recipientAccount, value, transactionHash);
      var signature = await sign(twoAuthorities[0], message)
      var vrs = signatureToVRS(signature);
      false.should.be.equal(await foreignBridgeWithMultiSignatures.deposits(transactionHash))
      await foreignBridgeWithMultiSignatures.deposit([vrs.v], [vrs.r], [vrs.s], message).should.be.rejectedWith(ERROR_MSG)
      // msg 2
      var signature2 = await sign(twoAuthorities[1], message)
      var vrs2 = signatureToVRS(signature2);
      const {logs} = await foreignBridgeWithMultiSignatures.deposit([vrs.v, vrs2.v], [vrs.r, vrs2.r], [vrs.s, vrs2.s], message).should.be.fulfilled;

      logs[0].event.should.be.equal("Deposit")
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)
      logs[0].args.transactionHash.should.be.equal(transactionHash);
      true.should.be.equal(await foreignBridgeWithMultiSignatures.deposits(transactionHash))
    })

    it('deposit should fail if duplicate signature is provided', async () => {
      var recipientAccount = accounts[4];
      // msg 1
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      var transactionHash = "0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121";
      var message = createMessage(erc20token.address, recipientAccount, value, transactionHash);
      var signature = await sign(twoAuthorities[0], message)
      var vrs = signatureToVRS(signature);
      false.should.be.equal(await foreignBridgeWithMultiSignatures.deposits(transactionHash))
      await foreignBridgeWithMultiSignatures.deposit([vrs.v, vrs.v], [vrs.r, vrs.r], [vrs.s, vrs.s], message).should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#onTokenTransfer', async () => {
    beforeEach(async () => {
      user = accounts[4]
      erc20token = await StandardERC20Token.new('Test', 'TST', web3.toWei(10, "ether"));
      foreignBridge = await ForeignBridge.new();
      await foreignBridge.initialize(validatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
    })

    it('should not allow transfer if user does not give allowance', async () => {
      await foreignBridge.onTokenTransfer(erc20token.address, user, halfEther, '0x00', {from: user}).should.be.rejectedWith(ERROR_MSG);
    })

    it('should only allow user to transfer tokens for themselves', async ()=> {
      await erc20token.transfer(user, halfEther)
      await erc20token.approve(foreignBridge.address, halfEther, {from: user})
      await foreignBridge.onTokenTransfer(erc20token.address, user, halfEther, '0x00', {from: owner}).should.be.rejectedWith(ERROR_MSG);
      await foreignBridge.onTokenTransfer(erc20token.address, user, halfEther, '0x00', {from: user}).should.be.fulfilled;
      '0'.should.be.bignumber.equal(await erc20token.balanceOf(user));
      const events = await getEvents(foreignBridge, {event: 'Withdraw'});
      events[0].args.should.be.deep.equal({
        token: erc20token.address,
        recipient: user,
        value: halfEther
      })
    })

    it('should only let to send within maxPerTx limit', async () => {
      const valueMoreThanLimit = halfEther.add(1);
      await erc20token.transfer(user, oneEther.add(1))
      await erc20token.approve(foreignBridge.address, oneEther.add(1), {from: user})

      // over maxPerTx
      await foreignBridge.onTokenTransfer(erc20token.address, user, valueMoreThanLimit, '0x00', {from: user}).should.be.rejectedWith(ERROR_MSG);
      oneEther.add(1).should.be.bignumber.equal(await erc20token.balanceOf(user));

      // within maxPerTx
      await foreignBridge.onTokenTransfer(erc20token.address, user, halfEther, '0x00', {from: user}).should.be.fulfilled
      halfEther.add(1).should.be.bignumber.equal(await erc20token.balanceOf(user));

      // within maxPerTx
      await foreignBridge.onTokenTransfer(erc20token.address, user, halfEther, '0x00', {from: user}).should.be.fulfilled
      '1'.should.be.bignumber.equal(await erc20token.balanceOf(user));

      // maxPerTx full
      await foreignBridge.onTokenTransfer(erc20token.address, user, '1', '0x00', {from: user}).should.be.rejectedWith(ERROR_MSG);
    })

    it('should not let to withdraw less than minPerTx', async () => {
      const valueLessThanMinPerTx = minPerTx.sub(1);
      await erc20token.transfer(user, oneEther)
      await erc20token.approve(foreignBridge.address, oneEther, {from: user})

      // under minPerTx
      await foreignBridge.onTokenTransfer(erc20token.address, user, valueLessThanMinPerTx, '0x00', {from: user}).should.be.rejectedWith(ERROR_MSG);
      oneEther.should.be.bignumber.equal(await erc20token.balanceOf(user));

      // equal to minPerTx
      await foreignBridge.onTokenTransfer(erc20token.address, user, minPerTx, '0x00', {from: user}).should.be.fulfilled;
      oneEther.sub(minPerTx).should.be.bignumber.equal(await erc20token.balanceOf(user));
    })
  })

  describe('#setting limits', async () => {
    beforeEach(async () => {
      erc20token = await StandardERC20Token.new('Test', 'TST', web3.toWei(1, "ether"));
      foreignBridge = await ForeignBridge.new();
      await foreignBridge.initialize(validatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
    })

    it('#setMaxPerTx allows to set only to owner and cannot be more than daily limit', async () => {
      await foreignBridge.setMaxPerTx(halfEther, {from: authorities[0]}).should.be.rejectedWith(ERROR_MSG);
      await foreignBridge.setMaxPerTx(halfEther, {from: owner}).should.be.fulfilled;

      await foreignBridge.setMaxPerTx(oneEther, {from: owner}).should.be.rejectedWith(ERROR_MSG);
    })

    it('#setMinPerTx allows to set only to owner and cannot be more than daily limit and should be less than maxPerTx', async () => {
      await foreignBridge.setMinPerTx(minPerTx, {from: authorities[0]}).should.be.rejectedWith(ERROR_MSG);
      await foreignBridge.setMinPerTx(minPerTx, {from: owner}).should.be.fulfilled;

      await foreignBridge.setMinPerTx(oneEther, {from: owner}).should.be.rejectedWith(ERROR_MSG);
    })
  })

  describe('#upgradeable', async () => {
    it('can be deployed via upgradeToAndCall', async () => {
      const fakeValidatorsAddress = accounts[6]
      const FOREIGN_DAILY_LIMIT = oneEther;
      const FOREIGN_MAX_AMOUNT_PER_TX = halfEther;
      const FOREIGN_MIN_AMOUNT_PER_TX = minPerTx;

      // Create v1 of bridge using bridge
      const foreignBridge =  await ForeignBridge.new();
      const proxyOwner = accounts[1]
      const proxy = await UpgradeableProxy.new(foreignBridge.address, { from: proxyOwner })
      const originalContract = await ForeignBridge.at(proxy.address)
      await originalContract.initialize(fakeValidatorsAddress, FOREIGN_DAILY_LIMIT, FOREIGN_MAX_AMOUNT_PER_TX, FOREIGN_MIN_AMOUNT_PER_TX, gasPrice, requireBlockConfirmations).should.be.fulfilled

      // Upgrade to v2
      const foreignBridgeNew = await ForeignBridge.new()
      await proxy.upgradeTo(foreignBridgeNew.address, { from: proxyOwner })
      const upgradedContract = await ForeignBridge.at(proxy.address)

      true.should.be.equal(await upgradedContract.initialized());
      fakeValidatorsAddress.should.be.equal(await upgradedContract.validatorContract())
      FOREIGN_DAILY_LIMIT.should.be.bignumber.equal(await upgradedContract.dailyLimit())
      FOREIGN_MAX_AMOUNT_PER_TX.should.be.bignumber.equal(await upgradedContract.maxPerTx())
      FOREIGN_MIN_AMOUNT_PER_TX.should.be.bignumber.equal(await upgradedContract.minPerTx())
    })
  })

  describe('#claimTokens', async () => {
    it('can claim erc20', async () => {
      const owner = accounts[0];
      foreignBridge = await ForeignBridge.new();
      await foreignBridge.initialize(validatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);

      let token = await StandardERC20Token.new('Test', 'TST', halfEther);

      await token.transfer(foreignBridge.address, halfEther);
      '0'.should.be.bignumber.equal(await token.balanceOf(owner))
      halfEther.should.be.bignumber.equal(await token.balanceOf(foreignBridge.address))

      await foreignBridge.claimTokens(token.address, accounts[3], {from: owner}).should.be.fulfilled;
      '0'.should.be.bignumber.equal(await token.balanceOf(foreignBridge.address))
      halfEther.should.be.bignumber.equal(await token.balanceOf(accounts[3]))
    })
  })
})
