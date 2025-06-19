import mongoose from 'mongoose';
import { ObjectEvent } from 'zkwasm-ts-server';

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

// Multi-Market Support - Market Info per market ID
interface MarketInfo {
    marketId: bigint;
    counter: bigint;
    title: string;
    description: string;
    startTime: bigint;
    endTime: bigint;
    resolutionTime: bigint;
    yesLiquidity: bigint;
    noLiquidity: bigint;
    totalVolume: bigint;
    totalYesShares: bigint;
    totalNoShares: bigint;
    resolved: boolean;
    outcome: boolean | null;
    totalFeesCollected: bigint;
}

// Market Schema
const marketSchema = new mongoose.Schema<MarketInfo>({
    marketId: { type: BigInt, required: true, unique: true},
    counter: { type: BigInt, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    startTime: { type: BigInt, required: true },
    endTime: { type: BigInt, required: true },
    resolutionTime: { type: BigInt, required: true },
    yesLiquidity: { type: BigInt, required: true },
    noLiquidity: { type: BigInt, required: true },
    totalVolume: { type: BigInt, default: 0n },
    totalYesShares: { type: BigInt, default: 0n },
    totalNoShares: { type: BigInt, default: 0n },
    resolved: { type: Boolean, default: false },
    outcome: { type: Boolean, default: null },
    totalFeesCollected: { type: BigInt, default: 0n },
});

marketSchema.pre('init', ObjectEvent.uint64FetchPlugin);
marketSchema.index({ marketId: 1 });
marketSchema.index({ resolved: 1 });

// Multi-Market Bet Interface
export interface Bet {
    index: bigint;
    pid: bigint[],
    marketId: bigint,
    betType: number,
    amount: bigint,
    shares: bigint,
    counter: bigint,
}

// Bet Schema - updated for multi-market
const betSchema = new mongoose.Schema<Bet>({
    index: { type: BigInt, required: true, unique: true},
    pid: { type: [BigInt], required: true },
    marketId: { type: BigInt, required: true },
    betType: { type: Number, required: true }, // 0 = NO, 1 = YES
    amount: { type: BigInt, required: true },
    shares: { type: BigInt, required: true },
    counter: { type: BigInt, required: true}
});

betSchema.pre('init', ObjectEvent.uint64FetchPlugin);
betSchema.index({ pid: 1 });
betSchema.index({ marketId: 1 });
betSchema.index({ counter: -1 });

// Player Market Position Interface
interface PlayerMarketPosition {
    pid: bigint[];
    marketId: bigint;
    yesShares: bigint;
    noShares: bigint;
    claimed: boolean;
}

// Player Market Position Schema
const playerMarketPositionSchema = new mongoose.Schema<PlayerMarketPosition>({
    pid: { type: [BigInt], required: true },
    marketId: { type: BigInt, required: true },
    yesShares: { type: BigInt, default: 0n },
    noShares: { type: BigInt, default: 0n },
    claimed: { type: Boolean, default: false }
});

playerMarketPositionSchema.pre('init', ObjectEvent.uint64FetchPlugin);
playerMarketPositionSchema.index({ pid: 1, marketId: 1 }, { unique: true });

export const MarketModel = mongoose.model('Market', marketSchema);
export const BetModel = mongoose.model('Bet', betSchema);
export const PlayerMarketPositionModel = mongoose.model('PlayerMarketPosition', playerMarketPositionSchema);

// Event handling classes
export class MarketEvent {
    index: bigint;
    data: bigint[];

    constructor(
        index: bigint, data: bigint[]
    ) {
        this.index = index;
        this.data = data;
    }

    static fromEvent(data: BigUint64Array): MarketEvent {
        return new MarketEvent(data[0],  Array.from(data.slice(1)));
    }

    toObject() {
        return {
            marketId: this.data[0],
            counter: this.index,
            yesLiquidity: this.data[1],
            noLiquidity: this.data[2],
        };
    }
}

export class BetEvent {
    index: bigint;
    data: bigint[];
    constructor(
        index: bigint, data: bigint[]
    ) {
        this.index = index;
        this.data = data;
    }

    static fromEvent(data: BigUint64Array): BetEvent {
        return new BetEvent(data[0],  Array.from(data.slice(1)));
    }

    toObject(): Bet {
        return {
            index: this.index,
            pid: [this.data[0], this.data[1]], // pid1, pid2
            marketId: this.data[2], // market_id
            betType: Number(this.data[3]), // betType
            amount: this.data[4],
            shares: this.data[5],
            counter: this.data[6],
        };
    }
}

// Global State Interface for tracking all markets
interface GlobalState {
    counter: bigint;
    marketIds: bigint[];
    nextMarketId: bigint;
    totalPlayers: bigint;
}

const globalStateSchema = new mongoose.Schema<GlobalState>({
    counter: { type: BigInt, required: true },
    marketIds: { type: [BigInt], required: true },
    nextMarketId: { type: BigInt, required: true },
    totalPlayers: { type: BigInt, required: true }
});

globalStateSchema.pre('init', ObjectEvent.uint64FetchPlugin);

export const GlobalStateModel = mongoose.model('GlobalState', globalStateSchema);

// Helper function to convert u64 array to string (for market titles)
export function u64ArrayToString(u64Array: bigint[]): string {
    let bytes: number[] = [];
    
    for (const value of u64Array) {
        for (let i = 0; i < 8; i++) {
            const byte = Number((value >> BigInt(i * 8)) & 0xFFn);
            if (byte !== 0) {
                bytes.push(byte);
            } else {
                break;
            }
        }
    }
    
    return new TextDecoder().decode(new Uint8Array(bytes));
}

// Helper function to convert string to u64 array (for market titles)
export function stringToU64Array(str: string): bigint[] {
    const bytes = new TextEncoder().encode(str);
    const result: bigint[] = [];
    
    for (let i = 0; i < bytes.length; i += 8) {
        let value = 0n;
        for (let j = 0; j < 8 && i + j < bytes.length; j++) {
            value |= BigInt(bytes[i + j]) << BigInt(j * 8);
        }
        result.push(value);
    }
    
    return result;
}


