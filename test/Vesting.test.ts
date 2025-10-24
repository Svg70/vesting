import { expect } from "chai";
import { ethers } from "hardhat";
import { Vesting, TestToken } from "../typechain-types";

describe("Vesting Contract", function () {
  let vesting: Vesting;
  let testToken: TestToken;
  let owner: any;
  let user1: any;
  let user2: any;

  const testAddresses = [
    "0x4a418261b1be71c636251611771be6eb06d6ce31",
    "0x20386a7045181aa18a3b580cacaf3cdc921db4b3"
  ];

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Деплоим TestToken
    const TestToken = await ethers.getContractFactory("TestToken");
    testToken = await TestToken.deploy();
    await testToken.waitForDeployment();

    // Настраиваем параметры для Vesting
    const startTimestamp = Math.floor(Date.now() / 1000) + 60;
    const durationSeconds = 1000;

    // Деплоим Vesting контракт
    const Vesting = await ethers.getContractFactory("Vesting");
    vesting = await Vesting.deploy(await testToken.getAddress(), startTimestamp, durationSeconds);
    await vesting.waitForDeployment();

    // Минтим токены
    await testToken.mint(owner.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await vesting.token()).to.equal(await testToken.getAddress());
    });

    it("Should set the correct start timestamp", async function () {
      const start = await vesting.start();
      expect(start).to.be.greaterThan(0);
    });

    it("Should set the correct duration", async function () {
      const duration = await vesting.duration();
      expect(duration).to.equal(1000);
    });
  });

  describe("Batch Add Beneficiaries", function () {
    it("Should add beneficiaries correctly", async function () {
      const amounts = [ethers.parseEther("10"), ethers.parseEther("10")];
      
      await vesting.batchAddBenefitiaries(testAddresses, amounts);

      for (let i = 0; i < testAddresses.length; i++) {
        const allocated = await vesting.allocatedAmount(testAddresses[i]);
        expect(allocated).to.equal(amounts[i]);
      }
    });

    it("Should reject adding beneficiaries with wrong array lengths", async function () {
      const amounts = [ethers.parseEther("10")];
      
      await expect(
        vesting.batchAddBenefitiaries(testAddresses, amounts)
      ).to.be.revertedWith("wrong length");
    });

    it("Should reject adding already allocated beneficiary", async function () {
      const amounts = [ethers.parseEther("10"), ethers.parseEther("10")];
      
      await vesting.batchAddBenefitiaries(testAddresses, amounts);
      
      await expect(
        vesting.batchAddBenefitiaries(testAddresses, amounts)
      ).to.be.revertedWith("unique is already allocated");
    });
  });

  describe("Donation and Release", function () {
    beforeEach(async function () {
      const amounts = [ethers.parseEther("10"), ethers.parseEther("10")];
      await vesting.batchAddBenefitiaries(testAddresses, amounts);
    });

    it("Should allow donation", async function () {
      await testToken.approve(await vesting.getAddress(), ethers.parseEther("20"));
      await vesting.donate(ethers.parseEther("20"));

      const balance = await testToken.balanceOf(await vesting.getAddress());
      expect(balance).to.equal(ethers.parseEther("20"));
    });

    it("Should reject release without donation", async function () {
      const vestingUser1 = vesting.connect(user1);
      await expect(vestingUser1.release()).to.be.revertedWith("not enough is donated");
    });

    it("Should allow release after donation and time", async function () {
      // Донатим токены
      await testToken.approve(await vesting.getAddress(), ethers.parseEther("20"));
      await vesting.donate(ethers.parseEther("20"));

      // Ждем начала вестинга
      await ethers.provider.send("evm_increaseTime", [60]);
      await ethers.provider.send("evm_mine", []);

      // Создаем кошелек для первого тестового адреса
      const testWallet1 = new ethers.Wallet("0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133", ethers.provider);
      
      // Проверяем, что можно релизить
      const releasable = await vesting.releasable(testAddresses[0]);
      expect(releasable).to.equal(ethers.parseEther("10"));

      // Релизим токены
      const vestingTestWallet1 = vesting.connect(testWallet1);
      await vestingTestWallet1.release();

      const balance = await testToken.balanceOf(testAddresses[0]);
      expect(balance).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Refund Donation", function () {
    beforeEach(async function () {
      const amounts = [ethers.parseEther("10"), ethers.parseEther("10")];
      await vesting.batchAddBenefitiaries(testAddresses, amounts);
      
      await testToken.approve(await vesting.getAddress(), ethers.parseEther("20"));
      await vesting.donate(ethers.parseEther("20"));
    });

    it("Should allow refund donation", async function () {
      const initialBalance = await testToken.balanceOf(owner.address);
      
      await vesting.refundDonation(ethers.parseEther("10"));
      
      const finalBalance = await testToken.balanceOf(owner.address);
      expect(finalBalance).to.be.greaterThan(initialBalance);
    });

    it("Should reject refund more than donated", async function () {
      await expect(
        vesting.refundDonation(ethers.parseEther("30"))
      ).to.be.revertedWith("amount should be less or equal to donation");
    });
  });
});

