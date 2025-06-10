import { Express } from "express";
import { Event, EventModel, Service, TxStateManager, TxWitness } from "zkwasm-ts-server";
import { merkleRootToBeHexString } from "zkwasm-ts-server/src/lib.js";
import { Bet, BetModel, Market, MarketModel, Player, PlayerModel } from "./models.js";

const service = new Service(eventCallback, batchedCallback, extra);
await service.initialize();

let txStateManager = new TxStateManager(merkleRootToBeHexString(service.merkleRoot));

function extra(app: Express) {
    // All data is now accessed directly via RPC queries (rpc.queryState())
    // No HTTP API endpoints needed as data is fetched from blockchain state directly
}

service.serve();

const EVENT_PLAYER_UPDATE = 1;
const EVENT_MARKET_UPDATE = 2;
const EVENT_BET_UPDATE = 3;

async function bootstrap(merkleRoot: string): Promise<TxWitness[]> {
    return [];
}

async function batchedCallback(arg: TxWitness[], preMerkle: string, postMerkle: string) {
    await txStateManager.moveToCommit(postMerkle);
}

async function eventCallback(arg: TxWitness, data: BigUint64Array) {
    if (data.length == 0) {
        return;
    }

    console.log("eventCallback", arg, data);
    if (data[0] != 0n) {
        console.log("non-zero return, tx failed", data[0]);
        return;
    }
    if (data.length <= 2) {
        console.log("no event data");
        return;
    }

    let event = new Event(data[1], data);
    let doc = new EventModel({
        id: event.id.toString(),
        data: Buffer.from(event.data.buffer)
    });

    try {
        let result = await doc.save();
        if (!result) {
            console.log("failed to save event");
            throw new Error("save event to db failed");
        }
    } catch (e) {
        console.log(e);
        console.log("event ignored");
    }

    let i = 2; // start pos
    while (i < data.length) {
        let eventType = Number(data[i] >> 32n);
        let eventLength = data[i] & ((1n << 32n) - 1n);
        let eventData = data.slice(i + 1, i + 1 + Number(eventLength));
        console.log("event", eventType, eventLength, eventData);

        switch (eventType) {
            case EVENT_MARKET_UPDATE:
                {
                    console.log("market update event");
                    let market = Market.fromEvent(eventData);
                    await MarketModel.findOneAndUpdate({}, market.toObject(), { upsert: true });
                    console.log("saved market update", market);
                }
                break;
            case EVENT_BET_UPDATE:
                {
                    console.log("bet update event");
                    let bet = Bet.fromEvent(eventData);
                    let doc = new BetModel(bet.toObject());
                    await doc.save();
                    console.log("saved bet", bet);
                }
                break;
            case EVENT_PLAYER_UPDATE:
                {
                    console.log("player update event");
                    let player = Player.fromEvent(eventData);
                    await PlayerModel.findOneAndUpdate(
                        { pid1: player.pid1, pid2: player.pid2 },
                        player.toObject(),
                        { upsert: true }
                    );
                    console.log("saved player update", player);
                }
                break;
            default:
                console.log("unknown event");
                break;
        }
        i += 1 + Number(eventLength);
    }
} 