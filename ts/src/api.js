import fetch from 'node-fetch';
import { PlayerConvention, ZKWasmAppRpc, createCommand } from "zkwasm-minirollup-rpc";
import { get_server_admin_key } from "zkwasm-ts-server/src/config.js";
export const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
// Command constants matching the Rust code
export const TICK = 0;
export const INSTALL_PLAYER = 1;
export const WITHDRAW = 2;
export const DEPOSIT = 3;
export const BET = 4;
export const SELL = 5;
export const RESOLVE = 6;
export const CLAIM = 7;
// Player class for transaction handling
export class Player extends PlayerConvention {
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
    async sellShares(sellType, shares) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(SELL), [BigInt(sellType), shares]);
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
export class PredictionMarketAPI {
    constructor(baseUrl = API_BASE_URL) {
        this.adminKey = get_server_admin_key();
        this.baseUrl = baseUrl;
    }
    // Get market data
    async getMarket() {
        const response = await fetch(`${this.baseUrl}/data/market`);
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get market data');
        }
        return result.data;
    }
    // Get player data
    async getPlayer(pid1, pid2) {
        const response = await fetch(`${this.baseUrl}/data/player/${pid1}/${pid2}`);
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get player data');
        }
        return result.data;
    }
    // Get market statistics
    async getStats() {
        const response = await fetch(`${this.baseUrl}/data/stats`);
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get stats');
        }
        return result.data;
    }
    // Get all bets
    async getAllBets() {
        const response = await fetch(`${this.baseUrl}/data/bets`);
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get bets data');
        }
        return result.data;
    }
    // Get player's bets
    async getPlayerBets(pid1, pid2) {
        const response = await fetch(`${this.baseUrl}/data/bets/${pid1}/${pid2}`);
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get player bets');
        }
        return result.data;
    }
    // Calculate expected shares for a bet amount
    calculateExpectedShares(betType, amount, yesLiquidity, noLiquidity) {
        if (amount <= 0)
            return 0n;
        const PLATFORM_FEE_RATE = 25n; // 0.25%
        const fee = (BigInt(amount) * PLATFORM_FEE_RATE) / 10000n;
        const netAmount = BigInt(amount) - fee;
        const k = yesLiquidity * noLiquidity;
        if (betType === 1) { // YES bet
            const newNoLiquidity = noLiquidity + netAmount;
            const newYesLiquidity = k / newNoLiquidity;
            return yesLiquidity > newYesLiquidity ? yesLiquidity - newYesLiquidity : 0n;
        }
        else { // NO bet
            const newYesLiquidity = yesLiquidity + netAmount;
            const newNoLiquidity = k / newYesLiquidity;
            return noLiquidity > newNoLiquidity ? noLiquidity - newNoLiquidity : 0n;
        }
    }
    // Calculate current prices
    calculatePrices(yesLiquidity, noLiquidity) {
        const totalLiquidity = yesLiquidity + noLiquidity;
        if (totalLiquidity === 0n) {
            return { yesPrice: 0.5, noPrice: 0.5 };
        }
        const yesPrice = Number(noLiquidity * 1000000n / totalLiquidity) / 1000000;
        const noPrice = Number(yesLiquidity * 1000000n / totalLiquidity) / 1000000;
        return { yesPrice, noPrice };
    }
}
// Transaction building utilities
export function buildBetTransaction(nonce, betType, amount) {
    const commandWithNonce = BigInt(BET) | (BigInt(nonce) << 16n);
    return [commandWithNonce, BigInt(betType), amount, 0n, 0n];
}
export function buildSellTransaction(nonce, sellType, shares) {
    const commandWithNonce = BigInt(SELL) | (BigInt(nonce) << 16n);
    return [commandWithNonce, BigInt(sellType), shares, 0n, 0n];
}
export function buildResolveTransaction(nonce, outcome) {
    const commandWithNonce = BigInt(RESOLVE) | (BigInt(nonce) << 16n);
    return [commandWithNonce, outcome ? 1n : 0n, 0n, 0n, 0n];
}
export function buildClaimTransaction(nonce) {
    const commandWithNonce = BigInt(CLAIM) | (BigInt(nonce) << 16n);
    return [commandWithNonce, 0n, 0n, 0n, 0n];
}
export function buildWithdrawTransaction(nonce, amount, addressHigh, addressLow) {
    const commandWithNonce = BigInt(WITHDRAW) | (BigInt(nonce) << 16n);
    return [commandWithNonce, 0n, amount, addressHigh, addressLow];
}
export function buildDepositTransaction(nonce, targetPid1, targetPid2, amount) {
    const commandWithNonce = BigInt(DEPOSIT) | (BigInt(nonce) << 16n);
    return [commandWithNonce, targetPid1, targetPid2, 0n, amount];
}
export function buildInstallPlayerTransaction(nonce) {
    const commandWithNonce = BigInt(INSTALL_PLAYER) | (BigInt(nonce) << 16n);
    return [commandWithNonce, 0n, 0n, 0n, 0n];
}
// Example usage
export async function exampleUsage() {
    const api = new PredictionMarketAPI();
    const rpc = new ZKWasmAppRpc("http://localhost:3000");
    // Create player instance (replace with actual key)
    const playerKey = "123";
    const player = new Player(playerKey, rpc);
    try {
        // Install player
        console.log("Installing player...");
        await player.installPlayer();
        // Get market data
        const marketData = await api.getMarket();
        console.log("Market data:", marketData);
        // Calculate expected shares for a bet
        if (marketData.yesLiquidity && marketData.noLiquidity) {
            const yesLiquidity = BigInt(marketData.yesLiquidity);
            const noLiquidity = BigInt(marketData.noLiquidity);
            const expectedYesShares = api.calculateExpectedShares(1, 1000, yesLiquidity, noLiquidity);
            const expectedNoShares = api.calculateExpectedShares(0, 1000, yesLiquidity, noLiquidity);
            console.log(`For 1000 units bet:`);
            console.log(`Expected YES shares: ${expectedYesShares}`);
            console.log(`Expected NO shares: ${expectedNoShares}`);
            // Place a bet
            console.log("Placing YES bet...");
            await player.placeBet(1, 1000n); // YES bet for 1000 units
            // Get updated market stats
            const stats = await api.getStats();
            console.log("Updated market stats:", stats);
        }
    }
    catch (error) {
        console.error("Error in example usage:", error);
    }
}
//# sourceMappingURL=api.js.map