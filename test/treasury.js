const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const router_abi = require("./abis/routerAbi.json");
const { nowInSeconds } = require("../utills/timeHelpers");
const { network } = require("hardhat");
const { 
  ROUTER_ADDRESS, 
  MAX_UINT,
} = require("./constants")

describe("CBI_Treasury tests", () => {
  let usdtToken, cbiToken, treasury, router, accounts, deployer, admin;

  before("Init test environment", async () => {
    const TREASURY = await ethers.getContractFactory("contracts/CBI_Treasury.sol:CBI_Treasury");
    const CBI = await ethers.getContractFactory("contracts/CBI_ERC20.sol:CBI_ERC20")
    const USDT = await ethers.getContractFactory("contracts/test/USDT.sol:USDT_ERC20");

    const [ownerAccount, adminAccount, ...others] = await hre.ethers.getSigners();
    accounts = others;
    deployer = ownerAccount;
    admin = adminAccount;

    usdtToken = await USDT.deploy("USDT", "USDT", "6", "1000000000000000");
    cbiToken = await CBI.deploy("CBI", "CBI", "1000000000000000000000000000")
    router = await ethers.getContractAt(router_abi, ROUTER_ADDRESS);
    treasury = await TREASURY.deploy(router.address, cbiToken.address, usdtToken.address, admin.address);

    await cbiToken.approve(router.address, MAX_UINT)
    await usdtToken.approve(router.address, MAX_UINT)

    await router.addLiquidity(
      usdtToken.address,
      cbiToken.address,
      "1000000000000",
      "2000000000000000000000000",
      "0",
      "0",
      deployer.address,
      nowInSeconds() + 1000
    )

    for (let i = 0; i <= accounts.length - 1; i++) {
      await cbiToken.transfer(accounts[i].address, "10000000000000000000000")
      await usdtToken.transfer(accounts[i].address, "10000000000")
    }
  })

  it("purchaseCBI method should exchange USDT for CBI", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    let usdtBalanceStart = await treasury.usdtBalance();
    let cbiBalanceStart = await treasury.cbiBalance();

    let amountUSDT = BigNumber.from("1000000000");
    let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [usdtToken.address, cbiToken.address])

    await treasury.connect(admin).purchaseCBI(amountUSDT)

    let usdtBalanceAfter = await treasury.usdtBalance();
    let cbiBalanceAfter = await treasury.cbiBalance();

    expect(usdtBalanceStart.sub(usdtBalanceAfter)).to.equal(amountUSDT)
    expect(cbiBalanceAfter.sub(cbiBalanceStart)).to.equal(cbiSwapAmount[1])
    expect(cbiBalanceAfter).gt(cbiBalanceStart);
  })

  it("purchaseCBI method should reverted, if zero USDT amount", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    expect(treasury.connect(admin).purchaseCBI("0")).to.be.revertedWith("CBI_Treasury: Zero amount USDT")
  })

  it("purchaseCBI method should reverted, if the USDT balance is insufficient", async () => {
    expect(treasury.connect(admin).purchaseCBI("1000000000")).to.be.revertedWith("CBI_Treasury: Not enough balance CBI")
  })

  it("purchaseCBI method should emit event PurchaseCBI", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");
    let amountUSDT = "1000000000";
    let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [usdtToken.address, cbiToken.address])
    expect(treasury.connect(admin).purchaseCBI(amountUSDT)).to.emit(treasury, 'PurchaseCBI').withArgs(amountUSDT, cbiSwapAmount[1], accounts[0].address)
  })

  it("withdrawCBI must withdraw funds", async () => {
    let cbiUserBalanceStart = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let withdrawAmount = BigNumber.from("100000000000000000000")

    await treasury.connect(admin).withdrawCBI(
      accounts[0].address,
      withdrawAmount
    )

    let cbiUserBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiUserBalanceAfter.sub(cbiUserBalanceStart)).to.equal(withdrawAmount);
    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(withdrawAmount)
  })

  it("withdrawCBI method should reverted, if zero amount", async () => {
    let withdrawAmount = BigNumber.from("100000000000000000000");

    expect(treasury.connect(admin).withdrawCBI(
      accounts[0].address,
      withdrawAmount
    )).to.be.revertedWith("CBI_Treasury: Zero amount")
  })

  it("withdrawCBI method should reverted, if there are not enough CBI tokens on the Treasury balance", async () => {
    let withdrawAmount = BigNumber.from("100000000000000000000000000000");

    expect(treasury.connect(admin).withdrawCBI(
      accounts[0].address,
      withdrawAmount
    )).to.be.revertedWith("CBI_Treasury: Not enough balance CBI")
  })

  it("withdrawCBI method should emit event WithdrawCBI", async () => {
    let withdrawAmount = BigNumber.from("100000000000000000000");
   
    expect(treasury.connect(admin).withdrawCBI(
      accounts[0].address,
      withdrawAmount
    )).to.emit(treasury, 'WithdrawCBI').withArgs(withdrawAmount, accounts[0].address)
  })

  it("sellCBI must exchange CBI for USDT", async () => {
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let usdtTreasuryBalanceStart = await treasury.usdtBalance();
    let sellAmount = BigNumber.from("100000000000000000000")

    let usdtSwapAmount = await router.getAmountsOut(sellAmount, [cbiToken.address, usdtToken.address]);
    await treasury.connect(admin).sellCBI(
      accounts[0].address,
      sellAmount,
    )

    let usdtTreasuryBalanceAfter = await treasury.usdtBalance();
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(sellAmount);
    expect(usdtTreasuryBalanceAfter.sub(usdtTreasuryBalanceStart)).to.equal(usdtSwapAmount[1])
  })

  it("sellCBI method should reverted, if zero amount", async () => {
    let sellAmount = BigNumber.from("100000000000000000000")

    expect(treasury.connect(admin).sellCBI(
      accounts[0].address,
      sellAmount
    )).to.be.revertedWith("CBI_Treasury: Zero amount")
  })


  it("sellCBI method should reverted, if there are not enough CBI tokens on the Treasury balance", async () => {
    let sellAmount = BigNumber.from("100000000000000000000000000")

    expect(treasury.connect(admin).sellCBI(
      accounts[0].address,
      sellAmount
    )).to.be.revertedWith("CBI_Treasury: Not enough balance CBI")
  })


  it("sellCBI method should emit event SellCBI", async () => {
    let sellAmount = BigNumber.from("100000000000000000000")
    let usdtSwapAmount = await router.getAmountsOut(sellAmount, [cbiToken.address, usdtToken.address]);

    expect(treasury.connect(admin).sellCBI(
      accounts[0].address,
      sellAmount
    )).to.emit(treasury, 'SellCBI').withArgs(sellAmount, usdtSwapAmount, accounts[0].address)
  })

  it("rescue method must withdraw tokens from contract", async () => {
    let usdtBalanceStart = await treasury.usdtBalance();
    let userUsdtBalanceStart = await usdtToken.balanceOf(accounts[0].address);
    let rescueAmount = BigNumber.from("1000000")

    await treasury.connect(admin).rescue(
      accounts[0].address,
      usdtToken.address,
      rescueAmount
    )
    let usdtBalanceAfter = await treasury.usdtBalance();
    let userUsdtBalanceAfter = await usdtToken.balanceOf(accounts[0].address);
    expect(usdtBalanceStart.sub(usdtBalanceAfter)).to.equal(rescueAmount);
    expect(userUsdtBalanceAfter.sub(userUsdtBalanceStart)).to.equal(rescueAmount);
  })

  it("updateAdmin method must update contract admin", async () => {
    await treasury.updateAdmin(
      accounts[0].address
    )
    let admin = await treasury.admin()
    expect(admin).to.equal(accounts[0].address)
  })

})