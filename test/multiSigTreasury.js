const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { BigNumber } = require("ethers");
const router_abi = require("./abis/routerAbi.json");
const { nowInSeconds } = require("../utills/timeHelpers");
const { ROUTER_ADDRESS, MAX_UINT, address } = require("./constants");

const provider = waffle.provider;

describe("MultiSIgTreasury tests", () => {
  let usdtToken,
    cbiToken,
    testToken,
    treasury,
    router,
    accounts,
    deployer,
    admins,
    factory;

  before("Init test environment", async () => {
    const TREASURY = await ethers.getContractFactory(
      "contracts/MultiSigTreasury.sol:MultiSigTreasury"
    );
    const CBI = await ethers.getContractFactory(
      "contracts/CBI_ERC20.sol:CBI_ERC20"
    );
    const USDT = await ethers.getContractFactory(
      "contracts/test/USDT.sol:USDT_ERC20"
    );

    factory = await ethers.getContractFactory(
      "contracts/MultiSigTreasury.sol:MultiSigTreasury"
    );

    const [ownerAccount, ...others] = await hre.ethers.getSigners();
    accounts = others;
    deployer = ownerAccount;

    admins = [
      accounts[0].address,
      accounts[1].address,
      accounts[2].address,
      accounts[3].address,
    ];

    usdtToken = await USDT.deploy("USDT", "USDT", "6", "1000000000000000");
    testToken = await USDT.deploy("Test", "TST", "6", "1000000000000000");
    cbiToken = await CBI.deploy("1000000000000000000000000000");
    router = await ethers.getContractAt(router_abi, ROUTER_ADDRESS);
    treasury = await TREASURY.deploy(
      router.address,
      cbiToken.address,
      usdtToken.address,
      admins,
      4
    );

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

    for (let i = 0; i <= 10; i++) {
      await cbiToken.transfer(accounts[i].address, "10000000000000000000000");
      await usdtToken.transfer(accounts[i].address, "10000000000");
      await testToken.transfer(accounts[i].address, "10000000000");
    }
    await cbiToken.transfer(treasury.address, "100000000000000000000000");
    await usdtToken.transfer(treasury.address, "50000000000");
  });

  describe("test create trx and vote", async () => {
    it("should create withdraw trx and make withdraw erc20 tokens after multi sig", async () => {
      let cbiBalanceStart = await treasury.cbiBalance();
      let amount = BigNumber.from("1000");

      await treasury
        .connect(accounts[0])
        .createWithdrawTrx(
          cbiToken.address,
          amount,
          accounts[12].address,
          false
        );

      await treasury.connect(accounts[1]).withdrawVote(0, true);
      await treasury.connect(accounts[2]).withdrawVote(0, true);
      await treasury.connect(accounts[3]).withdrawVote(0, true);

      let cbiBalanceAfter = await treasury.cbiBalance();

      let balanceAfter = await cbiToken.balanceOf(accounts[12].address);

      expect(balanceAfter).to.equal(amount);
      expect(cbiBalanceStart.sub(cbiBalanceAfter)).to.equal(amount);
    });

    it("should reject withdraw trx", async () => {
      let amount = BigNumber.from("1000");
      let cbiBalanceStart = await treasury.cbiBalance();

      let balance = await cbiToken.balanceOf(accounts[12].address);

      await treasury
        .connect(accounts[0])
        .createWithdrawTrx(
          cbiToken.address,
          amount,
          accounts[12].address,
          false
        );

      await treasury.connect(accounts[1]).withdrawVote(1, true);
      await treasury.connect(accounts[2]).withdrawVote(1, true);
      await treasury.connect(accounts[3]).withdrawVote(1, false);

      let cbiBalanceAfter = await treasury.cbiBalance();
      let balanceAfter = await cbiToken.balanceOf(accounts[12].address);

      expect(cbiBalanceStart).to.equal(cbiBalanceAfter);
      expect(balance).to.equal(balanceAfter);
    });

    it("should create withdraw trx and make withdraw FTM after multi sig", async () => {
      await accounts[1].sendTransaction({
        to: treasury.address,
        value: ethers.utils.parseEther("9000"),
      });

      let treasuryFtmBalance = await provider.getBalance(treasury.address);
      let userFtmBalance = await provider.getBalance(accounts[12].address);

      await treasury
        .connect(accounts[0])
        .createWithdrawTrx(
          address(0),
          treasuryFtmBalance,
          accounts[12].address,
          true
        );

      await treasury.connect(accounts[1]).withdrawVote(2, true);
      await treasury.connect(accounts[2]).withdrawVote(2, true);
      await treasury.connect(accounts[3]).withdrawVote(2, true);

      let treasuryFtmBalanceAfter = await provider.getBalance(treasury.address);
      let userFtmBalanceAfter = await provider.getBalance(accounts[12].address);

      expect(treasuryFtmBalanceAfter).to.equal(0);
      expect(userFtmBalanceAfter).to.equal(
        userFtmBalance.add(treasuryFtmBalance)
      );
    });
    it("should create swap trx and make swap", async () => {
      await cbiToken.transfer(treasury.address, "100000000000000000000000");
      await usdtToken.transfer(treasury.address, "50000000000");

      let usdtBalanceStart = await treasury.usdtBalance();
      let cbiBalanceStart = await treasury.cbiBalance();

      let amountUSDT = BigNumber.from("1000000000");
      let cbiSwapAmount = await router.getAmountsOut(amountUSDT, [
        usdtToken.address,
        cbiToken.address,
      ]);

      let trxId = await treasury.trxCounter();

      await treasury
        .connect(accounts[0])
        .createSwapTokensTrx(
          usdtToken.address,
          cbiToken.address,
          amountUSDT,
          accounts[14].address
        );

      await treasury.connect(accounts[1]).swapTokensVote(trxId, true);
      await treasury.connect(accounts[2]).swapTokensVote(trxId, true);
      await treasury.connect(accounts[3]).swapTokensVote(trxId, true);

      let usdtBalanceAfter = await treasury.usdtBalance();
      let cbiBalanceAfter = await treasury.cbiBalance();

      expect(usdtBalanceStart.sub(usdtBalanceAfter)).to.equal(amountUSDT);
      expect(cbiBalanceAfter.sub(cbiBalanceStart)).to.equal(cbiSwapAmount[1]);
      expect(cbiBalanceAfter).gt(cbiBalanceStart);
    });

    it("should reject swap trx", async () => {
      await cbiToken.transfer(treasury.address, "100000000000000000000000");
      await usdtToken.transfer(treasury.address, "50000000000");

      let usdtBalanceStart = await treasury.usdtBalance();
      let cbiBalanceStart = await treasury.cbiBalance();

      let amountUSDT = BigNumber.from("1000000000");
      let trxId = await treasury.trxCounter();

      await treasury
        .connect(accounts[0])
        .createSwapTokensTrx(
          usdtToken.address,
          cbiToken.address,
          amountUSDT,
          accounts[14].address
        );

      await treasury.connect(accounts[1]).swapTokensVote(trxId, true);
      await treasury.connect(accounts[2]).swapTokensVote(trxId, true);
      await treasury.connect(accounts[3]).swapTokensVote(trxId, false);

      let usdtBalanceAfter = await treasury.usdtBalance();
      let cbiBalanceAfter = await treasury.cbiBalance();

      let trx = await treasury.trxData(trxId);

      expect(usdtBalanceStart).to.equal(usdtBalanceAfter);
      expect(cbiBalanceAfter).to.equal(cbiBalanceStart);
      expect(trx.status).equal(2);
      expect(trx.rejects).to.equal(1);
      expect(trx.confirmations).to.equal(3);
    });
  });

  describe("test replenish", async () => {
    it("replenish method should transfer cbi token from user to Treasury", async () => {
      let userCbiBalanceStart = await cbiToken.balanceOf(accounts[0].address);
      let treasuryCbiBalanceStart = await treasury.cbiBalance();
      let replenichCbiAmount = BigNumber.from("100000000000000000000");

      await cbiToken.connect(accounts[0]).approve(treasury.address, MAX_UINT);
      await treasury
        .connect(accounts[0])
        .replenish(cbiToken.address, replenichCbiAmount);

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
        .replenish(usdtToken.address, replenichUsdtAmount);

      let userUsdtBalanceAfter = await usdtToken.balanceOf(accounts[0].address);
      let treasuryUsdtBalanceAfter = await treasury.usdtBalance();
      expect(userUsdtBalanceStart.sub(replenichUsdtAmount)).to.equal(
        BigNumber.from(userUsdtBalanceAfter)
      );
      expect(treasuryUsdtBalanceAfter.sub(treasuryUsdtBalanceStart)).to.equal(
        BigNumber.from(replenichUsdtAmount)
      );
    });
  });

  describe("test requires", async () => {
    it("replenish method should reverted, if zero token amount", async () => {
      await expect(
        treasury.connect(accounts[0]).replenish(usdtToken.address, "0")
      ).to.be.revertedWith("MultiSigTreasury: Zero amount");
    });

    it("replenish method should reverted, token equal zero address", async () => {
      await expect(
        treasury.connect(accounts[0]).replenish(address(0), "10000000000")
      ).to.be.revertedWith("MultiSigTreasury: Zero address");
    });

    it("should revert createWithdrawTrx if zero amount", async () => {
      await expect(
        treasury
          .connect(accounts[0])
          .createWithdrawTrx(cbiToken.address, 0, accounts[12].address, false)
      ).to.be.revertedWith("MultiSigTreasury: Zero amount");
    });

    it("should revert createWithdrawTrx if zero token address", async () => {
      await expect(
        treasury
          .connect(accounts[0])
          .createWithdrawTrx(address(0), 1000, accounts[12].address, false)
      ).to.be.revertedWith("MultiSigTreasury: Zero address");
    });
    it("should revert createWithdrawTrx if zero recipient address", async () => {
      await expect(
        treasury
          .connect(accounts[0])
          .createWithdrawTrx(cbiToken.address, 1000, address(0), false)
      ).to.be.revertedWith("MultiSigTreasury: Zero address");
    });
    it("should revert createWithdrawTrx if not enough withdraw erc20 token balance", async () => {
      await expect(
        treasury
          .connect(accounts[0])
          .createWithdrawTrx(
            cbiToken.address,
            MAX_UINT,
            accounts[10].address,
            false
          )
      ).to.be.revertedWith("MultiSigTreasury: Not enough token balance");
    });
    it("should revert createWithdrawTrx if not enough withdraw FTM balance", async () => {
      await expect(
        treasury
          .connect(accounts[0])
          .createWithdrawTrx(
            cbiToken.address,
            MAX_UINT,
            accounts[10].address,
            true
          )
      ).to.be.revertedWith("MultiSigTreasury: Not enough token balance");
    });

    it("should revert withdrawVote if transaction completed", async () => {
      await expect(
        treasury.connect(accounts[1]).withdrawVote(2, true)
      ).to.be.revertedWith("MultiSigTreasury: Transaction completed");
    });
    it("should revert withdrawVote if transaction not created", async () => {
      await expect(
        treasury.connect(accounts[1]).withdrawVote(12, true)
      ).to.be.revertedWith("MultiSigTreasury: Transaction not created");
    });
    it("should revert withdrawVote if user voted", async () => {
      let amount = BigNumber.from("1000");
      let trxId = await treasury.trxCounter();

      await treasury
        .connect(accounts[0])
        .createWithdrawTrx(
          cbiToken.address,
          amount,
          accounts[12].address,
          false
        );

      await expect(
        treasury.connect(accounts[0]).withdrawVote(trxId, true)
      ).to.be.revertedWith("MultiSigTreasury: You have already voted");
    });
    it("should revert create swap trx if zero amount", async () => {
      let amountUSDT = BigNumber.from("1000000000");
      await expect(
        treasury
          .connect(accounts[0])
          .createSwapTokensTrx(
            usdtToken.address,
            cbiToken.address,
            0,
            accounts[14].address
          )
      ).to.be.revertedWith("MultiSigTreasury: Zero amount");
    });
    it("should revert create swap trx if input token equal zero address", async () => {
      let amountUSDT = BigNumber.from("1000000000");
      await expect(
        treasury
          .connect(accounts[0])
          .createSwapTokensTrx(
            address(0),
            cbiToken.address,
            amountUSDT,
            accounts[14].address
          )
      ).to.be.revertedWith("MultiSigTreasury: Zero address");
    });

    it("should revert create swap trx if output token equal zero address", async () => {
      let amountUSDT = BigNumber.from("1000000000");
      await expect(
        treasury
          .connect(accounts[0])
          .createSwapTokensTrx(
            usdtToken.address,
            address(0),
            amountUSDT,
            accounts[14].address
          )
      ).to.be.revertedWith("MultiSigTreasury: Zero address");
    });

    it("should revert create swap trx if not enough token balance", async () => {
      await expect(
        treasury
          .connect(accounts[0])
          .createSwapTokensTrx(
            usdtToken.address,
            cbiToken.address,
            MAX_UINT,
            accounts[14].address
          )
      ).to.be.revertedWith("MultiSigTreasury: Not enough token balance");
    });
    it("should revert swap tokens vote if transaction not created", async () => {
      await expect(
        treasury.connect(accounts[1]).swapTokensVote(1000, true)
      ).to.be.revertedWith("MultiSigTreasury: Transaction not created");
    });
    it("should revert swap tokens vote if transaction completed", async () => {
      await expect(
        treasury.connect(accounts[1]).swapTokensVote(3, true)
      ).to.be.revertedWith("MultiSigTreasury: Transaction completed");
    });
    it("should revert swap tokens vote if admin already voted", async () => {
      let trxId = await treasury.trxCounter();
      await treasury
        .connect(accounts[0])
        .createSwapTokensTrx(
          usdtToken.address,
          cbiToken.address,
          1000,
          accounts[14].address
        );
      await expect(
        treasury.connect(accounts[0]).swapTokensVote(trxId, true)
      ).to.be.revertedWith("MultiSigTreasury: You have already voted");
    });
    it("should revert addVerifyier if verifyer equal zero address", async () => {
      await expect(treasury.addVerifiyer(address(0))).to.be.revertedWith(
        "MultiSigTreasury: Zero address"
      );
    });
    it("should revert removeVerifyier if address verifyer not a verifyer", async () => {
      await expect(treasury.removeVerifiyer(address(0))).to.be.revertedWith(
        "MultiSigTreasury: Not a verifyer"
      );
    });
    it("should revert updateQuorum if new value equal zero", async () => {
      await expect(treasury.updateQuorum(0)).to.be.revertedWith(
        "MultiSigTreasury: Quorum should be don`t equal zero"
      );
    });
  });

  describe("test events", async () => {
    it("replenish method should emit event Replenish", async () => {
      let replenichCbiAmount = BigNumber.from("100000000000000000000");
      expect(treasury.connect(accounts[0]).replenish(1, replenichCbiAmount))
        .to.emit(treasury, "Replenish")
        .withArgs(cbiToken.address, replenichCbiAmount, accounts[0].address);
    });
  });

  describe("test setters", async () => {
    it("should add new verifiyer", async () => {
      await treasury.addVerifiyer(accounts[4].address);
      expect(await treasury.admins(4)).equal(accounts[4].address);
      expect(await treasury.quorum()).equal(5);
    });

    it("should remove verifiyer", async () => {
      await treasury.removeVerifiyer(accounts[4].address);
      let admins = await treasury.getAdmins();

      for (let i = 0; i <= admins.length - 1; i++) {
        if (admins[i] != accounts[4].address) {
          inArray = false;
        } else {
          inArray = true;
        }
      }
      expect(inArray).to.be.equal(false);
      expect(await treasury.quorum()).equal(4);
    });

    it("should update quorum", async () => {
      await treasury.updateQuorum(3);
      expect(await treasury.quorum()).to.equal(3);
    });
  });
  describe("deploy tests", () => {
    it("should be reverted deploy if admins addresses length equal zero", async () => {
      await expect(
        factory.deploy(
          router.address,
          cbiToken.address,
          usdtToken.address,
          [],
          4
        )
      ).to.be.revertedWith("MultiSigTreasury: Zero length");
    });
    it("should be reverted contract deploy if usdt address not a contract", async () => {
      await expect(
        factory.deploy(
          router.address,
          cbiToken.address,
          accounts[5].address,
          admins,
          4
        )
      ).to.be.revertedWith("MultiSigTreasury: Not contract");
    });

    it("should be reverted contract deploy if cbi address not a contract", async () => {
      await expect(
        factory.deploy(
          router.address,
          accounts[5].address,
          usdtToken.address,
          admins,
          4
        )
      ).to.be.revertedWith("MultiSigTreasury: Not contract");
    });

    it("should be reverted contract deploy if router address not a contract", async () => {
      await expect(
        factory.deploy(
          accounts[5].address,
          router.address,
          usdtToken.address,
          admins,
          4
        )
      ).to.be.revertedWith("MultiSigTreasury: Not contract");
    });
    it("should be reverted contract deploy if quorum equal zero", async () => {
      await expect(
        factory.deploy(
          router.address,
          cbiToken.address,
          usdtToken.address,
          admins,
          0
        )
      ).to.be.revertedWith("MultiSigTreasury: Must be greater than zero");
    });
    it("should be reverted contract deploy if one of the admins equal zero address", async () => {
      await expect(
        factory.deploy(
          router.address,
          cbiToken.address,
          usdtToken.address,
          [
            accounts[2].address,
            accounts[3].address,
            accounts[4].address,
            address(0),
          ],
          4
        )
      ).to.be.revertedWith("MultiSigTreasury: Admin can`t be zero address");
    });
  });
});
