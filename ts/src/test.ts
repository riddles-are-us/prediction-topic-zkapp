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
const SELL = 5;
const RESOLVE = 6;
const CLAIM = 7;
const WITHDRAW_FEES = 8;

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
        let cmd = createCommand(nonce, BigInt(WITHDRAW), [0n, amount, addressHigh, addressLow]);
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

    async withdrawFees() {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(WITHDRAW_FEES), []);
        return await this.sendTransactionWithCommand(cmd);
    }

    async sellShares(sellType: number, shares: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(SELL), [BigInt(sellType), shares]);
        return await this.sendTransactionWithCommand(cmd);
    }
}

// Helper function to log player and market state
async function logStateInfo(rpc: any, player: Player, playerName: string, stepDescription: string) {
    console.log(`\n=== ${stepDescription} - ${playerName} State ===`);
    
    try {
        const playerDataResponse: any = await rpc.queryState(player.processingKey);
        const playerData = JSON.parse(playerDataResponse.data);
        
        if (playerData && playerData.player && playerData.state) {
            const playerInfo = playerData.player.data;
            const marketInfo = playerData.state.market;
            
            console.log(`${playerName} Balance: ${playerInfo.balance}`);
            console.log(`${playerName} YES Shares: ${playerInfo.yes_shares}`);
            console.log(`${playerName} NO Shares: ${playerInfo.no_shares}`);
            console.log(`${playerName} Claimed: ${playerInfo.claimed}`);
            
            console.log(`Market YES Liquidity: ${marketInfo.yes_liquidity}`);
            console.log(`Market NO Liquidity: ${marketInfo.no_liquidity}`);
            console.log(`Market Total Volume: ${marketInfo.total_volume}`);
            console.log(`Market Total Fees: ${marketInfo.total_fees_collected}`);
            console.log(`Market Resolved: ${marketInfo.resolved}`);
            if (marketInfo.resolved) {
                console.log(`Market Outcome: ${marketInfo.outcome ? 'YES' : 'NO'}`);
            }
        }
    } catch (error) {
        console.log(`Error getting ${playerName} state:`, error);
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
    console.log("=== Enhanced Prediction Market Test with Two Players ===");
    
    const api = new PredictionMarketAPI();
    const rpc = new ZKWasmAppRpc("http://localhost:3000");
    
    // Use environment variable for admin key - this must match the admin.pubkey file
    const adminKey = process.env.SERVER_ADMIN_KEY;
    if (!adminKey) {
        throw new Error("SERVER_ADMIN_KEY environment variable is required");
    }
    const player1Key = "456789789";
    const player2Key = "987654321";
    
    console.log("Admin key from env:", adminKey);
    
    try {
        // Create player instances
        const admin = new Player(adminKey, rpc);
        const player1 = new Player(player1Key, rpc);
        const player2 = new Player(player2Key, rpc);
        
        // Get player PIDs for deposits
        let player1Pkey = PrivateKey.fromString(player1.processingKey);
        let player1Pubkey = player1Pkey.publicKey.key.x.v;
        let player1LeHexBN = new LeHexBN(bnToHexLe(player1Pubkey));
        let player1PkeyArray = player1LeHexBN.toU64Array();
        
        let player2Pkey = PrivateKey.fromString(player2.processingKey);
        let player2Pubkey = player2Pkey.publicKey.key.x.v;
        let player2LeHexBN = new LeHexBN(bnToHexLe(player2Pubkey));
        let player2PkeyArray = player2LeHexBN.toU64Array();
        
        console.log("Player1 PID:", player1PkeyArray);
        console.log("Player2 PID:", player2PkeyArray);
        
        // Step 1: Install all players
        console.log("\n=== STEP 1: Installing Players ===");
        
        try {
            await admin.installPlayer();
            console.log("Admin installed successfully");
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Admin already exists");
            } else {
                throw e;
            }
        }
        
        try {
            await player1.installPlayer();
            console.log("Player1 installed successfully");
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Player1 already exists");
            } else {
                throw e;
            }
        }
        
        try {
            await player2.installPlayer();
            console.log("Player2 installed successfully");
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Player2 already exists");
            } else {
                throw e;
            }
        }
        
        // Step 2: Admin deposits funds for both players
        console.log("\n=== STEP 2: Admin Deposits Funds ===");
        
        await admin.depositFunds(5000n, player1PkeyArray[1], player1PkeyArray[2]);
        console.log("Deposited 5000 for Player1");
        await logStateInfo(rpc, player1, "Player1", "After Deposit");
        
        await admin.depositFunds(3000n, player2PkeyArray[1], player2PkeyArray[2]);
        console.log("Deposited 3000 for Player2");
        await logStateInfo(rpc, player2, "Player2", "After Deposit");
        
        // Step 3: Player1 places YES bets
        console.log("\n=== STEP 3: Player1 Places YES Bets ===");
        
        try {
            await player1.placeBet(1, 1000n); // YES bet
            console.log("Player1 bet 1000 on YES");
        } catch (error) {
            console.log("Player1 first YES bet error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player1, "Player1", "After First YES Bet");
        
        try {
            await player1.placeBet(1, 500n); // Another YES bet
            console.log("Player1 bet 500 more on YES");
        } catch (error) {
            console.log("Player1 second YES bet error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player1, "Player1", "After Second YES Bet");
        
        // Step 4: Player2 places NO bets
        console.log("\n=== STEP 4: Player2 Places NO Bets ===");
        
        try {
            await player2.placeBet(0, 800n); // NO bet
            console.log("Player2 bet 800 on NO");
        } catch (error) {
            console.log("Player2 first NO bet error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player2, "Player2", "After First NO Bet");
        
        try {
            await player2.placeBet(0, 600n); // Another NO bet
            console.log("Player2 bet 600 more on NO");
        } catch (error) {
            console.log("Player2 second NO bet error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player2, "Player2", "After Second NO Bet");
        
        // Step 5: Player1 places some NO bets too
        console.log("\n=== STEP 5: Player1 Also Bets on NO ===");
        
        try {
            await player1.placeBet(0, 700n); // NO bet
            console.log("Player1 bet 700 on NO");
        } catch (error) {
            console.log("Player1 NO bet error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player1, "Player1", "After NO Bet");
        
        // Step 6: Players sell some shares
        console.log("\n=== STEP 6: Players Sell Some Shares ===");
        
        // Player1 sells some YES shares
        try {
            await player1.placeBet(1, 300n); // First buy more YES shares to have enough to sell
            console.log("Player1 bought 300 more YES shares");
        } catch (error) {
            console.log("Player1 additional YES bet error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player1, "Player1", "After Additional YES Purchase");
        
        // Now sell some YES shares (sell type 1 = YES)
        try {
            await player1.sellShares(1, 200n); // Sell 200 YES shares
            console.log("Player1 sold 200 YES shares");
        } catch (error) {
            console.log("Player1 YES sell error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player1, "Player1", "After Selling YES Shares");
        
        // Player2 sells some NO shares (sell type 0 = NO)
        try {
            await player2.sellShares(0, 150n); // Sell 150 NO shares
            console.log("Player2 sold 150 NO shares");
        } catch (error) {
            console.log("Player2 NO sell error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player2, "Player2", "After Selling NO Shares");
        
        // Player1 also sells some NO shares
        try {
            await player1.sellShares(0, 100n); // Sell 100 NO shares
            console.log("Player1 sold 100 NO shares");
        } catch (error) {
            console.log("Player1 NO sell error:", error instanceof Error ? error.message : error);
        }
        await logStateInfo(rpc, player1, "Player1", "After Selling NO Shares");
        
        // Step 7: Market resolution
        console.log("\n=== STEP 7: Admin Resolves Market (YES Wins) ===");
        
        await admin.resolveMarket(true); // YES outcome
        console.log("Market resolved: YES wins");
        await logStateInfo(rpc, admin, "Admin", "After Market Resolution");
        
        // Step 8: Players claim winnings
        console.log("\n=== STEP 8: Players Claim Winnings ===");
        
        try {
            await player1.claimWinnings();
            console.log("Player1 claimed winnings");
        } catch (error) {
            if (error instanceof Error && error.message === "NoWinningPosition") {
                console.log("Player1 has no winning position to claim");
            } else {
                console.log("Player1 claim error:", error);
            }
        }
        await logStateInfo(rpc, player1, "Player1", "After Claiming Attempt");
        
        try {
            await player2.claimWinnings();
            console.log("Player2 claimed winnings");
        } catch (error) {
            if (error instanceof Error && error.message === "NoWinningPosition") {
                console.log("Player2 has no winning position to claim");
            } else {
                console.log("Player2 claim error:", error);
            }
        }
        await logStateInfo(rpc, player2, "Player2", "After Claiming Attempt");
        
        // Step 9: Admin withdraws fees
        console.log("\n=== STEP 9: Admin Withdraws Fees ===");
        
        await admin.withdrawFees();
        console.log("Admin withdrew collected fees");
        await logStateInfo(rpc, admin, "Admin", "After Fee Withdrawal");
        
        // Step 10: Final state of all participants
        console.log("\n=== STEP 10: Final State Summary ===");
        
        await logStateInfo(rpc, admin, "Admin", "Final State");
        await logStateInfo(rpc, player1, "Player1", "Final State");
        await logStateInfo(rpc, player2, "Player2", "Final State");
        
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
