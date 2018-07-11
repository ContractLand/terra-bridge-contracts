const HomeToken = artifacts.require("HomeToken.sol");
const TransferAndCallTest = artifacts.require("TransferAndCallTest.sol");
const {ERROR_MSG} = require('./helpers/setup');

contract('HomeToken', async (accounts) => {
  let token
  let owner = accounts[0]
  const user = accounts[1];
  beforeEach(async () => {
    token = await HomeToken.new("Home Token", "HTK", 18);
  })
  it('default values', async () => {

    const symbol = await token.symbol()
    assert.equal(symbol, 'HTK')

    const decimals = await token.decimals()
    assert.equal(decimals, 18)

    const name = await token.name()
    assert.equal(name, "Home Token")

    const totalSupply = await token.totalSupply();
    assert.equal(totalSupply, 0);

    const mintingFinished = await token.mintingFinished();
    assert.equal(mintingFinished, false);

  })
  describe('#mint', async() => {
    it('can mint by owner', async () => {
      (await token.totalSupply()).should.be.bignumber.equal(0);
      await token.mint(user, 1, {from: owner }).should.be.fulfilled;
      (await token.totalSupply()).should.be.bignumber.equal(1);
      (await token.balanceOf(user)).should.be.bignumber.equal(1);
    })

    it('no one can call finishMinting', async () => {
      await token.finishMinting().should.be.rejectedWith(ERROR_MSG)
    })

    it('cannot mint by non-owner', async () => {
      (await token.totalSupply()).should.be.bignumber.equal(0);
      await token.mint(user, 1, {from: user }).should.be.rejectedWith(ERROR_MSG);
      (await token.totalSupply()).should.be.bignumber.equal(0);
      (await token.balanceOf(user)).should.be.bignumber.equal(0);
    })
  })

  describe('#transfer', async() => {
    it('sends tokens to recipient', async () => {
      await token.mint(user, 1, {from: owner }).should.be.fulfilled;
      await token.transfer(user, 1, {from: owner}).should.be.rejectedWith(ERROR_MSG);
      const {logs} = await token.transfer(owner, 1, {from: user}).should.be.fulfilled;
      (await token.balanceOf(owner)).should.be.bignumber.equal(1);
      (await token.balanceOf(user)).should.be.bignumber.equal(0);
      logs[0].event.should.be.equal("Transfer")
      logs[0].args.should.be.deep.equal({
        from: user,
        to: owner,
        value: new web3.BigNumber(1)
      })
    })
  })

  describe("#burn", async () => {
    it('can burn', async() => {
      await token.burn(100, {from: owner}).should.be.rejectedWith(ERROR_MSG);
      await token.mint(user, 1, {from: owner }).should.be.fulfilled;
      await token.burn(1, {from: user}).should.be.fulfilled;
      (await token.totalSupply()).should.be.bignumber.equal(0);
      (await token.balanceOf(user)).should.be.bignumber.equal(0);
    })
  })

  describe('#transferAndCall', () => {
    it('can transfer and call', async () => {
      const testMock = await TransferAndCallTest.new();
      (await testMock.from()).should.be.equal('0x0000000000000000000000000000000000000000');
      (await testMock.value()).should.be.bignumber.equal('0');

      var testMockWeb3 = web3.eth.contract(TransferAndCallTest.abi);
      var testMockInstance = testMockWeb3.at(testMock.address);
      var callDoSomething123 = testMockInstance.doSomething.getData(user, 1);

      await token.mint(user, 1, {from: owner }).should.be.fulfilled;
      await token.transferAndCall(testMock.address, 1, callDoSomething123, {from: user}).should.be.fulfilled;
      (await token.balanceOf(testMock.address)).should.be.bignumber.equal(1);
      (await token.balanceOf(user)).should.be.bignumber.equal(0);
      (await testMock.from()).should.be.equal(user);
      (await testMock.value()).should.be.bignumber.equal(1);
    })
  })

  describe('#claimtokens', async () => {
    it('can take send ERC20 tokens', async ()=> {
      const owner = accounts[0];
      const halfEther = web3.toBigNumber(web3.toWei(0.5, "ether"));
      let tokenSecond = await HomeToken.new("Roman Token", "RST", 18);

      await tokenSecond.mint(accounts[0], halfEther).should.be.fulfilled;
      halfEther.should.be.bignumber.equal(await tokenSecond.balanceOf(accounts[0]))
      await tokenSecond.transfer(token.address, halfEther);
      '0'.should.be.bignumber.equal(await tokenSecond.balanceOf(accounts[0]))
      halfEther.should.be.bignumber.equal(await tokenSecond.balanceOf(token.address))

      await token.claimTokens(tokenSecond.address, accounts[3], {from: owner});
      '0'.should.be.bignumber.equal(await tokenSecond.balanceOf(token.address))
      halfEther.should.be.bignumber.equal(await tokenSecond.balanceOf(accounts[3]))

    })
  })
})
