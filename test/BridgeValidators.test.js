const BridgeValidators = artifacts.require("BridgeValidators.sol");
const UpgradeableProxy = artifacts.require("AdminUpgradeabilityProxy.sol");
const {ERROR_MSG, ERROR_MSG_OPCODE, ZERO_ADDRESS} = require('./helpers/setup');

contract('BridgeValidators', async (accounts) => {
  let token
  let owner = accounts[0]
  const user = accounts[1];
  beforeEach(async () => {
    bridgeValidators = await BridgeValidators.new({ from: owner });
  })
  describe('#initialize', async () => {
    it('sets values', async () => {
      '0'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
      false.should.be.equal(await bridgeValidators.isValidator(accounts[0]))
      false.should.be.equal(await bridgeValidators.isValidator(accounts[1]))
      false.should.be.equal(await bridgeValidators.initialized())
      '0'.should.be.bignumber.equal(await bridgeValidators.requiredSignatures())
      await bridgeValidators.initialize(3, [accounts[0], accounts[1]], {from: accounts[2]}).should.be.rejectedWith(ERROR_MSG)
      await bridgeValidators.initialize(2, [accounts[0], accounts[1]], {from: accounts[2]}).should.be.fulfilled;
      await bridgeValidators.initialize(2, [accounts[0], accounts[1]], {from: accounts[2]}).should.be.rejectedWith(ERROR_MSG);
      true.should.be.equal(await bridgeValidators.initialized())
      '2'.should.be.bignumber.equal(await bridgeValidators.requiredSignatures())
      true.should.be.equal(await bridgeValidators.isValidator(accounts[0]))
      true.should.be.equal(await bridgeValidators.isValidator(accounts[1]))
      accounts[2].should.be.equal(await bridgeValidators.owner())
      '2'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })
  })

  describe('#addValidator', async () => {
    let owner = accounts[2];
    let validators = [accounts[0], accounts[1]];
    let requiredSignatures = 2;
    beforeEach(async () => {
      await bridgeValidators.initialize(requiredSignatures, validators, {from: owner}).should.be.fulfilled
      '2'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })
    it('adds validator', async () => {
      let newValidator = accounts[3];

      false.should.be.equal(await bridgeValidators.isValidator(newValidator))
      await bridgeValidators.addValidator(newValidator, {from: validators[0]}).should.be.rejectedWith(ERROR_MSG)
      const {logs} = await bridgeValidators.addValidator(newValidator, {from: owner}).should.be.fulfilled
      true.should.be.equal(await bridgeValidators.isValidator(newValidator))
      '3'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
      logs[0].event.should.be.equal('ValidatorAdded')
      logs[0].args.should.be.deep.equal({validator: newValidator})
    })

    it('cannot add already existing validator', async () => {
      true.should.be.equal(await bridgeValidators.isValidator(validators[0]))
      await bridgeValidators.addValidator(validators[0], {from: owner}).should.be.rejectedWith(ERROR_MSG)
      await bridgeValidators.addValidator(ZERO_ADDRESS, {from: owner}).should.be.rejectedWith(ERROR_MSG)
      '2'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })
  })

  describe('#removeValidator', async () => {
    let owner = accounts[2];
    let validators = [accounts[0], accounts[1], accounts[3]];
    let requiredSignatures = 2;
    beforeEach(async () => {
      await bridgeValidators.initialize(requiredSignatures, validators, {from: owner}).should.be.fulfilled
      '3'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })

    it('removes validator', async () => {
      let toRemove = validators[0];
      true.should.be.equal(await bridgeValidators.isValidator(toRemove))
      await bridgeValidators.removeValidator(toRemove, {from: validators[0]}).should.be.rejectedWith(ERROR_MSG)
      const {logs} = await bridgeValidators.removeValidator(toRemove, {from: owner}).should.be.fulfilled
      false.should.be.equal(await bridgeValidators.isValidator(toRemove))
      '2'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
      logs[0].event.should.be.equal('ValidatorRemoved')
      logs[0].args.should.be.deep.equal({validator: toRemove})
    })

    it('cannot remove if it will break requiredSignatures', async () => {
      let toRemove = validators[0];
      let toRemove2 = validators[1];
      true.should.be.equal(await bridgeValidators.isValidator(toRemove))
      true.should.be.equal(await bridgeValidators.isValidator(toRemove))
      await bridgeValidators.removeValidator(toRemove, {from: owner}).should.be.fulfilled
      await bridgeValidators.removeValidator(toRemove2, {from: owner}).should.be.rejectedWith(ERROR_MSG)
      false.should.be.equal(await bridgeValidators.isValidator(toRemove))
      true.should.be.equal(await bridgeValidators.isValidator(toRemove2))
      '2'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })

    it('cannot remove non-existent validator', async () => {
      false.should.be.equal(await bridgeValidators.isValidator(accounts[4]))
      await bridgeValidators.removeValidator(accounts[4], {from: owner}).should.be.rejectedWith(ERROR_MSG)
      await bridgeValidators.removeValidator(ZERO_ADDRESS, {from: owner}).should.be.rejectedWith(ERROR_MSG)
      '3'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })
  })

  describe('#setRequiredSignatures', async () => {
    let owner = accounts[2];
    let validators = [accounts[0], accounts[1], accounts[3]];
    let requiredSignatures = 2;
    beforeEach(async () => {
      await bridgeValidators.initialize(requiredSignatures, validators, {from: owner}).should.be.fulfilled
      '3'.should.be.bignumber.equal(await bridgeValidators.validatorCount())
    })

    it('sets req signatures', async () => {
      let newReqSig = 3;
      requiredSignatures.should.be.bignumber.equal(await bridgeValidators.requiredSignatures());
      await bridgeValidators.setRequiredSignatures(newReqSig, {from: validators[0]}).should.be.rejectedWith(ERROR_MSG)
      await bridgeValidators.setRequiredSignatures(newReqSig, {from: owner}).should.be.fulfilled
      newReqSig.should.be.bignumber.equal(await bridgeValidators.requiredSignatures());
    })
    it('cannot set more than  validators count', async () => {
      let newReqSig = 4;
      requiredSignatures.should.be.bignumber.equal(await bridgeValidators.requiredSignatures());
      await bridgeValidators.setRequiredSignatures(newReqSig, {from: owner}).should.be.rejectedWith(ERROR_MSG)
      requiredSignatures.should.be.bignumber.equal(await bridgeValidators.requiredSignatures());
    })
  })
  describe('#upgradable', async () => {
    let required_signatures = 2;
    let validators = [accounts[0], accounts[1]];
    let owner = accounts[2]
    let proxyOwner = accounts[3]

    beforeEach(async () => {
      bridgeValidatorsContract = await BridgeValidators.new({ from: owner });
      proxy = await UpgradeableProxy.new(bridgeValidatorsContract.address, { from: proxyOwner })
      originalContract = await BridgeValidators.at(proxy.address)
      await originalContract.initialize(required_signatures, validators, {from: owner}).should.be.fulfilled;
    })

    it('can be upgraded via proxy', async () => {
      const bridgeValidatorsNew = await BridgeValidators.new({ from: owner })
      await proxy.upgradeTo(bridgeValidatorsNew.address, { from: proxyOwner})
      const updatedContract = await BridgeValidators.at(proxy.address)

      true.should.be.equal(await updatedContract.initialized());
      required_signatures.should.be.bignumber.equal(await updatedContract.requiredSignatures())
      true.should.be.equal(await updatedContract.isValidator(validators[0]))
      true.should.be.equal(await updatedContract.isValidator(validators[1]))
      owner.should.be.equal(await updatedContract.owner())
      validators.length.should.be.bignumber.equal(await updatedContract.validatorCount())
    })
  })
})
