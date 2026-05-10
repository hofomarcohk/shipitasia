import { collections } from "@/cst/collections";
import { retryOutgoingApi } from "../api/handle_outgoing_api_log";
import { mongoAggregate } from "../utils/mongodb";

export async function apiRetryCronjob() {
  const apiDataList = await mongoAggregate(collections.OUTGOING_API_LOG, [
    {
      $match: {
        status: 0,
        retry: { $gt: 0 },
      }
    },
    {
      $project: {
        requestId: 1,
      }
    }
  ]);

  if(!apiDataList || apiDataList.length === 0) return;

  for(const apiData of apiDataList) {
    await retryOutgoingApi(apiData.requestId);
  }
 
}