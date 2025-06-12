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


interface MarketInfo {
    counter: bigint;
    yesLiquidity: bigint;
    noLiquidity: bigint;
}

// Market Schema
const marketSchema = new mongoose.Schema<MarketInfo>({
    counter: { type: BigInt, required: true, unique: true},
    yesLiquidity: { type: BigInt, required: true },
    noLiquidity: { type: BigInt, required: true },
});

marketSchema.pre('init', ObjectEvent.uint64FetchPlugin);


export interface Bet {
    index: bigint;
    pid: bigint[],
    betType: number,
    amount: bigint,
    shares: bigint,
    counter: bigint,
}

// Bet Schema
const betSchema = new mongoose.Schema<Bet>({
    index: { type: BigInt, required: true, unique: true},
    pid: { type: [BigInt], required: true },
    betType: { type: Number, required: true }, // 0 = NO, 1 = YES
    amount: { type: BigInt, required: true },
    shares: { type: BigInt, required: true },
    counter: { type: BigInt, required: true}
});

betSchema.pre('init', ObjectEvent.uint64FetchPlugin);

betSchema.index({ pid1: 1, pid2: 1 });
betSchema.index({ timestamp: -1 });

export const MarketModel = mongoose.model('Market', marketSchema);
export const BetModel = mongoose.model('Bet', betSchema);

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
            counter: this.index,
            yesLiquidity: this.data[0],
            noLiquidity: this.data[1],
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
            pid: [this.data[0], this.data[1]], // pid2
            betType: Number(this.data[2]), // betType
            amount: this.data[3],
            shares: this.data[4],
            counter: this.data[5],
        };
    }
}

/* Player related Schema
// Player Schema
export interface Player {
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
playerSchema.pre('init', ObjectEvent.uint64FetchPlugin);
export const PlayerModel = mongoose.model('Player', playerSchema);
playerSchema.index({ pid1: 1, pid2: 1 }, { unique: true });
*/


