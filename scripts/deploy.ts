import hre from "hardhat";
import { formatEther, parseEther } from "viem";

async function main() {
  console.log("Starting deployment with native collection (address 0x0)...\n");

  // Get signers using viem
  const wallets = await hre.viem.getWalletClients();
  const deployer = wallets[0];
  
  console.log("Deploying contracts with account:", deployer.account.address);
  
  // Get public client for balance check
  const publicClient = await hre.viem.getPublicClient();
  const balance = await publicClient.getBalance({ 
    address: deployer.account.address 
  });
  console.log("Account balance:", formatEther(balance), "ETH\n");

  // ============================================
  // Native Collection Address (Collection ID 0)
  // ============================================
  
  // В Unique Network нативная коллекция (ID 0) имеет нулевой адрес
  const tokenAddress = "0x0000000000000000000000000000000000000000" as const;
  console.log("Using native collection at address:", tokenAddress);
  console.log("This is the native token collection (ID 0) on Unique Network\n");
  
  // Get token contract instance for native collection
  const token = await hre.viem.getContractAt("IERC20", tokenAddress);
  
  // Check deployer's native token balance
  try {
    const tokenBalance = await token.read.balanceOf([deployer.account.address]) as bigint;
    console.log("Deployer native token balance:", formatEther(tokenBalance), "tokens\n");
  } catch (error) {
    console.log("Note: If balance check fails, make sure the native collection is properly configured\n");
  }

  // ============================================
  // STEP 1: Deploy Vesting Contract
  // ============================================
  
  console.log("📦 Step 1: Deploying Vesting contract for native collection...");
  
  // Vesting parameters
  const startTimestamp = BigInt(Math.floor(Date.now() / 1000) + 60); // Start in 1 minute
  const durationSeconds = BigInt(1000); // Duration 1000 seconds

  console.log("Vesting parameters:");
  console.log("  Token (native collection):", tokenAddress);
  console.log("  Start:", new Date(Number(startTimestamp) * 1000).toISOString());
  console.log("  Duration:", durationSeconds.toString(), "seconds\n");

  // Deploy Vesting contract with native collection address
  const vesting = await hre.viem.deployContract("Vesting", [
    tokenAddress,
    startTimestamp,
    durationSeconds
  ]);
  
  const vestingAddress = vesting.address;
  console.log("✅ Vesting deployed to:", vestingAddress, "\n");

  // ============================================
  // STEP 2: Add Beneficiaries
  // ============================================
  
  console.log("📦 Step 2: Adding beneficiaries...");
  
  // Test addresses
  const testAddresses = [
    "0x4a418261b1be71c636251611771be6eb06d6ce31",
    "0x20386a7045181aa18a3b580cacaf3cdc921db4b3"
  ] as const;

  // Allocate 10 tokens to each address
  const allocationAmount = parseEther("10");
  const amounts = [allocationAmount, allocationAmount];
  const totalAllocation = allocationAmount * BigInt(testAddresses.length);

  try {
    const hash = await vesting.write.batchAddBenefitiaries([
      testAddresses,
      amounts
    ]);
    
    console.log("Transaction hash:", hash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      confirmations: 1,
    });
    
    console.log("✅ Added beneficiaries in block:", receipt.blockNumber);
    console.log("Total allocation:", formatEther(totalAllocation), "tokens\n");
  } catch (error) {
    console.error("Error adding beneficiaries:", error);
    throw error;
  }

  // ============================================
  // STEP 3: Approve native tokens for donation
  // ============================================
  
  console.log("📦 Step 3: Approving native tokens for donation...");
  console.log("Native collection address (0x0) requires special handling in Unique Network");
  
  // Amount to donate (should be at least equal to total allocation)
  const donationAmount = totalAllocation + parseEther("10"); // Total allocation + 10 extra tokens
  
  try {
    // Check current allowance for native collection
    const currentAllowance = await token.read.allowance([
      deployer.account.address,
      vestingAddress
    ]) as bigint;
    console.log("Current allowance:", formatEther(currentAllowance), "tokens");
    
    if (currentAllowance < donationAmount) {
      // Approve the vesting contract to spend native tokens
      console.log("Approving", formatEther(donationAmount), "native tokens...");
      
      const approveHash = await token.write.approve([
        vestingAddress,
        donationAmount
      ]);
      
      console.log("Approve transaction hash:", approveHash);
      
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
        confirmations: 1,
      });
      
      console.log("✅ Approval confirmed in block:", approveReceipt.blockNumber);
    } else {
      console.log("✅ Sufficient allowance already set");
    }
  } catch (error) {
    console.error("Error approving native tokens:", error);
    console.log("\n⚠️  Note: Native collection (0x0) might require special permissions or setup in Unique Network");
    console.log("⚠️  Make sure you have native tokens and the collection is properly configured!");
    throw error;
  }

  // ============================================
  // STEP 4: Donate native tokens to vesting contract
  // ============================================
  
  console.log("\n📦 Step 4: Donating native tokens to vesting contract...");
  
  try {
    // Check vesting contract token balance before donation
    const vestingBalanceBefore = await token.read.balanceOf([vestingAddress]) as bigint;
    console.log("Vesting contract balance before:", formatEther(vestingBalanceBefore), "tokens");
    
    // Donate native tokens
    console.log("Donating", formatEther(donationAmount), "native tokens...");
    
    const donateHash = await vesting.write.donate([donationAmount]);
    
    console.log("Donate transaction hash:", donateHash);
    
    const donateReceipt = await publicClient.waitForTransactionReceipt({
      hash: donateHash,
      confirmations: 1,
    });
    
    console.log("✅ Donation confirmed in block:", donateReceipt.blockNumber);
    
    // Check balance after donation
    const vestingBalanceAfter = await token.read.balanceOf([vestingAddress]) as bigint;
    console.log("Vesting contract balance after:", formatEther(vestingBalanceAfter), "tokens\n");
  } catch (error) {
    console.error("Error donating native tokens:", error);
    console.log("\n⚠️  Make sure the approval was successful!");
    console.log("⚠️  For native collection, you might need to:");
    console.log("    1. Have sufficient native token balance");
    console.log("    2. Have proper permissions for the native collection");
    throw error;
  }

  // ============================================
  // STEP 5: Verify setup
  // ============================================
  
  console.log("📦 Step 5: Verifying setup...\n");
  
  console.log("=== Deployment Summary ===");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.account.address);
  console.log("Token address (native collection):", tokenAddress);
  console.log("Vesting address:", vestingAddress);
  console.log("Start timestamp:", startTimestamp.toString());
  console.log("Duration:", durationSeconds.toString(), "seconds");
  console.log("Total donated:", formatEther(donationAmount), "native tokens");

  // Check allocations
  console.log("\n=== Allocations ===");
  for (const address of testAddresses) {
    try {
      const allocated = await vesting.read.allocatedAmount([address]) as bigint;
      const releasable = await vesting.read.releasable([address]) as bigint;
      const released = await vesting.read.released([address]) as bigint;
      
      console.log(`\nBeneficiary: ${address}`);
      console.log(`  Allocated: ${formatEther(allocated)} native tokens`);
      console.log(`  Released: ${formatEther(released)} native tokens`);
      console.log(`  Releasable now: ${formatEther(releasable)} native tokens`);
    } catch (error) {
      console.error(`Error reading data for ${address}:`, error);
    }
  }

  console.log("\n=== Important Notes for Native Collection (0x0) ===");
  console.log("📌 Native collection in Unique Network:");
  console.log("   - Collection ID: 0");
  console.log("   - Address: 0x0000000000000000000000000000000000000000");
  console.log("   - This is the network's native token collection");
  console.log("   - Supports ERC20 interface for compatibility");

  console.log("\n=== Next Steps ===");
  console.log("✅ Setup complete! The vesting contract is now funded with native tokens.");
  console.log("\n📅 Vesting Timeline:");
  console.log(`   Start: ${new Date(Number(startTimestamp) * 1000).toLocaleString()}`);
  console.log(`   End: ${new Date(Number(startTimestamp + durationSeconds) * 1000).toLocaleString()}`);
  console.log("\n💡 Beneficiaries can claim native tokens by calling:");
  console.log(`   vesting.release() - after vesting period starts`);
  console.log("\n📊 To check claimable amount:");
  console.log(`   vesting.releasable(beneficiaryAddress)`);
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.account.address,
    contracts: {
      token: tokenAddress,
      tokenType: "Native Collection (ID 0)",
      vesting: vestingAddress
    },
    vestingParams: {
      startTimestamp: startTimestamp.toString(),
      startDate: new Date(Number(startTimestamp) * 1000).toISOString(),
      durationSeconds: durationSeconds.toString(),
      endDate: new Date(Number(startTimestamp + durationSeconds) * 1000).toISOString()
    },
    beneficiaries: testAddresses.map((addr) => ({
      address: addr,
      allocation: formatEther(allocationAmount) + " native tokens"
    })),
    totalDonated: formatEther(donationAmount) + " native tokens",
    deployedAt: new Date().toISOString()
  };

  console.log("\n📝 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

// Run the deployment
main()
  .then(() => {
    console.log("\n✅ Deployment with native collection completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    console.log("\n📚 For native collection issues, refer to:");
    console.log("   https://docs.unique.network/");
    process.exit(1);
  });