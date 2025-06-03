import { PredictionMarketAPI } from "./api.js";
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
// Run all tests
async function runTests() {
    console.log("Starting Prediction Market Tests...\n");
    testAMMCalculations();
    console.log("All tests completed!");
}
export { runTests };
//# sourceMappingURL=test.js.map