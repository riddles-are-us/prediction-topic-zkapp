import mongoose from 'mongoose';

// Market Schema
const marketSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    startTime: { type: BigInt, required: true },
    endTime: { type: BigInt, required: true },
    resolutionTime: { type: BigInt, required: true },
    yesLiquidity: { type: BigInt, required: true },
    noLiquidity: { type: BigInt, required: true },
    totalVolume: { type: BigInt, required: true },
    resolved: { type: Boolean, required: true },
    outcome: { type: Boolean, default: null },
    totalFeesCollected: { type: BigInt, required: true },
    yesPrice: { type: BigInt, required: true },
    noPrice: { type: BigInt, required: true }
});

// Player Schema
const playerSchema = new mongoose.Schema({
    pid1: { type: String, required: true },
    pid2: { type: String, required: true },
    balance: { type: BigInt, required: true },
    yesShares: { type: BigInt, required: true },
    noShares: { type: BigInt, required: true },
    claimed: { type: Boolean, required: true }
});

// Bet Schema
const betSchema = new mongoose.Schema({
    pid1: { type: String, required: true },
    pid2: { type: String, required: true },
    betType: { type: Number, required: true }, // 0 = NO, 1 = YES
    amount: { type: BigInt, required: true },
    shares: { type: BigInt, required: true },
    timestamp: { type: Date, default: Date.now }
});

// Create indexes
playerSchema.index({ pid1: 1, pid2: 1 }, { unique: true });
betSchema.index({ pid1: 1, pid2: 1 });
betSchema.index({ timestamp: -1 });

export const MarketModel = mongoose.model('Market', marketSchema);
export const PlayerModel = mongoose.model('Player', playerSchema);
export const BetModel = mongoose.model('Bet', betSchema);

// Event handling classes
export class Market {
    title: string;
    description: string;
    startTime: bigint;
    endTime: bigint;
    resolutionTime: bigint;
    yesLiquidity: bigint;
    noLiquidity: bigint;
    totalVolume: bigint;
    resolved: boolean;
    outcome: boolean | null;
    totalFeesCollected: bigint;
    yesPrice: bigint;
    noPrice: bigint;

    constructor(
        title: string,
        description: string,
        startTime: bigint,
        endTime: bigint,
        resolutionTime: bigint,
        yesLiquidity: bigint,
        noLiquidity: bigint,
        totalVolume: bigint,
        resolved: boolean,
        outcome: boolean | null,
        totalFeesCollected: bigint
    ) {
        this.title = title;
        this.description = description;
        this.startTime = startTime;
        this.endTime = endTime;
        this.resolutionTime = resolutionTime;
        this.yesLiquidity = yesLiquidity;
        this.noLiquidity = noLiquidity;
        this.totalVolume = totalVolume;
        this.resolved = resolved;
        this.outcome = outcome;
        this.totalFeesCollected = totalFeesCollected;
        
        // Calculate prices
        const totalLiquidity = yesLiquidity + noLiquidity;
        if (totalLiquidity > 0n) {
            this.yesPrice = (noLiquidity * 1000000n) / totalLiquidity;
            this.noPrice = (yesLiquidity * 1000000n) / totalLiquidity;
        } else {
            this.yesPrice = 500000n; // 50%
            this.noPrice = 500000n; // 50%
        }
    }

    static fromEvent(eventData: BigUint64Array): Market {
        return new Market(
            "Bitcoin $100K by 2024", // title
            "Will Bitcoin reach $100,000 USD by December 31, 2024?", // description
            1700000000n, // startTime
            1735689600n, // endTime
            1735689600n, // resolutionTime
            eventData[0], // yesLiquidity
            eventData[1], // noLiquidity
            eventData[2], // totalVolume
            eventData[3] !== 0n, // resolved
            eventData[4] === 0n ? null : eventData[4] === 1n ? false : true, // outcome
            eventData[5] // totalFeesCollected
        );
    }

    toObject() {
        return {
            title: this.title,
            description: this.description,
            startTime: this.startTime,
            endTime: this.endTime,
            resolutionTime: this.resolutionTime,
            yesLiquidity: this.yesLiquidity,
            noLiquidity: this.noLiquidity,
            totalVolume: this.totalVolume,
            resolved: this.resolved,
            outcome: this.outcome,
            totalFeesCollected: this.totalFeesCollected,
            yesPrice: this.yesPrice,
            noPrice: this.noPrice
        };
    }
}

export class Player {
    pid1: string;
    pid2: string;
    balance: bigint;
    yesShares: bigint;
    noShares: bigint;
    claimed: boolean;

    constructor(
        pid1: string,
        pid2: string,
        balance: bigint,
        yesShares: bigint,
        noShares: bigint,
        claimed: boolean
    ) {
        this.pid1 = pid1;
        this.pid2 = pid2;
        this.balance = balance;
        this.yesShares = yesShares;
        this.noShares = noShares;
        this.claimed = claimed;
    }

    static fromEvent(eventData: BigUint64Array): Player {
        return new Player(
            eventData[0].toString(), // pid1
            eventData[1].toString(), // pid2
            eventData[2], // balance
            eventData[3], // yesShares
            eventData[4], // noShares
            eventData[5] !== 0n // claimed
        );
    }

    toObject() {
        return {
            pid1: this.pid1,
            pid2: this.pid2,
            balance: this.balance,
            yesShares: this.yesShares,
            noShares: this.noShares,
            claimed: this.claimed
        };
    }
}

export class Bet {
    pid1: string;
    pid2: string;
    betType: number;
    amount: bigint;
    shares: bigint;
    timestamp: Date;

    constructor(
        pid1: string,
        pid2: string,
        betType: number,
        amount: bigint,
        shares: bigint
    ) {
        this.pid1 = pid1;
        this.pid2 = pid2;
        this.betType = betType;
        this.amount = amount;
        this.shares = shares;
        this.timestamp = new Date();
    }

    static fromEvent(eventData: BigUint64Array): Bet {
        return new Bet(
            eventData[0].toString(), // pid1
            eventData[1].toString(), // pid2
            Number(eventData[2]), // betType
            eventData[3], // amount
            eventData[4] // shares
        );
    }

    toObject() {
        return {
            pid1: this.pid1,
            pid2: this.pid2,
            betType: this.betType,
            amount: this.amount,
            shares: this.shares,
            timestamp: this.timestamp
        };
    }
} 