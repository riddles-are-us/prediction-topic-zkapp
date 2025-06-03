import { get_server_admin_key } from "zkwasm-ts-server/src/config.js";

export class PredictionMarketAPI {
    private adminKey: any;
    private serverUrl: string;

    constructor(serverUrl: string = "http://localhost:3000") {
        this.adminKey = get_server_admin_key();
        this.serverUrl = serverUrl;
    }

    // Place a bet
    async placeBet(betType: number, amount: number, playerKey: any) {
        try {
            // This would integrate with the zkwasm transaction system
            // For now, this is a placeholder showing the structure
            console.log(`Placing bet: ${betType === 1 ? 'YES' : 'NO'}, amount: ${amount}`);
            
            // In a real implementation, this would:
            // 1. Create a transaction with command 1 (bet)
            // 2. Include bet_type, amount, and player key
            // 3. Submit to the zkwasm system
            
            return { success: true, message: "Bet placed successfully" };
        } catch (error) {
            console.error("Error placing bet:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Resolve market (admin only)
    async resolveMarket(outcome: boolean) {
        try {
            console.log(`Resolving market with outcome: ${outcome ? 'YES' : 'NO'}`);
            
            // In a real implementation, this would:
            // 1. Create a transaction with command 2 (resolve)
            // 2. Include outcome and admin key
            // 3. Submit to the zkwasm system
            
            return { success: true, message: "Market resolved successfully" };
        } catch (error) {
            console.error("Error resolving market:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Claim winnings
    async claimWinnings(playerKey: any) {
        try {
            console.log("Claiming winnings");
            
            // In a real implementation, this would:
            // 1. Create a transaction with command 3 (claim)
            // 2. Include player key
            // 3. Submit to the zkwasm system
            
            return { success: true, message: "Winnings claimed successfully" };
        } catch (error) {
            console.error("Error claiming winnings:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Get market data
    async getMarketData() {
        try {
            const response = await fetch(`${this.serverUrl}/data/market`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching market data:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Get player data
    async getPlayerData(pid1: string, pid2: string) {
        try {
            const response = await fetch(`${this.serverUrl}/data/player/${pid1}/${pid2}`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching player data:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Get market statistics
    async getMarketStats() {
        try {
            const response = await fetch(`${this.serverUrl}/data/stats`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching market stats:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Get all bets
    async getAllBets() {
        try {
            const response = await fetch(`${this.serverUrl}/data/bets`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching bets:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Get player's bets
    async getPlayerBets(pid1: string, pid2: string) {
        try {
            const response = await fetch(`${this.serverUrl}/data/bets/${pid1}/${pid2}`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching player bets:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // Calculate expected shares for a bet amount
    calculateExpectedShares(betType: number, amount: number, yesLiquidity: bigint, noLiquidity: bigint): bigint {
        if (amount <= 0) return 0n;

        const PLATFORM_FEE_RATE = 25n; // 0.25%
        const fee = (BigInt(amount) * PLATFORM_FEE_RATE) / 10000n;
        const netAmount = BigInt(amount) - fee;

        const k = yesLiquidity * noLiquidity;

        if (betType === 1) { // YES bet
            const newNoLiquidity = noLiquidity + netAmount;
            const newYesLiquidity = k / newNoLiquidity;
            return yesLiquidity > newYesLiquidity ? yesLiquidity - newYesLiquidity : 0n;
        } else { // NO bet
            const newYesLiquidity = yesLiquidity + netAmount;
            const newNoLiquidity = k / newYesLiquidity;
            return noLiquidity > newNoLiquidity ? noLiquidity - newNoLiquidity : 0n;
        }
    }

    // Calculate current prices
    calculatePrices(yesLiquidity: bigint, noLiquidity: bigint): { yesPrice: number, noPrice: number } {
        const totalLiquidity = yesLiquidity + noLiquidity;
        if (totalLiquidity === 0n) {
            return { yesPrice: 0.5, noPrice: 0.5 };
        }

        const yesPrice = Number(noLiquidity * 1000000n / totalLiquidity) / 1000000;
        const noPrice = Number(yesLiquidity * 1000000n / totalLiquidity) / 1000000;

        return { yesPrice, noPrice };
    }
}

// Example usage
export async function exampleUsage() {
    const api = new PredictionMarketAPI();

    // Get market data
    const marketData = await api.getMarketData();
    console.log("Market data:", marketData);

    // Get market statistics
    const stats = await api.getMarketStats();
    console.log("Market stats:", stats);

    // Example of calculating expected shares
    if (marketData.success && marketData.data) {
        const yesLiquidity = BigInt(marketData.data.yesLiquidity);
        const noLiquidity = BigInt(marketData.data.noLiquidity);
        
        const expectedYesShares = api.calculateExpectedShares(1, 1000, yesLiquidity, noLiquidity);
        const expectedNoShares = api.calculateExpectedShares(0, 1000, yesLiquidity, noLiquidity);
        
        console.log(`For 1000 units bet:`);
        console.log(`Expected YES shares: ${expectedYesShares}`);
        console.log(`Expected NO shares: ${expectedNoShares}`);

        const prices = api.calculatePrices(yesLiquidity, noLiquidity);
        console.log(`Current prices - YES: ${(prices.yesPrice * 100).toFixed(2)}%, NO: ${(prices.noPrice * 100).toFixed(2)}%`);
    }
} 