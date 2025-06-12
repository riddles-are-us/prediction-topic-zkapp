import { Player } from "./api.js";
//import { LeHexBN, ZKWasmAppRpc} from "zkwasm-minirollup-rpc";
import { LeHexBN, query, ZKWasmAppRpc } from "zkwasm-ts-server";

let account = "1234";
const player1Key = "456789789";
const player2Key = "987654321";

const rpc: any = new ZKWasmAppRpc("http://127.0.0.1:3000");
let player1 = new Player(
  player1Key,
  rpc,
);

let player2 = new Player(
  player2Key,
  rpc,
);


// Function to pause execution for a given duration
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const pubkey1 = new LeHexBN(query(player1Key).pkx).toU64Array();
  const pubkey2 = new LeHexBN(query(player2Key).pkx).toU64Array();
  console.log("Start query market ...");
  try {
    let data: any = await player1.rpc.queryData(`history/${pubkey1[1].toString()}/${pubkey1[2].toString()}`);
    console.log(data);
  } catch (e) {
    console.log(e);
  }

  console.log("Start query market ...");
  try {
    let data: any = await player2.rpc.queryData(`history/${pubkey2[1].toString()}/${pubkey2[2].toString()}`);
    console.log(data);
  } catch (e) {
    console.log(e);
  }
}



main();
