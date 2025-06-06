import { PrivateKey, bnToHexLe } from "delphinus-curves/src/altjubjub";
import dotenv from 'dotenv';
import { PlayerConvention, ZKWasmAppRpc, createCommand } from 'zkwasm-minirollup-rpc';
import { LeHexBN } from "zkwasm-ts-server";
import { PredictionMarketAPI } from './api.js';

dotenv.config();

// Command constants
const TICK = 0;
const INSTALL_PLAYER = 1;
const WITHDRAW = 2;
const DEPOSIT = 3;
const BET = 4;
const RESOLVE = 5;
const CLAIM = 6;

class Player extends PlayerConvention {
    constructor(key: string, rpc: ZKWasmAppRpc) {
        super(key, rpc, BigInt(DEPOSIT), BigInt(WITHDRAW));
        this.processingKey = key;
        this.rpc = rpc;
    }

    async sendTransactionWithCommand(cmd: BigUint64Array) {
        try {
            let result = await this.rpc.sendTransaction(cmd, this.processingKey);
            return result;
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            }
            throw e;
        }
    }

    async installPlayer() {
        try {
            let cmd = createCommand(0n, BigInt(INSTALL_PLAYER), []);
            return await this.sendTransactionWithCommand(cmd);
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Player already exists, skipping installation");
                return null; // Not an error, just already exists
            }
            throw e; // Re-throw other errors
        }
    }

    async placeBet(betType: number, amount: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(BET), [BigInt(betType), amount]);
        return await this.sendTransactionWithCommand(cmd);
    }

    async claimWinnings() {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(CLAIM), []);
        return await this.sendTransactionWithCommand(cmd);
    }

    async withdrawFunds(amount: bigint, addressHigh: bigint, addressLow: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(WITHDRAW), [amount, addressHigh, addressLow]);
        return await this.sendTransactionWithCommand(cmd);
    }

    async depositFunds(amount: bigint, targetPid1: bigint, targetPid2: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(DEPOSIT), [targetPid1, targetPid2, 0n, amount]);
        return await this.sendTransactionWithCommand(cmd);
    }

    async resolveMarket(outcome: boolean) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(RESOLVE), [outcome ? 1n : 0n]);
        return await this.sendTransactionWithCommand(cmd);
    }
}

// Test AMM calculations
function testAMMCalculations() {
    console.log("=== Testing AMM Calculations ===");
    
    const api = new PredictionMarketAPI();
    
    // Initial liquidity
    const initialYesLiquidity = 1000000n;
    const initialNoLiquidity = 1000000n;
    
    console.log(`Initial liquidity - YES: ${initialYesLiquidity}, NO: ${initialNoLiquidity}`);
    
    // Test initial prices (should be 50/50)
    const initialPrices = api.calculatePrices(initialYesLiquidity, initialNoLiquidity);
    console.log(`Initial prices - YES: ${(initialPrices.yesPrice * 100).toFixed(2)}%, NO: ${(initialPrices.noPrice * 100).toFixed(2)}%`);
    
    // Test bet calculations
    const betAmount = 10000;
    
    // Calculate YES bet
    const yesShares = api.calculateExpectedShares(1, betAmount, initialYesLiquidity, initialNoLiquidity);
    console.log(`\nBetting ${betAmount} on YES:`);
    console.log(`Expected shares: ${yesShares}`);
    
    console.log("\n=== AMM Test Complete ===\n");
}

async function testPredictionMarket() {
    console.log("=== Prediction Market Test ===");
    
    const api = new PredictionMarketAPI();
    const rpc = new ZKWasmAppRpc("http://localhost:3000");
    
    // Use environment variable for admin key - this must match the admin.pubkey file
    const adminKey = process.env.SERVER_ADMIN_KEY;
    if (!adminKey) {
        throw new Error("SERVER_ADMIN_KEY environment variable is required");
    }
    const playerKey = "456789789";
    
    console.log("Admin key from env:", adminKey);
    
    try {
        // Create player instances
        const admin = new Player(adminKey, rpc);
        const player = new Player(playerKey, rpc);
        
        // Get admin's public key to verify it matches
        let adminPkey = PrivateKey.fromString(admin.processingKey);
        let adminPubkey = adminPkey.publicKey.key.x.v;
        let adminLeHexBN = new LeHexBN(bnToHexLe(adminPubkey));
        let adminPkeyArray = adminLeHexBN.toU64Array();
        
        console.log("Admin public key array:", adminPkeyArray);
        
        // Get player's private key and pid
        let pkey = PrivateKey.fromString(player.processingKey);
        let pubkey = pkey.publicKey.key.x.v;
        let leHexBN = new LeHexBN(bnToHexLe(pubkey));
        let pkeyArray = leHexBN.toU64Array();
        let playerpid = pkeyArray;
        
        console.log("Player PID:", playerpid);
        
        console.log("1. Installing admin...");
        try {
            await admin.installPlayer();
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Admin already exists, continuing...");
            } else {
                throw e;
            }
        }
        
        console.log("2. Installing players...");
        try {
            await player.installPlayer();
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Player already exists, continuing...");
            } else {
                throw e;
            }
        }
        
        console.log("3. Admin deposits funds for player...", pkeyArray[1], pkeyArray[2]);
        console.log(admin.processingKey)
        await admin.depositFunds(1000n, pkeyArray[1], pkeyArray[2]); // Deposit 10000 units for player
        
        console.log("4. Getting player data (includes market info)...");
        const playerData: any = await rpc.queryState(player.processingKey);
        console.log("Player data with market info:", playerData);
        
        if (playerData && playerData.market) {
            const market = playerData.market;
            const yesLiquidity = BigInt(market.yes_liquidity);
            const noLiquidity = BigInt(market.no_liquidity);
            
            console.log("5. Market info:");
            console.log(`- Title: ${market.title}`);
            console.log(`- YES Liquidity: ${yesLiquidity}`);
            console.log(`- NO Liquidity: ${noLiquidity}`);
            console.log(`- Resolved: ${market.resolved}`);
            
            console.log("6. Player info:");
            console.log(`- Balance: ${playerData.data.balance}`);
            console.log(`- YES Shares: ${playerData.data.yes_shares}`);
            console.log(`- NO Shares: ${playerData.data.no_shares}`);
            
            console.log("7. Calculating bet predictions...");
            const expectedYesShares = api.calculateExpectedShares(1, 1000, yesLiquidity, noLiquidity);
            const expectedNoShares = api.calculateExpectedShares(0, 1000, yesLiquidity, noLiquidity);
            
            console.log(`Expected shares for 1000 units:`);
            console.log(`- YES bet: ${expectedYesShares} shares`);
            console.log(`- NO bet: ${expectedNoShares} shares`);
            
            const prices = api.calculatePrices(yesLiquidity, noLiquidity);
            console.log(`Current prices:`);
            console.log(`- YES: ${(prices.yesPrice * 100).toFixed(2)}%`);
            console.log(`- NO: ${(prices.noPrice * 100).toFixed(2)}%`);
            
            console.log("8. Player places bets...");
            await player.placeBet(1, 1000n); // YES bet
            await player.placeBet(0, 500n);  // NO bet
            
            console.log("9. Getting updated player data...");
            const updatedPlayerData: any = await rpc.queryState(player.processingKey);
            console.log("Updated player data:", updatedPlayerData);
            
            if (!market.resolved) {
                console.log("10. Admin resolves market...");
                await admin.resolveMarket(true); // YES outcome
                
                console.log("11. Player claims winnings...");
                await player.claimWinnings();
                
                console.log("12. Player withdraws funds...");
                await player.withdrawFunds(500n, 0n, 0n);
            }
        } else {
            console.log("No player/market data available");
        }
        
        console.log("=== Test completed successfully ===");
        
    } catch (error) {
        console.error("Test failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

async function runExamples() {
    console.log("Running prediction market examples...\n");
    
    try {
        await testPredictionMarket();
        console.log("\n" + "=".repeat(50));
        // console.log("Running additional examples...\n");
        // await exampleUsage();
    } catch (error) {
        console.error("Examples failed:", error);
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runExamples();
}
