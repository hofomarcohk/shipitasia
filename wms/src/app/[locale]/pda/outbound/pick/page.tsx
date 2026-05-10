"use client";

import { fetchGet, fetchPost, fetchUser } from "@/app/actions/getter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import { enter } from "@/components/helpers/utils";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";
import { cn } from "@/lib/utils";
import { Inbound } from "@/types/Inbound";
import { Outbound } from "@/types/Outbound";
import { PdaUser } from "@/types/Pda";
import {
  IconChevronLeft,
  IconShoppingCart,
  IconSquare,
  IconSquareCheck,
  IconTruckLoading,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

type LocationItem = {
  location: string;
  inboundRequestIds: string[];
};

interface OutboundWithAdmins extends Outbound {
  staffs: string[];
}

export default function Page(param: any) {
  const { pdaMsg } = usePdaMsg();
  const prop = {};

  const [langCode, setLangCode] = useState("en");
  const t = useTranslations();
  const steps = [
    {
      name: "select-task",
      title: t("pda.outbound.pick.steps.selectTask.title"),
      description: t("pda.outbound.pick.steps.selectTask.desc"),
    },
    {
      name: "search-location",
      title: t("pda.outbound.pick.steps.scanLocation.title"),
      description: t("pda.outbound.pick.steps.scanLocation.desc"),
    },
    {
      name: "search-item",
      title: t("pda.outbound.pick.steps.scanItem.title"),
      description: t("pda.outbound.pick.steps.scanItem.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);
  const [, setUser] = useState<PdaUser>();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [outboundTaskList, setOutboundTaskList] = useState<
    OutboundWithAdmins[]
  >([]);
  const [outboundTaskPage, setOutboundTaskPage] = useState(0);
  const [selectedTaskList, setSelectedTaskList] = useState<string[]>([]);
  const [isTaskLastPage, setIsTaskLastPage] = useState(false);

  const [locationList, setLocationList] = useState<LocationItem[]>([]);
  const [locationPage, setLocationPage] = useState(0);
  const [isLocationLastPage, setIsLocationLastPage] = useState(false);

  const [locationCode, setLocationCode] = useState("");
  const [locationItemPage, setLocationItemPage] = useState(0);
  const [isLocationListLastPage, setIsLocationListLastPage] = useState(false);

  const [searchItemCode, setSearchItemCode] = useState("");
  const [locationItemList, setLocationItemList] = useState<Inbound[]>([]);

  const [pickedItems, setPickedItems] = useState<string[]>([]);
  const [isPicked, setIsPicked] = useState(false);

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
  };

  const checkUserWarehouse = async () => {
    const res = await fetchUser(setUser);
    if (!res || !res.data.warehouseCode || res.data.warehouseCode === "") {
      pdaMsg("error", t("pda.common.noWarehouse"), callSelectWarehouse());
    }
  };

  // handle task
  const handleTaskList = async () => {
    const nextPage = outboundTaskPage + 1;
    setOutboundTaskPage(nextPage);
    setIsLoading(true);
    const json = await fetchGet("/api/wms/pda/outbound/pick/task", {
      pageNo: nextPage,
    });

    setOutboundTaskList([...outboundTaskList, ...json.data.results]);
    setSelectedTaskList([
      ...new Set([
        ...selectedTaskList,
        ...json.data.results
          .filter((item: any) => item.isPic)
          .map((item: any) => item.orderId),
      ]),
    ]);

    setIsLoading(false);
    if (json.status !== 200) {
      pdaMsg("error", t("pda.outbound.pick.fail"), {
        message: json.message,
      });
      return;
    }
    if (json.data.results.length === 0) {
      setIsTaskLastPage(true);
    }
  };

  const handleTaskSelect = async (orderId: string) => {
    if (!selectedTaskList.includes(orderId)) {
      const json = await fetchPost("/api/wms/pda/outbound/pick/task/select", {
        orderId,
      });

      if (json.status !== 200) {
        pdaMsg("error", t("pda.outbound.pick.selectTaskFailed"), {
          message: json.message,
        });
        return;
      }
      setSelectedTaskList([...selectedTaskList, orderId]);
    } else {
      const json = await fetchPost("/api/wms/pda/outbound/pick/task/deselect", {
        orderId,
      });

      if (json.status !== 200) {
        pdaMsg("error", t("pda.outbound.pick.deselectTaskFailed"), {
          message: json.message,
        });
        return;
      }
      setSelectedTaskList(selectedTaskList.filter((id) => id !== orderId));
    }
  };

  // handle location
  const handleLocationlist = async () => {
    const pageNo = locationPage + 1;
    setIsLoading(true);
    const json = await fetchGet("/api/wms/pda/outbound/pick/location", {
      pageNo,
    });
    setIsLoading(false);

    if (json.status !== 200) {
      pdaMsg("error", t("pda.outbound.pick.locationFailed"), {
        message: json.message,
      });
      return;
    }
    setLocationPage(pageNo);
    if (json.data.results.length === 0) {
      setIsLocationLastPage(true);
      return;
    }

    let uniqList: { [key: string]: LocationItem } = {};
    locationList.map((item) => {
      uniqList[item.location] = item;
    });
    json.data.results.map((item: any) => {
      uniqList[item.location] = item;
    });
    setLocationList(Object.values(uniqList));
    setStep("search-location");
  };

  // handle location item
  const handleLocationItemList = async () => {
    const pageNo = locationItemPage + 1;
    if (locationCode === "") {
      return;
    }

    setIsLoading(true);
    const json = await fetchGet("/api/wms/pda/outbound/pick/locationItem", {
      itemCode: searchItemCode,
      locationCode,
      pageNo,
    });
    setIsLoading(false);
    setLocationItemPage(pageNo);

    if (json.status !== 200) {
      pdaMsg("error", t("pda.outbound.pick.locationFailed"), {
        message: json.message,
      });
      return;
    }

    if (json.data.results.length === 0) {
      setIsLocationListLastPage(true);
      if (pageNo == 1) {
        pdaMsg("error", t("pda.outbound.pick.locationNotInclude"));
        return;
      }
    }
    setLocationItemList([...locationItemList, ...json.data.results]);
    setStep("search-item");
  };

  // handle pick
  const handlePick = async (orderId?: string) => {
    if (!orderId) {
      const pageNo = 1;
      setIsLoading(true);
      const json = await fetchGet("/api/wms/pda/outbound/pick/locationItem", {
        itemCode: searchItemCode,
        locationCode,
        pageNo,
      });
      setIsLoading(false);

      if (json.data.results.length === 0) {
        pdaMsg("error", t("pda.outbound.pick.itemNotFound"));
        return;
      }
      if (json.data.results.length > 1) {
        handleLocationItemList();
        return;
      }
      orderId = json.data.results[0].orderId;
    }
    if (!orderId) {
      return;
    }

    if (pickedItems.includes(orderId)) {
      pdaMsg("error", t("pda.outbound.pick.already_picked"));
      return;
    }

    const json = await fetchPost("/api/wms/pda/outbound/pick", {
      locationCode,
      orderId,
    });

    if (json.status !== 200) {
      pdaMsg("error", t("pda.outbound.pick.fail"), {
        message: json.message,
      });
      return;
    }

    setPickedItems([...pickedItems, orderId]);
    setIsPicked(true);
    setTimeout(() => {
      setIsPicked(false);
    }, 1000);

    const allItemCount =
      locationList?.reduce(
        (acc, cur) => acc + cur.inboundRequestIds.length,
        0,
      ) || 0;

    // pickedItems is not refreshed, so we add 1
    if (pickedItems.length + 1 >= allItemCount) {
      setSelectedTaskList([]);
      setPickedItems([]);
      pdaMsg("success", t("pda.outbound.pick.success"), {
        callback: () => {
          setStep("select-task");
        },
      });
    }
  };

  // handle load more
  useEffect(() => {
    if (isLoading) return;
    if (step == "select-task" && isTaskLastPage) return;
    if (step == "select-location" && isLocationLastPage) return;
    if (step == "search-item" && isLocationListLastPage) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting) {
          if (step == "select-task") {
            await handleTaskList();
          }
          if (step == "search-location") {
            await handleLocationlist();
          }
          if (step == "search-item") {
            await handleLocationItemList();
          }
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [outboundTaskList, locationList, locationItemList]);

  useEffect(() => {
    setLocationItemPage(0);
    setIsLocationListLastPage(false);
  }, [locationCode]);

  useEffect(() => {
    if (pickedItems.length > 0) {
      if (
        locationItemList.filter((item) => !pickedItems.includes(item.orderId))
          .length === 0
      ) {
        setStep("search-location");
      }
    }
  }, [pickedItems]);

  useEffect(() => {
    if (step === "select-task") {
      setOutboundTaskList([]);
      setOutboundTaskPage(0);
      setIsTaskLastPage(false);
      setLocationList([]);
      setLocationPage(0);
      setIsLocationLastPage(false);
    }
    if (step === "search-location") {
      setLocationCode("");
      (document.querySelector("#location-code") as HTMLInputElement)?.focus();
      setLocationItemList([]);
      setLocationItemPage(0);
      setIsLocationListLastPage(false);
      setSearchItemCode("");
    }
    if (step === "search-item") {
      setSearchItemCode("");
      (document.querySelector("#item-code") as HTMLInputElement)?.focus();
    }
  }, [step]);

  useEffect(() => {
    checkUserWarehouse();
  }, [langCode]);

  useEffect(() => {
    init();
    (document.querySelector("#location-code") as HTMLInputElement)?.focus();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconShoppingCart size={20} stroke={1} />}
        title={t("pdaMenu.pick")}
      />

      {/* prompt section  */}
      <div className="relative">
        <div className="absolute top-[20px] w-full text-center ">
          <div
            className={cn(
              "text-xs text-gray-800 bg-gray-100 px-2 py-1 rounded-full my-[10px] mx-auto w-fit transition-opacity duration-300",
              !isPicked && "opacity-0",
            )}
          >
            {t("pda.outbound.pick.picked")}
          </div>
        </div>
      </div>
      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      {/* upper section  */}
      <div className="pb-[150px] scrollbar">
        {step === "select-task" && (
          <div>
            <>
              {outboundTaskList.map((item, i) => {
                return (
                  <div
                    key={i}
                    className="p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4"
                    onClick={() => {
                      handleTaskSelect(item?.orderId);
                    }}
                  >
                    <div className="">
                      <div>{item?.orderId || "--"}</div>
                      <div className="text-[10px]">{item?.to?.address}</div>
                    </div>
                    <div className="flex">
                      {selectedTaskList.includes(item?.orderId) && (
                        <Badge>{item?.inboundRequestIds?.length || 0}</Badge>
                      )}
                      {!selectedTaskList.includes(item?.orderId) && (
                        <Badge
                          className={
                            item.staffs?.length > 0
                              ? "bg-gray-500"
                              : "text-black bg-white"
                          }
                        >
                          {item?.inboundRequestIds?.length || 0}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </>

            {!isLoading && (
              <>
                {isTaskLastPage && (
                  <div className="flex items-center justify-center py-4 px-2 text-gray-500">
                    {t("pda.common.no_more_data")}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {step === "search-location" && (
          <div>
            <>
              {locationList?.map((item, i) => {
                return (
                  <div
                    key={i}
                    className="p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4"
                  >
                    <div className="">
                      <div>{item?.location}</div>
                    </div>
                    <div className="flex">
                      <div className="text-md mx-1 text-gray-500 font-bold">
                        {
                          item?.inboundRequestIds?.filter((id) =>
                            pickedItems.includes(id),
                          ).length
                        }
                      </div>
                      /
                      <div className="text-xs mx-1 text-gray-500">
                        {item?.inboundRequestIds?.length}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          </div>
        )}
        {step === "search-item" && (
          <div className="relative">
            <div className="w-full p-2 flex justify-between items-center gap-2 text-sm">
              <div
                className="flex items-center cursor-pointer"
                onClick={() => setStep("search-location")}
              >
                <IconChevronLeft size={20} stroke={1} />
                {locationCode}
              </div>
            </div>
            <div>
              {locationItemList?.map((item, i) => {
                return (
                  <div
                    key={i}
                    className={cn(
                      "p-4 w-full border-b-4 border-gray-100",
                      "dark:border-bottom-gray-900 flex",
                      "justify-between items-center gap-4",
                    )}
                    onClick={() => {
                      if (searchItemCode.length > 0) {
                        handlePick(item?.orderId);
                      }
                    }}
                  >
                    <div className="">
                      <div>{item?.trackingNo || "--"}</div>
                      <div className="text-[10px]">{item?.orderId || "--"}</div>
                      <div className="text-[10px]">{item?.to?.address}</div>
                    </div>

                    <div className="">
                      {pickedItems.includes(item?.orderId) ? (
                        <IconSquareCheck />
                      ) : (
                        searchItemCode.length > 0 && <IconSquare />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isLoading && (
          <div className="pt-[50px] flex justify-center items-center ">
            <div className="p-2 bg-gray-200 rounded-full animate-bounce">
              <IconTruckLoading
                className="animate-pulse"
                size={26}
                color="#333"
                stroke={1.5}
              />
            </div>
          </div>
        )}
        {!isLoading && <div ref={loadMoreRef} className="h-10"></div>}
      </div>

      {/* bottom section  */}
      <div className="fixed left-0 bottom-0 pda-content w-full p-4 bg-white">
        {step === "select-task" && (
          <>
            <div className="w-full p-1">
              <Button
                className="w-full"
                onClick={() => {
                  setStep("search-location");
                }}
                disabled={selectedTaskList.length == 0}
              >
                {t("button.next")}
                {selectedTaskList.length > 0 && (
                  <Badge variant="secondary">{selectedTaskList.length}</Badge>
                )}
              </Button>
            </div>
          </>
        )}
        {step === "search-location" && (
          <>
            <div className="w-full p-1 mb-2">
              <Input
                className="w-full"
                placeholder={t("pda.common.search_location_code")}
                id="location-code"
                value={locationCode}
                onChange={(e) => setLocationCode(e.target.value)}
                onKeyDown={(e) => enter(e, handleLocationItemList)}
              />
            </div>
            <div className="w-full p-1">
              <Button className="w-full" onClick={handleLocationItemList}>
                {t("button.search")}
              </Button>
            </div>
          </>
        )}
        {step === "search-item" && (
          <div>
            <div className="w-full p-1 mb-2">
              <Input
                className="w-full"
                placeholder={t("pda.common.search_item_code")}
                id="item-code"
                value={searchItemCode}
                onChange={(e) => setSearchItemCode(e.target.value)}
                onKeyDown={(e) => enter(e, handlePick)}
              />
            </div>
            <div className="w-full p-1">
              <Button
                className="w-full"
                onClick={() => handlePick()}
                disabled={isPicked}
              >
                {t("button.confirm")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PdaPageLayout>
  );
}
