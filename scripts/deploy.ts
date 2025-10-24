import hre from "hardhat";
import { formatEther, parseEther } from "viem";

async function main() {
  console.log("🚀 Starting deployment of Native Currency Vesting Contract...\n");

  // Get signers using viem
  const wallets = await hre.viem.getWalletClients();
  const deployer = wallets[0];
  
  console.log("Deploying with account:", deployer.account.address);
  
  // Get public client for balance check
  const publicClient = await hre.viem.getPublicClient();
  const balance = await publicClient.getBalance({ 
    address: deployer.account.address 
  });
  console.log("Account balance:", formatEther(balance), "UNQ\n");

  // Check if we have enough balance
  const requiredAmount = parseEther("30"); // Need at least 30 UNQ for donations
  if (balance < requiredAmount) {
    throw new Error(`Insufficient balance! Need at least ${formatEther(requiredAmount)} UNQ`);
  }

  // ============================================
  // STEP 1: Deploy VestingNative Contract
  // ============================================
  
  console.log("📦 Step 1: Deploying VestingNative contract...");
  
  // Vesting parameters
  const startTimestamp = BigInt(Math.floor(Date.now() / 1000) + 60); // Start in 1 minute
  const durationSeconds = BigInt(1000); // Duration 1000 seconds

  console.log("Vesting parameters:");
  console.log("  Start:", new Date(Number(startTimestamp) * 1000).toISOString());
  console.log("  Duration:", durationSeconds.toString(), "seconds");
  console.log("  End:", new Date(Number(startTimestamp + durationSeconds) * 1000).toISOString(), "\n");

  // Deploy VestingNative contract
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
  
  // Test addresses
  const testAddresses = [
    "0x4a418261b1be71c636251611771be6eb06d6ce31",
    "0x20386a7045181aa18a3b580cacaf3cdc921db4b3"
  ] as const;

  // Allocate 10 UNQ to each address
  const allocationAmount = parseEther("10");
  const amounts = [allocationAmount, allocationAmount];
  const totalAllocation = allocationAmount * BigInt(testAddresses.length);

  const addBeneficiariesHash = await vesting.write.batchAddBenefitiaries([
    testAddresses,
    amounts
  ]);
  
  console.log("Transaction hash:", addBeneficiariesHash);
  
  const addBeneficiariesReceipt = await publicClient.waitForTransactionReceipt({ 
    hash: addBeneficiariesHash,
    confirmations: 1,
  });
  
  console.log("✅ Added beneficiaries in block:", addBeneficiariesReceipt.blockNumber);
  console.log("Total allocation:", formatEther(totalAllocation), "UNQ\n");

  // ============================================
  // STEP 3: Donate native currency to vesting
  // ============================================
  
  console.log("📦 Step 3: Donating native currency to vesting contract...");
  
  // Amount to donate (should be at least equal to total allocation)
  const donationAmount = totalAllocation + parseEther("5"); // Extra 5 UNQ for safety
  
  console.log("Donating", formatEther(donationAmount), "UNQ...");
  
  // Method 1: Using the donate function
  const donateHash = await vesting.write.donate([], {
    value: donationAmount
  });
  
  console.log("Donate transaction hash:", donateHash);
  
  const donateReceipt = await publicClient.waitForTransactionReceipt({
    hash: donateHash,
    confirmations: 1,
  });
  
  console.log("✅ Donation confirmed in block:", donateReceipt.blockNumber);
  
  // Check contract balance
  const contractBalance = await publicClient.getBalance({ 
    address: vestingAddress 
  });
  console.log("Contract balance after donation:", formatEther(contractBalance), "UNQ\n");

  // ============================================
  // STEP 4: Verify setup
  // ============================================
  
  console.log("📦 Step 4: Verifying setup...\n");
  
  // Check vesting contract state
  const donatedTotal = await vesting.read.donatedTotal() as bigint;
  const releasedTotal = await vesting.read.releasedTotal() as bigint;
  
  console.log("=== Contract State ===");
  console.log("Total donated:", formatEther(donatedTotal), "UNQ");
  console.log("Total released:", formatEther(releasedTotal), "UNQ");
  console.log("Contract balance:", formatEther(contractBalance), "UNQ");
  
  // Check allocations
  console.log("\n=== Beneficiary Allocations ===");
  for (const address of testAddresses) {
    const allocated = await vesting.read.allocatedAmount([address]) as bigint;
    const releasable = await vesting.read.releasable([address]) as bigint;
    const released = await vesting.read.released([address]) as bigint;
    
    console.log(`\nBeneficiary: ${address}`);
    console.log(`  Allocated: ${formatEther(allocated)} UNQ`);
    console.log(`  Released: ${formatEther(released)} UNQ`);
    console.log(`  Releasable now: ${formatEther(releasable)} UNQ`);
  }

  // ============================================
  // STEP 5: Optional - Test immediate release
  // ============================================
  
  console.log("\n📦 Step 5: Testing release functionality...");
  
  // Wait a bit to allow some vesting
  console.log("Waiting 2 seconds for some vesting...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check releasable amount for first beneficiary
  const firstBeneficiary = testAddresses[0];
  const releasableNow = await vesting.read.releasable([firstBeneficiary]) as bigint;
  
  if (releasableNow > 0) {
    console.log(`\n${firstBeneficiary} can release ${formatEther(releasableNow)} UNQ`);
    console.log("Attempting to release for them...");
    
    try {
      const releaseHash = await vesting.write.releaseFor([firstBeneficiary]);
      const releaseReceipt = await publicClient.waitForTransactionReceipt({
        hash: releaseHash,
        confirmations: 1,
      });
      console.log("✅ Released successfully in block:", releaseReceipt.blockNumber);
      
      // Check beneficiary balance
      const beneficiaryBalance = await publicClient.getBalance({ 
        address: firstBeneficiary 
      });
      console.log(`Beneficiary balance: ${formatEther(beneficiaryBalance)} UNQ`);
    } catch (error) {
      console.log("Release not available yet (vesting hasn't started)");
    }
  } else {
    console.log("Nothing to release yet (vesting hasn't started)");
  }

  // ============================================
  // Summary
  // ============================================
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(50));
  
  console.log("\n📊 Deployment Summary:");
  console.log("  Network:", hre.network.name);
  console.log("  Deployer:", deployer.account.address);
  console.log("  VestingNative contract:", vestingAddress);
  console.log("  Total donated:", formatEther(donationAmount), "UNQ");
  console.log("  Vesting start:", new Date(Number(startTimestamp) * 1000).toLocaleString());
  console.log("  Vesting end:", new Date(Number(startTimestamp + durationSeconds) * 1000).toLocaleString());
  
  console.log("\n📝 Next Steps:");
  console.log("1. Beneficiaries can call `release()` after vesting starts");
  console.log("2. Anyone can call `releaseFor(beneficiaryAddress)` to help release funds");
  console.log("3. Check releasable amount: `vesting.releasable(beneficiaryAddress)`");
  console.log("4. Additional donations: Send UNQ directly to contract or use `donate()`");
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.account.address,
    contract: {
      address: vestingAddress,
      type: "VestingNative (for native UNQ)"
    },
    vestingParams: {
      startTimestamp: startTimestamp.toString(),
      startDate: new Date(Number(startTimestamp) * 1000).toISOString(),
      durationSeconds: durationSeconds.toString(),
      endDate: new Date(Number(startTimestamp + durationSeconds) * 1000).toISOString()
    },
    beneficiaries: testAddresses.map((addr) => ({
      address: addr,
      allocation: formatEther(allocationAmount) + " UNQ"
    })),
    totalDonated: formatEther(donationAmount) + " UNQ",
    deployedAt: new Date().toISOString()
  };

  console.log("\n📄 Deployment data saved:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

// Run the deployment
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