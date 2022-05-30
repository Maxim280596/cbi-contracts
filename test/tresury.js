const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const ethSignUtil = require("eth-sig-util")
const ethUtil = require("ethereumjs-util");
const router_abi = require("./abis/routerAbi.json");
const { nowInSeconds } = require("../utills/timeHelpers");
const { parseSignature } = require("../utills/parseSignature")
const { network } = require("hardhat");
const { 
  EIP712Domain, 
  WithdrawCBIbySign, 
  SellCBIbySign, 
  ROUTER_ADDRESS, 
  MAX_UINT 
} = require("./constants")

// for testing methods sellCBIbySign and withdrawCBIbySign run Hardhat node and copy private keys
// from accounts 1 and add to this constants.
// First wallet pk = adminPk. 

const adminPk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

describe("CBI_Treasury tests", () => {
  let usdtToken, cbiToken, treasury, router, accounts, deployer, admin, domain;

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

    domain = {
      name: "CBI_Treasury",
      version: "1",
      chainId: network.config.chainId,
      verifyingContract: treasury.address,
    }

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

    await treasury.connect(accounts[0]).purchaseCBI(amountUSDT, 1)

    let usdtBalanceAfter = await treasury.usdtBalance();
    let cbiBalanceAfter = await treasury.cbiBalance();

    expect(usdtBalanceStart.sub(usdtBalanceAfter)).to.equal(amountUSDT)
    expect(cbiBalanceAfter.sub(cbiBalanceStart)).to.equal(cbiSwapAmount[1])
    expect(cbiBalanceAfter).gt(cbiBalanceStart);
  })


  it("purchaseCBI method should reverted, if zero USDT amount", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    expect(treasury.connect(accounts[0]).purchaseCBI("0", 1)).to.be.revertedWith("CBI_Treasury: Zero amount USDT")
  })

  it("purchaseCBI method should reverted, if the USDT balance is insufficient", async () => {
    expect(treasury.connect(accounts[0]).purchaseCBI("1000000000", 1)).to.be.revertedWith("CBI_Treasury: Not enough balance CBI")
  })

  it("purchaseCBI method should emit event PurchaseCBI", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");
    let amountUSDT = "1000000000";
    let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [usdtToken.address, cbiToken.address])
    expect(treasury.connect(accounts[0]).purchaseCBI(amountUSDT, 1)).to.emit(treasury, 'PurchaseCBI').withArgs(amountUSDT, cbiSwapAmount[1], accounts[0].address, 1)
  })

  it("replenishCBI method should transfer CBI from user to Treasury", async () => {
    let userCbiBalanceStart = await cbiToken.balanceOf(accounts[0].address)
    let treasuryCbiBalanceStart = await treasury.cbiBalance();
    let replenichCbiAmount = BigNumber.from("100000000000000000000");

    await cbiToken.connect(accounts[0]).approve(treasury.address, MAX_UINT);
    await treasury.connect(accounts[0]).replenishCBI(1, replenichCbiAmount)

    let userCbiBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let treasuryCbiBalanceAfter = await treasury.cbiBalance();
    expect(userCbiBalanceStart.sub(replenichCbiAmount)).to.equal(BigNumber.from(userCbiBalanceAfter))
    expect(treasuryCbiBalanceAfter.sub(treasuryCbiBalanceStart)).to.equal(BigNumber.from(replenichCbiAmount))
  })

  it("replenishCBI method should reverted, if zero USDT amount", async () => {
    expect(treasury.connect(accounts[0]).replenishCBI(1, "0")).to.be.revertedWith("CBI_Treasury: Zero amount")
  })

  it("replenishCBI method should emit event ReplenishCBI", async () => {
    let replenichCbiAmount = BigNumber.from("100000000000000000000");
    expect(treasury.connect(accounts[0]).replenishCBI(1, replenichCbiAmount)).to.emit(treasury, 'ReplenishCBI').withArgs(replenichCbiAmount, accounts[0].address, 1)
  })


  it("withdrawCBIbySign must withdraw funds", async () => {
    let cbiUserBalanceStart = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000")

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawCBIbySign,
      },
      domain,
      primaryType: "WithdrawCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v


    await treasury.connect(accounts[0]).withdrawCBIbySign(
      accounts[0].address,
      withdrawAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )

    let cbiUserBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiUserBalanceAfter.sub(cbiUserBalanceStart)).to.equal(withdrawAmount);
    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(withdrawAmount)
  })

  it("withdrawCBIbySign method should reverted, if zero amount", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000");

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawCBIbySign,
      },
      domain,
      primaryType: "WithdrawCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    expect(treasury.connect(accounts[0]).withdrawCBIbySign(
      accounts[0].address,
      withdrawAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )).to.be.revertedWith("CBI_Treasury: Zero amount")
  })

  it("withdrawCBIbySign method should reverted, if there are not enough CBI tokens on the Treasury balance", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000000000");

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawCBIbySign,
      },
      domain,
      primaryType: "WithdrawCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    expect(treasury.connect(accounts[0]).withdrawCBIbySign(
      accounts[0].address,
      withdrawAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )).to.be.revertedWith("CBI_Treasury: Not enough balance CBI")
  })

  it("withdrawCBIbySign method should emit event WithdrawCBI", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000");
    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawCBIbySign,
      },
      domain,
      primaryType: "WithdrawCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    expect(treasury.connect(accounts[0]).withdrawCBIbySign(
      accounts[0].address,
      withdrawAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )).to.emit(treasury, 'WithdrawCBI').withArgs(withdrawAmount, accounts[0].address, 1)
  })

  it("sellCBIbySign must exchange CBI for USDT", async () => {
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let usdtTreasuryBalanceStart = await treasury.usdtBalance();
    let sellNonces = await treasury.sellCBINonces(accounts[0].address);
    let sellAmount = BigNumber.from("100000000000000000000")

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: sellNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        SellCBIbySign,
      },
      domain,
      primaryType: "SellCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    let usdtSwapAmount = await router.getAmountsOut(sellAmount, [cbiToken.address, usdtToken.address]);
    await treasury.connect(accounts[0]).sellCBIbySign(
      accounts[0].address,
      sellAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )

    let usdtTreasuryBalanceAfter = await treasury.usdtBalance();
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(sellAmount);
    expect(usdtTreasuryBalanceAfter.sub(usdtTreasuryBalanceStart)).to.equal(usdtSwapAmount[1])
  })

  it("sellCBIbySign method should reverted, if zero amount", async () => {
    let sellNonces = await treasury.sellCBINonces(accounts[0].address);
    let sellAmount = BigNumber.from("100000000000000000000")

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: sellNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        SellCBIbySign,
      },
      domain,
      primaryType: "SellCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    expect(treasury.connect(accounts[0]).sellCBIbySign(
      accounts[0].address,
      sellAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )).to.be.revertedWith("CBI_Treasury: Zero amount")
  })


  it("sellCBIbySign method should reverted, if there are not enough CBI tokens on the Treasury balance", async () => {
    let sellNonces = await treasury.sellCBINonces(accounts[0].address);
    let sellAmount = BigNumber.from("100000000000000000000000000")

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: sellNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        SellCBIbySign,
      },
      domain,
      primaryType: "SellCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    expect(treasury.connect(accounts[0]).sellCBIbySign(
      accounts[0].address,
      sellAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )).to.be.revertedWith("CBI_Treasury: Not enough balance CBI")
  })


  it("sellCBIbySign method should emit event SellCBI", async () => {
    let sellNonces = await treasury.sellCBINonces(accounts[0].address);
    let sellAmount = BigNumber.from("100000000000000000000")

    const message = {
      user: accounts[0].address,
      amount: "100000000000000000000",
      userId: "1",
      sender: accounts[0].address,
      nonce: sellNonces.toString(),
      deadline: "2000000000",
    }

    const rawData = {
      types: {
        EIP712Domain,
        SellCBIbySign,
      },
      domain,
      primaryType: "SellCBIbySign",
      message,
    }

    const key = Buffer.from(adminPk, "hex")
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData
    })
    let signature = await parseSignature(res)
    let r = ethUtil.bufferToHex(signature.r)
    let s = ethUtil.bufferToHex(signature.s)
    let v = signature.v

    let usdtSwapAmount = await router.getAmountsOut(sellAmount, [cbiToken.address, usdtToken.address]);

    expect(treasury.connect(accounts[0]).sellCBIbySign(
      accounts[0].address,
      sellAmount,
      1,
      "2000000000",
      v,
      r,
      s
    )).to.emit(treasury, 'SellCBI').withArgs(sellAmount, usdtSwapAmount, accounts[0].address, 1)
  })


  //========================================= owner methods ==========================================

  it("sellCBI method must exchange CBI for USDT", async () => {
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let usdtTreasuryBalanceStart = await treasury.usdtBalance();
    let sellAmount = BigNumber.from("100000000000000000000");
    let usdtSwapAmount = await router.getAmountsOut(sellAmount, [cbiToken.address, usdtToken.address]);

    await treasury.sellCBI(
      accounts[0].address,
      sellAmount,
      1
    )

    let usdtTreasuryBalanceAfter = await treasury.usdtBalance();
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(sellAmount);
    expect(usdtTreasuryBalanceAfter.sub(usdtTreasuryBalanceStart)).to.equal(usdtSwapAmount[1])
  })

  it("withdrawCBI method must withdraw CBI token from contract", async () => {
    let cbiUserBalanceStart = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let withdrawAmount = BigNumber.from("100000000000000000000")

    await treasury.withdrawCBI(
      accounts[0].address,
      withdrawAmount,
      1
    )

    let cbiUserBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiUserBalanceAfter.sub(cbiUserBalanceStart)).to.equal(withdrawAmount);
    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(withdrawAmount)
  })

  it("updateAdmin method must update contract admin", async () => {
    await treasury.updateAdmin(
      accounts[0].address
    )
    let admin = await treasury.admin()
    expect(admin).to.equal(accounts[0].address)
  })

})