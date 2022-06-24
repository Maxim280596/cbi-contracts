const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { BigNumber } = require("ethers");
const ethSignUtil = require("eth-sig-util");
const ethUtil = require("ethereumjs-util");
const router_abi = require("./abis/routerAbi.json");
const { nowInSeconds } = require("../utills/timeHelpers");
const { parseSignature } = require("../utills/parseSignature");
const { network } = require("hardhat");
const {
  EIP712Domain,
  WithdrawBySign,
  SellBySign,
  SwapTokensBySign,
  ROUTER_ADDRESS,
  MAX_UINT,
  ADMIN_PK,
  ZERO_ADDRESS,
} = require("./constants");

const provider = waffle.provider;

describe("CBI_Treasury tests", () => {
  let usdtToken,
    cbiToken,
    testToken,
    treasury,
    router,
    accounts,
    deployer,
    admin,
    domain,
    factory;

  before("Init test environment", async () => {
    const TREASURY = await ethers.getContractFactory(
      "contracts/CBI_Treasury.sol:CBI_Treasury"
    );
    const CBI = await ethers.getContractFactory(
      "contracts/CBI_ERC20.sol:CBI_ERC20"
    );
    const USDT = await ethers.getContractFactory(
      "contracts/test/USDT.sol:USDT_ERC20"
    );

    factory = await ethers.getContractFactory(
      "contracts/CBI_Treasury.sol:CBI_Treasury"
    );

    const [ownerAccount, adminAccount, ...others] =
      await hre.ethers.getSigners();
    accounts = others;
    deployer = ownerAccount;
    admin = adminAccount;

    usdtToken = await USDT.deploy("USDT", "USDT", "6", "1000000000000000");
    testToken = await USDT.deploy("Test", "TST", "6", "1000000000000000");
    cbiToken = await CBI.deploy("1000000000000000000000000000");
    router = await ethers.getContractAt(router_abi, ROUTER_ADDRESS);
    treasury = await TREASURY.deploy(
      router.address,
      cbiToken.address,
      usdtToken.address,
      admin.address
    );

    domain = {
      name: "CBI_Treasury",
      version: "1",
      chainId: network.config.chainId,
      verifyingContract: treasury.address,
    };

    await cbiToken.approve(router.address, MAX_UINT);
    await usdtToken.approve(router.address, MAX_UINT);

    await router.addLiquidity(
      usdtToken.address,
      cbiToken.address,
      "1000000000000",
      "2000000000000000000000000",
      "0",
      "0",
      deployer.address,
      nowInSeconds() + 1000
    );

    for (let i = 0; i <= accounts.length - 1; i++) {
      await cbiToken.transfer(accounts[i].address, "10000000000000000000000");
      await usdtToken.transfer(accounts[i].address, "10000000000");
      await testToken.transfer(accounts[i].address, "10000000000");
    }
  });
  describe("deploy tests", () => {
    it("should be reverted deploy if admin address equal zero address", async () => {
      await expect(
        factory.deploy(
          router.address,
          cbiToken.address,
          usdtToken.address,
          ZERO_ADDRESS
        )
      ).to.be.revertedWith("CBI_Treasury: Null address");
    });
    it("should be reverted contract deploy if usdt address not a contract", async () => {
      await expect(
        factory.deploy(
          router.address,
          cbiToken.address,
          admin.address,
          admin.address
        )
      ).to.be.revertedWith("CBI_Treasury: Not contract");
    });

    it("should be reverted contract deploy if cbi address not a contract", async () => {
      await expect(
        factory.deploy(
          router.address,
          admin.address,
          usdtToken.address,
          admin.address
        )
      ).to.be.revertedWith("CBI_Treasury: Not contract");
    });

    it("should be reverted contract deploy if router address not a contract", async () => {
      await expect(
        factory.deploy(
          admin.address,
          router.address,
          usdtToken.address,
          admin.address
        )
      ).to.be.revertedWith("CBI_Treasury: Not contract");
    });
  });
  it("swapTokens method should exchange USDT for CBI", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    let usdtBalanceStart = await treasury.usdtBalance();
    let cbiBalanceStart = await treasury.cbiBalance();

    let amountUSDT = BigNumber.from("1000000000");
    let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [
      usdtToken.address,
      cbiToken.address,
    ]);

    await treasury
      .connect(admin)
      .swapTokens(
        usdtToken.address,
        cbiToken.address,
        amountUSDT,
        accounts[4].address,
        1
      );

    let usdtBalanceAfter = await treasury.usdtBalance();
    let cbiBalanceAfter = await treasury.cbiBalance();

    expect(usdtBalanceStart.sub(usdtBalanceAfter)).to.equal(amountUSDT);
    expect(cbiBalanceAfter.sub(cbiBalanceStart)).to.equal(cbiSwapAmount[1]);
    expect(cbiBalanceAfter).gt(cbiBalanceStart);
  });

  it("swapTokensBySign method should exchange USDT for CBI", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    let usdtBalanceStart = await treasury.usdtBalance();
    let cbiBalanceStart = await treasury.cbiBalance();

    let amountUSDT = BigNumber.from("1000000000");
    let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [
      usdtToken.address,
      cbiToken.address,
    ]);

    let purchaseNonces = await treasury.swapNonces(accounts[0].address);

    const message = {
      inputToken: usdtToken.address,
      outputToken: cbiToken.address,
      amount: "1000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: purchaseNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        SwapTokensBySign,
      },
      domain,
      primaryType: "SwapTokensBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await treasury
      .connect(accounts[0])
      .swapTokensBySign(
        usdtToken.address,
        cbiToken.address,
        amountUSDT,
        accounts[0].address,
        1,
        "2000000000",
        v,
        r,
        s
      );

    let usdtBalanceAfter = await treasury.usdtBalance();
    let cbiBalanceAfter = await treasury.cbiBalance();

    expect(usdtBalanceStart.sub(usdtBalanceAfter)).to.equal(amountUSDT);
    expect(cbiBalanceAfter.sub(cbiBalanceStart)).to.equal(cbiSwapAmount[1]);
    expect(cbiBalanceAfter).gt(cbiBalanceStart);
  });

  it("swapTokensBySign method should exchange CBI for USDT", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    let cbiBalanceStart = await treasury.cbiBalance();
    let usdtBalanceStart = await treasury.usdtBalance();

    let amountCBI = BigNumber.from("100000000000000000000");
    let usdtSwapAmount = await router.getAmountsOut(amountCBI, [
      cbiToken.address,
      usdtToken.address,
    ]);

    let swapNonces = await treasury.swapNonces(accounts[0].address);

    const message = {
      inputToken: cbiToken.address,
      outputToken: usdtToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: swapNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        SwapTokensBySign,
      },
      domain,
      primaryType: "SwapTokensBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await treasury
      .connect(accounts[0])
      .swapTokensBySign(
        cbiToken.address,
        usdtToken.address,
        amountCBI,
        accounts[0].address,
        1,
        "2000000000",
        v,
        r,
        s
      );

    let usdtBalanceAfter = await treasury.usdtBalance();
    let cbiBalanceAfter = await treasury.cbiBalance();

    expect(cbiBalanceStart.sub(cbiBalanceAfter)).to.equal(amountCBI);
    expect(usdtBalanceAfter.sub(usdtBalanceStart)).to.equal(usdtSwapAmount[1]);
    expect(usdtBalanceAfter).gt(usdtBalanceStart);
  });

  it("swapTokensBySign method should reverted if expired deadline", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    let amountCBI = BigNumber.from("100000000000000000000");
    let swapNonces = await treasury.swapNonces(accounts[0].address);

    const message = {
      inputToken: cbiToken.address,
      outputToken: usdtToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: swapNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        SwapTokensBySign,
      },
      domain,
      primaryType: "SwapTokensBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await expect(
      treasury
        .connect(accounts[0])
        .swapTokensBySign(
          cbiToken.address,
          usdtToken.address,
          amountCBI,
          accounts[0].address,
          1,
          "2",
          v,
          r,
          s
        )
    ).to.be.revertedWith("CBI_Treasury: Expired");
  });

  it("swapTokensBySign method should reverted if invalid signature", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    let amountCBI = BigNumber.from("100000000000000000000");
    let swapNonces = await treasury.swapNonces(accounts[0].address);

    const message = {
      inputToken: cbiToken.address,
      outputToken: usdtToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: swapNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        SwapTokensBySign,
      },
      domain,
      primaryType: "SwapTokensBySign",
      message,
    };

    const key = Buffer.from(
      "23f5af808799a90763d8384e56a710f922c61966486d67c13133af3c6dc56c21",
      "hex"
    );
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await expect(
      treasury
        .connect(accounts[0])
        .swapTokensBySign(
          cbiToken.address,
          usdtToken.address,
          amountCBI,
          accounts[0].address,
          1,
          "2000000000",
          v,
          r,
          s
        )
    ).to.be.revertedWith("CBI_Treasury: INVALID_SIGNATURE");
  });

  it("swapTokens method should reverted, if zero USDT amount", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    expect(
      treasury
        .connect(admin)
        .swapTokens(
          usdtToken.address,
          cbiToken.address,
          "0",
          accounts[0].address,
          1
        )
    ).to.be.revertedWith("CBI_Treasury: Zero amount");
  });

  it("swapTokens method should reverted, if token swap limit exceeded", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");
    let usdtBalance = await usdtToken.balanceOf(treasury.address);
    let swapLimitAmount = BigNumber.from("50000000000");
    await treasury.updateAllowedToken(
      usdtToken.address,
      true,
      swapLimitAmount,
      0
    );

    await expect(
      treasury
        .connect(admin)
        .swapTokens(
          usdtToken.address,
          cbiToken.address,
          usdtBalance,
          accounts[0].address,
          1
        )
    ).to.be.revertedWith("CBI_Treasury: Token swap limit exceeded");
  });

  it("swapTokens method should reverted, if not allowed token", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");

    expect(
      treasury
        .connect(admin)
        .swapTokens(
          usdtToken.address,
          testToken.address,
          "10000000",
          accounts[0].address,
          1
        )
    ).to.be.revertedWith("CBI_Treasury: Not allowed token");
  });

  it("swapTokens method should reverted, if the USDT balance is insufficient", async () => {
    let usdtBalance = await usdtToken.balanceOf(treasury.address);
    await expect(
      treasury
        .connect(admin)
        .swapTokens(
          usdtToken.address,
          cbiToken.address,
          usdtBalance + 1,
          accounts[0].address,
          1
        )
    ).to.be.revertedWith("CBI_Treasury: Not enough token balance");
  });

  it("swapTokens method should emit event SwapTokens", async () => {
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");
    let amountUSDT = "1000000000";
    let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [
      usdtToken.address,
      cbiToken.address,
    ]);
    expect(
      treasury
        .connect(admin)
        .swapTokens(
          usdtToken.address,
          cbiToken.address,
          amountUSDT,
          accounts[0].address,
          1
        )
    )
      .to.emit(treasury, "SwapTokens")
      .withArgs(
        usdtToken.address,
        cbiToken.address,
        amountUSDT,
        cbiSwapAmount[1],
        accounts[0].address,
        1
      );
  });

  it("replenish method should transfer cbi token from user to Treasury", async () => {
    let userCbiBalanceStart = await cbiToken.balanceOf(accounts[0].address);
    let treasuryCbiBalanceStart = await treasury.cbiBalance();
    let replenichCbiAmount = BigNumber.from("100000000000000000000");

    await cbiToken.connect(accounts[0]).approve(treasury.address, MAX_UINT);
    await treasury
      .connect(accounts[0])
      .replenish(cbiToken.address, replenichCbiAmount, 1);

    let userCbiBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let treasuryCbiBalanceAfter = await treasury.cbiBalance();
    expect(userCbiBalanceStart.sub(replenichCbiAmount)).to.equal(
      BigNumber.from(userCbiBalanceAfter)
    );
    expect(treasuryCbiBalanceAfter.sub(treasuryCbiBalanceStart)).to.equal(
      BigNumber.from(replenichCbiAmount)
    );
  });

  it("replenish method should transfer usdt token from user to Treasury", async () => {
    let userUsdtBalanceStart = await usdtToken.balanceOf(accounts[0].address);
    let treasuryUsdtBalanceStart = await treasury.usdtBalance();
    let replenichUsdtAmount = BigNumber.from("100000000");

    await usdtToken.connect(accounts[0]).approve(treasury.address, MAX_UINT);
    await treasury
      .connect(accounts[0])
      .replenish(usdtToken.address, replenichUsdtAmount, 1);

    let userUsdtBalanceAfter = await usdtToken.balanceOf(accounts[0].address);
    let treasuryUsdtBalanceAfter = await treasury.usdtBalance();
    expect(userUsdtBalanceStart.sub(replenichUsdtAmount)).to.equal(
      BigNumber.from(userUsdtBalanceAfter)
    );
    expect(treasuryUsdtBalanceAfter.sub(treasuryUsdtBalanceStart)).to.equal(
      BigNumber.from(replenichUsdtAmount)
    );
  });

  it("replenish method should reverted, if zero token amount", async () => {
    await expect(
      treasury.connect(accounts[0]).replenish(usdtToken.address, "0", 1)
    ).to.be.revertedWith("CBI_Treasury: Zero amount");
  });

  it("replenish method should reverted, if not allowed token", async () => {
    await testToken.connect(accounts[0]).approve(treasury.address, MAX_UINT);
    await expect(
      treasury
        .connect(accounts[0])
        .replenish(testToken.address, "10000000000", 1)
    ).to.be.revertedWith("CBI_Treasury: Not allowed token");
  });

  it("replenish method should emit event Replenish", async () => {
    let replenichCbiAmount = BigNumber.from("100000000000000000000");
    expect(treasury.connect(accounts[0]).replenish(1, replenichCbiAmount))
      .to.emit(treasury, "Replenish")
      .withArgs(cbiToken.address, replenichCbiAmount, accounts[0].address, 1);
  });

  it("withdrawBySign must withdraw funds", async () => {
    let cbiUserBalanceStart = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000");

    const message = {
      token: cbiToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawBySign,
      },
      domain,
      primaryType: "WithdrawBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await treasury
      .connect(accounts[0])
      .withdrawBySign(
        cbiToken.address,
        withdrawAmount,
        accounts[0].address,
        1,
        "2000000000",
        v,
        r,
        s
      );

    let cbiUserBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiUserBalanceAfter.sub(cbiUserBalanceStart)).to.equal(
      withdrawAmount
    );
    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(
      withdrawAmount
    );
  });

  it("withdrawCBIbySign method should reverted, if zero amount", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);

    const message = {
      token: cbiToken.address,
      amount: 0,
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawBySign,
      },
      domain,
      primaryType: "WithdrawBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await expect(
      treasury
        .connect(accounts[0])
        .withdrawBySign(
          cbiToken.address,
          0,
          accounts[0].address,
          1,
          "2000000000",
          v,
          r,
          s
        )
    ).to.be.revertedWith("CBI_Treasury: Zero amount");
  });

  it("withdrawCBIbySign method should reverted, if expired deadline", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000");

    const message = {
      token: cbiToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "1100",
    };

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawBySign,
      },
      domain,
      primaryType: "WithdrawBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await expect(
      treasury
        .connect(accounts[0])
        .withdrawBySign(
          cbiToken.address,
          withdrawAmount,
          accounts[0].address,
          1,
          "100",
          v,
          r,
          s
        )
    ).to.be.revertedWith("CBI_Treasury: Expired");
  });

  it("withdrawCBIbySign method should reverted, if invalid signature", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000");

    const message = {
      token: cbiToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: 1,
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawBySign,
      },
      domain,
      primaryType: "WithdrawBySign",
      message,
    };

    const key = Buffer.from(
      "23f5af808799a90763d8384e56a710f922c61966486d67c13133af3c6dc56c21",
      "hex"
    );
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await expect(
      treasury
        .connect(accounts[0])
        .withdrawBySign(
          cbiToken.address,
          withdrawAmount,
          accounts[0].address,
          "1",
          "2000000000",
          v,
          r,
          s
        )
    ).to.be.revertedWith("CBI_Treasury: INVALID_SIGNATURE");
  });

  it("withdrawCBIbySign method should reverted, if there are not enough CBI tokens on the Treasury balance", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let treasuryCbiBalance = await treasury.cbiBalance();

    const message = {
      token: cbiToken.address,
      amount: treasuryCbiBalance + 1,
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawBySign,
      },
      domain,
      primaryType: "WithdrawBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    await expect(
      treasury
        .connect(accounts[0])
        .withdrawBySign(
          cbiToken.address,
          treasuryCbiBalance + 1,
          accounts[0].address,
          1,
          "2000000000",
          v,
          r,
          s
        )
    ).to.be.revertedWith("CBI_Treasury: Not enough token balance");
  });

  it("withdrawBySign method should emit event Withdraw", async () => {
    let withdrawNonces = await treasury.withdrawNonces(accounts[0].address);
    let withdrawAmount = BigNumber.from("100000000000000000000");

    const message = {
      token: cbiToken.address,
      amount: "100000000000000000000",
      user: accounts[0].address,
      userId: "1",
      sender: accounts[0].address,
      nonce: withdrawNonces.toString(),
      deadline: "2000000000",
    };

    const rawData = {
      types: {
        EIP712Domain,
        WithdrawBySign,
      },
      domain,
      primaryType: "WithdrawBySign",
      message,
    };

    const key = Buffer.from(ADMIN_PK, "hex");
    let res = ethSignUtil.signTypedData_v4(key, {
      data: rawData,
    });
    let signature = await parseSignature(res);
    let r = ethUtil.bufferToHex(signature.r);
    let s = ethUtil.bufferToHex(signature.s);
    let v = signature.v;

    expect(
      treasury
        .connect(accounts[0])
        .withdrawBySign(
          cbiToken.address,
          withdrawAmount,
          accounts[0].address,
          1,
          "2000000000",
          v,
          r,
          s
        )
    )
      .to.emit(treasury, "Withdraw")
      .withArgs(cbiToken.address, withdrawAmount, accounts[0].address, 1);
  });

  it("withdraw method must withdraw  tokens from contract", async () => {
    let cbiUserBalanceStart = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceStart = await treasury.cbiBalance();
    let withdrawAmount = BigNumber.from("100000000000000000000");

    await treasury.withdraw(
      cbiToken.address,
      withdrawAmount,
      accounts[0].address,
      1
    );

    let cbiUserBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    let cbiTreasuryBalanceAfter = await treasury.cbiBalance();

    expect(cbiUserBalanceAfter.sub(cbiUserBalanceStart)).to.equal(
      withdrawAmount
    );
    expect(cbiTreasuryBalanceStart.sub(cbiTreasuryBalanceAfter)).to.equal(
      withdrawAmount
    );
  });

  it("should be reverted withdraw if caller on a admin or owner", async () => {
    let withdrawAmount = BigNumber.from("100000000000000000000");

    await expect(
      treasury
        .connect(accounts[4])
        .withdraw(cbiToken.address, withdrawAmount, accounts[0].address, 1)
    ).to.be.revertedWith("Ownable: Caller is not the admin");
  });

  it("should reverted withdraw if input token balance not enough", async () => {
    let cbiTreasuryBalance = await treasury.cbiBalance();

    await expect(
      treasury.withdraw(
        cbiToken.address,
        cbiTreasuryBalance + 1,
        accounts[0].address,
        1
      )
    ).to.be.revertedWith("CBI_Treasury: Not enough token balance");
  });

  it("should reverted withdraw if amount greater than withdraw limit", async () => {
    let cbiTreasuryBalance = await treasury.cbiBalance();

    let limitAmount = BigNumber.from("1000000000000000000000");
    await treasury.updateAllowedToken(
      cbiToken.address,
      true,
      limitAmount,
      limitAmount
    );

    await expect(
      treasury.withdraw(
        cbiToken.address,
        cbiTreasuryBalance,
        accounts[0].address,
        1
      )
    ).to.be.revertedWith("CBI_Treasury: Token withdraw limit exceeded");
  });

  it("withdraw method should reverted if not allowed token", async () => {
    await expect(
      treasury.withdraw(
        testToken.address,
        "1000000000000000",
        accounts[0].address,
        1
      )
    ).to.be.revertedWith("CBI_Treasury: Not allowed token");
  });

  it("updateAdmin method must update contract admin", async () => {
    await treasury.updateAdmin(accounts[0].address);
    let admin = await treasury.admin();
    expect(admin).to.equal(accounts[0].address);
  });

  it("should be reverted if new admin equal zero address", async () => {
    await expect(treasury.updateAdmin(ZERO_ADDRESS)).to.be.revertedWith(
      "CBI_Treasury: Null address"
    );
  });

  it("should be reverted if new admin equal previus admin", async () => {
    await expect(treasury.updateAdmin(accounts[0].address)).to.be.revertedWith(
      "CBI_Treasury: new admin equal to the current admin"
    );
  });

  it("should update usdt token parameters", async () => {
    let limitAmount = BigNumber.from("100000000000");
    await treasury.updateAllowedToken(
      usdtToken.address,
      true,
      limitAmount,
      limitAmount
    );

    let tokenInfo = await treasury.allowedTokensInfo(usdtToken.address);

    expect(tokenInfo.allowed).to.equal(true);
    expect(tokenInfo.withdrawLimit).to.equal(limitAmount);
    expect(tokenInfo.tokenAddress).to.equal(usdtToken.address);
    expect(tokenInfo.swapLimit).to.equal(limitAmount);
  });

  it("should add new allowed token", async () => {
    let swapLimitAmount = BigNumber.from("100000000000");
    let withdrawLimitAmount = BigNumber.from("100000000000");
    await treasury.updateAllowedToken(
      testToken.address,
      true,
      swapLimitAmount,
      withdrawLimitAmount
    );

    let tokenInfo = await treasury.allowedTokensInfo(testToken.address);

    expect(tokenInfo.allowed).to.equal(true);
    expect(tokenInfo.tokenAddress).to.equal(testToken.address);
    expect(tokenInfo.swapLimit).to.equal(swapLimitAmount);
    expect(tokenInfo.withdrawLimit).to.equal(withdrawLimitAmount);
  });

  it("should be reverted if new allowed token not a contract", async () => {
    let swapLimitAmount = BigNumber.from("100000000000");
    await expect(
      treasury.updateAllowedToken(
        accounts[10].address,
        true,
        swapLimitAmount,
        swapLimitAmount
      )
    ).to.be.revertedWith("CBI_Treasury: Not contract");
  });

  it("should rescue erc20 tokens from treasury", async () => {
    let treasuryCbiBalance = await treasury.cbiBalance();
    let userBalanceStart = await cbiToken.balanceOf(accounts[0].address);

    await treasury.rescue(
      accounts[0].address,
      cbiToken.address,
      treasuryCbiBalance
    );
    let treasuryCbiBalanceAfter = await treasury.cbiBalance();
    let userBalanceAfter = await cbiToken.balanceOf(accounts[0].address);
    expect(treasuryCbiBalanceAfter).to.equal(0);
    expect(userBalanceAfter).to.equal(userBalanceStart.add(treasuryCbiBalance));
  });

  it("should rescue FTM tokens from treasury", async () => {
    await accounts[1].sendTransaction({
      to: treasury.address,
      value: ethers.utils.parseEther("9000"),
    });

    let treasuryFtmBalance = await provider.getBalance(treasury.address);
    let userFtmBalance = await provider.getBalance(accounts[2].address);

    await treasury.rescueFTM(accounts[2].address, treasuryFtmBalance);

    let treasuryFtmBalanceAfter = await provider.getBalance(treasury.address);
    let userFtmBalanceAfter = await provider.getBalance(accounts[2].address);
    expect(treasuryFtmBalanceAfter).to.equal(0);
    expect(userFtmBalanceAfter).to.equal(
      userFtmBalance.add(treasuryFtmBalance)
    );
  });

  it("should reverted rescue erc20 tokens, if zero amount", async () => {
    await expect(
      treasury.rescue(accounts[0].address, cbiToken.address, "0")
    ).to.be.revertedWith("CBI_Rescue: Cannot rescue 0");
  });

  it("should reverted rescue FTM, if zero amount", async () => {
    await expect(
      treasury.rescueFTM(accounts[0].address, "0")
    ).to.be.revertedWith("CBI_Rescue: Cannot rescue 0");
  });

  it("should reverted rescue erc20 tokens, if zero address", async () => {
    await expect(
      treasury.rescue(ZERO_ADDRESS, cbiToken.address, "1000")
    ).to.be.revertedWith("CBI_Rescue: Cannot rescue to the zero address");
  });

  it("should reverted rescue FTM, if zero address", async () => {
    await expect(
      treasury.rescueFTM(ZERO_ADDRESS, "1000000")
    ).to.be.revertedWith("CBI_Rescue: Cannot rescue to the zero address");
  });
});
