import { PlayerConvention, ZKWasmAppRpc, createCommand } from 'zkwasm-minirollup-rpc';
import { PredictionMarketAPI, exampleUsage } from './api.js';
// Command constants
const TICK = 0;
const INSTALL_PLAYER = 1;
const WITHDRAW = 2;
const DEPOSIT = 3;
const BET = 4;
const RESOLVE = 5;
const CLAIM = 6;
class Player extends PlayerConvention {
    constructor(key, rpc) {
        super(key, rpc, BigInt(DEPOSIT), BigInt(WITHDRAW));
        this.processingKey = key;
        this.rpc = rpc;
    }
    async sendTransactionWithCommand(cmd) {
        try {
            let result = await this.rpc.sendTransaction(cmd, this.processingKey);
            return result;
        }
        catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            }
            throw e;
        }
    }
    async installPlayer() {
        let cmd = createCommand(0n, BigInt(INSTALL_PLAYER), []);
        return await this.sendTransactionWithCommand(cmd);
    }
    async placeBet(betType, amount) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(BET), [BigInt(betType), amount]);
        return await this.sendTransactionWithCommand(cmd);
    }
    async claimWinnings() {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(CLAIM), []);
        return await this.sendTransactionWithCommand(cmd);
    }
    async withdrawFunds(amount, addressHigh, addressLow) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(WITHDRAW), [amount, addressHigh, addressLow]);
        return await this.sendTransactionWithCommand(cmd);
    }
    async depositFunds(amount, targetPid1, targetPid2) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(DEPOSIT), [targetPid1, targetPid2, amount]);
        return await this.sendTransactionWithCommand(cmd);
    }
    async resolveMarket(outcome) {
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
    // Example keys - replace with actual keys in production
    const adminKey = "123";
    const playerKey = "456";
    try {
        // Create player instances
        const admin = new Player(adminKey, rpc);
        const player = new Player(playerKey, rpc);
        console.log("1. Installing players...");
        await admin.installPlayer();
        await player.installPlayer();
        console.log("2. Admin deposits funds for player...");
        await admin.depositFunds(10000n, 123n, 456n); // Deposit 10000 units for player
        console.log("3. Getting market data...");
        const marketData = await api.getMarket();
        console.log("Market info:", {
            title: marketData.title,
            description: marketData.description,
            resolved: marketData.resolved,
            yesLiquidity: marketData.yesLiquidity,
            noLiquidity: marketData.noLiquidity
        });
        if (marketData.yesLiquidity && marketData.noLiquidity) {
            const yesLiquidity = BigInt(marketData.yesLiquidity);
            const noLiquidity = BigInt(marketData.noLiquidity);
            console.log("4. Calculating bet predictions...");
            const expectedYesShares = api.calculateExpectedShares(1, 1000, yesLiquidity, noLiquidity);
            const expectedNoShares = api.calculateExpectedShares(0, 1000, yesLiquidity, noLiquidity);
            console.log(`Expected shares for 1000 units:`);
            console.log(`- YES bet: ${expectedYesShares} shares`);
            console.log(`- NO bet: ${expectedNoShares} shares`);
            const prices = api.calculatePrices(yesLiquidity, noLiquidity);
            console.log(`Current prices:`);
            console.log(`- YES: ${(prices.yesPrice * 100).toFixed(2)}%`);
            console.log(`- NO: ${(prices.noPrice * 100).toFixed(2)}%`);
            console.log("5. Player places bets...");
            await player.placeBet(1, 1000n); // YES bet
            await player.placeBet(0, 500n); // NO bet
            console.log("6. Getting updated market stats...");
            const stats = await api.getStats();
            console.log("Market stats:", stats);
            console.log("7. Getting player data...");
            const playerData = await api.getPlayer("123", "456");
            console.log("Player data:", playerData);
            console.log("8. Getting bet history...");
            const allBets = await api.getAllBets();
            console.log(`Total bets: ${allBets.length}`);
            const playerBets = await api.getPlayerBets("123", "456");
            console.log(`Player bets: ${playerBets.length}`);
            if (!marketData.resolved) {
                console.log("9. Admin resolves market...");
                await admin.resolveMarket(true); // YES outcome
                console.log("10. Player claims winnings...");
                await player.claimWinnings();
                console.log("11. Player withdraws funds...");
                await player.withdrawFunds(500n, 0n, 0n);
            }
        }
        console.log("=== Test completed successfully ===");
    }
    catch (error) {
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
        console.log("Running additional examples...\n");
        await exampleUsage();
    }
    catch (error) {
        console.error("Examples failed:", error);
    }
}
// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runExamples();
}
//# sourceMappingURL=test.js.map