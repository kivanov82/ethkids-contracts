const truffleAssert = require('truffle-assertions');

var BancorFormula = artifacts.require("BancorFormula");
var BondingVault = artifacts.require("BondingVault");
var CharityVault = artifacts.require("CharityVault");
var DonationCommunity = artifacts.require("DonationCommunity");
var EthKidsToken = artifacts.require("EthKidsToken");
var EthKidsRegistry = artifacts.require("EthKidsRegistry");
var KyberConverterMock = artifacts.require("KyberConverterMock");
var ERC20Mintable = artifacts.require("ERC20Mintable");

const empty_address = '0x0000000000000000000000000000000000000000';

contract('EthKids', async (accounts) => {

    const ipfsMessage = "ipfsMessage_placeholder";

    let registry;
    let community;
    let formula;
    let bondingVault;
    let charityVault;
    let token;
    let stableToken;
    let currencyConverter;

    let OWNER = accounts[0];
    let DONOR = accounts[1];
    let DONOR2 = accounts[2];
    let DONOR3 = accounts[3];
    let EXTRA_OWNER = accounts[4];
    let CHARITY_INTERMEDIARY = accounts[5];

    let readableETH = function (wei) {
        return parseFloat(web3.utils.fromWei(wei.toString())).toFixed(5) + ' ETH';
    }

    let readableTokens = function (wei) {
        return parseFloat(web3.utils.fromWei(wei.toString())).toFixed(5) + ' CHANCE';
    }


    before("run initial setup ", async () => {
        console.log(`Starting EthKids...`);

        registry = await EthKidsRegistry.deployed();

        assert.strictEqual((await registry.communityCount.call()).toString(), "3");

        bondingVault = await BondingVault.at(await registry.bondingVault.call());

        formula = await BancorFormula.at(await bondingVault.bondingCurveFormula.call());

        token = await EthKidsToken.at(await bondingVault.getEthKidsToken());

        assert.isTrue(await token.isMinter(bondingVault.address));

        community = await DonationCommunity.at(await registry.getCommunityAt(0));

        charityVault = await CharityVault.at(await community.charityVault.call());

        //replace the converter with the mock that uses another ERC as 'stable'
        stableToken = await ERC20Mintable.new();
        currencyConverter = await KyberConverterMock.new(empty_address, empty_address);
        //mint 100 directly to converter for liquidity
        await stableToken.mint(currencyConverter.address, web3.utils.toWei('100', 'ether'));
        await registry.registerCurrencyConverter(currencyConverter.address);
    })

    it("should be able to donate", async () => {
        console.log("(1) My reward: " +
            readableTokens(await community.myReward(web3.utils.toWei('100', 'finney'), {from: DONOR})));

        await community.donate({from: DONOR, value: web3.utils.toWei('100', 'finney')});

        console.log("(1) First donor, got in tokens: " +
            readableTokens(await token.balanceOf(DONOR, {from: DONOR})));

        console.log("(1) First donor, liquidation value ETH: " +
            readableETH((await community.myReturn(await token.balanceOf(DONOR, {from: DONOR})))));

        //charity fund
        let charityAfter = (await web3.eth.getBalance(charityVault.address)).toString();
        assert.strictEqual(charityAfter, web3.utils.toWei("90", "finney"));
        //global stats
        let globalStats = (await charityVault.sumStats.call()).toString();
        assert.strictEqual(globalStats, web3.utils.toWei("90", "finney"));


        //bonding curve fund
        let bondingCurveAfter = (await web3.eth.getBalance(bondingVault.address)).toString();
        //10 finney there initially
        assert.strictEqual(bondingCurveAfter, web3.utils.toWei("20", "finney"));
    })

    it("should sum up on second donation", async () => {
        console.log("(2) My reward: " +
            readableTokens(await community.myReward(web3.utils.toWei('200', 'finney'), {from: DONOR2})));
        await community.donate({from: DONOR2, value: web3.utils.toWei('200', 'finney')});

        console.log("(2) First donor, liquidation value after another donor ETH: " +
            readableETH((await community.myReturn(await token.balanceOf(DONOR), {from: DONOR}))));

        console.log("(2) Second donor, got in tokens: " +
            readableTokens(await token.balanceOf(DONOR2), {from: DONOR2}));

        console.log("(2) Second donor, liquidation value ETH: " +
            readableETH((await community.myReturn(await token.balanceOf(DONOR2), {from: DONOR2}))));

        //charity fund
        let charityAfter = (await web3.eth.getBalance(charityVault.address)).toString();
        assert.strictEqual(charityAfter, web3.utils.toWei("270", "finney"));
        //global stats
        let globalStats = (await charityVault.sumStats.call()).toString();
        assert.strictEqual(globalStats, web3.utils.toWei("270", "finney"));


        //bonding curve fund
        let bondingCurveAfter = (await web3.eth.getBalance(bondingVault.address)).toString();
        assert.strictEqual(bondingCurveAfter, web3.utils.toWei("40", "finney")); // + 20 finney
    })

    it("should sum up on 3rd donation", async () => {
        console.log("(3) My reward: " +
            readableTokens(await community.myReward(web3.utils.toWei('100', 'finney'), {from: DONOR3})));
        await community.donate({from: DONOR3, value: web3.utils.toWei('100', 'finney')});

        console.log("(3) First donor, liquidation value after another donor ETH: " +
            readableETH((await community.myReturn(await token.balanceOf(DONOR), {from: DONOR}))));
        console.log("(3) Second donor, liquidation value after another donor ETH: " +
            readableETH((await community.myReturn(await token.balanceOf(DONOR2), {from: DONOR2}))));

        console.log("(3) Third donor, got in tokens: " +
            readableTokens(await token.balanceOf(DONOR3), {from: DONOR3}));
    })

    it("should calculate return on sell", async () => {
        let testTokenAmount = web3.utils.toWei("10000", "ether");
        console.log("DONOR balance:" + readableTokens(await token.balanceOf(DONOR)));
        console.log("DONOR2 balance:" + readableTokens(await token.balanceOf(DONOR2)));
        let returnSmallDonor = (await community.myReturn(testTokenAmount, {from: DONOR}));
        let returnBigDonor = (await community.myReturn(testTokenAmount, {from: DONOR2}));

        console.log("(4) Donors comparison, return for small: " + readableETH(returnSmallDonor));
        console.log("(4) Donors comparison, return for big: " + readableETH(returnBigDonor));

        let returnSmallDonorByOwner = (await community.myReturn(testTokenAmount, {from: DONOR}));
        assert.strictEqual(returnSmallDonorByOwner.toString(), returnSmallDonor.toString());
    })

    it("should be able to sell", async () => {
        let donorBalanceBefore = Number(await web3.eth.getBalance(DONOR2));
        let donorTokenBalanceBefore = Number(await token.balanceOf(DONOR2));
        let bondingVaultBalanceBefore = Number(await web3.eth.getBalance(bondingVault.address));
        let returnBeforeSell = (await community.myReturn(web3.utils.toWei("100000", "ether"), {from: DONOR2}));
        await bondingVault.sell(web3.utils.toWei("100000", "ether"), {from: DONOR2});//100 000 CHANCE

        //personal ETH balance increased
        assert.isTrue(donorBalanceBefore < Number(await web3.eth.getBalance(DONOR2)));
        //bonding curve ETH balance decreased
        assert.isTrue(bondingVaultBalanceBefore > Number(await web3.eth.getBalance(bondingVault.address)));
        //personal CHANCE balance decreased
        assert.isTrue(donorTokenBalanceBefore > Number(await token.balanceOf(DONOR2)));

        let returnAfterSell = (await community.myReturn(web3.utils.toWei("100000", "ether"), {from: DONOR2}));
        console.log("(5) My return before I sold: " + readableETH(returnBeforeSell));
        console.log("(5) My return after I sold: " + readableETH(returnAfterSell));
    })

    it("should be able to pass to charity", async () => {
        let charityFundBefore = Number(await web3.eth.getBalance(charityVault.address));
        let intermediaryBalanceBefore = Number(await web3.eth.getBalance(CHARITY_INTERMEDIARY));

        let tx = await community.passToCharity(web3.utils.toWei("40", "finney"), CHARITY_INTERMEDIARY, ipfsMessage);

        assert.strictEqual(Number(await web3.eth.getBalance(charityVault.address)) + Number(web3.utils.toWei("40", "finney")),
            charityFundBefore);
        assert.strictEqual(Number(await web3.eth.getBalance(CHARITY_INTERMEDIARY)) - Number(web3.utils.toWei("40", "finney")),
            intermediaryBalanceBefore);

        truffleAssert.eventEmitted(tx, 'LogPassToCharity', (ev) => {
            return ev.by === OWNER && ev.intermediary === CHARITY_INTERMEDIARY
                && ev.amount.toString() === web3.utils.toWei("40", "finney") && ev.ipfsHash === ipfsMessage;
        }, 'LogPassToCharity should be emitted with correct parameters');

    })

    it("should be able to sweep the bonding curve vault", async () => {
        //sell all
        await bondingVault.sell(await token.balanceOf(DONOR), {from: DONOR});
        await bondingVault.sell(await token.balanceOf(DONOR2), {from: DONOR2});
        await bondingVault.sell(await token.balanceOf(DONOR3), {from: DONOR3});

        assert.strictEqual((await token.totalSupply()).toString(), web3.utils.toWei("1000000", "ether")); //1 MM CHANCE, initial one
        console.log("Vault after all sells: " + readableETH(await web3.eth.getBalance(bondingVault.address)));

        //bad guy can't
        try {
            await registry.sweepVault({from: DONOR});
            assert.ok(false, 'not authorized!');
        } catch (error) {
            assert.ok(true, 'expected');
        }

        await registry.sweepVault();
        assert.isTrue(Number(await web3.eth.getBalance(bondingVault.address)) == 0);
    })

    it("should be able to add an extra community leader", async () => {
        assert.strictEqual(await community.isWhitelistAdmin(EXTRA_OWNER), false);

        await community.addWhitelistAdmin(EXTRA_OWNER);
        assert.strictEqual(await community.isWhitelistAdmin(EXTRA_OWNER), true);
    })

    it("new community leader can pass to charity", async () => {
        //bad guy can't
        try {
            await community.passToCharity(web3.utils.toWei("100", "finney"), CHARITY_INTERMEDIARY, ipfsMessage, {from: CHARITY_INTERMEDIARY});
            assert.ok(false, 'not authorized!');
        } catch (error) {
            assert.ok(true, 'expected');
        }
        await community.passToCharity(web3.utils.toWei("100", "finney"), CHARITY_INTERMEDIARY, ipfsMessage, {from: EXTRA_OWNER});
    })

    it("new leader can renounce from community", async () => {
        await community.renounceWhitelistAdmin({from: EXTRA_OWNER});
        assert.strictEqual(await community.isWhitelistAdmin(EXTRA_OWNER), false);
    })

})