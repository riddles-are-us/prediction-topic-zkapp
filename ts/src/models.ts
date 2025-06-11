import mongoose from 'mongoose';

(BigInt.prototype as any).toJSON = function () {
    return BigInt.asUintN(64, this).toString();
};

// With above tojson for bigint we can turn document into json with simple transform that exclude delete
export function docToJSON(doc: mongoose.Document) {
    const obj = doc.toObject({
        transform: (_, ret:any) => {
            delete ret._id;
            return ret;
        }
    });
    return obj;
}


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
interface Player {
    pid: bigint[],
    balance: bigint,
    yesShares: bigint,
    noShares: bigint,
    claimed: boolean,
}
const playerSchema = new mongoose.Schema<Player>({
    pid: { type: [BigInt], required: true },
    balance: { type: BigInt, required: true },
    yesShares: { type: BigInt, required: true },
    noShares: { type: BigInt, required: true },
    claimed: { type: Boolean, required: true }
});

interface Bet {
    pid: bigint[],
    betType: number,
    amount: bigint,
    shares: bigint,
    timestamp: Date,

}

// Bet Schema
const betSchema = new mongoose.Schema<Bet>({
    pid: { type: [BigInt], required: true },
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
            "Bitcoin $100K by 2024", // title (matches config)
            "Will Bitcoin reach $100,000 USD by December 31, 2024?", // description (matches config)
            0n, // startTime (counter = 0)
            17280n, // endTime (counter = 17280, ~1 day)
            17280n, // resolutionTime (same as endTime)
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

export class PlayerEvent {
    index: number;
    data: bigint[];

    constructor(
        index: number, data: bigint[]
    ) {
        this.index = index;
        this.data = data;
    }

    static fromEvent(data: BigUint64Array): PlayerEvent {
        return new PlayerEvent(Number(data[0]),  Array.from(data.slice(1)));
    }

    toObject(): Player {
        return {
            pid: [this.data[0], this.data[1]], // pid2
            balance: this.data[2], // balance
            yesShares: this.data[3], // yesShares
            noShares: this.data[4], // noShares
            claimed: this.data[5] !== 0n // claimed
        };
    }
}

export class BetEvent {
    index: number;
    data: bigint[];
    timestamp: Date;
    constructor(
        index: number, data: bigint[]
    ) {
        this.index = index;
        this.data = data;
        this.timestamp = new Date();
    }

    static fromEvent(data: BigUint64Array): BetEvent {
        return new BetEvent(Number(data[0]),  Array.from(data.slice(1)));
    }

    toObject(): Bet {
        return {
            pid: [this.data[0], this.data[1]], // pid2
            betType: Number(this.data[2]), // betType
            amount: this.data[3],
            shares: this.data[4],
            timestamp: this.timestamp
        };
    }
}
