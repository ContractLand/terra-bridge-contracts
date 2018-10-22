const HomeBridge = artifacts.require("HomeBridge.sol");
const UpgradeableProxy = artifacts.require("AdminUpgradeabilityProxy.sol");
const BridgeValidators = artifacts.require("BridgeValidators.sol");
const HomeToken = artifacts.require("HomeToken.sol");

const Web3Utils = require('web3-utils');
const {ERROR_MSG, ZERO_ADDRESS} = require('./helpers/setup');
const {createMessage, sign, signatureToVRS} = require('./helpers/helpers');
const minPerTx = web3.toBigNumber(web3.toWei(0.01, "ether"));
const requireBlockConfirmations = 8;
const gasPrice = Web3Utils.toWei('1', 'gwei');
const oneEther = web3.toBigNumber(web3.toWei(1, "ether"));
const halfEther = web3.toBigNumber(web3.toWei(0.5, "ether"));
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

contract('HomeBridge', async (accounts) => {
  let homeContract, validatorContract, authorities, owner;
  before(async () => {
    validatorContract = await BridgeValidators.new()
    authorities = [accounts[1]];
    owner = accounts[0]
    await validatorContract.initialize(1, authorities, owner, { from: owner })
  })

  describe('#initialize', async() => {
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
    })
    it('sets variables', async () => {
      ZERO_ADDRESS.should.be.equal(await homeContract.validatorContract())
      '0'.should.be.bignumber.equal(await homeContract.deployedAtBlock())
      '0'.should.be.bignumber.equal(await homeContract.dailyLimit(ADDRESS_ZERO))
      '0'.should.be.bignumber.equal(await homeContract.maxPerTx(ADDRESS_ZERO))
      '0'.should.be.bignumber.equal(await homeContract.minPerTx(ADDRESS_ZERO))
      false.should.be.equal(await homeContract.initialized())
      await homeContract.initialize(validatorContract.address, '3', '2', '1', gasPrice, requireBlockConfirmations).should.be.fulfilled;
      true.should.be.equal(await homeContract.initialized())
      validatorContract.address.should.be.equal(await homeContract.validatorContract());
      (await homeContract.deployedAtBlock()).should.be.bignumber.above(0);
      '3'.should.be.bignumber.equal(await homeContract.dailyLimit(ADDRESS_ZERO))
      '2'.should.be.bignumber.equal(await homeContract.maxPerTx(ADDRESS_ZERO))
      '1'.should.be.bignumber.equal(await homeContract.minPerTx(ADDRESS_ZERO))
    })
    it('cant set maxPerTx > dailyLimit', async () => {
      false.should.be.equal(await homeContract.initialized())
      await homeContract.initialize(validatorContract.address, '1', '2', '1', gasPrice, requireBlockConfirmations).should.be.rejectedWith(ERROR_MSG);
      await homeContract.initialize(validatorContract.address, '3', '2', '2', gasPrice, requireBlockConfirmations).should.be.rejectedWith(ERROR_MSG);
      false.should.be.equal(await homeContract.initialized())
    })
    it('can be upgraded via proxy', async () => {
      // Create v1 of bridge using bridge
      const proxyOwner = accounts[1]
      const proxy = await UpgradeableProxy.new(homeContract.address, { from: proxyOwner })
      const originalContract = await HomeBridge.at(proxy.address)
      await originalContract.initialize(validatorContract.address, "3", "2", "1", gasPrice, requireBlockConfirmations).should.be.fulfilled
      // Upgrade to v2
      const homeBridgeNew = await HomeBridge.new()
      await proxy.upgradeTo(homeBridgeNew.address, { from: proxyOwner })
      const upgradedContract = await HomeBridge.at(proxy.address)

      true.should.be.equal(await upgradedContract.initialized());
      validatorContract.address.should.be.equal(await upgradedContract.validatorContract())
      "3".should.be.bignumber.equal(await upgradedContract.dailyLimit(ADDRESS_ZERO))
      "2".should.be.bignumber.equal(await upgradedContract.maxPerTx(ADDRESS_ZERO))
      "1".should.be.bignumber.equal(await upgradedContract.minPerTx(ADDRESS_ZERO))
    })
  })

  describe('#transferTokenToForeign', async () => {
    let homeToken
    let dailyLimit = new web3.BigNumber(3)
    let maxPerTx = new web3.BigNumber(2)
    let minPerTx = new web3.BigNumber(1)
    beforeEach(async () => {
      homeBridge = await HomeBridge.new()
      homeToken = await HomeToken.new('Home Token', 'HTK', 18)
      await homeBridge.initialize(validatorContract.address, dailyLimit, maxPerTx, minPerTx, gasPrice, requireBlockConfirmations)
      await homeBridge.setDailyLimit(homeToken.address, dailyLimit)
      await homeBridge.setMaxPerTx(homeToken.address, maxPerTx)
      await homeBridge.setMinPerTx(homeToken.address, minPerTx)
    })

    it('should not accept un-registered tokens', async() => {
      const owner = accounts[0]
      const user = accounts[1]
      const recipient = accounts[2]
      const amount = 1

      const tokenTransferCall = homeBridge.contract.transferTokenToForeign.getData(homeToken.address, recipient, amount)

      await homeToken.mint(user, amount, {from: owner }).should.be.fulfilled
      await homeToken.transferAndCall(homeBridge.address, amount, tokenTransferCall, {from: user}).should.be.rejectedWith(ERROR_MSG)
    })

    it('should burn token on successful transfer', async () => {
      const owner = accounts[0]
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const transferAmount = 1
      const tokenTransferCall = homeBridge.contract.transferTokenToForeign.getData(homeToken.address, recipient, transferAmount)

      await homeToken.mint(user, transferAmount, {from: owner }).should.be.fulfilled
      const userBalanceBefore = await homeToken.balanceOf(user)
      const bridgeBalanceBefore = await homeToken.balanceOf(homeBridge.address)
      const totalSupplyBefore = await homeToken.totalSupply()

      await homeBridge.registerToken(foreignTokenAddress, homeToken.address).should.be.fulfilled
      await homeToken.transferAndCall(homeBridge.address, transferAmount, tokenTransferCall, {from: user}).should.be.fulfilled

      userBalanceBefore.minus(transferAmount).should.be.bignumber.equal(await homeToken.balanceOf(user))
      bridgeBalanceBefore.should.be.bignumber.equal(await homeToken.balanceOf(homeBridge.address))
      totalSupplyBefore.minus(transferAmount).should.be.bignumber.equal(await homeToken.totalSupply())
    })

    it('should emit transfer event on successful transfer', async () => {
      const owner = accounts[0]
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const transferAmount = 1

      await homeToken.mint(user, transferAmount, {from: owner }).should.be.fulfilled
      await homeToken.transfer(homeBridge.address, transferAmount, {from: user }).should.be.fulfilled
      await homeBridge.registerToken(foreignTokenAddress, homeToken.address).should.be.fulfilled
      const {logs} = await homeBridge.transferTokenToForeign(homeToken.address, recipient, transferAmount, {from: user}).should.be.fulfilled

      logs[0].event.should.be.equal('TransferToForeign')
      logs[0].args.should.be.deep.equal({
        token: foreignTokenAddress,
        recipient,
        value: new web3.BigNumber(transferAmount)
      })
    })

    it('should not allow transfer over maxPerTx', async() => {
      const owner = accounts[0]
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const overMaxPerTx = maxPerTx.plus(1)
      const tokenTransferCall = homeBridge.contract.transferTokenToForeign.getData(homeToken.address, recipient, overMaxPerTx)

      await homeToken.mint(user, overMaxPerTx, {from: owner }).should.be.fulfilled
      await homeBridge.registerToken(foreignTokenAddress, homeToken.address).should.be.fulfilled
      await homeToken.transferAndCall(homeBridge.address, overMaxPerTx, tokenTransferCall, {from: user}).should.be.rejectedWith(ERROR_MSG)
    })

    it('should not allow transfer under minPerTx', async() => {
      const owner = accounts[0]
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const underMinPerTx = minPerTx.minus(1)
      const tokenTransferCall = homeBridge.contract.transferTokenToForeign.getData(homeToken.address, recipient, underMinPerTx)

      await homeToken.mint(user, underMinPerTx, {from: owner }).should.be.fulfilled
      await homeBridge.registerToken(foreignTokenAddress, homeToken.address).should.be.fulfilled
      await homeToken.transferAndCall(homeBridge.address, underMinPerTx, tokenTransferCall, {from: user}).should.be.rejectedWith(ERROR_MSG)
    })

    it('should not allow transfer over dailyLimit', async() => {
      const owner = accounts[0]
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const tokenTransferCall = homeBridge.contract.transferTokenToForeign.getData(homeToken.address, recipient, maxPerTx)

      await homeToken.mint(user, maxPerTx.times(2), {from: owner }).should.be.fulfilled
      await homeBridge.registerToken(foreignTokenAddress, homeToken.address).should.be.fulfilled
      await homeToken.transferAndCall(homeBridge.address, maxPerTx, tokenTransferCall, {from: user}).should.be.fulfilled
      await homeToken.transferAndCall(homeBridge.address, maxPerTx, tokenTransferCall, {from: user}).should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#transferNativeToForeign', async () => {
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
      await homeContract.initialize(validatorContract.address, '3', '2', '1', gasPrice, requireBlockConfirmations)
    })

    it('fails if not from owner', async () => {
      await homeContract.topUp({
        from: accounts[1],
        value: halfEther
      }).should.be.rejectedWith(ERROR_MSG)
    });

    it('can be topped up', async () => {
      const homeBalanceBefore = await web3.eth.getBalance(homeContract.address);
      "0".should.be.bignumber.equal(homeBalanceBefore);
      await homeContract.topUp({
        from: accounts[0],
        value: halfEther
      }).should.be.fulfilled
      const homeBalanceAfter = await web3.eth.getBalance(homeContract.address);
      "500000000000000000".should.be.bignumber.equal(homeBalanceAfter);
    });

    it('should not allow transfer if home native-token is not mapped to a token on foreign', async () => {
      const user = accounts[1]
      const recipient = accounts[2]
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 1
      }).should.be.rejectedWith(ERROR_MSG)
    })

    it('should accept home native-token', async () => {
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignNativeAddress = '0x2222222222222222222222222222222222222222'
      await homeContract.registerToken(foreignNativeAddress, ADDRESS_ZERO).should.be.fulfilled

      const currentDay = await homeContract.getCurrentDay()
      '0'.should.be.bignumber.equal(await homeContract.totalSpentPerDay(ADDRESS_ZERO, currentDay))
      const {logs} = await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 1
      }).should.be.fulfilled
      '1'.should.be.bignumber.equal(await homeContract.totalSpentPerDay(ADDRESS_ZERO, currentDay))
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 3
      }).should.be.rejectedWith(ERROR_MSG);
      logs[0].event.should.be.equal('TransferToForeign')
      logs[0].args.should.be.deep.equal({
        token: foreignNativeAddress,
        recipient: recipient,
        value: new web3.BigNumber(1)
      })
      await homeContract.setDailyLimit(ADDRESS_ZERO, 4).should.be.fulfilled;
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 1
      }).should.be.fulfilled
      '2'.should.be.bignumber.equal(await homeContract.totalSpentPerDay(ADDRESS_ZERO, currentDay))
    })

    it('doesnt let you send more than max amount per tx', async () => {
      const user = accounts[1]
      const recipient = accounts[2]
      const foreignNativeAddress = '0x2222222222222222222222222222222222222222'
      await homeContract.registerToken(foreignNativeAddress, ADDRESS_ZERO).should.be.fulfilled

      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 1
      }).should.be.fulfilled
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 3
      }).should.be.rejectedWith(ERROR_MSG)
      await homeContract.setMaxPerTx(ADDRESS_ZERO, 100).should.be.rejectedWith(ERROR_MSG);
      await homeContract.setDailyLimit(ADDRESS_ZERO, 100).should.be.fulfilled;
      await homeContract.setMaxPerTx(ADDRESS_ZERO, 99).should.be.fulfilled;
      //meets max per tx and daily limit
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 99
      }).should.be.fulfilled
      //above daily limit
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: 1
      }).should.be.rejectedWith(ERROR_MSG)

    })

    it('should not let to transfer less than minPerTx', async () => {
      const user = accounts[1]
      const recipient = accounts[2]
      const newDailyLimit = 100;
      const newMaxPerTx = 50;
      const newMinPerTx = 20;
      const foreignNativeAddress = '0x2222222222222222222222222222222222222222'
      await homeContract.registerToken(foreignNativeAddress, ADDRESS_ZERO).should.be.fulfilled

      await homeContract.setDailyLimit(ADDRESS_ZERO, newDailyLimit).should.be.fulfilled;
      await homeContract.setMaxPerTx(ADDRESS_ZERO, newMaxPerTx).should.be.fulfilled;
      await homeContract.setMinPerTx(ADDRESS_ZERO, newMinPerTx).should.be.fulfilled;

      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: newMinPerTx
      }).should.be.fulfilled
      await homeContract.transferNativeToForeign(recipient, {
        from: user,
        value: newMinPerTx - 1
      }).should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#settings', async () => {
    let homeContract;
    beforeEach(async () => {
      homeContract = await HomeBridge.new()
      await homeContract.initialize(validatorContract.address, '3', '2', '1', gasPrice, requireBlockConfirmations)
    })
    it('#setMaxPerTx allows to set only to owner and cannot be more than daily limit', async () => {
      await homeContract.setMaxPerTx(ADDRESS_ZERO, 2, {from: authorities[0]}).should.be.rejectedWith(ERROR_MSG);
      await homeContract.setMaxPerTx(ADDRESS_ZERO, 2, {from: owner}).should.be.fulfilled;

      await homeContract.setMaxPerTx(ADDRESS_ZERO, 3, {from: owner}).should.be.rejectedWith(ERROR_MSG);
    })

    it('#setMinPerTx allows to set only to owner and cannot be more than daily limit and should be less than maxPerTx', async () => {
      await homeContract.setMinPerTx(ADDRESS_ZERO, 1, {from: authorities[0]}).should.be.rejectedWith(ERROR_MSG);
      await homeContract.setMinPerTx(ADDRESS_ZERO, 1, {from: owner}).should.be.fulfilled;

      await homeContract.setMinPerTx(ADDRESS_ZERO, 2, {from: owner}).should.be.rejectedWith(ERROR_MSG);
    })

    it('#registerToken can only be called by owner, cannot override existing mapping', async () => {
      const homeTokenAddress = '0x1111111111111111111111111111111111111111'
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'

      await homeContract.registerToken(foreignTokenAddress, homeTokenAddress, { from: authorities[0] }).should.be.rejectedWith(ERROR_MSG)
      await homeContract.registerToken(foreignTokenAddress, homeTokenAddress, { from: owner }).should.be.fulfilled
      await homeContract.registerToken(foreignTokenAddress, homeTokenAddress, { from: owner }).should.be.rejectedWith(ERROR_MSG)
    })
  })

  describe('#transferFromForeign', async () => {
    let homeBridge;
    beforeEach(async () => {
      homeBridge = await HomeBridge.new();
      await homeBridge.initialize(validatorContract.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
    })

    it('should not transfer token not registered in bridge', async () => {
      const unregisteredToken = '0x1111111111111111111111111111111111111111'
      const recipient = accounts[5]
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";

      await homeBridge.transferFromForeign(unregisteredToken, recipient, halfEther, transactionHash, {from: authorities[0]}).should.be.rejectedWith(ERROR_MSG);
    })

    it('should allow validator to transferFromForeign token via minting', async () => {
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const homeToken = await HomeToken.new("Home Token", "HTK", 18);
      const recipient = accounts[5]
      const value = halfEther
      const balanceBefore = await homeToken.balanceOf(recipient)
      const tokenSupplyBefore = await homeToken.totalSupply()
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";

      await homeToken.transferOwnership(homeBridge.address)
      await homeBridge.registerToken(foreignTokenAddress, homeToken.address)
      const {logs} = await homeBridge.transferFromForeign(foreignTokenAddress, recipient, value, transactionHash, {from: authorities[0]}).should.be.fulfilled

      logs[0].event.should.be.equal("SignedForTransferFromForeign");
      logs[0].args.should.be.deep.equal({
        signer: authorities[0],
        transactionHash
      });
      logs[1].event.should.be.equal("TransferFromForeign");
      logs[1].args.should.be.deep.equal({
        token: homeToken.address,
        recipient,
        value,
        transactionHash
      })

      const balanceAfter = await homeToken.balanceOf(recipient)
      const totalSupplyAfter = await homeToken.totalSupply()
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      totalSupplyAfter.should.be.bignumber.equal(tokenSupplyBefore.add(value))
    })

    it('should allow validator to transferFromForeign native token via trafer', async () => {
      const foreignTokenAddress = '0x2222222222222222222222222222222222222222'
      const recipient = accounts[5]
      const value = halfEther
      const balanceBefore = await web3.eth.getBalance(recipient)
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";

      const homeTokenMapping = ADDRESS_ZERO
      await homeBridge.registerToken(foreignTokenAddress, homeTokenMapping).should.be.fulfilled
      await homeBridge.transferNativeToForeign(accounts[2], {
        from: accounts[2],
        value: halfEther
      }).should.be.fulfilled

      const {logs} = await homeBridge.transferFromForeign(foreignTokenAddress, recipient, value, transactionHash, {from: authorities[0]})
      logs[0].event.should.be.equal("SignedForTransferFromForeign");
      logs[0].args.should.be.deep.equal({
        signer: authorities[0],
        transactionHash
      });
      logs[1].event.should.be.equal("TransferFromForeign");
      logs[1].args.should.be.deep.equal({
        token: homeTokenMapping,
        recipient,
        value,
        transactionHash
      })
      const homeBalanceAfter = await web3.eth.getBalance(homeBridge.address)
      const balanceAfter = await web3.eth.getBalance(recipient)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      homeBalanceAfter.should.be.bignumber.equal(0)

      const msgHash = Web3Utils.soliditySha3(homeTokenMapping, recipient, value, transactionHash);
      const senderHash = Web3Utils.soliditySha3(authorities[0], msgHash)
      true.should.be.equal(await homeBridge.transfersSigned(senderHash))
    })

    it('test with 2 signatures required', async () => {
      let validatorContractWith2Signatures = await BridgeValidators.new()
      let authoritiesTwoAccs = [accounts[1], accounts[2], accounts[3]];
      let ownerOfValidators = accounts[0]
      await validatorContractWith2Signatures.initialize(2, authoritiesTwoAccs, ownerOfValidators, { from: ownerOfValidators} )
      let homeBridgeWithTwoSigs = await HomeBridge.new();
      await homeBridgeWithTwoSigs.initialize(validatorContractWith2Signatures.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
      const foreignNativeAddress = '0x2222222222222222222222222222222222222222'
      await homeBridgeWithTwoSigs.registerToken(foreignNativeAddress, ADDRESS_ZERO).should.be.fulfilled

      await homeBridgeWithTwoSigs.transferNativeToForeign(accounts[2], {
        from: accounts[2],
        value: halfEther
      }).should.be.fulfilled
      const homeBalanceBefore = await web3.eth.getBalance(homeBridgeWithTwoSigs.address)
      homeBalanceBefore.should.be.bignumber.equal(halfEther)

      const token = ADDRESS_ZERO
      const recipient = accounts[5];
      const value = halfEther;
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";
      const balanceBefore = await web3.eth.getBalance(recipient)
      const msgHash = Web3Utils.soliditySha3(token, recipient, value, transactionHash);

      const {logs} = await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[0]}).should.be.fulfilled;
      logs[0].event.should.be.equal("SignedForTransferFromForeign");
      logs[0].args.should.be.deep.equal({
        signer: authorities[0],
        transactionHash
      });
      halfEther.should.be.bignumber.equal(await web3.eth.getBalance(homeBridgeWithTwoSigs.address))
      const notProcessed = await homeBridgeWithTwoSigs.numTransfersSigned(msgHash);
      notProcessed.should.be.bignumber.equal(1);

      await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[0]}).should.be.rejectedWith(ERROR_MSG);
      const secondSignature = await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[1]}).should.be.fulfilled;

      const balanceAfter = await web3.eth.getBalance(recipient)
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      '0'.should.be.bignumber.equal(await web3.eth.getBalance(homeBridgeWithTwoSigs.address))

      secondSignature.logs[1].event.should.be.equal("TransferFromForeign");
      secondSignature.logs[1].args.should.be.deep.equal({
        token,
        recipient,
        value,
        transactionHash
      })

      const senderHash = Web3Utils.soliditySha3(authoritiesTwoAccs[0], msgHash)
      true.should.be.equal(await homeBridgeWithTwoSigs.transfersSigned(senderHash))

      const senderHash2 = Web3Utils.soliditySha3(authoritiesTwoAccs[1], msgHash);
      true.should.be.equal(await homeBridgeWithTwoSigs.transfersSigned(senderHash2))

      const markedAsProcessed = await homeBridgeWithTwoSigs.numTransfersSigned(msgHash);
      const processed = new web3.BigNumber(2).pow(255).add(2);
      markedAsProcessed.should.be.bignumber.equal(processed)
    })

    it('should not allow to double submit', async () => {
      const token = '0x2222222222222222222222222222222222222222'
      const recipient = accounts[5];
      const value = '1';
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";
      await homeBridge.registerToken(token, ADDRESS_ZERO).should.be.fulfilled
      await homeBridge.transferNativeToForeign(recipient, {
        from: recipient,
        value: minPerTx
      }).should.be.fulfilled
      await homeBridge.transferFromForeign(token, recipient, value, transactionHash, {from: authorities[0]}).should.be.fulfilled;
      await homeBridge.transferFromForeign(token, recipient, value, transactionHash, {from: authorities[0]}).should.be.rejectedWith(ERROR_MSG);
    })

    it('should not allow non-authorities to execute transferFromForeign', async () => {
      const token = ADDRESS_ZERO
      const recipient = accounts[5];
      const value = oneEther;
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";
      await homeBridge.transferFromForeign(token, recipient, value, transactionHash, {from: accounts[7]}).should.be.rejectedWith(ERROR_MSG);
    })

    it('doesnt allow to transferFromForeign if requiredSignatures has changed', async () => {
      let validatorContractWith2Signatures = await BridgeValidators.new()
      let authoritiesTwoAccs = [accounts[1], accounts[2], accounts[3]];
      let ownerOfValidators = accounts[0]
      await validatorContractWith2Signatures.initialize(2, authoritiesTwoAccs, ownerOfValidators, { from: ownerOfValidators })
      let homeBridgeWithTwoSigs = await HomeBridge.new();
      await homeBridgeWithTwoSigs.initialize(validatorContractWith2Signatures.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
      const foreignNativeAddress = '0x2222222222222222222222222222222222222222'
      await homeBridgeWithTwoSigs.registerToken(foreignNativeAddress, ADDRESS_ZERO).should.be.fulfilled

      await homeBridgeWithTwoSigs.transferNativeToForeign(accounts[2], {
        from: accounts[2],
        value: halfEther
      }).should.be.fulfilled
      const homeBalanceBefore = await web3.eth.getBalance(homeBridgeWithTwoSigs.address)
      homeBalanceBefore.should.be.bignumber.equal(halfEther)

      const token = ADDRESS_ZERO
      const recipient = accounts[5];
      const value = halfEther.div(2);
      const transactionHash = "0x806335163828a8eda675cff9c84fa6e6c7cf06bb44cc6ec832e42fe789d01415";
      const balanceBefore = await web3.eth.getBalance(recipient)

      await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[0]}).should.be.fulfilled;
      await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[1]}).should.be.fulfilled;
      balanceBefore.add(value).should.be.bignumber.equal(await web3.eth.getBalance(recipient))
      await validatorContractWith2Signatures.setRequiredSignatures(3).should.be.fulfilled;
      await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[2]}).should.be.rejectedWith(ERROR_MSG);
      await validatorContractWith2Signatures.setRequiredSignatures(1).should.be.fulfilled;
      await homeBridgeWithTwoSigs.transferFromForeign(foreignNativeAddress, recipient, value, transactionHash, {from: authoritiesTwoAccs[2]}).should.be.rejectedWith(ERROR_MSG);
      balanceBefore.add(value).should.be.bignumber.equal(await web3.eth.getBalance(recipient))

    })
  })
  describe('#isAlreadyProcessed', async () => {
    it('returns ', async () => {
      homeBridge = await HomeBridge.new();
      const bn = new web3.BigNumber(2).pow(255);
      const processedNumbers = [bn.add(1).toString(10), bn.add(100).toString(10)];
      true.should.be.equal(await homeBridge.isAlreadyProcessed(processedNumbers[0]));
      true.should.be.equal(await homeBridge.isAlreadyProcessed(processedNumbers[1]));
      false.should.be.equal(await homeBridge.isAlreadyProcessed(10));
    })
  })

  describe('#submitSignature', async () => {
    let validatorContractWith2Signatures,authoritiesTwoAccs,ownerOfValidators, someTokenAddress,homeBridgeWithTwoSigs
    beforeEach(async () => {
      validatorContractWith2Signatures = await BridgeValidators.new()
      authoritiesTwoAccs = [accounts[1], accounts[2], accounts[3]];
      ownerOfValidators = accounts[0]
      someTokenAddress = '0x1d1d4e623d10f9fba5db95830f7d3839406c6af2'
      await validatorContractWith2Signatures.initialize(2, authoritiesTwoAccs, ownerOfValidators, { from: ownerOfValidators })
      homeBridgeWithTwoSigs = await HomeBridge.new();
      await homeBridgeWithTwoSigs.initialize(validatorContractWith2Signatures.address, oneEther, halfEther, minPerTx, gasPrice, requireBlockConfirmations);
    })
    it('allows a validator to submit a signature', async () => {
      var recipientAccount = accounts[8]
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
      var message = createMessage(someTokenAddress, recipientAccount, value, transactionHash);
      var signature = await sign(authoritiesTwoAccs[0], message)
      const {logs} = await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authorities[0]}).should.be.fulfilled;
      logs[0].event.should.be.equal('SignedForTransferToForeign')
      const msgHashFromLog = logs[0].args.messageHash
      const signatureFromContract = await homeBridgeWithTwoSigs.signature(msgHashFromLog, 0);
      const messageFromContract = await homeBridgeWithTwoSigs.message(msgHashFromLog);
      signatureFromContract.should.be.equal(signature);
      messageFromContract.should.be.equal(message);
      const hashMsg = Web3Utils.soliditySha3(message);
      const hashSenderMsg = Web3Utils.soliditySha3(authorities[0], hashMsg)
      true.should.be.equal(await homeBridgeWithTwoSigs.messagesSigned(hashSenderMsg));
    })
    it('when enough requiredSignatures are collected, CollectedSignatures event is emitted', async () => {
      var recipientAccount = accounts[8]
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      var homeGasPrice = web3.toBigNumber(0);
      var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
      var message = createMessage(someTokenAddress, recipientAccount, value, transactionHash, homeGasPrice);
      var signature = await sign(authoritiesTwoAccs[0], message)
      var signature2 = await sign(authoritiesTwoAccs[1], message)
      '2'.should.be.bignumber.equal(await validatorContractWith2Signatures.requiredSignatures());
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[0]}).should.be.fulfilled;
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[0]}).should.be.rejectedWith(ERROR_MSG);
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[1]}).should.be.rejectedWith(ERROR_MSG);
      const {logs} = await homeBridgeWithTwoSigs.submitSignature(signature2, message, {from: authoritiesTwoAccs[1]}).should.be.fulfilled;
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesTwoAccs[1])
    })
    it('attack when increasing requiredSignatures', async () => {
      var recipientAccount = accounts[8]
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      var homeGasPrice = web3.toBigNumber(0);
      var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
      var message = createMessage(someTokenAddress, recipientAccount, value, transactionHash, homeGasPrice);
      var signature = await sign(authoritiesTwoAccs[0], message)
      var signature2 = await sign(authoritiesTwoAccs[1], message)
      var signature3 = await sign(authoritiesTwoAccs[2], message)
      '2'.should.be.bignumber.equal(await validatorContractWith2Signatures.requiredSignatures());
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[0]}).should.be.fulfilled;
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[0]}).should.be.rejectedWith(ERROR_MSG);
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[1]}).should.be.rejectedWith(ERROR_MSG);
      const {logs} = await homeBridgeWithTwoSigs.submitSignature(signature2, message, {from: authoritiesTwoAccs[1]}).should.be.fulfilled;
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesTwoAccs[1])
      await validatorContractWith2Signatures.setRequiredSignatures(3).should.be.fulfilled;
      '3'.should.be.bignumber.equal(await validatorContractWith2Signatures.requiredSignatures());
      const attackerTx = await homeBridgeWithTwoSigs.submitSignature(signature3, message, {from: authoritiesTwoAccs[2]}).should.be.rejectedWith(ERROR_MSG);
    })
    it('attack when decreasing requiredSignatures', async () => {
      var recipientAccount = accounts[8]
      var value = web3.toBigNumber(web3.toWei(0.5, "ether"));
      var homeGasPrice = web3.toBigNumber(0);
      var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
      var message = createMessage(someTokenAddress, recipientAccount, value, transactionHash, homeGasPrice);
      var signature = await sign(authoritiesTwoAccs[0], message)
      var signature2 = await sign(authoritiesTwoAccs[1], message)
      var signature3 = await sign(authoritiesTwoAccs[2], message)
      '2'.should.be.bignumber.equal(await validatorContractWith2Signatures.requiredSignatures());
      await homeBridgeWithTwoSigs.submitSignature(signature, message, {from: authoritiesTwoAccs[0]}).should.be.fulfilled;
      await validatorContractWith2Signatures.setRequiredSignatures(1).should.be.fulfilled;
      '1'.should.be.bignumber.equal(await validatorContractWith2Signatures.requiredSignatures());
      const {logs} = await homeBridgeWithTwoSigs.submitSignature(signature2, message, {from: authoritiesTwoAccs[1]}).should.be.fulfilled;
      logs.length.should.be.equal(2)
      logs[1].event.should.be.equal('CollectedSignatures')
      logs[1].args.authorityResponsibleForRelay.should.be.equal(authoritiesTwoAccs[1])
    })
  })
})
