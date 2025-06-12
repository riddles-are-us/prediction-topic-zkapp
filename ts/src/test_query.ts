import { Player } from "./api.js";
//import { LeHexBN, ZKWasmAppRpc} from "zkwasm-minirollup-rpc";
import { LeHexBN, query, ZKWasmAppRpc } from "zkwasm-ts-server";

let account = "1234";

const rpc: any = new ZKWasmAppRpc("http://127.0.0.1:3000");
let player = new Player(
  account,
  rpc,
);

// Function to pause execution for a given duration
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const pubkey = new LeHexBN(query(account).pkx).toU64Array();
  console.log(pubkey);

  console.log("Start query market ...");
  try {
    let data: any = await player.rpc.queryData(`market/5`);
    console.log(data);
  } catch (e) {
    console.log(e);
  }
  await delay(10000);

  console.log("Start query market ...");
  try {
    let data: any = await player.rpc.queryData(`market/10`);
    console.log(data);
  } catch (e) {
    console.log(e);
  }

  console.log("Start query market ...");
  try {
    let data: any = await player.rpc.queryData(`market/15`);
    console.log(data);
  } catch (e) {
    console.log(e);
  }
}



main();
