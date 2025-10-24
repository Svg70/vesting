import hre from "hardhat";
import { formatEther, parseEther } from "viem";
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

// Helper to convert a Substrate address string to a CrossAddress object
function substrateAddressToCrossAddress(address: string): { eth: `0x${string}`, sub: bigint } {
    const publicKey = decodeAddress(address);
    const publicKeyHex = u8aToHex(publicKey);
    return {
        eth: '0x0000000000000000000000000000000000000000',
        sub: BigInt(publicKeyHex)
    };
}

async function main() {
  console.log("🚀 Starting deployment of Native Currency Vesting Contract...\n");

  const wallets = await hre.viem.getWalletClients();
  const deployer = wallets[0];
  console.log("Deploying with account:", deployer.account.address);

  const publicClient = await hre.viem.getPublicClient();
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account balance:", formatEther(balance), "UNQ\n");

  const requiredAmount = parseEther("30");
  if (balance < requiredAmount) {
    throw new Error(`Insufficient balance! Need at least ${formatEther(requiredAmount)} UNQ`);
  }

  // ============================================
  // STEP 1: Deploy VestingNative Contract
  // ============================================
  console.log("📦 Step 1: Deploying VestingNative contract...");
  
  const startTimestamp = BigInt(Math.floor(Date.now() / 1000) + 60); // Start in 1 minute
  const durationSeconds = BigInt(1000);

  console.log("Vesting parameters:");
  console.log("  Start:", new Date(Number(startTimestamp) * 1000).toISOString());
  console.log("  Duration:", durationSeconds.toString(), "seconds");
  console.log("  End:", new Date(Number(startTimestamp + durationSeconds) * 1000).toISOString(), "\n");

  const vesting = await hre.viem.deployContract("VestingNative", [
    startTimestamp,
    durationSeconds
  ]);
  const vestingAddress = vesting.address;
  console.log("✅ VestingNative deployed to:", vestingAddress, "\n");

  // ============================================
  // STEP 2: Add Beneficiaries
  // ============================================
  console.log("📦 Step 2: Adding beneficiaries...");
  
  const substrateAddresses = [
    "5Dk4rtWakTmYSVi5gc9NaQBz6FrwATc2RgKyDB4Pim7X8SnT",
    "5Cnx9ZfNaSo9DeMNgjvFSqk9XiVpQ1ofX8Fourj6r5yLAtpv"
  ];

  // Convert addresses to CrossAddress struct format
  const beneficiaries = substrateAddresses.map(substrateAddressToCrossAddress);
  console.log("Beneficiaries prepared for contract:", beneficiaries);

  const allocationAmount = parseEther("10");
  const amounts = [allocationAmount, allocationAmount];
  const totalAllocation = allocationAmount * BigInt(beneficiaries.length);

  const addBeneficiariesHash = await vesting.write.batchAddBenefitiaries([
    beneficiaries,
    amounts
  ]);
  console.log("Transaction hash:", addBeneficiariesHash);
  
  const addBeneficiariesReceipt = await publicClient.waitForTransactionReceipt({ hash: addBeneficiariesHash });
  console.log("✅ Added beneficiaries in block:", addBeneficiariesReceipt.blockNumber);
  console.log("Total allocation:", formatEther(totalAllocation), "UNQ\n");

  // ============================================
  // STEP 3: Donate native currency to vesting
  // ============================================
  console.log("📦 Step 3: Donating native currency to vesting contract...");
  
  const donationAmount = totalAllocation + parseEther("5");
  console.log("Donating", formatEther(donationAmount), "UNQ...");
  
  const donateHash = await vesting.write.donate([], { value: donationAmount });
  console.log("Donate transaction hash:", donateHash);
  
  const donateReceipt = await publicClient.waitForTransactionReceipt({ hash: donateHash });
  console.log("✅ Donation confirmed in block:", donateReceipt.blockNumber);
  
  const contractBalance = await publicClient.getBalance({ address: vestingAddress });
  console.log("Contract balance after donation:", formatEther(contractBalance), "UNQ\n");

  // ============================================
  // STEP 4: Verify setup
  // ============================================
  console.log("📦 Step 4: Verifying setup...\n");
  
  const donatedTotal = await vesting.read.donatedTotal();
  const releasedTotal = await vesting.read.releasedTotal();
  
  console.log("=== Contract State ===");
  console.log("Total donated:", formatEther(donatedTotal), "UNQ");
  console.log("Total released:", formatEther(releasedTotal), "UNQ");
  console.log("Contract balance:", formatEther(contractBalance), "UNQ");
  
  console.log("\n=== Beneficiary Allocations ===");
  for (let i = 0; i < beneficiaries.length; i++) {
    const beneficiary = beneficiaries[i];
    const addressStr = substrateAddresses[i];

    const allocated = await vesting.read.allocatedAmount([beneficiary]);
    const releasable = await vesting.read.releasable([beneficiary]);
    const released = await vesting.read.released([beneficiary]);
    
    console.log(`\nBeneficiary: ${addressStr}`);
    console.log(`  Allocated: ${formatEther(allocated)} UNQ`);
    console.log(`  Released: ${formatEther(released)} UNQ`);
    console.log(`  Releasable now (before start): ${formatEther(releasable)} UNQ`);
  }

  // ============================================
  // STEP 5: Optional - Test immediate release
  // ============================================
  console.log("\n📦 Step 5: Testing release functionality...");
  
  console.log(`Waiting for vesting to start at ${new Date(Number(startTimestamp) * 1000).toLocaleString()}...`);
  // Note: For a real test, you'd wait until after the start time. 
  // Here we just check the logic.

  const firstBeneficiary = beneficiaries[0];
  const firstBeneficiaryAddressStr = substrateAddresses[0];

  // We can't check the balance of a Substrate address directly with viem's getBalance.
  // We can only attempt the release and see if it succeeds.
  
  console.log(`\nTo test release after vesting starts, anyone can call releaseFor for ${firstBeneficiaryAddressStr}`);
  
  try {
    const releasableNow = await vesting.read.releasable([firstBeneficiary]);
    if (releasableNow > 0) {
      console.log(`SUCCESS: ${firstBeneficiaryAddressStr} can release ${formatEther(releasableNow)} UNQ.`);
      console.log("Attempting to release for them...");

      const releaseHash = await vesting.write.releaseFor([firstBeneficiary]);
      const releaseReceipt = await publicClient.waitForTransactionReceipt({ hash: releaseHash });
      console.log("✅ Release transaction sent successfully in block:", releaseReceipt.blockNumber);
    } else {
        console.log("INFO: Nothing to release yet (likely because vesting hasn't started). This is expected.");
    }
  } catch (error) {
      console.error("❌ Release failed (this is expected if vesting hasn't started):", error.message);
  }


  // ... (Summary section remains the same)
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(50));
}

main()
  .then(() => {
    console.log("\n✅ All operations completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });